import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@kraterion/ui", "@kraterion/shared", "@kraterion/seal-client"],
};

export default nextConfig;
