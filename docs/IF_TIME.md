# If We Have Time

Stretch goals, to pick up only after the P0/P1 features in [SPEC.md](SPEC.md) are deployed and working. Listed in recommended order.

## 1. Virtual try-on of Shopify products

**The pitch:** the stylist suggests a camel coat from Shopify, you tap **"See it on me"**, and an image-edit model puts that exact product onto your own mirror selfie. This is the moment people remember, it's multimodal at its peak, and it turns the commerce step from a list of links into something compelling. It closes the loop: own → gap → see it on you → buy.

**Scope:** replaces the generic "outfit preview" (P2) in the spec. It's the same image call with different inputs, so it adds no new scope.

**How:**
- Inputs: the user's original mirror selfie (already in Vercel Blob from ingest) + the product image (`media[0].url` from Catalog MCP).
- Model: `google/gemini-3.1-flash-image` (multi-image edit) via AI Gateway. Fallbacks: `bfl/flux-kontext-pro`, `openai/gpt-image-2`.
- Prompt sketch: "Replace the person's [category] with the garment in image 2. Keep their face, pose, body, background and every other clothing item unchanged. Match lighting."
- Route: `POST /api/try-on { photoId, productImageUrl, category }` → Blob → return URL. Cache by `(photoId, productId)` so the demo is instant on repeat.
- UI: a "See it on me" button on each Shopify product card → before/after slider.

**Risk:** identity drift or a mangled face. Mitigation: pre-generate the demo try-ons, and pick a clean, front-facing, well-lit selfie for the demo.

## 2. "Unlock" scoring for shopping

**The pitch:** don't just say "buy something similar." Say **"This $120 coat works with 9 things you already own, which makes 14 new outfits."** It's smarter shopping logic than most commerce entries will have, and it gives the stylist a point of view.

**Scope:** about 1 hour.

**How:**
- After `searchShopify` returns candidates, run `scoreUnlock(product)` on the top ~5.
- Pull the wardrobe (it's small, so it fits in context) and ask the model with structured output: `{ compatibleGarmentIds: string[], outfitCount: number, bestOutfit: string[], reason: string }`.
- Cheaper alternative: embed the product's description and compute vector similarity + category/formality rule checks against the wardrobe in SQL, then let the LLM only count combinations.
- Sort the product cards by unlock score and show a badge on each: "Unlocks 14 outfits · pairs with 9 items." Tapping the badge shows the best new outfit.
- Expose it as an agent tool so the stylist can say it out loud in chat or voice.

## 3. "How do I look?" mirror mode

**The pitch:** while you're on a voice call, the stylist grabs a frame from your camera and critiques what you're actually wearing right now. Very impressive if it works.

**Scope:** stretch only, after everything else. It builds on realtime voice, which is itself beta.

**How:**
- During a voice session, keep a `getUserMedia` video stream open in a small mirror preview.
- On "how do I look?" (or a camera button), capture a frame to a canvas → JPEG → send it to the realtime session as an image input if the realtime model supports it.
- Fallback if realtime doesn't accept images: a `lookAtMe` tool. The voice model calls it, the client captures a frame, the server sends it to a vision model (`google/gemini-3.5-flash`) for a critique + garment match against the wardrobe, and the text goes back to the voice model to speak.
- Bonus: "add this to my wardrobe" sends the captured frame through the existing ingest pipeline.

**Risk:** realtime image-input support and latency. Verify with a 10-minute spike before committing.
