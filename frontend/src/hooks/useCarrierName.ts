import { useEffect, useState } from "react";
import { getSettlementSchedule } from "@/services/settlementScheduleService";

// The user's carrier name (e.g. "Landstar"), or "" when unset / on own authority.
// Used to label agents by the carrier they run under instead of a hardcoded name.
export const useCarrierName = (): string => {
  const [name, setName] = useState("");
  useEffect(() => {
    getSettlementSchedule()
      .then((s) => setName(s.carrier_name ?? ""))
      .catch(() => {});
  }, []);
  return name;
};
