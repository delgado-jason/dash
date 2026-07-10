import { useRef, useState } from "react";
import { Sparkles, Upload } from "lucide-react";
import {
  generateAvatar,
  uploadAvatar,
  type AvatarKind,
} from "@/services/avatarsService";
import { AvatarFallback } from "./AvatarFallback";

interface Props {
  kind: AvatarKind;
  id: string;
  avatarUrl: string | null;
  size?: number;
  allowVariant?: boolean; // driver male/female toggle
  onUpdated?: (url: string) => void;
}

export const EntityAvatar = ({
  kind,
  id,
  avatarUrl,
  size = 160,
  allowVariant,
  onUpdated,
}: Props) => {
  const [url, setUrl] = useState<string | null>(avatarUrl);
  const [busy, setBusy] = useState<null | "gen" | "up">(null);
  const [variant, setVariant] = useState("male");
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Storage path is fixed per entity, so a fresh image reuses the URL — bust
  // the browser cache so the new one shows.
  const bust = (u: string) => `${u}?t=${Date.now()}`;

  const gen = async () => {
    setBusy("gen");
    setErr(null);
    try {
      const u = await generateAvatar(kind, id, allowVariant ? variant : undefined);
      setUrl(bust(u));
      onUpdated?.(u);
    } catch {
      setErr("Generation failed");
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy("up");
    setErr(null);
    try {
      const u = await uploadAvatar(kind, id, f);
      setUrl(bust(u));
      onUpdated?.(u);
    } catch {
      setErr("Upload failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="rounded-xl overflow-hidden bg-plate relative shrink-0"
        style={{ width: size, height: size }}
      >
        {url ? (
          <img src={url} alt="" className="w-full h-full object-cover" />
        ) : (
          <AvatarFallback kind={kind} />
        )}
        {busy && (
          <div className="absolute inset-0 bg-black/55 flex items-center justify-center text-xs text-light">
            {busy === "gen" ? "Generating…" : "Uploading…"}
          </div>
        )}
      </div>

      {allowVariant && (
        <div className="flex gap-1 text-xs">
          {["male", "female"].map((v) => (
            <button
              key={v}
              onClick={() => setVariant(v)}
              className={`px-2 py-0.5 rounded capitalize ${
                variant === v ? "bg-amber text-steel" : "bg-steel text-muted-text"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={gen}
          disabled={!!busy}
          className="bg-amber text-steel px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
        >
          <Sparkles size={13} /> Generate
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={!!busy}
          className="bg-steel text-light px-2 py-1 rounded text-xs flex items-center gap-1 disabled:opacity-50"
        >
          <Upload size={13} /> Upload
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onFile}
        />
      </div>
      {err && <p className="text-destructive text-xs">{err}</p>}
    </div>
  );
};
