# Stylist AI: Design Decisions

Decided 2026-10-14. These sit alongside [SPEC.md](SPEC.md), which covers features, architecture and the demo script.

## 1. Visual direction: chic

We explored three directions (playful, chic, minimal) and chose **chic**: Aritzia-style, editorial and warm-neutral.

| Token | Value |
|---|---|
| Display font | Cormorant Garamond (300/400, with italic for emphasis) |
| UI font | Jost (300/400). Labels are uppercase, 10–11px, letter-spacing .22em |
| Bone (page) | `#f4f0e9` |
| Paper (panels) | `#faf8f4` |
| Sand (image tiles) | `#e9e2d6` |
| Oat | `#ddd3c3` |
| Ink (text, primary buttons) | `#1c1a17` |
| Espresso (dark surfaces, nav rail) | `#161412` |
| Taupe (secondary text) | `#857a6c` |
| Gold (accent: stylist orb, checks, "unlocks") | `#c9a24a` |

Rules: square corners on cards and buttons. Garment images sit on sand 3:4 tiles. Use serif italics for anything the user or the stylist *says*. Gold is reserved for the stylist and its results.

## 2. It's an app, not a website

The first chic page read like a fashion e-commerce site. The product should feel like a **multimodal app**:
- Camera, voice, image and text are first-class inputs that are always reachable, not buried in a page.
- A persistent app shell (nav rail on desktop, tab bar on phone) replaces scroll-down marketing sections.
- The stylist is a live presence (gold orb with listening, thinking and speaking states), not a chat log.

## 3. Two versions, one web app, desktop first

| | Desktop | Phone |
|---|---|---|
| Based on | **Studio** prototype ([chic-studio.html](chic-studio.html)) | **Lens** prototype ([chic-lens.html](chic-lens.html)) |
| Layout | Nav rail · outfit canvas + wardrobe tray · stylist panel | Tab bar with the camera as the centre button |
| Priority | **Build first** | Build second |

- There's one codebase and one URL. The layout switches on screen width, so the phone version is the same app with a different shell, not a separate project.
- We're building desktop first because judges open a submitted link on a laptop, and the live demo is presented from a laptop.
- Since desktop gets its own real layout, we no longer need the "phone in a frame" preview on desktop.

## 4. Hosting and distribution

- **Now:** a web app on **Vercel**, made installable as a **PWA** (manifest + icons, so "Add to Home Screen" or the desktop install button opens it in its own window).
- **Later (if the product continues):** a native phone app with **Expo** (React Native) through TestFlight and the stores. The backend (API routes, AI Gateway, Neon, Shopify) stays on Vercel, so today's server work carries over and only the UI layer is rebuilt.
- Vercel doesn't host native app binaries. It hosts the web app and the backend.

## 5. Must-have UX in both versions

1. **Onboarding before the wardrobe.** On first run, show four steps in demo order with progress:
   1. Photograph your wardrobe (camera)
   2. Ask, or simply speak (voice)
   3. Copy any look (image)
   4. Shop only the gaps (Shopify)
2. **Wardrobe you can browse.** It's a real section, not just something the stylist reads from:
   - Categories: All · Tops · Bottoms · Outerwear · Shoes · Accessories, with counts.
   - **Accessories sub-categories:** Bags · Necklaces · Earrings · Glasses · Rings · Hats · Belts.
   - Search by feel (semantic search, e.g. "something warm and cozy") and a colour filter.
   - **Piece detail:** image, category/shade, tags, times worn, number of looks it's in, formality, date added, and a "Style this piece" button.
3. **The outfit as a board.** Owned pieces appear with a one-line reason each. A missing piece shows as an empty slot that turns into a Shopify product (price, seller, "pairs with N pieces · M new looks", checkout link).
4. **Copy a look.** Upload an inspiration image, get a numbered breakdown of pieces, mark what's owned, and offer "Shop" for what's missing.
5. **Music.** An optional lounge track:
   - Off by default (browsers block autoplay anyway). Toggle with the nav button or **M**.
   - **Fades down automatically while the mic is listening**, so it never fights the voice demo.
   - The prototype synthesises it with Web Audio (no audio file or licensing). It could be swapped for a licensed track later.
6. **A "Powered by" strip:** Vercel · Neon · Shopify · AI Gateway (requested in SPEC.md).

## 6. Demo and presenting

- **Submit** the Vercel production URL. Present from the laptop on the desktop layout.
- **Scripted demo mode behind `?demo`.** Arrow keys step through the 3-minute script using seeded data, and `#n` deep-links to a step for rehearsal. It's the fallback if Wi-Fi or a model call fails on stage, and the source for the backup screen recording. The default mode uses real data.
- **Optional live moment:** mirror a phone (macOS Screen Mirroring, or QuickTime with a cable) for the real camera snap once the phone layout exists.
- Camera on desktop means an upload (file picker or drag-and-drop). Voice uses the laptop mic and needs HTTPS, which Vercel provides.

## 7. Prototypes (reference only)

Static HTML next to this file, kept to lock the design. **They aren't app code.**

| File | Status |
|---|---|
| [chic-studio.html](chic-studio.html) | ✅ Desktop source of truth |
| [chic-lens.html](chic-lens.html) | ✅ Phone source of truth |
| [chic-kit.js](chic-kit.js) | Shared by both: mock data, garment art, music engine. Port the data shape and music; replace the art with real cutouts. |

Open the HTML files directly in a browser, or serve this folder: `python3 -m http.server 4321 --directory docs`. Use ← → to step through the demo flow, and `#n` in the URL to jump to a step.

The other explorations (playful, minimal, the website-style chic page, and the voice-first "Atelier") stayed local and aren't committed. Atelier's orb states (listening, thinking, speaking) are worth reusing in both versions.

## 8. Open questions

- Desktop breakpoint, and whether tablet gets the desktop or phone shell (suggestion: desktop at ≥1024px).
- Whether the canvas supports drag-to-rearrange in v1 or stays a fixed layout.
- Real garment images: clean cutouts (P1 in the spec) vs raw crops. The design assumes cutouts on sand tiles.
