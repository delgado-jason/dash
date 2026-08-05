import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router";
import {
  Mail,
  Phone,
  Globe,
  MapPin,
  Star,
  Wrench,
  Crown,
  Trash2,
} from "lucide-react";

import { useVendor } from "@/hooks/useVendor";
import { useVendors } from "@/hooks/useVendors";
import { deleteVendor } from "@/services/deleteVendorService";
import { groupVendorsByCategory } from "@/lib/metrics/vendorLeaderboard";

import VendorRatingForm from "@/components/vendors/VendorRatingForm";
import VendorForm from "@/components/vendors/VendorForm";
import { VendorRatingStamp } from "@/components/vendors/VendorRatingStamp";
import { Kpi } from "@/components/Kpi";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCardsSkeleton, BlockSkeleton } from "@/components/ui/PageSkeletons";
import { money, formatDate } from "@/lib/format";

const VendorDetailPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [showRating, setShowRating] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  const { vendor, ratingHistory, isLoading, error } = useVendor(refreshKey);
  const { vendors: allVendors } = useVendors(refreshKey);

  // Is this vendor the top-rated in its category? (drives the champion ribbon)
  const isChampion = useMemo(() => {
    if (!vendor) return false;
    const group = groupVendorsByCategory(allVendors).find(
      (g) => g.category === vendor.category,
    );
    return group?.champion?.vendor_id === vendor.vendor_id;
  }, [vendor, allVendors]);

  if (isLoading)
    return (
      <div className="p-6 bg-iron text-light min-h-screen font-body">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-32 mb-6" />
        <StatCardsSkeleton count={3} />
        <BlockSkeleton className="h-56 mt-6" />
      </div>
    );
  if (error)
    return (
      <div className="p-6 bg-iron text-light min-h-screen font-body">
        <p className="text-destructive">{error}</p>
      </div>
    );
  if (!vendor) return null;

  const isShop = vendor.category === "Shop";
  const hasSpend = isShop && !!vendor.service_count && vendor.service_count > 0;
  const place = [vendor.city, vendor.state].filter(Boolean).join(", ");

  const handleSuccess = () => {
    setRefreshKey((p) => p + 1);
    setShowRating(false);
    setShowEdit(false);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${vendor.name}? This can't be undone.`)) return;
    try {
      setDeleting(true);
      await deleteVendor(vendor.vendor_id);
      navigate("/vendors");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete vendor");
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      {showRating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowRating(false)}
          />
          <div className="relative w-full max-w-[450px] mx-4 max-h-[90vh] bg-iron text-light overflow-y-auto shadow-xl rounded-lg p-4 sm:p-6 border border-plate">
            <VendorRatingForm
              vendor={vendor}
              onSuccess={handleSuccess}
              onClose={() => setShowRating(false)}
            />
          </div>
        </div>
      )}

      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowEdit(false)}
          />
          <div className="relative w-full max-w-[640px] mx-4 max-h-[90vh] bg-iron text-light overflow-y-auto shadow-xl rounded-lg p-4 sm:p-6 border border-plate">
            <VendorForm
              vendor={vendor}
              onSuccess={handleSuccess}
              onClose={() => setShowEdit(false)}
            />
          </div>
        </div>
      )}

      <Link to="/vendors" className="text-xs text-muted-text hover:text-light">
        ← Vendors
      </Link>

      <div className="flex flex-col gap-4 mt-3 mb-6 sm:flex-row sm:justify-between sm:items-start">
        <div className="min-w-0">
          <h1 className="text-3xl font-condensed leading-none">{vendor.name}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wide bg-plate text-amber-light px-2 py-0.5 rounded">
              {vendor.category}
            </span>
            {isChampion && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-steel bg-amber px-2 py-0.5 rounded">
                <Crown size={12} /> #1 {vendor.category}
              </span>
            )}
            {vendor.status === "inactive" && (
              <span className="text-xs text-muted-text border border-[#3b4660] px-2 py-0.5 rounded">
                Inactive
              </span>
            )}
          </div>
          {(place || vendor.service_area) && (
            <p className="text-sm text-muted-text mt-2">
              <MapPin size={13} className="inline -mt-0.5 mr-1" />
              {place}
              {vendor.service_area ? ` · serves ${vendor.service_area}` : ""}
            </p>
          )}
        </div>
        <div className="shrink-0 sm:text-right">
          <VendorRatingStamp rating={vendor.rating} />
          <div className="mt-3 flex gap-2 sm:justify-end">
            <button
              onClick={() => setShowRating(true)}
              className="bg-steel text-light px-3 py-1.5 rounded text-sm border border-[#3b4660]"
            >
              Edit rating
            </button>
            <button
              onClick={() => setShowEdit(true)}
              className="bg-steel text-light px-3 py-1.5 rounded text-sm border border-[#3b4660]"
            >
              Edit
            </button>
          </div>
        </div>
      </div>

      {hasSpend && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <Kpi
            label="Spent here"
            value={
              vendor.total_spend != null
                ? money(Number(vendor.total_spend))
                : "—"
            }
            sub="from maintenance"
          />
          <Kpi label="Services" value={String(vendor.service_count)} />
          <Kpi
            label="Last service"
            value={formatDate(vendor.last_service) ?? "—"}
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Panel className="p-4 md:col-span-2">
          <p className="text-xs text-muted-text uppercase tracking-wider mb-3">
            Rating history
          </p>
          {ratingHistory.length === 0 ? (
            <p className="text-sm text-muted-text italic px-1 py-2">
              No rating changes yet
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {ratingHistory.map((h) => (
                <div
                  key={h.id}
                  className="border-l-2 border-l-amber bg-steel/40 px-3 py-2 rounded-sm"
                >
                  <p className="text-sm">
                    <Star size={13} className="inline text-amber -mt-0.5" />{" "}
                    Rating changed{" "}
                    <span className="text-muted-text">
                      {h.old_rating ?? "—"}
                    </span>{" "}
                    → <span className="text-amber font-semibold">{h.new_rating}</span>
                  </p>
                  {h.reason && (
                    <p className="text-sm text-muted-text">{h.reason}</p>
                  )}
                  <p className="text-xs text-muted-text mt-1">
                    {formatDate(h.changed_at) ?? ""} · {h.changed_by}
                  </p>
                </div>
              ))}
            </div>
          )}

          {vendor.notes && (
            <>
              <p className="text-xs text-muted-text uppercase tracking-wider mb-2 mt-5">
                Notes
              </p>
              <p className="text-sm whitespace-pre-wrap">{vendor.notes}</p>
            </>
          )}
        </Panel>

        <Panel className="p-4">
          <p className="text-xs text-muted-text uppercase tracking-wider mb-3">
            Contact
          </p>
          {vendor.contact_name && (
            <p className="text-sm mb-2">{vendor.contact_name}</p>
          )}
          <p className="text-sm mb-2 break-words">
            <Phone size={14} className="inline text-muted-text mr-1.5 -mt-0.5" />
            {vendor.phone || "No phone"}
          </p>
          <p className="text-sm mb-2 break-words">
            <Mail size={14} className="inline text-muted-text mr-1.5 -mt-0.5" />
            {vendor.email || "No email"}
          </p>
          {vendor.website && (
            <p className="text-sm mb-2 break-words">
              <Globe size={14} className="inline text-muted-text mr-1.5 -mt-0.5" />
              {vendor.website}
            </p>
          )}
          {isShop && !hasSpend && (
            <p className="text-xs text-muted-text mt-3 pt-3 border-t border-plate">
              <Wrench size={12} className="inline -mt-0.5 mr-1" />
              No matched maintenance yet. Spend links when a service's vendor name
              matches this one.
            </p>
          )}

          <button
            onClick={handleDelete}
            disabled={deleting}
            className="mt-4 text-xs text-[#e0857a] hover:text-[#f0857a] inline-flex items-center gap-1 disabled:opacity-50"
          >
            <Trash2 size={13} /> {deleting ? "Deleting…" : "Delete vendor"}
          </button>
        </Panel>
      </div>
    </div>
  );
};

export default VendorDetailPage;
