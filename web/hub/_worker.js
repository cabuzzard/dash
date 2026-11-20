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
  "sustainableaquarium.com":    "sustainable-aquarium",
};

// Hubs with a members area (/members/) whose apps open at /studio/ on the same domain.
const STUDIO_HUBS = new Set(["ai-implementation"]);

// A missing page used to come back as a bare 404 — no body, no content type — which browsers save as a download instead of showing
// (operator 2026-11-08: a just-published post "tries to download a text file" while its deploy was still running). Every 404 is now an
// HTML page: the hub's own 404.html when it has one, else a short note with a link home.
async function notFound(env, request, slug) {
  if (slug) {
    const u = new URL(request.url); u.pathname = `/${slug}/404.html`;
    const r = await env.ASSETS.fetch(new Request(u.toString(), request)).catch(() => null);
    if (r && r.ok) return new Response(r.body, { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
  const home = slug ? "/" : "./";
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:15vh auto;padding:0 20px;line-height:1.55;color:#222}a{color:#2563eb}</style></head>
<body><h1>This page isn't here yet</h1><p>If it was just published, it can take a minute or two to go live — try again shortly.</p><p><a href="${home}">← Back to the home page</a></p></body></html>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
const served = async (env, request, slug, req) => { const r = await env.ASSETS.fetch(req || request); return r.status === 404 ? notFound(env, request, slug) : r; };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const slug = HUBS[host];

    // Unknown host (e.g. the raw *.pages.dev preview URL) → serve as-is so
    // https://dash-hubs.pages.dev/<slug>/ still works for previews.
    if (!slug) return served(env, request, url.pathname.split("/")[1] || "");

    // Members sign-in return (2026-11-20, phones showed a blank white pop-up): Google's redirect flow POSTs the sign-in here
    // (form fields credential + g_csrf_token, which must match the g_csrf_token cookie). The page gets it back through sessionStorage
    // and checks it with the worker as before — nothing is trusted here, this only hands it over.
    if (STUDIO_HUBS.has(slug) && url.pathname === "/members/login" && request.method === "POST") {
      const f = await request.formData().catch(() => null);
      const cred = f && String(f.get("credential") || ""), csrf = f && String(f.get("g_csrf_token") || "");
      const cookie = (request.headers.get("cookie") || "").match(/(?:^|;\s*)g_csrf_token=([^;]+)/);
      const ok = cred && csrf && cookie && cookie[1] === csrf && /^[A-Za-z0-9_\-.]+$/.test(cred);
      const js = ok ? `try{sessionStorage.setItem("mb_cred",${JSON.stringify(cred)})}catch(e){}` : `try{sessionStorage.setItem("mb_err","1")}catch(e){}`;
      return new Response(`<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Signing in…</title><script>${js};location.replace("/members/")</script>`,
        { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }

    // Members area apps (2026-11-20): /studio/ on a members hub is the one Client Studio page on GitHub Pages, passed through, so the
    // app keeps a single copy and the member stays on this domain. The page's own key (?k=) is the credential, checked by the worker.
    if (STUDIO_HUBS.has(slug) && (url.pathname === "/studio" || url.pathname.startsWith("/studio/"))) {
      if (url.pathname === "/studio") return Response.redirect(url.origin + "/studio/" + url.search, 301);
      const up = await fetch("https://cabuzzard.github.io/dash/web" + url.pathname + url.search, { cf: { cacheTtl: 60 } });
      const h = new Headers(up.headers); h.set("cache-control", "no-cache"); h.set("x-robots-tag", "noindex, nofollow");
      return new Response(up.body, { status: up.status, headers: h });
    }

    // Already inside the hub's own path — serve directly.
    if (url.pathname === `/${slug}` || url.pathname.startsWith(`/${slug}/`)) {
      return served(env, request, slug);
    }

    // Google Search Console verification files (/google<hex>.html) must answer
    // 200 at that exact URL — Pages' pretty-URL handling would 308 them to the
    // extensionless path, which verification can reject. Serve the asset directly.
    const gsc = url.pathname.match(/^\/(google[0-9a-f]+)\.html$/);
    if (gsc) {
      url.pathname = `/${slug}/${gsc[1]}`;
      const r = await env.ASSETS.fetch(new Request(url.toString(), request));
      return new Response(r.body, { status: r.status, headers: { "content-type": "text/html; charset=utf-8" } });
    }

    // Rewrite the domain root onto the hub's subdirectory.
    url.pathname = `/${slug}${url.pathname}`;
    return served(env, request, slug, new Request(url.toString(), request));
  },
};
