"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { GarmentCard } from "@/lib/wardrobe";
import { TopBar } from "@/components/shell/top-bar";
import { ACCESSORY_SUBS, UI_CATEGORIES, matchesCategory, shade, titleCase, type UiCategory } from "./categories";
import { AddPhotosButton, DropOverlay, UploadTray } from "./upload";
import { takeHandedOffPhotos, usePhotoUpload } from "./use-photo-upload";

const CUTOUT_WAIT_MS = 2 * 60_000;

export function Wardrobe() {
  const [all, setAll] = useState<GarmentCard[] | null>(null);
  const [cat, setCat] = useState<UiCategory>("All");
  const [sub, setSub] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GarmentCard[] | null>(null); // semantic search hits
  const [searching, setSearching] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set()); // ids awaiting a cutout

  useEffect(() => {
    fetch("/api/garments")
      .then((r) => r.json())
      .then((d: { garments: GarmentCard[] }) => {
        setAll(d.garments);
        // Pieces still showing a raw crop get cut out in the background.
        if (d.garments.some((g) => !g.isCutout)) {
          fetch("/api/garments/cutouts", { method: "POST" })
            .then((r) => r.json())
            .then(({ ids }: { ids: string[] }) => setPending((cur) => new Set([...cur, ...ids])))
            .catch(() => {});
        }
      })
      .catch(() => setAll([]));
  }, []);

  // Search by feel: debounce, then rank the wardrobe by embedding similarity.
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/garments?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        setResults((await r.json()).garments);
      } catch {
        /* aborted */
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  // Cutouts land a few seconds after a piece is added (lib/cutout.ts): poll until this
  // session's new pieces have them, then swap them in. Give up after a couple of minutes.
  const waiting = pending.size > 0;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(async () => {
      const fresh: GarmentCard[] = (await fetch("/api/garments").then((r) => r.json()).catch(() => null))?.garments;
      if (!fresh) return;
      const done = new Map(fresh.filter((g) => g.isCutout).map((g) => [g.id, g]));
      // Merge rather than replace, so pieces from uploads still in flight aren't dropped.
      setAll((cur) => cur?.map((g) => done.get(g.id) ?? g) ?? cur);
      setPending((cur) => new Set([...cur].filter((id) => !done.has(id))));
    }, 3000);
    const stop = setTimeout(() => setPending(new Set()), CUTOUT_WAIT_MS);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [waiting]);

  const onGarments = useCallback((added: GarmentCard[]) => {
    if (!added.length) return;
    setAll((cur) => [...added, ...(cur ?? [])]);
    setPending((cur) => new Set([...cur, ...added.filter((g) => !g.isCutout).map((g) => g.id)]));
  }, []);
  const upload = usePhotoUpload(onGarments);
  const onFiles = useCallback(
    (files: FileList | File[]) => {
      upload.add(files);
      toast(`Reading ${files.length} photo${files.length > 1 ? "s" : ""}…`, {
        description: "Pieces appear in your wardrobe as each one is read.",
      });
    },
    [upload],
  );
  useEffect(() => {
    const handed = takeHandedOffPhotos();
    if (handed.length) onFiles(handed);
  }, [onFiles]);

  const garments = useMemo(() => all ?? [], [all]);
  const hits = query.trim() ? results : null;
  const swatches = useMemo(() => {
    const seen = new Map<string, string>();
    for (const g of garments) if (shade(g) && g.colorHex && !seen.has(shade(g))) seen.set(shade(g), g.colorHex);
    return [...seen];
  }, [garments]);

  const visible = (hits ?? garments).filter(
    (g) => matchesCategory(g, cat, sub) && (!color || shade(g) === color),
  );
  const selected = garments.find((g) => g.id === selId) ?? null;
  const count = (c: UiCategory) => garments.filter((g) => matchesCategory(g, c, null)).length;

  return (
    <>
      <TopBar title="Wardrobe" meta={all ? `${garments.length} pieces` : undefined}>
        <AddPhotosButton onFiles={onFiles} />
      </TopBar>
      <DropOverlay onFiles={onFiles} />

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[230px_1fr_auto]">
        {/* Filters (desktop) */}
        <aside className="hidden overflow-y-auto border-r border-line px-6 py-7 lg:block">
          <h4 className="eyebrow mb-3 text-taupe">Category</h4>
          {UI_CATEGORIES.map(({ name }) => (
            <div key={name}>
              <button
                onClick={() => {
                  setCat(name);
                  setSub(null);
                }}
                className={cn("flex w-full justify-between py-2 text-taupe hover:text-ink", cat === name && "font-normal text-ink")}
              >
                <span>{name}</span>
                <span>{count(name)}</span>
              </button>
              {name === "Accessories" && cat === "Accessories" && (
                <div className="ml-0.5 border-l border-line2 py-0.5 pl-3.5">
                  {ACCESSORY_SUBS.map((s) => (
                    <button
                      key={s.sub}
                      onClick={() => setSub(sub === s.sub ? null : s.sub)}
                      className={cn("flex w-full justify-between py-1 font-serif text-base text-taupe", sub === s.sub && "text-ink")}
                    >
                      <span>{sub === s.sub ? `— ${s.name}` : s.name}</span>
                      <span>{garments.filter((g) => g.category === "accessory" && g.subcategory === s.sub).length}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {swatches.length > 0 && (
            <>
              <h4 className="eyebrow mb-3 mt-6 text-taupe">Colour</h4>
              <div className="-m-3 flex flex-wrap">
                {swatches.map(([name, hex]) => (
                  <button
                    key={name}
                    title={titleCase(name)}
                    aria-label={`${titleCase(name)} pieces`}
                    aria-pressed={color === name}
                    onClick={() => setColor(color === name ? null : name)}
                    className="grid size-11 place-items-center"
                  >
                    <i
                      className={cn(
                        "size-5 rounded-full border border-black/10",
                        color === name && "ring-1 ring-ink ring-offset-2 ring-offset-bone",
                      )}
                      style={{ background: hex }}
                    />
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>

        {/* Grid */}
        <div className="overflow-y-auto px-4 pb-10 pt-5 lg:px-7 lg:pt-6">
          {/* Category chips (phone) */}
          <div className="no-scrollbar -mx-4 mb-1 flex gap-4 overflow-x-auto px-4 lg:hidden">
            {UI_CATEGORIES.map(({ name }) => (
              <button
                key={name}
                onClick={() => {
                  setCat(name);
                  setSub(null);
                }}
                className={cn("eyebrow min-h-11 shrink-0 text-taupe", cat === name && "text-ink")}
              >
                <span className={cn("border-b pb-1", cat === name ? "border-ink" : "border-transparent")}>
                  {name} {count(name)}
                </span>
              </button>
            ))}
          </div>

          <label className="flex max-w-[520px] items-center gap-3 border-b border-line2 text-taupe focus-within:border-ink">
            <Search className="size-[18px]" strokeWidth={1.3} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search your wardrobe by description"
              placeholder="Search by feel: “something warm and cozy”"
              className="h-11 min-w-0 flex-1 bg-transparent font-serif text-[19px] italic text-ink outline-none placeholder:text-taupe"
            />
            {searching && <span className="eyebrow">Searching</span>}
            {query && (
              <button onClick={() => setQuery("")} aria-label="Clear search" className="-m-3 p-3">
                <X className="size-4" />
              </button>
            )}
          </label>

          <UploadTray items={upload.items} onRetry={upload.retry} onClear={upload.clearFinished} />

          {all === null ? (
            <TileGridSkeleton />
          ) : garments.length === 0 && !upload.items.length ? (
            <EmptyWardrobe onFiles={onFiles} />
          ) : visible.length === 0 ? (
            garments.length === 0 && upload.busy ? (
              <TileGridSkeleton />
            ) : (
              <p className="mt-10 font-serif text-xl text-taupe">Nothing here yet.</p>
            )
          ) : (
            <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-3.5 gap-y-6 lg:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
              {visible.map((g, i) => (
                <button key={g.id} onClick={() => setSelId(selId === g.id ? null : g.id)} className="group self-start text-left">
                  <div
                    className={cn(
                      "relative aspect-[3/4] overflow-hidden bg-sand outline outline-1 outline-transparent transition-colors group-hover:bg-oat",
                      selId === g.id && "outline-ink",
                    )}
                  >
                    <GarmentImage g={g} sizes="200px" pending={pending.has(g.id)} />
                  </div>
                  <p className="mt-2.5 text-[13px] font-normal">{g.name}</p>
                  <p className="text-xs text-taupe">
                    {titleCase(shade(g))}
                    {hits && i === 0 && <span className="text-gold-deep"> · Closest match</span>}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <PieceDetail
          garment={selected}
          cuttingOut={!!selected && pending.has(selected.id)}
          onClose={() => setSelId(null)}
          onRemoved={(id) => {
            setSelId(null);
            setAll((cur) => cur?.filter((g) => g.id !== id) ?? null);
            setResults((cur) => cur?.filter((g) => g.id !== id) ?? null);
          }}
        />
      </div>
    </>
  );
}

function PieceDetail({
  garment: g,
  cuttingOut,
  onClose,
  onRemoved,
}: {
  garment: GarmentCard | null;
  cuttingOut: boolean;
  onClose: () => void;
  onRemoved: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null); // garment id awaiting confirm
  const [removing, setRemoving] = useState(false);
  const remove = async (id: string) => {
    setRemoving(true);
    const res = await fetch(`/api/garments/${id}`, { method: "DELETE" }).catch(() => null);
    setRemoving(false);
    setConfirming(null);
    if (res?.ok) onRemoved(id);
    else toast.error("Couldn't remove that piece. Try again.");
  };
  const tags = g
    ? [g.material, g.pattern !== "solid" && g.pattern, ...g.seasons.map(titleCase), ...g.styleTags]
        .filter((t): t is string => !!t)
        .map(titleCase)
    : [];
  return (
    <aside
      className={cn(
        // Phone: full-screen sheet. Desktop: slide-in panel (Studio prototype).
        "fixed inset-0 z-30 overflow-hidden bg-paper transition-[width,transform] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] lg:static lg:z-auto lg:w-0 lg:border-l lg:border-line",
        g ? "translate-y-0 lg:w-[360px]" : "pointer-events-none translate-y-full lg:pointer-events-auto lg:translate-y-0",
      )}
    >
      {g && (
        <div className="h-full overflow-y-auto p-6 lg:w-[360px]">
          <div className="flex items-start justify-between">
            <p className="eyebrow text-taupe">
              {titleCase(g.subcategory ?? g.category)} · {titleCase(shade(g))}
            </p>
            <button onClick={onClose} aria-label="Close piece details" className="-m-3 p-3 text-taupe hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
          <div className="relative mt-3.5 aspect-square overflow-hidden bg-sand">
            <GarmentImage g={g} sizes="360px" pending={cuttingOut} />
          </div>
          <h3 className="mt-4 font-serif text-[32px] font-light leading-none">{g.name}</h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="border border-line2 px-2 py-0.5 text-[11.5px]">
                {t}
              </span>
            ))}
          </div>
          <div className="my-4.5 grid grid-cols-3 border-y border-line2 text-center">
            {[
              ["Warmth", `${g.warmth ?? "–"}/5`],
              ["Looks", "0"],
              ["Formal", `${g.formality ?? "–"}/5`],
            ].map(([label, value], i) => (
              <div key={label} className={cn("py-3", i && "border-l border-line2")}>
                <b className="block font-serif text-[26px] font-normal leading-none">{value}</b>
                <span className="eyebrow text-taupe">{label}</span>
              </div>
            ))}
          </div>
          <p className="eyebrow text-taupe">
            Added {new Date(g.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · Named and
            tagged by AI
          </p>
          <Link href={`/studio?piece=${g.id}`} className="btn-chic mt-4.5 w-full">
            Style this piece
          </Link>
          {confirming === g.id ? (
            <div className="mt-3 flex items-center justify-between gap-3 border border-line2 p-3">
              <span className="text-xs text-taupe">Remove from your wardrobe?</span>
              <span className="flex gap-1">
                <button className="eyebrow p-2 text-taupe hover:text-ink" onClick={() => setConfirming(null)}>
                  Keep
                </button>
                <button className="eyebrow p-2 text-[#9b3b2f]" disabled={removing} onClick={() => remove(g.id)}>
                  {removing ? "Removing…" : "Remove"}
                </button>
              </span>
            </div>
          ) : (
            <button className="btn-chic btn-ghost mt-3 w-full" onClick={() => setConfirming(g.id)}>
              Not right? Remove
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

// Cutouts float on the tile like a product shot; a raw crop fills it, shimmering until its cutout arrives.
function GarmentImage({ g, sizes, pending }: { g: GarmentCard; sizes: string; pending: boolean }) {
  if (!g.imageUrl) return null;
  if (g.isCutout) {
    return (
      <Image
        src={g.imageUrl}
        alt={g.name}
        fill
        sizes={sizes}
        className="animate-in fade-in object-contain p-[12%] drop-shadow-[0_10px_14px_rgba(60,45,30,0.18)] duration-500 transition-transform group-hover:scale-[1.03]"
      />
    );
  }
  return (
    <>
      <Image src={g.imageUrl} alt={g.name} fill sizes={sizes} className={cn("object-cover", pending && "opacity-60 blur-[1px]")} />
      {pending && <span className="eyebrow absolute inset-x-0 bottom-3 animate-pulse text-center text-ink">Cutting out…</span>}
    </>
  );
}

function EmptyWardrobe({ onFiles }: { onFiles: (files: FileList | File[]) => void }) {
  return (
    <div className="mt-8 grid place-items-center border-[1.5px] border-dashed border-line2 px-6 py-16 text-center">
      <p className="eyebrow text-taupe">01 · Camera</p>
      <p className="mt-3 font-serif text-[34px] font-light leading-tight">
        Photograph your <em className="text-gold-deep">wardrobe.</em>
      </p>
      <p className="mt-2 max-w-sm text-taupe">
        Mirror selfies or flat lays. Select as many as you like; every piece gets cut out, named and tagged.
      </p>
      <p className="mt-2 max-w-sm text-xs text-taupe">
        Your photos are read by an AI vision model to find each piece. You can remove anything it gets wrong.
      </p>
      <AddPhotosButton onFiles={onFiles} className="mt-6" />
      <p className="eyebrow mt-4 hidden text-taupe lg:block">or drop photos anywhere</p>
    </div>
  );
}

function TileGridSkeleton() {
  return (
    <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-3.5 gap-y-6">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i}>
          <div className="aspect-[3/4] animate-pulse bg-sand" />
          <div className="mt-2.5 h-3 w-3/4 animate-pulse bg-sand" />
        </div>
      ))}
    </div>
  );
}
