import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useVendors } from "@/hooks/useVendors";
import type { MaintenanceItem, MaintenanceService } from "@/types/maintenance";
import {
  createMaintenanceService,
  deleteMaintenanceService,
  patchMaintenanceService,
  type ServiceInput,
} from "@/services/maintenanceService";
import type { MaintenanceIssue } from "@/types/maintenance";
import { kindLabel, nextKind } from "@/lib/maintenance/serviceKind";
import { servicesCsv } from "@/lib/maintenance/serviceCsv";
import { quarterOf } from "@/lib/maintenance/paperwork";
import { LogServiceSheet, type ServicePrefill } from "./LogServiceSheet";
import type { MeterReading } from "@/lib/metrics/trailerMeter";
import type { BooksVsLog, BooksWord, ShopDays } from "@/lib/metrics/maintenanceMoney";
import { StatusPill } from "@/components/ui/StatusPill";
import { money, moneyCents } from "@/lib/format";
// Flagging two spellings of one shop is all this page does: the MERGE lives on
// the vendor page.
import { spellingKey } from "@/lib/maintenance/spellingKey";

interface Props {
  services: MaintenanceService[];
  items: MaintenanceItem[];
  readings: MeterReading[]; // the truck's dated odometer readings (the trailer's meter)
  books: BooksVsLog; // the P&L's repairs line beside the log, month by month
  shop: ShopDays; // the days the truck went to the shop this year, costed
  issues: MaintenanceIssue[]; // the OPEN issues, for the sheet's Closes chips
  today: string; // 'YYYY-MM-DD'
  onChange: () => void;
  openRequested?: boolean; // the statusbar's "Log service" — consumed on open
  onOpened?: () => void;
  // The Done door on a clock: the sheet opens with that clock ticked, the unit
  // set and the newest reading in the box. Consumed once the sheet closes.
  prefill?: ServicePrefill | null;
  onPrefillUsed?: () => void;
}

const num = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US"));

// The reading cell — each unit's own meter. An APU visit reads HOURS; a
// combined service stacks the truck odometer over the trailer's reading (the truck's odometer).
const reading = (s: MaintenanceService) => {
  if (s.unit === "both")
    return (
      <>
        {num(s.odometer)}
        {s.trailer_hub != null && (
          <span className="text-xs block">{num(s.trailer_hub)} trailer · truck odometer</span>
        )}
      </>
    );
  if (s.unit === "apu")
    return s.apu_hours == null ? "—" : `${num(s.apu_hours)} hrs`;
  return num(s.unit === "trailer" ? s.trailer_hub : s.odometer);
};

// The units a vendor has worked on, as the pills its row wears.
const UNIT_PILL: Record<string, string[]> = {
  tractor: ["Truck"],
  trailer: ["Trailer"],
  both: ["Truck", "Trailer"],
  apu: ["APU"],
};

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const shortDay = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

