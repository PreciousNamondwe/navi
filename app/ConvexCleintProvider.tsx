// app/ConvexClientProvider.tsx
"use client";

import React, { ReactNode } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

// Fallback protection for the URL string
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "";

if (!convexUrl) {
  console.warn("Convex Warning: NEXT_PUBLIC_CONVEX_URL is not set yet.");
}

const convex = new ConvexReactClient(convexUrl);

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProvider client={convex}>
      {children}
    </ConvexProvider>
  );
}