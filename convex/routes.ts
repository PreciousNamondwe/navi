import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

interface WayfindingSlide {
  id: string;
  stepTitle: string;
  originNodeLabel: string;
  targetNodeLabel: string;
  textDirection: string;
  description: string;
  walkingTime: number;
  image: string; // Will hold the fully evaluated storage HTTP download path
  isLandmark: boolean;
  landmarkType?: string;
}

export const getWayfindingSequence = query({
  args: {
    transcriptInput: v.string(),
  },
  handler: async (ctx, args) => {
    const searchIntent = args.transcriptInput.trim().toLowerCase();
    if (!searchIntent) return null;

    // 1. Fetch destinations and execute sanitized substring matching
    const allDestinations = await ctx.db.query("destinations").collect();
    const matchedDestination = allDestinations.find((dest) => {
      const normalizedName = (dest.name || "").toLowerCase();
      const nameMatch = searchIntent.includes(normalizedName) || normalizedName.includes(searchIntent);
      
      const aliasMatch = Array.isArray(dest.aliases) && dest.aliases.some((alias) => {
        const normalizedAlias = (alias || "").toLowerCase();
        return searchIntent.includes(normalizedAlias) || normalizedAlias.includes(searchIntent);
      });
      
      return nameMatch || aliasMatch;
    });

    if (!matchedDestination) {
      console.log(`[Wayfinding] No text match found in DB destinations for user input: "${searchIntent}"`);
      return null;
    }

    // 2. Locate our anchored Starting Point 
    let startNode = await ctx.db
      .query("nodes")
      .filter((q) => q.eq(q.field("label"), "Main Entrance Reception"))
      .first();

    // STRICT BASELINE SAFEGUARD: If it's missing, fail gracefully with instructions
    if (!startNode) {
      console.error("❌ CRITICAL: 'Main Entrance Reception' anchor node is missing from your 'nodes' table database layer!");
      return null;
    }

    if (startNode._id === matchedDestination.targetNodeId) {
      console.log("[Wayfinding]: User is already at the requested destination node.");
      return null;
    }

    // 3. Graph Pathfinding engine (BFS) to discover the shortest path vector
    const pathEdges = await findShortestPath(
      ctx,
      startNode._id,
      matchedDestination.targetNodeId
    );

    if (!pathEdges || pathEdges.length === 0) {
      console.error(`[Graph Error]: Destination "${matchedDestination.name}" found, but no paths connect Start Node (${startNode.label}) to Target Node ID (${matchedDestination.targetNodeId}) in your 'connections' table.`);
      return null;
    }

    // 4. Transform the connections/edges into the sequential UI Slide Array
    const slides: WayfindingSlide[] = [];
    
    for (let i = 0; i < pathEdges.length; i++) {
      const edge = pathEdges[i];
      const fromNode = await ctx.db.get(edge.fromNodeId);
      const toNode = await ctx.db.get(edge.toNodeId);

      if (fromNode && toNode) {
        // Resolve the raw storage ID (e.g., kg22e35g...) into an authorized, viewable CDN URL
        let resolvedImageUrl = "";
        if (edge.imageUrl) {
          try {
            const publicUrl = await ctx.storage.getUrl(edge.imageUrl);
            if (publicUrl) {
              resolvedImageUrl = publicUrl;
            }
          } catch (storageErr) {
            console.warn(`[Storage Warning]: Could not resolve URL for file ID ${edge.imageUrl}, passing fallback identifier.`);
          }
        }

        slides.push({
          id: edge._id,
          stepTitle: `Step ${i + 1}: Move toward ${toNode.label}`,
          originNodeLabel: fromNode.label,
          targetNodeLabel: toNode.label,
          textDirection: edge.textDirection,
          description: edge.audioDescription,
          walkingTime: edge.estimatedWalkingTime,
          image: resolvedImageUrl, // Now contains a clean, viewable https:// URL string
          isLandmark: toNode.isLandmark,
          landmarkType: toNode.landmarkType,
        });
      }
    }

    return {
      destination: matchedDestination.name,
      slides: slides,
    };
  },
});

async function findShortestPath(
  ctx: any,
  startNodeId: Id<"nodes">,
  targetNodeId: Id<"nodes">
): Promise<Doc<"connections">[] | null> {
  const queue: { currentNodeId: Id<"nodes">; path: Doc<"connections">[] }[] = [
    { currentNodeId: startNodeId, path: [] },
  ];
  const visited = new Set<string>([startNodeId]);

  while (queue.length > 0) {
    const currentItem = queue.shift();
    if (!currentItem) continue;

    const { currentNodeId, path } = currentItem;

    if (currentNodeId === targetNodeId) {
      return path;
    }

    const outgoingEdges = await ctx.db
      .query("connections")
      .withIndex("by_fromNode", (q: any) => q.eq("fromNodeId", currentNodeId))
      .collect();

    for (const edge of outgoingEdges) {
      if (!visited.has(edge.toNodeId)) {
        visited.add(edge.toNodeId);
        queue.push({
          currentNodeId: edge.toNodeId,
          path: [...path, edge],
        });
      }
    }
  }

  return null;
}