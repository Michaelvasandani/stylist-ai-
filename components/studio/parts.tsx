"use client";

import { useState } from "react";
import Image from "next/image";
import type { DynamicToolUIPart } from "ai";
import { cn } from "@/lib/utils";
import type { LookBreakdown, LookSet, ShoppingAsk, ShopOptions, StylistMessage } from "@/lib/stylist/tools";

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

// Images the user attached to a message (inspiration photos to copy).
export function imagesOf(m: StylistMessage) {
  return m.parts.flatMap((p) => (p.type === "file" && p.mediaType.startsWith("image") ? [p.url] : []));
}

// The newest looks the stylist put on the board, the newest options per gap, and the look being copied.
export function latestBoard(messages: StylistMessage[]) {
  let board: LookSet | null = null;
  let inspo: string | null = null;
  const shop = new Map<string, ShopOptions>();
  for (const m of messages)
    for (const p of m.parts) {
      if (m.role === "user" && p.type === "file" && p.mediaType.startsWith("image")) inspo = p.url;
      const t = toolOf(p);
      if (t?.state !== "output-available") continue;
      if (t.name === "presentOutfit") board = t.output as LookSet;
      if (t.name === "shopForGap") shop.set((t.output as ShopOptions).gap, t.output as ShopOptions);
    }
  return { board, shop, inspo };
}

function Chip({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-[12.5px] text-taupe">
      {done ? <span className="text-gold">✓</span> : <span className="size-1.5 animate-pulse rounded-full bg-gold" />}
      {children}
    </span>
  );
}

type ToolPartProps = {
  tool: ToolInfo;
  onPick: (gap: string, p: ShopOption) => void;
  onMore?: (gap: string) => void; // undefined while the stylist is busy
  onAnswer?: (text: string) => void; // replies to a form; undefined while busy or once answered
  picked?: string;
};

export function ToolPart({ tool, onPick, onMore, onAnswer, picked }: ToolPartProps) {
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
    case "breakDownLook": {
      if (!done) return <Chip done={false}>Reading the look…</Chip>;
      const look = tool.output as LookBreakdown;
      return <Chip done>{`Copying · ${look.pieces.map((p) => p.label).join(", ")}`}</Chip>;
    }
    case "askShoppingDetails":
      if (!done) return <Chip done={false}>Getting ready to shop…</Chip>;
      return <ShoppingForm ask={tool.output as ShoppingAsk} onAnswer={onAnswer} />;
    case "presentOutfit":
      if (!done) return <Chip done={false}>Putting the look together…</Chip>;
      return (
        <>
          <Chip done>{`On your board · ${(tool.output as LookSet).looks.map((l) => l.vibe).join(" · ")}`}</Chip>
          {/* Phones have no canvas, so show the looks inline. */}
          {(tool.output as LookSet).looks.map((look) => (
            <MiniBoard key={look.title} board={look} />
          ))}
        </>
      );
    case "saveLook":
      return <Chip done={done}>{done ? "Saved to your looks" : "Saving…"}</Chip>;
    case "shopForGap":
      if (!done) {
        const i = tool.input as { gap?: string; budgetUsd?: number; size?: string } | undefined;
        return <Chip done={false}>{`Searching Shopify${i?.gap ? ` for ${i.gap}` : ""}${i?.budgetUsd ? ` · under $${i.budgetUsd}` : ""}${i?.size ? ` · size ${i.size}` : ""}…`}</Chip>;
      }
      return <ShopCards data={tool.output as ShopOptions} onPick={onPick} onMore={onMore} picked={picked} />;
    default:
      return null;
  }
}

