import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Check, RefreshCw, X } from "lucide-react";
import type { Trophy } from "@/types/trophy";
import {
  getTrophies,
  upsertTrophy,
  generateTrophyImage,
} from "@/services/trophyService";
import { TROPHY_CATALOG } from "@/lib/trophies/catalog";
import { trophyPrompt, HALL_PROMPT } from "@/lib/trophies/style";

const errText = (e: unknown): string =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
  "Something went wrong — generation can take a few seconds, try again.";

const StudioItem = ({
  title,
  subtitle,
  current,
  preview,
  wide,
  busy,
  onGenerate,
  onApprove,
  onDiscard,
  footer,
}: {
  title: string;
  subtitle: string;
  current: string | null;
  preview: string | null;
  wide?: boolean;
  busy: boolean;
  onGenerate: () => void;
  onApprove: () => void;
  onDiscard: () => void;
  footer?: ReactNode;
}) => {
  const show = preview ?? current;
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: "#10151f", borderColor: preview ? "#e8940a" : "#2a3347" }}
    >
      <div className="flex items-baseline justify-between gap-2 px-3 pt-2.5">
        <span className="font-comic text-lg" style={{ color: "#f5b03a" }}>
          {title}
        </span>
        <span className="text-[11px] text-muted-text truncate">{subtitle}</span>
      </div>

      <div
        className={`relative m-3 rounded-lg overflow-hidden bg-steel ${wide ? "aspect-video" : "aspect-square"}`}
      >
        {busy ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-text">
            <Sparkles size={22} className="animate-pulse text-amber" />
            <span className="text-xs">Generating…</span>
          </div>
        ) : show ? (
          <img src={show} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-text text-xs">
            Not generated yet
          </div>
        )}
        {preview && !busy && (
          <span className="absolute top-2 left-2 text-[10px] font-comic tracking-wider bg-amber text-steel px-2 py-0.5 rounded">
            PREVIEW
          </span>
        )}
      </div>

      <div className="px-3 pb-3 flex flex-wrap gap-2">
        {preview ? (
          <>
            <button
              onClick={onApprove}
              disabled={busy}
              className="bg-amber text-steel px-3 py-1.5 rounded text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
            >
              <Check size={14} /> Approve
            </button>
            <button
              onClick={onGenerate}
              disabled={busy}
              className="bg-plate text-light px-3 py-1.5 rounded text-sm flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw size={14} /> Regenerate
            </button>
            <button
              onClick={onDiscard}
              disabled={busy}
              className="text-muted-text px-2 py-1.5 rounded text-sm flex items-center gap-1"
            >
              <X size={14} /> Discard
            </button>
          </>
        ) : (
          <button
            onClick={onGenerate}
            disabled={busy}
            className="bg-plate text-light px-3 py-1.5 rounded text-sm flex items-center gap-1 disabled:opacity-50"
          >
            <Sparkles size={14} /> {current ? "Regenerate" : "Generate"}
          </button>
        )}
      </div>

      {footer && <div className="px-3 pb-3 border-t border-plate pt-2.5">{footer}</div>}
    </div>
  );
};

const TrophyStudioPage = () => {
  const [byKey, setByKey] = useState<Record<string, Trophy>>({});
  const [preview, setPreview] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () =>
    getTrophies()
      .then((list) => {
        const m: Record<string, Trophy> = {};
        for (const t of list) m[t.trophy_key] = t;
        setByKey(m);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const gen = async (key: string, prompt: string, wide: boolean) => {
    setBusy(key);
    setError(null);
    try {
      const url = await generateTrophyImage(key, prompt, wide);
      setPreview((p) => ({ ...p, [key]: url }));
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const approve = async (key: string) => {
    setBusy(key);
    setError(null);
    try {
      await upsertTrophy(key, { image_url: preview[key] });
      setPreview((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      });
      await load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const discard = (key: string) =>
    setPreview((p) => {
      const n = { ...p };
      delete n[key];
      return n;
    });

  const setEarned = async (key: string, earned: boolean, earned_on?: string) => {
    setBusy(key);
    setError(null);
    try {
      await upsertTrophy(key, { earned, earned_on: earned_on || null });
      await load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <Link to="/trophy-room" className="text-xs text-muted-text hover:text-light">
        ← Trophy Room
      </Link>
      <h1 className="text-3xl font-condensed mt-2">Trophy Studio</h1>
      <p className="text-sm text-muted-text mb-5">
        Generate each trophy and the hall background, regenerate until it's worthy,
        then approve — only approved art gets hung in the hall.
      </p>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-muted-text">Loading…</p>
      ) : (
        <>
          <div className="max-w-[640px] mb-6">
            <StudioItem
              title="HALL BACKGROUND"
              subtitle="the room · your avatars hang in the frames"
              current={byKey["hall-background"]?.image_url ?? null}
              preview={preview["hall-background"] ?? null}
              wide
              busy={busy === "hall-background"}
              onGenerate={() => gen("hall-background", HALL_PROMPT, true)}
              onApprove={() => approve("hall-background")}
              onDiscard={() => discard("hall-background")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {TROPHY_CATALOG.map((def) => {
              const t = byKey[def.key];
              const manual = def.kind === "manual";
              return (
                <StudioItem
                  key={def.key}
                  title={def.name}
                  subtitle={def.blurb}
                  current={t?.image_url ?? null}
                  preview={preview[def.key] ?? null}
                  busy={busy === def.key}
                  onGenerate={() => gen(def.key, trophyPrompt(def.promptIdea), false)}
                  onApprove={() => approve(def.key)}
                  onDiscard={() => discard(def.key)}
                  footer={
                    manual ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        {t?.earned ? (
                          <>
                            <span className="text-[11px] text-status-positive-text font-semibold">
                              ★ Earned
                            </span>
                            <input
                              type="date"
                              value={t.earned_on?.slice(0, 10) ?? ""}
                              onChange={(e) => setEarned(def.key, true, e.target.value)}
                              className="bg-steel rounded px-2 py-1 text-xs text-light"
                            />
                            <button
                              onClick={() => setEarned(def.key, false)}
                              className="text-[11px] text-muted-text hover:text-destructive"
                            >
                              unmark
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setEarned(def.key, true)}
                            className="text-xs bg-steel text-light px-2 py-1 rounded"
                          >
                            Mark earned
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-text">
                        {def.kind === "capstone"
                          ? "The capstone — earns when authority, free-and-clear, and the million miles are all done."
                          : "Earns automatically from your data."}
                      </span>
                    )
                  }
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default TrophyStudioPage;
