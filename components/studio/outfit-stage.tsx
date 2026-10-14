"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GarmentCard } from "@/lib/wardrobe";
import type { OutfitBoard } from "@/lib/stylist/tools";
import { money, type ShopOption } from "./parts";

// Character-creator view of an outfit: the look is assembled as one figure, and each
// slot (top, bottoms, shoes…) cycles through the stylist's pick, its alternates, then the
// rest of the wardrobe. ←/→ flips the active slot, ↑/↓ moves between slots.

type Area = "layer" | "top" | "dress" | "bottom" | "shoes" | "accessory";
type Option =
  | { kind: "garment"; key: string; garment: GarmentCard; reason?: string; source: "pick" | "alt" | "closet" }
  | { kind: "shop"; key: string; product: ShopOption }
  | { kind: "missing"; key: string; label: string };
type Slot = { id: string; area: Area; label: string; gap?: string; reason?: string; options: Option[] };

const AREA: Record<GarmentCard["category"], Area> = {
  outerwear: "layer",
  top: "top",
  dress: "dress",
  bottom: "bottom",
  shoes: "shoes",
  accessory: "accessory",
};
const ORDER: Area[] = ["layer", "top", "dress", "bottom", "shoes", "accessory"];
const LABEL: Record<Area, string> = { layer: "Outerwear", top: "Top", dress: "Dress", bottom: "Bottoms", shoes: "Shoes", accessory: "Accessory" };

// Where each area sits on the figure, as % of the stage box.
const BOX: Record<Area, { top: number; height: number; width: number; x: number; z: number }> = {
  layer: { top: 3, height: 38, width: 66, x: 0, z: 1 },
  top: { top: 4, height: 35, width: 60, x: 0, z: 2 },
  dress: { top: 4, height: 66, width: 62, x: 0, z: 2 },
  bottom: { top: 36, height: 46, width: 50, x: 0, z: 1 },
  shoes: { top: 82, height: 15, width: 46, x: 0, z: 3 },
  accessory: { top: 14, height: 16, width: 20, x: 42, z: 4 },
};

function buildSlots(board: OutfitBoard, gaps: string[], shop: Map<string, ShopOption[]>, closet: GarmentCard[]): Slot[] {
  const used = new Set(board.pieces.flatMap((p) => [p.garment.id, ...(p.alternates ?? []).map((a) => a.id)]));
  const slots: Slot[] = board.pieces.map(({ garment, reason, alternates = [] }) => ({
    id: garment.id,
    area: AREA[garment.category],
    label: LABEL[AREA[garment.category]],
    reason,
    options: [
      { kind: "garment", key: garment.id, garment, reason, source: "pick" },
      ...alternates.map((g): Option => ({ kind: "garment", key: g.id, garment: g, source: "alt" })),
      ...closet
        .filter((g) => g.category === garment.category && !used.has(g.id))
        .map((g): Option => ({ kind: "garment", key: g.id, garment: g, source: "closet" })),
    ],
  }));
  for (const label of gaps) {
    const gap = board.gaps.find((g) => g.label === label);
    const area: Area = (gap && AREA[gap.category as GarmentCard["category"]]) || "accessory";
    const products = shop.get(label) ?? [];
    slots.push({
      id: `gap:${label}`,
      area,
      label: LABEL[area],
      gap: label,
      reason: gap?.reason,
      options: products.length
        ? products.map((p): Option => ({ kind: "shop", key: p.id, product: p }))
        : [{ kind: "missing", key: label, label }],
    });
  }
  return slots.sort((a, b) => ORDER.indexOf(a.area) - ORDER.indexOf(b.area));
}

const nameOf = (o: Option) => (o.kind === "garment" ? o.garment.name : o.kind === "shop" ? o.product.title : `Missing: ${o.label}`);
const imageOf = (o: Option) => (o.kind === "garment" ? o.garment.imageUrl : o.kind === "shop" ? o.product.imageUrl : null);
// Transparent cutouts get a soft shadow; anything with a background is multiplied into the stage.
const isCutout = (o: Option) => o.kind === "garment" && o.garment.isCutout;

