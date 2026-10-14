# Stylist AI — Spec

Fast Forward hackathon · **Multi-modal Apps track** · + Shopify commerce challenge
Hard requirements: **Shopify, Vercel, Neon.** Submit by **4:00pm PT**.

## One-liner

A personal stylist in your pocket: snap a photo and your clothes become a searchable wardrobe. Ask (or *say*) "what should I wear to a rooftop dinner tonight?" and it builds an outfit from what you own. It shops Shopify for the missing pieces, or copies a look from any inspo photo.

## The 3-minute demo (build everything toward this)

1. **Snap** (30s): take a mirror selfie. In a few seconds it's segmented into cards ("navy linen overshirt", "white tee", "black chinos", "white sneakers"), each with a clean cutout and tags.
2. **Ask** (45s): "I've got a rooftop dinner in SF tonight, what should I wear?" The agent checks the weather (58°F, windy), pulls items from the wardrobe, and returns an outfit board with a reason for each choice.
3. **Copy a look** (45s): upload a Pinterest or street-style photo. It breaks the look down, matches pieces you already own, and marks the gaps ("you don't have a camel overcoat").
4. **Shop** (30s): for each gap it searches Shopify Catalog, including **image-similarity search** on the inspo crop. Real products show prices and a "Buy" link that goes to the Shopify checkout URL.
5. **Talk** (30s, stretch): tap the mic and have the same conversation by voice. The stylist talks back and calls the same tools mid-sentence.

## Features and tiers

| Tier | Feature | Notes |
|---|---|---|
| **P0** | Photo → garment extraction | Vision model returns structured items + bounding boxes, and we crop them. No separate segmentation model. |
| **P0** | Wardrobe grid + search | Filter by category/color/season, plus semantic search via pgvector ("something warm and cozy") |
| **P0** | Stylist chat agent | Tool-calling agent: `searchWardrobe`, `getWeather`, `searchShopify`, `saveLook` |
| **P0** | Shopify product cards | Image, title, price, seller, `checkout_url` |
| **P1** | Copy-a-look | Inspo photo → items → match to wardrobe (vector) → gaps → Shopify search with `like: image` |
| **P1** | Clean cutouts | Image-edit model turns each crop into a white-background "product shot" (big visual payoff) |
| **P1** | Voice stylist | AI Gateway realtime voice (a Vercel sponsor product, so no ElevenLabs needed), sharing the same tools |
| **P2** | Outfit preview | Image-gen of the full outfit on a model or as a flat lay |
| **P2** | Saved looks / history | Already in the schema, so UI only |

Cut order if behind: P2 → clean cutouts → voice → copy-a-look. **P0 must be deployed by 1:00pm.**

Stretch goals (virtual try-on, "unlock" scoring, mirror mode) live in [IF_TIME.md](IF_TIME.md).

## Architecture

```
Next.js 16 (App Router) on Vercel · mobile-first PWA (camera via <input capture>)
│
├─ /api/wardrobe/ingest   photo → Vercel Blob → vision model (structured output)
│                         → crop per bbox (sharp) → embed → Neon
├─ /api/chat              AI SDK 7 agent (streamText + tools) via AI Gateway
├─ /api/realtime/token    gateway.experimental_realtime.getToken()  (voice)
├─ /api/inspo             inspo photo → items → wardrobe match + Shopify gaps
└─ /.well-known/ucp       our hosted Shopify UCP agent profile (JSON)

Neon Postgres (+ pgvector)  ── Drizzle ORM
Vercel Blob                 ── original photos + garment crops
Vercel AI Gateway           ── every model call (one key, $100 credits, observability)
Shopify Catalog MCP         ── https://catalog.shopify.com/api/ucp/mcp
Open-Meteo                  ── weather, free, no key
```

All three sponsors are load-bearing, not bolted on: **Vercel** (hosting, AI Gateway, AI SDK, Blob, realtime voice), **Neon** (wardrobe + vector search), **Shopify** (Catalog MCP for discovery + checkout links).

## Models (all via AI Gateway, confirmed on the gateway model list today)

| Job | Default | Fallback |
|---|---|---|
| Garment detection + tagging (vision, structured output, bboxes) | `google/gemini-3.5-flash` | `anthropic/claude-sonnet-5.5` |
| Stylist agent (tool calling, taste) | `anthropic/claude-sonnet-5.5` | `openai/gpt-5.4` |
| Embeddings | `openai/text-embedding-3-small` (1536-d) | `google/gemini-embedding-2` |
| Clean cutout / image edit | `google/gemini-3.1-flash-image` | `bfl/flux-kontext-pro` |
| Outfit preview image | `meta/muse-image-1.0` (Meta is a co-host, worth a nod) | `openai/gpt-image-2` |
| Realtime voice | `openai/gpt-realtime-2` | `xai/grok-voice-think-fast-2.0` |

Using several models and modalities is itself a selling point for the multimodal track. Put a "powered by" strip in the demo.

## Data model (Neon)

