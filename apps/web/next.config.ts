import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server (HMR, /_next/*) be reached through an ngrok tunnel.
  allowedDevOrigins: ["aliens-storable-consumer.ngrok-free.dev"],
};

export default nextConfig;
