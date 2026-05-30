import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  rooms: defineTable({
    name: v.string(),
    floor: v.number(),
    description: v.string(),
    image: v.string(),
    x: v.number(),
    y: v.number(),
  }),

  routes: defineTable({
    from: v.string(),
    to: v.string(),
    distance: v.number(),
  }),
});