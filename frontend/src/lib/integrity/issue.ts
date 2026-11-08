// The integrity report's vocabulary (Nod Sheet "The Protection Stage", mock 1;
// Jason's calls 2 and 3, 2026-11-06). An Issue is one input dash is working
// around: what is missing or disagrees, the numbers that read it, and where to
// fix it. Two severities — money (a figure stands on a fallback or two sources
// disagree) and data (a record is incomplete; the numbers skip it). A dispatcher
// sees the data rows, which are the records she enters; the money rows stay
// owner-side. Rows read money first, then data, newest first within each.
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import type { FuelEntry } from "@/types/fuelEntry";
import type { SettlementLine, SettlementSummary } from "@/types/settlement";
import type { ExpensePeriod } from "@/types/expense";
import type { Obligation } from "@/types/obligation";
import type { Accessorial } from "@/types/accessorial";
import type { AccessorialRate } from "@/types/accessorialRate";
import type { SettlementSchedule } from "@/types/settlementSchedule";
import type { MaintenanceService } from "@/types/maintenance";
import type { SnapshotRow, AccountRow, PlanRow } from "@/services/planService";
import type { MonthlyFinancialRow, CashAssumptionsRow } from "@/services/cashflowService";
import type { CostBasis } from "@/lib/metrics/rateTargets";
import { isDispatcher } from "@/lib/roles";

export type Severity = "money" | "data";

export interface IssueRecord {
  kind: "load" | "period" | "month" | "snapshot" | "settlement" | "accessorial" | "obligation" | "setting";
  key: string; // the load number, the month, the snapshot's day…
  href: string; // where the record lives in dash
}

export interface Issue {
  id: string; // the check — "INT-PNL-UNFILED", "INT-LOAD-VOIDED", …
  key: string; // unique per finding — "INT-LOAD-VOIDED:9960798"
  severity: Severity;
  title: string; // one line, the record named — "Load 9960798 · the statement says VOIDED, dash says delivered"
  detail: string; // the numbers that read it, and the amounts — "$3,000 gross; the deposit and the pace counted it"
  fixAt: string; // "Loads → 9960798", "Expenses → re-upload", "Settings → pay rates"
  fixTo: string; // the route
  since: string | null; // the day the gap began, 'YYYY-MM-DD', when known
  records: IssueRecord[];
}

// Everything the checks read — the same data the pages already fetch.
export interface IntegrityInputs {
  today: string; // the local day key
  role?: string | null;
  loads: Load[];
  trips: Trip[];
  fuel: FuelEntry[];
  settlements: SettlementSummary[];
  settlementLines: Array<SettlementLine & { settlement_id?: string; load_number?: string | null }>;
  periods: ExpensePeriod[];
  financials: MonthlyFinancialRow[];
  obligations: Obligation[];
  accessorials: Accessorial[];
  payRates: AccessorialRate[];
  schedule: SettlementSchedule | null;
  snapshots: SnapshotRow[];
  accounts: AccountRow[];
  plan: PlanRow | null;
  assumptions: CashAssumptionsRow | null;
  services: MaintenanceService[];
  basis: CostBasis | null; // computeRateTargets(...).basis — missingLabel names the unfiled months
}

const SEVERITY_ORDER: Record<Severity, number> = { money: 0, data: 1 };

// Money first, then data; newest first within each (a finding with no date last); then by title.
export const sortIssues = (issues: Issue[]): Issue[] =>
  [...issues].sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    if (a.since !== b.since) {
      if (a.since == null) return 1;
      if (b.since == null) return -1;
      return b.since.localeCompare(a.since);
    }
    return a.title.localeCompare(b.title);
  });

// A dispatcher sees the data rows (the records she enters); the owner sees everything.
// `dispatcher` defaults to the signed-in role; tests pass it explicitly.
export const visibleTo = (issues: Issue[], dispatcher: boolean = isDispatcher()): Issue[] =>
  dispatcher ? issues.filter((i) => i.severity === "data") : issues;
