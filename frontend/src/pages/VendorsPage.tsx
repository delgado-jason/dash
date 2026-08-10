import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useVendors } from "@/hooks/useVendors";
import { useUnfiledVendors } from "@/hooks/useUnfiledVendors";
import {
  groupVendorsByCategory,
  trustCounts,
  serviceAreaStates,
} from "@/lib/metrics/vendorLeaderboard";
import { Skeleton } from "@/components/ui/skeleton";
import { RowsSkeleton } from "@/components/ui/PageSkeletons";
import { EmptyState } from "@/components/ui/EmptyState";
import { VendorPips } from "@/components/vendors/VendorPips";
import { VendorTrustTag, vendorTrust } from "@/components/vendors/VendorTrustTag";
import VendorForm from "@/components/vendors/VendorForm";
import type { Vendor } from "@/types/vendor";
import { money } from "@/lib/format";

// Maintenance-spend line, derived from the maintenance log. The backend gates
// which categories can match (Shop/Tires/Parts/Towing/Washout), so here the
// only question is whether services attached; guards the null-cost case
// ("3 services", no $).
const spendLabel = (v: Vendor): string | null => {
  if (!(v.service_count && v.service_count > 0)) return null;
  const n = v.service_count;
  const svc = `${n} service${n === 1 ? "" : "s"}`;
  return v.total_spend != null ? `${money(Number(v.total_spend))} · ${svc}` : svc;
};

const CALL_ICON = (
  <svg viewBox="0 0 24 24" className="w-[13px] h-[13px] fill-current shrink-0" aria-hidden>
    <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z" />
  </svg>
);

const CallButton = ({ phone, big = false }: { phone: string; big?: boolean }) => (
  <a
    href={`tel:${phone.replace(/[^+\d]/g, "")}`}
    onClick={(e) => e.stopPropagation()}
    className={`inline-flex items-center gap-[7px] rounded-[9px] font-condensed font-semibold text-amber-hi bg-well border border-amber/35 whitespace-nowrap ${
      big ? "h-10 px-[18px] text-[14.5px]" : "h-8 px-[13px] text-[13px]"
    }`}
    style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,.5)" }}
  >
    {CALL_ICON}
    {big ? "CALL" : phone}
  </a>
);

const StateChips = ({ area }: { area: string | null | undefined }) => {
  const states = serviceAreaStates(area);
  if (states.length === 0) return null;
  return (
    <span className="inline-flex gap-1">
      {states.map((s) => (
        <i
          key={s}
          className="not-italic font-condensed font-semibold text-[11px] text-dim bg-well border border-hairline-lo rounded-[4px] px-[5px] py-[1px]"
        >
          {s}
        </i>
      ))}
    </span>
  );
};

const VendorsPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const { vendors, isLoading, error } = useVendors(refreshKey);
  const { unfiled } = useUnfiledVendors(refreshKey);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  // Filing a shop from the maintenance log — seeds the create form with the
  // log's exact spelling so the spend readout attaches on save.
  const [filePrefill, setFilePrefill] = useState<{ name: string; category: string } | null>(null);
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) =>
      `${v.name} ${v.city ?? ""} ${v.state ?? ""} ${v.contact_name ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [vendors, search]);

  const groups = useMemo(() => groupVendorsByCategory(filtered), [filtered]);
  const trust = useMemo(() => trustCounts(vendors), [vendors]);

  const openCreate = (prefill: { name: string; category: string } | null = null) => {
    setFilePrefill(prefill);
    setShowNew(true);
  };
  const closeForm = () => {
    setShowNew(false);
    setFilePrefill(null);
  };

  if (isLoading)
    return (
      <div className="p-6 text-ink font-body min-h-screen">
        <Skeleton className="h-8 w-32 mb-6" />
        <RowsSkeleton rows={8} />
      </div>
    );

  if (error)
    return (
      <div className="p-6 text-ink font-body">
        <p className="text-destructive">{error}</p>
      </div>
    );

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">VENDORS</h1>
          <span className="font-condensed font-medium text-[15px] text-dim">
            who you call — and who you don't
          </span>
          <span className="flex-1" />
          {!showNew && (
            <button
              onClick={() => openCreate()}
              className="h-9 px-4 rounded-[10px] font-condensed font-semibold text-[14px] tracking-[.05em] text-canvas"
              style={{
                background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))",
                boxShadow:
                  "0 5px 14px rgba(232,148,10,.3), inset 0 1px 0 rgba(255,255,255,.5)",
              }}
            >
              + NEW VENDOR
            </button>
          )}
        </div>

        {/* answering line — the trust ledger */}
        <div className="flex items-center gap-3 flex-wrap mt-4">
          <span className="font-display text-[21px] tracking-[.03em] tabular-nums">
            {vendors.length} VENDOR{vendors.length === 1 ? "" : "S"}
          </span>
          {trust.goTo > 0 && (
            <span className="inline-flex items-center h-[26px] px-[11px] rounded-full font-condensed font-semibold text-[12px] text-amber-hi border border-amber/30 bg-amber/10">
              {trust.goTo} go-to{trust.goTo === 1 ? "" : "'s"}
            </span>
          )}
          {trust.steerClear > 0 && (
            <span className="inline-flex items-center h-[26px] px-[11px] rounded-full font-condensed font-semibold text-[12px] text-[#e05252] border border-[rgba(224,82,82,.3)] bg-[rgba(224,82,82,.08)]">
              {trust.steerClear} steer clear
            </span>
          )}
          {trust.unproven > 0 && (
            <span className="inline-flex items-center h-[26px] px-[11px] rounded-full font-condensed font-semibold text-[12px] text-faint border border-dashed border-hairline">
              {trust.unproven} unproven
            </span>
          )}
          <input
            className="ml-auto h-[34px] px-3 rounded-[9px] bg-well font-condensed text-[13px] text-ink placeholder:text-faint min-w-[210px] outline-none"
            style={{ boxShadow: "inset 0 2px 4px rgba(0,0,0,.5)" }}
            placeholder="⌕  search name, city, contact…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {showNew && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={closeForm} />
            <div className="relative w-full max-w-[640px] mx-4 max-h-[90vh] bg-canvas text-ink overflow-y-auto shadow-xl rounded-[12px] p-4 sm:p-6 border border-hairline">
              <VendorForm
                prefill={filePrefill ?? undefined}
                onSuccess={() => setRefreshKey((p) => p + 1)}
                onClose={closeForm}
              />
            </div>
          </div>
        )}

        {/* the bridge — maintenance-log names not in the rolodex yet */}
        {unfiled.length > 0 && (
          <div className="ds2-board overflow-hidden mt-4">
            <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
              <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
                From your maintenance log
              </span>
              <span className="font-condensed text-[12px] text-faint">
                · {unfiled.length} not in the rolodex yet
              </span>
            </div>
            {unfiled.map((u) => (
              <div
                key={u.name.toLowerCase()}
                className="flex items-center gap-[14px] px-4 py-3 border-t ds2-cell-rule first:border-t-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-condensed font-semibold text-[16px] truncate">{u.name}</div>
                  <div className="font-condensed text-[13px] text-dim">
                    {u.service_count} service{u.service_count === 1 ? "" : "s"}
                    {u.total_spend != null && (
                      <>
                        {" · "}
                        <span className="text-ink tabular-nums">{money(Number(u.total_spend))}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => openCreate({ name: u.name, category: "Shop" })}
                  className="shrink-0 h-8 px-[13px] rounded-[9px] font-condensed font-semibold text-[13px] text-amber-hi bg-well border border-amber/35"
                  style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,.5)" }}
                >
                  ADD TO ROLODEX
                </button>
              </div>
            ))}
          </div>
        )}

        {vendors.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No vendors yet"
              hint="Add a shop, escort, or permit service to start ranking who you trust."
            />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-faint font-condensed text-[14px] mt-5">
            No vendors match your search.
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.category} className="ds2-board overflow-hidden mt-4">
              <div className="flex items-center gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
                <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
                  {g.category}
                </span>
                <span className="font-condensed text-[12px] text-faint">· {g.vendors.length}</span>
                {g.champion && (
                  <span
                    className="ml-auto font-display text-[13px] tracking-[.14em] text-amber-hi rounded-[4px] px-2 pt-[2px] pb-[1px] rotate-[-1.2deg]"
                    style={{
                      border: "1.5px solid rgba(245,176,58,.55)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,.12), 0 1px 2px rgba(0,0,0,.5)",
                    }}
                  >
                    GO-TO <span className="text-dim tracking-[.1em]">· {g.champion.name.toUpperCase()}</span>
                  </span>
                )}
              </div>
              {g.vendors.map((v) => {
                const place = [v.city, v.state].filter(Boolean).join(", ");
                const spend = spendLabel(v);
                const note = v.notes?.split("\n")[0] ?? null;
                const trustLevel = vendorTrust(v.rating);
                return (
                  <div
                    key={v.vendor_id}
                    onClick={() => navigate(`/vendors/${v.vendor_id}`)}
                    className="relative flex items-center gap-[14px] px-4 py-[13px] border-t ds2-cell-rule first:border-t-0 cursor-pointer hover:bg-well/60"
                  >
                    {trustLevel === "steer" && (
                      <span
                        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-[3px] opacity-75"
                        style={{ background: "#e05252" }}
                        aria-hidden
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-condensed font-semibold text-[16.5px] flex items-center gap-[9px] flex-wrap">
                        {v.name}
                        <VendorTrustTag rating={v.rating} />
                        {v.status === "inactive" && (
                          <span className="font-condensed font-medium text-[10.5px] tracking-[.1em] text-faint border border-hairline rounded-[4px] px-[6px] py-[1px]">
                            INACTIVE
                          </span>
                        )}
                      </div>
                      <div className="font-condensed text-[13px] text-dim mt-[3px] flex items-center gap-2 flex-wrap">
                        {[place, v.contact_name].filter(Boolean).join(" · ")}
                        <StateChips area={v.service_area} />
                        {spend && <span className="text-ink tabular-nums">{spend}</span>}
                      </div>
                      {note ? (
                        <div className="text-[12.5px] text-faint italic mt-1 truncate max-w-[560px]">
                          "{note}"
                        </div>
                      ) : (
                        trustLevel === "ghost" && (
                          <div className="font-condensed text-[12.5px] text-faint mt-1">
                            rate them after the first job — the pips punch in here
                          </div>
                        )
                      )}
                    </div>
                    <VendorPips rating={v.rating} />
                    {v.phone && <CallButton phone={v.phone} />}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default VendorsPage;
