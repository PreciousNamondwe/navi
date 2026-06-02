// convex/admin.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// --- CREATE MUTATIONS ---

export const addFloor = mutation({
  args: {
    level: v.number(),
    name: v.string(),
    floorPlanUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("floors", {
      level: args.level,
      name: args.name,
      floorPlanUrl: args.floorPlanUrl,
    });
  },
});

export const addNode = mutation({
  args: {
    floorId: v.id("floors"),
    label: v.string(),
    isLandmark: v.boolean(),
    landmarkType: v.optional(
      v.union(
        v.literal("corridor"),
        v.literal("staircase"),
        v.literal("elevator"),
        v.literal("double-door")
      )
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("nodes", {
      floorId: args.floorId,
      label: args.label,
      isLandmark: args.isLandmark,
      landmarkType: args.landmarkType,
    });
  },
});

export const addDestination = mutation({
  args: {
    name: v.string(),
    aliases: v.array(v.string()),
    floorId: v.id("floors"),
    description: v.string(),
    targetNodeId: v.id("nodes"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("destinations", {
      name: args.name,
      aliases: args.aliases,
      floorId: args.floorId,
      description: args.description,
      targetNodeId: args.targetNodeId,
    });
  },
});

export const addConnection = mutation({
  args: {
    fromNodeId: v.id("nodes"),
    toNodeId: v.id("nodes"),
    imageUrl: v.string(),
    videoSegmentUrl: v.optional(v.string()),
    textDirection: v.string(),
    audioDescription: v.string(),
    estimatedWalkingTime: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("connections", {
      fromNodeId: args.fromNodeId,
      toNodeId: args.toNodeId,
      imageUrl: args.imageUrl,
      videoSegmentUrl: args.videoSegmentUrl,
      textDirection: args.textDirection,
      audioDescription: args.audioDescription,
      estimatedWalkingTime: args.estimatedWalkingTime,
    });
  },
});

// --- FETCH QUERIES ---

export const listAllData = query({
  args: {},
  handler: async (ctx) => {
    const floors = await ctx.db.query("floors").order("asc").collect();
    const nodes = await ctx.db.query("nodes").collect();
    const destinations = await ctx.db.query("destinations").collect();
    const connections = await ctx.db.query("connections").collect();
    
    return { floors, nodes, destinations, connections };
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});