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

export const updateFloor = mutation({
  args: {
    _id: v.id("floors"),
    level: v.number(),
    name: v.string(),
    floorPlanUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args._id, {
      level: args.level,
      name: args.name,
      floorPlanUrl: args.floorPlanUrl,
    });
    return args._id;
  },
});

export const deleteFloor = mutation({
  args: { _id: v.id("floors") },
  handler: async (ctx, args) => {
    const nodes = await ctx.db.query("nodes").filter((q) => q.eq(q.field("floorId"), args._id)).collect();
    for (const node of nodes) {
      await ctx.db.delete(node._id);
    }

    const destinations = await ctx.db.query("destinations").filter((q) => q.eq(q.field("floorId"), args._id)).collect();
    for (const destination of destinations) {
      await ctx.db.delete(destination._id);
    }

    await ctx.db.delete(args._id);
    return args._id;
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
    const nodeId = await ctx.db.insert("nodes", {
      floorId: args.floorId,
      label: args.label,
      isLandmark: args.isLandmark,
      landmarkType: args.landmarkType,
    });

    const existing = await ctx.db
      .query("qrCodes")
      .withIndex("by_entity", (q) => q.eq("entityType", "node").eq("entityId", nodeId))
      .first();

    if (!existing) {
      const content = `https://navi-mauve-mu.vercel.app/continue?entityType=node&entityId=${encodeURIComponent(String(nodeId))}&label=${encodeURIComponent(args.label)}`;
      await ctx.db.insert("qrCodes", {
        entityType: "node",
        entityId: String(nodeId),
        label: args.label,
        content,
        createdAt: Date.now(),
      });
    }

    return nodeId;
  },
});

export const updateNode = mutation({
  args: {
    _id: v.id("nodes"),
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
    await ctx.db.patch(args._id, {
      floorId: args.floorId,
      label: args.label,
      isLandmark: args.isLandmark,
      landmarkType: args.landmarkType,
    });

    const qrCode = await ctx.db
      .query("qrCodes")
      .withIndex("by_entity", (q) => q.eq("entityType", "node").eq("entityId", String(args._id)))
      .first();

    if (qrCode) {
      await ctx.db.patch(qrCode._id, {
        label: args.label,
        content: `https://navi-mauve-mu.vercel.app/continue?entityType=node&entityId=${encodeURIComponent(String(args._id))}&label=${encodeURIComponent(args.label)}`,
      });
    }

    return args._id;
  },
});

export const deleteNode = mutation({
  args: { _id: v.id("nodes") },
  handler: async (ctx, args) => {
    const incomingEdges = await ctx.db.query("connections").filter((q) => q.eq(q.field("fromNodeId"), args._id)).collect();
    for (const edge of incomingEdges) {
      await ctx.db.delete(edge._id);
    }

    const outgoingEdges = await ctx.db.query("connections").filter((q) => q.eq(q.field("toNodeId"), args._id)).collect();
    for (const edge of outgoingEdges) {
      await ctx.db.delete(edge._id);
    }

    const destinations = await ctx.db.query("destinations").filter((q) => q.eq(q.field("targetNodeId"), args._id)).collect();
    for (const destination of destinations) {
      const qr = await ctx.db
        .query("qrCodes")
        .withIndex("by_entity", (q) => q.eq("entityType", "destination").eq("entityId", String(destination._id)))
        .first();
      if (qr) await ctx.db.delete(qr._id);
      await ctx.db.delete(destination._id);
    }

    const qrCode = await ctx.db
      .query("qrCodes")
      .withIndex("by_entity", (q) => q.eq("entityType", "node").eq("entityId", String(args._id)))
      .first();

    if (qrCode) {
      await ctx.db.delete(qrCode._id);
    }

    await ctx.db.delete(args._id);
    return args._id;
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
    const destinationId = await ctx.db.insert("destinations", {
      name: args.name,
      aliases: args.aliases,
      floorId: args.floorId,
      description: args.description,
      targetNodeId: args.targetNodeId,
    });

    const existing = await ctx.db
      .query("qrCodes")
      .withIndex("by_entity", (q) => q.eq("entityType", "destination").eq("entityId", destinationId))
      .first();

    if (!existing) {
      const content = `https://navi-mauve-mu.vercel.app/continue?entityType=destination&entityId=${encodeURIComponent(String(destinationId))}&label=${encodeURIComponent(args.name)}`;
      await ctx.db.insert("qrCodes", {
        entityType: "destination",
        entityId: String(destinationId),
        label: args.name,
        content,
        createdAt: Date.now(),
      });
    }

    return destinationId;
  },
});

