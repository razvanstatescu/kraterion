import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/marketing/LegalPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Privacy — Kraterion",
  description:
    "How Kraterion handles your data in private beta: encrypted by default, owned by you, deletable on request. A plain-language summary.",
};

export default function Page() {
  return (
    <LegalPage
      title="Privacy"
      updated="June 2026"
      summary="The short version: your files and the records of what your agents do are encrypted before they reach us and owned by you. We can't read sealed content, and you can revoke our access or delete your data at any time."
    >
      <LegalSection heading="What we collect">
        <p>
          Account details when you sign in (your email via Google sign-in),
          billing information to meter usage, and operational usage data (storage,
          requests, and run records) needed to run the service and bill you.
        </p>
        <p>
          The content you store — files, knowledge bases, agent run records, and
          memory — is encrypted before it leaves you. The platform holds
          ciphertext only and cannot read sealed content.
        </p>
      </LegalSection>

      <LegalSection heading="Where it lives">
        <p>
          Your data is stored on a decentralized storage network and addressed to
          your account, in a region you control. Standard infrastructure (hosting,
          billing, email) is provided by third-party subprocessors; a current
          subprocessor list is available on request.
        </p>
      </LegalSection>

      <LegalSection heading="Your control">
        <p>
          You own your data and can export it at any time with any S3-compatible
          client. You can restrict the platform&apos;s access in a single step, and
          erase data by destroying its key — cryptographic erasure recognized by EU
          data-protection authorities.
        </p>
        <p>
          To exercise data-subject rights (access, export, erasure) or request our
          data processing agreement (DPA), contact{" "}
          <a href="mailto:security@kraterion.com" className="text-krater underline-offset-2 hover:underline">
            security@kraterion.com
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about privacy or this summary? Write to{" "}
          <a href="mailto:legal@kraterion.com" className="text-krater underline-offset-2 hover:underline">
            legal@kraterion.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
