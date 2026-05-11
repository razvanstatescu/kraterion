import { Topbar } from "@/components/shell/Topbar";
import { EmptyState } from "@/components/ui/EmptyState";

export default function ActivityPage() {
  return (
    <>
      <Topbar crumbs={[{ label: "Activity" }]} />
      <main className="ks-screen">
        <div className="ks-screen-head">
          <div>
            <h1>Activity</h1>
            <p className="lead">On-chain events for your account. Phase G wires this to the indexer.</p>
          </div>
        </div>
        <EmptyState icon="info" title="No recent activity" />
      </main>
    </>
  );
}
