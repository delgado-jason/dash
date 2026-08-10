import type { FacilityKind } from "@/types/facility";

// Business vs job site, forged: a business is a place with a name you'll see
// again; a job site is an address that existed for one delivery.
export const KindChip = ({ kind }: { kind: FacilityKind }) =>
  kind === "job_site" ? (
    <span className="font-condensed font-bold text-[10px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-[#9db2d8] border border-[rgba(157,178,216,.35)] bg-[rgba(157,178,216,.08)]">
      JOB SITE
    </span>
  ) : (
    <span className="font-condensed font-bold text-[10px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-[#6fd08c] border border-[rgba(111,208,140,.35)] bg-[rgba(111,208,140,.08)]">
      BUSINESS
    </span>
  );
