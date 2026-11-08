// The integrity checks (Nod Sheet "The Protection Stage", 2026-11-04/06): pure
// functions over the data the pages already fetch. Each finds an input dash is
// working around — a fallback standing in for a missing figure, or two sources
// that disagree — and says where to fix it. The facts come from the modules
// that already know them (basis, odometer, accrualTruth, settlements,
// cashflow); this file only reads them and phrases the finding.
//
// Locked by integrity.contract.test.ts (one seeded defect per check) and
// checks.test.ts (the formatting helpers and edge cases).
import type { Load } from "@/types/load";
import { moneyCents, money } from "@/lib/format";
import { BASIS_MONTHS } from "@/lib/constants/targets";
import { completeMonthsBefore } from "@/lib/metrics/rateTargets";
import { collectReadings } from "@/lib/metrics/odometer";
import { retrueAccrued } from "@/lib/metrics/accrualTruth";
import { archiveGaps } from "@/lib/metrics/cashflow";
import { settlementDelta } from "@/lib/metrics/settlements";
import { splitInForce } from "@/lib/metrics/splits";
import { isDelivered } from "@/lib/metrics/status";
import { weekLabel } from "@/lib/metrics/payWeeks";
import { dayWords, rateInForce, sortRates } from "@/lib/perDiem/rates";
import { sortIssues, type IntegrityInputs, type Issue, type IssueRecord } from "./issue";

// The IRS special transportation M&IE per diem — the FY2026 rate. Dated rates
// are a later build; until then a schedule below this is flagged.
export const IRS_PER_DIEM_RATE = 80;

// Tolerance for two sources of the same dollar figure (a cent).
const CENT = 0.01;

// The planning inputs the cash board reads, each with the words that name it
// and the line of the board that refuses without it.
export const PLANNING_INPUTS = [
  { field: "weekly_revenue", label: "Weekly revenue", line: "revenue" },
  { field: "weekly_payroll", label: "Weekly payroll", line: "payroll" },
  { field: "weekly_fuel_advance", label: "Weekly fuel advance", line: "fuel advance" },
  { field: "weekly_settlement_deductions", label: "Weekly settlement deductions", line: "settlement deductions" },
  { field: "monthly_depreciation", label: "Monthly depreciation", line: "depreciation" },
  { field: "fed_tax_rate", label: "Federal tax rate", line: "federal tax" },
  { field: "state_tax_rate", label: "State tax rate", line: "state tax" },
  { field: "financing_floor", label: "Financing floor", line: "financing" },
  { field: "tax_catchup_owed", label: "Tax catch-up owed", line: "tax catch-up" },
] as const;

// ---------------------------------------------------------------- helpers

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (v: string | null | undefined): string => String(v ?? "").slice(0, 10);
const round2 = (n: number): number => Math.round(n * 100) / 100;

