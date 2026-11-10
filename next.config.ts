import type { NextConfig } from "next";

// This folder is the project's root. (A package.json in the home folder above would otherwise make Next.js treat the
// whole home folder as the root, and hosts such as Netlify then look for the built pages in the wrong place.)
const root = import.meta.dirname;

const nextConfig: NextConfig = {
  // Hide the Next.js "N" badge during development; compile and runtime errors still show.
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingRoot: root,
  turbopack: {
    root,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
