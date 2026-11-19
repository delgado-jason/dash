// dash's integrity checks, run outside a browser — the morning run on GitHub
// (.github/workflows/integrity-digest.yml) and a check from the laptop:
//
//   VITE_API_URL=https://dash-production-9a19.up.railway.app \
//   DASH_WATCH_TOKEN=… npx tsx src/scripts/integrityReport.ts
//
// The checks are the page's own (lib/integrity) and the loader is the page's
// own (lib/integrity/fetch), so the report on the phone and the report on the
// page come from one set of rules. Prints one JSON object. Exit 0 = every
// input read; 2 = some input could not be loaded (the report names it);
// 1 = the run itself broke.

type Env = Record<string, string | undefined>;
const proc = (globalThis as { process?: { env?: Env; exit: (code: number) => never } }).process;
const env: Env = proc?.env ?? {};

// The browser pieces the services touch: a token in localStorage, a window
// with a location, a navigator. Installed before the services are imported.
const store = new Map<string, string>();
// Node already owns some of these names as getters (navigator; localStorage on
// newer releases), so they are defined, not assigned.
const shim = (name: string, value: unknown) =>
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
shim("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, String(v));
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => store.clear(),
  key: () => null,
  length: 0,
});
shim("window", { location: { href: "", pathname: "/" }, addEventListener: () => {} });
shim("navigator", { userAgent: "dash-integrity-run" });

const token = env.DASH_WATCH_TOKEN;
if (!token) {
  console.error("DASH_WATCH_TOKEN is not set — the run reads dash with the watch token.");
  proc?.exit(1);
}
localStorage.setItem("token", token ?? "");
localStorage.setItem("role", "admin");

const main = async () => {
  const { loadIntegrityInputs } = await import("@/lib/integrity/fetch");
  const { runIntegrityChecks } = await import("@/lib/integrity/checks");
  const { inputs, failed } = await loadIntegrityInputs();
  const issues = runIntegrityChecks(inputs);
  const report = {
    at: new Date().toISOString(),
    today: inputs.today,
    api: env.VITE_API_URL ?? "http://localhost:3000",
    open: issues.length,
    money: issues.filter((i) => i.severity === "money").length,
    data: issues.filter((i) => i.severity === "data").length,
    failed,
    issues: issues.map((i) => ({
      id: i.id,
      key: i.key,
      severity: i.severity,
      title: i.title,
      detail: i.detail,
      fixAt: i.fixAt,
      since: i.since,
    })),
  };
  console.log(JSON.stringify(report, null, 2));
  proc?.exit(failed.length ? 2 : 0);
};

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ crashed: message }));
  proc?.exit(1);
});
