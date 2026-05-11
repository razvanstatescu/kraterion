import { Topbar } from "@/components/shell/Topbar";
import { EmptyState } from "@/components/ui/EmptyState";

export default function UsagePage() {
  return (
    <>
      <Topbar crumbs={[{ label: "Usage" }]} />
      <main className="ks-screen">
        <div className="ks-screen-head">
          <div>
            <h1>Usage</h1>
            <p className="lead">Storage and request stats. Phase G fills in real data.</p>
          </div>
        </div>
        <EmptyState icon="chart" title="No usage yet" body="Upload some objects to see traffic." />
      </main>
    </>
  );
}
