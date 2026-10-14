"use client";

import Image from "next/image";
import type { DynamicToolUIPart } from "ai";
import { cn } from "@/lib/utils";
import type { OutfitBoard, ShopOptions, StylistMessage } from "@/lib/stylist/tools";

export type ShopOption = ShopOptions["options"][number];
type Part = StylistMessage["parts"][number];
type ToolInfo = { name: string; state: string; input: unknown; output: unknown; id: string };

// Normalise typed (`tool-x`) and dynamic tool parts.
export function toolOf(part: Part | DynamicToolUIPart): ToolInfo | null {
  if (part.type === "dynamic-tool") return { name: part.toolName, state: part.state, input: part.input, output: part.output, id: part.toolCallId };
  if (part.type.startsWith("tool-") && "toolCallId" in part)
    return { name: part.type.slice(5), state: part.state, input: part.input, output: "output" in part ? part.output : undefined, id: part.toolCallId };
  return null;
}

export const money = (p?: { amount: number; currency: string }) =>
  p ? new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency, maximumFractionDigits: 0 }).format(p.amount / 100) : "";

export function textOf(m: StylistMessage) {
  return m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join(" ").trim();
}

// The newest outfit the stylist put on the board, plus the newest options per gap.
export function latestBoard(messages: StylistMessage[]) {
  let board: OutfitBoard | null = null;
  const shop = new Map<string, ShopOptions>();
  for (const m of messages)
    for (const p of m.parts) {
      const t = toolOf(p);
      if (t?.state !== "output-available") continue;
      if (t.name === "presentOutfit") board = t.output as OutfitBoard;
      if (t.name === "shopForGap") shop.set((t.output as ShopOptions).gap, t.output as ShopOptions);
    }
  return { board, shop };
}

function Chip({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-[12.5px] text-taupe">
      {done ? <span className="text-gold">✓</span> : <span className="size-1.5 animate-pulse rounded-full bg-gold" />}
      {children}
    </span>
  );
}

export function ToolPart({ tool, onPick, picked }: { tool: ToolInfo; onPick: (gap: string, p: ShopOption) => void; picked?: string }) {
  const done = tool.state === "output-available";
  if (tool.state === "output-error") return <Chip done>Couldn&apos;t finish that step, trying another way</Chip>;
  switch (tool.name) {
    case "searchWardrobe": {
      const q = (tool.input as { query?: string; category?: string } | undefined) ?? {};
      const label = q.query ?? q.category ?? "pieces";
      return <Chip done={done}>{done ? `Wardrobe · ${(tool.output as unknown[]).length} for “${label}”` : "Looking through your wardrobe…"}</Chip>;
    }
    case "getWeather": {
      if (!done) return <Chip done={false}>Checking the forecast…</Chip>;
      const w = tool.output as { place: string; now: { tempF: number; windMph: number; description: string }; evening?: { tempF: number; windMph: number } };
      const t = w.evening ?? w.now;
      return <Chip done>{`Forecast · ${w.place.split(",")[0]} ${t.tempF}°${t.windMph >= 15 ? " windy" : ""}`}</Chip>;
    }
    case "getCalendarEvents": {
      if (!done) return <Chip done={false}>Checking your calendar…</Chip>;
      const c = tool.output as { connected: boolean; events: unknown[] };
      return <Chip done>{c.connected ? `Calendar · ${c.events.length} upcoming` : "Calendar not connected"}</Chip>;
    }
    case "presentOutfit":
      if (!done) return <Chip done={false}>Putting the look together…</Chip>;
      return (
        <>
          <Chip done>{`On your board · ${(tool.output as OutfitBoard).title}`}</Chip>
          {/* Phones have no canvas, so show the look inline. */}
          <MiniBoard board={tool.output as OutfitBoard} />
        </>
      );
    case "saveLook":
      return <Chip done={done}>{done ? "Saved to your looks" : "Saving…"}</Chip>;
    case "shopForGap":
      if (!done) {
        const i = tool.input as { gap?: string; budgetUsd?: number; size?: string } | undefined;
        return <Chip done={false}>{`Searching Shopify${i?.gap ? ` for ${i.gap}` : ""}${i?.budgetUsd ? ` · under $${i.budgetUsd}` : ""}${i?.size ? ` · size ${i.size}` : ""}…`}</Chip>;
      }
      return <ShopCards data={tool.output as ShopOptions} onPick={onPick} picked={picked} />;
    default:
      return null;
  }
}

function MiniBoard({ board }: { board: OutfitBoard }) {
  return (
    <div className="no-scrollbar -mx-5 flex gap-2.5 overflow-x-auto px-5 lg:hidden">
      {board.pieces.map(({ garment: g }) => (
        <div key={g.id} className="relative aspect-[3/4] w-24 shrink-0 bg-sand">
          {g.imageUrl && <Image src={g.imageUrl} alt={g.name} fill sizes="96px" className="object-cover" />}
        </div>
      ))}
      {board.gaps.map((gap) => (
        <div key={gap.label} className="grid aspect-[3/4] w-24 shrink-0 place-items-center border border-dashed border-taupe p-2 text-center font-serif text-sm italic leading-tight">
          {gap.label}
        </div>
      ))}
    </div>
  );
}

function ShopCards({ data, onPick, picked }: { data: ShopOptions; onPick: (gap: string, p: ShopOption) => void; picked?: string }) {
  if (!data.options.length)
    return <Chip done>{`Shopify · nothing under $${data.budgetUsd} in size ${data.size}`}</Chip>;
  return (
    <div className="flex flex-col gap-2">
      <Chip done>{`Shopify · ${data.options.length} options under $${data.budgetUsd} · size ${data.size}${data.sizeMatched ? "" : " (not all confirmed)"}`}</Chip>
      {data.options.map((p) => (
        <article key={p.id} className={cn("grid grid-cols-[72px_1fr] gap-3 border bg-white p-2.5", picked === p.id ? "border-ink" : "border-line")}>
          <div className="relative aspect-[3/4] bg-oat">
            {/* eslint-disable-next-line @next/next/no-img-element -- product images come from many Shopify CDNs */}
            {p.imageUrl && <img src={p.imageUrl} alt={p.title} className="absolute inset-0 size-full object-cover" />}
          </div>
          <div className="flex min-w-0 flex-col">
            <p className="eyebrow text-taupe">
              {p.tier} · {p.seller ?? "Shopify"}
            </p>
            <h4 className="mt-1 line-clamp-2 font-serif text-[17px] leading-[1.1]">{p.title}</h4>
            <div className="mt-auto flex items-center justify-between gap-2 pt-2">
              <b className="font-serif text-lg font-normal">{money(p.price)}</b>
              <div className="flex gap-1.5">
                <button className="btn-chic btn-ghost h-8 px-2.5 text-[9.5px]" onClick={() => onPick(data.gap, p)}>
                  {picked === p.id ? "On board" : "Try on board"}
                </button>
                {p.checkoutUrl && (
                  <a className="btn-chic h-8 px-2.5 text-[9.5px]" href={p.checkoutUrl} target="_blank" rel="noreferrer">
                    Buy
                  </a>
                )}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
