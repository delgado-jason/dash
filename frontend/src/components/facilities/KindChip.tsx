import type { FacilityKind } from "@/types/facility";

// Business vs job site, forged: a business is a place with a name you'll see
// again; a job site is an address that existed for one delivery.
export const KindChip = ({ kind }: { kind: FacilityKind }) =>
  kind === "job_site" ? (
    <span className="font-condensed font-bold text-[10px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-status-info-text border border-status-info-text/35 bg-status-info-text/8">
      JOB SITE
    </span>
  ) : (
    <span className="font-condensed font-bold text-[10px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-status-positive-text border border-status-positive-text/35 bg-status-positive-text/8">
      BUSINESS
    </span>
  );
