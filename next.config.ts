import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack ignores lockfiles above this repo.
  turbopack: { root: __dirname },
};

export default nextConfig;
