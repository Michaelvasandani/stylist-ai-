"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UploadItem } from "./use-photo-upload";

// No `capture` attribute: on phones that would force the camera and disable multi-select.
// Without it iOS/Android offer Photo Library (multi-select) and Take Photo.
export function AddPhotosButton({
  onFiles,
  className,
  children,
}: {
  onFiles: (files: FileList | File[]) => void;
  className?: string;
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={cn("btn-chic lg:btn-sm", className)} onClick={() => input.current?.click()}>
        {children ?? (
          <>
            <Camera className="size-4" strokeWidth={1.3} />
            Add photos
          </>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = ""; // allow picking the same files again
        }}
      />
    </>
  );
}

// Whole-window drag-and-drop target (desktop).
export function DropOverlay({ onFiles }: { onFiles: (files: FileList | File[]) => void }) {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const overFn = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      if (e.dataTransfer?.files.length) onFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", overFn);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", overFn);
      window.removeEventListener("drop", drop);
    };
  }, [onFiles]);

  if (!over) return null;
  return (
    <div className="pointer-events-none absolute inset-3 z-40 grid place-items-center border-[1.5px] border-dashed border-ink bg-bone/90">
      <div className="text-center">
        <p className="font-serif text-4xl font-light italic">Drop your photos</p>
        <p className="eyebrow mt-3 text-taupe">Mirror selfies · flat lays · several at once</p>
      </div>
    </div>
  );
}

const SLOW_MS = 45_000; // photos usually take 15-30s

export function UploadTray({
  items,
  onRetry,
  onClear,
}: {
  items: UploadItem[];
  onRetry: (id: string) => void;
  onClear: () => void;
}) {
  const pending = items.filter((it) => it.status === "queued" || it.status === "reading").length;
  const now = useNow(pending > 0);
  if (!items.length) return null;
  const added = items.reduce((n, it) => n + (it.added ?? 0), 0);
  const failed = items.filter((it) => it.status === "error");
  const slow = items.some((it) => it.status === "reading" && it.startedAt && now - it.startedAt > SLOW_MS);
  return (
    <section className="mt-5 border border-line bg-paper p-4" aria-label="Photo uploads">
      <div className="flex items-baseline justify-between gap-4">
        <p className="eyebrow" role="status">
          {pending ? `Reading ${pending} of ${items.length} photos` : `${items.length} photos read`}
          <span className="text-taupe"> · {added} new pieces</span>
        </p>
        {!pending && (
          <button className="eyebrow p-2 text-taupe hover:text-ink" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-taupe">
        {slow
          ? "This is taking longer than usual. You can keep browsing; pieces appear when ready."
          : pending
            ? "About 30 seconds a photo. AI finds each piece, cuts it out and tags it."
            : "Names and tags were written by AI. Open a piece to check it or remove it."}
      </p>
      <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
        {items.map((it) => (
          <figure key={it.id} className="w-[72px] shrink-0">
            <div className="relative aspect-[3/4] overflow-hidden bg-sand">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
              <img src={it.previewUrl} alt="" className={cn("size-full object-cover", it.status !== "done" && "opacity-60")} />
              <span
                aria-hidden
                className={cn(
                  "absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-ink text-bone",
                  it.status === "done" && "bg-gold text-ink",
                  it.status === "error" && "bg-[#9b3b2f]",
                )}
              >
                {it.status === "done" ? (
                  <Check className="size-3" />
                ) : it.status === "error" ? (
                  <X className="size-3" />
                ) : (
                  <Loader2 className={cn("size-3", it.status === "reading" && "animate-spin")} />
                )}
              </span>
            </div>
            <figcaption className="mt-1 text-[11px] leading-tight text-taupe">
              {it.status === "done" ? (
                <>
                  {it.added} new
                  {!!it.duplicates && <span className="block">{it.duplicates} already owned</span>}
                </>
              ) : it.status === "error" ? (
                <button onClick={() => onRetry(it.id)} className="text-ink underline underline-offset-2">
                  Failed · Retry
                </button>
              ) : it.status === "reading" ? (
                "Reading…"
              ) : (
                "Queued"
              )}
            </figcaption>
          </figure>
        ))}
      </div>
      {failed.length > 0 && (
        <p className="mt-2 text-xs text-[#9b3b2f]" role="alert">
          {failed.length === 1 ? failed[0].error : `${failed.length} photos failed: ${failed[0].error}`} Retry, or try a
          clearer, well-lit photo.
        </p>
      )}
    </section>
  );
}

// Re-render every second while something is in flight (for the "slow" notice).
function useNow(active: boolean) {
  const [now, setNow] = useState(0); // ticks from the first interval; no clock read during render
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}