export function OutfitStage({
  board,
  gaps,
  shop,
  picks,
  onPick,
  onSave,
  busy,
}: {
  board: OutfitBoard;
  gaps: string[];
  shop: Map<string, ShopOption[]>;
  picks: Record<string, ShopOption>;
  onPick: (gap: string, p: ShopOption) => void;
  onSave: (names: string[]) => void;
  busy: boolean;
}) {
  const [closet, setCloset] = useState<GarmentCard[]>([]);
  useEffect(() => {
    fetch("/api/garments")
      .then((r) => r.json())
      .then((d) => setCloset(d.garments ?? []))
      .catch(() => {});
  }, []);

  const slots = useMemo(() => buildSlots(board, gaps, shop, closet), [board, gaps, shop, closet]);
  const [index, setIndexState] = useState<Record<string, number>>({});
  const [active, setActiveState] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  // Mirrors of the state above, so rapid key presses never act on a stale render.
  const indexRef = useRef(index);
  const activeRef = useRef(active);
  const setActive = (i: number) => {
    activeRef.current = i;
    setActiveState(i);
  };

  // A product tried on from the chat shows up as that slot's current option.
  const currentOf = (s: Slot, idx: Record<string, number>) => {
    if (idx[s.id] !== undefined) return idx[s.id];
    const picked = s.gap && picks[s.gap];
    const i = picked ? s.options.findIndex((o) => o.key === picked.id) : -1;
    return Math.max(0, i);
  };
  const current = (s: Slot) => currentOf(s, index);

  const cycle = (si: number, step: 1 | -1) => {
    const s = slots[si];
    if (!s || s.options.length < 2) return;
    const next = (currentOf(s, indexRef.current) + step + s.options.length) % s.options.length;
    indexRef.current = { ...indexRef.current, [s.id]: next };
    setIndexState(indexRef.current);
    setDir(step);
    setActive(si);
    const o = s.options[next];
    if (s.gap && o.kind === "shop") onPick(s.gap, o.product);
  };

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = (e) => {
      if ((e.target as HTMLElement).closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        cycle(activeRef.current, e.key === "ArrowLeft" ? -1 : 1);
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        setActive(Math.min(slots.length - 1, Math.max(0, activeRef.current + (e.key === "ArrowUp" ? -1 : 1))));
      }
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Warm the cache for each slot's neighbours so swaps are instant.
  useEffect(() => {
    for (const s of slots) {
      const i = currentOf(s, index);
      for (const n of [i - 1, i + 1]) {
        const src = imageOf(s.options[(n + s.options.length) % s.options.length]);
        if (src) new window.Image().src = src;
      }
    }
  });

  // First slot of each area goes on the figure; extras (a second accessory, say) line up beside it.
  const placed = new Set<Area>();
  const layout = slots.map((s) => {
    const box = { ...BOX[s.area] };
    const extra = placed.has(s.area);
    placed.add(s.area);
    if (extra) Object.assign(box, { ...BOX.accessory, top: BOX.accessory.top + 18 * slots.filter((x, j) => j < slots.indexOf(s) && x.area === s.area).length });
    // Layer + top: fan them like a flat lay, jacket behind and to the right.
    const hasLayer = slots.some((x) => x.area === "layer");
    if (s.area === "layer" && slots.some((x) => x.area === "top" || x.area === "dress")) box.x = 16;
    if ((s.area === "top" || s.area === "dress") && hasLayer && !extra) box.x = -12;
    if (s.area === "bottom" && slots.some((x) => x.area === "dress")) box.top = 58;
    return box;
  });
  const activeBox = layout[active] ?? layout[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-taupe">{board.occasion}</p>
          <p className="mt-1 font-serif text-[30px] italic leading-none">{board.title}</p>
        </div>
        <button
          onClick={() => onSave(slots.map((s) => nameOf(s.options[current(s)])))}
          disabled={busy}
          className="btn-chic btn-ghost btn-sm bg-paper/70"
        >
          Save look
        </button>
      </div>

      <div className="mt-5 grid min-h-0 flex-1 grid-cols-[230px_1fr] gap-5">
        {/* Slot list: the character creator's category column. */}
        <ol className="flex min-h-0 flex-col gap-1.5 overflow-y-auto pb-24">
          {slots.map((s, si) => {
            const i = current(s);
            const o = s.options[i];
            const on = si === active;
            return (
              <li key={s.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setActive(si)}
                  onKeyDown={(e) => e.key === "Enter" && setActive(si)}
                  className={cn(
                    "cursor-pointer rounded-2xl px-3 py-2.5 transition-colors",
                    on ? "glass" : "hover:bg-paper/50",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn("eyebrow", on ? "text-ink" : "text-taupe")}>{s.label}</span>
                    <span className="text-[11px] tabular-nums text-taupe">
                      {i + 1} / {s.options.length}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <ArrowButton small dir={-1} disabled={s.options.length < 2} onClick={() => cycle(si, -1)} />
                    <p className="line-clamp-1 flex-1 text-center text-[13px] font-normal">{nameOf(o)}</p>
                    <ArrowButton small dir={1} disabled={s.options.length < 2} onClick={() => cycle(si, 1)} />
                  </div>
                  {on && <Detail option={o} slot={s} />}
                </div>
              </li>
            );
          })}
        </ol>

        {/* Stage: spotlight, floor shadow, the figure. */}
        <div className="relative min-h-0 overflow-hidden rounded-3xl bg-[radial-gradient(ellipse_at_50%_38%,#fdfbf7_0%,#f1ebe1_48%,#e3d9c9_100%)]">
          <div className="absolute inset-x-[22%] bottom-[5%] h-[5%] rounded-[50%] bg-[radial-gradient(closest-side,rgba(60,45,30,.22),transparent)]" />
          <div className="absolute inset-y-[3%] left-1/2 aspect-[3/5] max-w-[92%] -translate-x-1/2">
            {slots.map((s, si) => {
              const o = s.options[current(s)];
              const b = layout[si];
              const src = imageOf(o);
              return (
                <button
                  key={s.id}
                  onClick={() => setActive(si)}
                  aria-label={`${s.label}: ${nameOf(o)}`}
                  className="absolute -translate-x-1/2 transition-[top,left,width,height] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]"
                  style={{ top: `${b.top}%`, height: `${b.height}%`, width: `${b.width}%`, left: `${50 + b.x}%`, zIndex: si === active ? 10 : b.z }}
                >
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element -- wardrobe blobs and Shopify CDNs
                    <img
                      key={o.key}
                      src={src}
                      alt={nameOf(o)}
                      className={cn(
                        "size-full object-contain animate-in fade-in zoom-in-95 duration-300",
                        dir === 1 ? "slide-in-from-right-6" : "slide-in-from-left-6",
                        isCutout(o)
                          ? "drop-shadow-[0_14px_14px_rgba(60,45,30,.22)]"
                          : "mix-blend-multiply [filter:contrast(1.04)_brightness(1.04)]",
                        si === active && isCutout(o) && "drop-shadow-[0_0_18px_rgba(201,162,74,.45)]",
                      )}
                    />
                  ) : (
                    <span
                      key={o.key}
                      className="grid size-full place-items-center rounded-[28%] border-[1.5px] border-dashed border-taupe/70 p-3 text-center font-serif text-[15px] italic leading-tight text-taupe animate-in fade-in"
                    >
                      {nameOf(o)}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Big glass arrows flank whichever piece is selected. */}
            {slots[active] && slots[active].options.length > 1 && activeBox && (
              <div
                className="pointer-events-none absolute inset-x-[-14%] flex items-center justify-between transition-[top,height] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]"
                style={{ top: `${activeBox.top}%`, height: `${activeBox.height}%` }}
              >
                <ArrowButton dir={-1} onClick={() => cycle(active, -1)} />
                <ArrowButton dir={1} onClick={() => cycle(active, 1)} />
              </div>
            )}
          </div>
          <p className="eyebrow absolute bottom-4 left-1/2 hidden -translate-x-1/2 text-taupe/80 xl:block">← → swap · ↑ ↓ slot</p>
          {busy && <p className="eyebrow absolute right-5 top-4 text-taupe">Restyling…</p>}
        </div>
      </div>
    </div>
  );
}

function Detail({ option: o, slot }: { option: Option; slot: Slot }) {
  if (o.kind === "missing")
    return <p className="mt-2 font-serif text-[15px] italic leading-snug text-taupe">{slot.reason ?? "Ask your stylist to shop this gap."}</p>;
  if (o.kind === "shop")
    return (
      <p className="mt-2 text-xs text-taupe">
        <span className="eyebrow text-gold-deep">{o.product.tier}</span> · {money(o.product.price)} · {o.product.seller ?? "Shopify"}
        {o.product.checkoutUrl && (
          <a href={o.product.checkoutUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="ml-2 border-b border-ink text-ink">
            Buy
          </a>
        )}
      </p>
    );
  return (
    <div className="mt-2">
      <p className={cn("eyebrow", o.source === "pick" ? "text-gold-deep" : "text-taupe")}>
        {o.source === "pick" ? "Stylist's pick" : o.source === "alt" ? "Stylist's alternate" : "From your wardrobe"}
      </p>
      {o.reason && <p className="mt-1 font-serif text-[15px] italic leading-snug text-taupe">{o.reason}</p>}
    </div>
  );
}

function ArrowButton({ dir, onClick, disabled, small }: { dir: 1 | -1; onClick: () => void; disabled?: boolean; small?: boolean }) {
  const Icon = dir === 1 ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={dir === 1 ? "Next option" : "Previous option"}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "pointer-events-auto grid shrink-0 place-items-center rounded-full text-ink transition-transform active:scale-90 disabled:opacity-25",
        small ? "size-7 hover:bg-paper/80" : "glass size-12 hover:scale-105",
      )}
    >
      <Icon className={small ? "size-4" : "size-5"} strokeWidth={1.5} />
    </button>
  );
}
