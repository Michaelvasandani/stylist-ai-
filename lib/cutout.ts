import { generateText } from "ai";
import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db, garments } from "@/lib/db";
import { MODELS } from "@/lib/models";

const MAX_EDGE = 900; // stored PNG size; tiles are ≤360px wide, 2x for retina plus headroom

// Screen colours. Green almost never appears on a garment; magenta covers the ones where it does.
const KEYS = {
  green: { hex: "#00FF00", name: "pure green" },
  magenta: { hex: "#FF00FF", name: "pure magenta" },
} as const;
type Key = keyof typeof KEYS;

function keyFor(colorHex: string | null): Key {
  const m = colorHex?.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return "green";
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16));
  return g > r + 15 && g > b + 15 ? "magenta" : "green";
}

// The image-edit model keeps the garment as photographed (worn creases and all) and paints
// everything else a flat screen colour, which we then key out. Gemini's native segmentation
// masks don't come back through the AI Gateway, and this looks cleaner than a raw mask anyway.
export async function makeCutout(crop: Buffer, item: { name: string; colorHex: string | null }) {
  const key = keyFor(item.colorHex);
  const { hex, name } = KEYS[key];
  const { files } = await generateText({
    model: MODELS.imageEdit,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Isolate the ${item.name} in this photo. Keep the ${item.name} exactly as it is: same shape, folds, texture, colours and position. Where part of it is hidden by a hand, phone, hair or another item, fill that part in so it looks whole. Replace everything else (person, skin, hair, other clothing, background) with a flat ${name} ${hex}. No shadows, no border, no text.`,
          },
          { type: "file", mediaType: "image/jpeg", data: crop },
        ],
      },
    ],
  });
  const screen = files.find((f) => f.mediaType.startsWith("image/"));
  if (!screen) throw new Error("image model returned no image");
  return chromaKey(Buffer.from(screen.uint8Array), key);
}

// Screen colour → transparency, with despill so edges don't keep a green/magenta fringe.
async function chromaKey(input: Buffer, key: Key) {
  const { data, info } = await sharp(input)
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, o = 0; i < data.length; i += 3, o += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    // How much the pixel leans towards the screen colour.
    const spill = key === "green" ? g - Math.max(r, b) : Math.min(r, b) - g;
    let a = 255;
    if (spill > 0) {
      a = Math.round(255 * (1 - Math.min(1, Math.max(0, (spill - 30) / 90))));
      if (key === "green") g -= spill;
      else {
        r -= spill;
        b -= spill;
      }
    }
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = a;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 10 })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

// Runs after the ingest response: each garment's crop → transparent PNG → garments.cutout_url.
// A failure leaves the crop in place, which the UI already shows.
export async function cutoutGarments(
  userId: string,
  pieces: { id: string; name: string; colorHex: string | null; crop: Buffer }[],
) {
  await Promise.all(
    pieces.map(async ({ id, crop, ...item }) => {
      try {
        const png = await makeCutout(crop, item);
        const blob = await put(`cutouts/${userId}/${id}.png`, png, { access: "public", contentType: "image/png" });
        await db.update(garments).set({ cutoutUrl: blob.url }).where(eq(garments.id, id));
      } catch (e) {
        console.error("cutout failed", id, e);
      }
    }),
  );
}
