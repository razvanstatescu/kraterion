import type { Metadata } from "next";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { OnThisPage } from "@/components/marketing/OnThisPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Architecture — Kraterion docs",
  description:
    "How Kraterion works underneath: on-chain bucket ownership on Sui, Seal envelope encryption gated by a Move policy, Walrus storage, and cryptographic revocation.",
};

const HEADINGS = [
  { id: "ownership-model", label: "Ownership model", level: 2 as const },
  { id: "seal-encryption", label: "Seal encryption", level: 2 as const },
  { id: "seal-approve-policy", label: "The approval policy", level: 2 as const },
  { id: "walrus-storage", label: "Walrus storage", level: 2 as const },
  { id: "pool-vaults-renewal", label: "Pools & renewal", level: 2 as const },
  { id: "revocation-guarantee", label: "The revocation guarantee", level: 2 as const },
  { id: "cancellation-persistence", label: "Cancellation persistence", level: 2 as const },
  { id: "on-chain-deployment", label: "On-chain deployment", level: 2 as const },
];

const MAINNET_PACKAGE_ID =
  "0xcd9329e9693fecbcdb1d505d537e007c08d08f77dc65094cf149bc3018ce3396";
const MAINNET_RESERVE_ID =
  "0x6759a74f0bdaf5aa245790fef85dc06bc480bcec804bf286760bf026bb8ff132";

export default function Page() {
  return (
    <div className="grid grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1fr_180px]">
      <article className="max-w-[720px]">
        <p className="micro text-stone-500">How it works</p>
        <h1 className="mt-4 text-[40px] leading-[1.1] tracking-[-0.01em]">
          Architecture
        </h1>
        <p className="mt-6 text-[18px] leading-[1.65] text-stone-700">
          Three Sui technologies do real work together: Sui holds ownership and
          access policy, Seal handles encryption, and Walrus stores the bytes. This
          is what lets Kraterion make a promise a normal cloud can&apos;t — that it
          cannot read your files once you say so.
        </p>

        <h2
          id="ownership-model"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Ownership model
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Each bucket is a Sui shared object,{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            KraterionBucket
          </code>
          . It records an{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            owner
          </code>{" "}
          (your account), a visibility mode, and a list of addresses allowed to
          decrypt — its{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            api_decryption_addresses
          </code>
          . Creating a bucket sets the owner to whoever signs, which is why bucket
          creation needs your zkLogin signature and can&apos;t happen over the
          anonymous S3 path.
        </p>

        <h2
          id="seal-encryption"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Seal encryption
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          When you upload, the gateway encrypts the file with a fresh key and then
          seals that key with Seal — an identity-based scheme whose decryption keys
          are split across independent key servers. The identity an object is sealed
          to is derived from its bucket and object id, so a sealed key is bound to
          exactly one object in exactly one bucket. The ciphertext is what goes to
          Walrus.
        </p>

        <h2
          id="seal-approve-policy"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          The approval policy
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          To decrypt, a caller has to satisfy an on-chain policy — a Move function,{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            seal_approve
          </code>
          . The Seal key servers run it before releasing their shares. Its logic is
          small and the whole point of the system:
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "typescript",
                filename: "access.move",
                code: `// Simplified. The key servers evaluate this before
// handing over any decryption shares.
public fun seal_approve(id, bucket, ctx) {
    assert!(identity_belongs_to(id, bucket));
    if (bucket.is_public()) return;          // anyone may decrypt
    let caller = ctx.sender();
    assert!(
        caller == bucket.owner
        || bucket.api_decryption_addresses.contains(caller)
    );
}`,
              },
            ]}
          />
        </div>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          For a private bucket, only the owner or an address on the decryption list
          passes. If the caller isn&apos;t on the list, the policy aborts and no
          shares are released — there&apos;s nothing to decrypt with.
        </p>

        <h2
          id="walrus-storage"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Walrus storage
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          The encrypted bytes are stored on Walrus and identified by a content
          address (the blob id). Because storage is content-addressed, the same
          blob id always refers to the same bytes — which is what makes the content
          hashes in citations meaningful. The gateway pays for storage from a
          platform reserve, so you don&apos;t handle tokens to upload a file.
        </p>

        <h2
          id="pool-vaults-renewal"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Pools &amp; renewal
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Walrus storage is paid for in epochs and would otherwise expire. Kraterion
          groups a project&apos;s blobs into a storage pool and renews the pool ahead
          of expiry, so your files stay alive without per-file babysitting. Renewal
          runs continuously in the background.
        </p>

        <h2
          id="revocation-guarantee"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          The revocation guarantee
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Revoking API access calls{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            revoke_all_api_access
          </code>{" "}
          on your bucket, which empties the decryption list on-chain. After that,
          the gateway&apos;s address no longer passes{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            seal_approve
          </code>
          , so the key servers refuse to release shares and the gateway genuinely
          cannot decrypt your files — not by policy, but by cryptography. The
          gateway also keeps a fast database flag mirroring this, so revocation
          takes effect instantly while the on-chain state is the durable,
          independently-verifiable source of truth. Your own browser session keeps
          working, because <em>you</em> are still on the list.
        </p>

        <h2
          id="cancellation-persistence"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Cancellation persistence
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          The same ownership model means cancelling Kraterion doesn&apos;t delete
          your data. The buckets are objects at your address and the blobs are
          stored under your account on Walrus; they exist independently of your
          subscription. The platform can stop serving the API, but it was never
          holding your files hostage to begin with — they remain yours, on-chain.
        </p>

        <h2
          id="on-chain-deployment"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          On-chain deployment
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Kraterion is <strong>live on Sui mainnet</strong>. Everything above —
          bucket ownership, the{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            seal_approve
          </code>{" "}
          policy, and the platform reserve — resolves against a single published
          Move package. It&apos;s public: you can read the source and every
          transaction against it on a block explorer, without trusting us.
        </p>
        <div className="mt-4 rounded-lg border border-stone-200/70 bg-stone-50 p-4 font-mono text-[13px] leading-[1.9] text-stone-700">
          <div>
            <span className="text-stone-500">package&nbsp;&nbsp;</span>
            <a
              href={`https://suiscan.xyz/mainnet/object/${MAINNET_PACKAGE_ID}`}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-ink underline decoration-stone-300 underline-offset-2 hover:decoration-krater"
            >
              {MAINNET_PACKAGE_ID}
            </a>
          </div>
          <div>
            <span className="text-stone-500">reserve&nbsp;&nbsp;</span>
            <a
              href={`https://suiscan.xyz/mainnet/object/${MAINNET_RESERVE_ID}`}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-ink underline decoration-stone-300 underline-offset-2 hover:decoration-krater"
            >
              {MAINNET_RESERVE_ID}
            </a>
          </div>
        </div>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          The package is currently unaudited — a formal review is planned before
          the platform holds significant value. Storage and Seal run against the
          Walrus and Seal mainnet networks; local development still defaults to
          testnet.
        </p>
      </article>
      <div className="hidden md:block">
        <OnThisPage headings={HEADINGS} />
      </div>
    </div>
  );
}
