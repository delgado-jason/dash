import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { SidebarTrigger } from "@/components/ui/sidebar";

import { useVendor } from "@/hooks/useVendor";
import { deleteVendor } from "@/services/deleteVendorService";
import { serviceAreaStates } from "@/lib/metrics/vendorLeaderboard";

import VendorRatingForm from "@/components/vendors/VendorRatingForm";
import VendorForm from "@/components/vendors/VendorForm";
import { VendorPips } from "@/components/vendors/VendorPips";
import { VendorTrustTag } from "@/components/vendors/VendorTrustTag";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCardsSkeleton, BlockSkeleton } from "@/components/ui/PageSkeletons";
import { money, formatDate } from "@/lib/format";

const CALL_ICON = (
  <svg viewBox="0 0 24 24" className="w-[13px] h-[13px] fill-current shrink-0" aria-hidden>
    <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z" />
  </svg>
);

const PlateLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
    {children}
  </p>
);

const VendorDetailPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [showRating, setShowRating] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  const { vendor, ratingHistory, isLoading, error } = useVendor(refreshKey);

  if (isLoading)
    return (
      <div className="p-6 text-ink font-body min-h-screen">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-32 mb-6" />
        <StatCardsSkeleton count={3} />
        <BlockSkeleton className="h-56 mt-6" />
      </div>
    );
  if (error)
    return (
      <div className="p-6 text-ink font-body min-h-screen">
        <p className="text-destructive">{error}</p>
      </div>
    );
  if (!vendor) return null;

  // Backend gates which categories can match maintenance spend
  // (Shop/Tires/Parts/Towing/Washout); Shop keeps the "nothing matched yet" hint.
  const isShop = vendor.category === "Shop";
  const hasSpend = !!vendor.service_count && vendor.service_count > 0;
  const place = [vendor.city, vendor.state].filter(Boolean).join(", ");
  const states = serviceAreaStates(vendor.service_area);

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
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        {showRating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowRating(false)} />
            <div className="relative w-full max-w-[450px] mx-4 max-h-[90vh] bg-canvas text-ink overflow-y-auto shadow-xl rounded-[12px] p-4 sm:p-6 border border-hairline">
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
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowEdit(false)} />
            <div className="relative w-full max-w-[640px] mx-4 max-h-[90vh] bg-canvas text-ink overflow-y-auto shadow-xl rounded-[12px] p-4 sm:p-6 border border-hairline">
              <VendorForm vendor={vendor} onSuccess={handleSuccess} onClose={() => setShowEdit(false)} />
            </div>
          </div>
        )}

        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">VENDORS</h1>
          <Link
            to="/vendors"
            className="font-condensed font-medium text-[15px] text-faint hover:text-ink"
          >
            ← back to the rolodex
          </Link>
        </div>

        <div className="flex items-baseline gap-[14px] flex-wrap mt-[18px]">
          <h2 className="font-display text-[34px] tracking-[.04em] leading-none">
            {vendor.name.toUpperCase()}
          </h2>
          <span className="font-condensed font-semibold text-[13px] tracking-[.12em] text-faint uppercase">
            {vendor.category}
            {place ? ` · ${place}` : ""}
          </span>
          <VendorTrustTag rating={vendor.rating} />
          {vendor.status === "inactive" && (
            <span className="font-condensed font-medium text-[10.5px] tracking-[.1em] text-faint border border-hairline rounded-[4px] px-[6px] py-[1px]">
              INACTIVE
            </span>
          )}
          <span className="ml-auto">
            <VendorPips rating={vendor.rating} />
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-[14px] mt-4">
          <div className="ds2-board p-4">
            <PlateLabel>Contact</PlateLabel>
            <p className="font-condensed font-semibold text-[19px] mt-2">
              {vendor.contact_name || "—"}
            </p>
            {vendor.phone && (
              <p className="font-condensed text-[15px] text-dim mt-[2px] tabular-nums">
                {vendor.phone}
              </p>
            )}
            {vendor.email && (
              <p className="font-condensed text-[14px] text-dim mt-[2px] break-words">
                {vendor.email}
              </p>
            )}
            {vendor.website && (
              <p className="font-condensed text-[14px] text-dim mt-[2px] break-words">
                {vendor.website}
              </p>
            )}
            {states.length > 0 && (
              <p className="font-condensed text-[13px] text-dim mt-2 flex items-center gap-2 flex-wrap">
                Covers
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
              </p>
            )}
            <div className="mt-[14px] flex gap-[10px] flex-wrap">
              {vendor.phone && (
                <a
                  href={`tel:${vendor.phone.replace(/[^+\d]/g, "")}`}
                  className="inline-flex items-center gap-[7px] h-10 px-[18px] rounded-[9px] font-condensed font-semibold text-[14.5px] text-amber-hi bg-well border border-amber/35"
                  style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,.5)" }}
                >
                  {CALL_ICON}
                  CALL
                </a>
              )}
              <button
                onClick={() => setShowEdit(true)}
                className="inline-flex items-center h-10 px-[18px] rounded-[9px] font-condensed font-semibold text-[14.5px] text-dim bg-well border border-hairline"
                style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,.5)" }}
              >
                EDIT
              </button>
            </div>
          </div>

          <div className="ds2-board p-4">
            <PlateLabel>Your notes — why the rating</PlateLabel>
            {vendor.notes ? (
              <div
                className="bg-well border border-hairline-lo rounded-[10px] px-[14px] py-[13px] mt-[10px]"
                style={{ boxShadow: "inset 0 2px 6px rgba(0,0,0,.45)" }}
              >
                <p className="text-[14px] leading-[1.55] italic whitespace-pre-wrap">
                  "{vendor.notes}"
                </p>
              </div>
            ) : (
              <p className="font-condensed text-[13px] text-faint border border-dashed border-hairline rounded-[8px] px-3 py-[10px] mt-[10px]">
                No notes yet. What you write here is what you'll wish you remembered
                next time you're booking.
              </p>
            )}
          </div>
        </div>

        {(hasSpend || isShop) && (
          <div className="ds2-board p-4 mt-[14px]">
            <PlateLabel>Maintenance spend — from the log</PlateLabel>
            {hasSpend ? (
              <div className="flex items-baseline gap-x-8 gap-y-2 flex-wrap mt-2">
                <span className="font-condensed font-semibold text-[24px] tabular-nums">
                  {vendor.total_spend != null ? money(Number(vendor.total_spend)) : "—"}
                  <span className="text-[13px] text-faint font-medium"> spent here</span>
                </span>
                <span className="font-condensed font-semibold text-[24px] tabular-nums">
                  {vendor.service_count}
                  <span className="text-[13px] text-faint font-medium">
                    {" "}
                    service{vendor.service_count === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="font-condensed font-semibold text-[24px] tabular-nums">
                  {formatDate(vendor.last_service) ?? "—"}
                  <span className="text-[13px] text-faint font-medium"> last in</span>
                </span>
              </div>
            ) : (
              <p className="font-condensed text-[13px] text-faint border border-dashed border-hairline rounded-[8px] px-3 py-[10px] mt-[10px]">
                No matched maintenance yet. Spend links when a service's vendor name
                matches this one exactly.
              </p>
            )}
          </div>
        )}

        <div className="ds2-board p-4 mt-[14px]">
          <PlateLabel>Tempering log — every rating change, with the why</PlateLabel>
          {ratingHistory.length === 0 ? (
            <p className="font-condensed text-[13px] text-faint border border-dashed border-hairline rounded-[8px] px-3 py-[10px] mt-[10px]">
              No re-rates yet. When you change a rating, it lands here: old → new,
              the date, and the reason — so a year from now you know exactly why
              they earned it.
            </p>
          ) : (
            <div className="mt-[6px]">
              {ratingHistory.map((h) => (
                <div
                  key={h.id}
                  className="flex items-baseline gap-x-[10px] gap-y-1 flex-wrap py-[9px] border-t ds2-cell-rule first:border-t-0"
                >
                  <span className="font-condensed font-semibold text-[15px] tabular-nums">
                    <span className="text-faint">{h.old_rating ?? "—"}</span>
                    <span className="text-dim"> → </span>
                    <span className="text-amber-hi">{h.new_rating}</span>
                  </span>
                  <span className="font-condensed text-[13px] text-dim">
                    {formatDate(h.changed_at) ?? ""} · {h.changed_by}
                  </span>
                  {h.reason && (
                    <span className="text-[13px] text-faint italic min-w-0">— "{h.reason}"</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowRating(true)}
            className="mt-3 h-[34px] px-[14px] rounded-[9px] font-condensed font-semibold text-[13.5px] tracking-[.04em] text-canvas"
            style={{
              background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))",
              boxShadow: "0 4px 10px rgba(232,148,10,.25)",
            }}
          >
            RE-RATE — SAY WHY
          </button>
        </div>

        <div className="flex justify-end mt-5">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="font-condensed font-semibold text-[12.5px] tracking-[.08em] text-[#e05252]/80 hover:text-[#e05252] disabled:opacity-50"
          >
            {deleting ? "DELETING…" : "DELETE VENDOR"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VendorDetailPage;
