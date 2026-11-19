import { useEffect, useState } from "react";
import { FetchFailed } from "@/components/integrity/FetchFailed";
import {
  getAppHitsSummary,
  getAppErrors,
  type AppHitsSummary,
  type AppErrors,
  type AppHitRow,
} from "@/services/telemetryService";

// The app itself (owner only): what gets opened and the errors it caught, over
// the last thirty days. The rows come from dash's own beacons (lib/telemetry);
// the watcher on the DTS server reads the same two feeds every morning.

const DAYS = 30;

const when = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";

const who = (r: Pick<AppHitRow, "display_name" | "email" | "role">): string =>
  r.display_name || r.email || (r.role ? `a ${r.role}` : "someone");

const Head = ({ label, note }: { label: string; note: string }) => (
  <div className="px-4 py-2 border-b border-hairline font-condensed text-[12.5px] tracking-[.12em] uppercase text-faint">
    <span className="text-ink">{label}</span>
    <span className="block text-[12px] normal-case tracking-normal mt-0.5">{note}</span>
  </div>
);

export const AppSelfPart = () => {
  const [hits, setHits] = useState<AppHitsSummary | null>(null);
  const [errors, setErrors] = useState<AppErrors | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.allSettled([getAppHitsSummary(DAYS), getAppErrors(DAYS)]).then(([h, e]) => {
      if (!active) return;
      const f: string[] = [];
      if (h.status === "fulfilled") setHits(h.value);
      else f.push("what gets opened");
      if (e.status === "fulfilled") setErrors(e.value);
      else f.push("the errors caught");
      setFailed(f);
    });
    return () => {
      active = false;
    };
  }, [tick]);

  const retry = () => setTick((t) => t + 1);

  return (
    <section className="mt-8" data-testid="app-self">
      <h2 className="ds2-label">The app itself</h2>
      <p className="font-condensed text-[13px] text-faint mt-1">
        What dash records about its own use — who opens which page, and the errors the browser
        caught. The watcher on the DTS server reads both every morning: three days with nobody
        opening dash, or any error caught yesterday, reaches your phone. The checks above run
        again at 6:30 ET from GitHub and post what is open.
      </p>

      {failed.map((what) => (
        <FetchFailed key={what} what={what} onRetry={retry} className="mt-3" />
      ))}

      <div className="ds2-board mt-3 overflow-hidden">
        <Head
          label={
            hits
              ? `Opened · ${hits.views} ${hits.views === 1 ? "view" : "views"} · ${hits.people} ${hits.people === 1 ? "person" : "people"} · the last ${DAYS} days`
              : "Opened"
          }
          note={
            hits?.since
              ? `the beacon began ${when(hits.since)} · last opened ${when(hits.last_ever)}`
              : "by page and by person, most opened first"
          }
        />
        {hits && hits.rows.length === 0 && (
          <p className="px-4 py-4 font-condensed text-sm text-faint">
            Nothing recorded yet — the beacon started with v1.297.0; the next page anyone opens is the first row.
          </p>
        )}
        {hits && hits.rows.length > 0 && (
          <div>
            <div className="grid grid-cols-[1fr_1fr_64px_130px] gap-x-3 px-4 py-1.5 border-b border-hairline-lo font-condensed text-[11px] tracking-[.08em] uppercase text-faint">
              <span>Page</span>
              <span>Who</span>
              <span className="text-right">Views</span>
              <span className="text-right">Last opened</span>
            </div>
            {hits.rows.map((r) => (
              <div
                key={`${r.page}·${r.user_id}`}
                className="grid grid-cols-[1fr_1fr_64px_130px] gap-x-3 px-4 py-1.5 border-b border-hairline-lo font-condensed text-[13px]"
              >
                <span className="text-ink truncate">{r.page}</span>
                <span className="text-faint truncate">{who(r)}</span>
                <span className="text-right tabular-nums text-ink">{r.views}</span>
                <span className="text-right text-faint whitespace-nowrap">{when(r.last_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ds2-board mt-3 overflow-hidden">
        <Head
          label={errors ? `Errors caught · ${errors.total} · the last ${DAYS} days` : "Errors caught"}
          note="one row per message on a page, newest first — a thrown error, an unhandled promise, or a render crash the boundary stopped"
        />
        {errors && errors.rows.length === 0 && (
          <p className="px-4 py-4 font-condensed text-sm text-faint">No errors caught.</p>
        )}
        {errors &&
          errors.rows.map((r) => (
            <div key={`${r.page}·${r.kind}·${r.message}`} className="px-4 py-2 border-b border-hairline-lo">
              <div className="grid grid-cols-[1fr_auto] gap-x-3">
                <div className="min-w-0">
                  <div className="font-condensed font-bold text-ink text-[14px] break-words">{r.message}</div>
                  <div className="font-condensed text-[12px] text-faint mt-0.5">
                    {r.page} · {r.kind} · ×{r.count} · first {when(r.first_at)}
                    {r.last_version ? ` · v${r.last_version}` : ""}
                  </div>
                </div>
                <div className="font-condensed text-[12px] text-faint whitespace-nowrap pt-[2px]">
                  last {when(r.last_at)}
                </div>
              </div>
              {r.last_stack && (
                <details className="mt-1">
                  <summary className="font-condensed text-[12px] text-faint cursor-pointer">the stack</summary>
                  <pre className="mt-1 text-[11px] text-faint whitespace-pre-wrap break-words font-mono">{r.last_stack}</pre>
                </details>
              )}
            </div>
          ))}
      </div>
    </section>
  );
};
