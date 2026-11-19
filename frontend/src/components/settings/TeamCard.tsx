import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { UserPlus, ChevronRight, KeyRound } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import {
  getTeam,
  createDispatcher,
  setMemberPassword,
  type TeamMember,
} from "@/services/teamService";
import { passwordProblem, PASSWORD_HINT } from "@/lib/passwordRules";
import { apiErrorWord } from "@/lib/apiError";

const input =
  "bg-steel rounded px-2 py-1.5 text-light text-sm placeholder:text-muted-text";

const amber = {
  background: "var(--color-amber)",
  color: "var(--color-on-amber)",
};

// Owner/admin-only: manage the account's logins. Create a dispatcher seat for
// Brandie (or anyone) — they sign in with their own email + password, tied to
// this account — and set a new password on a dispatcher's row when one is
// forgotten. Signup is closed; this card is where every login comes from.
export const TeamCard = () => {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // The one row whose "New password" form is open, and what's typed in it.
  const [resetting, setResetting] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const load = () => getTeam().then(setTeam).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    setErr(null);
    setMsg(null);
    const problem = passwordProblem(password);
    if (problem) {
      setErr(problem);
      return;
    }
    setBusy(true);
    try {
      await createDispatcher({ email, password, display_name: name });
      setMsg(`${name || email} can now sign in as a dispatcher.`);
      setName("");
      setEmail("");
      setPassword("");
      load();
    } catch (e) {
      setErr(apiErrorWord(e, "Could not create the login"));
    } finally {
      setBusy(false);
    }
  };

  const openReset = (id: string) => {
    setErr(null);
    setMsg(null);
    setResetPw("");
    setResetting((cur) => (cur === id ? null : id));
  };

  const reset = async (m: TeamMember) => {
    setErr(null);
    setMsg(null);
    const problem = passwordProblem(resetPw);
    if (problem) {
      setErr(problem);
      return;
    }
    setResetBusy(true);
    try {
      await setMemberPassword(m.user_id, resetPw);
      setMsg(
        `New password set for ${m.display_name || m.email}. Share it with them; their open sessions keep working until they expire.`,
      );
      setResetting(null);
      setResetPw("");
    } catch (e) {
      setErr(apiErrorWord(e, "Could not set the password"));
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <Panel className="mt-6 max-w-[680px] p-5">
      <h2 className="text-lg font-medium text-light">Team</h2>
      <p className="text-sm text-muted-text mt-1">
        Give a dispatcher their own login tied to your account — they sign in with
        their own email and password and share your data, under their own role.
        Signup is closed; every login comes from here.
      </p>

      <div className="mt-4 divide-y divide-steel">
        {team.map((m) => (
          <div key={m.user_id} className="py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                {m.role === "dispatcher" ? (
                  // A dispatcher's name opens their card/page; the owner has the driver card.
                  <Link
                    to={`/dispatcher/${m.user_id}`}
                    className="inline-flex items-center gap-1 text-sm text-light hover:underline"
                  >
                    {m.display_name || m.email}
                    <ChevronRight size={15} className="text-muted-text" />
                  </Link>
                ) : (
                  <span className="text-sm text-light">
                    {m.display_name || m.email}
                  </span>
                )}
                {m.display_name && (
                  <span className="text-xs text-muted-text ml-2">{m.email}</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[12px] px-2 py-0.5 rounded-full bg-steel text-muted-text">
                  {m.role === "admin" ? "Owner · Admin" : "Dispatcher"}
                </span>
                {m.role === "dispatcher" && (
                  <button
                    type="button"
                    onClick={() => openReset(m.user_id)}
                    aria-expanded={resetting === m.user_id}
                    className="inline-flex items-center gap-1 text-xs text-muted-text hover:text-light"
                  >
                    <KeyRound size={13} /> New password
                  </button>
                )}
              </div>
            </div>
            {resetting === m.user_id && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void reset(m);
                }}
                className="mt-2 flex flex-wrap items-center gap-2"
                data-testid="reset-form"
              >
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder={`New password · ${PASSWORD_HINT}`}
                  aria-label={`New password for ${m.display_name || m.email}`}
                  value={resetPw}
                  onChange={(e) => setResetPw(e.target.value)}
                  className={`${input} flex-1 min-w-[200px]`}
                />
                <button
                  type="submit"
                  disabled={resetBusy || !resetPw}
                  className="text-sm px-3 py-1.5 rounded-lg disabled:opacity-50"
                  style={amber}
                >
                  {resetBusy ? "Setting…" : "Set"}
                </button>
                <button
                  type="button"
                  onClick={() => setResetting(null)}
                  className="text-sm px-3 py-1.5 rounded-lg text-muted-text hover:text-light"
                >
                  Cancel
                </button>
              </form>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={input}
        />
        <input
          placeholder="Email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
        <input
          placeholder={`First password · ${PASSWORD_HINT}`}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />
      </div>
      <button
        onClick={add}
        disabled={busy || !email || !password}
        className="mt-3 flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg disabled:opacity-50"
        style={amber}
      >
        <UserPlus size={14} /> {busy ? "Creating…" : "Add dispatcher"}
      </button>
      {msg && <p className="text-xs text-status-positive-text mt-2">{msg}</p>}
      {err && (
        <p className="text-xs text-status-negative-text mt-2" role="alert">
          {err}
        </p>
      )}
      <p className="text-xs text-muted-text mt-2">
        You set their first password and share it. Forgotten? New password on
        their row sets another — there is no email reset.
      </p>
    </Panel>
  );
};
