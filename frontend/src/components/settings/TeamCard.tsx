import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { UserPlus, ChevronRight } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import {
  getTeam,
  createDispatcher,
  type TeamMember,
} from "@/services/teamService";

const input =
  "bg-steel rounded px-2 py-1.5 text-light text-sm placeholder:text-muted-text";

// Owner/admin-only: manage the account's logins. Create a dispatcher seat for
// Brandie (or anyone) — they sign in with their own email + password, tied to
// this account.
export const TeamCard = () => {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => getTeam().then(setTeam).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await createDispatcher({ email, password, display_name: name });
      setMsg(`${name || email} can now sign in as a dispatcher.`);
      setName("");
      setEmail("");
      setPassword("");
      load();
    } catch (e) {
      setErr(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not create the login",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="mt-6 max-w-[680px] p-5">
      <h2 className="text-lg font-medium text-light">Team</h2>
      <p className="text-sm text-muted-text mt-1">
        Give a dispatcher their own login tied to your account — they sign in with
        their own email and password and share your data, under their own role.
      </p>

      <div className="mt-4 divide-y divide-steel">
        {team.map((m) => {
          const inner = (
            <>
              <div className="min-w-0">
                <span className="text-sm text-light">
                  {m.display_name || m.email}
                </span>
                {m.display_name && (
                  <span className="text-xs text-muted-text ml-2">{m.email}</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-steel text-muted-text">
                  {m.role === "admin" ? "Owner · Admin" : "Dispatcher"}
                </span>
                {m.role === "dispatcher" && (
                  <ChevronRight size={15} className="text-muted-text" />
                )}
              </div>
            </>
          );
          // A dispatcher's row opens their card/page; the owner has the driver card.
          return m.role === "dispatcher" ? (
            <Link
              key={m.user_id}
              to={`/dispatcher/${m.user_id}`}
              className="flex items-center justify-between py-2 hover:opacity-80"
            >
              {inner}
            </Link>
          ) : (
            <div
              key={m.user_id}
              className="flex items-center justify-between py-2"
            >
              {inner}
            </div>
          );
        })}
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
        <input
          placeholder="Initial password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />
      </div>
      <button
        onClick={add}
        disabled={busy || !email || !password}
        className="mt-3 flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg disabled:opacity-50"
        style={{ background: "#e8940a", color: "#10151f" }}
      >
        <UserPlus size={14} /> {busy ? "Creating…" : "Add dispatcher"}
      </button>
      {msg && <p className="text-xs text-status-positive-text mt-2">{msg}</p>}
      {err && <p className="text-xs text-status-negative-text mt-2">{err}</p>}
      <p className="text-xs text-muted-text mt-2">
        You set their initial password and share it with them.
      </p>
    </Panel>
  );
};
