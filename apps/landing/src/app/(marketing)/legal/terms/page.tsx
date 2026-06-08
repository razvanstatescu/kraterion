import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/marketing/LegalPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Terms — Kraterion",
  description:
    "Plain-language terms for using Kraterion during private beta. The service is provided as-is while we finalize full terms with counsel.",
};

export default function Page() {
  return (
    <LegalPage
      title="Terms"
      updated="June 2026"
      summary="The short version: use Kraterion responsibly and lawfully; your data stays yours; and during private beta the service is provided as-is while we finalize full terms."
    >
      <LegalSection heading="Private beta">
        <p>
          Kraterion is offered as a private beta. Features may change, and the
          service is provided on an &quot;as-is&quot; basis without warranties while
          we finalize formal terms. We&apos;ll give reasonable notice of material
          changes.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>
          Don&apos;t use Kraterion to break the law, infringe others&apos; rights,
          or store content you have no right to store. You&apos;re responsible for
          the data you upload and the agents you run.
        </p>
      </LegalSection>

      <LegalSection heading="Your data is yours">
        <p>
          You retain ownership of your content. We access it only to operate the
          service, and only while your on-chain bucket grants that access — which
          you can revoke at any time. See our{" "}
          <a href="/legal/privacy" className="text-krater underline-offset-2 hover:underline">
            privacy summary
          </a>{" "}
          for how data is handled.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          For a signed agreement or questions about these terms, write to{" "}
          <a href="mailto:legal@kraterion.com" className="text-krater underline-offset-2 hover:underline">
            legal@kraterion.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