export const updateDestination = mutation({
  args: {
    _id: v.id("destinations"),
    name: v.string(),
    aliases: v.array(v.string()),
    floorId: v.id("floors"),
    description: v.string(),
    targetNodeId: v.id("nodes"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args._id, {
      name: args.name,
      aliases: args.aliases,
      floorId: args.floorId,
      description: args.description,
      targetNodeId: args.targetNodeId,
    });

    const qrCode = await ctx.db
      .query("qrCodes")
      .withIndex("by_entity", (q) => q.eq("entityType", "destination").eq("entityId", String(args._id)))
      .first();

    if (qrCode) {
      await ctx.db.patch(qrCode._id, {
        label: args.name,
        content: `https://navi-mauve-mu.vercel.app/continue?entityType=destination&entityId=${encodeURIComponent(String(args._id))}&label=${encodeURIComponent(args.name)}`,
      });
    }

    return args._id;
  },
});

export const deleteDestination = mutation({
  args: { _id: v.id("destinations") },
  handler: async (ctx, args) => {
    const qrCode = await ctx.db
      .query("qrCodes")
      .withIndex("by_entity", (q) => q.eq("entityType", "destination").eq("entityId", String(args._id)))
      .first();

    if (qrCode) {
      await ctx.db.delete(qrCode._id);
    }

    await ctx.db.delete(args._id);
    return args._id;
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

export const updateConnection = mutation({
  args: {
    _id: v.id("connections"),
    fromNodeId: v.id("nodes"),
    toNodeId: v.id("nodes"),
    imageUrl: v.string(),
    videoSegmentUrl: v.optional(v.string()),
    textDirection: v.string(),
    audioDescription: v.string(),
    estimatedWalkingTime: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args._id, {
      fromNodeId: args.fromNodeId,
      toNodeId: args.toNodeId,
      imageUrl: args.imageUrl,
      videoSegmentUrl: args.videoSegmentUrl,
      textDirection: args.textDirection,
      audioDescription: args.audioDescription,
      estimatedWalkingTime: args.estimatedWalkingTime,
    });
    return args._id;
  },
});

export const deleteConnection = mutation({
  args: { _id: v.id("connections") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args._id);
    return args._id;
  },
});

// --- FETCH QUERIES ---

export const ensureQrCodeRecords = mutation({
  args: {},
  handler: async (ctx) => {
    const nodes = await ctx.db.query("nodes").collect();
    const destinations = await ctx.db.query("destinations").collect();

    const createQr = async (entityType: "node" | "destination", entityId: string, label: string) => {
      const existing = await ctx.db
        .query("qrCodes")
        .withIndex("by_entity", (q) => q.eq("entityType", entityType).eq("entityId", entityId))
        .first();

      if (existing) return;

      const content = `https://navi-mauve-mu.vercel.app/continue?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}&label=${encodeURIComponent(label)}`;

      await ctx.db.insert("qrCodes", {
        entityType,
        entityId,
        label,
        content,
        createdAt: Date.now(),
      });
    };

    for (const node of nodes) {
      await createQr("node", String(node._id), node.label);
    }

    for (const destination of destinations) {
      await createQr("destination", String(destination._id), destination.name);
    }

    return { created: true };
  },
});

export const listAllData = query({
  args: {},
  handler: async (ctx) => {
    const floors = await ctx.db.query("floors").order("asc").collect();
    const nodes = await ctx.db.query("nodes").collect();
    const destinations = await ctx.db.query("destinations").collect();
    const connections = await ctx.db.query("connections").collect();
    const qrCodes = await ctx.db.query("qrCodes").collect();
    
    return { floors, nodes, destinations, connections, qrCodes };
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});