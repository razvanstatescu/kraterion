import { Header } from "@/components/marketing/Header";
import { DocsSidebar } from "@/components/marketing/DocsSidebar";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 px-6 pt-16 md:grid-cols-[220px_1fr]">
        <aside className="hidden border-r border-stone-200/60 md:block">
          <DocsSidebar />
        </aside>
        <main id="main">{children}</main>
      </div>
    </>
  );
}
