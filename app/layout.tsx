import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "RGB Life | 色から生まれる、3つの世界", description: "画像を種にして、赤・緑・青のライフゲームを同時に育てる。" };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ja"><body>{children}</body></html>; }
