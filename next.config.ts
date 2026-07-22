import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['web-push'],
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
