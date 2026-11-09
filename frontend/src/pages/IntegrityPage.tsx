import { Link } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { FetchFailed } from "@/components/integrity/FetchFailed";
import { useIntegrity } from "@/hooks/useIntegrity";
import { cleanLines, countWords, groupIssues, sinceWords } from "@/lib/integrity/present";
import { isDispatcher } from "@/lib/roles";
import type { Issue } from "@/lib/integrity/issue";

// The Integrity page (Nod Sheet "The Protection Stage", mock 1): every input
// dash is working around, in the cash board's ledger style. The owner reads
// two groups; a dispatcher reads the data rows only.

const Stamp = ({ children }: { children: string }) => (
  <span className="font-condensed font-semibold text-[11px] tracking-[.1em] uppercase text-amber-hi inline-block align-middle">
    {children}
  </span>
);

const Row = ({ issue }: { issue: Issue }) => {
  const since = sinceWords(issue.since);
  return (
    <div className="grid grid-cols-[84px_1fr_auto] gap-x-3 px-4 py-2 border-b border-hairline-lo">
      <div className="font-condensed text-[11px] tracking-[.06em] text-faint pt-[3px] whitespace-nowrap">
        {since ? `since ${since}` : ""}
      </div>
      <div className="min-w-0">
        <div className="font-condensed font-bold text-ink text-[13px]">{issue.title}</div>
        <div className="font-condensed text-[11px] text-faint leading-[1.35] mt-0.5">{issue.detail}</div>
      </div>
      <div className="text-right whitespace-nowrap pt-[2px]">
        <Link
          to={issue.fixTo}
          className="font-condensed font-semibold text-[12px] text-amber-hi hover:text-hot"
        >
          {issue.fixAt} ›
        </Link>
      </div>
    </div>
  );
};

const Group = ({ label, note, issues }: { label: string; note: string; issues: Issue[] }) => (
  <div>
    <div className="px-4 py-2 border-b border-hairline font-condensed text-[11.5px] tracking-[.12em] uppercase text-faint">
      <span className="text-ink">
        {label} · {issues.length}
      </span>
      <span className="block text-[11px] normal-case tracking-normal mt-0.5">{note}</span>
    </div>
    {issues.map((i) => (
      <Row key={i.key} issue={i} />
    ))}
  </div>
);

const IntegrityPage = () => {
  const { visible, inputs, loading, failed, retry } = useIntegrity();
  const dispatcher = isDispatcher();
  const groups = groupIssues(visible);
  const clean = inputs ? cleanLines(inputs, visible) : [];
  // Her words never mention money rows.
  const words = dispatcher ? `data ${visible.length}` : countWords(visible);

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none uppercase">Integrity</h1>
          {!loading && <Stamp>{`${visible.length} OPEN`}</Stamp>}
          <span className="ml-auto font-condensed text-[12px] text-faint">
            {words} · checked just now · every page already reads these inputs
          </span>
        </div>

        {failed.map((what) => (
          <FetchFailed key={what} what={what} onRetry={retry} className="mt-3" />
        ))}

        <div className="ds2-board mt-4 overflow-hidden">
          {loading ? (
            <p className="px-4 py-6 font-condensed text-sm text-faint">Reading every input…</p>
          ) : (
            <>
              {visible.length === 0 ? (
                <p className="px-4 py-6 font-condensed text-sm text-faint">
                  Nothing open — every input dash reads is present.
                </p>
              ) : (
                <>
                  {groups.money.length > 0 && (
                    <Group
                      label="Money"
                      note="a figure stands on a fallback or two sources disagree"
                      issues={groups.money}
                    />
                  )}
                  {groups.data.length > 0 && (
                    <Group
                      label="Data"
                      note="a record is incomplete; the numbers skip it"
                      issues={groups.data}
                    />
                  )}
                </>
              )}
              {clean.length > 0 && (
                <div className="px-4 py-3 font-condensed text-[11px] text-faint">
                  <span className="tracking-[.12em] uppercase">Clean</span> · {clean.join(" · ")}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default IntegrityPage;
