// Shared mock data, garment art and lounge-music engine for the chic app prototypes.
// Plain script (no modules) so the HTML files also open straight from disk.

(() => {
  // ---------- garment art ----------
  // [filled body, detail strokes, details use garment colour (for jewellery/handles)]
  const SHAPES = {
    tee: ["M30 22 L42 16 Q50 23 58 16 L70 22 L84 34 L74 44 L68 40 L68 84 L32 84 L32 40 L26 44 L16 34 Z", "M42 16 Q50 26 58 16"],
    overshirt: ["M32 16 L44 12 L50 20 L56 12 L68 16 L80 28 L86 72 L76 74 L70 40 L70 88 L30 88 L30 40 L24 74 L14 72 L20 28 Z", "M50 20 L50 88 M38 34 L46 34 L46 42 L38 42 Z M54 34 L62 34 L62 42 L54 42 Z"],
    knit: ["M34 16 Q50 24 66 16 L80 26 L86 74 L76 76 L70 40 L70 84 L30 84 L30 40 L24 76 L14 74 L20 26 Z", "M30 78 L70 78 M38 18 Q50 27 62 18"],
    chinos: ["M32 12 L68 12 L72 88 L56 88 L50 36 L44 88 L28 88 Z", "M32 18 L68 18 M50 18 L50 36"],
    jeans: ["M32 12 L68 12 L74 88 L57 88 L50 38 L43 88 L26 88 Z", "M32 18 L68 18 M50 18 L50 38 M35 22 Q41 30 46 22 M54 22 Q59 30 65 22"],
    skirt: ["M36 16 L64 16 L82 84 L18 84 Z", "M36 22 L64 22 M42 22 L34 84 M50 22 L50 84 M58 22 L66 84"],
    dress: ["M40 10 L44 10 Q50 20 56 10 L60 10 L62 30 L58 40 L78 90 L22 90 L42 40 L38 30 Z", "M42 40 L58 40"],
    coat: ["M34 10 L44 8 L50 30 L56 8 L66 10 L80 22 L86 80 L76 82 L72 44 L72 92 L28 92 L28 44 L24 82 L14 80 L20 22 Z", "M44 8 L40 30 L50 46 M56 8 L60 30 L50 46 M50 46 L50 92"],
    sneakers: ["M12 66 Q14 48 30 46 L44 44 Q52 53 66 56 L84 60 Q91 62 89 70 L89 76 L12 76 Z", "M12 69 L89 69 M38 50 L46 54 M42 47 L50 51"],
    loafers: ["M12 68 Q14 54 30 52 L56 52 Q74 54 86 62 Q91 66 87 73 L12 73 Z", "M48 56 Q58 54 66 58 M12 70 L87 70"],
    bag: ["M22 40 L78 40 L84 86 L16 86 Z", "M36 40 Q36 18 50 18 Q64 18 64 40", true],
    necklace: ["M46 70 Q50 64 54 70 L50 80 Z", "M20 16 Q50 96 80 16", true],
    earrings: ["M30 50 Q20 64 30 74 Q40 64 30 50 Z M70 50 Q60 64 70 74 Q80 64 70 50 Z", "M30 50 L30 36 Q30 30 36 31 M70 50 L70 36 Q70 30 76 31", true],
    glasses: ["M12 42 L42 42 L42 54 Q42 66 27 66 Q12 66 12 54 Z M58 42 L88 42 L88 54 Q88 66 73 66 Q58 66 58 54 Z", "M42 47 Q50 40 58 47 M12 44 L4 40 M88 44 L96 40", true],
    ring: ["M42 30 L58 30 L62 37 L50 46 L38 37 Z", "M32 64 A18 18 0 1 0 68 64 A18 18 0 1 0 32 64", true],
    hat: ["M30 58 Q30 30 50 30 Q70 30 70 58 Z M8 60 Q50 50 92 60 Q50 70 8 60 Z", "M30 52 L70 52"],
    belt: ["M6 44 L94 44 L94 56 L6 56 Z", "M62 40 L76 40 L76 60 L62 60 Z M69 50 L80 50", true],
  };

  function art(kind, color, style = "") {
    const [body, details, tinted] = SHAPES[kind];
    const strokeDetails = tinted ? `stroke="${color}" stroke-width="3.2"` : "";
    return `<svg viewBox="0 0 100 100" style="${style}" aria-hidden="true"><g stroke="rgba(28,26,23,.32)" stroke-width=".8" stroke-linejoin="round" stroke-linecap="round">
      <path d="${body}" fill="${color}"/><path d="${details}" fill="none" ${strokeDetails}/></g></svg>`;
  }

  // ---------- data ----------
  const CATEGORIES = [
    { name: "All" },
    { name: "Tops" },
    { name: "Bottoms" },
    { name: "Outerwear" },
    { name: "Shoes" },
    { name: "Accessories", subs: ["All", "Bags", "Necklaces", "Earrings", "Glasses", "Rings", "Hats", "Belts"] },
  ];

  const WARDROBE = [
    { id: "g1", name: "Linen Overshirt", shade: "Navy", kind: "overshirt", cat: "Tops", color: "#2f3e5c" },
    { id: "g2", name: "Cotton Crew Tee", shade: "Optic White", kind: "tee", cat: "Tops", color: "#faf8f4" },
    { id: "g3", name: "Tapered Chino", shade: "Black", kind: "chinos", cat: "Bottoms", color: "#23221f" },
    { id: "g4", name: "Leather Court Sneaker", shade: "Off White", kind: "sneakers", cat: "Shoes", color: "#efede8" },
    { id: "g5", name: "Merino Crewneck", shade: "Oatmeal", kind: "knit", cat: "Tops", color: "#cdbb9c" },
    { id: "g6", name: "Straight Jean", shade: "Light Wash", kind: "jeans", cat: "Bottoms", color: "#9bb0c8" },
    { id: "g7", name: "Suede Penny Loafer", shade: "Tobacco", kind: "loafers", cat: "Shoes", color: "#7a5236" },
    { id: "g8", name: "Pleated Midi Skirt", shade: "Black", kind: "skirt", cat: "Bottoms", color: "#2a2826" },
    { id: "g9", name: "Slip Dress", shade: "Champagne", kind: "dress", cat: "Tops", color: "#d8c3a0" },
    { id: "a1", name: "Leather Tote", shade: "Tan", kind: "bag", cat: "Accessories", sub: "Bags", color: "#b8875a" },
    { id: "a2", name: "Fine Chain Pendant", shade: "14k Gold", kind: "necklace", cat: "Accessories", sub: "Necklaces", color: "#c9a24a" },
    { id: "a3", name: "Pearl Drop Earrings", shade: "Ivory", kind: "earrings", cat: "Accessories", sub: "Earrings", color: "#efe7d6" },
    { id: "a4", name: "Oval Sunglasses", shade: "Tortoise", kind: "glasses", cat: "Accessories", sub: "Glasses", color: "#5b3a22" },
    { id: "a5", name: "Signet Ring", shade: "Gold", kind: "ring", cat: "Accessories", sub: "Rings", color: "#c9a24a" },
    { id: "a6", name: "Wool Fedora", shade: "Camel", kind: "hat", cat: "Accessories", sub: "Hats", color: "#a67c52" },
    { id: "a7", name: "Leather Belt", shade: "Espresso", kind: "belt", cat: "Accessories", sub: "Belts", color: "#3b2a20" },
  ];

  // Details shown when you open a piece in the wardrobe.
  const DETAILS = {
    g1: { tags: ["Linen", "Smart casual", "Spring · Summer"], warmth: 2, formality: 3, worn: 14, looks: 6, added: "Mirror photo · Oct 2" },
    g2: { tags: ["Cotton", "Basic", "All season"], warmth: 1, formality: 1, worn: 31, looks: 11, added: "Mirror photo · Oct 2" },
    g3: { tags: ["Cotton twill", "Tailored"], warmth: 2, formality: 3, worn: 19, looks: 9, added: "Mirror photo · Oct 2" },
    a2: { tags: ["14k gold", "Fine jewellery", "Everyday"], warmth: 0, formality: 3, worn: 22, looks: 7, added: "Mirror photo · Oct 5" },
  };
  const details = (id) => DETAILS[id] || { tags: ["Everyday"], warmth: 2, formality: 2, worn: 6, looks: 3, added: "Mirror photo · Oct 2" };

  const OUTFIT = [
    { id: "g1", why: "Linen breathes; the long sleeve blocks the wind." },
    { id: "g2", why: "A clean base keeps it relaxed, never stiff." },
    { id: "g3", why: "Black, tapered — enough polish for dinner." },
    { id: "g7", why: "Suede over sneakers once the sun is down." },
    { id: "a2", why: "A fine chain catches the candlelight." },
  ];

  const MISSING = {
    title: "Camel Wool-Blend Overcoat",
    seller: "Everlane",
    price: "$198",
    kind: "coat",
    color: "#b98b5e",
    why: "Nothing you own is warm enough for 58° with wind.",
    unlocks: "Pairs with 9 of your pieces · 14 new looks",
  };

  const INSPO = {
    caption: "Street style, Paris",
    pieces: [
      { label: "Camel overcoat", match: null },
      { label: "White tee", match: "g2" },
      { label: "Black trousers", match: "g3" },
      { label: "Brown loafers", match: "g7" },
      { label: "Oval sunglasses", match: "a4" },
    ],
  };

  const PROMPT = "I've got a rooftop dinner in SF tonight. What should I wear?";
  const WEATHER = { place: "San Francisco", temp: "58°", detail: "Windy · clear after 7pm" };

  // Onboarding: one card per capability, in demo order.
  const FEATURES = [
    { n: "01", mode: "Camera", title: "Photograph your wardrobe", body: "One mirror photo becomes a catalogued wardrobe — every piece cut out, named and tagged." },
    { n: "02", mode: "Voice", title: "Ask, or simply speak", body: "Tell your stylist where you're going. It reads the forecast and dresses you from what you own." },
    { n: "03", mode: "Image", title: "Copy any look", body: "Share an image you love. We match it to your wardrobe and name what's missing." },
    { n: "04", mode: "Shop", title: "Shop only the gaps", body: "Missing pieces sourced from Shopify, with how many new looks each one unlocks." },
  ];

  const byId = (id) => WARDROBE.find((g) => g.id === id);

  function filterWardrobe(cat, sub = "All") {
    return WARDROBE.filter((g) => (cat === "All" || g.cat === cat) && (cat !== "Accessories" || sub === "All" || g.sub === sub));
  }

  // ---------- music: generative late-night lounge, Web Audio only ----------
  // Off by default (browsers block autoplay anyway). duck(true) while the mic is live.
  const Music = (() => {
    let ctx, out, bus, noise, timer, step = 0, next = 0;
    let playing = false, ducked = false;
    const listeners = new Set();
    const BPM = 84, EIGHTH = 60 / BPM / 2, VOL = 0.2;
    // Dm9 · G13 · Cmaj9 · Am9
    const CHORDS = [[50, 57, 60, 64, 65], [43, 53, 57, 59, 64], [48, 55, 59, 62, 64], [45, 55, 60, 64, 67]];
    const BASS = [[38, 45], [43, 50], [36, 43], [45, 40]];
    const hz = (m) => 440 * 2 ** ((m - 69) / 12);

    function setup() {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      out = ctx.createGain();
      out.gain.value = 0;
      out.connect(ctx.destination);
      bus = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2600;
      const verb = ctx.createConvolver();
      const len = ctx.sampleRate * 2.4;
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
      }
      verb.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.35;
      bus.connect(lp);
      lp.connect(out);
      lp.connect(verb);
      verb.connect(wet);
      wet.connect(out);
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
      const nd = noise.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    }

    function env(node, t, peak, attack, hold, release) {
      node.gain.setValueAtTime(0, t);
      node.gain.linearRampToValueAtTime(peak, t + attack);
      node.gain.setTargetAtTime(peak * 0.4, t + attack, hold);
      node.gain.setTargetAtTime(0, t + attack + hold, release);
    }

    function keys(m, t, dur, vel) {
      const g = ctx.createGain();
      [["sine", 0], ["triangle", 4]].forEach(([type, detune]) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = hz(m);
        o.detune.value = detune;
        o.connect(g);
        o.start(t);
        o.stop(t + dur + 1.5);
      });
      env(g, t, 0.05 * vel, 0.015, dur, 0.35);
      g.connect(bus);
    }

    function bass(m, t, dur) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = hz(m);
      env(g, t, 0.28, 0.01, dur, 0.12);
      o.connect(g);
      g.connect(bus);
      o.start(t);
      o.stop(t + dur + 0.6);
    }

    function hit(t, freq, type, vel, len) {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      s.connect(f);
      f.connect(g);
      g.connect(bus);
      s.start(t);
      s.stop(t + len + 0.05);
    }

    function kick(t) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g);
      g.connect(bus);
      o.start(t);
      o.stop(t + 0.4);
    }

    function schedule() {
      while (next < ctx.currentTime + 0.2) {
        const s = step % 8, bar = Math.floor(step / 8) % 4, beat = EIGHTH * 2;
        const chord = CHORDS[bar];
        if (s === 0) chord.forEach((m) => keys(m + 12, next, beat * 2, 1));
        if (s === 5) chord.slice(1).forEach((m) => keys(m + 12, next, beat * 0.8, 0.6));
        if (s === 0) bass(BASS[bar][0], next, beat * 1.4);
        if (s === 3) bass(BASS[bar][1], next, beat * 0.5);
        if (s === 6) bass(BASS[bar][0] + 12, next, beat * 0.6);
        if (s === 0 || s === 5) kick(next);
        if (s === 2 || s === 6) hit(next, 1800, "bandpass", 0.12, 0.18);
        hit(next + (s % 2 ? EIGHTH * 0.16 : 0), 8000, "highpass", s % 2 ? 0.035 : 0.06, 0.05);
        if (s % 2 && Math.random() < 0.3) keys(chord[1 + Math.floor(Math.random() * 4)] + 24, next, beat * 0.5, 0.5);
        next += EIGHTH;
        step++;
      }
    }

    function level() {
      return playing ? (ducked ? VOL * 0.15 : VOL) : 0;
    }

    function apply() {
      if (!ctx) return;
      out.gain.setTargetAtTime(level(), ctx.currentTime, 0.4);
      listeners.forEach((fn) => fn(playing));
    }

    return {
      get playing() { return playing; },
      track: "Rive Gauche — late lounge",
      toggle() {
        if (!ctx) setup();
        playing = !playing;
        if (playing) {
          ctx.resume();
          next = ctx.currentTime + 0.05;
          clearInterval(timer);
          timer = setInterval(schedule, 50);
        } else {
          setTimeout(() => { if (!playing) clearInterval(timer); }, 1200);
        }
        apply();
      },
      duck(on) { ducked = on; apply(); },
      onChange(fn) { listeners.add(fn); },
    };
  })();

  window.Kit = { details, SHAPES, art, CATEGORIES, WARDROBE, OUTFIT, MISSING, INSPO, PROMPT, WEATHER, FEATURES, byId, filterWardrobe, Music };
})();
