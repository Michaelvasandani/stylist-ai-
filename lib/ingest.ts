import { cosineDistance, and, eq, lt } from "drizzle-orm";
import { embedMany } from "ai";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { db, garments, photos, type Garment } from "@/lib/db";
import { MODELS } from "@/lib/models";
import { describeForEmbedding, detectGarments, type DetectedItem } from "@/lib/vision";

const PAD = 0.08; // pad boxes so sloppy detections don't clip the garment (docs/SPEC.md risks)
// Backstop for the model's `sameAs`: descriptions this close = the same piece photographed again.
const DUPLICATE_DISTANCE = 0.12; // measured: same piece 0.02-0.08, different pieces ≥0.23

export type IngestResult = { added: Garment[]; duplicates: number };

// Normalise orientation/size once so the model, the crops and the stored photo all agree.
async function normalise(input: Buffer) {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function crop(img: { data: Buffer; width: number; height: number }, bbox: DetectedItem["bbox"]) {
  const x0 = Math.max(0, bbox.x - bbox.w * PAD);
  const y0 = Math.max(0, bbox.y - bbox.h * PAD);
  const x1 = Math.min(1, bbox.x + bbox.w * (1 + PAD));
  const y1 = Math.min(1, bbox.y + bbox.h * (1 + PAD));
  const left = Math.round(x0 * img.width);
  const top = Math.round(y0 * img.height);
  return sharp(img.data)
    .extract({
      left,
      top,
      width: Math.max(1, Math.min(img.width - left, Math.round((x1 - x0) * img.width))),
      height: Math.max(1, Math.min(img.height - top, Math.round((y1 - y0) * img.height))),
    })
    .jpeg({ quality: 88 })
    .toBuffer();
}

// Photo → Blob → vision (items + boxes) → embeddings → drop duplicates → crops → Neon.
export async function ingestWardrobePhoto(userId: string, file: Buffer): Promise<IngestResult> {
  const img = await normalise(file);
  // The model gets a smaller copy (faster, fewer tokens); crops come from the full image.
  const forModel = await sharp(img.data).resize({ width: 1024, height: 1024, fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
  const owned = await db
    .select({ id: garments.id, name: garments.name, category: garments.category })
    .from(garments)
    .where(eq(garments.userId, userId));

  const [original, all] = await Promise.all([
    put(`photos/${userId}/${crypto.randomUUID()}.jpg`, img.data, { access: "public", contentType: "image/jpeg" }),
    detectGarments(forModel, owned),
  ]);
  const detected = all.filter((item) => !item.sameAs);
  const [photo] = await db
    .insert(photos)
    .values({ userId, blobUrl: original.url, kind: "wardrobe" })
    .returning({ id: photos.id });
  if (!detected.length) return { added: [], duplicates: all.length };

  const { embeddings } = await embedMany({ model: MODELS.embedding, values: detected.map(describeForEmbedding) });
  const fresh = await dropDuplicates(
    userId,
    detected.map((item, i) => ({ item, embedding: embeddings[i] })),
  );
  if (!fresh.length) return { added: [], duplicates: all.length };

  const crops = await Promise.all(
    fresh.map(async ({ item }) =>
      put(`garments/${userId}/${crypto.randomUUID()}.jpg`, await crop(img, item.bbox), {
        access: "public",
        contentType: "image/jpeg",
      }),
    ),
  );

  const added = await db
    .insert(garments)
    .values(
      fresh.map(({ item, embedding }, i) => ({
        userId,
        photoId: photo.id,
        cropUrl: crops[i].url,
        category: item.category,
        subcategory: item.subcategory.toLowerCase(),
        name: item.name,
        colors: item.colors.map((c) => c.toLowerCase()),
        colorHex: item.colorHex,
        pattern: item.pattern,
        material: item.material,
        formality: item.formality,
        warmth: item.warmth,
        seasons: item.seasons,
        styleTags: item.styleTags,
        bbox: item.bbox,
        embedding,
      })),
    )
    .returning();
  return { added, duplicates: all.length - added.length };
}

type Candidate = { item: DetectedItem; embedding: number[] };

// Skip pieces already in the wardrobe, or repeated within this photo. Category isn't
// compared: the model files the same overshirt as "top" one run and "outerwear" the next.
async function dropDuplicates(userId: string, candidates: Candidate[]): Promise<Candidate[]> {
  const kept: Candidate[] = [];
  for (const c of candidates) {
    if (kept.some((k) => cosine(k.embedding, c.embedding) > 1 - DUPLICATE_DISTANCE)) {
      continue;
    }
    const [existing] = await db
      .select({ id: garments.id })
      .from(garments)
      .where(
        and(
          eq(garments.userId, userId),
          lt(cosineDistance(garments.embedding, c.embedding), DUPLICATE_DISTANCE),
        ),
      )
      .limit(1);
    if (!existing) kept.push(c);
  }
  return kept;
}

function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / Math.sqrt(na * nb);
}
