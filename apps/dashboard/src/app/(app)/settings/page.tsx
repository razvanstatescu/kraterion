import { Topbar } from "@/components/shell/Topbar";
import { EmptyState } from "@/components/ui/EmptyState";

export default function SettingsPage() {
  return (
    <>
      <Topbar crumbs={[{ label: "Settings" }]} />
      <main className="ks-screen">
        <div className="ks-screen-head">
          <div>
            <h1>Settings</h1>
            <p className="lead">Account info and danger-zone actions. Phase G wires cancel-subscription.</p>
          </div>
        </div>
        <EmptyState icon="settings" title="Settings panel ships in Phase G" />
      </main>
    </>
  );
}
