import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { changeMyPassword } from "@/services/teamService";
import { passwordProblem, PASSWORD_HINT } from "@/lib/passwordRules";
import { apiErrorWord } from "@/lib/apiError";

const input =
  "bg-steel rounded px-2 py-1.5 text-light text-sm placeholder:text-muted-text w-full";

// Your own password — owner or dispatcher — changed with the current one. The
// forgotten case is said here too, because this is where people look for it:
// there is no email reset; a dispatcher asks the owner, the owner has a script.
export const PasswordCard = () => {
  const isAdmin = localStorage.getItem("role") === "admin";
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setMsg(null);
    setErr(null);
    if (!current) {
      setErr("Type your current password.");
      return;
    }
    const problem = passwordProblem(next);
    if (problem) {
      setErr(problem);
      return;
    }
    if (next !== again) {
      setErr("The two new passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await changeMyPassword({ current_password: current, new_password: next });
      setMsg(
        "Password changed. Other devices stay signed in until their sessions expire.",
      );
      setCurrent("");
      setNext("");
      setAgain("");
    } catch (e) {
      setErr(apiErrorWord(e, "Could not change the password."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="mt-6 max-w-[680px] p-5">
      <h2 className="text-lg font-medium text-light">Your password</h2>
      <p className="text-sm text-muted-text mt-1">
        Change it here with the current one.{" "}
        {isAdmin
          ? "Forgotten it? The owner's reset is the set-password script in the repo; a dispatcher's is the New password button on their row under Team."
          : "Forgotten it? Ask the owner — they set a new one from Settings → Team on their login. There is no email reset."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2"
      >
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Current password"
          aria-label="Current password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className={input}
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder={`New password · ${PASSWORD_HINT}`}
          aria-label="New password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className={input}
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="New password again"
          aria-label="New password again"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          className={input}
        />
        <div className="sm:col-span-3">
          <button
            type="submit"
            disabled={busy || !current || !next || !again}
            className="mt-1 flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg disabled:opacity-50"
            style={{
              background: "var(--color-amber)",
              color: "var(--color-on-amber)",
            }}
          >
            <KeyRound size={14} /> {busy ? "Changing…" : "Change password"}
          </button>
        </div>
      </form>
      {msg && <p className="text-xs text-status-positive-text mt-2">{msg}</p>}
      {err && (
        <p className="text-xs text-status-negative-text mt-2" role="alert">
          {err}
        </p>
      )}
    </Panel>
  );
};
