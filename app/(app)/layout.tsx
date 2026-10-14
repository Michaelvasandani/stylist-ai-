import { NavRail, TabBar } from "@/components/shell/nav-rail";

// Persistent app shell: rail on desktop, tab bar on phone (docs/DESIGN.md §2-3).
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-dvh flex-col lg:grid lg:grid-cols-[76px_1fr]">
      <NavRail />
      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
      <TabBar />
    </div>
  );
}
