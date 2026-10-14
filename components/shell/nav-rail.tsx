"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Home, LayoutPanelLeft, Shirt } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Get started", short: "Home", icon: Home },
  { href: "/wardrobe", label: "Wardrobe", short: "Wardrobe", icon: Shirt },
  { href: "/studio", label: "Studio", short: "Studio", icon: LayoutPanelLeft },
  { href: "/looks", label: "Saved looks", short: "Saved", icon: Bookmark },
];

function useIsOn() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

// Desktop (≥1024px): dark rail on the left (Studio prototype).
export function NavRail() {
  const isOn = useIsOn();
  return (
    <nav className="hidden flex-col items-center gap-1.5 bg-espresso py-5 text-[#b9ae9f] lg:flex">
      <span className="mb-5 font-serif text-[30px] text-bone">S</span>
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-label={label}
          className={cn(
            "group relative grid size-[52px] place-items-center rounded-[14px] transition-colors hover:bg-[#24201c] hover:text-bone",
            isOn(href) && "bg-[#2c2722] text-bone before:absolute before:inset-y-3.5 before:-left-3 before:w-0.5 before:bg-gold",
          )}
        >
          <Icon className="size-5" strokeWidth={1.3} />
          <span className="eyebrow pointer-events-none absolute left-[62px] z-50 whitespace-nowrap bg-ink px-2.5 py-1.5 text-[10px] text-bone opacity-0 transition-opacity group-hover:opacity-100">
            {label}
          </span>
        </Link>
      ))}
    </nav>
  );
}

// Phone (<1024px): tab bar along the bottom (Lens prototype).
export function TabBar() {
  const isOn = useIsOn();
  return (
    <nav className="flex border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden">
      {NAV.map(({ href, short, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn("flex flex-1 flex-col items-center gap-1 py-3 text-taupe", isOn(href) && "text-ink")}
        >
          <Icon className="size-5" strokeWidth={1.3} />
          <span className="text-[9px] uppercase tracking-[0.16em]">{short}</span>
        </Link>
      ))}
    </nav>
  );
}
