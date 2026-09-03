import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets the Docker build ship only the traced production dependencies
  // (.next/standalone) instead of the full node_modules tree.
  output: "standalone",

  experimental: {
    // Next's client Router Cache keeps a dynamic page's RSC payload for 30s
    // by default, so a `revalidatePath` server action (e.g. marking
    // attendance) correctly busts the *server* cache but a page the user
    // already visited or prefetched this session — the section list, the
    // teacher home — can still serve that stale 30-second-old copy instead
    // of refetching. Every screen here reflects state another person changes
    // a moment ago (attendance, fee dues, notices), so a 30s "eventually
    // consistent" window reads as a bug, not a feature. Zero it out.
    staleTimes: { dynamic: 0 },
  },

  async rewrites() {
    return [
      /*
       * /suite is the front door for both products — Flanca and the tutor — and
       * it is a static page, not a React route, because it belongs to neither
       * repository. `scripts/sync-suite-page.mjs` copies it into public/ from
       * the workspace and guards against drift.
       *
       * The rewrite exists because Next serves public/ files by their exact
       * path: public/suite/index.html answers at /suite/index.html and 404s at
       * /suite. Linking to /suite/index.html would work and read like a 1998
       * file listing, so the tidy URL is mapped instead.
       */
      { source: "/suite", destination: "/suite/index.html" },
    ];
  },
};

export default nextConfig;
