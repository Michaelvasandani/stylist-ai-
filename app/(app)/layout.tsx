import { TabBar } from "@/components/shell/tab-bar";

// Persistent app shell: full-bleed screens under a floating glass tab bar.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-dvh flex-col">
      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
      <TabBar />
    </div>
  );
}
