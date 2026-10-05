import type { NextConfig } from "next";
const config: NextConfig = { output: "export", trailingSlash: true, images: { unoptimized: true }, basePath: process.env.NEXT_PUBLIC_BASE_PATH || "" };
export default config;
