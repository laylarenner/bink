import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma ships a native query engine; keep it out of the bundler.
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
