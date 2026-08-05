import { useState } from "react";
import type { Vendor } from "@/types/vendor";
import type { CreateVendorInput } from "@/types/createVendorInput";
import type { VendorPatchPayload } from "@/types/vendorPatchPayload";
import { createVendor } from "@/services/createVendorService";
import { patchVendor } from "@/services/patchVendorService";
import { VENDOR_CATEGORIES } from "@/lib/constants/vendorCategories";
import { VENDOR_RATING_OPTIONS } from "@/lib/metrics/vendorRatingLabels";
import { Field, SelectControl } from "@/components/ui/FormControls";
import CityAutocomplete from "@/components/CityAutocomplete";

interface VendorFormProps {
  vendor?: Vendor; // present → edit mode
  onSuccess: (v: Vendor) => void;
  onClose: () => void;
}

// Create or edit a vendor's core fields. Rating is offered ONLY on create (an
// initial grade needs no audit); once a vendor exists, rating changes go through
// VendorRatingForm so the reason + history are enforced.
const VendorForm = ({ vendor, onSuccess, onClose }: VendorFormProps) => {
  const isEdit = !!vendor;

  const [name, setName] = useState(vendor?.name ?? "");
  const [category, setCategory] = useState(vendor?.category ?? "");
  const [rating, setRating] = useState<number | null>(vendor?.rating ?? null);
  const [contactName, setContactName] = useState(vendor?.contact_name ?? "");
  const [phone, setPhone] = useState(vendor?.phone ?? "");
  const [email, setEmail] = useState(vendor?.email ?? "");
  const [website, setWebsite] = useState(vendor?.website ?? "");
  const [city, setCity] = useState(vendor?.city ?? "");
  const [stateVal, setStateVal] = useState(vendor?.state ?? "");
  const [serviceArea, setServiceArea] = useState(vendor?.service_area ?? "");
  const [status, setStatus] = useState(vendor?.status ?? "active");
  const [notes, setNotes] = useState(vendor?.notes ?? "");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Required";
    if (!category) e.category = "Pick a category";
    if (email.trim() && (!email.includes("@") || !email.includes(".")))
      e.email = "Not a valid email";
    if (stateVal.trim() && stateVal.trim().length !== 2)
      e.state = "Use the 2-letter state";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!validate()) return;

    const clean = (s: string) => (s.trim() ? s.trim() : null);

    try {
      setSaving(true);
      let saved: Vendor;
      if (isEdit) {
        const payload: VendorPatchPayload = {
          name: name.trim(),
          category,
          contact_name: clean(contactName),
          phone: clean(phone),
          email: clean(email),
          website: clean(website),
          city: clean(city),
          state: clean(stateVal)?.toUpperCase() ?? null,
          service_area: clean(serviceArea),
          status,
          notes: clean(notes),
        };
        saved = await patchVendor(vendor!.vendor_id, payload);
      } else {
        const payload: CreateVendorInput = {
          name: name.trim(),
          category,
          rating: rating ?? null,
          contact_name: clean(contactName),
          phone: clean(phone),
          email: clean(email),
          website: clean(website),
          city: clean(city),
          state: clean(stateVal)?.toUpperCase() ?? null,
          service_area: clean(serviceArea),
          notes: clean(notes),
        };
        saved = await createVendor(payload);
      }
      onSuccess(saved);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save vendor");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="font-body">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-light">
          {isEdit ? "Edit vendor" : "New vendor"}
        </h2>
        <button
          onClick={onClose}
          className="text-muted-text hover:text-light"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="v-name" error={errors.name} className="sm:col-span-2">
          <input
            id="v-name"
            className="ds-input"
            placeholder="Lone Star Pilot Cars"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="Category" htmlFor="v-cat" error={errors.category}>
          <SelectControl
            id="v-cat"
            invalid={!!errors.category}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="" disabled>
              Select a category
            </option>
            {VENDOR_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectControl>
        </Field>

        {isEdit ? (
          <Field label="Status" htmlFor="v-status">
            <SelectControl
              id="v-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </SelectControl>
          </Field>
        ) : (
          <Field label="Rating" htmlFor="v-rating" hint="· optional">
            <SelectControl
              id="v-rating"
              value={rating === null ? "" : String(rating)}
              onChange={(e) =>
                setRating(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">Unrated</option>
              {VENDOR_RATING_OPTIONS.map((o) => (
                <option key={o.value} value={String(o.value)}>
                  {o.label}
                </option>
              ))}
            </SelectControl>
          </Field>
        )}

        <Field label="Contact" htmlFor="v-contact">
          <input
            id="v-contact"
            className="ds-input"
            placeholder="Maria Lopez"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
        </Field>

        <Field label="Phone" htmlFor="v-phone">
          <input
            id="v-phone"
            className="ds-input"
            placeholder="(956) 555-0142"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>

        <Field label="Email" htmlFor="v-email" error={errors.email}>
          <input
            id="v-email"
            className="ds-input"
            placeholder="dispatch@vendor.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Website" htmlFor="v-web">
          <input
            id="v-web"
            className="ds-input"
            placeholder="lonestarpilot.com"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </Field>

        <Field label="City" htmlFor="v-city" hint="· fills state">
          <CityAutocomplete
            id="v-city"
            value={city}
            onType={setCity}
            onSelect={(c, s) => {
              setCity(c);
              setStateVal(s);
            }}
            inputClassName="ds-input"
            placeholder="Laredo"
          />
        </Field>

        <Field label="State" htmlFor="v-state" error={errors.state}>
          <input
            id="v-state"
            className="ds-input"
            placeholder="TX"
            maxLength={2}
            value={stateVal}
            onChange={(e) => setStateVal(e.target.value.toUpperCase())}
          />
        </Field>

        <Field
          label="Service area"
          htmlFor="v-area"
          hint="· where they cover"
          className="sm:col-span-2"
        >
          <input
            id="v-area"
            className="ds-input"
            placeholder="TX · OK · NM"
            value={serviceArea}
            onChange={(e) => setServiceArea(e.target.value)}
          />
        </Field>

        <Field label="Notes" htmlFor="v-notes" className="sm:col-span-2">
          <textarea
            id="v-notes"
            className="ds-input"
            style={{ minHeight: 72, paddingTop: 8 }}
            placeholder="Great on the I-10 permit runs; slow to invoice."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>

      {formError && <p className="text-destructive text-sm mt-3">{formError}</p>}

      <div className="flex gap-2 justify-end mt-5">
        <button
          onClick={onClose}
          disabled={saving}
          className="px-3 py-2 rounded text-sm border border-[#3b4660] text-light disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="bg-amber text-steel px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : isEdit ? "Save changes" : "Add vendor"}
        </button>
      </div>
    </div>
  );
};

export default VendorForm;