// A typed figure or null — blank and non-numeric are missing; a typed 0 is a number.
export const typed = (v: number | string | null | undefined): number | null => {
  if (v == null || (typeof v === "string" && v.trim() === "")) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// "2026-10-01" → "Oct ’26" (the way basis.windowLabel spells a month).
export const monthLabel = (key: string): string => {
  const k = day(key);
  return `${MONTH_ABBR[Number(k.slice(5, 7)) - 1]} ’${k.slice(2, 4)}`;
};

// "2026-10-23" → "Oct 23".
export const dayLabel = (key: string): string => {
  const k = day(key);
  return `${MONTH_ABBR[Number(k.slice(5, 7)) - 1]} ${Number(k.slice(8, 10))}`;
};

// "May 6", "May 6 and May 20", "May 6, May 13 and May 20".
export const listWords = (items: string[]): string =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

// A per-diem style figure: whole dollars unless it carries cents.
const dollars = (n: number): string => (Number.isInteger(n) ? money(n) : moneyCents(n));
const miles = (n: number): string => `${Math.round(n).toLocaleString("en-US")} mi`;
const signed = (n: number): string => `${n < 0 ? "−" : "+"}${moneyCents(Math.abs(n))}`;
const pos = (v: number | string | null | undefined): number | null => {
  const n = typed(v);
  return n != null && n > 0 ? n : null;
};

const loadRecord = (l: Load): IssueRecord => ({ kind: "load", key: l.load_number, href: `/loads/${l.load_id}` });
const loadFix = (l: Load) => ({ fixAt: `Loads → ${l.load_number}`, fixTo: `/loads/${l.load_id}` });

// ---------------------------------------------------------------- the checks

export const runIntegrityChecks = (inputs: IntegrityInputs): Issue[] => {
  const issues: Issue[] = [];
  const carrier = inputs.schedule?.carrier_name || "Landstar";
  const delivered = inputs.loads.filter(isDelivered);
  const loadByNumber = new Map(inputs.loads.map((l) => [String(l.load_number).trim(), l]));
  const linesByLoad = new Map<string, IntegrityInputs["settlementLines"]>();
  for (const line of inputs.settlementLines) {
    const n = line.load_number == null ? "" : String(line.load_number).trim();
    if (!n) continue;
    linesByLoad.set(n, [...(linesByLoad.get(n) ?? []), line]);
  }

  // ---- INT-PNL-UNFILED: a complete month in the basis window with no P&L ----
  const now = new Date(`${inputs.today}T00:00:00Z`);
  const wanted = inputs.basis?.monthsWanted ?? BASIS_MONTHS;
  const periodByMonth = new Map(inputs.periods.map((p) => [day(p.period_month).slice(0, 7), p]));
  // No P&L filed at all means the book isn't set up yet — nothing to be "unfiled" against.
  const unfiled = (inputs.periods.length === 0 ? [] : completeMonthsBefore(now, wanted))
    .map(({ year, month }) => `${year}-${String(month + 1).padStart(2, "0")}`)
    .filter((m) => {
      const p = periodByMonth.get(m);
      return !p || p.cogs_total == null || p.expense_total == null;
    });
  for (const m of unfiled) {
    const first = `${m}-01`;
    issues.push({
      id: "INT-PNL-UNFILED",
      key: `INT-PNL-UNFILED:${first}`,
      severity: "money",
      title: `No P&L for ${monthLabel(first)} — break-even stands on ${wanted - unfiled.length} of ${wanted} months.`,
      detail: `${monthLabel(first)} has no P&L, or one saved without both totals, so its cost and its miles are left out of the basis${
        inputs.basis?.windowLabel ? ` (${inputs.basis.windowLabel} is what it stands on)` : ""
      }.`,
      fixAt: "Expenses → upload",
      fixTo: "/expenses",
      since: first,
      records: [{ kind: "period", key: m, href: "/expenses" }],
    });
  }

  // ---- INT-PNL-VS-CASH: the P&L upload against the pasted QuickBooks month ----
  const financialByMonth = new Map(inputs.financials.map((f) => [day(f.month).slice(0, 7), f]));
  for (const p of inputs.periods) {
    if (p.cogs_total == null || p.expense_total == null) continue; // an unfiled month is its own finding
    const m = day(p.period_month).slice(0, 7);
    const f = financialByMonth.get(m);
    if (!f) continue;
    // QuickBooks' total_opex already carries everything the P&L's expense section
    // does (interest included): on prod every agreeing month has cogs + expenses
    // equal to total_cogs + total_opex to the cent, and adding interest_expense
    // breaks the match (checked live 2026-11-07). So the paste is cogs + opex.
    const cogs = typed(f.total_cogs);
    const opex = typed(f.total_opex);
    if (cogs == null || opex == null) continue; // a paste with a blank cell cannot be compared
    const upload = round2(p.cogs_total + p.expense_total);
    const pasted = round2(cogs + opex);
    const apart = round2(upload - pasted);
    if (Math.abs(apart) <= CENT) continue;
    const first = `${m}-01`;
    issues.push({
      id: "INT-PNL-VS-CASH",
      key: `INT-PNL-VS-CASH:${first}`,
      severity: "money",
      title: `${monthLabel(first)}: your P&L upload and your pasted month disagree — opex ${moneyCents(Math.abs(apart))} apart. One of them is wrong.`,
      detail: `P&L upload: ${moneyCents(upload)} (cost of revenue + expenses). Pasted QuickBooks month: ${moneyCents(pasted)} (cogs + opex).`,
      fixAt: "Expenses → re-upload",
      fixTo: "/expenses",
      since: first,
      records: [
        { kind: "period", key: m, href: "/expenses" },
        { kind: "month", key: m, href: "/cashflow" },
      ],
    });
  }

  // ---- INT-CASH-CONTINUITY: each pasted month opens where the last closed ----
  for (const g of archiveGaps(inputs.financials)) {
    issues.push({
      id: "INT-CASH-CONTINUITY",
      key: `INT-CASH-CONTINUITY:${g.month}`,
      severity: "money",
      title: `${monthLabel(g.month)} opens at ${moneyCents(g.beginning)} but ${g.prevMonth.slice(0, 4) === g.month.slice(0, 4) ? MONTH_ABBR[Number(g.prevMonth.slice(5, 7)) - 1] : monthLabel(g.prevMonth)} closed at ${moneyCents(g.prevEnding)} (${signed(g.diff)}). Re-paste one of them.`,
      detail: `The archive's chain breaks by ${moneyCents(Math.abs(g.diff))} between ${monthLabel(g.prevMonth)} and ${monthLabel(g.month)}; the forecast starts from the last month's ending cash.`,
      fixAt: "Cash Flow → PASTE MONTHS",
      fixTo: "/cashflow",
      since: g.month,
      records: [
        { kind: "month", key: g.prevMonth.slice(0, 7), href: "/cashflow" },
        { kind: "month", key: g.month.slice(0, 7), href: "/cashflow" },
      ],
    });
  }

  // ---- INT-LOAD-UNRECORDED: a statement line for a load dash doesn't know ----
  const firstLoad = inputs.loads.map((l) => day(l.pickup_date)).filter((d) => d).sort()[0] ?? null;
  const unknown = new Map<string, IntegrityInputs["settlementLines"]>();
  for (const [n, lines] of linesByLoad) {
    if (loadByNumber.has(n) || firstLoad == null) continue;
    const dated = lines.filter((l) => day(l.period_ending) >= firstLoad && typed(l.revenue) != null);
    if (dated.length > 0) unknown.set(n, dated);
  }
  for (const [n, lines] of unknown) {
    const statements = [...new Set(lines.map((l) => day(l.period_ending)))].sort();
    const linehaul = lines.reduce((s, l) => s + (typed(l.revenue) ?? NaN), 0);
    issues.push({
      id: "INT-LOAD-UNRECORDED",
      key: `INT-LOAD-UNRECORDED:${n}`,
      severity: "data",
      title: `${carrier} paid load ${n} (${listWords(statements.map(dayLabel))} statement${statements.length === 1 ? "" : "s"}, linehaul ${moneyCents(linehaul)}) — it isn't in dash.`,
      detail: `${moneyCents(linehaul)} settled on ${statements.length} statement${statements.length === 1 ? "" : "s"} for a load number dash has no record of; the revenue, the pace and the miles never saw it.`,
      fixAt: "Loads → enter it",
      fixTo: "/loads",
      since: statements[0],
      records: statements.map((s) => ({ kind: "settlement" as const, key: s, href: "/loads" })),
    });
  }

  // ---- INT-LOAD-VOIDED: delivered in dash, VOIDED LOAD on the statement ----
  const voided = new Set<string>();
  for (const l of delivered) {
    const lines = linesByLoad.get(String(l.load_number).trim()) ?? [];
    const hit = lines.find((x) => /VOIDED LOAD/i.test(x.description));
    if (!hit) continue;
    voided.add(l.load_number);
    issues.push({
      id: "INT-LOAD-VOIDED",
      key: `INT-LOAD-VOIDED:${l.load_number}`,
      severity: "data",
      title: `Load ${l.load_number} is delivered in dash (${money(Number(l.gross_revenue))}) but ${carrier}'s statement says VOIDED LOAD.`,
      detail: `The ${dayLabel(hit.period_ending)} statement voids it; dash counted ${money(Number(l.gross_revenue))} gross in the deposit and the pace.`,
      ...loadFix(l),
      since: day(l.delivery_date) || null,
      records: [loadRecord(l), { kind: "settlement", key: day(hit.period_ending), href: "/loads" }],
    });
  }

  // ---- INT-NET-MISMATCH: settled revenue against dash's expected net ----
  for (const l of delivered) {
    if (voided.has(l.load_number)) continue;
    const lines = linesByLoad.get(String(l.load_number).trim());
    // The statement pays the earned net PLUS the pass-through reimbursements
    // (tolls, NET-02) — the verification expects both.
    const earned = typed(l.net_revenue);
    const expected = earned == null ? null : earned + (typed(l.reimbursements) ?? 0);
    if (!lines || lines.length === 0 || expected == null) continue;
    const settled = lines.reduce((s, x) => s + (typed(x.revenue) ?? 0), 0);
    const delta = settlementDelta(settled, expected);
    if (delta == null) continue;
    const statements = [...new Set(lines.map((x) => day(x.period_ending)))].sort();
    issues.push({
      id: "INT-NET-MISMATCH",
      key: `INT-NET-MISMATCH:${l.load_number}`,
      severity: "money",
      title:
        delta > 0
          ? `Load ${l.load_number} settled ${moneyCents(delta)} over dash's net — an escort or permit isn't entered as an accessorial.`
          : `Load ${l.load_number} settled ${moneyCents(-delta)} under dash's net — a line was reversed or short-paid.`,
      detail: `${carrier} settled ${moneyCents(settled)} against dash's expected net ${moneyCents(expected)} (${listWords(statements.map(dayLabel))} statement${statements.length === 1 ? "" : "s"}).`,
      ...loadFix(l),
      since: day(l.delivery_date) || null,
      records: [loadRecord(l)],
    });
  }

  // ---- INT-ODO-OVERLAP: two loads whose odometer windows overlap ----
  const windows = inputs.loads
    .filter((l) => l.load_status !== "cancelled")
    .map((l) => ({ l, s: pos(l.odometer_start), e: pos(l.odometer_end) }))
    .filter((w): w is { l: Load; s: number; e: number } => w.s != null && w.e != null && w.e > w.s)
    .sort((a, b) => a.s - b.s || a.e - b.e);
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length && windows[j].s < windows[i].e; j++) {
      const a = windows[i].l;
      const b = windows[j].l;
      issues.push({
        id: "INT-ODO-OVERLAP",
        key: `INT-ODO-OVERLAP:${a.load_number}:${b.load_number}`,
        severity: "data",
        title: `Loads ${a.load_number} and ${b.load_number} overlap on the odometer — one reading is off.`,
        detail: `${a.load_number} reads ${windows[i].s.toLocaleString("en-US")}–${windows[i].e.toLocaleString("en-US")}; ${b.load_number} reads ${windows[j].s.toLocaleString("en-US")}–${windows[j].e.toLocaleString("en-US")}. Windows that overlap count the shared miles twice in no one's favor.`,
        ...loadFix(a),
        since: [day(a.delivery_date), day(b.delivery_date)].filter((d) => d).sort().pop() ?? null,
        records: [loadRecord(a), loadRecord(b)],
      });
    }
  }

  // ---- INT-ACC-UNRATED: an accessorial type in use with no pay-rate row ----
  const rated = new Set(inputs.payRates.map((r) => r.accessorial_type.trim().toLowerCase()));
  const unrated = new Map<string, { n: number; amount: number; since: string | null }>();
  for (const a of inputs.accessorials) {
    const type = a.accessorial_type.trim();
    if (!type || rated.has(type.toLowerCase())) continue;
    const cur = unrated.get(type) ?? { n: 0, amount: 0, since: null };
    const d = day(a.created_at) || null;
    unrated.set(type, { n: cur.n + 1, amount: cur.amount + (typed(a.amount) ?? 0), since: cur.since == null || (d != null && d < cur.since) ? d : cur.since });
  }
  const fallbackPct = typed(splitInForce(inputs.splits ?? [], inputs.today)?.accessorial_pct);
  for (const [type, u] of unrated) {
    issues.push({
      id: "INT-ACC-UNRATED",
      key: `INT-ACC-UNRATED:${type}`,
      severity: "money",
      title: `${type} has no pay rate — paid at the ${fallbackPct == null ? "fallback" : `${Math.round(fallbackPct * 100)}% fallback`}.`,
      detail: `${u.n} charge${u.n === 1 ? "" : "s"} totaling ${money(u.amount)} ride on the fallback instead of ${type}'s own rate.`,
      fixAt: "Settings → pay rates",
      fixTo: "/settings",
      since: u.since,
      records: [{ kind: "accessorial", key: type, href: "/settings" }],
    });
  }

  // ---- INT-SNAPSHOT-MILES: a snapshot's accrued miles against the odometer chain ----
  const retrue = retrueAccrued(
    inputs.snapshots.map((s) => ({ as_of: s.as_of, miles: s.miles, pay_week_start: s.pay_week_start })),
    collectReadings(inputs.fuel, inputs.loads, inputs.trips, inputs.services),
    inputs.loads,
    inputs.today,
  );
  if (retrue) {
    const bySnapshot = new Map<string, typeof retrue.weeks>();
    for (const w of retrue.weeks) {
      if (w.movedOn == null) continue;
      bySnapshot.set(w.movedOn, [...(bySnapshot.get(w.movedOn) ?? []), w]);
    }
    const perMile = typed(inputs.plan?.maintenance_per_mile);
    for (const [asOf, weeks] of bySnapshot) {
      const stored = weeks.reduce((s, w) => s + w.stored, 0);
      const chain = weeks.reduce((s, w) => s + w.chain, 0);
      const diff = Math.round(chain - stored);
      if (Math.abs(diff) < 1) continue;
      const first = weeks[0].week;
      const last = weeks[weeks.length - 1].week;
      const owed = perMile == null ? null : Math.abs(diff) * perMile;
      const span = weeks.length === 1 ? `the ${dayLabel(first.start)} week` : `the ${weekLabel({ start: first.start, end: last.end })} weeks`;
      issues.push({
        id: "INT-SNAPSHOT-MILES",
        key: `INT-SNAPSHOT-MILES:${asOf}`,
        severity: "money",
        title: `${dayLabel(asOf)} snapshot accrued ${span} at ${miles(stored)}; the odometer says ${miles(chain)}${
          owed == null ? "" : ` (${moneyCents(owed)}${diff < 0 ? " too much" : ""})`
        }.`,
        detail: `The snapshot moved ${miles(stored)} to Maintenance; the chain reads ${miles(chain)} for the same week${weeks.length === 1 ? "" : "s"} — ${miles(Math.abs(diff))} ${
          diff > 0 ? "never accrued" : "over-accrued"
        }${weeks.some((w) => w.source === "loads") ? " (a week with no earlier reading is read from the loads)" : ""}.`,
        fixAt: "Plan → the snapshot",
        fixTo: "/status",
        since: asOf,
        records: [{ kind: "snapshot", key: asOf, href: "/status" }],
      });
    }
  }

  // ---- INT-ATTRIBUTION and INT-LOAD-READINGS: a delivered load's own fields ----
  for (const l of delivered) {
    if (l.booked_by == null || String(l.booked_by).trim() === "") {
      issues.push({
        id: "INT-ATTRIBUTION",
        key: `INT-ATTRIBUTION:${l.load_number}`,
        severity: "data",
        title: `Load ${l.load_number} has no dispatcher (booked_by).`,
        detail: `Delivered ${dayLabel(l.delivery_date ?? "")}, ${money(Number(l.gross_revenue))} gross — no dispatcher's streak, rank or recap counts it.`,
        ...loadFix(l),
        since: day(l.delivery_date) || null,
        records: [loadRecord(l)],
      });
    }
    const missing = [
      day(l.delivery_date) ? null : "delivery date",
      pos(l.odometer_start) == null ? "start odometer" : null,
      pos(l.odometer_end) == null ? "end odometer" : null,
    ].filter((x): x is string => x != null);
    if (missing.length > 0) {
      issues.push({
        id: "INT-LOAD-READINGS",
        key: `INT-LOAD-READINGS:${l.load_number}`,
        severity: "data",
        title: `Load ${l.load_number} is delivered without its ${listWords(missing)} — empty miles, the accrual and break-even skip it.`,
        detail: `Missing: ${missing.join(", ")}. The odometer chain loses a reading and the month's driven miles read short.`,
        ...loadFix(l),
        since: day(l.delivery_date) || day(l.pickup_date) || null,
        records: [loadRecord(l)],
      });
    }
  }

  // ---- INT-SETTING: no per-diem rate covers today, or the one in force is below the IRS rate ----
  // A failed fetch hands null, not []: unknown is skipped — never read as "no rate on file".
  if (inputs.perDiemRates != null) {
    const inForce = rateInForce(inputs.perDiemRates, inputs.today);
    if (inForce == null) {
      const oldest = sortRates(inputs.perDiemRates)[0];
      issues.push({
        id: "INT-SETTING",
        key: "INT-SETTING:per_diem_rate",
        severity: "money",
        title: "No per-diem rate covers today — every day out is unpriced until one does.",
        detail: oldest
          ? `The oldest rate on file starts ${dayWords(oldest.effective_from)}; add a row with a start on or before today.`
          : "No rates are on file.",
        fixAt: "Settings → per diem rates",
        fixTo: "/settings",
        since: null,
        records: [{ kind: "setting", key: "per_diem_rate", href: "/settings" }],
      });
    } else if (inForce.rate < IRS_PER_DIEM_RATE) {
      const perDiem = inForce.rate;
      issues.push({
        id: "INT-SETTING",
        key: "INT-SETTING:per_diem_rate",
        severity: "money",
        title: `Per diem is ${dollars(perDiem)}/day; the IRS transportation rate is ${dollars(IRS_PER_DIEM_RATE)}.`,
        detail: `The rate in force today started ${dayWords(inForce.effective_from)}. Every day out is deducted at ${dollars(perDiem)} instead of ${dollars(IRS_PER_DIEM_RATE)} — ${dollars(IRS_PER_DIEM_RATE - perDiem)} a day short before the deductible share.`,
        fixAt: "Settings → per diem rates",
        fixTo: "/settings",
        since: null,
        records: [{ kind: "setting", key: "per_diem_rate", href: "/settings" }],
      });
    }
  }

  // ---- INT-NOTE-UNDATED: a tracked balance with no as-of date ----
  for (const o of inputs.obligations) {
    if (o.current_balance == null || day(o.balance_as_of)) continue;
    issues.push({
      id: "INT-NOTE-UNDATED",
      key: `INT-NOTE-UNDATED:${o.obligation_id}`,
      severity: "money",
      title: `${o.label} · a balance with no as-of date — the payoff shows the statement until you retype the balance.`,
      detail: `${moneyCents(Number(o.current_balance))} is on file with no day it was read, so the drafts since cannot be taken off it.`,
      fixAt: "Expenses → the notes",
      fixTo: "/expenses",
      since: null,
      records: [{ kind: "obligation", key: o.obligation_id, href: "/expenses" }],
    });
  }

  // ---- INT-INPUT-BLANK: a planning input the cash board needs ----
  if (inputs.assumptions == null) {
    issues.push({
      id: "INT-INPUT-BLANK",
      key: "INT-INPUT-BLANK:assumptions",
      severity: "money",
      title: "No planning assumptions yet — the cash board can't project a period.",
      detail: `None of the ${PLANNING_INPUTS.length} planning inputs is saved.`,
      fixAt: "Cash Flow → ASSUMPTIONS",
      fixTo: "/cashflow",
      since: null,
      records: [{ kind: "setting", key: "assumptions", href: "/cashflow" }],
    });
  } else {
    for (const p of PLANNING_INPUTS) {
      if (typed(inputs.assumptions[p.field]) != null) continue;
      issues.push({
        id: "INT-INPUT-BLANK",
        key: `INT-INPUT-BLANK:${p.field}`,
        severity: "money",
        title: `${p.label} isn't set — the cash board refuses its ${p.line} line until it is.`,
        detail: `${p.field} is blank in the planning assumptions.`,
        fixAt: "Cash Flow → ASSUMPTIONS",
        fixTo: "/cashflow",
        since: null,
        records: [{ kind: "setting", key: p.field, href: "/cashflow" }],
      });
    }
  }

  return sortIssues(issues);
};
