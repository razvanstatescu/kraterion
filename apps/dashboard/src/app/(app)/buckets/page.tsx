"use client";

import { useState } from "react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { BucketsList } from "@/components/buckets/BucketsList";
import { CreateBucketDialog } from "@/components/buckets/CreateBucketDialog";
import { Topbar } from "@/components/shell/Topbar";
import { Button } from "@/components/ui/Button";

export default function BucketsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <>
      <Topbar
        crumbs={[{ label: "Buckets" }]}
        actions={
          <>
            <Button variant="cta" icon="plus" onClick={() => setCreateOpen(true)}>
              New bucket
            </Button>
            <SignOutButton />
          </>
        }
      />
      <main className="ks-screen">
        <div className="ks-screen-head">
          <div>
            <h1>Buckets</h1>
            <p className="lead">
              S3-compatible buckets, owned on Sui and stored on Walrus.
            </p>
          </div>
        </div>
        <BucketsList />
      </main>
      <CreateBucketDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
