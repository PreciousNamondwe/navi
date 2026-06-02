// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ConvexClientProvider from "./ConvexCleintProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MUBAS ODeL Indoor Wayfinding Admin",
  description: "Kiosk Management Dashboard System Engine Layout",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Wrap your node injection layout structure clean here */}
        <ConvexClientProvider>
          {children}
        </ConvexClientProvider>
      </body>
    </html>
  );
}