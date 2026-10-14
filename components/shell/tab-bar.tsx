"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, LayoutPanelLeft, Shirt } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Wardrobe", icon: Shirt },
  { href: "/studio", label: "Studio", icon: LayoutPanelLeft },
  { href: "/looks", label: "Saved looks", icon: Bookmark },
];

// Floating liquid-glass tab bar, pinned near the bottom on every screen size.
// Scrolling screens reserve ~pb-28 so their last row clears it.
export function TabBar() {
  const pathname = usePathname();
  const active = NAV.findIndex(({ href }) => (href === "/" ? pathname === "/" : pathname.startsWith(href)));

  return (
    <nav
      aria-label="Main"
      className="glass fixed bottom-[max(16px,env(safe-area-inset-bottom))] left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded-full p-1.5"
    >
      {/* Active bubble slides between tabs. */}
      {active >= 0 && (
        <span
          aria-hidden
          className="absolute left-1.5 top-1.5 size-12 rounded-full bg-ink/[.08] shadow-[inset_0_1px_0_rgb(255_255_255/.6)] transition-transform duration-500 ease-[cubic-bezier(.3,1.4,.5,1)]"
          style={{ transform: `translateX(${active * 52}px)` }}
        />
      )}
      {NAV.map(({ href, label, icon: Icon }, i) => (
        <Link
          key={href}
          href={href}
          aria-label={label}
          aria-current={i === active ? "page" : undefined}
          className={cn(
            "group relative grid size-12 place-items-center rounded-full text-taupe transition-colors hover:text-ink active:scale-90 [transition:color_.2s,transform_.2s]",
            i === active && "text-ink",
          )}
        >
          <Icon className="size-5" strokeWidth={i === active ? 1.7 : 1.3} />
          <span className="eyebrow pointer-events-none absolute bottom-full mb-3 hidden whitespace-nowrap rounded-full bg-ink px-2.5 py-1.5 text-[10px] text-bone opacity-0 transition-opacity group-hover:opacity-100 lg:block">
            {label}
          </span>
        </Link>
      ))}
    </nav>
  );
}
