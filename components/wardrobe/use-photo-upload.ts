"use client";

import { useCallback, useRef, useState } from "react";
import type { GarmentCard } from "@/lib/wardrobe";

export type UploadItem = {
  id: string;
  name: string;
  previewUrl: string;
  status: "queued" | "reading" | "done" | "error";
  startedAt?: number;
  added?: number;
  duplicates?: number;
  error?: string;
};

const CONCURRENCY = 3;
const MAX_EDGE = 1600; // matches the server's normalise(); keeps bodies under Vercel's 4.5 MB limit

// Downscale in the browser before upload. createImageBitmap applies EXIF orientation.
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.88),
    );
  } catch {
    return file; // e.g. HEIC on a browser that can't decode it; let the server try
  }
}

// Files picked on another screen (onboarding), picked up by the wardrobe when it mounts.
let handedOff: File[] = [];
export const handOffPhotos = (files: FileList | File[]) => {
  handedOff = Array.from(files);
};
export const takeHandedOffPhotos = () => handedOff.splice(0);

// Multi-photo upload queue: one request per photo, a few in parallel, results streamed into the grid.
// `onGarments` should be stable (useCallback).
export function usePhotoUpload(onGarments: (garments: GarmentCard[]) => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const queue = useRef<{ id: string; file: File }[]>([]);
  const fileById = useRef(new Map<string, File>()); // kept so failed photos can be retried
  const active = useRef(0);

  const patch = (id: string, p: Partial<UploadItem>) =>
    setItems((all) => all.map((it) => (it.id === id ? { ...it, ...p } : it)));

  const pump = useCallback(() => {
    while (active.current < CONCURRENCY && queue.current.length) {
      const { id, file } = queue.current.shift()!;
      active.current++;
      patch(id, { status: "reading", startedAt: Date.now(), error: undefined });
      (async () => {
        try {
          const body = new FormData();
          body.append("photo", await shrink(file), "photo.jpg");
          const res = await fetch("/api/wardrobe/ingest", { method: "POST", body });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? `Upload failed (${res.status})`);
          onGarments(json.garments);
          patch(id, { status: "done", added: json.garments.length, duplicates: json.duplicates });
        } catch (e) {
          patch(id, { status: "error", error: e instanceof Error ? e.message : "Upload failed" });
        } finally {
          active.current--;
          pump();
        }
      })();
    }
  }, [onGarments]);

  const add = useCallback(
    (files: FileList | File[]) => {
      const images = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
      if (!images.length) return;
      const next = images.map((file) => ({ id: crypto.randomUUID(), file }));
      setItems((all) => [
        ...next.map(({ id, file }) => ({ id, name: file.name, previewUrl: URL.createObjectURL(file), status: "queued" as const })),
        ...all,
      ]);
      next.forEach(({ id, file }) => fileById.current.set(id, file));
      queue.current.push(...next);
      pump();
    },
    [pump],
  );

  const retry = useCallback(
    (id: string) => {
      const file = fileById.current.get(id);
      if (!file) return;
      patch(id, { status: "queued", error: undefined });
      queue.current.push({ id, file });
      pump();
    },
    [pump],
  );

  const clearFinished = useCallback(() => {
    setItems((all) => {
      all
        .filter((it) => it.status === "done" || it.status === "error")
        .forEach((it) => {
          URL.revokeObjectURL(it.previewUrl);
          fileById.current.delete(it.id);
        });
      return all.filter((it) => it.status === "queued" || it.status === "reading");
    });
  }, []);

  const busy = items.some((it) => it.status === "queued" || it.status === "reading");
  return { items, add, retry, clearFinished, busy };
}
