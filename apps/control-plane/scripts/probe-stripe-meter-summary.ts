import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
dotenvConfig({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../..", ".env"),
});

import Stripe from "stripe";
import { METERS } from "../src/billing/catalog.js";

async function main() {
  const stripe = new Stripe(process.env["STRIPE_SECRET_KEY"]!, {
    apiVersion: "2026-04-22.dahlia",
  });
  // Fetch every Meter and list the most recent event summaries (5 / meter).
  const meters = await stripe.billing.meters.list({ limit: 100 });
  for (const m of meters.data) {
    const knownLocally = METERS.find((s) => s.event_name === m.event_name);
    if (!knownLocally) continue;
    console.log(`\n▸ ${m.event_name} (id=${m.id})`);
    // Recent events through the v1 list endpoint.
    const events = await stripe.billing.meterEvents
      .list?.({ limit: 5 } as never)
      .catch(() => null);
    if (events && "data" in events) {
      for (const ev of (events as { data: Stripe.Billing.MeterEvent[] }).data) {
        if (ev.event_name !== m.event_name) continue;
        console.log(
          `  • identifier=${ev.identifier} payload=${JSON.stringify(ev.payload)}`,
        );
      }
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
