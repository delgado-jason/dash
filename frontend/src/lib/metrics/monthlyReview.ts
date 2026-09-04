// THE MONTHLY REVIEW (Jason, 2026-09-04; v2 mockup approved): review MONTHLY,
// judge on the TRAILING 90 DAYS — at ~8 loads/month a single month is noise
// and the quarter is evidence. Same ~90-day doctrine as break-even, fuel
// windows, and the QBO margin. Move chips are ADVICE with their reasoning
// attached, gated on printed evidence rules — under the bar the verdict is
// THIN, never a fake grade.
import type { Load } from "@/types/load";
import { loadRevenue, getRateLadder, type RateLadder } from "./rateTargets";
import { rpmGrade, type Grade } from "./playerCard";
import { MIN_SCORE_LOADS, type GoToTier } from "./agentScorecard";
import { prospectState, type ContactLike, type AgentLike } from "./relationships";
import type { RateTiers } from "@/lib/constants/targets";

const DAY = 86_400_000;
const keyOf = (d: Date) => d.toISOString().slice(0, 10);

// The window: 90 days ending on the LAST DAY of the chosen month (clamped to
// `now` for the current month — no judging days that haven't happened).
export interface ReviewWindow {
  startKey: string;
  endKey: string;
  label: string; // "QUARTER ENDING AUG 31 ’26"
}

export const reviewWindow = (monthKey: string, now: Date): ReviewWindow => {
  const [y, m] = monthKey.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)); // last day of the month
  const end = monthEnd.getTime() > now.getTime() ? now : monthEnd;
  const endKey = keyOf(end);
  const startKey = keyOf(new Date(end.getTime() - 89 * DAY));
  const label = `QUARTER ENDING ${end
    .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .toUpperCase()} ’${String(end.getUTCFullYear()).slice(2)}`;
  return { startKey, endKey, label };
};

// Default review month: the LAST COMPLETE month.
export const defaultReviewMonth = (now: Date): string => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return keyOf(d).slice(0, 7);
};

export type Move = "up" | "down" | "hold" | "thin";

export interface ReviewRow {
  agent: AgentLike;
  tier: number;
  loads90: number;
  netRevenue: number;
  netRpm: number | null; // Σnet ÷ Σloaded miles; null under the 2-load minimum
  rateGrade: Grade | null;
  inbound: number | null; // attributed loads only; null when none attributed
  lastLoadDays: number | null; // days since last delivered load EVER (not window)
  touchesOut: number;
  touchesIn: number;
  move: Move;
  why: string;
}

