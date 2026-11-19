import { useCallback, useEffect, useMemo, useState } from "react";
import { loadIntegrityInputs } from "@/lib/integrity/fetch";
import { runIntegrityChecks } from "@/lib/integrity/checks";
import { visibleTo, type IntegrityInputs, type Issue } from "@/lib/integrity/issue";

// The Integrity report: every input dash reads, fetched in parallel by
// lib/integrity/fetch (the same loader the morning run uses), handed to the
// checks. `visible` is what THIS viewer sees (a dispatcher sees data rows).
export const useIntegrity = () => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const [inputs, setInputs] = useState<IntegrityInputs | null>(null);

  const run = useCallback(() => {
    let active = true;
    loadIntegrityInputs().then((result) => {
      if (!active) return;
      setInputs(result.inputs);
      setFailed(result.failed);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => run(), [run]);

  // Retry re-runs the loader from an event handler; the old report stays up
  // until the new one lands.
  const retry = useCallback(() => {
    run();
  }, [run]);

  const issues: Issue[] = useMemo(() => (inputs ? runIntegrityChecks(inputs) : []), [inputs]);
  const visible = useMemo(() => visibleTo(issues), [issues]);

  return {
    issues,
    visible,
    inputs,
    loading: !loaded,
    failed,
    retry,
  };
};
