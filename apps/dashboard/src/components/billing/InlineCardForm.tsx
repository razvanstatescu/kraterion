"use client";

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import { env } from "@/lib/env";
import { useCreateSetupIntent } from "@/lib/queries";

/**
 * Inline card collection. Vercel / Supabase shape — the Stripe iframe
 * lives inside our `<PaymentMethodCard />`, no redirect.
 *
 * Flow:
 *
 *   1. On mount, POST `/v1/billing/setup-intent` to get a
 *      `client_secret` (creates the Stripe Customer if it doesn't
 *      exist yet).
 *   2. Mount `<Elements>` with `appearance: { theme: 'stripe' }` and
 *      our tokens; tinting matches the design system.
 *   3. `<PaymentElement />` renders Stripe's hosted card form.
 *   4. Submit → `stripe.confirmSetup(... redirect: 'if_required')`.
 *      Card is attached to the Customer; Stripe fires
 *      `setup_intent.succeeded`; our webhook flips
 *      `has_payment_method` + creates the subscription.
 *   5. Local refetch waits 2s (webhook is fast in sandbox) then
 *      invalidates `useBillingAccount`. The card swaps to
 *      "Card on file" without a reload.
 */
interface Props {
  projectId: string;
  onCancel: () => void;
}

// Loader is module-scoped per Stripe's docs — calling loadStripe on
// every render leaks Stripe.js instances. Keyed by publishable key so
// switching networks during dev doesn't reuse the wrong loader.
const stripeLoaderCache = new Map<string, Promise<Stripe | null>>();
function getStripeLoader(pk: string) {
  let loader = stripeLoaderCache.get(pk);
  if (!loader) {
    loader = loadStripe(pk);
    stripeLoaderCache.set(pk, loader);
  }
  return loader;
}

export function InlineCardForm({ projectId, onCancel }: Props) {
  const createIntent = useCreateSetupIntent(projectId);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [intentError, setIntentError] = useState<string | null>(null);

  // Mint a SetupIntent exactly once when the form mounts. The CP
  // endpoint is itself idempotent (bucketed per ~17 min) so a strict-
  // mode double-mount is safe.
  useEffect(() => {
    let cancelled = false;
    createIntent
      .mutateAsync()
      .then((res) => {
        if (!cancelled) setClientSecret(res.client_secret);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ControlPlaneError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Couldn't start a card session.";
        setIntentError(message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const stripePromise = useMemo(() => {
    try {
      return getStripeLoader(env.getStripePublishableKey());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Stripe key missing.";
      setIntentError(message);
      return null;
    }
  }, []);

  if (intentError) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Banner
          tone="error"
          title="Couldn't start the card session"
          body={intentError}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" onClick={onCancel}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  if (!clientSecret || !stripePromise) {
    return (
      <div className="muted" style={{ fontSize: 13, padding: 12 }}>
        Loading secure card form…
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          // Match the Kraterion design system — sentence case labels,
          // hairline borders, no shadows. Stripe Elements gives us a
          // small token surface, so we tune what we can.
          theme: "stripe",
          variables: {
            colorPrimary: "#bf4a26",
            colorBackground: "#ffffff",
            colorText: "#1c1c1a",
            colorDanger: "#a83328",
            fontFamily:
              'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
            fontSizeBase: "14px",
            borderRadius: "4px",
            spacingUnit: "4px",
          },
          rules: {
            ".Input": {
              border: "1px solid #d7d3cb",
              boxShadow: "none",
              padding: "10px 12px",
            },
            ".Input:focus": {
              borderColor: "#bf4a26",
              boxShadow: "none",
            },
            ".Label": {
              fontWeight: "500",
              fontSize: "12px",
              color: "#5b574f",
              textTransform: "none",
            },
          },
        },
      }}
    >
      <InnerForm onCancel={onCancel} />
    </Elements>
  );
}

function InnerForm({ onCancel }: { onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const { show } = useToast();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        // Stay on /billing on success. `redirect: 'if_required'` keeps
        // the user here for card brands that don't need 3DS; redirects
        // only when the bank demands SCA.
        confirmParams: {
          return_url:
            typeof window !== "undefined"
              ? `${window.location.origin}/billing?setup=ok`
              : "https://dashboard.kraterion.com/billing?setup=ok",
        },
        redirect: "if_required",
      });
      if (error) {
        show({
          tone: "error",
          title: "Card couldn't be saved",
          body: error.message ?? "Try a different card or check your details.",
        });
        return;
      }
      if (setupIntent?.status === "succeeded") {
        show({
          tone: "success",
          title: "Card saved",
          body: "Setting up your subscription — this takes a few seconds.",
        });
        // Webhook is fast in sandbox (~1s); give the CP time to flip
        // has_payment_method then refetch.
        await new Promise((r) => setTimeout(r, 2000));
        await queryClient.invalidateQueries({
          queryKey: ["v1", "billing", "account"],
        });
        await queryClient.invalidateQueries({
          queryKey: ["v1", "billing", "storage"],
        });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Card setup failed.";
      show({ tone: "error", title: "Couldn't save card", body: message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>
      <PaymentElement
        options={{
          layout: "tabs",
          // Keep the form lean — we don't need billing-address fields
          // here (those live on /billing details card).
          fields: { billingDetails: "auto" },
        }}
      />
      <div className="muted" style={{ fontSize: 12 }}>
        We don't store card details on our servers. Stripe holds the
        card; we only see the brand and last four digits.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button type="submit" disabled={!stripe || submitting}>
          {submitting ? "Saving card…" : "Save card"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
