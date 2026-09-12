import { QualifySweep } from "@/components/relationships/QualifySweep";
import { useRelationships } from "./context";

// CALL LIST — in PR1 this is the qualify sweep, moved as-is. PR3 rebuilds it
// on the v2 buckets (reactivation, prospects, the holiday list, the Foreman's
// parked-within-75-mi group).
const CallsView = () => {
  const { agents, loads, contacts, coverage, reload } = useRelationships();
  return (
    <div className="mt-4">
      <QualifySweep agents={agents} loads={loads} contacts={contacts} coverage={coverage} onChanged={() => void reload()} />
    </div>
  );
};

export default CallsView;
