import type { Metadata } from "next";
import { OnThisPage } from "@/components/marketing/OnThisPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Concepts — Kraterion docs",
  description:
    "The web3 ideas behind Kraterion, in plain terms: on-chain ownership, encryption by default, revocable access, durable Walrus storage, and seedless sign-in.",
};

const HEADINGS = [
  { id: "on-chain-ownership", label: "On-chain ownership", level: 2 as const },
  { id: "encrypted-by-default", label: "Encrypted by default", level: 2 as const },
  { id: "revocation", label: "Revocable access", level: 2 as const },
  { id: "walrus-persistence", label: "Durable storage", level: 2 as const },
  { id: "zklogin", label: "Seedless sign-in", level: 2 as const },
  { id: "glossary", label: "Glossary", level: 2 as const },
];

export default function Page() {
  return (
    <div className="grid grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1fr_180px]">
      <article className="max-w-[720px]">
        <p className="micro text-stone-500">Getting started</p>
        <h1 className="mt-4 text-[40px] leading-[1.1] tracking-[-0.01em]">
          Concepts
        </h1>
        <p className="mt-6 text-[18px] leading-[1.65] text-stone-700">
          Kraterion is built on three Sui technologies — Sui itself, Walrus, and
          Seal. You don&apos;t need to know any of them to use the product, but
          five ideas explain why it behaves the way it does. No blockchain
          background required.
        </p>

        <h2
          id="on-chain-ownership"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          On-chain ownership
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          On most clouds, a bucket is a row in the provider&apos;s database. On
          Kraterion, a bucket is an object that lives on the Sui blockchain, and
          that object records an owner — your account. The platform operates the
          bucket on your behalf, but it can&apos;t change who owns it. Think of it
          as the difference between renting a deposit box and holding the deed.
        </p>

        <h2
          id="encrypted-by-default"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Encrypted by default
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Every file is encrypted at the gateway before it&apos;s stored, using
          Seal. The data that lands on Walrus is ciphertext — not Kraterion&apos;s
          storage, not the storage nodes, nobody holds your plaintext at rest.
          Encryption isn&apos;t a setting you turn on; it&apos;s the default and
          only path. A bucket can be marked public, which changes who is allowed
          to decrypt — not whether the bytes were encrypted.
        </p>

        <h2 id="revocation" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Revocable access
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Because your bucket lives on-chain, so does the list of who is allowed to
          decrypt it. When you grant the platform API access, your address adds the
          gateway to that list. Revoking removes it — in a single transaction.
          After that, the gateway can no longer decrypt your files: reads, writes,
          and knowledge search all stop. This isn&apos;t Kraterion choosing to
          honor a flag in its database; the decryption keys are held by independent
          servers that check the on-chain list before handing anything over. The{" "}
          <a
            href="/docs/architecture"
            className="text-krater underline-offset-2 hover:underline"
          >
            architecture page
          </a>{" "}
          walks through exactly how that&apos;s enforced.
        </p>

        <h2
          id="walrus-persistence"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Durable storage
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          The encrypted bytes live on Walrus, a decentralized storage network where
          data is paid for by storage epochs and replicated across many nodes.
          Kraterion keeps your storage renewed so files don&apos;t lapse. Because
          the blobs are tied to your on-chain account rather than to a Kraterion
          subscription, your data&apos;s existence doesn&apos;t depend on your
          relationship with the platform continuing.
        </p>

        <h2 id="zklogin" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Seedless sign-in
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          You sign in with Google. Under the hood, zkLogin turns that login into a
          Sui account using a zero-knowledge proof — there&apos;s no seed phrase or
          wallet extension to install, and Kraterion never sees a private key you&apos;d
          have to protect. The account is yours; the login is just how you reach it.
        </p>

        <h2 id="glossary" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Glossary
        </h2>
        <ul className="mt-4 flex flex-col gap-3 text-[15px] leading-[1.7] text-stone-700">
          <li>
            <span className="text-ink">Sui</span> — the blockchain that holds your
            bucket objects and access lists.
          </li>
          <li>
            <span className="text-ink">Walrus</span> — decentralized storage for
            the encrypted file bytes (a &ldquo;blob&rdquo; is one stored file).
          </li>
          <li>
            <span className="text-ink">Seal</span> — the encryption system whose
            keys are split across independent servers and released only when an
            on-chain policy approves.
          </li>
          <li>
            <span className="text-ink">zkLogin</span> — sign in with an existing
            account (Google) and get a Sui account, no seed phrase.
          </li>
          <li>
            <span className="text-ink">Epoch</span> — Walrus&apos;s unit of storage
            time; storage is renewed before it expires.
          </li>
        </ul>
      </article>
      <div className="hidden md:block">
        <OnThisPage headings={HEADINGS} />
      </div>
    </div>
  );
}
