import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { Driver } from "@/types/driver";
import { getDrivers, createDriver } from "@/services/driversService";
import { AvatarFallback } from "@/components/fleet/AvatarFallback";
import { EntityForm, type FormField } from "@/components/fleet/EntityForm";
import { mileMilestone } from "@/lib/metrics/mileClub";
import { useLoads } from "@/hooks/useLoads";
import { Skeleton } from "@/components/ui/skeleton";
import { RowsSkeleton } from "@/components/ui/PageSkeletons";
import { formatPhone } from "@/lib/phone";
import { formatDate } from "@/lib/format";

const FIELDS: FormField[] = [
  { name: "first_name", label: "First name", required: true },
  { name: "last_name", label: "Last name", required: true },
  { name: "phone", label: "Phone", format: formatPhone },
  { name: "email", label: "Email" },
  { name: "cdl_number", label: "CDL #" },
  { name: "cdl_state", label: "CDL state", placeholder: "AL" },
  { name: "cdl_expiration", label: "CDL expires", type: "date" },
  { name: "endorsements", label: "Endorsements", placeholder: "H, N, T" },
  { name: "hire_date", label: "Hire date", type: "date" },
];

const CALL_ICON = (
  <svg viewBox="0 0 24 24" className="w-[13px] h-[13px] fill-current shrink-0" aria-hidden>
    <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z" />
  </svg>
);

const DriversPage = () => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { loads } = useLoads(0);
  const navigate = useNavigate();

  // Career hauls + miles per driver, from their delivered loads.
  const statsByDriver = useMemo(() => {
    const map = new Map<string, { miles: number; hauls: number }>();
    for (const l of loads) {
      if (l.load_status !== "delivered" || !l.driver_id) continue;
      const a = map.get(l.driver_id) ?? { miles: 0, hauls: 0 };
      a.miles += Number(l.loaded_miles) || 0;
      a.hauls += 1;
      map.set(l.driver_id, a);
    }
    return map;
  }, [loads]);

  const load = () =>
    getDrivers()
      .then(setDrivers)
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const save = async (data: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await createDriver(data);
      setShowForm(false);
      await load();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not create the driver";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="p-6 text-ink font-body min-h-screen">
        <Skeleton className="h-8 w-32 mb-6" />
        <RowsSkeleton rows={3} />
      </div>
    );

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">DRIVERS</h1>
          <span className="font-condensed font-medium text-[15px] text-dim">
            who's in the seat
          </span>
          <span className="flex-1" />
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="h-9 px-4 rounded-[10px] font-condensed font-semibold text-[14px] tracking-[.05em] text-canvas"
              style={{
                background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))",
                boxShadow:
                  "0 5px 14px rgba(232,148,10,.3), inset 0 1px 0 rgba(255,255,255,.5)",
              }}
            >
              + ADD DRIVER
            </button>
          )}
        </div>

        {showForm && (
          <div className="mt-4 max-w-md">
            <EntityForm
              title="New driver"
              fields={FIELDS}
              onSave={save}
              onCancel={() => setShowForm(false)}
              busy={busy}
              error={error}
            />
          </div>
        )}

        {drivers.length === 0 ? (
          <p className="text-faint font-condensed text-[14px] mt-5">
            No drivers yet. Add one to get started.
          </p>
        ) : (
          <div className="ds2-board overflow-hidden mt-4">
            {drivers.map((d) => {
              const stats = statsByDriver.get(d.driver_id) ?? { miles: 0, hauls: 0 };
              const m = mileMilestone(stats.miles);
              const cdl = d.cdl_expiration
                ? `CDL thru ${formatDate(d.cdl_expiration)}`
                : null;
              return (
                <div
                  key={d.driver_id}
                  onClick={() => navigate(`/drivers/${d.driver_id}`)}
                  className="flex items-center gap-4 px-4 py-[13px] border-t ds2-cell-rule first:border-t-0 cursor-pointer hover:bg-well/60"
                >
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-well border border-hairline shrink-0">
                    {d.avatar_url ? (
                      <img src={d.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <AvatarFallback kind="driver" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-condensed font-semibold text-[17px] flex items-center gap-[9px] flex-wrap">
                      {d.first_name} {d.last_name}
                      {d.active ? (
                        <span className="font-bold text-[10.5px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-[#6fd08c] border border-[rgba(111,208,140,.35)] bg-[rgba(111,208,140,.08)]">
                          ACTIVE
                        </span>
                      ) : (
                        <span className="font-medium text-[10.5px] tracking-[.1em] px-[7px] py-[2px] rounded-[4px] text-faint border border-hairline">
                          INACTIVE
                        </span>
                      )}
                    </div>
                    <div className="font-condensed text-[13px] text-dim mt-[3px]">
                      {stats.hauls} haul{stats.hauls === 1 ? "" : "s"} ·{" "}
                      {stats.miles.toLocaleString("en-US")} mi hauled
                      {cdl ? ` · ${cdl}` : ""}
                      {d.endorsements ? ` · ${d.endorsements}` : ""}
                    </div>
                  </div>
                  {m.crossed != null && (
                    <span
                      className="font-display text-[12.5px] tracking-[.12em] text-amber-hi rounded-[4px] px-[9px] pt-[3px] pb-[2px] rotate-[-1.2deg] whitespace-nowrap"
                      style={{
                        border: "1.5px solid rgba(245,176,58,.55)",
                        boxShadow:
                          "inset 0 1px 0 rgba(255,255,255,.12), 0 1px 2px rgba(0,0,0,.5)",
                      }}
                    >
                      {m.label} CLUB
                    </span>
                  )}
                  {d.phone && (
                    <a
                      href={`tel:${d.phone.replace(/[^+\d]/g, "")}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-[7px] h-8 px-[13px] rounded-[9px] font-condensed font-semibold text-[13px] text-amber-hi bg-well border border-amber/35 whitespace-nowrap"
                      style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,.5)" }}
                    >
                      {CALL_ICON}
                      CALL
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DriversPage;
