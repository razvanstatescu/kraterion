import type { NextConfig } from "next";

// Hostnames the dev server should accept HMR / asset fetches from. We
// derive these from the public origin set in `.env` so a Localcan or
// ngrok tunnel for OAuth testing works without ad-hoc edits. Localhost
// stays implicit (Next allows it by default).
const tunneledOrigin = process.env["DASHBOARD_ORIGIN"];
const tunnelHost = (() => {
  if (!tunneledOrigin) return null;
  try {
    return new URL(tunneledOrigin).host;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  transpilePackages: ["@kraterion/ui", "@kraterion/shared", "@kraterion/seal-client"],
  allowedDevOrigins: tunnelHost ? [tunnelHost] : [],
};

export default nextConfig;
