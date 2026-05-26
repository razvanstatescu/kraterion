type Tier = {
  id: string;
  name: string;
  price: string;
  period: string;
  headline: string;
  features: readonly string[];
  cta: string;
  highlight?: boolean;
};

export const TIERS: readonly Tier[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    headline: "Personal projects",
    features: [
      "500 MB storage",
      "1 bucket",
      "S3 API",
      "No card required",
    ],
    cta: "Start free",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$15",
    period: "/ month",
    headline: "For teams shipping",
    features: [
      "1 TB storage",
      "Unlimited buckets",
      "Knowledge layer",
      "Agents (5 endpoints)",
      "Embed widget",
    ],
    cta: "Start Pro",
    highlight: true,
  },
  {
    id: "scale",
    name: "Scale",
    price: "$199",
    period: "/ month",
    headline: "Production workloads",
    features: [
      "10 TB storage",
      "Custom regions",
      "Higher metered budgets",
      "Audit log retention",
      "Email support",
    ],
    cta: "Start Scale",
  },
];
