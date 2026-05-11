import { SignOutButton } from "@/components/auth/SignOutButton";
import { Topbar } from "@/components/shell/Topbar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Phase B placeholder — proves the shell composition behind RequireAuth.
 * Real list lands in Phase C.
 */
export default function BucketsPage() {
  return (
    <>
      <Topbar
        crumbs={[{ label: "Buckets" }]}
        actions={
          <>
            <Button variant="cta" icon="plus" disabled>New bucket</Button>
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
        <EmptyState
          icon="bucket"
          title="Bucket reads land in Phase C"
          body="Sign-in is wired — refresh and your session persists. The list, file browser, and inspector populate next."
        />
      </main>
    </>
  );
}
