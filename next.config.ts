import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin Next's output-file tracing to THIS project. Left unset, Next walks up
  // looking for a lockfile to infer the workspace root: a stray lockfile in a
  // parent directory (a home folder, a monorepo checkout) makes it treat the
  // project as a SUBDIRECTORY, and it then writes the traced files under
  // `.next/standalone/<that path>/…` — a second copy of the workspace plus the
  // project's `.env`. Verified here: `.next/standalone/Projects/skyalproj/.env`
  // held this app's DeepSeek and Paystack keys, in the very directory `pnpm
  // start` serves.
  outputFileTracingRoot: process.cwd(),
  // Type errors fail the build. `tsc --noEmit` is clean on this repo, so the
  // flag bought nothing but let any future type error ship silently.
  reactStrictMode: false,
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
