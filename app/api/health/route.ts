import { embed, generateText } from "ai";
import { list } from "@vercel/blob";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { MODELS } from "@/lib/models";
import { searchCatalog } from "@/lib/shopify";

// Smoke test for every external dependency: Neon, Blob, AI Gateway, Shopify Catalog.
export async function GET() {
  const check = async (fn: () => Promise<unknown>) => {
    const t = Date.now();
    try {
      const detail = await fn();
      return { ok: true, ms: Date.now() - t, detail };
    } catch (e) {
      return { ok: false, ms: Date.now() - t, error: e instanceof Error ? e.message : String(e) };
    }
  };

  const [neon, blob, gateway, embedding, shopify] = await Promise.all([
    check(async () => (await db.execute(sql`select count(*)::int as garments from garments`)).rows[0]),
    check(async () => ({ blobs: (await list({ limit: 1 })).blobs.length })),
    check(async () => (await generateText({ model: MODELS.vision, prompt: "Reply with just: ok" })).text.trim()),
    check(async () => ({ dims: (await embed({ model: MODELS.embedding, value: "navy linen overshirt" })).embedding.length })),
    check(async () => (await searchCatalog({ query: "camel wool overcoat", limit: 1 }))[0]?.title),
  ]);

  const all = { neon, blob, gateway, embedding, shopify };
  const ok = Object.values(all).every((c) => c.ok);
  return Response.json({ ok, ...all }, { status: ok ? 200 : 500 });
}
