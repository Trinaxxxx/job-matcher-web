import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the workspace root so a stray lockfile in a parent folder is ignored.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
