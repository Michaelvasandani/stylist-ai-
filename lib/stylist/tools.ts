import { tool, type InferUITools, type UIMessage } from "ai";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, garments, looks } from "@/lib/db";
import { getProduct, searchCatalog, type ShopProduct } from "@/lib/shopify";
import { CATEGORIES } from "@/lib/vision";
import { getWeather } from "@/lib/weather";
import { searchWardrobe, toGarmentCard, type GarmentCard } from "@/lib/wardrobe";

export type OutfitBoard = {
  title: string;
  occasion: string;
  pieces: { garment: GarmentCard; reason: string }[];
  gaps: { label: string; category: string; reason: string }[];
};

export type ShopOptions = {
  gap: string;
  size: string;
  budgetUsd: number;
  sizeMatched: boolean; // false when we had to drop the size filter to find 3 options
  options: (ShopProduct & { tier: "good" | "better" | "best" })[];
};

const TIERS = ["good", "better", "best"] as const;

// Shopify's price filter matches on the product's price range, so a variant can still be over budget.
async function threeOptions(query: string, maxCents: number, size: string) {
  const search = (sizes?: string[]) =>
    searchCatalog({ query, maxPriceCents: maxCents, sizes, limit: 12 }).then((ps) =>
      ps.filter((p) => p.price && p.price.amount <= maxCents),
    );
  let found = await search([size]);
  let sizeMatched = true;
  if (found.length < 3) {
    const more = await search();
    found = [...found, ...more.filter((p) => !found.some((f) => f.id === p.id))];
    sizeMatched = false;
  }
  // Cheapest → priciest reads naturally as good / better / best.
  const picked = found.slice(0, 3).sort((a, b) => a.price!.amount - b.price!.amount);

  // Point checkout at the variant in their size when the product has it.
  const options = await Promise.all(
    picked.map(async (p, i) => {
      const sized = await getProduct(p.id, [{ name: "Size", label: size }]).catch(() => null);
      const fits = sized?.checkoutUrl && sized.price && sized.price.amount <= maxCents;
      return { ...p, ...(fits && { checkoutUrl: sized.checkoutUrl, price: sized.price, variantId: sized.variantId }), tier: TIERS[i] };
    }),
  );
  return { options, sizeMatched };
}

// Tools shared by text chat and the voice loop (both go through /api/chat).
export function createStylistTools(userId: string) {
  return {
    searchWardrobe: tool({
      description:
        "Search the user's own wardrobe. Combine a semantic query (\"warm layer for a windy evening\") with filters. Call it several times with targeted queries (one per slot: top, bottom, shoes, layer, accessories) rather than once.",
      inputSchema: z.object({
        query: z.string().optional().describe("What you're looking for, in plain words"),
        category: z.enum(CATEGORIES).optional(),
        minWarmth: z.number().int().min(1).max(5).optional(),
        minFormality: z.number().int().min(1).max(5).optional(),
        maxFormality: z.number().int().min(1).max(5).optional(),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async (q) => {
        const found = await searchWardrobe(userId, { ...q, limit: q.limit ?? 8 });
        return found.map(({ id, name, category, subcategory, colors, material, formality, warmth, styleTags, imageUrl }) => ({
          id, name, category, subcategory, colors, material, formality, warmth, styleTags, imageUrl,
        }));
      },
    }),

    getWeather: tool({
      description: "Forecast for a place: now, the next 18 hours, and this evening. Use when the plan is outdoors or the location is known.",
      inputSchema: z.object({ location: z.string().describe('City or neighbourhood, e.g. "San Francisco"') }),
      execute: ({ location }) => getWeather(location),
    }),

    presentOutfit: tool({
      description:
        "Put an outfit on the user's board. Use only garment ids returned by searchWardrobe. Give each piece a one-line reason. List anything genuinely missing as a gap (don't shop yet).",
      inputSchema: z.object({
        title: z.string().describe('Short editorial name, e.g. "Rooftop, after dark"'),
        occasion: z.string(),
        pieces: z.array(z.object({ garmentId: z.string(), reason: z.string() })).min(1),
        gaps: z
          .array(z.object({ label: z.string().describe('e.g. "a warm camel layer"'), category: z.enum(CATEGORIES), reason: z.string() }))
          .default([]),
      }),
      execute: async ({ title, occasion, pieces, gaps }): Promise<OutfitBoard> => {
        const ids = pieces.map((p) => p.garmentId).filter((id) => z.uuid().safeParse(id).success);
        const rows = ids.length
          ? await db.select().from(garments).where(and(eq(garments.userId, userId), inArray(garments.id, ids)))
          : [];
        const byId = new Map(rows.map((g) => [g.id, toGarmentCard(g)]));
        return {
          title,
          occasion,
          pieces: pieces.flatMap((p) => (byId.has(p.garmentId) ? [{ garment: byId.get(p.garmentId)!, reason: p.reason }] : [])),
          gaps,
        };
      },
    }),

    shopForGap: tool({
      description:
        "Find exactly 3 real products on Shopify for one gap, within budget and in the user's size. Only call this once the user has told you BOTH their budget for this piece and their size; if either is unknown, ask first and wait for the answer.",
      inputSchema: z.object({
        gap: z.string().describe('What it fills, e.g. "warm camel layer"'),
        query: z.string().describe('Shopping query with colour, gender and fit in the words, e.g. "women\'s camel wool overcoat"'),
        budgetUsd: z.number().positive().describe("The user's max spend for this piece, in US dollars"),
        size: z.string().describe('The user\'s size as they said it, e.g. "M", "8", "32x30", "US 9"'),
      }),
      execute: async ({ gap, query, budgetUsd, size }): Promise<ShopOptions> => {
        // Shopify's Color attribute filter is strict enough to return nothing; colour goes in the query instead.
        const { options, sizeMatched } = await threeOptions(query, Math.round(budgetUsd * 100), size);
        return { gap, size, budgetUsd, sizeMatched, options };
      },
    }),

    saveLook: tool({
      description: "Save the current look to the user's Saved looks when they ask to keep it.",
      inputSchema: z.object({
        occasion: z.string(),
        garmentIds: z.array(z.string()),
        rationale: z.string(),
        shopItems: z.array(z.object({ id: z.string(), title: z.string(), checkoutUrl: z.string().optional() })).default([]),
      }),
      execute: async ({ occasion, garmentIds, rationale, shopItems }) => {
        const [look] = await db
          .insert(looks)
          .values({ userId, occasion, rationale, shopItems, garmentIds: garmentIds.filter((id) => z.uuid().safeParse(id).success) })
          .returning({ id: looks.id });
        return { saved: true, lookId: look.id };
      },
    }),
  };
}

export type StylistTools = ReturnType<typeof createStylistTools>;
export type StylistMessage = UIMessage<{ voice?: boolean }, never, InferUITools<StylistTools>>;
