# stylist-ai

Your AI personal stylist: snap your wardrobe, get outfits for any occasion or weather, and shop the gaps on Shopify. Fast Forward hackathon, Multi-modal Apps track.

**Live:** https://stylist-ai-five.vercel.app · **System check:** [/api/health](https://stylist-ai-five.vercel.app/api/health)

Plan: [docs/SPEC.md](docs/SPEC.md) · Stretch goals: [docs/IF_TIME.md](docs/IF_TIME.md)

## Stack

- **Vercel**: Next.js 16, AI SDK 7, AI Gateway (all models), Blob (photos)
- **Neon**: Postgres + pgvector (wardrobe + semantic search), Drizzle ORM
- **Shopify**: Global Catalog MCP (`lib/shopify.ts`) for product search, image similarity and checkout links

## Setup

```bash
npm install
vercel link          # project: stylist-ai (team: Michael's projects)
vercel env pull .env.local
npm run dev
```

AI Gateway authenticates with `VERCEL_OIDC_TOKEN` from `vercel env pull`. It expires after about 12h locally, so re-run the pull if model calls start failing with 401s.

Schema changes: edit `lib/db/schema.ts`, then `npm run db:push`.

## Layout

| Path | What |
|---|---|
| `lib/db/` | Drizzle schema + Neon client |
| `lib/models.ts` | Model IDs for every job (swap models here) |
| `lib/shopify.ts` | `searchCatalog` / `getProduct` against Shopify Catalog MCP |
| `app/api/health` | Smoke test for Neon, Blob, Gateway, embeddings, Shopify |
| `lib/stylist/` | Stylist agent: persona prompt + tools (`searchWardrobe`, `getWeather`, `presentOutfit`, `shopForGap`, `saveLook`) |
| `app/api/chat` | Stylist turn (text and voice share it) |
| `app/api/voice/*` | Voice loop: `transcribe` (speech → text) and `speak` (text → speech) via AI Gateway |
| `components/studio/` | Studio: outfit board, stylist panel, hands-free voice hook |
