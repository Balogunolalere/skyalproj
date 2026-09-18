import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Type errors fail the build. `tsc --noEmit` is clean on this repo, so the
  // flag bought nothing but let any future type error ship silently.
  reactStrictMode: false,
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
