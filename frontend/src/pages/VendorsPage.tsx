import { useState, useMemo } from "react";
import { Link } from "react-router";
import { Plus, Crown, MapPin, Trophy } from "lucide-react";
import { useVendors } from "@/hooks/useVendors";
import {
  groupVendorsByCategory,
  goToCount,
} from "@/lib/metrics/vendorLeaderboard";
import { Kpi } from "@/components/Kpi";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { VendorRatingMedallion } from "@/components/vendors/VendorRatingMedallion";
import VendorForm from "@/components/vendors/VendorForm";
import type { Vendor } from "@/types/vendor";
import { money } from "@/lib/format";

// Shop-only spend line, derived from the maintenance log. Only shown for shops
// that actually matched services; guards the null-cost case ("3 services", no $).
const spendLabel = (v: Vendor): string | null => {
  if (v.category !== "Shop" || !(v.service_count && v.service_count > 0))
    return null;
  const n = v.service_count;
  const svc = `${n} service${n === 1 ? "" : "s"}`;
  return v.total_spend != null ? `${money(Number(v.total_spend))} · ${svc}` : svc;
};

const VendorsPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const { vendors, isLoading, error } = useVendors(refreshKey);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string>("All");
  const [showNew, setShowNew] = useState(false);

  const categories = useMemo(
    () => [...new Set(vendors.map((v) => v.category))].sort(),
    [vendors],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.filter((v) => {
      if (activeCat !== "All" && v.category !== activeCat) return false;
      if (!q) return true;
      return `${v.name} ${v.city ?? ""} ${v.state ?? ""} ${v.contact_name ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [vendors, search, activeCat]);

  const groups = useMemo(() => groupVendorsByCategory(filtered), [filtered]);

  if (isLoading)
    return (
      <div className="p-6 bg-iron text-light min-h-screen font-body">
        <Skeleton className="h-8 w-32 mb-6" />
        <div className="grid grid-cols-3 gap-4 mb-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20" style={{ borderRadius: 13 }} />
          ))}
        </div>
        <Skeleton className="h-10 w-full mb-4" style={{ borderRadius: 10 }} />
        <Skeleton className="h-64 w-full" style={{ borderRadius: 13 }} />
      </div>
    );

  if (error)
    return (
      <div className="p-6 bg-iron text-light min-h-screen font-body">
        <p className="text-destructive">{error}</p>
      </div>
    );

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowNew(false)}
          />
          <div className="relative w-full max-w-[640px] mx-4 max-h-[90vh] bg-iron text-light overflow-y-auto shadow-xl rounded-lg p-4 sm:p-6 border border-plate">
            <VendorForm
              onSuccess={() => setRefreshKey((p) => p + 1)}
              onClose={() => setShowNew(false)}
            />
          </div>
        </div>
      )}

      <div className="flex justify-between items-baseline mb-6">
        <h1 className="text-3xl font-condensed text-light">Vendors</h1>
        <Link
          to="/guide"
          className="text-xs text-muted-text hover:text-amber-light"
        >
          How this works →
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Kpi label="Vendors" value={String(vendors.length)} />
        <Kpi label="Categories" value={String(categories.length)} />
        <Kpi
          label="Your go-to's"
          value={String(goToCount(vendors))}
          valueClass="text-amber"
          sub="rated 5"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4 mb-3">
        <input
          className="bg-plate rounded px-3 py-2 text-sm flex-1 min-w-[180px] text-light placeholder:text-muted-text"
          placeholder="Search name, city, contact"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          onClick={() => setShowNew(true)}
          className="bg-amber text-steel px-3 py-2 rounded text-sm font-semibold inline-flex items-center gap-1"
        >
          <Plus size={15} /> New vendor
        </button>
      </div>

      {categories.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-5">
          {["All", ...categories].map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCat(cat)}
              className={`px-3 py-1 rounded-full text-sm border ${
                activeCat === cat
                  ? "bg-amber text-steel border-amber font-semibold"
                  : "border-[#2c3854] text-muted-text hover:text-light"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {vendors.length === 0 ? (
        <EmptyState
          title="No vendors yet"
          hint="Add a shop, escort, or permit service to start ranking who you trust."
        />
      ) : filtered.length === 0 ? (
        <p className="text-muted-text text-sm">No vendors match your search.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <Panel key={g.category} className="p-0 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#232d43]">
                <span className="font-condensed uppercase tracking-wide">
                  {g.category}
                </span>
                <span className="text-muted-text text-xs">
                  · {g.vendors.length}
                </span>
                {g.champion && (
                  <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-amber">
                    <Trophy size={13} /> {g.champion.name}
                  </span>
                )}
              </div>
              <div>
                {g.vendors.map((v, i) => {
                  const isChamp = g.champion?.vendor_id === v.vendor_id;
                  const spend = spendLabel(v);
                  const place = [v.city, v.state].filter(Boolean).join(", ");
                  return (
                    <Link
                      key={v.vendor_id}
                      to={`/vendors/${v.vendor_id}`}
                      className="flex items-center gap-3 px-4 py-2.5 border-t border-[#1e2740] first:border-t-0 hover:bg-steel/30"
                    >
                      <span className="w-6 text-center shrink-0">
                        {isChamp ? (
                          <Crown size={16} className="text-amber inline" />
                        ) : (
                          <span className="text-muted-text text-sm">
                            {i + 1}
                          </span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div
                          className={`truncate ${isChamp ? "font-semibold" : ""}`}
                        >
                          {v.name}
                        </div>
                        {(place || spend) && (
                          <div className="text-xs text-muted-text truncate">
                            {place && (
                              <>
                                <MapPin size={11} className="inline -mt-0.5" />{" "}
                                {place}
                              </>
                            )}
                            {spend && (
                              <>
                                {place ? " · " : ""}
                                <span className="text-[#c9d3e2]">{spend}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <VendorRatingMedallion rating={v.rating} />
                    </Link>
                  );
                })}
              </div>
            </Panel>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-text mt-6">
        {filtered.length} vendor{filtered.length === 1 ? "" : "s"}
      </p>
    </div>
  );
};

export default VendorsPage;
