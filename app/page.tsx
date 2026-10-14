import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

const features = [
  { title: "Snap", body: "Take a mirror selfie. Every piece you're wearing lands in your wardrobe, tagged and searchable." },
  { title: "Ask", body: "\"What should I wear to a rooftop dinner tonight?\" Outfits from what you own, tuned to the weather." },
  { title: "Shop", body: "Missing a piece or copying a look? Real products from Shopify, ranked by how well they fit your closet." },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-10 px-4 py-16">
      <div className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Stylist AI</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Your personal stylist, in your pocket.</h1>
        <p className="text-lg text-muted-foreground">
          Snap your clothes, ask what to wear, and shop the gaps, by text or by voice.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="rounded-xl border p-4">
            <h2 className="font-medium">{f.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <Link href="/api/health" className={buttonVariants()}>
          System check
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">Built on Vercel AI Gateway · Neon Postgres · Shopify Catalog</p>
    </main>
  );
}