// The printed evidence rules:
//   ▲ needs 3+ loads in the window AND the data-tier above the seat —
//     EXCEPTION: a cold-pool conversion promotes on its FIRST load in the
//     window (converting IS the evidence).
//   ▼ on a Tier 1 needs the (near-)full quarter quiet — ≤1 load AND 60+ days
//     since the last one — with the touch counts cited so the verdict is on
//     them, not on a dropped cadence.
//   Under 3 loads otherwise → THIN — NO VERDICT.
export const buildReview = (
  agents: AgentLike[],
  loads: Load[],
  contacts: ContactLike[],
  dataTiers: Map<string, GoToTier>,
  breakEvenRpm: number | null,
  tiers: RateTiers,
  win: ReviewWindow,
  now: Date,
): ReviewRow[] => {
  const ladder: RateLadder | null =
    breakEvenRpm != null ? getRateLadder(breakEvenRpm, tiers) : null;

  const rows: ReviewRow[] = [];
  for (const a of agents) {
    const mine = loads.filter((l) => l.agent_id === a.agent_id);
    const delivered = mine.filter(
      (l) =>
        l.load_status === "delivered" &&
        l.delivery_date &&
        l.delivery_date.slice(0, 10) >= win.startKey &&
        l.delivery_date.slice(0, 10) <= win.endKey,
    );
    const myContacts = contacts.filter(
      (c) =>
        c.agent_id === a.agent_id &&
        c.contacted_at.slice(0, 10) >= win.startKey &&
        c.contacted_at.slice(0, 10) <= win.endKey,
    );
    const touchesOut = myContacts.filter((c) => c.direction === "outbound").length;
    const touchesIn = myContacts.filter((c) => c.direction === "inbound").length;

    const lastDelivery = mine
      .filter((l) => l.load_status === "delivered" && l.delivery_date)
      .map((l) => l.delivery_date!.slice(0, 10))
      .sort()
      .at(-1);
    const lastLoadDays =
      lastDelivery == null
        ? null
        : Math.max(0, Math.floor((now.getTime() - Date.parse(`${lastDelivery}T00:00:00Z`)) / DAY));

    const loads90 = delivered.length;
    const netRevenue = delivered.reduce((s, l) => s + loadRevenue(l), 0);
    const loadedMiles = delivered.reduce((s, l) => s + (Number(l.loaded_miles) || 0), 0);
    const netRpm =
      loads90 >= MIN_SCORE_LOADS && loadedMiles > 0 ? netRevenue / loadedMiles : null;
    const rateGrade = netRpm != null && ladder ? rpmGrade(netRpm, ladder) : null;

    const attributed = delivered.filter((l) => l.booked_via != null);
    const inbound =
      attributed.length > 0
        ? attributed.filter((l) => l.booked_via === "agent_reached_out").length / attributed.length
        : null;

    // The activity filter: Tier 3 rows only exist when the window has a story.
    const active = loads90 > 0 || touchesOut + touchesIn > 0;
    if (a.relationship_tier === 3 && !active) continue;

    const dataTier = dataTiers.get(a.agent_id);
    const st = prospectState(a.agent_id, contacts, loads);
    // The conversion exception keys on their FIRST DELIVERED load landing in
    // this window (delivery basis — same as every other column, so a
    // conversion row always shows its load) after cold outreach. Already
    // promoted to Tier 1 → nothing left to advise; the chip holds.
    const firstDelivered = mine
      .filter((l) => l.load_status === "delivered" && l.delivery_date)
      .map((l) => l.delivery_date!.slice(0, 10))
      .sort()[0];
    const convertedInWindow =
      st.stage === "converted" &&
      st.coldTouches > 0 &&
      a.relationship_tier >= 2 &&
      firstDelivered != null &&
      firstDelivered >= win.startKey &&
      firstDelivered <= win.endKey;

    let move: Move;
    let why: string;
    if (convertedInWindow) {
      move = "up";
      why = `cold-pool convert — first load${touchesIn > 0 ? " AND they called you" : ""}; conversion beats the load count`;
    } else if (loads90 >= 3 && a.relationship_tier >= 2 && dataTier === "call-first") {
      move = "up";
      why = `${loads90} loads · data says call-first${inbound != null && inbound >= 0.5 ? " · half their freight came to you" : ""}`;
    } else if (
      a.relationship_tier === 1 &&
      loads90 <= 1 &&
      lastLoadDays != null &&
      lastLoadDays > 60
    ) {
      move = "down";
      why = `${loads90} load${loads90 === 1 ? "" : "s"} all quarter · ${lastLoadDays}d cold · ${touchesOut} touches, ${touchesIn} returned${touchesOut >= 3 ? " — you held up your end" : " — run the cadence before judging hard"}`;
    } else if (loads90 < 3) {
      move = "thin";
      why = `${loads90} load${loads90 === 1 ? "" : "s"} is under the 3-load evidence bar — keep the cadence, judge next quarter`;
    } else {
      move = "hold";
      why = "earning the seat";
    }

    rows.push({
      agent: a,
      tier: a.relationship_tier,
      loads90,
      netRevenue,
      netRpm,
      rateGrade,
      inbound,
      lastLoadDays,
      touchesOut,
      touchesIn,
      move,
      why,
    });
  }

  // Grouped by tier, then revenue descending inside each.
  return rows.sort((x, y) => x.tier - y.tier || y.netRevenue - x.netRevenue);
};

// COPY REPORT: the table as plain text, for wherever Jason keeps his records.
export const reviewReportText = (rows: ReviewRow[], win: ReviewWindow): string => {
  const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  const lines = [
    `AGENT MONTHLY REVIEW — ${win.label} (trailing 90 days)`,
    "",
  ];
  let tier = 0;
  for (const r of rows) {
    if (r.tier !== tier) {
      tier = r.tier;
      lines.push(`— TIER ${tier} —`);
    }
    const name = `${r.agent.first_name} ${r.agent.last_name}`.trim();
    lines.push(
      `${name}: ${r.loads90} loads · ${money(r.netRevenue)} · ` +
        `${r.netRpm != null ? `$${r.netRpm.toFixed(2)}/mi` : "—"}${r.rateGrade ? ` (${r.rateGrade})` : ""} · ` +
        `inbound ${r.inbound != null ? `${Math.round(r.inbound * 100)}%` : "—"} · ` +
        `last load ${r.lastLoadDays != null ? `${r.lastLoadDays}d` : "never"} · ` +
        `touches ${r.touchesOut}/${r.touchesIn} · ` +
        `${r.move.toUpperCase()}${r.move !== "hold" ? ` (${r.why})` : ""}`,
    );
  }
  return lines.join("\n");
};
