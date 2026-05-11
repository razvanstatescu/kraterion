import { SignOutButton } from "@/components/auth/SignOutButton";
import { BucketsList } from "@/components/buckets/BucketsList";
import { Topbar } from "@/components/shell/Topbar";
import { Button } from "@/components/ui/Button";

export default function BucketsPage() {
  return (
    <>
      <Topbar
        crumbs={[{ label: "Buckets" }]}
        actions={
          <>
            <Button variant="cta" icon="plus" disabled title="Phase D">
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
    </>
  );
}