```sql
create extension if not exists vector;

users      (id uuid pk, created_at)                      -- anonymous cookie user, no auth
photos     (id, user_id, blob_url, kind 'wardrobe'|'inspo', created_at)
garments   (id, user_id, photo_id, crop_url, cutout_url,
            category text,        -- top|bottom|outerwear|dress|shoes|accessory
            subcategory text,     -- "overshirt", "chinos"…
            name text,            -- "navy linen overshirt"
            colors text[], pattern text, material text,
            formality int,        -- 1 (lounge) … 5 (black tie)
            seasons text[], warmth int,  -- 1…5
            style_tags text[],    -- minimal, streetwear, preppy…
            bbox jsonb, embedding vector(1536), created_at)
looks      (id, user_id, occasion text, weather jsonb, garment_ids uuid[],
            shop_items jsonb, rationale text, preview_url, created_at)
```

Search = SQL filters (category, warmth ≥ N, formality range) + `order by embedding <=> $q`. The agent's `searchWardrobe` tool exposes both.

## Agent tools (shared by chat and voice)

| Tool | Input | Does |
|---|---|---|
| `searchWardrobe` | `query?, category?, minWarmth?, formality?, limit` | Hybrid filter + vector search in Neon |
| `getWeather` | `location, when?` | Open-Meteo geocode + forecast → temp, wind, rain chance |
| `searchShopify` | `query, imageUrl?, maxPriceCents?, color?, size?, gender?` | Catalog MCP `search_catalog` → trimmed product cards |
| `getProduct` | `id, color?, size?` | Catalog MCP `get_product` for variant + `checkout_url` |
| `saveLook` | `occasion, garmentIds, shopItems, rationale` | Insert into `looks` |
| `previewOutfit` (P2) | `lookId` | Image gen → Blob → update look |

The system prompt sets a stylist persona with clear rules: prefer owned items, explain each pick in one line, suggest buying only for real gaps, and always state the price.

## Shopify integration details

- Endpoint: `POST https://catalog.shopify.com/api/ucp/mcp` (JSON-RPC `tools/call`). Connect with the AI SDK MCP client over HTTP, or use a thin `fetch` wrapper since there are only 3 tools.
- Every call carries `meta["ucp-agent"].profile`, a URL to our **agent profile**. For dev, use Shopify's example profile URL. For the demo, serve our own at `/.well-known/ucp` on the Vercel deploy, declaring `dev.ucp.shopping.catalog.search`, `dev.ucp.shopping.catalog.lookup` and `dev.shopify.catalog.global`.
- `search_catalog` supports `query`, **`like` (image for visual similarity, or query + image for multimodal)**, and filters for price (minor units), `attributes` (Color/Size/Target gender), `ships_to`, `price_tier` and rating. That is exactly what copy-a-look needs.
- Responses include `media`, `price_range`, `variants[].checkout_url` and `seller`, enough for product cards and a Buy button. We don't do checkout ourselves.
- **First thing to verify (task 0):** one `tools/list` + one `search_catalog` call with curl, to confirm access and the rate-limit tier before building on it.

## Voice (P1)

AI SDK 7 `experimental_useRealtime` + `@ai-sdk/gateway`. The server route mints an ephemeral token, so the gateway key never reaches the browser. Server VAD handles turn-taking and barge-in. Tool calls arrive as client events: we run the same tool functions via a `/api/tools/[name]` route and send results back. It's beta, so timebox it to 1 hour; if it fights us, fall back to push-to-talk (STT `openai/whisper-1` → chat → TTS).

## Build timeline (today)

| Time | Milestone |
|---|---|
| 11:00–11:30 | Scaffold Next.js + shadcn, link Vercel, provision Neon + Blob via Marketplace, first deploy. Curl-test Shopify Catalog MCP. |
| 11:30–12:30 | Ingest pipeline (photo → items → crops → Neon) + wardrobe grid |
| 12:30–1:00 | Lunch. Stylist chat agent with `searchWardrobe` + `getWeather`, **deployed** |
| 1:00–2:00 | `searchShopify` + product cards, copy-a-look |
| 2:00–3:00 | Voice, clean cutouts, polish, seed a demo wardrobe |
| 3:00–4:00 | Freeze features. Test the prod link on a phone, write the submission, rehearse the 3-min demo twice |

Seed a demo wardrobe ahead of time (about 15 garments from 4–5 photos) so the demo never depends on a cold start.

## Suggested team split (up to 4)

- **A — Ingest + wardrobe:** vision extraction, crops/cutouts, Neon schema, wardrobe UI
- **B — Agent:** chat route, tools, prompt, outfit board UI
- **C — Commerce:** Shopify MCP client, agent profile, product cards, copy-a-look
- **D — Voice + demo:** realtime voice, PWA/mobile polish, seed data, submission + pitch

## Risks

| Risk | Mitigation |
|---|---|
| Catalog MCP access/rate limits | Verify at 11:00. Fallback: Storefront MCP on a single demo store (`{shop}.myshopify.com/api/mcp`) |
| Bbox crops are sloppy | Pad boxes 8%, and run the image-edit cutout step to hide the mess |
| Realtime voice beta breaks | Timeboxed, with push-to-talk fallback |
| Live demo latency | Seeded wardrobe, streaming UI with tool-call status chips ("checking weather…") |
| Venue Wi-Fi | Record a backup screen capture of the full flow by 3:30 |

## Open decisions

1. Team size, and who owns which slice?
2. Use Shopify's example agent profile for the whole day, or host our own (≈10 min)?
3. Any auth? Recommendation: none, use an anonymous cookie user id.
