import { and, cosineDistance, desc, eq, sql } from "drizzle-orm";
import { embed } from "ai";
import { db, garments, type Garment } from "@/lib/db";
import { MODELS } from "@/lib/models";

// What the client sees: no embedding, no internal ids beyond the garment's own.
export type GarmentCard = {
  id: string;
  name: string;
  category: Garment["category"];
  subcategory: string | null;
  colors: string[];
  colorHex: string | null;
  pattern: string | null;
  material: string | null;
  formality: number | null;
  warmth: number | null;
  seasons: string[];
  styleTags: string[];
  imageUrl: string | null;
  createdAt: string;
  score?: number; // semantic match, 0-1, when searching
};

export function toGarmentCard(g: Garment & { score?: number }): GarmentCard {
  return {
    id: g.id,
    name: g.name,
    category: g.category,
    subcategory: g.subcategory,
    colors: g.colors,
    colorHex: g.colorHex,
    pattern: g.pattern,
    material: g.material,
    formality: g.formality,
    warmth: g.warmth,
    seasons: g.seasons,
    styleTags: g.styleTags,
    imageUrl: g.cutoutUrl ?? g.cropUrl,
    createdAt: g.createdAt.toISOString(),
    ...(g.score !== undefined && { score: g.score }),
  };
}

export type WardrobeQuery = {
  query?: string; // semantic, e.g. "something warm and cozy"
  category?: Garment["category"];
  minWarmth?: number;
  minFormality?: number;
  maxFormality?: number;
  limit?: number;
};

// Hybrid search: SQL filters + pgvector ordering. Shared by the wardrobe UI and the stylist agent.
export async function searchWardrobe(userId: string, q: WardrobeQuery = {}): Promise<GarmentCard[]> {
  const filters = and(
    eq(garments.userId, userId),
    q.category && eq(garments.category, q.category),
    q.minWarmth !== undefined ? sql`${garments.warmth} >= ${q.minWarmth}` : undefined,
    q.minFormality !== undefined ? sql`${garments.formality} >= ${q.minFormality}` : undefined,
    q.maxFormality !== undefined ? sql`${garments.formality} <= ${q.maxFormality}` : undefined,
  );

  if (!q.query?.trim()) {
    const rows = await db.select().from(garments).where(filters).orderBy(desc(garments.createdAt)).limit(q.limit ?? 200);
    return rows.map(toGarmentCard);
  }

  const { embedding } = await embed({ model: MODELS.embedding, value: q.query });
  const distance = cosineDistance(garments.embedding, embedding);
  const rows = await db
    .select({ garment: garments, distance })
    .from(garments)
    .where(filters)
    .orderBy(distance)
    .limit(q.limit ?? 24);
  return rows.map(({ garment, distance }) => toGarmentCard({ ...garment, score: 1 - Number(distance) }));
}
