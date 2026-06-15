# Encryption & Ownership

The ideas that make Kraterion different from an ordinary cloud bucket. You don't
need any blockchain background to use the product, but these five concepts
explain why it behaves the way it does. Kraterion is built on three Sui
technologies: **Sui** (the blockchain), **Walrus** (decentralized storage), and
**Seal** (encryption).

## On-chain ownership

On most clouds, a bucket is a row in the provider's database. On Kraterion, a
bucket is an **object that lives on the Sui blockchain**, and that object records
an owner — your account. The platform operates the bucket on your behalf, but it
can't change who owns it. It's the difference between renting a deposit box and
holding the deed.

## Encrypted by default

Every file is **encrypted at the gateway before it's stored**, using Seal. The
data that lands on Walrus is ciphertext — not Kraterion's storage, not the
storage nodes, nobody holds your plaintext at rest. Encryption isn't a setting
you turn on; it's the default and only path.

A bucket can be marked **public**, which changes *who is allowed to decrypt* — not
whether the bytes were encrypted. Encryption happens either way.

## Revocable access

Because your bucket lives on-chain, so does the **list of who is allowed to
decrypt it**. When you grant the platform API access, your address adds the
gateway to that list. Revoking removes it — in a single transaction. After that,
the gateway can no longer decrypt your files: reads, writes, and knowledge search
all stop.

This isn't Kraterion choosing to honor a flag in its own database. The decryption
keys are held by **independent Seal key servers** that check the on-chain access
list before handing anything over. If your address isn't on the list, no key is
released, and the ciphertext stays sealed.

When access has been revoked, the S3 API returns the Kraterion-specific error
code `KeyAccessRevoked` on reads and writes.

## Durable storage

The encrypted bytes live on **Walrus**, a decentralized storage network where
data is paid for in *storage epochs* and replicated across many nodes. Kraterion
keeps your storage renewed so files don't lapse. Because the blobs are tied to
your on-chain account rather than to a Kraterion subscription, your data's
existence doesn't depend on your relationship with the platform continuing — the
objects are content-addressed in the underlying network, so they can even be
pulled directly without going through Kraterion.

## Seedless sign-in

You sign in with Google. Under the hood, **zkLogin** turns that login into a Sui
account using a zero-knowledge proof — there's no seed phrase or wallet extension
to install, and Kraterion never sees a private key you'd have to protect. The
account is yours; the login is just how you reach it.

## Glossary

- **Sui** — the blockchain that holds your bucket objects and access lists.
- **Walrus** — decentralized storage for the encrypted file bytes (a "blob" is
  one stored file).
- **Seal** — the encryption system whose keys are split across independent
  servers and released only when an on-chain policy approves.
- **zkLogin** — sign in with an existing account (Google) and get a Sui account,
  no seed phrase.
- **Epoch** — Walrus's unit of storage time; storage is renewed before it
  expires.

## Common questions

**Can Kraterion read my files?** Only while you've granted it on-chain access,
and only because the independent key servers honor that on-chain grant. Revoke
the grant and decryption stops — for the platform and for any agent.

**What happens to my data if I stop using Kraterion?** Your objects remain tied
to your on-chain account and content-addressed on Walrus. You can pull every byte
with any S3 client, with no proprietary export and no exit fee beyond standard
egress.

**Is public data unencrypted?** No. Public buckets are still encrypted at rest;
"public" only changes who is allowed to decrypt and serve the bytes.
