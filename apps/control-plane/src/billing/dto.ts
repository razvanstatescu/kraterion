import { z } from "zod";

/** Body shape for `POST /v1/billing/portal-session`. Same scoping
 *  rules as the inline setup-intent request. */
export const portalSessionSchema = z.object({
  project_id: z.string().uuid(),
  return_url: z.string().url(),
});
export type PortalSessionDto = z.infer<typeof portalSessionSchema>;

/** Body shape for `POST /v1/billing/storage/resize`. Direction
 *  (upgrade vs downgrade) is inferred by the server based on the
 *  current pool reservation; the client only states the target.
 *
 *  Quantity is in **MiB** (Stripe subscription-item quantity unit
 *  matches our 500 MB free tier). Caps at 100 TiB which is well above
 *  any sandbox testing need; lift if a real customer asks. */
export const resizeStorageSchema = z.object({
  project_id: z.string().uuid(),
  new_reserved_mb: z.number().int().min(500).max(100_000_000),
});
export type ResizeStorageDto = z.infer<typeof resizeStorageSchema>;

/** Body shape for `DELETE /v1/billing/storage/pending-downgrade`. */
export const cancelDowngradeSchema = z.object({
  project_id: z.string().uuid(),
});
export type CancelDowngradeDto = z.infer<typeof cancelDowngradeSchema>;

/** Body shape for `POST /v1/billing/setup-intent` — inline Stripe
 *  Elements card collection. Returns a `client_secret` the dashboard
 *  uses to confirm the payment method client-side. No redirect. */
export const setupIntentSchema = z.object({
  project_id: z.string().uuid(),
});
export type SetupIntentDto = z.infer<typeof setupIntentSchema>;

/** Body shape for `POST /v1/billing/cancel-subscription`. */
export const cancelSubscriptionSchema = z.object({
  project_id: z.string().uuid(),
});
export type CancelSubscriptionDto = z.infer<typeof cancelSubscriptionSchema>;

/** Body shape for `PATCH /v1/billing/spend-cap`. `hard_cap_usd_cents`
 *  can be `null` to clear the cap entirely. Alert thresholds are
 *  whole-percent integers between 1 and 100. */
export const updateSpendCapSchema = z.object({
  project_id: z.string().uuid(),
  hard_cap_usd_cents: z.number().int().min(0).nullable(),
  alert_thresholds: z
    .array(z.number().int().min(1).max(100))
    .min(0)
    .max(5)
    .optional(),
});
export type UpdateSpendCapDto = z.infer<typeof updateSpendCapSchema>;

/** Body shape for `PATCH /v1/billing/details` — billing email, tax id,
 *  country. Each field is independently optional; the server only
 *  patches the columns the caller actually provides. */
export const updateBillingDetailsSchema = z.object({
  project_id: z.string().uuid(),
  billing_email: z.string().email().nullable().optional(),
  tax_id: z.string().min(1).max(100).nullable().optional(),
  country: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/, "country must be a 2-letter ISO code")
    .nullable()
    .optional(),
});
export type UpdateBillingDetailsDto = z.infer<typeof updateBillingDetailsSchema>;
