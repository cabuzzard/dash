// Cloudflare Pages advanced-mode worker for the content hubs.
//
// One Pages project ("dash-hubs") holds every hub as a subdirectory
// (web/hub/<slug>/). This routes each custom domain to its own subdir by
// Host header, so all hubs share one project and one deploy.
//
// Adding a hub: drop its folder in web/hub/<slug>/, add a line to HUBS below,
// add the domain as a Custom Domain on the Pages project (Cloudflare dash).
// Nothing else — no per-domain config, no Apache, no website-count limit.

const HUBS = {
  "outsidesessions.com":        "surf-vacations",
  "accessiblefarms.com":        "sunflower-acres",
  "stablehomefoundation.com":   "care-gap",
  "homestructionconsulting.com":"owners-rep",
  "generalservices2020.com":    "home-services",
  "aisystemimplementation.com": "ai-implementation",
  "creativeflowguitar.com":     "creative-flow-guitar",
  "mountainwize.com":           "mountainwize",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const slug = HUBS[host];

    // Unknown host (e.g. the raw *.pages.dev preview URL) → serve as-is so
    // https://dash-hubs.pages.dev/<slug>/ still works for previews.
    if (!slug) return env.ASSETS.fetch(request);

    // Already inside the hub's own path — serve directly.
    if (url.pathname === `/${slug}` || url.pathname.startsWith(`/${slug}/`)) {
      return env.ASSETS.fetch(request);
    }

    // Rewrite the domain root onto the hub's subdirectory.
    url.pathname = `/${slug}${url.pathname}`;
    return env.ASSETS.fetch(new Request(url.toString(), request));
  },
};
