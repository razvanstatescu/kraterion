"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import type { BillingAccountJson } from "@/lib/api";
import { useUpdateBillingDetails } from "@/lib/queries";
import { COUNTRIES } from "./countries";

/**
 * Billing email, tax id, country card.
 *
 * Local fields; the Stripe Customer object is updated by the
 * Customer Portal (linked from the card). We keep these in our DB so
 * the invoice export script + admin views don't need a Stripe
 * round-trip.
 *
 * Stripe Tax registration, locale-specific validation, and VAT
 * lookups all live in the Portal — the "Manage tax details" link
 * surfaces that surface.
 */
interface Props {
  projectId: string;
  account: BillingAccountJson | null;
}

export function BillingDetailsCard({ projectId, account }: Props) {
  const update = useUpdateBillingDetails(projectId);
  const { show } = useToast();

  const [email, setEmail] = useState(account?.billing_email ?? "");
  const [country, setCountry] = useState(account?.country ?? "");
  const [taxId, setTaxId] = useState("");

  useEffect(() => {
    setEmail(account?.billing_email ?? "");
    setCountry(account?.country ?? "");
  }, [account?.billing_email, account?.country]);

  const onSave = async () => {
    try {
      const payload: {
        billing_email?: string | null;
        country?: string | null;
        tax_id?: string | null;
      } = {};
      if (email !== (account?.billing_email ?? "")) {
        payload.billing_email = email.trim() === "" ? null : email.trim();
      }
      if (country !== (account?.country ?? "")) {
        payload.country = country.trim() === "" ? null : country.trim().toUpperCase();
      }
      if (taxId.trim() !== "") {
        payload.tax_id = taxId.trim();
      }
      if (Object.keys(payload).length === 0) {
        show({
          tone: "info",
          title: "Nothing to save",
          body: "No changes detected.",
        });
        return;
      }
      await update.mutateAsync(payload);
      setTaxId("");
      show({
        tone: "success",
        title: "Billing details saved",
        body: "Invoices will use the new details from the next cycle.",
      });
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Save failed.";
      show({ tone: "error", title: "Couldn't save", body: message });
    }
  };

  return (
    <section className="ks-card">
      <div className="ks-card-head">
        <div>
          <div className="ks-card-title">Billing details</div>
          <div className="ks-card-sub">
            Where receipts and invoices go. Tax registration and VAT
            validation live in the Stripe portal.
          </div>
        </div>
      </div>
      <div
        className="ks-card-body"
        style={{ display: "grid", gap: 16, maxWidth: 480 }}
      >
        <FormField label="Billing email" htmlFor="billing-email">
          <Input
            id="billing-email"
            type="email"
            placeholder="finance@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormField>
        <FormField
          label="Country"
          htmlFor="billing-country"
          helper="Used on invoices and to set the default tax jurisdiction."
        >
          <select
            id="billing-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="input"
            style={{
              cursor: "pointer",
              backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%237C7158' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='4,6 8,10 12,6'/></svg>")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 10px center",
              backgroundSize: "14px",
              appearance: "none",
              WebkitAppearance: "none",
              paddingRight: 32,
            }}
          >
            <option value="">Select a country…</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          label="Tax ID"
          htmlFor="billing-tax-id"
          helper="VAT / GST / EIN. Manage validated tax registrations in Stripe."
        >
          <Input
            id="billing-tax-id"
            placeholder="DE123456789"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
          />
        </FormField>
        <div>
          <Button onClick={onSave} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save details"}
          </Button>
        </div>
      </div>
    </section>
  );
}
