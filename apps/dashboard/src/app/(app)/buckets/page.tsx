"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { BucketsList } from "@/components/buckets/BucketsList";
import { CreateBucketDialog } from "@/components/buckets/CreateBucketDialog";
import { OnboardingCard } from "@/components/onboarding/OnboardingCard";
import { Topbar } from "@/components/shell/Topbar";
import { Button } from "@/components/ui/Button";

export default function BucketsPage() {
  return (
    <Suspense fallback={null}>
      <BucketsPageInner />
    </Suspense>
  );
}

function BucketsPageInner() {
  const [createOpen, setCreateOpen] = useState(false);
  const params = useSearchParams();
  const router = useRouter();

  // Honour ?new=1 (used by the onboarding card's step-1 CTA). Strip the
  // query param after opening so a reload doesn't re-trigger the dialog.
  useEffect(() => {
    if (params.get("new") === "1") {
      setCreateOpen(true);
      router.replace("/buckets");
    }
  }, [params, router]);

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
        <OnboardingCard />
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