// 'YYYY-MM' for a month offset from the current UTC month.
const monthKey = (offset: number): string => {
  const d = new Date();
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
  return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`;
};

const fmtMonth = (ym: string) =>
  new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

const monthWord = (ym: string) =>
  new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

type RangeMode = "3m" | "6m" | "12m" | "ytd" | "all" | "custom";
const PRESETS: [RangeMode, string][] = [
  ["3m", "3 months"],
  ["6m", "6 months"],
  ["12m", "12 months"],
  ["ytd", "This year"],
  ["all", "All time"],
  ["custom", "Custom"],
];

// A vendor name, linked to its card when the rolodex has it filed. Module-level
// (the house rule: no component is ever defined inside a render body), so the
// name→id map it needs comes in as a prop.
const VendorCell = ({
  name,
  location,
  vendorIdByName,
}: {
  name: string | null;
  location?: string | null;
  vendorIdByName: Map<string, string>;
}) => {
  if (!name) return <span className="text-faint">—</span>;
  const id = vendorIdByName.get(name.trim().toLowerCase());
  return (
    <span className="min-w-0">
      {id ? (
        <Link to={`/vendors/${id}`} className="font-semibold text-amber-hi hover:text-hot">
          {name}
        </Link>
      ) : (
        <>
          <span className="text-dim">{name}</span>{" "}
          <Link to="/vendors" className="text-[11.5px] text-faint hover:text-amber-hi">
            · file it →
          </Link>
        </>
      )}
      {location && <span className="block text-xs text-faint">{location}</span>}
    </span>
  );
};

// The word a books-vs-log month wears, and its colour — one tone per meaning.
const WORD_CLASS: Record<BooksWord, string> = {
  exact: "text-status-positive-text",
  matches: "text-status-positive-text",
  "nothing logged": "text-status-negative-text",
  "something unlogged": "text-status-negative-text",
  "more logged than filed": "text-dim",
  "no P&L filed": "text-faint",
};

const signed = (n: number): string => (n < 0 ? `−${money(Math.abs(n))}` : `+${money(n)}`);

// THE BOOKS AGAINST THE LOG (the Maintenance sheet, call 5): the P&L's
// repairs & maintenance line beside what the log holds, month by month, the
// gap in words. A month with no P&L is said so — never "matches".
const BooksStrip = ({ books }: { books: BooksVsLog }) => {
  const both = books.filedMonths > 0 && books.logged > 0;
  const share = both && books.books > 0 ? Math.round((books.logged / books.books) * 100) : null;
  return (
    <div className="ds2-board overflow-hidden mt-4" data-testid="books-vs-log">
      <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule flex-wrap">
        <span className="font-condensed font-semibold text-[12.5px] tracking-[.16em] uppercase text-faint">
          Books vs log · {books.year}
        </span>
        <span className="font-condensed text-[13px] text-faint">
          · the P&amp;L's Repairs &amp; maintenance beside what you logged
        </span>
      </div>
      {books.filedMonths === 0 ? (
        <p className="font-condensed text-[13.5px] text-faint px-4 py-3">
          No P&amp;L filed for {books.year} yet — file a month on{" "}
          <Link to="/expenses" className="text-amber-hi hover:text-hot">
            Expenses
          </Link>{" "}
          and the books appear here beside the log.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] font-condensed text-[13.5px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-[.12em] text-faint">
                <th className="text-left font-semibold px-4 py-1.5">month</th>
                <th className="text-right font-semibold px-2 py-1.5">books</th>
                <th className="text-right font-semibold px-2 py-1.5">logged</th>
                <th className="text-right font-semibold px-2 py-1.5">gap</th>
                <th className="text-left font-semibold px-4 py-1.5">says</th>
              </tr>
            </thead>
            <tbody>
              {books.rows.map((r) => (
                <tr key={r.month} className="border-t ds2-cell-rule text-dim" data-month={r.month}>
                  <td className="px-4 py-[6px] text-ink">{monthWord(r.month)}</td>
                  <td className="px-2 py-[6px] text-right tabular-nums">{r.books == null ? "—" : money(r.books)}</td>
                  <td className="px-2 py-[6px] text-right tabular-nums">{r.logged == null ? "—" : money(r.logged)}</td>
                  <td className="px-2 py-[6px] text-right tabular-nums">{r.gap == null ? "—" : r.gap === 0 ? "$0" : signed(r.gap)}</td>
                  <td className={`px-4 py-[6px] ${WORD_CLASS[r.says]}`}>{r.says}</td>
                </tr>
              ))}
              <tr className="border-t border-hairline text-ink font-semibold">
                <td className="px-4 py-[7px]">
                  {monthWord(books.rows[0].month)}–{monthWord(books.rows[books.rows.length - 1].month)}
                </td>
                <td className="px-2 py-[7px] text-right tabular-nums">{money(books.books)}</td>
                <td className="px-2 py-[7px] text-right tabular-nums">{money(books.logged)}</td>
                <td className="px-2 py-[7px] text-right tabular-nums">
                  {both ? signed(books.logged - books.books) : "—"}
                </td>
                <td className="px-4 py-[7px] font-normal text-dim">
                  {share != null
                    ? share < 100
                      ? `the log is ${share}% of the books`
                      : share === 100
                        ? "the log and the books agree"
                        : `the log runs ${share - 100}% past the books`
                    : `${books.filedMonths} month${books.filedMonths === 1 ? "" : "s"} filed`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="font-condensed text-[12.5px] text-faint px-4 py-2 border-t ds2-cell-rule">
        the books are the P&amp;L you file on Expenses · a month with no P&amp;L says so, never "matches" · the
        truck's cost-to-run reads the books where a month is filed and the log where it is not
      </p>
    </div>
  );
};

export const ServicesTab = ({
  services,
  items,
  readings,
  books,
  shop,
  issues,
  today,
  onChange,
  openRequested = false,
  onOpened,
  prefill = null,
  onPrefillUsed,
}: Props) => {
  // The warranty cell being edited inline, by service id.
  const [warrantyFor, setWarrantyFor] = useState<string | null>(null);
  // The rolodex, for linking vendor names through the bridge (same name rule
  // the spend readout uses).
  const { vendors: rolodex } = useVendors(0);
  // Name AND alias: a row still carrying a spelling a merge filed (12A) links
  // to the card that owns it, the same way the spend readout counts it.
  const vendorIdByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of rolodex) {
      m.set(v.name.trim().toLowerCase(), v.vendor_id);
      for (const a of v.aliases ?? []) m.set(a.trim().toLowerCase(), v.vendor_id);
    }
    return m;
  }, [rolodex]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justLogged, setJustLogged] = useState(false);
  // Month range for pulling a window of services (e.g. to re-enter into
  // Landstar's app). Presets cover the common cases; "Custom" reveals dropdowns.
  const [mode, setMode] = useState<RangeMode>("3m");

  // A request the tab consumes: the statusbar sets it, the sheet opens, the
  // flag clears — so a remount (every refresh, every tab switch) finds
  // nothing to answer and never reopens a sheet after a save.
  useEffect(() => {
    if (openRequested) {
      setShowForm(true);
      onOpened?.();
    }
  }, [openRequested, onOpened]);
  // The Done door hands a prefill in; the sheet opens on it.
  useEffect(() => {
    if (prefill) setShowForm(true);
  }, [prefill]);
  const [customFrom, setCustomFrom] = useState(() => monthKey(-2));
  const [customTo, setCustomTo] = useState(() => monthKey(0));

  const { from, to } = useMemo(() => {
    if (mode === "custom") return { from: customFrom, to: customTo };
    if (mode === "all") return { from: "", to: "" };
    if (mode === "ytd")
      return { from: `${new Date().getUTCFullYear()}-01`, to: monthKey(0) };
    const back = mode === "3m" ? -2 : mode === "6m" ? -5 : -11;
    return { from: monthKey(back), to: monthKey(0) };
  }, [mode, customFrom, customTo]);

  // Months that actually have services (newest first) for the custom dropdowns.
  // Capped at ~36 months back so one stray/typo'd date can't balloon the list
  // into hundreds of options (that was the click lag).
  const monthOptions = useMemo(() => {
    const floor = monthKey(-35);
    const months = services.map((s) => s.service_date.slice(0, 7));
    const earliestSvc = months.length
      ? months.reduce((a, b) => (a < b ? a : b))
      : monthKey(-11);
    const earliest = earliestSvc < floor ? floor : earliestSvc;
    const [ey, em] = earliest.split("-").map(Number);
    const out: string[] = [];
    const d = new Date();
    let y = d.getUTCFullYear();
    let m = d.getUTCMonth() + 1;
    while (y > ey || (y === ey && m >= em)) {
      out.push(`${y}-${String(m).padStart(2, "0")}`);
      if (--m === 0) {
        m = 12;
        y--;
      }
    }
    return out;
  }, [services]);

  const nameById = new Map(items.map((i) => [i.item_id, i.name]));

  const filtered = services.filter((s) => {
    const m = s.service_date.slice(0, 7);
    return (!from || m >= from) && (!to || m <= to);
  });
  const rangeTotal = filtered.reduce((sum, s) => sum + (s.cost ?? 0), 0);

  // Vendor pricing (over the selected range): what each shop has cost you.
  // The math is untouched — each service is summed exactly once. What's new is
  // what each row WEARS: the unit(s) that shop works on, and a flag when the
  // same shop is filed under two spellings (which splits its real total).
  const byVendor = new Map<
    string,
    { count: number; total: number; priced: number; units: Set<string> }
  >();
  for (const s of filtered) {
    if (!s.vendor) continue;
    const v = byVendor.get(s.vendor) ?? {
      count: 0,
      total: 0,
      priced: 0,
      units: new Set<string>(),
    };
    v.count++;
    for (const u of UNIT_PILL[s.unit] ?? []) v.units.add(u);
    if (s.cost != null) {
      v.total += s.cost;
      v.priced++;
    }
    byVendor.set(s.vendor, v);
  }
  // Names that collapse to the same letters are one shop under two spellings.
  const spellings = new Map<string, number>();
  for (const name of byVendor.keys())
    spellings.set(spellingKey(name), (spellings.get(spellingKey(name)) ?? 0) + 1);
  const vendors = [...byVendor.entries()].sort((a, b) => b[1].total - a[1].total);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const closeSheet = () => {
    setShowForm(false);
    onPrefillUsed?.();
  };

  const save = (data: ServiceInput) =>
    run(async () => {
      await createMaintenanceService(data);
      closeSheet();
      setJustLogged(true);
      window.setTimeout(() => setJustLogged(false), 2600);
    });

  return (
    <div>
      {justLogged && (
        <div className="ds2-board flex items-center gap-3 px-4 py-3 mt-4">
          <span className="font-condensed font-semibold text-[16px] tracking-[.1em] uppercase text-status-positive-text">
            SERVICE LOGGED ✓
          </span>
          <span className="font-condensed text-[14px] text-dim">
            the clocks it covered just reset.
          </span>
        </div>
      )}

      {error && <p className="text-destructive text-sm mt-3">{error}</p>}

      {showForm && (
        <div className="mt-4">
          <LogServiceSheet
            key={prefill ? `${prefill.service_date}:${prefill.item_ids.join(",")}` : "blank"}
            items={items}
            vendors={rolodex}
            readings={readings}
            issues={issues}
            initial={prefill ?? undefined}
            onSave={save}
            onCancel={closeSheet}
            busy={busy}
          />
        </div>
      )}

      {/* range + summary */}
      <div className="flex items-center gap-3 flex-wrap mt-4">
        <span className="inline-flex h-[30px] p-[3px] rounded-[9px] bg-well gap-[2px]" style={{ boxShadow: "var(--shadow-inset)" }}>
          {PRESETS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`px-2.5 rounded-md font-condensed font-semibold text-[13px] ${
                mode === key ? "bg-amber text-canvas" : "text-dim hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </span>
        {mode === "custom" && (
          <span className="flex items-center gap-2 font-condensed text-[13.5px] text-faint">
            <select
              className="h-[30px] px-2 rounded-[8px] bg-well border border-hairline text-ink text-[14px] outline-none"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {fmtMonth(m)}
                </option>
              ))}
            </select>
            →
            <select
              className="h-[30px] px-2 rounded-[8px] bg-well border border-hairline text-ink text-[14px] outline-none"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {fmtMonth(m)}
                </option>
              ))}
            </select>
          </span>
        )}
        <span className="ml-auto font-condensed text-[14px] text-faint flex items-baseline gap-3 flex-wrap">
          <span>
            <b className="font-condensed font-semibold text-[20.5px] text-ink tabular-nums">
              {filtered.length}
            </b>{" "}
            service{filtered.length !== 1 ? "s" : ""} ·{" "}
            <b className="font-semibold text-ink tabular-nums">{moneyCents(rangeTotal)}</b>
          </span>
          {/* The quarter as a download and a printed page (the sheet's call 8). */}
          <button
            type="button"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([servicesCsv(filtered, nameById)], { type: "text/csv;charset=utf-8" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = `maintenance-${from || "all"}-${to || "all"}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="text-amber-hi hover:text-hot"
            disabled={filtered.length === 0}
          >
            Export CSV
          </button>
          <Link
            to={`/maintenance/report?from=${from || quarterOf(today).from}&to=${to || quarterOf(today).to}`}
            className="text-amber-hi hover:text-hot"
          >
            Print the Landstar report ›
          </Link>
        </span>
      </div>

      <BooksStrip books={books} />

      {/* by vendor — filed names link to their card */}
      {vendors.length > 0 && (
        <div className="ds2-board overflow-hidden mt-4">
          <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
            <span className="font-condensed font-semibold text-[12.5px] tracking-[.16em] uppercase text-faint">
              By vendor
            </span>
            <span className="font-condensed text-[13px] text-faint">
              · the range's shop money · the unit each shop works on · filed names link to their card
            </span>
          </div>
          {vendors.map(([vendor, v]) => {
            const twins = spellings.get(spellingKey(vendor)) ?? 1;
            return (
              <div
                key={vendor}
                className="flex items-center gap-3 px-4 py-[10px] border-t ds2-cell-rule first:border-t-0 font-condensed"
              >
                <span className="font-semibold text-[15.5px] flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                  <VendorCell name={vendor} vendorIdByName={vendorIdByName} />
                  {[...v.units].map((u) => (
                    <StatusPill key={u} tone="info">
                      {u}
                    </StatusPill>
                  ))}
                  {twins > 1 && (
                    <StatusPill tone="amber">{twins} spellings</StatusPill>
                  )}
                </span>
                <span className="text-[13.5px] text-faint w-[80px] text-right">
                  {v.count} visit{v.count === 1 ? "" : "s"}
                </span>
                <span className="font-semibold text-[15.5px] w-[100px] text-right tabular-nums">
                  {moneyCents(v.total)}
                </span>
              </div>
            );
          })}
          {/* SHOP DAYS, COSTED (the sheet's feature 7): a day at the shop is a
              day the truck earned nothing — the number that argues for doing
              two jobs in one stop. Read from the trips you already log. */}
          <p className="font-condensed text-[13px] text-dim px-4 py-2.5 border-t ds2-cell-rule" data-testid="shop-days">
            shop days this year:{" "}
            <b className="text-ink">{shop.days}</b>
            {shop.days > 0 && <span className="text-faint"> ({shop.dates.map(shortDay).join(" · ")})</span>}
            {shop.days > 0 && shop.cost != null ? (
              <>
                {" "}
                — at your target day that is ≈ <b className="text-ink">{money(shop.cost)}</b> of earning that did
                not happen
              </>
            ) : shop.days > 0 ? (
              <> — no target day yet to price them</>
            ) : (
              <> — none logged as trips</>
            )}
          </p>
        </div>
      )}

      {/* the log */}
      {filtered.length === 0 ? (
        <p className="font-condensed text-[14px] text-faint border border-dashed border-hairline rounded-[8px] px-3 py-[10px] mt-4">
          {services.length === 0
            ? "No services logged yet."
            : "No services in this month range."}
        </p>
      ) : (
        <div className="ds2-board overflow-hidden mt-4">
          <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
            <span className="font-condensed font-semibold text-[12.5px] tracking-[.16em] uppercase text-faint">
              The log
            </span>
            <span className="font-condensed text-[13px] text-faint">
              · chronological · a kind on every row, tap it to change · cost here tracks vendor pricing; the books are above
            </span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[920px]">
              {filtered.map((sv) => (
                <div
                  key={sv.service_id}
                  className="grid grid-cols-[92px_1fr_84px_170px_120px_90px_112px_30px] gap-3 items-baseline px-4 py-[11px] border-t ds2-cell-rule first:border-t-0 font-condensed text-[14.5px] text-dim"
                >
                  <span className="text-faint whitespace-nowrap">
                    {fmtDate(sv.service_date)}
                  </span>
                  <span className="min-w-0 text-ink">
                    {sv.description}
                    {sv.item_ids.length > 0 && (
                      <span className="flex flex-wrap gap-1 mt-1">
                        {sv.item_ids.map((iid) => (
                          <span
                            key={iid}
                            className="text-[11.5px] font-semibold text-faint bg-well border border-hairline-lo px-1.5 rounded-[4px]"
                          >
                            ✓ {nameById.get(iid) ?? "item"}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  {/* The KIND, one word, tap to cycle (the sheet's call 7). */}
                  <button
                    type="button"
                    title="tap to change the kind"
                    disabled={busy}
                    onClick={() => run(() => patchMaintenanceService(sv.service_id, { kind: nextKind(sv.kind) }))}
                    className={`inline-flex items-center h-[22px] px-2 rounded-[11px] border text-[11.5px] font-semibold uppercase tracking-[.06em] justify-self-start ${
                      sv.kind === "repair"
                        ? "border-status-negative-text/40 text-status-negative-text"
                        : sv.kind === "tire"
                          ? "border-amber/50 text-amber-hi"
                          : sv.kind === "pm"
                            ? "border-status-positive-text/40 text-status-positive-text"
                            : "border-hairline text-faint"
                    }`}
                    data-kind={sv.kind ?? ""}
                  >
                    {sv.kind ? kindLabel(sv.kind) : "kind?"}
                  </button>
                  <VendorCell
                    name={sv.vendor}
                    location={sv.location}
                    vendorIdByName={vendorIdByName}
                  />
                  <span className="text-right text-faint text-[13.5px] tabular-nums whitespace-nowrap">
                    {reading(sv)}
                    <span className="block text-[11px] uppercase tracking-[.08em]">
                      {sv.unit}
                    </span>
                  </span>
                  <span className="text-right font-semibold text-ink tabular-nums whitespace-nowrap">
                    {moneyCents(sv.cost)}
                  </span>
                  {/* The warranty on this visit — one date, blank until set. */}
                  <span className="text-right text-[12.5px] whitespace-nowrap">
                    {warrantyFor === sv.service_id ? (
                      <input
                        type="date"
                        aria-label="Warranty until"
                        className="ds-input !h-[26px] !py-0 !text-[12.5px]"
                        defaultValue={sv.warranty_until ?? ""}
                        autoFocus
                        onBlur={(e) => {
                          const v = e.target.value || null;
                          setWarrantyFor(null);
                          if (v !== (sv.warranty_until ?? null))
                            void run(() => patchMaintenanceService(sv.service_id, { warranty_until: v }));
                        }}
                      />
                    ) : sv.warranty_until ? (
                      <button
                        type="button"
                        onClick={() => setWarrantyFor(sv.service_id)}
                        className={sv.warranty_until >= today ? "text-status-positive-text" : "text-faint line-through"}
                        title="warranty until · tap to change"
                      >
                        to {fmtDate(sv.warranty_until)}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setWarrantyFor(sv.service_id)}
                        className="text-faint hover:text-amber-hi"
                        title="set the warranty on this visit"
                      >
                        — <span className="text-amber-hi">set ›</span>
                      </button>
                    )}
                  </span>
                  <button
                    aria-label="Delete"
                    onClick={() =>
                      !busy && run(() => deleteMaintenanceService(sv.service_id))
                    }
                    className="text-right text-faint hover:text-status-negative-text text-[14px]"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