function MiniBoard({ board }: { board: LookSet["looks"][number] }) {
  return (
    <div className="lg:hidden">
      <p className="eyebrow mb-1.5 text-taupe">
        {board.vibe} · {board.title}
      </p>
      <div className="no-scrollbar -mx-5 flex gap-2.5 overflow-x-auto px-5">
        {board.pieces.map(({ garment: g }) => (
          <div key={g.id} className="relative aspect-[3/4] w-24 shrink-0 rounded-2xl bg-[radial-gradient(ellipse_at_50%_40%,#fdfbf7,#ebe3d6)]">
            {g.imageUrl && (
              <Image
                src={g.imageUrl}
                alt={g.name}
                fill
                sizes="96px"
                className={cn("object-contain p-1.5", g.isCutout ? "drop-shadow-[0_6px_6px_rgba(60,45,30,.2)]" : "mix-blend-multiply")}
              />
            )}
          </div>
        ))}
        {board.gaps.map((gap) => (
          <div key={gap.label} className="grid aspect-[3/4] w-24 shrink-0 place-items-center border border-dashed border-taupe p-2 text-center font-serif text-sm italic leading-tight">
            {gap.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function ShopCards({ data, onPick, onMore, picked }: { data: ShopOptions } & Omit<ToolPartProps, "tool">) {
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
      <button
        disabled={!onMore}
        onClick={() => onMore?.(data.gap)}
        className="btn-chic btn-ghost btn-sm self-start bg-paper normal-case tracking-normal text-[13px] disabled:opacity-40"
      >
        Not quite · show 3 more
      </button>
    </div>
  );
}

// Sizes are remembered per category on this device, so the next form comes pre-filled.
const SIZES_KEY = "stylist.sizes";
const SIZE_HINT: Record<string, string> = { top: "M", bottom: "32 or 8", dress: "8", outerwear: "M", shoes: "US 9", accessory: "One size" };
function savedSizes(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SIZES_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function ShoppingForm({ ask, onAnswer }: { ask: ShoppingAsk; onAnswer?: (text: string) => void }) {
  const [rows, setRows] = useState(() => {
    const sizes = typeof window === "undefined" ? {} : savedSizes();
    return ask.pieces.map((p) => ({ ...p, on: true, budget: "", size: sizes[p.category] ?? "" }));
  });
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const chosen = rows.filter((r) => r.on);
  const ready = chosen.length > 0 && chosen.every((r) => Number(r.budget) > 0 && r.size.trim());
  const locked = !onAnswer;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || locked) return;
    try {
      localStorage.setItem(SIZES_KEY, JSON.stringify({ ...savedSizes(), ...Object.fromEntries(chosen.map((r) => [r.category, r.size.trim()])) }));
    } catch {}
    onAnswer(`Shop these on Shopify: ${chosen.map((r) => `${r.label}, up to $${Number(r.budget)}, size ${r.size.trim()}`).join("; ")}.`);
  };

  return (
    <form onSubmit={submit} className={cn("flex flex-col gap-2 border border-line bg-white p-3", locked && "opacity-60")}>
      <p className="eyebrow text-taupe">Shop the missing pieces</p>
      {rows.map((r, i) => (
        <fieldset key={r.label} disabled={locked} className="grid grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-1.5 border-t border-line pt-2 first-of-type:border-t-0 first-of-type:pt-0">
          <input type="checkbox" checked={r.on} onChange={(e) => set(i, { on: e.target.checked })} aria-label={`Shop ${r.label}`} className="size-4 accent-ink" />
          <span className={cn("font-serif text-[17px] leading-tight", !r.on && "text-taupe line-through")}>{r.label}</span>
          {r.on && (
            <div className="col-start-2 flex gap-2">
              <label className="flex h-9 flex-1 items-center gap-1 border border-line px-2 text-[13px]">
                <span className="text-taupe">$</span>
                <input
                  inputMode="numeric"
                  value={r.budget}
                  onChange={(e) => set(i, { budget: e.target.value.replace(/[^0-9]/g, "") })}
                  placeholder="Budget"
                  aria-label={`Budget for ${r.label}`}
                  className="w-full min-w-0 bg-transparent outline-none"
                />
              </label>
              <label className="flex h-9 flex-1 items-center gap-1 border border-line px-2 text-[13px]">
                <span className="text-taupe">Size</span>
                <input
                  value={r.size}
                  onChange={(e) => set(i, { size: e.target.value })}
                  placeholder={SIZE_HINT[r.category]}
                  aria-label={`Size for ${r.label}`}
                  className="w-full min-w-0 bg-transparent outline-none"
                />
              </label>
            </div>
          )}
        </fieldset>
      ))}
      <div className="mt-1 flex gap-2">
        <button type="submit" disabled={!ready || locked} className="btn-chic btn-sm flex-1 disabled:opacity-40">
          Search Shopify
        </button>
        <button type="button" disabled={locked} onClick={() => onAnswer?.("No shopping for now, thanks.")} className="btn-chic btn-ghost btn-sm disabled:opacity-40">
          Not now
        </button>
      </div>
    </form>
  );
}
