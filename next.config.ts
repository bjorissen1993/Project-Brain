import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Keep Turbopack rooted in this app even if a parent folder has a lockfile.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
