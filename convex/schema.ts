// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // 1. FLOORS: Physical levels of the building framework
  floors: defineTable({
    level: v.number(),          // e.g., 0 for Ground, 1 for First Floor
    name: v.string(),           // e.g., "Ground Floor", "Basement"
    floorPlanUrl: v.optional(v.string()), // Convex Storage ID for blueprint image
  }),

  // 2. NODES: Waypoints/Coordinates inside the graph topology
  nodes: defineTable({
    floorId: v.id("floors"),    // Connects waypoint to a specific structural floor
    label: v.string(),          // e.g., "Main Entrance Reception", "Corridor Alpha Junction"
    isLandmark: v.boolean(),    // True if used as a visual anchor point for TTS orientation
    landmarkType: v.optional(
      v.union(
        v.literal("corridor"),
        v.literal("staircase"),
        v.literal("elevator"),
        v.literal("double-door")
      )
    ),
  }),

  // 3. CONNECTIONS (EDGES): One-way directional pathway routes between two nodes
  connections: defineTable({
    fromNodeId: v.id("nodes"),  // The structural starting waypoint of the step
    toNodeId: v.id("nodes"),    // The sequential arrival checkpoint waypoint
    imageUrl: v.string(),       // Convex Storage ID for the scene photograph
    videoSegmentUrl: v.optional(v.string()), // Optional URL streaming clip
    textDirection: v.string(),  // Instructions: "Turn right past the glass doors"
    audioDescription: v.string(), // Cadence optimized phrase for Speech Readout Engine
    estimatedWalkingTime: v.number(), // Traversal duration speed in seconds
  })
  // Indexing fromNodeId allows quick querying when checking where a user can go next
  .index("by_fromNode", ["fromNodeId"]), 

  // 4. DESTINATIONS: searchable user endpoints linked to physical node anchors
  destinations: defineTable({
    name: v.string(),           // Official room title: "Room 404", "ICT Lab"
    aliases: v.array(v.string()), // NLP search tags: ["404", "computer lab"]
    floorId: v.id("floors"),    // Floor layer assignment
    targetNodeId: v.id("nodes"), // The exact structural waypoint node the pathfinder navigates to
    description: v.string(),    // Summary info displayed on arrival
  }),
});