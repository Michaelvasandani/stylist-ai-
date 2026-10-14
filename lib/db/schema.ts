import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const photos = pgTable("photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  blobUrl: text("blob_url").notNull(),
  kind: text("kind", { enum: ["wardrobe", "inspo"] }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const garments = pgTable(
  "garments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id).notNull(),
    photoId: uuid("photo_id").references(() => photos.id),
    cropUrl: text("crop_url"),
    cutoutUrl: text("cutout_url"),
    category: text("category", {
      enum: ["top", "bottom", "outerwear", "dress", "shoes", "accessory"],
    }).notNull(),
    subcategory: text("subcategory"),
    name: text("name").notNull(),
    colors: text("colors").array().default([]).notNull(),
    colorHex: text("color_hex"), // dominant colour, for swatches
    pattern: text("pattern"),
    material: text("material"),
    formality: integer("formality"), // 1 lounge … 5 black tie
    seasons: text("seasons").array().default([]).notNull(),
    warmth: integer("warmth"), // 1 … 5
    styleTags: text("style_tags").array().default([]).notNull(),
    bbox: jsonb("bbox").$type<{ x: number; y: number; w: number; h: number }>(),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("garments_user_idx").on(t.userId),
    index("garments_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export const looks = pgTable("looks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  occasion: text("occasion"),
  weather: jsonb("weather"),
  garmentIds: uuid("garment_ids").array().default([]).notNull(),
  shopItems: jsonb("shop_items").$type<unknown[]>().default([]).notNull(),
  rationale: text("rationale"),
  previewUrl: text("preview_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Garment = typeof garments.$inferSelect;
export type NewGarment = typeof garments.$inferInsert;
export type Look = typeof looks.$inferSelect;
