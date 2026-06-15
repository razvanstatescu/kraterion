# S3 Buckets & Storage API

Kraterion exposes an **S3-compatible API**, so existing S3 clients — boto3, the
AWS CLI, rclone — work against it. It implements the core object operations; some
S3 surface area is intentionally left out because buckets are on-chain objects,
not database rows.

## Endpoint

The base endpoint is **`https://s3.kraterion.com`**. Use **path-style** addressing
(`s3.kraterion.com/bucket/key`) — virtual-hosted style isn't supported yet, so
point your client at the endpoint URL directly.

## Authentication

Requests are signed with **AWS Signature Version 4 (SigV4)**, using an S3 key (an
`AKIA…` access key id and its secret) created from the dashboard. The service in
the signing scope must be `s3`; the region is read from the scope but its value
is **ignored**, so any region works. Bearer tokens do **not** work on the storage
API — see [api-keys-and-auth.md](api-keys-and-auth.md).

```python
import boto3

s3 = boto3.client(
    "s3",
    endpoint_url="https://s3.kraterion.com",
    aws_access_key_id="AKIA...",
    aws_secret_access_key="...",
    region_name="us-east-1",  # any region; ignored by the gateway
)
```

## Supported operations

| Operation | Request | Notes |
|---|---|---|
| ListBuckets | `GET /` | List your buckets. |
| HeadBucket | `HEAD /:bucket` | Check a bucket exists. |
| DeleteBucket | `DELETE /:bucket` | Delete an empty bucket. |
| ListObjectsV2 | `GET /:bucket?list-type=2` | List objects (V2 only). |
| GetObject | `GET /:bucket/:key` | Download and decrypt an object. |
| HeadObject | `HEAD /:bucket/:key` | Object metadata without the body. |
| PutObject | `PUT /:bucket/:key` | Encrypt and store an object. |
| DeleteObject | `DELETE /:bucket/:key` | Delete an object (idempotent). |

## Not supported

A few operations return `501 NotImplemented` by design:

- **CreateBucket** — buckets are on-chain objects owned by you, so they're created
  in the dashboard with your signature, not over S3.
- **ListObjects (V1)** — use `list_objects_v2` instead.
- **Object tagging** and bucket sub-resources (versioning, lifecycle, ACL, CORS,
  and similar).

## ACL & visibility

S3 ACL headers (`x-amz-acl`, storage class, server-side encryption) are accepted
but **ignored**, so default client behavior doesn't error. Visibility is a
property of the **bucket**, not of individual objects or ACLs: a bucket is either
**private** (Seal-gated) or **public**, and you flip it in the dashboard.
Encryption happens either way — visibility only changes who is allowed to
decrypt.

## Size caps

- **PutObject** — up to **2 GiB** per object; larger uploads return
  `EntityTooLarge`.
- **GetObject** — decryption buffers the whole object, so the same 2 GiB ceiling
  applies on read.
- **User metadata** — `x-amz-meta-*` totals up to **2 KiB**.

## Public buckets

Objects in a bucket marked public are readable without signing, at:

```
GET https://s3.kraterion.com/public/:bucket/:key
```

This is the path to use for assets you want to serve openly.

## Errors

Errors come back as standard S3 XML with the usual codes (`NoSuchBucket`,
`BucketNotEmpty`, `EntityTooLarge`). One Kraterion-specific code worth knowing:
**`KeyAccessRevoked`** — returned on read or write when the bucket's API access
has been revoked on-chain (see [encryption-and-ownership.md](encryption-and-ownership.md)).

## Common questions

**How do I create a bucket?** In the dashboard (it's an on-chain object created
with your signature), not over the S3 `CreateBucket` call.

**Why is `region_name` ignored?** Kraterion reads the SigV4 scope but doesn't
route by region, so any region string is accepted. Just keep `service = s3`.

**Can I use rclone / aws-cli?** Yes — any SigV4 S3 client works with path-style
addressing against `s3.kraterion.com`.
