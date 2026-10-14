import { createHash } from "node:crypto";
import { head, put } from "@vercel/blob";
import sharp from "sharp";
import { makeCutout } from "@/lib/cutout";

export const maxDuration = 60;

const inFlight = new Map<string, Promise<string>>(); // per instance; the three options of a gap arrive together

// POST { imageUrl, title } → { url } of the product cut out as a transparent PNG, so shopped
// pieces sit on the outfit stage like wardrobe ones. Cached in Blob by image URL.
export async function POST(req: Request) {
  const { imageUrl, title } = (await req.json()) as { imageUrl?: string; title?: string };
  if (!imageUrl?.startsWith("https://") || !title) return Response.json({ error: "Send imageUrl and title." }, { status: 400 });

  const pathname = `shop-cutouts/${createHash("sha256").update(imageUrl).digest("hex").slice(0, 32)}.png`;
  try {
    return Response.json({ url: (await head(pathname)).url });
  } catch {} // not cut out yet

  let job = inFlight.get(pathname);
  if (!job) {
    job = (async () => {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(`product image ${res.status}`);
      // Stores serve PNG/WebP/AVIF too; the cutout model is sent JPEG.
      const jpeg = await sharp(Buffer.from(await res.arrayBuffer())).flatten({ background: "#ffffff" }).jpeg().toBuffer();
      const png = await makeCutout(jpeg, { name: title, colorHex: null });
      const blob = await put(pathname, png, { access: "public", contentType: "image/png", addRandomSuffix: false, allowOverwrite: true });
      return blob.url;
    })().finally(() => inFlight.delete(pathname));
    inFlight.set(pathname, job);
  }
  try {
    return Response.json({ url: await job });
  } catch (e) {
    console.error("shop cutout failed", imageUrl, e);
    return Response.json({ error: "Couldn't cut out that product." }, { status: 502 });
  }
}
