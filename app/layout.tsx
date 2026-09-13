import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "HK Pickup Radar · iPhone 库存监控";
const description = "监控香港 Apple Store 的 iPhone 18 Pro Max 1TB 到店取货库存。";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title,
    description,
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "Pickup Radar", statusBarStyle: "black-translucent" },
    openGraph: { title, description, images: [{ url: image, width: 1680, height: 945 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
