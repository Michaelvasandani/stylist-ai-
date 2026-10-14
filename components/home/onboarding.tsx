"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { GarmentCard } from "@/lib/wardrobe";
import { AddPhotosButton } from "@/components/wardrobe/upload";
import { handOffPhotos } from "@/components/wardrobe/use-photo-upload";

// Onboarding steps in demo order (docs/DESIGN.md §5.1).
const STEPS = [
  { n: "01", mode: "Camera", title: "Photograph your wardrobe", body: "Mirror photos become a catalogued wardrobe: every piece cut out, named and tagged.", href: "/wardrobe" },
  { n: "02", mode: "Voice", title: "Ask, or simply speak", body: "Tell your stylist where you're going. It reads the forecast and dresses you from what you own.", href: "/studio" },
  { n: "03", mode: "Image", title: "Copy any look", body: "Share an image you love with your stylist. It matches the look to your wardrobe and names what's missing.", href: "/studio" },
  { n: "04", mode: "Shop", title: "Shop only the gaps", body: "Missing pieces sourced from Shopify, with how many new looks each one unlocks.", href: "/studio" },
];

export function Onboarding() {
  const router = useRouter();
  const [garments, setGarments] = useState<GarmentCard[] | null>(null);
  useEffect(() => {
    fetch("/api/garments")
      .then((r) => r.json())
      .then((d) => setGarments(d.garments))
      .catch(() => setGarments([]));
  }, []);

  const done = garments?.length ? 1 : 0;

  // Uploads run (and show progress) on the wardrobe screen.
  const startUpload = (files: FileList | File[]) => {
    handOffPhotos(files);
    router.push("/wardrobe");
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-8 px-4 pt-10 lg:flex-row lg:items-end lg:justify-between lg:px-14 lg:pt-14">
        <div>
          <p className="eyebrow text-taupe">Stylist AI · Your personal stylist</p>
          <h2 className="mt-3.5 font-serif text-[44px] font-light leading-[.95] lg:text-[clamp(44px,5vw,72px)]">
            {done ? "Your wardrobe," : "Let's build your"}
            <br />
            <em className="text-gold-deep">{done ? "ready to style." : "wardrobe."}</em>
          </h2>
        </div>
        <div className="lg:min-w-[260px]">
          <p className="eyebrow text-taupe">{done} of 4 complete</p>
          <div className="mt-2.5 h-0.5 bg-line2">
            <i className="block h-full bg-ink transition-[width] duration-700" style={{ width: `${(done / 4) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 px-4 py-8 sm:grid-cols-2 lg:px-14 lg:py-10 xl:grid-cols-4">
        {STEPS.map((s, i) => {
          const isDone = i < done;
          const next = i === done;
          return (
            <article key={s.n} className="flex flex-col border border-line bg-paper transition hover:-translate-y-0.5 hover:border-ink">
              <div className="relative h-[150px] bg-sand lg:h-[190px]">
                {isDone && (
                  <span className="absolute right-3 top-3 grid size-[26px] place-items-center rounded-full bg-ink text-xs text-bone">✓</span>
                )}
              </div>
              <div className="flex flex-1 flex-col p-5">
                <div className="eyebrow flex justify-between">
                  <span className="text-taupe">
                    {s.n} · {s.mode}
                  </span>
                  <span className={cn(isDone && "text-gold-deep")}>{isDone ? "Done" : next ? "Next" : ""}</span>
                </div>
                <h3 className="mt-3 font-serif text-[26px] font-normal leading-[1.05]">{s.title}</h3>
                <p className="mt-2 leading-normal text-taupe">{s.body}</p>
                <div className="mt-auto pt-5">
                  {i === 0 && !isDone ? (
                    <AddPhotosButton onFiles={startUpload}>Photograph</AddPhotosButton>
                  ) : (
                    <Link href={s.href} className={cn("btn-chic btn-sm", !next && "btn-ghost")}>
                      {i === 0 ? "View wardrobe" : "Open"}
                    </Link>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="px-4 pb-14 lg:px-14">
        <p className="eyebrow text-taupe">In your wardrobe so far</p>
        <div className="mt-3.5 flex gap-2.5 overflow-x-auto">
          {garments?.length ? (
            garments.map((g) => (
              <div key={g.id} className="relative aspect-[3/4] w-[88px] shrink-0 overflow-hidden bg-sand">
                {g.imageUrl && <Image src={g.imageUrl} alt={g.name} fill sizes="88px" className="object-cover" />}
              </div>
            ))
          ) : (
            <p className="font-serif text-xl italic text-taupe">Nothing yet. Start with a mirror photo.</p>
          )}
        </div>
        <p className="eyebrow mt-10 text-taupe">Powered by Vercel · Neon · Shopify · AI Gateway</p>
      </div>
    </div>
  );
}
