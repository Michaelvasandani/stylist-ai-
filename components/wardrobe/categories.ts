import type { GarmentCard } from "@/lib/wardrobe";

// UI groupings from docs/DESIGN.md §5.2, mapped onto the DB categories.
export const UI_CATEGORIES = [
  { name: "All", match: () => true },
  { name: "Tops", match: (g: GarmentCard) => g.category === "top" || g.category === "dress" },
  { name: "Bottoms", match: (g: GarmentCard) => g.category === "bottom" },
  { name: "Outerwear", match: (g: GarmentCard) => g.category === "outerwear" },
  { name: "Shoes", match: (g: GarmentCard) => g.category === "shoes" },
  { name: "Accessories", match: (g: GarmentCard) => g.category === "accessory" },
] as const;

export type UiCategory = (typeof UI_CATEGORIES)[number]["name"];

export const ACCESSORY_SUBS = [
  { name: "Bags", sub: "bag" },
  { name: "Necklaces", sub: "necklace" },
  { name: "Earrings", sub: "earrings" },
  { name: "Glasses", sub: "glasses" },
  { name: "Rings", sub: "ring" },
  { name: "Hats", sub: "hat" },
  { name: "Belts", sub: "belt" },
] as const;

export function matchesCategory(g: GarmentCard, cat: UiCategory, sub: string | null) {
  if (!UI_CATEGORIES.find((c) => c.name === cat)!.match(g)) return false;
  return cat !== "Accessories" || !sub || g.subcategory === sub;
}

export const shade = (g: GarmentCard) => g.colors[0] ?? "";
export const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
