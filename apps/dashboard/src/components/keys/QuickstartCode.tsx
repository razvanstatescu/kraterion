"use client";

import { TabbedCode } from "@/components/ui/TabbedCode";
import { env } from "@/lib/env";

interface Props {
  /** AKIA-style access key id. */
  accessKeyId: string;
  /** Cleartext secret. Pass `null` to render snippets with a placeholder
   *  (used on the keys list where the secret isn't available). */
  secret: string | null;
  /** Optional bucket name — when provided, snippets reference it in
   *  examples; otherwise they use `<your-bucket>`. */
  bucketName?: string | undefined;
}

const TABS = ["boto3", "aws-cli", "rclone"] as const;

/**
 * Renders the three canonical S3-client quickstart snippets with the
 * caller's credentials prefilled. The TabbedCode component already
 * handles a "Copy" button — we just have to make sure the snippet text
 * itself is what the user wants on their clipboard.
 *
 * No tracking, no analytics, no telemetry. The dashboard is the only
 * one that ever sees this secret in plain text and it drops it from
 * memory as soon as the parent unmounts.
 */
export function QuickstartCode({ accessKeyId, secret, bucketName }: Props) {
  const endpoint = env.gatewayUrl;
  const region = "eu-central-1";
  const bucket = bucketName ?? "<your-bucket>";
  const secretDisplay = secret ?? "<your-secret-shown-once-at-creation>";

  const snippet = (active: string): string => {
    switch (active) {
      case "boto3":
        return `# Python (boto3)
import boto3
from botocore.config import Config

s3 = boto3.client(
    "s3",
    endpoint_url="${endpoint}",
    aws_access_key_id="${accessKeyId}",
    aws_secret_access_key="${secretDisplay}",
    region_name="${region}",
    config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
)

# List your buckets
print(s3.list_buckets())

# Upload a file
s3.upload_file("local.txt", "${bucket}", "remote.txt")`;

      case "aws-cli":
        return `# AWS CLI v2
export AWS_ACCESS_KEY_ID="${accessKeyId}"
export AWS_SECRET_ACCESS_KEY="${secretDisplay}"
export AWS_DEFAULT_REGION="${region}"

# List buckets
aws --endpoint-url ${endpoint} s3 ls

# Upload a file
aws --endpoint-url ${endpoint} s3 cp ./local.txt s3://${bucket}/remote.txt

# Download
aws --endpoint-url ${endpoint} s3 cp s3://${bucket}/remote.txt ./local.txt`;

      case "rclone":
        return `# rclone — add to ~/.config/rclone/rclone.conf
[kraterion]
type = s3
provider = Other
access_key_id = ${accessKeyId}
secret_access_key = ${secretDisplay}
endpoint = ${endpoint}
region = ${region}
force_path_style = true

# Then, from the shell:
rclone ls kraterion:${bucket}
rclone copy ./local-dir kraterion:${bucket}/remote-dir`;

      default:
        return "";
    }
  };

  return (
    <TabbedCode tabs={[...TABS]} initial="boto3">
      {(active) => snippet(active)}
    </TabbedCode>
  );
}
