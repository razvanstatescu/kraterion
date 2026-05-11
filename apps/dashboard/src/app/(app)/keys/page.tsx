import { Topbar } from "@/components/shell/Topbar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default function KeysPage() {
  return (
    <>
      <Topbar
        crumbs={[{ label: "Access keys" }]}
        actions={<Button variant="cta" icon="plus" disabled>New key</Button>}
      />
      <main className="ks-screen">
        <div className="ks-screen-head">
          <div>
            <h1>Access keys</h1>
            <p className="lead">
              Use access keys with any S3-compatible client. We never see the secret after you create it.
            </p>
          </div>
        </div>
        <EmptyState
          icon="key"
          title="No access keys yet"
          body="Key minting + revocation lights up in Phase F."
        />
      </main>
    </>
  );
}
