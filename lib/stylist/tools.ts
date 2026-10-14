import { tool, type InferUITools, type UIMessage } from "ai";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, garments, looks } from "@/lib/db";
import { getProduct, searchCatalog, type ShopProduct } from "@/lib/shopify";
import { CATEGORIES } from "@/lib/vision";
import { listEvents } from "@/lib/google-calendar";
import { getWeather } from "@/lib/weather";
import { searchWardrobe, toGarmentCard, type GarmentCard } from "@/lib/wardrobe";

export type OutfitBoard = {
  title: string;
  occasion: string;
  vibe: string; // one or two words that set this look apart from the others, e.g. "Relaxed"
  // alternates: other pieces the stylist would accept in the same slot, best first.
  pieces: { garment: GarmentCard; reason: string; alternates?: GarmentCard[] }[];
  gaps: { label: string; category: string; reason: string }[];
};

// presentOutfit puts up to three takes on the brief; the board flips between them.
export type LookSet = { occasion: string; looks: OutfitBoard[] };

// The pieces the stylist read off an inspiration photo ("copy this look").
export type LookBreakdown = {
  vibe: string;
  pieces: { label: string; category: (typeof CATEGORIES)[number]; details: string }[];
};

// A form in the chat: which gaps to shop, and the budget and size for each.
export type ShoppingAsk = {
  pieces: { label: string; category: (typeof CATEGORIES)[number] }[];
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
// `exclude` skips products already shown, so "show me more" brings fresh options.
async function threeOptions(query: string, maxCents: number, size: string, exclude: string[] = []) {
  const search = (sizes?: string[]) =>
    searchCatalog({ query, maxPriceCents: maxCents, sizes, limit: exclude.length ? 24 : 12 }).then((ps) =>
      ps.filter((p) => p.price && p.price.amount <= maxCents && !exclude.includes(p.id)),
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

    getCalendarEvents: tool({
      description:
        "Read the user's upcoming events from their Google Calendar: title, time, location and notes (dress codes often live in the notes). Use when they ask what to wear for something coming up (\"tomorrow\", \"my dinner Friday\", \"this week\") or don't say where they're going.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(30).optional().describe("How far ahead to look; default 7"),
        query: z.string().optional().describe('Free-text match on the event, e.g. "wedding" or "dinner"'),
      }),
      execute: async ({ days, query }) => {
        const cal = await listEvents(userId, { days: days ?? 7, query });
        if (!cal) return { connected: false as const, events: [] };
        return { connected: true as const, timeZone: cal.timeZone, events: cal.events };
      },
    }),

    breakDownLook: tool({
      description:
        "When the user shares an inspiration photo to copy, call this first: list every visible piece of the look (top, bottom, shoes, layer, accessories) as you see it in the image. Then search their wardrobe for each piece.",
      inputSchema: z.object({
        vibe: z.string().describe('The look in a few words, e.g. "90s minimal, black and camel"'),
        pieces: z
          .array(
            z.object({
              label: z.string().describe('Short name, e.g. "camel wool overcoat"'),
              category: z.enum(CATEGORIES),
              details: z.string().describe("Colour, fit, fabric, length: what makes it this look"),
            }),
          )
          .min(1),
      }),
      execute: async (look): Promise<LookBreakdown> => look,
    }),

    presentOutfit: tool({
      description:
        "Put THREE distinct outfits on the user's board for one brief, e.g. a relaxed take, a polished take and a bolder take. Use only garment ids returned by searchWardrobe. Give each piece a one-line reason, plus up to 4 alternates: other ids from searchWardrobe that would also work in that slot, best first, so the user can flip through options. List anything genuinely missing from a look as a gap (don't shop yet). Every call replaces the board, so always send all three looks, including when revising one.",
      inputSchema: z.object({
        occasion: z.string(),
        looks: z
          .array(
            z.object({
              title: z.string().describe('Short editorial name, e.g. "Rooftop, after dark"'),
              vibe: z.string().describe('One or two words that set this look apart, e.g. "Relaxed", "Polished", "Bold", "Closest match"'),
              pieces: z
                .array(z.object({ garmentId: z.string(), reason: z.string(), alternates: z.array(z.string()).max(4).default([]) }))
                .min(1),
              gaps: z
                .array(z.object({ label: z.string().describe('e.g. "a warm camel layer"'), category: z.enum(CATEGORIES), reason: z.string() }))
                .default([]),
            }),
          )
          .min(1)
          .max(3),
      }),
      execute: async ({ occasion, looks: drafts }): Promise<LookSet> => {
        const ids = drafts
          .flatMap((l) => l.pieces.flatMap((p) => [p.garmentId, ...p.alternates]))
          .filter((id) => z.uuid().safeParse(id).success);
        const rows = ids.length
          ? await db.select().from(garments).where(and(eq(garments.userId, userId), inArray(garments.id, [...new Set(ids)])))
          : [];
        const byId = new Map(rows.map((g) => [g.id, toGarmentCard(g)]));
        return {
          occasion,
          looks: drafts.map(({ title, vibe, pieces, gaps }) => ({
            title,
            vibe,
            occasion,
            pieces: pieces.flatMap((p) =>
              byId.has(p.garmentId)
                ? [{ garment: byId.get(p.garmentId)!, reason: p.reason, alternates: p.alternates.flatMap((id) => byId.get(id) ?? []) }]
                : [],
            ),
            gaps,
          })),
        };
      },
    }),

    askShoppingDetails: tool({
      description:
        "Before shopping, show the user a short form to choose which gaps to shop on Shopify and give a budget and size for each. Use this instead of asking for budget and size in words. After calling it, stop and wait: their answers come back as their next message.",
      inputSchema: z.object({
        pieces: z
          .array(z.object({ label: z.string().describe("The gap, exactly as named on the board"), category: z.enum(CATEGORIES) }))
          .min(1),
      }),
      execute: async (ask): Promise<ShoppingAsk> => ask,
    }),

    shopForGap: tool({
      description:
        "Find exactly 3 real products on Shopify for one gap, within budget and in the user's size. Only call this once the user has told you BOTH their budget for this piece and their size; if either is unknown, ask first and wait for the answer. When they want more options for the same gap, call it again with the same gap and every product id already shown in excludeIds.",
      inputSchema: z.object({
        gap: z.string().describe('What it fills, e.g. "warm camel layer"'),
        query: z.string().describe('Shopping query with colour, gender and fit in the words, e.g. "women\'s camel wool overcoat"'),
        budgetUsd: z.number().positive().describe("The user's max spend for this piece, in US dollars"),
        size: z.string().describe('The user\'s size as they said it, e.g. "M", "8", "32x30", "US 9"'),
        excludeIds: z.array(z.string()).default([]).describe("Product ids already shown for this gap, to get fresh options"),
      }),
      execute: async ({ gap, query, budgetUsd, size, excludeIds }): Promise<ShopOptions> => {
        // Shopify's Color attribute filter is strict enough to return nothing; colour goes in the query instead.
        const { options, sizeMatched } = await threeOptions(query, Math.round(budgetUsd * 100), size, excludeIds);
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
