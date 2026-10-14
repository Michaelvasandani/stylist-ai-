"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { LookSet, OutfitBoard } from "@/lib/stylist/tools";
import { OutfitStage } from "./outfit-stage";
import type { ShopOption } from "./parts";

// The stylist's three takes on a brief. Filter chips narrow them down, a card picks one,
// and the picked look opens on the outfit stage with all its slot-by-slot swapping.

type Filter = "Closet only" | "Needs shopping" | "Casual" | "Smart" | "Dressy";

function tagsOf(look: OutfitBoard): Filter[] {
  const f = look.pieces.flatMap((p) => p.garment.formality ?? []);
  const avg = f.length ? f.reduce((a, b) => a + b, 0) / f.length : null;
  const dress: Filter[] = avg === null ? [] : avg < 2.5 ? ["Casual"] : avg < 3.5 ? ["Smart"] : ["Dressy"];
  return [look.gaps.length ? "Needs shopping" : "Closet only", ...dress];
}

const FILTERS: Filter[] = ["Closet only", "Needs shopping", "Casual", "Smart", "Dressy"];

export function LookBoard({
  set,
  shop,
  picks,
  onPick,
  onSave,
  busy,
}: {
  set: LookSet;
  shop: Map<string, ShopOption[]>;
  picks: Record<string, ShopOption>;
  onPick: (gap: string, p: ShopOption) => void;
  onSave: (names: string[]) => void;
  busy: boolean;
}) {
  const [active, setActive] = useState(0);
  const [filter, setFilter] = useState<Filter | null>(null);
  const tags = set.looks.map(tagsOf);
  // Only offer filters that tell the looks apart.
  const filters = FILTERS.filter((f) => {
    const n = tags.filter((t) => t.includes(f)).length;
    return n > 0 && n < set.looks.length;
  });
  const shown = set.looks.map((_, i) => !filter || tags[i].includes(filter));
  const choose = (f: Filter | null) => {
    setFilter(f);
    // Keep the stage on a look that matches.
    if (f && !tags[active].includes(f)) setActive(Math.max(0, tags.findIndex((t) => t.includes(f))));
  };

  const look = set.looks[active];
  // This look's gaps, plus anything shopped for that no look named.
  const named = new Set(set.looks.flatMap((l) => l.gaps.map((g) => g.label)));
  const gaps = [...look.gaps.map((g) => g.label), ...[...shop.keys()].filter((s) => !named.has(s))];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {set.looks.length > 1 && (
        <div className="mb-5 flex flex-col gap-3">
          {filters.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="eyebrow mr-1 text-taupe">Filter</span>
              {[null, ...filters].map((f) => (
                <button
                  key={f ?? "all"}
                  onClick={() => choose(f)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[12px] transition-colors",
                    filter === f ? "border-ink bg-ink text-bone" : "border-line bg-paper/70 text-ink hover:border-taupe",
                  )}
                >
                  {f ?? "All looks"}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2.5">
            {set.looks.map((l, i) =>
              shown[i] ? (
                <button
                  key={l.title}
                  onClick={() => setActive(i)}
                  className={cn(
                    "flex min-w-0 flex-col rounded-2xl px-3 py-2.5 text-left transition-colors",
                    i === active ? "glass" : "bg-paper/50 hover:bg-paper/80",
                  )}
                >
                  <span className={cn("eyebrow", i === active ? "text-gold-deep" : "text-taupe")}>
                    Look {i + 1} · {l.vibe}
                  </span>
                  <span className="mt-1 line-clamp-1 font-serif text-[17px] italic leading-tight">{l.title}</span>
                  <span className="mt-2 flex items-center gap-1">
                    {l.pieces.slice(0, 5).map(({ garment: g }) =>
                      g.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- wardrobe blobs
                        <img key={g.id} src={g.imageUrl} alt={g.name} className="size-7 object-contain mix-blend-multiply" />
                      ) : null,
                    )}
                    <span className="ml-auto shrink-0 text-[11px] text-taupe">
                      {l.gaps.length ? `${l.gaps.length} to shop` : "All yours"}
                    </span>
                  </span>
                </button>
              ) : null,
            )}
          </div>
        </div>
      )}
      <OutfitStage
        key={look.title + look.pieces.map((p) => p.garment.id).join()}
        board={look}
        gaps={gaps}
        shop={shop}
        picks={picks}
        onPick={onPick}
        onSave={onSave}
        busy={busy}
      />
    </div>
  );
}
