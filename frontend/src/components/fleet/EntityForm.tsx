import { useState } from "react";
import { Check, X } from "lucide-react";

export interface FormField {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "select";
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

interface Props {
  title: string;
  fields: FormField[];
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
  initial?: Record<string, string>; // prefill for editing
}

const field = "bg-steel rounded px-2 py-1 text-sm w-full";
const lbl = "text-xs text-muted-text mb-1 block";

export const EntityForm = ({
  title,
  fields,
  onSave,
  onCancel,
  busy,
  error,
  initial,
}: Props) => {
  const [values, setValues] = useState<Record<string, string>>(initial ?? {});
  const set = (name: string, v: string) =>
    setValues((p) => ({ ...p, [name]: v }));

  const missing = fields.some((f) => f.required && !(values[f.name] || "").trim());

  const submit = () => {
    const data: Record<string, unknown> = {};
    for (const f of fields) {
      const v = (values[f.name] ?? "").trim();
      if (v === "") continue;
      data[f.name] = f.type === "number" ? Number(v) : v;
    }
    onSave(data);
  };

  return (
    <div className="bg-plate rounded-lg p-4 mb-4">
      <p className="text-sm font-medium mb-3">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {fields.map((f) => (
          <div key={f.name}>
            <label className={lbl}>
              {f.label}
              {f.required ? " *" : ""}
            </label>
            {f.type === "select" ? (
              <select
                className={field}
                value={values[f.name] ?? ""}
                onChange={(e) => set(f.name, e.target.value)}
              >
                <option value="">—</option>
                {f.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={field}
                type={f.type === "date" ? "date" : "text"}
                inputMode={f.type === "number" ? "numeric" : undefined}
                value={values[f.name] ?? ""}
                onChange={(e) => set(f.name, e.target.value)}
                placeholder={f.placeholder}
              />
            )}
          </div>
        ))}
      </div>
      {error && <p className="text-destructive text-sm mt-2">{error}</p>}
      <div className="flex gap-2 mt-3">
        <button
          onClick={submit}
          disabled={busy || missing}
          className="bg-amber text-steel px-3 py-1 rounded text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
        >
          <Check size={15} /> Save
        </button>
        <button
          onClick={onCancel}
          className="bg-steel text-light px-3 py-1 rounded text-sm flex items-center gap-1"
        >
          <X size={15} /> Cancel
        </button>
      </div>
    </div>
  );
};
