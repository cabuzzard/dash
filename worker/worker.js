// NOTION_TOKEN, PIN, HMAC_SECRET, TURNSTILE_SECRET are set as Cloudflare Worker secrets (env vars).
// They are loaded from env at the start of each request  -  never hardcoded here.
let NOTION_TOKEN = ""; // set per-request from env.NOTION_TOKEN
const NOTION_VERSION     = "2022-06-28";
const CAMPAIGNS_DB       = "087b1163b4e64975bc7a4b686ff801de";
const CONTENT_STRATEGY_DB = "9fa5f42f010b47e7a82032607e07d6a1";
const PRODUCTS_DB        = "e92fcfce75fc4f54b553df0b7672ff48";
const MAIN_TD_DB         = "3471f7d3a4bb80de87c1d9e850f4a426";
const METHODS_DB         = "285ed0b668be4dad89dfd090350096bc";
const LOGINS_DB          = "72d262278a4c4786b375959432fdd82a";
const PLATFORMS_DB       = "8248b700ebb7428aa28d8b5246509898";
const ASSETS_DB          = "e91bdb6e770b4d298e9f62166a0fd5de";
const RESEARCH_DB        = "557e6b7b8c434a578d45ecb0a8329f63";
const LEADS_DB           = "e4518a459f004eb0b9646e48d8718705";
const SM_ACCOUNTS_DB     = "aa6a16f2a77245bfb5efd9a8eb314b07";
const EMAILS_DB          = "6252e9917027488fb628436aabb89947";
const SM_POSTS_DB        = "addcfe1d1beb46dbbcaa397504a8041d";
const TRADES_DB          = "2207133ee3b04ff496e5e75415e3e43d";
const RUNS_DB            = "21c676fd91b74137b5f3ab57167a0849";
const DRIVES_DB          = "3751f7d3a4bb806cb133ff9182306ec8";
const RESUMES_DB         = "3751f7d3a4bb80599583c9aef8d10b05";
const CORS = {
  "Access-Control-Allow-Origin":  "https://cabuzzard.github.io",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options":       "nosniff",
  "X-Frame-Options":              "DENY",
  "Referrer-Policy":              "strict-origin-when-cross-origin",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// Strip backslash-escaping that the Notion MCP applies to JSON strings.
// Notion MCP stores '{"key":"val"}' as '\{"key":"val"\}' (literal leading/trailing backslash).
function stripMcpEscaping(s) {
  if (!s) return s;
  if (s.startsWith('\\{')) s = '{' + s.slice(2);
  if (s.endsWith('\\}'))   s = s.slice(0, -2) + '}';
  return s;
}

async function notionQuery(dbId, body) {
  const results = [];
  let cursor = undefined;
  while (true) {
    const payload = { page_size: 100, ...body };
    if (cursor) payload.start_cursor = cursor;
    const resp = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: {
        "Authorization":  `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type":   "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.message || "Notion error");
    results.push(...(data.results || []));
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return results;
}

// â"€â"€ SESSION TOKEN HELPERS â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
async function signToken(secret) {
  const payload  = { exp: Date.now() + 8 * 3600 * 1000, v: 1 };
  const payloadB64 = btoa(JSON.stringify(payload));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return payloadB64 + "." + sigB64;
}

async function verifyToken(token, secret) {
  try {
    const [payloadB64, sigB64] = (token || "").split(".");
    if (!payloadB64 || !sigB64) return false;
    const payload = JSON.parse(atob(payloadB64));
    if (!payload.exp || payload.exp < Date.now()) return false;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const sig = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));
    return await crypto.subtle.verify("HMAC", key, sig, enc.encode(payloadB64));
  } catch { return false; }
}

async function getCampaigns() {
  const [campRows, titleRows, productRows, todoRows, methodRows, loginRows, platformRows, researchRows, micrositeRows] = await Promise.all([
    notionQuery(CAMPAIGNS_DB, {
      filter: {
        and: [
          { property: "Status", select: { does_not_equal: "Delete" } },
          { property: "Grouping", multi_select: { does_not_contain: "deprecate" } },
          { property: "Grouping", multi_select: { does_not_contain: "Del" } },
        ]
      },
      sorts: [{ property: "Name", direction: "ascending" }],
    }),
    notionQuery(CONTENT_STRATEGY_DB, {}),
    notionQuery(PRODUCTS_DB, {}),
    notionQuery(MAIN_TD_DB, {}),
    notionQuery(METHODS_DB, {}),
    notionQuery(LOGINS_DB, {}),
    notionQuery(PLATFORMS_DB, {}),
    notionQuery(RESEARCH_DB, {}),
    notionQuery(ASSETS_DB, {
      filter: { and: [
        { property: "Asset Type", select: { equals: "Microsite" } },
        { property: "Asset Status", select: { equals: "Published" } },
      ]}
    }),
  ]);

  // Build research record lookup by campaign id
  const campaignToResearch = {};
  researchRows.forEach(r => {
    const rid = r.id.replace(/-/g,"");
    const rname = r.properties.Name?.title?.map(x => x.plain_text).join("") || "Research";
    const rnotes    = r.properties.Notes?.rich_text?.map(x => x.plain_text).join("") || "";
    const rthoughts = r.properties.Thoughts?.rich_text?.map(x => x.plain_text).join("") || "";
    (r.properties.Campaign?.relation || []).forEach(c => {
      const cid = c.id.replace(/-/g,"");
      campaignToResearch[cid] = { id: rid, name: rname, notes: rnotes, thoughts: rthoughts };
    });
  });

  // Build siteUrl lookup by campaign id (from deployed microsite assets)
  const campaignToSiteUrl = {};
  micrositeRows.forEach(a => {
    const url = a.properties["Site URL"]?.url || "";
    if (!url) return;
    (a.properties.Campaign?.relation || []).forEach(r => {
      const cid = r.id.replace(/-/g,"");
      campaignToSiteUrl[cid] = url;
    });
  });

  // Build lookups by id
  const todoById = {};
  const todoIsOpen = {};
  todoRows.forEach(t => {
    const id = t.id.replace(/-/g,"");
    todoById[id] = t.properties.Title?.title?.map(x => x.plain_text).join("") || "Untitled";
    const prio = (t.properties.priority?.multi_select || []).map(s => s.name);
    todoIsOpen[id] = !prio.includes("got") && !prio.includes("done");
  });

  const productById = {};
  productRows.forEach(p => {
    productById[p.id.replace(/-/g,"")] = p.properties.Name?.title?.map(x => x.plain_text).join("") || "Untitled";
  });

  const platformById = {};
  platformRows.forEach(p => {
    platformById[p.id.replace(/-/g,"")] = p.properties.Name?.title?.map(x => x.plain_text).join("") || "Untitled";
  });

  const methodById = {};
  methodRows.forEach(m => {
    methodById[m.id.replace(/-/g,"")] = m.properties.Name?.title?.map(x => x.plain_text).join("") || "Untitled";
  });

  const loginById = {};
  const campaignToLogins = {};
  loginRows.forEach(l => {
    const lid = l.id.replace(/-/g,"");
    const lname = l.properties.Name?.title?.map(x => x.plain_text).join("") || "Untitled";
    const lstatus = l.properties.Status?.select?.name || "";
    loginById[lid] = lname;
    (l.properties.Campaign?.relation || []).forEach(r => {
      const cid = r.id.replace(/-/g,"");
      if (!campaignToLogins[cid]) campaignToLogins[cid] = [];
      campaignToLogins[cid].push({ id: lid, name: lname, status: lstatus });
    });
  });

  // Most recently edited title per campaign
  const titleLastEdited = {};
  titleRows.forEach(t => {
    const te = t.last_edited_time;
    if (!te) return;
    (t.properties.Campaign?.relation || []).forEach(r => {
      const id = r.id.replace(/-/g, "");
      if (!titleLastEdited[id] || te > titleLastEdited[id]) titleLastEdited[id] = te;
    });
  });

  // Count dev titles per campaign id
  const devCount = {};
  titleRows.forEach(t => {
    const _ds = t.properties.Status?.select?.name;
    if (_ds !== "Development" && _ds !== "Writing") return;
    (t.properties.Campaign?.relation || []).forEach(r => {
      const id = r.id.replace(/-/g, "");
      devCount[id] = (devCount[id] || 0) + 1;
    });
  });

  // Count publish titles per campaign id and store title IDs + their asset IDs
  const pubCount = {};
  const pubTitleMap = {}; // campId -> [{id, title, assetIds}]
  titleRows.forEach(t => {
    if (t.properties.Status?.select?.name !== "Publish") return;
    const titleId = t.id.replace(/-/g, "");
    const titleName = t.properties.Title?.title?.map(x => x.plain_text).join("") || "Untitled";
    const assetIds = (t.properties.Assets?.relation || []).map(r => r.id.replace(/-/g, ""));
    (t.properties.Campaign?.relation || []).forEach(r => {
      const id = r.id.replace(/-/g, "");
      pubCount[id] = (pubCount[id] || 0) + 1;
      if (!pubTitleMap[id]) pubTitleMap[id] = [];
      pubTitleMap[id].push({ id: titleId, title: titleName, assetIds });
    });
  });

  // Count products per campaign id
  // Scan every relation property on each product to find campaign links
  // (works regardless of what the relation property is named)
  const prodCount = {};
  const campaignIds = new Set(campRows.map(c => c.id.replace(/-/g, "")));
  productRows.forEach(p => {
    Object.values(p.properties).forEach(prop => {
      if (prop.type !== "relation") return;
      (prop.relation || []).forEach(r => {
        const id = r.id.replace(/-/g, "");
        if (campaignIds.has(id)) {
          prodCount[id] = (prodCount[id] || 0) + 1;
        }
      });
    });
  });

  // Build campaign id -> name lookup for "Associated Campaigns" self-relation
  const campaignNameById = {};
  campRows.forEach(c => {
    campaignNameById[c.id.replace(/-/g,"")] = c.properties.Name?.title?.map(t => t.plain_text).join("") || "Untitled";
  });

  return campRows.map(c => {
    const id = c.id.replace(/-/g, "");
    return {
      id,
      name:             c.properties.Name?.title?.map(t => t.plain_text).join("") || "Untitled",
      site:             c.properties.site?.select?.name || "Other",
      status:           c.properties.Status?.select?.name || "",
      grouping:         (c.properties["Grouping"]?.multi_select || []).map(g => g.name),
      keyMessage:       c.properties["Key Message"]?.rich_text?.map(t => t.plain_text).join("") || "",
      research:         campaignToResearch[id] || null,
      siteUrl:          c.properties["microsite"]?.url || campaignToSiteUrl[id] || null,
      mainTd:           (c.properties["Associated To Do"]?.relation || []).map(r => ({
        id:   r.id.replace(/-/g,""),
        name: todoById[r.id.replace(/-/g,"")] || "Untitled",
      })),
      campaignProducts: (c.properties["Products"]?.relation || []).map(r => ({
        id:   r.id.replace(/-/g,""),
        name: productById[r.id.replace(/-/g,"")] || "Untitled",
      })),
      campaignMethods:  (c.properties["Methods"]?.relation || []).map(r => ({
        id:   r.id.replace(/-/g,""),
        name: methodById[r.id.replace(/-/g,"")] || "Untitled",
      })),
      campaignLogins:   campaignToLogins[id] || [],
      platforms: (c.properties["Platforms"]?.relation || []).map(r => ({ id: r.id.replace(/-/g,""), name: platformById[r.id.replace(/-/g,"")] || "Untitled" })),
      parentCampaignId: (c.properties["Parent Campaign"]?.relation || [])[0]?.id?.replace(/-/g,"") || "",
      nicheCampaigns: (c.properties["Niche Campaigns"]?.relation || []).map(r => ({
        id:   r.id.replace(/-/g,""),
        name: campaignNameById[r.id.replace(/-/g,"")] || "Untitled",
      })),
      campaignPage: c.properties["live site"]?.url || null,
      openTd: (c.properties["Associated To Do"]?.relation || []).filter(r => todoIsOpen[r.id.replace(/-/g,"")]).length,
      devTitles:  devCount[id]  || 0,
      pubTitles:  pubCount[id]  || 0,
      pubTitleData: pubTitleMap[id] || [],
      products:   prodCount[id] || 0,
      lastChanged: titleLastEdited[id] || c.last_edited_time || null,
    };
  });

  return campaigns;
}

// ── Deep scan ────────────────────────────────────────────────────────────────
function extractPropValue(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case 'title':        return prop.title?.map(t => t.plain_text).join("") || "";
    case 'rich_text':    return prop.rich_text?.map(t => t.plain_text).join("") || "";
    case 'select':       return prop.select?.name || null;
    case 'multi_select': return (prop.multi_select || []).map(s => s.name).sort().join(", ") || null;
    case 'status':       return prop.status?.name || null;
    case 'checkbox':     return prop.checkbox ?? null;
    case 'number':       return prop.number ?? null;
    case 'date':         return prop.date?.start || null;
    case 'url':          return prop.url || null;
    case 'email':        return prop.email || null;
    case 'phone_number': return prop.phone_number || null;
    case 'relation':     return (prop.relation || []).map(r => r.id.replace(/-/g,"")).sort().join(",") || null;
    case 'people':       return (prop.people || []).map(p => p.name || p.id).sort().join(", ") || null;
    case 'files':        return (prop.files || []).map(f => f.name).join(", ") || null;
    case 'formula':      return prop.formula?.string ?? prop.formula?.number ?? prop.formula?.boolean ?? null;
    default:             return null;
  }
}

function serializeRow(row) {
  const props = {};
  for (const [key, val] of Object.entries(row.properties)) {
    props[key] = extractPropValue(val);
  }
  const name = Object.values(row.properties).find(p => p.type === 'title')
    ?.title?.map(t => t.plain_text).join("") || "Untitled";
  return { id: row.id.replace(/-/g,""), name, lastEdited: row.last_edited_time, props };
}

async function deepScan(env) {
  NOTION_TOKEN = (env.NOTION_TOKEN || "").trim();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const DAY_MS = 86400000;

  const [campRows, prodRows] = await Promise.all([
    notionQuery(CAMPAIGNS_DB, {}),
    notionQuery(PRODUCTS_DB, {}),
  ]);

  const campSnap = campRows.map(serializeRow);
  const prodSnap = prodRows.map(serializeRow);

  const campSchema = [...new Set(campRows.flatMap(r => Object.keys(r.properties)))].sort();
  const prodSchema = [...new Set(prodRows.flatMap(r => Object.keys(r.properties)))].sort();

  const newSnapshot = { date: todayStr, campaigns: campSnap, products: prodSnap, campSchema, prodSchema };

  let prevSnapshot = null;
  try {
    const raw = await env.TRADES.get("morning:snapshot");
    if (raw) prevSnapshot = JSON.parse(raw);
  } catch {}

  const diff = { date: todayStr, changes: [], newProps: [], newRecords: [], removedRecords: [], recency: {} };

  if (prevSnapshot) {
    // Schema changes
    (prevSnapshot.campSchema || []).concat().filter(p => !campSchema.includes(p))
      .forEach(p => diff.newProps.push({ db: 'Campaigns', prop: p, kind: 'removed' }));
    campSchema.filter(p => !(prevSnapshot.campSchema || []).includes(p))
      .forEach(p => diff.newProps.push({ db: 'Campaigns', prop: p, kind: 'added' }));
    (prevSnapshot.prodSchema || []).filter(p => !prodSchema.includes(p))
      .forEach(p => diff.newProps.push({ db: 'Products', prop: p, kind: 'removed' }));
    prodSchema.filter(p => !(prevSnapshot.prodSchema || []).includes(p))
      .forEach(p => diff.newProps.push({ db: 'Products', prop: p, kind: 'added' }));

    const prevById = {};
    [...(prevSnapshot.campaigns || []).map(r => ({...r, db:'Campaigns'})),
     ...(prevSnapshot.products  || []).map(r => ({...r, db:'Products'}))
    ].forEach(r => { prevById[r.id] = r; });

    const currById = {};
    [...campSnap.map(r => ({...r, db:'Campaigns'})),
     ...prodSnap.map(r => ({...r, db:'Products'}))
    ].forEach(r => {
      currById[r.id] = r;
      if (!prevById[r.id]) {
        diff.newRecords.push({ db: r.db, name: r.name, id: r.id });
      } else {
        const prev = prevById[r.id];
        const allKeys = new Set([...Object.keys(r.props), ...Object.keys(prev.props)]);
        allKeys.forEach(key => {
          const nv = JSON.stringify(r.props[key] ?? null);
          const ov = JSON.stringify(prev.props[key] ?? null);
          if (nv !== ov) diff.changes.push({ db: r.db, name: r.name, id: r.id, field: key, from: prev.props[key] ?? null, to: r.props[key] ?? null });
        });
      }
    });
    Object.keys(prevById).forEach(id => {
      if (!currById[id]) diff.removedRecords.push({ db: prevById[id].db, name: prevById[id].name, id });
    });
  }

  // Recency buckets
  [...campSnap.map(r => ({...r, db:'Campaigns'})), ...prodSnap.map(r => ({...r, db:'Products'}))].forEach(r => {
    const ageDays = r.lastEdited ? (now.getTime() - new Date(r.lastEdited).getTime()) / DAY_MS : 9999;
    diff.recency[r.id] = {
      name: r.name, db: r.db, lastEdited: r.lastEdited,
      ageDays: Math.floor(ageDays),
      bucket: ageDays < 7 ? 'active' : ageDays < 30 ? 'cooling' : 'orphaned',
    };
  });

  await Promise.all([
    env.TRADES.put("morning:snapshot", JSON.stringify(newSnapshot)),
    env.TRADES.put("morning:diff",     JSON.stringify(diff)),
    env.TRADES.put("morning:last_scan", todayStr),
  ]);

  return diff;
}

export default {
  async fetch(request, env) {
    // Load secrets from environment on every request (.trim() guards against
    // trailing newlines that piped input (e.g. PowerShell) can introduce)
    NOTION_TOKEN = (env.NOTION_TOKEN || "").trim();
    const PIN_VAL        = (env.PIN             || "").trim();
    const HMAC_SECRET    = (env.HMAC_SECRET     || "").trim();
    const TS_SECRET      = (env.TURNSTILE_SECRET|| "1x0000000000000000000000000000000AA").trim();

    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method === "GET") {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/img/")) {
        const key = "img:" + url.pathname.slice(5);
        const meta = await env.TRADES.getWithMetadata(key, "arrayBuffer");
        if (!meta.value) return new Response("Not found", { status: 404 });
        return new Response(meta.value, {
          headers: {
            "Content-Type": meta.metadata?.mime || "image/jpeg",
            "Cache-Control": "public, max-age=31536000",
            "Access-Control-Allow-Origin": "https://cabuzzard.github.io",
          },
        });
      }
      return json({ status: "ok", version: "2026-06-01-01" });
    }
    if (request.method !== "POST")    return json({ error: "POST only" }, 405);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Invalid JSON" }, 400); }

    // â"€â"€ auth  -  exchange PIN for a session token (public, no token required) â"€â"€
    if (body.action === "auth") {
      if (!PIN_VAL || !HMAC_SECRET) return json({ error: "Server not configured" }, 500);
      // Small delay to slow brute force attempts
      await new Promise(r => setTimeout(r, 250));
      if (body.pin !== PIN_VAL) return json({ error: "Unauthorized" }, 401);
      const token = await signToken(HMAC_SECRET);
      return json({ token });
    }

    // â"€â"€ pinUpdate  -  PIN-authenticated field update (no session token needed) â"€
    // Accepts: { action, pin, id, voiceId?, captionStyle?, voiceSettings? }
    if (body.action === "pinUpdate") {
      if (!PIN_VAL) return json({ error: "Server not configured" }, 500);
      await new Promise(r => setTimeout(r, 250));
      if (body.pin !== PIN_VAL) return json({ error: "Unauthorized" }, 401);
      const { id, voiceId, captionStyle, voiceSettings } = body;
      if (!id) return json({ error: "id required" }, 400);
      const dash = i => i.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
      const props = {};
      if (voiceId      !== undefined) props["Voice ID"]      = { rich_text: [{ type:"text", text:{ content:(voiceId||"").slice(0,200) } }] };
      if (captionStyle !== undefined) props["Caption Style"] = { rich_text: [{ type:"text", text:{ content:(captionStyle||"").slice(0,2000) } }] };
      if (voiceSettings!== undefined) props["Voice Settings"]= { rich_text: [{ type:"text", text:{ content:(voiceSettings||"").slice(0,2000) } }] };
      if (!Object.keys(props).length) return json({ success: true });
      const resp = await fetch(`https://api.notion.com/v1/pages/${dash(id)}`, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
        body: JSON.stringify({ properties: props }),
      });
      const result = await resp.json();
      if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
      return json({ success: true });
    }

    // â"€â"€ submitLead  -  public, no token required â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    if (body.action === "submitLead") {
      const { campaign, email, phone, fraudType, note, tsToken } = body;

      // --- Turnstile verification ---
      if (tsToken) {
        const tsResp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `secret=${encodeURIComponent(TS_SECRET)}&response=${encodeURIComponent(tsToken)}`,
        });
        const tsData = await tsResp.json();
        if (!tsData.success) return json({ error: "CAPTCHA verification failed  -  please try again" }, 403);
      }

      // --- Input validation ---
      if (!email || !phone || !fraudType) return json({ error: "email, phone, and fraudType are required" }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Invalid email address" }, 400);
      if (!/^[\d\s\-\+\(\)\.]{7,20}$/.test(phone)) return json({ error: "Invalid phone number" }, 400);
      const validFraudTypes = ["Robo-signing","Chain of title fraud","Loan modification fraud","Improper procedures","Mortgage servicing fraud","MERS assignment void","Divorce - property dispute","Probate - estate sale","Will contest","Executor dispute","Coaching - one hour session","Coaching - package","Coaching - general inquiry","Webguy B2C - done-for-you system","Webguy B2C - template","Webguy B2B - content machine","Webguy B2B - AI implementation","Webguy B2B - retainer","Webguy - general inquiry","Other"];
      if (!validFraudTypes.includes(fraudType)) return json({ error: "Invalid fraud type" }, 400);

      const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
      const now = new Date().toISOString();
      const name = "Lead  -  " + (campaign || "unknown") + "  -  " + now.slice(0,16).replace("T"," ");
      const resp = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
        body: JSON.stringify({
          parent: { database_id: LEADS_DB },
          properties: {
            Name:          { title:        [{ type: "text", text: { content: name } }] },
            Campaign:      { rich_text:    [{ type: "text", text: { content: campaign || "" } }] },
            Email:         { email:        email },
            Phone:         { phone_number: phone },
            "Fraud Type":  { select:       { name: fraudType } },
            Note:          { rich_text:    [{ type: "text", text: { content: (note || "").slice(0,600) } }] },
            Status:        { select:       { name: "New" } },
          }
        }),
      });
      const result = await resp.json();
      if (!resp.ok) return json({ error: "Submission failed  -  please try again" }, resp.status);
      return json({ success: true });
    }

    // â"€â"€ All other actions require a valid session token â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    if (!HMAC_SECRET || !(await verifyToken(body.token, HMAC_SECRET))) {
      return json({ error: "Unauthorized" }, 401);
    }

    try {
      if (body.action === "getDevTitles") {
        const [campRows, productRows] = await Promise.all([
          notionQuery(CAMPAIGNS_DB, {
            filter: { property: "Status", select: { does_not_equal: "Delete" } },
          }),
          notionQuery(PRODUCTS_DB, {
            filter: { property: "Status", select: { equals: "Active" } },
          }),
        ]);

        // Paginate through ALL titles
        let titleRows = [];
        let cursor = undefined;
        do {
          const resp = await fetch(`https://api.notion.com/v1/databases/${CONTENT_STRATEGY_DB}/query`, {
            method: "POST",
            headers: {
              "Authorization":  `Bearer ${NOTION_TOKEN}`,
              "Notion-Version": NOTION_VERSION,
              "Content-Type":   "application/json",
            },
            body: JSON.stringify({
              page_size: 100,
              sorts: [{ property: "Sequence Order", direction: "ascending" }],
              ...(cursor ? { start_cursor: cursor } : {}),
            }),
          });
          const page = await resp.json();
          titleRows = titleRows.concat(page.results || []);
          cursor = page.has_more ? page.next_cursor : undefined;
        } while (cursor);

        const campById = {};
        campRows.forEach(c => {
          campById[c.id.replace(/-/g,"")] = {
            name: c.properties.Name?.title?.map(t => t.plain_text).join("") || "",
            site: c.properties.site?.select?.name || "Other",
            parentCampaignId: (c.properties["Parent Campaign"]?.relation || [])[0]?.id?.replace(/-/g,"") || "",
          };
        });

        // Count active products per campaign id
        const activeProdCount = {};
        const campaignIds = new Set(Object.keys(campById));
        productRows.forEach(p => {
          (p.properties["Campaigns"]?.relation || []).forEach(r => {
            const id = r.id.replace(/-/g,"");
            if (campaignIds.has(id)) activeProdCount[id] = (activeProdCount[id] || 0) + 1;
          });
        });

        const campTitles = {};
        titleRows.forEach(t => {
          const props  = t.properties;
          const status = props.Status?.select?.name || "";
          const title  = props.Title?.title?.map(x => x.plain_text).join("") || "Untitled";
          const id     = t.id.replace(/-/g,"");
          const campRel = props.Campaign?.relation || [];
          const campId  = campRel.length ? campRel[0].id.replace(/-/g,"") : "__none__";
          const camp    = campById[campId] || { name: "?", site: "Other" };

          if (!campTitles[campId]) campTitles[campId] = { name: camp.name, site: camp.site, parentCampaignId: camp.parentCampaignId || "", titles: [] };
          campTitles[campId].titles.push({ id, title, status, grouping: props.Grouping?.rich_text?.map(x => x.plain_text).join("") || "" });
        });

        // Add all campaigns Î"Ã‡Ã¶ even those with no titles
        Object.entries(campById).forEach(([campId, camp]) => {
          if (!campTitles[campId]) campTitles[campId] = { name: camp.name, site: camp.site, parentCampaignId: camp.parentCampaignId || "", titles: [] };
        });

        const campaigns = Object.entries(campTitles).map(([campId, camp]) => {
          const devCount  = camp.titles.filter(t => t.status === "Development").length;
          const pubCount  = camp.titles.filter(t => t.status === "Publish").length;
          const prodCount = activeProdCount[campId] || 0;
          const STATUS_RANK = { "Development": 0, "Publish": 1 };
          camp.titles.sort((a, b) => (STATUS_RANK[a.status] ?? 2) - (STATUS_RANK[b.status] ?? 2));
          return { campId, name: camp.name, site: camp.site, parentCampaignId: camp.parentCampaignId || "", titles: camp.titles, devCount, pubCount, prodCount };
        });

        campaigns.sort((a, b) => b.devCount - a.devCount);
        return json({ campaigns });
      }

      if (body.action === "createDevTitle") {
        const { title, campaignId, status, grouping } = body;
        if (!title) return json({ error: "title required" }, 400);

        const props = {
          Title:  { title: [{ type: "text", text: { content: title } }] },
          Status: { select: { name: status || "Development" } },
        };
        if (grouping) props["Grouping"] = { rich_text: [{ type: "text", text: { content: grouping } }] };
        if (campaignId) {
          const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
          props["Campaign"] = { relation: [{ id: dashId(campaignId) }] };
        }

        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ parent: { database_id: CONTENT_STRATEGY_DB }, properties: props }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
        return json({ success: true, id: result.id.replace(/-/g,"") });
      }

      if (body.action === "renameTodoItem") {
        const { itemId, title } = body;
        if (!itemId || !title?.trim()) return json({ error: "itemId and title required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashId(itemId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { Title: { title: [{ type: "text", text: { content: title.trim() } }] } } })
        });
        if (!resp.ok) { const e = await resp.json(); return json({ error: e.message || "Rename failed" }, resp.status); }
        return json({ success: true });
      }

      if (body.action === "deleteTdItem") {
        const { itemId } = body;
        if (!itemId) return json({ error: "itemId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/blocks/${dashId(itemId)}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        if (!resp.ok) { const r = await resp.json(); return json({ error: r.message || "Delete failed" }, resp.status); }
        return json({ success: true });
      }

      if (body.action === "updateTdPriority") {
        const { itemId, priority } = body;
        if (!itemId) return json({ error: "itemId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashId(itemId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { priority: { multi_select: (priority || []).map(name => ({ name })) } } }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      if (body.action === "getTdItems") {
        const rows = await notionQuery(MAIN_TD_DB, {
          filter: {
            or: [
              { property: "priority", multi_select: { contains: "get" } },
              { property: "priority", multi_select: { contains: "got" } },
              { property: "priority", multi_select: { contains: "daily content" } },
              { property: "priority", multi_select: { contains: "daily household" } },
              { property: "priority", multi_select: { contains: "done" } },
              { property: "priority", multi_select: { contains: "trading" } },
            ]
          },
          sorts: [{ property: "Title", direction: "ascending" }],
        });
        const items = rows.map(t => ({
          id:       t.id.replace(/-/g,""),
          name:     t.properties.Title?.title?.map(x => x.plain_text).join("") || "Untitled",
          priority: t.properties.priority?.multi_select?.map(s => s.name) || [],
        }));
        return json({ items });
      }

      if (body.action === "createTdItem") {
        const { title, grouping } = body;
        if (!title) return json({ error: "title required" }, 400);
        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({
            parent: { database_id: MAIN_TD_DB },
            properties: {
              Title:    { title: [{ type: "text", text: { content: title } }] },
              priority: { multi_select: [{ name: grouping }] },
            }
          }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
        return json({ success: true, id: result.id.replace(/-/g,"") });
      }

      if (body.action === "getMorningTdItems") {
        const rows = await notionQuery(MAIN_TD_DB, {
          filter: { property: "priority", multi_select: { contains: "morning" } },
          sorts: [{ property: "Title", direction: "ascending" }],
        });
        const items = rows.map(t => ({
          id:       t.id.replace(/-/g,""),
          name:     t.properties.Title?.title?.map(x => x.plain_text).join("") || "Untitled",
          priority: t.properties.priority?.multi_select?.map(s => s.name) || [],
        }));
        return json({ items });
      }

      if (body.action === "searchTodos") {
        const { query } = body;
        const rows = await notionQuery(MAIN_TD_DB, {
          sorts: [{ property: "Title", direction: "ascending" }],
        });
        const todos = rows.map(t => ({
          id:   t.id.replace(/-/g,""),
          name: t.properties.Title?.title?.map(x => x.plain_text).join("") || "Untitled",
        })).filter(t => !query || t.name.toLowerCase().includes(query.toLowerCase()));
        return json({ todos: todos.slice(0, 50) });
      }

      if (body.action === "createTodo") {
        const { name, campaignId } = body;
        if (!name) return json({ error: "name required" }, 400);

        const dashId = raw => {
          const s = raw.replace(/-/g, "");
          return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20);
        };

        // Step 1: Create the todo
        const createResp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({
            parent: { database_id: MAIN_TD_DB },
            properties: { Title: { title: [{ type: "text", text: { content: name } }] } }
          }),
        });
        const created = await createResp.json();
        if (!createResp.ok) return json({ error: created.message || "Create failed" }, createResp.status);
        const newTodoId = created.id.replace(/-/g,"");

        // Step 2: Fetch existing campaign todos and append new one
        if (campaignId) {
          const campResp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
            headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
          });
          const campPage = await campResp.json();
          const existing = (campPage.properties?.["Associated To Do"]?.relation || []).map(r => ({ id: r.id }));
          existing.push({ id: dashId(newTodoId) });
          await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
            method: "PATCH",
            headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
            body: JSON.stringify({ properties: { "Associated To Do": { relation: existing } } }),
          });
        }

        return json({ success: true, id: newTodoId, name });
      }

      if (body.action === "createMethod") {
        const { title } = body;
        if (!title) return json({ error: "title required" }, 400);
        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({
            parent: { database_id: METHODS_DB },
            properties: { Name: { title: [{ type: "text", text: { content: title } }] } }
          }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
        return json({ success: true, id: result.id.replace(/-/g,""), name: title });
      }

      if (body.action === "createPlatform") {
        const { title, status } = body;
        if (!title) return json({ error: "title required" }, 400);
        const platStatus = status || "Publish"; // default Publish so column appears in Hermes matrix
        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({
            parent: { database_id: PLATFORMS_DB },
            properties: {
              Name:   { title: [{ type: "text", text: { content: title } }] },
              Status: { select: { name: platStatus } },
            }
          }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
        return json({ success: true, id: result.id.replace(/-/g,""), name: title, status: platStatus });
      }

      if (body.action === "searchMethods") {
        const { query } = body;
        const rows = await notionQuery(METHODS_DB, { sorts: [{ property: "Name", direction: "ascending" }] });
        const methods = rows.map(m => ({
          id:   m.id.replace(/-/g,""),
          name: m.properties.Name?.title?.map(x => x.plain_text).join("") || "Untitled",
        })).filter(m => !query || m.name.toLowerCase().includes(query.toLowerCase()));
        return json({ methods: methods.slice(0, 50) });
      }

      if (body.action === "updateCampaignProducts") {
        const { campaignId, productIds } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Products": { relation: (productIds||[]).map(id => ({ id: dashId(id) })) } } }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      if (body.action === "updateCampaignMethods") {
        const { campaignId, methodIds } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Methods": { relation: (methodIds||[]).map(id => ({ id: dashId(id) })) } } }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      if (body.action === "deleteTitle") {
        const { titleId } = body;
        if (!titleId) return json({ error: "titleId required" }, 400);
        const dash = id => id.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
        await fetch("https://api.notion.com/v1/pages/" + dash(titleId), {
          method: "PATCH",
          headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true })
        });
        return json({ success: true });
      }

      if (body.action === "getPlatforms") {
        const data = await notionQuery(PLATFORMS_DB, { sorts: [{ property: "Name", direction: "ascending" }], page_size: 100 });
        return json({ platforms: data.map(p => ({
          id:     p.id.replace(/-/g,""),
          name:   p.properties.Name?.title?.map(t=>t.plain_text).join("") || "",
          status: p.properties.Status?.select?.name || "",
        })) });
      }

      if (body.action === "updateCampaignPlatforms") {
        const { campaignId, platformIds } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dash = id => id.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");

        // Discover the correct property name from the DB schema
        const schemaResp = await fetch(`https://api.notion.com/v1/databases/${CAMPAIGNS_DB}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        const schema = await schemaResp.json();
        let platformPropName = "Platforms";
        Object.entries(schema.properties || {}).forEach(([name, prop]) => {
          if (prop.type === "relation" && (prop.relation?.database_id || "").replace(/-/g, "") === PLATFORMS_DB) {
            platformPropName = name;
          }
        });

        const resp = await fetch("https://api.notion.com/v1/pages/" + dash(campaignId), {
          method: "PATCH",
          headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { [platformPropName]: { relation: (platformIds || []).map(id => ({ id: dash(id) })) } } })
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      if (body.action === "getTitleAssets") {
        const { titleId } = body;
        if (!titleId) return json({ error: "titleId required" }, 400);
        const dash = id => id.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
        const filesOf = p => (p?.Images?.files || []).map(f => {
          const raw = f.name || "";
          let key = null, displayName = raw;
          if (raw.startsWith("img:")) {
            const pipeIdx = raw.indexOf("|", 4);
            if (pipeIdx !== -1) { key = raw.slice(4, pipeIdx); displayName = raw.slice(pipeIdx + 1); }
            else { key = raw.slice(4); displayName = ""; }
          }
          return { name: displayName, url: f.type === "external" ? f.external.url : (f.file?.url || ""), key };
        });
        const shapeAsset = (assetId, p) => {
          const loginRel = p["Login"]?.relation || [];
          return {
            id: assetId,
            title: p["Asset Title"]?.title?.map(t=>t.plain_text).join("") || "Untitled",
            assetTitle: p["Asset Title"]?.title?.map(t=>t.plain_text).join("") || "Untitled",
            platform: p["Platform Name"]?.select?.name || "",
            type: p["Asset Type"]?.select?.name || "",
            status: p["Asset Status"]?.select?.name || "",
            designLink: p["Design Link"]?.url || "",
            loginId: loginRel[0]?.id?.replace(/-/g,"") || "",
            body: p["Body"]?.rich_text?.map(t=>t.plain_text).join("") || "",
            images: filesOf(p),
            componentIds: (p["Components"]?.relation || []).map(r => r.id.replace(/-/g,"")),
            campaignId: (p["Campaign"]?.relation || [])[0]?.id?.replace(/-/g,"") || "",
            contentStrategyId: (p["Content Strategy"]?.relation || [])[0]?.id?.replace(/-/g,"") || "",
          };
        };
        try {
          const page = await fetch("https://api.notion.com/v1/pages/" + dash(titleId), {
            headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION }
          });
          const titlePage = await page.json();
          const assetIds = (titlePage.properties?.Assets?.relation || []).map(r => r.id.replace(/-/g,""));
          const assets = await Promise.all(assetIds.map(async assetId => {
            try {
              const resp = await fetch("https://api.notion.com/v1/pages/" + dash(assetId), {
                headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION }
              });
              const a = await resp.json();
              const shaped = shapeAsset(assetId, a.properties || {});
              shaped.components = await Promise.all(shaped.componentIds.map(async cid => {
                try {
                  const cr = await fetch("https://api.notion.com/v1/pages/" + dash(cid), {
                    headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION }
                  });
                  const cp = (await cr.json()).properties || {};
                  return shapeAsset(cid, cp);
                } catch(e) { return null; }
              }));
              shaped.components = shaped.components.filter(Boolean);
              return shaped;
            } catch(e) { return null; }
          }));
          return json({ assets: assets.filter(Boolean) });
        } catch(e) {
          return json({ error: e.message, assets: [] });
        }
      }

      if (body.action === "getAssetsByCampaign") {
        const { pubTitleData } = body;
        if (!pubTitleData || !pubTitleData.length) return json({ titles: [] });
        const dash = id => id.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
        const filesOf = p => (p?.Images?.files || []).map(f => {
          const raw = f.name || "";
          let key = null, displayName = raw;
          if (raw.startsWith("img:")) {
            const pipeIdx = raw.indexOf("|", 4);
            if (pipeIdx !== -1) { key = raw.slice(4, pipeIdx); displayName = raw.slice(pipeIdx + 1); }
            else { key = raw.slice(4); displayName = ""; }
          }
          return { name: displayName, url: f.type === "external" ? f.external.url : (f.file?.url || ""), key };
        });
        const shapeAsset = (assetId, p) => {
          const loginRel = p["Login"]?.relation || [];
          return {
            id: assetId,
            assetTitle: p["Asset Title"]?.title?.map(x=>x.plain_text).join("") || "Untitled",
            platform: p["Platform Name"]?.select?.name || "",
            type: p["Asset Type"]?.select?.name || "",
            status: p["Asset Status"]?.select?.name || "",
            designLink: p["Design Link"]?.url || "",
            loginId: loginRel[0]?.id?.replace(/-/g,"") || "",
            body: p["Body"]?.rich_text?.map(t=>t.plain_text).join("") || "",
            images: filesOf(p),
            componentIds: (p["Components"]?.relation || []).map(r => r.id.replace(/-/g,"")),
            campaignId: (p["Campaign"]?.relation || [])[0]?.id?.replace(/-/g,"") || "",
            contentStrategyId: (p["Content Strategy"]?.relation || [])[0]?.id?.replace(/-/g,"") || "",
          };
        };
        try {
          const titles = await Promise.all(pubTitleData.map(async t => {
            const assets = await Promise.all((t.assetIds || []).map(async assetId => {
              try {
                const resp = await fetch("https://api.notion.com/v1/pages/" + dash(assetId), {
                  headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION }
                });
                const a = await resp.json();
                const shaped = shapeAsset(assetId, a.properties || {});
                shaped.components = await Promise.all(shaped.componentIds.map(async cid => {
                  try {
                    const cr = await fetch("https://api.notion.com/v1/pages/" + dash(cid), {
                      headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION }
                    });
                    const cp = (await cr.json()).properties || {};
                    return shapeAsset(cid, cp);
                  } catch(e) { return null; }
                }));
                shaped.components = shaped.components.filter(Boolean);
                return shaped;
              } catch(e) { return null; }
            }));
            return { title: t.title, assets: assets.filter(Boolean) };
          }));
          return json({ titles });
        } catch(e) {
          return json({ error: e.message, titles: [] });
        }
      }

      if (body.action === "getPublishedAssets") {
        try {
          const [assetRows, loginRows, campRows] = await Promise.all([
            notionQuery(ASSETS_DB, {
              filter: { property: "Asset Status", select: { equals: "Published" } },
              sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
            }),
            notionQuery(LOGINS_DB, {}),
            notionQuery(CAMPAIGNS_DB, {}),
          ]);
          const loginMap = {};
          loginRows.forEach(l => {
            loginMap[l.id.replace(/-/g,"")] = l.properties.Name?.title?.map(t=>t.plain_text).join("") || "";
          });
          const campMap = {};
          campRows.forEach(c => {
            campMap[c.id.replace(/-/g,"")] = c.properties.Name?.title?.map(t=>t.plain_text).join("") || "";
          });
          const assets = assetRows.map(pg => {
            const p = pg.properties || {};
            const loginId  = (p["Login"]?.relation || [])[0]?.id?.replace(/-/g,"") || "";
            const campId   = (p["Campaign"]?.relation || [])[0]?.id?.replace(/-/g,"") || "";
            return {
              id: pg.id.replace(/-/g,""),
              title: p["Asset Title"]?.title?.map(t=>t.plain_text).join("") || "Untitled",
              platform: p["Platform Name"]?.select?.name || "",
              type: p["Asset Type"]?.select?.name || "",
              status: p["Asset Status"]?.select?.name || "",
              loginId, campaignId: campId,
              loginName: loginMap[loginId] || "",
              campaignName: campMap[campId] || "",
              lastEdited: pg.last_edited_time || "",
            };
          });
          return json({ assets });
        } catch(e) {
          return json({ error: e.message, assets: [] });
        }
      }

      if (body.action === "searchLogins") {
        const { query } = body;
        const rows = await notionQuery(LOGINS_DB, { sorts: [{ property: "Name", direction: "ascending" }] });
        const logins = rows.map(l => ({
          id:   l.id.replace(/-/g,""),
          name: l.properties.Name?.title?.map(x => x.plain_text).join("") || "Untitled",
        })).filter(l => !query || l.name.toLowerCase().includes(query.toLowerCase()));
        return json({ logins: logins.slice(0, 50) });
      }

      if (body.action === "createLogin") {
        const { title } = body;
        if (!title) return json({ error: "title required" }, 400);
        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({
            parent: { database_id: LOGINS_DB },
            properties: { Name: { title: [{ type: "text", text: { content: title } }] } }
          }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
        return json({ success: true, id: result.id.replace(/-/g,""), name: title });
      }

      if (body.action === "updateCampaignLogins") {
        const { campaignId, loginIds } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Logins": { relation: (loginIds||[]).map(id => ({ id: dashId(id) })) } } }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      if (body.action === "getGroupingOptions") {
        const resp = await fetch(`https://api.notion.com/v1/databases/${CAMPAIGNS_DB}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        const data = await resp.json();
        if (!resp.ok) return json({ error: data.message || "Notion error" }, resp.status);
        const options = (data.properties?.Grouping?.multi_select?.options || []).map(o => o.name);
        return json({ options });
      }

      if (body.action === "updateGrouping") {
        const { campaignId, grouping } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Grouping": { multi_select: (grouping || []).map(name => ({ name })) } } }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      if (body.action === "updateCampaignSite") {
        const { campaignId, site } = body;
        if (!campaignId || !site) return json({ error: "campaignId and site required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "site": { select: { name: site } } } }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      if (body.action === "deleteCampaign") {
        const { campaignId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Delete failed" }, resp.status);
        return json({ success: true });
      }

      if (body.action === "updateCampaignStatus") {
        const { campaignId, status } = body;
        if (!campaignId || !status) return json({ error: "campaignId and status required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Status": { select: { name: status } } } }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      if (body.action === "updateCampaignName") {
        const { campaignId, name } = body;
        if (!campaignId || !name) return json({ error: "campaignId and name required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Name": { title: [{ type: "text", text: { content: name } }] } } }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      if (body.action === "updateKeyMessage") {
        const { campaignId, keyMessage } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Key Message": { rich_text: [{ type: "text", text: { content: keyMessage || "" } }] } } }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      if (body.action === "addCampaignTd") {
        const { campaignId, title } = body;
        if (!campaignId || !title) return json({ error: "campaignId and title required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+"-"+s.slice(8,12)+"-"+s.slice(12,16)+"-"+s.slice(16,20)+"-"+s.slice(20); };
        // Create the TD item
        const createResp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({
            parent: { database_id: MAIN_TD_DB },
            properties: { Title: { title: [{ type: "text", text: { content: title } }] } }
          })
        });
        const created = await createResp.json();
        if (!createResp.ok) return json({ error: created.message || "Create failed" }, createResp.status);
        const newTdId = created.id;
        // Fetch existing relation
        const campResp = await fetch("https://api.notion.com/v1/pages/" + dashId(campaignId), {
          headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION }
        });
        const campPage = await campResp.json();
        const existing = (campPage.properties?.["Associated To Do"]?.relation || []).map(r => ({ id: r.id }));
        existing.push({ id: newTdId });
        // Patch campaign relation
        const patchResp = await fetch("https://api.notion.com/v1/pages/" + dashId(campaignId), {
          method: "PATCH",
          headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Associated To Do": { relation: existing } } })
        });
        const patched = await patchResp.json();
        if (!patchResp.ok) return json({ error: patched.message || "Link failed" }, patchResp.status);
        return json({ success: true, tdId: newTdId.replace(/-/g,"") });
      }

      if (body.action === "updateCampaignTodos") {
        const { campaignId, todoIds } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);

        const dashId = raw => {
          const s = raw.replace(/-/g, "");
          return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20);
        };

        const resp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({
            properties: { "Associated To Do": { relation: (todoIds || []).map(id => ({ id: dashId(id) })) } }
          }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      if (body.action === "getPropertyNames") {
        const resp = await fetch(`https://api.notion.com/v1/databases/${CAMPAIGNS_DB}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        const data = await resp.json();
        return json({ props: Object.keys(data.properties || {}) });
      }

      if (body.action === "getProductStatuses") {
        const resp = await fetch(`https://api.notion.com/v1/databases/${PRODUCTS_DB}`, {
          headers: {
            "Authorization":  `Bearer ${NOTION_TOKEN}`,
            "Notion-Version": NOTION_VERSION,
          },
        });
        const data = await resp.json();
        if (!resp.ok) return json({ error: data.message || "Notion error" }, resp.status);
        const options = (data.properties?.Status?.select?.options || []).map(o => o.name);
        return json({ statuses: options });
      }

      if (body.action === "getCampaigns") {
        const campaigns = await getCampaigns();
        return json({ campaigns });
      }


      if (body.action === "getProductsTds") {
        const productRows = await notionQuery(PRODUCTS_DB, {
          filter: { property: "Status", select: { equals: "In Development" } },
        });
        const prodNames = {};
        productRows.forEach(p => { prodNames[p.id.replace(/-/g,"")] = p.properties.Name?.title?.map(t => t.plain_text).join("") || "Untitled"; });
        const prodIds = productRows.map(p => p.id.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5"));

        if (!prodIds.length) return json({ runs: [], drives: [], resumes: [] });

        const makeFilter = (prop, ids) => ids.length === 1
          ? { property: prop, relation: { contains: ids[0] } }
          : { or: ids.map(id => ({ property: prop, relation: { contains: id } })) };

        const [runRows, driveRows, resumeRows] = await Promise.all([
          notionQuery(RUNS_DB,    { filter: makeFilter("products", prodIds) }),
          notionQuery(DRIVES_DB,  { filter: makeFilter("product",  prodIds) }),
          notionQuery(RESUMES_DB, { filter: makeFilter("product",  prodIds) }),
        ]);

        const extractTds = (rows, nameField, productField) => {
          const results = [];
          rows.forEach(r => {
            const props = r.properties;
            const td = props["td"]?.rich_text?.map(t => t.plain_text).join("") || "";
            if (!td) return;
            const prodRel = (props[productField]?.relation || []).map(x => x.id.replace(/-/g,""));
            const prodName = prodRel[0] ? (prodNames[prodRel[0]] || "") : "";
            const itemName = (nameField === "Template Name"
              ? props["Template Name"]?.title?.map(t => t.plain_text).join("")
              : props["Name"]?.title?.map(t => t.plain_text).join("")) || "Untitled";
            results.push({ product: prodName, item: itemName, td });
          });
          return results;
        };

        return json({
          runs:    extractTds(runRows,    "Template Name", "products"),
          drives:  extractTds(driveRows,  "Name",          "product"),
          resumes: extractTds(resumeRows, "Name",          "product"),
        });
      }
      if (body.action === "getProducts") {
        // Fetch products and campaigns in parallel so we can resolve campaign name + site
        const [productRows, campRows] = await Promise.all([
          notionQuery(PRODUCTS_DB, {
            sorts: [{ property: "Name", direction: "ascending" }],
          }),
          notionQuery(CAMPAIGNS_DB, {
            filter: { property: "Status", select: { does_not_equal: "Delete" } },
          }),
        ]);

        // Build campaign lookup by id
        const campById = {};
        campRows.forEach(c => {
          const id = c.id.replace(/-/g, "");
          campById[id] = {
            name:      c.properties.Name?.title?.map(t => t.plain_text).join("") || "Untitled",
            site:      c.properties.site?.select?.name || "Other",
            microsite: c.properties["microsite"]?.url || null,
          };
        });

        const campaignIds = new Set(Object.keys(campById));

        const products = productRows.map(p => {
          const props = p.properties;
          const id = p.id.replace(/-/g, "");

          // Find campaign via the "Campaigns" relation property
          let campaignName = "";
          let site = props.Site?.select?.name || "";
          let micrositeUrl = null;
          const campRel = props["Campaigns"]?.relation || [];
          campRel.forEach(r => {
            const rid = r.id.replace(/-/g, "");
            if (campaignIds.has(rid)) {
              campaignName = campById[rid].name;
              if (!site) site = campById[rid].site;
              if (!micrositeUrl) micrositeUrl = campById[rid].microsite;
            }
          });

          return {
            id,
            name:      props.Name?.title?.map(t => t.plain_text).join("") || "Untitled",
            campaign:  campaignName,
            site,
            status:    props.Status?.select?.name || "",
            microsite: micrositeUrl,
          };
        });

        return json({ products });
      }
      if (body.action === "getProductSchema") {
        const resp = await fetch(`https://api.notion.com/v1/databases/${PRODUCTS_DB}`, {
          headers: {
            "Authorization":  `Bearer ${NOTION_TOKEN}`,
            "Notion-Version": NOTION_VERSION,
          },
        });
        const data = await resp.json();
        if (!resp.ok) return json({ error: data.message || "Notion error" }, resp.status);
        // Return all property names and types
        const props = Object.entries(data.properties || {}).map(([name, val]) => ({
          name,
          type: val.type,
        }));
        return json({ props });
      }

      if (body.action === "createCampaign") {
        const { name, site, grouping } = body;
        if (!name) return json({ error: "name required" }, 400);
        const props = {
          Name:   { title: [{ type: "text", text: { content: name } }] },
          Status: { select: { name: "Planning" } },
        };
        if (site)     props["site"]     = { select: { name: site } };
        if (grouping?.length) props["Grouping"] = { multi_select: grouping.map(g => ({ name: g })) };
        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ parent: { database_id: CAMPAIGNS_DB }, properties: props }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
        return json({ success: true, id: result.id.replace(/-/g,""), name });
      }

      if (body.action === "createProduct") {
        const { title, status, campaignId } = body;
        if (!title) return json({ error: "title required" }, 400);

        const props = {
          Name:   { title: [{ type: "text", text: { content: title } }] },
          Status: { select: { name: status || "Active" } },
        };
        if (campaignId) {
          const dashed = campaignId.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
          props["Campaigns"] = { relation: [{ id: dashed }] };
        }

        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: {
            "Authorization":  `Bearer ${NOTION_TOKEN}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type":   "application/json",
          },
          body: JSON.stringify({ parent: { database_id: PRODUCTS_DB }, properties: props }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
        return json({ success: true, id: result.id.replace(/-/g,"") });
      }
      if (body.action === "updateProductStatus") {
        const { productId, status } = body;
        if (!productId || !status) return json({ error: "productId and status required" }, 400);
        const dashed = productId.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
          method: "PATCH",
          headers: {
            "Authorization":  `Bearer ${NOTION_TOKEN}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type":   "application/json",
          },
          body: JSON.stringify({ properties: { Status: { select: { name: status } } } }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      // Î"Ã¶Ã‡Î"Ã¶Ã‡ CAMPAIGN ADMIN: getTitles Î"Ã¶Ã‡Î"Ã¶Ã‡




      if (body.action === "uploadDeliveryFile") {
        const { runId, fileName, contentType, fileData } = body;
        if (!runId || !fileName || !contentType || !fileData) return json({ error: "runId, fileName, contentType, fileData required" }, 400);
        const dashed = runId.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");

        // Decode base64
        const binary = atob(fileData);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        // Step 1: Create file upload entry
        const createResp = await fetch("https://api.notion.com/v1/file_uploads", {
          method: "POST",
          headers: {
            "Authorization":  `Bearer ${NOTION_TOKEN}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type":   "application/json",
          },
          body: JSON.stringify({ content_type: contentType, mode: "single_part" }),
        });
        const createData = await createResp.json();
        if (!createResp.ok) return json({ error: createData.message || "File upload init failed" }, createResp.status);
        const { id: uploadId, upload_url: uploadUrl } = createData;
        if (!uploadId) return json({ error: "File upload init returned no ID" }, 500);

        // Step 2: POST file as multipart/form-data to Notion upload_url
        const formData = new FormData();
        formData.append("file", new Blob([bytes], { type: contentType }), fileName);
        const putResp = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
          body: formData,
        });
        if (!putResp.ok) {
          const putErr = await putResp.text();
          return json({ error: "File upload failed: " + putErr.slice(0, 200) }, putResp.status);
        }

        // Step 3: Attach to run page
        const patchResp = await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
          method: "PATCH",
          headers: {
            "Authorization":  `Bearer ${NOTION_TOKEN}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type":   "application/json",
          },
          body: JSON.stringify({
            properties: {
              "Delivery File": {
                files: [{ type: "file_upload", name: fileName, file_upload: { id: uploadId } }],
              },
            },
          }),
        });
        const patchData = await patchResp.json();
        if (!patchResp.ok) return json({ error: patchData.message || "Failed to attach file" }, patchResp.status);

        // Return the hosted file URL for immediate display
        const fileUrl = patchData.properties?.["Delivery File"]?.files?.[0]?.file?.url || null;
        return json({ success: true, fileName, fileUrl });
      }
      if (body.action === "updateRun") {
        const { runId, templateName, format, status, price, canvaLink, canvaLinkMerged, publishedLink, etsyLink, listingCopy, td, loginId } = body;
        if (!runId || !templateName) return json({ error: "runId and templateName required" }, 400);
        const dash = i => { const s=i.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const dashed = dash(runId);
        const properties = {
          "Template Name": { title: [{ text: { content: templateName } }] },
          "Status":        { select: { name: status || "Not Started" } },
          "Format":        format ? { select: { name: format } } : { select: null },
          "Price":         price  ? { rich_text: [{ text: { content: price } }] } : { rich_text: [] },
          "Canva Edit Link":          { url: canvaLink     || null },
          "Published Template Link":  { url: publishedLink || null },
          "Etsy Listing URL":         { url: etsyLink      || null },
          "listing copy":             listingCopy ? { rich_text: [{ text: { content: listingCopy } }] } : { rich_text: [] },
          "td":                       td          ? { rich_text: [{ text: { content: td } }]          } : { rich_text: [] },
          "canva link":               canvaLinkMerged !== undefined ? { url: canvaLinkMerged || null } : undefined,
          "Login":                    loginId !== undefined ? (loginId ? { relation: [{ id: dash(loginId) }] } : { relation: [] }) : undefined,
        };
        Object.keys(properties).forEach(k => properties[k] === undefined && delete properties[k]);
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }
      if (body.action === "createRun") {
        const { productId, templateName, format, status, price, canvaLink, publishedLink, etsyLink, listingCopy, loginId } = body;
        if (!productId || !templateName) return json({ error: "productId and templateName required" }, 400);
        const dash = i => { const s=i.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const dashed = dash(productId);
        const properties = {
          "Template Name": { title: [{ text: { content: templateName } }] },
          "products":      { relation: [{ id: dashed }] },
          "Status":        { select: { name: status || "Not Started" } },
        };
        if (format)        properties["Format"]                  = { select: { name: format } };
        if (price)         properties["Price"]                   = { rich_text: [{ text: { content: price } }] };
        if (canvaLink)     properties["Canva Edit Link"]         = { url: canvaLink };
        if (publishedLink) properties["Published Template Link"] = { url: publishedLink };
        if (etsyLink)      properties["Etsy Listing URL"]        = { url: etsyLink };
        if (listingCopy)   properties["listing copy"]             = { rich_text: [{ text: { content: listingCopy } }] };
        if (loginId)       properties["Login"]                   = { relation: [{ id: dash(loginId) }] };

        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: {
            "Authorization":  `Bearer ${NOTION_TOKEN}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type":   "application/json",
          },
          body: JSON.stringify({ parent: { database_id: RUNS_DB }, properties }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
        return json({ id: result.id });
      }



      if (body.action === "updateDrive") {
        const { driveId, name, campaignId, methodId, emailId, instagramId, td, canvaLink } = body;
        if (!driveId || !name) return json({ error: "driveId and name required" }, 400);
        const dash = id => id ? id.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5") : null;
        const rel  = id => id ? { relation: [{ id: dash(id) }] } : { relation: [] };
        const dashed = dash(driveId);
        const properties = {
          "Name":        { title: [{ text: { content: name } }] },
          "campaign":    rel(campaignId),
          "method":      rel(methodId),
          "email":       rel(emailId),
          "instagram":   rel(instagramId),
          "td":          td ? { rich_text: [{ text: { content: td } }] } : { rich_text: [] },
          "canva link":  canvaLink !== undefined ? { url: canvaLink || null } : undefined,
        };
        // Remove undefined properties
        Object.keys(properties).forEach(k => properties[k] === undefined && delete properties[k]);
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }
      if (body.action === "createDrive") {
        const { name, productId } = body;
        if (!name || !productId) return json({ error: "name and productId required" }, 400);
        const dashed = productId.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: {
            "Authorization":  `Bearer ${NOTION_TOKEN}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type":   "application/json",
          },
          body: JSON.stringify({
            parent: { database_id: DRIVES_DB },
            properties: {
              "Name":    { title: [{ text: { content: name } }] },
              "product": { relation: [{ id: dashed }] },
            },
          }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
        return json({ id: result.id });
      }

      if (body.action === "getResumes") {
        const { productId } = body;
        if (!productId) return json({ error: "productId required" }, 400);
        const dashed = productId.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
        const [resumeRows, campRows] = await Promise.all([
          notionQuery(RESUMES_DB, {
            filter: { property: "product", relation: { contains: dashed } },
            sorts: [{ timestamp: "created_time", direction: "descending" }],
          }),
          notionQuery(CAMPAIGNS_DB, {}),
        ]);
        const campById = {};
        campRows.forEach(c => { campById[c.id.replace(/-/g,"")] = c.properties.Name?.title?.map(t => t.plain_text).join("") || ""; });
        const resumes = resumeRows.map(r => {
          const props = r.properties;
          const campRel = (props["campaign"]?.relation || []).map(x => x.id.replace(/-/g,""));
          return {
            id:         r.id.replace(/-/g, ""),
            name:       props["Name"]?.title?.map(t => t.plain_text).join("") || "Untitled",
            landing:    props["landing"]?.rollup?.array?.[0]?.url || null,
            campaignId: campRel[0] || null,
            campaign:   campRel[0] ? (campById[campRel[0]] || "") : "",
            td:         props["td"]?.rich_text?.map(t => t.plain_text).join("") || "",
          };
        });
        return json({ resumes });
      }

      if (body.action === "createResume") {
        const { name, productId, campaignId } = body;
        if (!name || !productId) return json({ error: "name and productId required" }, 400);
        const pDashed = productId.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
        const properties = {
          "Name":    { title: [{ text: { content: name } }] },
          "product": { relation: [{ id: pDashed }] },
        };
        if (campaignId) {
          const cDashed = campaignId.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
          properties["campaign"] = { relation: [{ id: cDashed }] };
        }
        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ parent: { database_id: RESUMES_DB }, properties }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
        return json({ id: result.id });
      }

      if (body.action === "updateResume") {
        const { resumeId, name, campaignId, td } = body;
        if (!resumeId || !name) return json({ error: "resumeId and name required" }, 400);
        const dash = id => id ? id.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5") : null;
        const dashed = dash(resumeId);
        const properties = {
          "Name":     { title: [{ text: { content: name } }] },
          "campaign": campaignId ? { relation: [{ id: dash(campaignId) }] } : { relation: [] },
          "td":       td ? { rich_text: [{ text: { content: td } }] } : { rich_text: [] },
        };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }
      if (body.action === "getDrives") {
        const { productId } = body;
        if (!productId) return json({ error: "productId required" }, 400);
        const dashed = productId.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
        const [driveRows, campRows, methodRows, loginRows] = await Promise.all([
          notionQuery(DRIVES_DB, {
            filter: { property: "product", relation: { contains: dashed } },
            sorts: [{ timestamp: "created_time", direction: "descending" }],
          }),
          notionQuery(CAMPAIGNS_DB, {}),
          notionQuery(METHODS_DB, {}),
          notionQuery(LOGINS_DB, {}),
        ]);
        const campById = {};
        campRows.forEach(c => { campById[c.id.replace(/-/g,"")] = { name: c.properties.Name?.title?.map(t => t.plain_text).join("") || "", microsite: c.properties["microsite"]?.url || null }; });
        const methodById = {};
        methodRows.forEach(m => { methodById[m.id.replace(/-/g,"")] = m.properties.Name?.title?.map(t => t.plain_text).join("") || ""; });
        const loginById = {};
        loginRows.forEach(l => {
          const lp = l.properties;
          loginById[l.id.replace(/-/g,"")] = {
            id:     l.id.replace(/-/g,""),
            name:   lp.Name?.title?.map(t => t.plain_text).join("") || "",
            status: lp.Status?.select?.name || "",
            usr:    lp.Usr?.rich_text?.map(t => t.plain_text).join("") || "",
          };
        });
        const drives = driveRows.map(r => {
          const props = r.properties;
          const campRel      = (props["campaign"]?.relation   || []).map(x => x.id.replace(/-/g,""));
          const microRel     = (props["micro"]?.relation      || []).map(x => x.id.replace(/-/g,""));
          const methodRel    = (props["method"]?.relation     || []).map(x => x.id.replace(/-/g,""));
          const emailRel     = (props["email"]?.relation      || []).map(x => x.id.replace(/-/g,""));
          const instagramRel = (props["instagram"]?.relation  || []).map(x => x.id.replace(/-/g,""));
          const listingRel   = (props["Listing"]?.relation    || []).map(x => x.id.replace(/-/g,""));
          return {
            id:             r.id.replace(/-/g, ""),
            name:           props["Name"]?.title?.map(t => t.plain_text).join("") || "Untitled",
            landing:        props["landing"]?.rollup?.array?.[0]?.url || null,
            ste:            props["ste"]?.rollup?.array?.[0]?.url     || null,
            campaignId:     campRel[0]      || null,
            campaign:       campRel[0]      ? (campById[campRel[0]]?.name      || "") : "",
            microId:        microRel[0]     || null,
            micro:          microRel[0]     ? (campById[microRel[0]]?.name     || "") : "",
            methodId:       methodRel[0]    || null,
            method:         methodRel[0]    ? (methodById[methodRel[0]]        || "") : "",
            emailId:        emailRel[0]     || null,
            email:          emailRel[0]     ? (loginById[emailRel[0]]?.name    || "") : "",
            instagramId:    instagramRel[0] || null,
            instagram:      instagramRel[0] ? (loginById[instagramRel[0]]?.name || "") : "",
            td:             props["td"]?.rich_text?.map(t => t.plain_text).join("") || "",
            canvaLink:      props["canva link"]?.url || null,
            listingLogins:  listingRel.map(id => loginById[id]).filter(Boolean),
          };
        });
        return json({ drives });
      }
      if (body.action === "getRuns") {
        const { productId } = body;
        if (!productId) return json({ error: "productId required" }, 400);
        const dashed = productId.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
        const rows = await notionQuery(RUNS_DB, {
          filter: { property: "products", relation: { contains: dashed } },
          sorts: [{ timestamp: "created_time", direction: "descending" }],
        });
        const runs = rows.map(r => {
          const props = r.properties;
          return {
            id:            r.id.replace(/-/g, ""),
            name:          props["Template Name"]?.title?.map(t => t.plain_text).join("") || "Untitled",
            status:        props.Status?.select?.name || "",
            format:        props.Format?.select?.name || "",
            price:         props.Price?.rich_text?.map(t => t.plain_text).join("") || "",
            canvaEditLink:    props["Canva Edit Link"]?.url || null,
            canvaLink:        props["canva link"]?.url || null,
            publishedLink:    props["Published Template Link"]?.url || null,
            etsyLink:         props["Etsy Listing URL"]?.url || null,
            deliveryFile:     props["Delivery File"]?.files?.[0]?.file?.url || null,
            deliveryFileName: props["Delivery File"]?.files?.[0]?.name || null,
            listingCopy:      props["listing copy"]?.rich_text?.map(t => t.plain_text).join("") || "",
            td:               props["td"]?.rich_text?.map(t => t.plain_text).join("") || "",
            loginIds:         (props["Login"]?.relation || []).map(x => x.id.replace(/-/g,"")),
          };
        });
        return json({ runs });
      }
      if (body.action === "getTitles") {
        const { stages, campaignId } = body;
        const stageFilters = (stages || ["Review", "Publish"]).map(s => ({
          property: "Status",
          select: { equals: s }
        }));
        const filter = campaignId
          ? { and: [
              { or: stageFilters },
              { property: "Campaign", relation: { contains: campaignId } }
            ]}
          : { or: stageFilters };
        const results = await notionQuery(CONTENT_STRATEGY_DB, {
          filter,
          sorts: [{ property: "Sequence Order", direction: "ascending" }],
        });
        return json({
          titles: results.map(page => {
            const props = page.properties;
            return {
              id: page.id.replace(/-/g, ""),
              title: props.Title?.title?.map(t => t.plain_text).join("") || "Untitled",
              stage: props.Status?.select?.name || "",
              cohort: props.Grouping?.rich_text?.map(t => t.plain_text).join("") || "Uncategorized",
              sequence: props["Sequence Order"]?.number || 999,
              scheduled: props["Scheduled Date"]?.date?.start || "",
            };
          })
        });
      }

      // Î"Ã¶Ã‡Î"Ã¶Ã‡ CAMPAIGN ADMIN: getTodos Î"Ã¶Ã‡Î"Ã¶Ã‡
      if (body.action === "getTodos") {
        const results = await notionQuery(MAIN_TD_DB, {
          filter: {
            or: [
              { property: "priority", multi_select: { contains: "daily content" } },
              { property: "priority", multi_select: { contains: "daily household" } },
              { property: "priority", multi_select: { contains: "get" } },
              { property: "priority", multi_select: { contains: "high" } },
            ]
          },
          sorts: [{ property: "Due Date", direction: "ascending" }],
        });
        const todos = await Promise.all(results.map(async page => {
          const props = page.properties;
          const name = props.Name?.title?.map(t => t.plain_text).join("") || "Untitled";
          const priorities = props.priority?.multi_select?.map(s => s.name) || [];
          const campaignRefs = props.campaign?.relation || [];
          let campaignName = "";
          if (campaignRefs.length > 0) {
            try {
              const cp = await fetch(`https://api.notion.com/v1/pages/${campaignRefs[0].id}`, {
                headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }
              });
              const cpd = await cp.json();
              campaignName = cpd.properties?.Name?.title?.map(t => t.plain_text).join("") || "";
            } catch {}
          }
          const category = priorities.includes("daily content") ? "daily content"
            : priorities.includes("daily household") ? "daily household"
            : priorities.includes("get") ? "get"
            : "high";
          return { id: page.id.replace(/-/g, ""), name, campaign: campaignName, priority: priorities.join(", "), category };
        }));
        return json({ todos });
      }

      // ── getMorningBriefing ──
      if (body.action === "getMorningBriefing") {
        if (!await verifyToken(body.token, HMAC_SECRET)) return json({ error: "Unauthorized" }, 401);
        const [campRows, titleRows, todoRows] = await Promise.all([
          notionQuery(CAMPAIGNS_DB, {
            filter: { property: "Status", select: { equals: "Active" } },
            sorts: [{ property: "Name", direction: "ascending" }],
          }),
          notionQuery(CONTENT_STRATEGY_DB, {
            filter: { or: [
              { property: "Status", select: { equals: "Development" } },
              { property: "Status", select: { equals: "Writing" } },
              { property: "Status", select: { equals: "Idea" } },
              { property: "Status", select: { equals: "Outline" } },
            ]},
            sorts: [{ property: "Sequence Order", direction: "ascending" }],
          }),
          notionQuery(MAIN_TD_DB, {
            filter: { property: "priority", multi_select: { contains: "high" } },
          }),
        ]);

        // Map campaign id -> next 2 queued titles
        const nextTitles = {};
        titleRows.forEach(t => {
          const tname  = t.properties.Title?.title?.map(x => x.plain_text).join("") || "Untitled";
          const tstage = t.properties.Status?.select?.name || "";
          (t.properties.Campaign?.relation || []).forEach(r => {
            const cid = r.id.replace(/-/g,"");
            if (!nextTitles[cid]) nextTitles[cid] = [];
            if (nextTitles[cid].length < 2) nextTitles[cid].push({ title: tname, stage: tstage });
          });
        });

        // Map campaign id -> high-priority todo count
        const highTodoCounts = {};
        todoRows.forEach(t => {
          (t.properties.campaign?.relation || []).forEach(r => {
            const cid = r.id.replace(/-/g,"");
            highTodoCounts[cid] = (highTodoCounts[cid] || 0) + 1;
          });
        });

        const campaigns = campRows.map(c => {
          const id = c.id.replace(/-/g,"");
          return {
            id,
            name:      c.properties.Name?.title?.map(x => x.plain_text).join("") || "Untitled",
            siteUrl:   c.properties["microsite"]?.url || null,
            liveUrl:   c.properties["live site"]?.url || null,
            titles:    nextTitles[id] || [],
            highTodos: highTodoCounts[id] || 0,
          };
        });

        // Pull last scan diff + date from KV
        const [diffRaw, lastScanDate] = await Promise.all([
          env.TRADES.get("morning:diff").catch(() => null),
          env.TRADES.get("morning:last_scan").catch(() => null),
        ]);
        const scanDiff = diffRaw ? JSON.parse(diffRaw) : null;

        return json({ campaigns, diff: scanDiff, lastScanDate: lastScanDate || null });
      }

      //Î"Ã¶Ã‡Î"Ã¶Ã‡ CAMPAIGN ADMIN: getExplodeQueue Î"Ã¶Ã‡Î"Ã¶Ã‡
      if (body.action === "getExplodeQueue") {
        const results = await notionQuery(CONTENT_STRATEGY_DB, {
          filter: {
            or: [
              { property: "Status", select: { equals: "Writing" } },
              { property: "Status", select: { equals: "Done" } },
              { property: "Status", select: { equals: "Approved" } },
            ]
          },
          sorts: [{ property: "Sequence Order", direction: "ascending" }],
        });
        return json({
          titles: results.map(page => {
            const props = page.properties;
            return {
              titleId: page.id.replace(/-/g, ""),
              titleName: props.Title?.title?.map(t => t.plain_text).join("") || "Untitled",
              campaignName: props.Grouping?.rich_text?.map(t => t.plain_text).join("") || "",
              stage: props.Status?.select?.name || "",
            };
          })
        });
      }

      // Î"Ã¶Ã‡Î"Ã¶Ã‡ CAMPAIGN ADMIN: getChildren (Notion page children) Î"Ã¶Ã‡Î"Ã¶Ã‡
      if (body.action === "getChildren") {
        const { pageId } = body;
        if (!pageId) return json({ error: "pageId required" }, 400);
        const resp = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }
        });
        const data = await resp.json();
        const pages = (data.results || [])
          .filter(b => b.type === "child_page")
          .map(b => ({ id: b.id.replace(/-/g, ""), name: b.child_page?.title || "Untitled", icon: "" }));
        return json({ pages });
      }

      // Î"Ã¶Ã‡Î"Ã¶Ã‡ CAMPAIGN ADMIN: getResearch Î"Ã¶Ã‡Î"Ã¶Ã‡
      if (body.action === "getResearch") {
        const { campaignId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const [results, campResp] = await Promise.all([
          notionQuery(RESEARCH_DB, {
            filter: { property: "Campaign", relation: { contains: campaignId } },
          }),
          fetch(`https://api.notion.com/v1/pages/${campaignId}`, {
            headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }
          }).then(r => r.json()).catch(() => null),
        ]);
        if (!results.length) return json({ research: null });
        const props = results[0].properties;
        const cp = campResp?.properties || {};
        return json({
          research: {
            id: results[0].id.replace(/-/g, ""),
            name: props.Name?.title?.map(t => t.plain_text).join("") || "",
            status: props.Status?.select?.name || "",
            lastUpdated: props["date:Last Updated:start"]?.date?.start || "",
            keywords: props.Keywords?.rich_text?.map(t => t.plain_text).join("") || "",
            newsFeed: props["News Feed"]?.rich_text?.map(t => t.plain_text).join("") || "",
            notes: props.Notes?.rich_text?.map(t => t.plain_text).join("") || "",
            thoughts: props.Thoughts?.rich_text?.map(t => t.plain_text).join("") || "",
            platforms: props["Platforms & Methods"]?.rich_text?.map(t => t.plain_text).join("") || "",
            productIdeas: props["Product Ideas"]?.rich_text?.map(t => t.plain_text).join("") || "",
            tikTokShopProducts: props["TikTok Shop Products"]?.rich_text?.map(t => t.plain_text).join("") || "",
            kdpBestSellers: props["KDP Best Sellers"]?.rich_text?.map(t => t.plain_text).join("") || "",
            tiktokTrends: props["TikTok Trends"]?.rich_text?.map(t => t.plain_text).join("") || "",
            trendIntelligence: props["Trend Intelligence"]?.rich_text?.map(t => t.plain_text).join("") || "",
            etsyProducts:      props["Etsy Products"]?.rich_text?.map(t => t.plain_text).join("") || "",
            youtubeOutliers:   props["YouTube Outliers"]?.rich_text?.map(t => t.plain_text).join("") || "",
            keyMessage: props["Key Message"]?.rich_text?.map(t => t.plain_text).join("") || "",
            webPageUrl: props["Web Page URL"]?.url || "",
            uniqueOpportunity: props["Unique Opportunity"]?.rich_text?.map(t => t.plain_text).join("") || "",
            campaignGoal: cp["Campaign Goal"]?.rich_text?.map(t => t.plain_text).join("") || "",
            painPoints: cp["Pain Points"]?.rich_text?.map(t => t.plain_text).join("") || "",
            campaignKeyMessage: cp["Key Message"]?.rich_text?.map(t => t.plain_text).join("") || "",
          }
        });
      }

      // Î"Ã¶Ã‡Î"Ã¶Ã‡ CAMPAIGN ADMIN: condense via Claude Î"Ã¶Ã‡Î"Ã¶Ã‡
      if (body.action === "condense") {
        const { label, text } = body;
        if (!text) return json({ html: '<p>Î"Ã‡Ã¶</p>' });
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY || '',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 500,
            system: `You are a content ops assistant. Rewrite the input as structured entries.

FORMAT Î"Ã‡Ã¶ each entry on its own line:
HEADING: body text

Rules:
- HEADING is 2-4 words, ALL CAPS
- Body text is the actionable insight, max 20 words
- Total words per entry must not exceed 30
- No bullets, no dashes, no markdown, no preamble
- 3 to 6 entries total
- Output only the entries, nothing else`,
            messages: [{ role: 'user', content: (label || '') + ':\n' + text }]
          })
        });
        const data = await resp.json();
        if (!resp.ok) return json({ error: data.error?.message || 'Claude error' }, 502);
        const out = data.content?.[0]?.text || '';
        return json({ text: out });
      }

      // â"€â"€ CAMPAIGN ADMIN: sendPrompt via Claude â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
      if (body.action === "sendPrompt") {
        const { prompt } = body;
        if (!prompt) return json({ error: "prompt required" }, 400);
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY || '',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 2048,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        const data = await resp.json();
        if (!resp.ok) return json({ error: data.error?.message || "Claude error" }, resp.status);
        const text = data.content?.[0]?.text || '';
        return json({ text });
      }

      // ── createAsset ──────────────────────────────────────────────────
      if (body.action === "createAsset") {
        const { titleId, campId, assetTitle, platformName, assetType, content } = body;
        if (!titleId || !assetTitle) return json({ error: "titleId and assetTitle required" }, 400);
        const dash = id => id.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");

        const properties = {
          "Asset Title": { title: [{ text: { content: assetTitle } }] },
          "Asset Status": { select: { name: "Development" } },
          "Body": { rich_text: [{ text: { content: (content || "").slice(0, 2000) } }] },
          "Content Strategy": { relation: [{ id: dash(titleId) }] },
        };
        if (platformName) properties["Platform Name"] = { select: { name: platformName } };
        if (assetType)    properties["Asset Type"]    = { select: { name: assetType } };
        if (campId)       properties["Campaign"]      = { relation: [{ id: dash(campId) }] };

        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ parent: { database_id: ASSETS_DB }, properties })
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
        return json({ id: result.id?.replace(/-/g,"") || "", url: result.url || "" });
      }

      // -- generateVideo (Kie.ai text-to-video) ----------------------------------------
      if (body.action === "generateVideo") {
        const { prompt, aspectRatio, duration } = body;
        if (!prompt) return json({ error: "prompt required" }, 400);
        const KIE_KEY = (env.KIE_API_KEY || "").trim();
        if (!KIE_KEY) return json({ error: "KIE_API_KEY not configured" }, 500);
        const resp = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
          method: "POST",
          headers: { "Authorization": "Bearer " + KIE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "kling-2.6/text-to-video",
            input: {
              prompt: prompt.slice(0, 1000),
              sound: false,
              aspect_ratio: aspectRatio || "9:16",
              duration: duration || "5",
            }
          })
        });
        const result = await resp.json();
        console.log("KIE generateVideo response:", JSON.stringify(result));
        if (!resp.ok) return json({ error: result.message || result.msg || "Kie.ai error", _raw: result }, resp.status);
        const taskId = result.data?.taskId || result.data?.task_id || result.data?.id
          || result.taskId || result.task_id || result.id
          || (Array.isArray(result.data) ? result.data[0]?.taskId || result.data[0]?.task_id || result.data[0]?.id : null);
        if (!taskId) return json({ error: "No taskId — raw: " + JSON.stringify(result).slice(0, 300) });
        return json({ taskId });
      }

      // -- getVideoTask (Kie.ai poll task status) ---------------------------------------
      if (body.action === "getVideoTask") {
        const { taskId } = body;
        if (!taskId) return json({ error: "taskId required" }, 400);
        const KIE_KEY = (env.KIE_API_KEY || "").trim();
        if (!KIE_KEY) return json({ error: "KIE_API_KEY not configured" }, 500);
        const resp = await fetch("https://api.kie.ai/api/v1/jobs/recordInfo?taskId=" + encodeURIComponent(taskId), {
          headers: { "Authorization": "Bearer " + KIE_KEY }
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || result.msg || "Kie.ai error" }, resp.status);
        const data = result.data || {};
        let videoUrl = null;
        if (data.resultJson) {
          try {
            const rj = typeof data.resultJson === "string" ? JSON.parse(data.resultJson) : data.resultJson;
            videoUrl = (rj.works && rj.works[0] && rj.works[0].resource) ? rj.works[0].resource.resource : (rj.url || rj.videoUrl || null);
          } catch(e2) {}
        }
        return json({ state: data.state, progress: data.progress, videoUrl: videoUrl, raw: data });
      }

      // -- generateImage (Kie.ai flux-2 text-to-image) ---------------------------------
      if (body.action === "generateImage") {
        const { prompt, aspectRatio } = body;
        if (!prompt) return json({ error: "prompt required" }, 400);
        const KIE_KEY = (env.KIE_API_KEY || "").trim();
        if (!KIE_KEY) return json({ error: "KIE_API_KEY not configured" }, 500);
        const resp = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
          method: "POST",
          headers: { "Authorization": "Bearer " + KIE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "flux-2/pro-text-to-image",
            input: {
              prompt: prompt.slice(0, 5000),
              aspect_ratio: aspectRatio || "4:5",
              resolution: "1K",
              nsfw_checker: false
            }
          })
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || result.msg || "Kie.ai error" }, resp.status);
        return json({ taskId: result.data && result.data.taskId ? result.data.taskId : result.taskId });
      }

      // -- getImageTask (Kie.ai poll image task status) ---------------------------------
      if (body.action === "getImageTask") {
        const { taskId } = body;
        if (!taskId) return json({ error: "taskId required" }, 400);
        const KIE_KEY = (env.KIE_API_KEY || "").trim();
        if (!KIE_KEY) return json({ error: "KIE_API_KEY not configured" }, 500);
        const resp = await fetch("https://api.kie.ai/api/v1/jobs/recordInfo?taskId=" + encodeURIComponent(taskId), {
          headers: { "Authorization": "Bearer " + KIE_KEY }
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || result.msg || "Kie.ai error" }, resp.status);
        const data = result.data || {};
        let imageUrls = [];
        if (data.resultJson) {
          try {
            const rj = typeof data.resultJson === "string" ? JSON.parse(data.resultJson) : data.resultJson;
            if (Array.isArray(rj)) {
              imageUrls = rj.map(function(item) { return item.url || item.resource || item; }).filter(Boolean);
            } else if (rj.images) {
              imageUrls = rj.images.map(function(item) { return item.url || item; }).filter(Boolean);
            } else if (rj.url) {
              imageUrls = [rj.url];
            } else if (rj.works) {
              imageUrls = rj.works.map(function(w) { return w.resource && w.resource.resource ? w.resource.resource : null; }).filter(Boolean);
            }
          } catch(e2) {}
        }
        return json({ state: data.state, imageUrls: imageUrls, raw: data });
      }
      // -- updateAssetVideoUrl (save Kie.ai video URL to Notion Content URL field) ------
      if (body.action === "updateAssetVideoUrl") {
        const { assetId, videoUrl } = body;
        if (!assetId || !videoUrl) return json({ error: "assetId and videoUrl required" }, 400);
        const dash2 = function(id) { var s = id.replace(/-/g,""); return s.slice(0,8)+"-"+s.slice(8,12)+"-"+s.slice(12,16)+"-"+s.slice(16,20)+"-"+s.slice(20); };
        const resp = await fetch("https://api.notion.com/v1/pages/" + dash2(assetId), {
          method: "PATCH",
          headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: {
            "Content URL": { url: videoUrl },
            "Asset Status": { select: { name: "Development" } }
          }})
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ ok: true, url: result.url || "" });
      }
      // -- updateAssetBody (update script body on existing asset) ---------------------
      if (body.action === "updateAssetBody") {
        const { assetId, content } = body;
        if (!assetId || !content) return json({ error: "assetId and content required" }, 400);
        const dash2 = function(id) { var s = id.replace(/-/g,""); return s.slice(0,8)+"-"+s.slice(8,12)+"-"+s.slice(12,16)+"-"+s.slice(16,20)+"-"+s.slice(20); };
        const resp = await fetch("https://api.notion.com/v1/pages/" + dash2(assetId), {
          method: "PATCH",
          headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: {
            "Body": { rich_text: [{ text: { content: content.slice(0, 2000) } }] }
          }})
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ ok: true });
      }
      // -- updateAssetVideoTaskId (save Kie.ai task ID to Notion) --------------------
      if (body.action === "updateAssetVideoTaskId") {
        const { assetId, taskId } = body;
        if (!assetId || !taskId) return json({ error: "assetId and taskId required" }, 400);
        const dash2 = function(id) { var s = id.replace(/-/g,""); return s.slice(0,8)+"-"+s.slice(8,12)+"-"+s.slice(12,16)+"-"+s.slice(16,20)+"-"+s.slice(20); };
        const resp = await fetch("https://api.notion.com/v1/pages/" + dash2(assetId), {
          method: "PATCH",
          headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: {
            "Video Task ID": { rich_text: [{ text: { content: taskId } }] }
          }})
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ ok: true });
      }
      // ── CAMPAIGN ADMIN: updateResearch ──────────────────────────────
      if (body.action === "updateResearch") {
        const { researchId, field, value } = body;
        if (!researchId || !field) return json({ error: "researchId and field required" }, 400);
        const fieldMap = {
          productIdeas:      "Product Ideas",
          notes:             "Notes",
          platforms:         "Platforms & Methods",
          tiktokTrends:      "TikTok Trends",
          trendIntelligence: "Trend Intelligence",
          newsFeed:          "News Feed",
          keyMessage:        "Key Message",
          thoughts:          "Thoughts",
          uniqueOpportunity: "Unique Opportunity",
        };
        const notionField = fieldMap[field];
        if (!notionField) return json({ error: "Unknown field: " + field }, 400);
        const dashed = researchId.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
        // Notion rich_text blocks max 2000 chars — chunk if needed
        const rtChunks = [];
        const rtStr = value || "";
        for (let i = 0; i < Math.max(rtStr.length, 1); i += 2000) {
          rtChunks.push({ type: "text", text: { content: rtStr.slice(i, i + 2000) } });
        }
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { [notionField]: { rich_text: rtChunks } } })
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      // ── getSMTrends ──
      if (body.action === "getSMTrends") {
        if (!await verifyToken(body.token, HMAC_SECRET)) return json({ error: "Unauthorized" }, 401);
        const { researchId, kwOverride } = body;
        if (!researchId) return json({ error: "researchId required" }, 400);

        const dashId = i => { const s=i.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };

        // Resolve keywords — use override if provided, else pull from Research record
        let keywords = (kwOverride || "").trim();
        if (!keywords) {
          try {
            const resResp = await fetch(`https://api.notion.com/v1/pages/${dashId(researchId)}`, {
              headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }
            });
            const resData = await resResp.json();
            keywords = resData.properties?.Keywords?.rich_text?.map(t => t.plain_text).join("") || "";
          } catch {}
        }
        if (!keywords) return json({ error: "No keywords found — add keywords to the Research record or enter them manually" }, 400);

        // Ask Claude Haiku for 15 underserved short-form video niches
        const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 1200,
            system: `You are a short-form video niche researcher. Given campaign keywords, identify the 15 most underserved niches and trends on TikTok and YouTube Shorts. Focus on niches with high audience demand but low quality content supply — real gaps where a creator can win quickly.

FORMAT — output exactly 15 lines, one per niche:
NICHE NAME: one-line description of the opportunity and why it's underserved

Rules:
- NICHE NAME is 2-5 words, title case
- Description is max 15 words, specific and actionable
- No bullets, no numbering, no markdown, no preamble or closing remarks
- Output only the 15 lines, nothing else`,
            messages: [{ role: 'user', content: `Campaign keywords: ${keywords}` }]
          })
        });
        const claudeData = await claudeResp.json();
        if (!claudeResp.ok) return json({ error: claudeData.error?.message || 'Claude error' }, 502);
        const result = (claudeData.content?.[0]?.text || '').trim();

        // Write to Notion Research DB → Trend Intelligence field
        const patch = await fetch(`https://api.notion.com/v1/pages/${dashId(researchId)}`, {
          method: 'PATCH',
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Trend Intelligence": { rich_text: [{ type: "text", text: { content: result.slice(0, 2000) } }] } } })
        });
        if (!patch.ok) {
          const pe = await patch.json();
          return json({ error: pe.message || "Notion write failed" }, patch.status);
        }
        return json({ success: true, text: result });
      }

      // ── getKDPBestSellers ──
      if (body.action === "getKDPBestSellers") {
        if (!await verifyToken(body.token, HMAC_SECRET)) return json({ error: "Unauthorized" }, 401);
        const { researchId, kwOverride } = body;
        if (!researchId) return json({ error: "researchId required" }, 400);

        const dashId = i => { const s=i.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };

        let keywords = (kwOverride || "").trim();
        if (!keywords) {
          try {
            const resResp = await fetch(`https://api.notion.com/v1/pages/${dashId(researchId)}`, {
              headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }
            });
            const resData = await resResp.json();
            keywords = resData.properties?.Keywords?.rich_text?.map(t => t.plain_text).join("") || "";
          } catch {}
        }
        if (!keywords) return json({ error: "No keywords found — add keywords or enter them manually" }, 400);

        const APIFY_KEY = (env.APIFY_TOKEN || env.APIFY_KEY || "").trim();
        if (!APIFY_KEY) return json({ error: "APIFY_TOKEN secret not set on worker" }, 500);

        // Search Amazon KDP ebooks via Apify KDP Niche Analyzer
        const searchTerm = keywords.split(/[,\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 3).join(" ");
        const apifyResp = await fetch(
          `https://api.apify.com/v2/acts/sarginstudio~kdp-amazon-book-niche-analyzer/run-sync-get-dataset-items?token=${APIFY_KEY}&timeout=90&maxItems=20`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ searchTerm })
          }
        );

        if (!apifyResp.ok) {
          const ae = await apifyResp.text();
          return json({ error: `Apify error: ${ae.slice(0, 200)}` }, 502);
        }

        const results = await apifyResp.json();
        // Actor returns [{searchTerm, totalBooks, books:[...]}] or direct array
        const resultObj = Array.isArray(results) ? results[0] : results;
        const books = (resultObj?.books || []).slice(0, 20);
        if (!books.length) return json({ error: "No results from Amazon — try different keywords" }, 404);

        // Format top results for Claude to clean up
        const raw = books.map(b =>
          `${b.title} | ${b.price || "N/A"} | ${b.rating || "?"}★ | ${b.reviewCount || 0} reviews | score:${b.nicheScore || "?"}`
        ).join("\n");

        const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-haiku-4-5",
            max_tokens: 1000,
            system: `You are a KDP publishing analyst. Format these Amazon Kindle ebook bestseller results into a clean, scannable list.

FORMAT — output one line per book:
TITLE (shortened to 5 words max): price · stars★ · review count reviews — one-line insight about why it sells

Rules:
- Title in title case, max 5 words, truncate with … if needed
- No bullets, no numbering, no markdown, no preamble
- Insight is max 10 words — what makes it a bestseller
- Output only the formatted lines, nothing else`,
            messages: [{ role: "user", content: `Kindle ebook bestsellers for keywords "${keywords}":\n\n${raw}` }]
          })
        });
        const claudeData = await claudeResp.json();
        if (!claudeResp.ok) return json({ error: claudeData.error?.message || "Claude error" }, 502);
        const result = (claudeData.content?.[0]?.text || "").trim();

        const patch = await fetch(`https://api.notion.com/v1/pages/${dashId(researchId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "KDP Best Sellers": { rich_text: [{ type: "text", text: { content: result.slice(0, 2000) } }] } } })
        });
        if (!patch.ok) {
          const pe = await patch.json();
          return json({ error: pe.message || "Notion write failed" }, patch.status);
        }
        return json({ success: true, text: result });
      }

      // ── getTikTokShopProducts ──
      if (body.action === "getTikTokShopProducts") {
        if (!await verifyToken(body.token, HMAC_SECRET)) return json({ error: "Unauthorized" }, 401);
        const { researchId, kwOverride } = body;
        if (!researchId) return json({ error: "researchId required" }, 400);

        const dashId = i => { const s=i.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };

        let keywords = (kwOverride || "").trim();
        if (!keywords) {
          try {
            const resResp = await fetch(`https://api.notion.com/v1/pages/${dashId(researchId)}`, {
              headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }
            });
            const resData = await resResp.json();
            keywords = resData.properties?.Keywords?.rich_text?.map(t => t.plain_text).join("") || "";
          } catch {}
        }
        if (!keywords) return json({ error: "No keywords found — add keywords to the Research record or enter them manually" }, 400);

        const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 1200,
            system: `You are a TikTok Shop product researcher. Given campaign keywords, identify the 15 best-fit products currently trending on TikTok Shop Seller Central that this audience would buy. Focus on products with high GMV, strong creator adoption, and viral potential — real products a seller can source and promote today.

FORMAT — output exactly 15 lines, one per product:
PRODUCT NAME: price range · why it's trending on TikTok Shop right now

Rules:
- PRODUCT NAME is 2-5 words, title case
- After the colon: price range (e.g. $12–$35) then · then a max-12-word reason it's trending
- No bullets, no numbering, no markdown, no preamble or closing remarks
- Output only the 15 lines, nothing else`,
            messages: [{ role: 'user', content: `Campaign keywords: ${keywords}` }]
          })
        });
        const claudeData = await claudeResp.json();
        if (!claudeResp.ok) return json({ error: claudeData.error?.message || 'Claude error' }, 502);
        const result = (claudeData.content?.[0]?.text || '').trim();

        const patch = await fetch(`https://api.notion.com/v1/pages/${dashId(researchId)}`, {
          method: 'PATCH',
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "TikTok Shop Products": { rich_text: [{ type: "text", text: { content: result.slice(0, 2000) } }] } } })
        });
        if (!patch.ok) {
          const pe = await patch.json();
          return json({ error: pe.message || "Notion write failed" }, patch.status);
        }
        return json({ success: true, text: result });
      }

      // ── getProductIdeas ──
      if (body.action === "getProductIdeas") {
        if (!await verifyToken(body.token, HMAC_SECRET)) return json({ error: "Unauthorized" }, 401);
        const { researchId, kwOverride } = body;
        if (!researchId) return json({ error: "researchId required" }, 400);

        const dashId = i => { const s=i.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };

        let keywords = (kwOverride || "").trim();
        if (!keywords) {
          try {
            const resResp = await fetch(`https://api.notion.com/v1/pages/${dashId(researchId)}`, {
              headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }
            });
            const resData = await resResp.json();
            keywords = resData.properties?.Keywords?.rich_text?.map(t => t.plain_text).join("") || "";
          } catch {}
        }
        if (!keywords) return json({ error: "No keywords found — add keywords to the Research record or enter them manually" }, 400);

        const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 1200,
            system: `You are a product strategist. Given campaign keywords, identify 15 specific product or offer ideas that would sell well to this audience. Focus on digital products, info products, services, or physical products that directly address the audience's pain points and desires.

FORMAT — output exactly 15 lines, one per idea:
PRODUCT NAME: one-line description of the product and who it's for

Rules:
- PRODUCT NAME is 2-5 words, title case
- Description is max 15 words, specific and monetizable
- No bullets, no numbering, no markdown, no preamble or closing remarks
- Output only the 15 lines, nothing else`,
            messages: [{ role: 'user', content: `Campaign keywords: ${keywords}` }]
          })
        });
        const claudeData = await claudeResp.json();
        if (!claudeResp.ok) return json({ error: claudeData.error?.message || 'Claude error' }, 502);
        const result = (claudeData.content?.[0]?.text || '').trim();

        const patch = await fetch(`https://api.notion.com/v1/pages/${dashId(researchId)}`, {
          method: 'PATCH',
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Product Ideas": { rich_text: [{ type: "text", text: { content: result.slice(0, 2000) } }] } } })
        });
        if (!patch.ok) {
          const pe = await patch.json();
          return json({ error: pe.message || "Notion write failed" }, patch.status);
        }
        return json({ success: true, text: result });
      }

      // ── getEtsyProducts ──
      if (body.action === "getEtsyProducts") {
        if (!await verifyToken(body.token, HMAC_SECRET)) return json({ error: "Unauthorized" }, 401);
        const { researchId, kwOverride } = body;
        if (!researchId) return json({ error: "researchId required" }, 400);

        const dashId = i => { const s=i.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };

        let keywords = (kwOverride || "").trim();
        if (!keywords) {
          try {
            const resResp = await fetch(`https://api.notion.com/v1/pages/${dashId(researchId)}`, {
              headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }
            });
            const resData = await resResp.json();
            keywords = resData.properties?.Keywords?.rich_text?.map(t => t.plain_text).join("") || "";
          } catch {}
        }
        if (!keywords) return json({ error: "No keywords found — add keywords to the Research record or enter them manually" }, 400);

        const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 1200,
            system: `You are an Etsy market research specialist who knows the platform deeply. Given campaign keywords, identify the 15 top-selling and trending Etsy product opportunities that fit this niche. Draw on your knowledge of Etsy bestseller categories, high-review-count listings, and currently trending searches. Prioritize products with proven demand: digital downloads, personalized items, handmade goods, printables, and niche SVG/craft files that consistently rank in Etsy search.

FORMAT — output exactly 15 lines, one per product:
PRODUCT NAME: why it sells on Etsy · price range · product type (digital/physical/printable)

Rules:
- PRODUCT NAME is 2-6 words, title case
- After the colon: lead with the strongest selling reason (max 10 words), then · price range (e.g. $5–$25), then · type
- Prioritize products with 500+ realistic review potential, strong gift or impulse-buy appeal, and low barrier to entry
- Mix digital downloads and physical/handmade where relevant to the niche
- No bullets, no numbering, no markdown, no preamble or closing remarks
- Output only the 15 lines, nothing else`,
            messages: [{ role: 'user', content: `Campaign keywords: ${keywords}` }]
          })
        });
        const claudeData = await claudeResp.json();
        if (!claudeResp.ok) return json({ error: claudeData.error?.message || 'Claude error' }, 502);
        const result = (claudeData.content?.[0]?.text || '').trim();

        const patch = await fetch(`https://api.notion.com/v1/pages/${dashId(researchId)}`, {
          method: 'PATCH',
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Etsy Products": { rich_text: [{ type: "text", text: { content: result.slice(0, 2000) } }] } } })
        });
        if (!patch.ok) {
          const pe = await patch.json();
          return json({ error: pe.message || "Notion write failed" }, patch.status);
        }
        return json({ success: true, text: result });
      }

      // ── getYouTubeOutliers ──
      if (body.action === "getYouTubeOutliers") {
        if (!await verifyToken(body.token, HMAC_SECRET)) return json({ error: "Unauthorized" }, 401);
        const { researchId, kwOverride } = body;
        if (!researchId) return json({ error: "researchId required" }, 400);

        const dashId = i => { const s=i.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };

        const YT_KEY = (env.YOUTUBE_API_KEY || "").trim();
        if (!YT_KEY) return json({ error: "YOUTUBE_API_KEY secret not set on worker" }, 500);

        let keywords = (kwOverride || "").trim();
        if (!keywords) {
          try {
            const resResp = await fetch(`https://api.notion.com/v1/pages/${dashId(researchId)}`, {
              headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }
            });
            const resData = await resResp.json();
            keywords = resData.properties?.Keywords?.rich_text?.map(t => t.plain_text).join("") || "";
          } catch {}
        }
        if (!keywords) return json({ error: "No keywords found — add keywords or enter them manually" }, 400);

        const searchTerm = keywords.split(/[,\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 3).join(" ");

        // 1. Search YouTube
        const searchResp = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=id,snippet&type=video&q=${encodeURIComponent(searchTerm)}&maxResults=50&key=${YT_KEY}`
        );
        if (!searchResp.ok) {
          const se = await searchResp.json();
          return json({ error: `YouTube search error: ${se.error?.message || searchResp.status}` }, 502);
        }
        const searchData = await searchResp.json();
        const items = searchData.items || [];
        if (!items.length) return json({ error: "No YouTube results found — try different keywords" }, 404);

        const videoIds    = items.map(i => i.id?.videoId).filter(Boolean);
        const channelIds  = [...new Set(items.map(i => i.snippet?.channelId).filter(Boolean))];
        const snippetMap  = {};
        items.forEach(i => { if (i.id?.videoId) snippetMap[i.id.videoId] = i.snippet; });

        // 2. Fetch video stats (batch)
        const vidResp = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds.join(",")}&key=${YT_KEY}`
        );
        const vidData = await vidResp.json();
        const vidStats = {};
        (vidData.items || []).forEach(v => { vidStats[v.id] = v.statistics; });

        // 3. Fetch channel stats (batch)
        const chanResp = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelIds.join(",")}&key=${YT_KEY}`
        );
        const chanData = await chanResp.json();
        const chanStats = {};
        (chanData.items || []).forEach(c => { chanStats[c.id] = c.statistics; });

        // 4. Apply outlier filter: 100K+ views, <100K subs, 5:1+ ratio
        const MIN_VIEWS = 100_000, MAX_SUBS = 100_000, MIN_RATIO = 5.0;
        const outliers = [];
        for (const vid of videoIds) {
          const vs  = vidStats[vid] || {};
          const cid = snippetMap[vid]?.channelId;
          const cs  = chanStats[cid] || {};
          if (cs.hiddenSubscriberCount) continue;
          const views = parseInt(vs.viewCount || 0);
          const subs  = parseInt(cs.subscriberCount || 0);
          if (views < MIN_VIEWS || subs === 0 || subs >= MAX_SUBS) continue;
          const ratio = views / subs;
          if (ratio < MIN_RATIO) continue;
          outliers.push({
            title:   snippetMap[vid]?.title || vid,
            channel: snippetMap[vid]?.channelTitle || cid,
            views, subs, ratio: Math.round(ratio * 10) / 10,
            url: `https://youtube.com/watch?v=${vid}`,
          });
        }
        outliers.sort((a, b) => b.ratio - a.ratio);

        if (!outliers.length) return json({ error: "No outliers found — try different keywords or loosen thresholds" }, 404);

        // 5. Format via Claude
        const raw = outliers.slice(0, 15).map(v =>
          `"${v.title}" | ${v.channel} (${v.subs.toLocaleString()} subs) | ${v.views.toLocaleString()} views | ${v.ratio}x ratio | ${v.url}`
        ).join("\n");

        const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-haiku-4-5",
            max_tokens: 1000,
            system: `You are a YouTube content strategist. Format these outlier videos (small channel, outsized views) into a clean scannable list.

FORMAT — one line per video:
VIDEO TITLE (max 6 words): channel · Xk views · Xx ratio — one insight about WHY this overperformed

Rules:
- Title truncated to 6 words max with … if needed
- After the colon: channel name · view count (use k/M) · ratio (e.g. 12x) then em dash then max-10-word insight on the winning angle
- No bullets, no numbering, no markdown, no preamble
- Output only the formatted lines, nothing else`,
            messages: [{ role: "user", content: `YouTube outlier videos for "${searchTerm}":\n\n${raw}` }]
          })
        });
        const claudeData = await claudeResp.json();
        if (!claudeResp.ok) return json({ error: claudeData.error?.message || "Claude error" }, 502);
        const result = (claudeData.content?.[0]?.text || "").trim();

        // 6. Save to Notion (best-effort — don't block on failure)
        await fetch(`https://api.notion.com/v1/pages/${dashId(researchId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "YouTube Outliers": { rich_text: [{ type: "text", text: { content: result.slice(0, 2000) } }] } } })
        }).catch(() => {});
        return json({ success: true, text: result });
      }

      // Î"Ã¶Ã‡Î"Ã¶Ã‡ CAMPAIGN ADMIN: updateCampaignKeywords Î"Ã¶Ã‡Î"Ã¶Ã‡
      if (body.action === "regenerateKeywords") {
        const { campaignId, researchId, currentKeywords } = body;
        const pageId = researchId || campaignId;
        if (!pageId) return json({ error: "researchId required" }, 400);
        const prompt = `You are a keyword research specialist. Given these existing campaign keywords: "${currentKeywords || 'none provided'}"

Research and generate an expanded, optimized list of 15-20 highly relevant keywords for this campaign niche. Include long-tail variations, related search terms, problem-aware and solution-aware terms, and high-intent buyer keywords.

Return ONLY a comma-separated list of keywords, nothing else. No numbering, no explanations, no line breaks. Just: keyword1, keyword2, keyword3`;
        const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 400, messages: [{ role: "user", content: prompt }] })
        });
        const aiData = await aiResp.json();
        const keywords = (aiData.content?.[0]?.text || '').trim().replace(/\n/g, ', ');
        const dashed = pageId.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
        await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { Keywords: { rich_text: [{ type: "text", text: { content: keywords } }] } } })
        });
        return json({ keywords });
      }

      if (body.action === "updateCampaignKeywords") {
        const { campaignId, researchId, value } = body;
        const pageId = researchId || campaignId;
        if (!pageId) return json({ error: "researchId required" }, 400);
        const dashed = pageId.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { Keywords: { rich_text: [{ type: "text", text: { content: value || "" } }] } } })
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      // ── getTodayCampaigns ──
      if (body.action === "getTodayCampaigns") {
        const { day } = body;
        if (!day) return json({ error: "day required" }, 400);
        const rows = await notionQuery(CAMPAIGNS_DB, {
          filter: { and: [
            { property: "Schedule Day", select: { equals: day } },
            { property: "Status", select: { does_not_equal: "Delete" } },
          ]},
          sorts: [{ property: "Name", direction: "ascending" }],
        });
        const campaigns = rows.map(r => ({
          id: r.id.replace(/-/g, ""),
          name: r.properties?.Name?.title?.map(t => t.plain_text).join("") || "",
          status: r.properties?.Status?.select?.name || "",
        }));
        return json({ campaigns });
      }

      // ── addToPodcast ──
      if (body.action === "addToPodcast") {
        const { text, campaignName } = body;
        if (!text) return json({ error: "text required" }, 400);
        const title = `[PODCAST · ${campaignName || "Unknown"}] ${text}`;
        const createResp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ parent: { database_id: MAIN_TD_DB }, properties: { Title: { title: [{ type: "text", text: { content: title } }] } } }),
        });
        const created = await createResp.json();
        if (!createResp.ok) return json({ error: created.message || "Create failed" }, createResp.status);
        return json({ success: true, id: created.id.replace(/-/g,"") });
      }

      // ── getPodcastItems ──
      if (body.action === "getPodcastItems") {
        const rows = await notionQuery(MAIN_TD_DB, {
          filter: { property: "title", title: { starts_with: "[PODCAST" } },
          sorts: [{ timestamp: "created_time", direction: "descending" }],
        });
        const items = rows.map(r => {
          const raw = r.properties?.Title?.title?.map(t => t.plain_text).join("") || "";
          const match = raw.match(/^\[PODCAST · (.+?)\] (.+)$/s);
          return {
            id: r.id.replace(/-/g,""),
            campaignName: match ? match[1] : "Unknown",
            text: match ? match[2] : raw,
            createdTime: r.created_time || "",
          };
        });
        return json({ items });
      }

      // ── distributeScheduleDays ──
      if (body.action === "distributeScheduleDays") {
        const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
        const offset = parseInt(body.offset || 0);
        const batchSize = 40;

        // Fetch all (one query, up to 100)
        let rows = [];
        let cursor;
        do {
          const resp = await fetch(`https://api.notion.com/v1/databases/${CAMPAIGNS_DB}/query`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
            body: JSON.stringify({ filter: { property: "Status", select: { does_not_equal: "Delete" } }, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
          });
          const d = await resp.json();
          rows = rows.concat(d.results || []);
          cursor = d.has_more ? d.next_cursor : null;
        } while (cursor);

        const total = rows.length;
        const batch = rows.slice(offset, offset + batchSize);

        for (const [i, r] of batch.entries()) {
          const day = days[(offset + i) % days.length];
          await fetch(`https://api.notion.com/v1/pages/${r.id}`, {
            method: "PATCH",
            headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
            body: JSON.stringify({ properties: { "Schedule Day": { select: { name: day } } } }),
          });
        }

        const done = offset + batch.length;
        return json({ success: true, total, done, more: done < total });
      }

      // â"€â"€ MICROSITE: getCampaignTodos â"€â"€
            // ── MICROSITE: getMicrositeList ──
      if (body.action === "getMicrositeList") {
        const rows = await notionQuery(CAMPAIGNS_DB, {
          filter: { property: "Status", select: { does_not_equal: "Delete" } },
          sorts: [{ property: "Name", direction: "ascending" }],
        });
        const sites = rows
          .map(c => ({
            name: c.properties?.Name?.title?.map(t => t.plain_text).join("") || "Untitled",
            url:  c.properties?.["microsite"]?.url || null,
          }))
          .filter(s => s.url);
        return json({ sites });
      }

            // ── MICROSITE: getAllSiteTodos ──
      if (body.action === "getAllSiteTodos") {
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };

        // Use Status filter — same as getCampaigns(), which is proven to work
        const campRows = await notionQuery(CAMPAIGNS_DB, {
          filter: { property: "Status", select: { does_not_equal: "Delete" } },
          sorts: [{ property: "Name", direction: "ascending" }],
        });

        if (!campRows.length) return json({ todos: [], _debug: "campRows empty" });

        // For each campaign, fetch the page directly (same as getCampaignTodos) to get full relation list
        const campPages = await Promise.all(campRows.map(async c => {
          const campaignName = c.properties?.Name?.title?.map(t => t.plain_text).join("") || "Untitled";
          const campaignId   = c.id.replace(/-/g,"");
          const siteUrl      = c.properties?.["microsite"]?.url || null;
          try {
            const r = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
              headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
            });
            const page = await r.json();
            const todoIds = (page.properties?.["Associated To Do"]?.relation || []).map(r2 => r2.id.replace(/-/g,""));
            return { campaignName, campaignId, siteUrl, todoIds };
          } catch(err) { return { campaignName, campaignId, siteUrl, todoIds: [], _err: String(err) }; }
        }));

        // Flatten — skip campaigns with no todos
        const entries = [];
        campPages.forEach(({ campaignName, campaignId, siteUrl, todoIds }) => {
          todoIds.forEach(todoId => entries.push({ todoId, campaignName, campaignId, siteUrl }));
        });

        if (!entries.length) return json({ todos: [], _debug: { campCount: campPages.length, campNames: campPages.map(c => c.campaignName), todoIdCounts: campPages.map(c => c.todoIds?.length ?? -1), errs: campPages.filter(c=>c._err).map(c=>c._err) } });

        const seen = new Set();
        const unique = entries.filter(e => { if (seen.has(e.todoId)) return false; seen.add(e.todoId); return true; });

        // Fetch each todo — same as getCampaignTodos
        const firstErr = { msg: null };
        const todos = await Promise.all(unique.map(async e => {
          try {
            const url = `https://api.notion.com/v1/pages/${dashId(e.todoId)}`;
            const r = await fetch(url, {
              headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
            });
            if (!r.ok) {
              const body2 = await r.text();
              if (!firstErr.msg) firstErr.msg = `HTTP ${r.status} for ${e.todoId}: ${body2.slice(0,200)}`;
              return null;
            }
            const p = await r.json();
            const name = p.properties?.Title?.title?.map(t => t.plain_text).join("") || "Untitled";
            return { id: e.todoId, name, campaignName: e.campaignName, campaignId: e.campaignId, siteUrl: e.siteUrl };
          } catch(err) {
            if (!firstErr.msg) firstErr.msg = String(err);
            return null;
          }
        }));

        return json({ todos: todos.filter(Boolean), _debug: { campCount: campPages.length, entryCount: entries.length, firstErr: firstErr.msg } });
      }

      if (body.action === "getCampaignTodos") {
        const { campaignId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const campResp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        const campPage = await campResp.json();
        const todoIds = (campPage.properties?.["Associated To Do"]?.relation || []).map(r => r.id.replace(/-/g,""));
        if (!todoIds.length) return json({ todos: [] });
        const todos = await Promise.all(todoIds.map(async id => {
          try {
            const r = await fetch(`https://api.notion.com/v1/pages/${dashId(id)}`, {
              headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
            });
            const p = await r.json();
            const name = p.properties?.Title?.title?.map(t => t.plain_text).join("") || "Untitled";
            return { id, name };
          } catch { return null; }
        }));
        return json({ todos: todos.filter(Boolean) });
      }

      // â"€â"€ MICROSITE: unlinkTodoFromCampaign â"€â"€
      if (body.action === "unlinkTodoFromCampaign") {
        const { campaignId, todoId } = body;
        if (!campaignId || !todoId) return json({ error: "campaignId and todoId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const campResp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        const campPage = await campResp.json();
        const existing = (campPage.properties?.["Associated To Do"]?.relation || []).map(r => ({ id: r.id }));
        const updated = existing.filter(r => r.id.replace(/-/g,"") !== todoId);
        await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Associated To Do": { relation: updated } } }),
        });
        return json({ success: true });
      }

      // â"€â"€ MICROSITE: updateCampaignField â"€â"€
      if (body.action === "updateCampaignField") {
        const { campaignId, field, value } = body;
        if (!campaignId || !field) return json({ error: "campaignId and field required" }, 400);
        const allowed = { keyMessage: "Key Message", painPoints: "Pain Points", campaignGoal: "Campaign Goal" };
        const notionField = allowed[field];
        if (!notionField) return json({ error: "Unknown field: " + field }, 400);
        const dashed = campaignId.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { [notionField]: { rich_text: [{ type: "text", text: { content: value || "" } }] } } })
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      // â"€â"€ MICROSITE: updateTitleStage â"€â"€
      if (body.action === "updateTitleStage") {
        const { titleId, stage } = body;
        if (!titleId || !stage) return json({ error: "titleId and stage required" }, 400);
        const validStages = ["Development","Writing","Review","Approved","Publish","Published","Explode","Done"];
        if (!validStages.includes(stage)) return json({ error: "Invalid stage: " + stage }, 400);
        const dash = id => id.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(titleId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { Status: { select: { name: stage } } } }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      // â"€â"€ MICROSITE: getCampaignLogins â"€â"€
      if (body.action === "getCampaignLogins") {
        const { campaignId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const rows = await notionQuery(LOGINS_DB, {
          filter: { property: "Campaign", relation: { contains: dashId(campaignId) } },
          sorts: [{ property: "Name", direction: "ascending" }],
        });
        const logins = rows.map(l => ({
          id:     l.id.replace(/-/g,""),
          name:   l.properties.Name?.title?.map(t => t.plain_text).join("") || "Untitled",
          status: l.properties.Status?.select?.name || "Planning",
        }));
        return json({ logins });
      }

      // â"€â"€ MICROSITE: createCampaignLogin â"€â"€
      if (body.action === "createCampaignLogin") {
        const { campaignId, name } = body;
        if (!campaignId || !name) return json({ error: "campaignId and name required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({
            parent: { database_id: LOGINS_DB },
            properties: {
              Name:     { title:    [{ type: "text", text: { content: name } }] },
              Status:   { select:   { name: "Planning" } },
              Campaign: { relation: [{ id: dashId(campaignId) }] },
            }
          }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
        return json({ success: true, id: result.id.replace(/-/g,""), name, status: "Planning" });
      }

      // â"€â"€ MICROSITE: updateLoginStatus â"€â"€
      if (body.action === "updateLoginStatus") {
        const { loginId, status } = body;
        if (!loginId || !status) return json({ error: "loginId and status required" }, 400);
        const valid = ["Planning", "Launched"];
        if (!valid.includes(status)) return json({ error: "Invalid status: " + status }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashId(loginId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { Status: { select: { name: status } } } }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      // â"€â"€ PUBLIC SITE: getPublishedPosts â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
      // Fetches Publish/Published titles for a campaign, then reads each page's
      // block children to extract a real excerpt for blog cards.
      // Used by: dash/web/mobility-mentor-*/index.html
      if (body.action === "getPublishedPosts") {
        const { campaignId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);

        const dash = id =>
          id.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");

        // Query Content Strategy DB for Publish/Published titles linked to this campaign
        const titleRows = await notionQuery(CONTENT_STRATEGY_DB, {
          filter: {
            and: [
              { or: [
                { property: "Status", select: { equals: "Publish" } },
                { property: "Status", select: { equals: "Published" } },
              ]},
              { property: "Campaign", relation: { contains: dash(campaignId) } },
            ]
          },
          sorts: [{ property: "Sequence Order", direction: "ascending" }],
        });

        // For each title, fetch first 10 blocks to extract paragraph text as excerpt
        const posts = await Promise.all(titleRows.map(async page => {
          const id        = page.id.replace(/-/g, "");
          const props     = page.properties;
          const title     = props.Title?.title?.map(t => t.plain_text).join("") || "Untitled";
          const stage     = props.Status?.select?.name || "";
          const cohort    = props.Grouping?.rich_text?.map(t => t.plain_text).join("") || "";
          const scheduled = props["Scheduled Date"]?.date?.start || "";

          let excerpt = "";
          try {
            const blockResp = await fetch(
              `https://api.notion.com/v1/blocks/${dash(id)}/children?page_size=10`,
              { headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION } }
            );
            const blockData = await blockResp.json();
            const textParts = [];
            for (const block of (blockData.results || [])) {
              let richText = [];
              if      (block.type === "paragraph")            richText = block.paragraph?.rich_text || [];
              else if (block.type === "heading_1")            richText = block.heading_1?.rich_text || [];
              else if (block.type === "heading_2")            richText = block.heading_2?.rich_text || [];
              else if (block.type === "heading_3")            richText = block.heading_3?.rich_text || [];
              else if (block.type === "bulleted_list_item")   richText = block.bulleted_list_item?.rich_text || [];
              else if (block.type === "numbered_list_item")   richText = block.numbered_list_item?.rich_text || [];
              else if (block.type === "quote")                richText = block.quote?.rich_text || [];
              const text = richText.map(r => r.plain_text).join("").trim();
              if (text) textParts.push(text);
              if (textParts.join(" ").length > 300) break;
            }
            excerpt = textParts.join(" ").slice(0, 280).trim();
            if (textParts.join(" ").length > 280) excerpt += "â€¦";
          } catch {
            // excerpt stays empty  -  front-end shows fallback text
          }

          return { id, title, stage, cohort, scheduled, excerpt };
        }));

        return json({ posts });
      }

      // â"€â"€ getLogins  -  full login records with campaignIds and platformIds â"€â"€
      if (body.action === "getLogins") {
        const dash = id => id.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
        const rows = await notionQuery(LOGINS_DB, { sorts: [{ property: "Name", direction: "ascending" }] });
        const logins = rows.map(l => {
          const p = l.properties;
          return {
            id:          l.id.replace(/-/g,""),
            name:        p.Name?.title?.map(t=>t.plain_text).join("") || "Untitled",
            status:      p.Status?.select?.name || "",
            category:    p.Category?.select?.name || "",
            usr:         p.Usr?.rich_text?.map(t=>t.plain_text).join("") || "",
            accountUrl:  p["Account URL"]?.url || "",
            headline:    p.Headline?.rich_text?.map(t=>t.plain_text).join("") || "",
            bio:         p.Bio?.rich_text?.map(t=>t.plain_text).join("") || "",
            campaignIds: (p.Campaign?.relation || []).map(r=>r.id.replace(/-/g,"")),
            platformIds: (p.Platform?.relation || []).map(r=>r.id.replace(/-/g,"")),
            smAccountIds: (p["SM Account"]?.relation || []).map(r=>r.id.replace(/-/g,"")),
            smAccountId:  p["SM Account ID"]?.rich_text?.map(t=>t.plain_text).join("") || "",
            loginType:   (p.type?.multi_select || []).map(s=>s.name),
          };
        });
        return json({ logins });
      }

      // â"€â"€ createLoginFull  -  create login linked to campaign + platform â"€â"€
      if (body.action === "linkLoginToDrive") {
        const { driveId, loginId } = body;
        if (!driveId || !loginId) return json({ error: "driveId and loginId required" }, 400);
        const dash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const cur = await fetch(`https://api.notion.com/v1/pages/${dash(driveId)}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        const curData = await cur.json();
        const existing = (curData.properties?.["Listing"]?.relation || []).map(r => ({ id: r.id }));
        existing.push({ id: dash(loginId) });
        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(driveId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { Listing: { relation: existing } } }),
        });
        if (!resp.ok) { const e = await resp.json(); return json({ error: e.message || "Failed" }, resp.status); }
        return json({ success: true });
      }

      if (body.action === "unlinkLoginFromDrive") {
        const { driveId, loginId } = body;
        if (!driveId || !loginId) return json({ error: "driveId and loginId required" }, 400);
        const dash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const cur = await fetch(`https://api.notion.com/v1/pages/${dash(driveId)}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        const curData = await cur.json();
        const remaining = (curData.properties?.["Listing"]?.relation || [])
          .filter(r => r.id.replace(/-/g,"") !== loginId)
          .map(r => ({ id: r.id }));
        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(driveId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { Listing: { relation: remaining } } }),
        });
        if (!resp.ok) { const e = await resp.json(); return json({ error: e.message || "Failed" }, resp.status); }
        return json({ success: true });
      }

      if (body.action === "createLoginFull") {
        const { name, campaignId, platformId, category, status, usr, accountUrl, smAccountIds, smAccountId } = body;
        if (!name) return json({ error: "name required" }, 400);
        const dash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const props = {
          Name:   { title: [{ type: "text", text: { content: name } }] },
          Status: { select: { name: status || "Planning" } },
        };
        if (category)    props.Category          = { select: { name: category } };
        if (usr)         props.Usr               = { rich_text: [{ type:"text", text:{ content: usr } }] };
        if (accountUrl)  props["Account URL"]    = { url: accountUrl };
        if (campaignId)  props.Campaign          = { relation: [{ id: dash(campaignId) }] };
        if (platformId)  props.Platform          = { relation: [{ id: dash(platformId) }] };
        if (smAccountIds && smAccountIds.length) props["SM Account"] = { relation: smAccountIds.map(id => ({ id: dash(id) })) };
        if (smAccountId) props["SM Account ID"]  = { rich_text: [{ type:"text", text:{ content: smAccountId } }] };

        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ parent: { database_id: LOGINS_DB }, properties: props }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
        const newId = result.id.replace(/-/g,"");
        return json({ success: true, login: {
          id: newId, name, status: status||"Planning", category: category||"",
          usr: usr||"", accountUrl: accountUrl||"", headline:"", bio:"",
          campaignIds:  campaignId ? [campaignId] : [],
          platformIds:  platformId ? [platformId] : [],
          smAccountIds: smAccountIds || [],
          smAccountId:  smAccountId || "",
          loginType: [],
        }});
      }

      // â"€â"€ updateLoginFull  -  update login fields â"€â"€
      // -- updateAssetStatus --
      if (body.action === "updateAssetStatus") {
        const { assetId, status } = body;
        if (!assetId || !status) return json({ error: "assetId and status required" }, 400);
        const dId = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+"-"+s.slice(8,12)+"-"+s.slice(12,16)+"-"+s.slice(16,20)+"-"+s.slice(20); };
        const pUrl = "https://api.notion.com/v1/pages/" + dId(assetId);
        const ar = await fetch(pUrl, { method: "PATCH", headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" }, body: JSON.stringify({ properties: { "Asset Status": { select: { name: status } } } }) });
        if (!ar.ok) { const e = await ar.json(); return json({ error: e.message || "Failed" }, ar.status); }
        return json({ success: true });
      }

      if (body.action === "updateLoginFull") {
        const { loginId, name, category, status, usr, accountUrl, headline, bio, platformId, smAccountIds, smAccountId } = body;
        if (!loginId) return json({ error: "loginId required" }, 400);
        const dash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const props = {};
        if (name)       props.Name        = { title: [{ type:"text", text:{ content: name } }] };
        if (status)     props.Status      = { select: { name: status } };
        if (category !== undefined) props.Category = category ? { select: { name: category } } : { select: null };
        if (usr !== undefined)      props.Usr      = { rich_text: usr ? [{ type:"text", text:{ content: usr } }] : [] };
        if (accountUrl !== undefined) props["Account URL"] = accountUrl ? { url: accountUrl } : { url: null };
        if (headline !== undefined) props.Headline = { rich_text: headline ? [{ type:"text", text:{ content: headline } }] : [] };
        if (bio !== undefined)      props.Bio      = { rich_text: bio ? [{ type:"text", text:{ content: bio } }] : [] };
        if (platformId !== undefined) props.Platform = platformId ? { relation: [{ id: dash(platformId) }] } : { relation: [] };
        if (smAccountIds !== undefined) props["SM Account"] = { relation: (smAccountIds || []).map(id => ({ id: dash(id) })) };
        if (smAccountId  !== undefined) props["SM Account ID"] = { rich_text: smAccountId ? [{ type:"text", text:{ content: smAccountId } }] : [] };

        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(loginId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: props }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      // â"€â"€ deleteLogin  -  archive login record â"€â"€
      if (body.action === "deleteLogin") {
        const { loginId } = body;
        if (!loginId) return json({ error: "loginId required" }, 400);
        const dash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(loginId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
        });
        if (!resp.ok) { const r = await resp.json(); return json({ error: r.message || "Delete failed" }, resp.status); }
        return json({ success: true });
      }

      // â"€â"€ linkLoginToCell  -  append campaign + platform to existing login â"€â"€
      if (body.action === "linkLoginToCell") {
        const { loginId, campaignId, platformId } = body;
        if (!loginId) return json({ error: "loginId required" }, 400);
        const dash   = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const nodash = id => id.replace(/-/g,"");
        const pageResp = await fetch(`https://api.notion.com/v1/pages/${dash(loginId)}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        const page = await pageResp.json();
        if (!pageResp.ok) return json({ error: page.message || "Fetch failed" }, pageResp.status);
        const props   = page.properties || {};
        const campIds = new Set((props.Campaign?.relation || []).map(r => nodash(r.id)));
        const platIds = new Set((props.Platform?.relation  || []).map(r => nodash(r.id)));
        if (campaignId) campIds.add(nodash(campaignId));
        if (platformId) platIds.add(nodash(platformId));
        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(loginId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: {
            Campaign: { relation: [...campIds].map(id => ({ id: dash(id) })) },
            Platform: { relation: [...platIds].map(id => ({ id: dash(id) })) },
          }}),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Link failed" }, resp.status);
        return json({ success: true });
      }

      // â"€â"€ unlinkLoginFromCell  -  remove a campaign from an existing login â"€â"€
      if (body.action === "unlinkLoginFromCell") {
        const { loginId, campaignId } = body;
        if (!loginId || !campaignId) return json({ error: "loginId and campaignId required" }, 400);
        const dash   = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const nodash = id => id.replace(/-/g,"");
        const pageResp = await fetch(`https://api.notion.com/v1/pages/${dash(loginId)}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        const page = await pageResp.json();
        if (!pageResp.ok) return json({ error: page.message || "Fetch failed" }, pageResp.status);
        const campIds = (page.properties?.Campaign?.relation || [])
          .map(r => nodash(r.id))
          .filter(id => id !== nodash(campaignId));
        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(loginId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: {
            Campaign: { relation: campIds.map(id => ({ id: dash(id) })) },
          }}),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Unlink failed" }, resp.status);
        return json({ success: true });
      }

      // â"€â"€ updatePlatformStatus  -  set platform Status field â"€â"€
      if (body.action === "updatePlatformStatus") {
        const { platformId, status } = body;
        if (!platformId || !status) return json({ error: "platformId and status required" }, 400);
        const dash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(platformId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { Status: { select: { name: status } } } }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      // â"€â"€ getEmails  -  fetch all Email records â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
      if (body.action === "getEmails") {
        const rows = await notionQuery(EMAILS_DB, { sorts: [{ property: "Email", direction: "ascending" }] });
        const emails = rows.map(r => {
          const p = r.properties;
          const txt = prop => prop?.rich_text?.map(t=>t.plain_text).join("") || prop?.title?.map(t=>t.plain_text).join("") || "";
          return {
            id:     r.id.replace(/-/g,""),
            name:   txt(p.Email),
            domain: txt(p.Domain),
          };
        });
        return json({ emails });
      }

      if (body.action === "createEmail") {
        const { email } = body;
        if (!email) return json({ error: "email required" }, 400);
        const domain = email.includes('@') ? email.split('@')[1] : '';
        const rt = v => v ? [{ type:"text", text:{ content: v } }] : [];
        const props = {
          Email:  { title: [{ type:"text", text:{ content: email } }] },
          Domain: { rich_text: rt(domain) },
        };
        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ parent: { database_id: EMAILS_DB }, properties: props }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
        return json({ success: true, email: { id: result.id.replace(/-/g,""), name: email, domain } });
      }

      if (body.action === "deleteEmail") {
        const { id } = body;
        if (!id) return json({ error: "id required" }, 400);
        const dash = i => { const s=i.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(id)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Delete failed" }, resp.status);
        return json({ success: true });
      }

      // â"€â"€ getSmAccounts  -  fetch all SM Account records â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
      if (body.action === "getSmAccounts") {
        const rows = await notionQuery(SM_ACCOUNTS_DB, { sorts: [{ property: "Name", direction: "ascending" }] });
        const accounts = rows.map(r => {
          const p = r.properties;
          const txt = prop => prop?.rich_text?.map(t=>t.plain_text).join("") || prop?.title?.map(t=>t.plain_text).join("") || "";
          return {
            id:          r.id.replace(/-/g,""),
            name:        txt(p.Name),
            type:        p.Type?.select?.name || "",
            login:       txt(p.Login),
            loginId:     txt(p["Login ID"]),
            username:    txt(p.Username),
            pw:          txt(p.PW),
            emailIds:    (p.Emai?.relation || []).map(r=>r.id.replace(/-/g,"")),
            platform:    txt(p.Platform),
            platformId:  txt(p["Platform ID"]),
            campaign:    txt(p.Campaign),
            campaignId:  txt(p["Campaign ID"]),
          };
        });
        return json({ accounts });
      }

      // â"€â"€ createSmAccount â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
      if (body.action === "createSmAccount") {
        const { name, type, login, loginId, username, pw, emailId, platform, platformId, campaign, campaignId } = body;
        if (!name) return json({ error: "name required" }, 400);
        const dash = i => { const s=i.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const rt = v => v ? [{ type:"text", text:{ content: v } }] : [];
        const props = {
          Name:          { title: [{ type:"text", text:{ content: name } }] },
          Login:         { rich_text: rt(login) },
          "Login ID":    { rich_text: rt(loginId) },
          Username:      { rich_text: rt(username) },
          PW:            { rich_text: rt(pw) },
          Platform:      { rich_text: rt(platform) },
          "Platform ID": { rich_text: rt(platformId) },
          Campaign:      { rich_text: rt(campaign) },
          "Campaign ID": { rich_text: rt(campaignId) },
        };
        if (type)    props.Type  = { select: { name: type } };
        if (emailId) props.Emai  = { relation: [{ id: dash(emailId) }] };
        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ parent: { database_id: SM_ACCOUNTS_DB }, properties: props }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
        return json({ success: true, account: { id: result.id.replace(/-/g,""), name, type: type||"", login: login||"", loginId: loginId||"", username: username||"", pw: pw||"", emailIds: emailId ? [emailId] : [], platform: platform||"", platformId: platformId||"", campaign: campaign||"", campaignId: campaignId||"" } });
      }

      // â"€â"€ updateSmAccount â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
      if (body.action === "updateSmAccount") {
        const { id, name, type, login, loginId, username, pw, emailId, platform, platformId, campaign, campaignId } = body;
        if (!id) return json({ error: "id required" }, 400);
        const dash = i => { const s=i.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const rt = v => v != null ? [{ type:"text", text:{ content: v } }] : [];
        const props = {};
        if (name       != null) props.Name           = { title: [{ type:"text", text:{ content: name } }] };
        if (type       != null) props.Type           = type ? { select: { name: type } } : { select: null };
        if (login      != null) props.Login          = { rich_text: rt(login) };
        if (loginId    != null) props["Login ID"]    = { rich_text: rt(loginId) };
        if (username   != null) props.Username       = { rich_text: rt(username) };
        if (pw         != null) props.PW             = { rich_text: rt(pw) };
        if (emailId    !== undefined) props.Emai     = emailId ? { relation: [{ id: dash(emailId) }] } : { relation: [] };
        if (platform   != null) props.Platform       = { rich_text: rt(platform) };
        if (platformId != null) props["Platform ID"] = { rich_text: rt(platformId) };
        if (campaign   != null) props.Campaign       = { rich_text: rt(campaign) };
        if (campaignId != null) props["Campaign ID"] = { rich_text: rt(campaignId) };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(id)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: props }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      // â"€â"€ deleteSmAccount  -  trash an SM Account record â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
      if (body.action === "deleteSmAccount") {
        const { id } = body;
        if (!id) return json({ error: "id required" }, 400);
        const dash = i => { const s=i.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(id)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Delete failed" }, resp.status);
        return json({ success: true });
      }

      // â"€â"€ SM POSTS: getSmPosts â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
      if (body.action === "getSmPosts") {
        const { campaignId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dash = id => id.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
        const rows = await notionQuery(SM_POSTS_DB, {
          filter: { property: "Campaign", relation: { contains: dash(campaignId) } },
          sorts:  [{ property: "Status", direction: "ascending" }],
        });
        const posts = rows.map(r => {
          const p = r.properties;
          return {
            id:        r.id.replace(/-/g,""),
            title:     p["Post Title"]?.title?.map(t=>t.plain_text).join("") || "Untitled",
            copy:      p["Post Copy"]?.rich_text?.map(t=>t.plain_text).join("") || "",
            script:       p["Script"]?.rich_text?.map(t=>t.plain_text).join("") || "",
            localPath:    p["Local Path"]?.rich_text?.map(t=>t.plain_text).join("") || "",
            topVideos:    p["Top Videos"]?.rich_text?.map(t=>t.plain_text).join("") || "",
            voiceId:         p["Voice ID"]?.rich_text?.map(t=>t.plain_text).join("") || "",
            captionStyle:    stripMcpEscaping(p["Caption Style"]?.rich_text?.map(t=>t.plain_text).join("") || ""),
            backgroundImage: p["Background Image"]?.rich_text?.map(t=>t.plain_text).join("") || "",
            voiceSettings:   stripMcpEscaping(p["Voice Settings"]?.rich_text?.map(t=>t.plain_text).join("") || ""),
            imageStyleDna:   stripMcpEscaping(p["Image Style DNA"]?.rich_text?.map(t=>t.plain_text).join("") || ""),
            status:    p["Status"]?.select?.name || "Draft",
            platforms: (p["Platform"]?.multi_select || []).map(s => s.name),
          };
        });
        return json({ posts });
      }

      // â"€â"€ SM POSTS: getSmPost (single post by ID) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
      if (body.action === "getSmPost") {
        const { id } = body;
        if (!id) return json({ error: "id required" }, 400);
        const dash = i => i.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(id)}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }
        });
        const data = await resp.json();
        if (!resp.ok) return json({ error: data.message || "Not found" }, resp.status);
        const p = data.properties || {};
        return json({
          id:              data.id.replace(/-/g,""),
          title:           p["Post Title"]?.title?.map(t=>t.plain_text).join("") || "",
          script:          p["Script"]?.rich_text?.map(t=>t.plain_text).join("") || "",
          voiceId:         p["Voice ID"]?.rich_text?.map(t=>t.plain_text).join("") || "",
          captionStyle:    stripMcpEscaping(p["Caption Style"]?.rich_text?.map(t=>t.plain_text).join("") || ""),
          backgroundImage: p["Background Image"]?.rich_text?.map(t=>t.plain_text).join("") || "",
          voiceSettings:   stripMcpEscaping(p["Voice Settings"]?.rich_text?.map(t=>t.plain_text).join("") || ""),
          imageStyleDna:   stripMcpEscaping(p["Image Style DNA"]?.rich_text?.map(t=>t.plain_text).join("") || ""),
          localPath:       p["Local Path"]?.rich_text?.map(t=>t.plain_text).join("") || "",
        });
      }

      // â"€â"€ SM POSTS: approveSmPost â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
      if (body.action === "approveSmPost") {
        const { id, campaignId } = body;
        if (!id) return json({ error: "id required" }, 400);
        const dash = i => i.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");

        // 1  -  Fetch the SM Post (title + copy + platform)
        const postRes = await fetch(`https://api.notion.com/v1/pages/${dash(id)}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }
        });
        const postData = await postRes.json();
        const pp = postData.properties || {};
        const postTitle    = pp["Post Title"]?.title?.map(t=>t.plain_text).join("") || "Untitled";
        const postCopy     = pp["Post Copy"]?.rich_text?.map(t=>t.plain_text).join("") || "";
        const postPlatform = (pp["Platform"]?.multi_select || []).map(s=>s.name).join(", ") || "TikTok";

        // 1b  -  Extract voice delivery guide from Voice Settings JSON (masterVoicePrompt key)
        let voiceGuide = "";
        try {
          const vsRaw = stripMcpEscaping(pp["Voice Settings"]?.rich_text?.map(t=>t.plain_text).join("") || "");
          if (vsRaw) {
            const vs = JSON.parse(vsRaw);
            if (vs.masterVoicePrompt) voiceGuide = vs.masterVoicePrompt;
          }
        } catch(e) { /* non-fatal  -  proceed without voice guide */ }

        // 2  -  Fetch Research record for campaign context (TikTok Trends, keywords, key message)
        let researchContext = "";
        if (campaignId) {
          try {
            const resRows = await notionQuery(RESEARCH_DB, {
              filter: { property: "Campaign", relation: { contains: dash(campaignId) } }
            });
            if (resRows.length) {
              const rp = resRows[0].properties;
              const tiktokTrends = rp["TikTok Trends"]?.rich_text?.map(t=>t.plain_text).join("") || "";
              const keywords     = rp["Keywords"]?.rich_text?.map(t=>t.plain_text).join("") || "";
              const keyMessage   = rp["Key Message"]?.rich_text?.map(t=>t.plain_text).join("") || "";
              researchContext = [
                tiktokTrends ? `TRENDING RESEARCH:\n${tiktokTrends.slice(0, 1200)}` : "",
                keywords     ? `CAMPAIGN KEYWORDS: ${keywords}` : "",
                keyMessage   ? `KEY MESSAGE: ${keyMessage}` : "",
              ].filter(Boolean).join("\n\n");
            }
          } catch(e) { /* proceed without research context */ }
        }

        // 3  -  Generate full short-form script via Claude
        let script = "";
        try {
          const scriptPrompt = `You are a short-form video scriptwriter for TikTok and YouTube Shorts.

Write a 30-45 second voiceover script for this post:

TITLE: ${postTitle}
CONCEPT: ${postCopy}
PLATFORM: ${postPlatform}
${researchContext ? "\n" + researchContext : ""}
${voiceGuide ? "\nNARRATOR VOICE GUIDE (write to match this delivery style):\n" + voiceGuide : ""}

Rules:
- Hook in the first 2-3 seconds  -  grab attention immediately
- Write pure spoken voiceover text only  -  no brackets, no stage directions, no labels
- Target 75-100 words (30-45 seconds at ~2.3 words/second)
- End with a thought, question, or statement that lingers
${voiceGuide ? "- Honour the narrator voice guide above  -  pace, tone, register, and sentence length should match that delivery style" : "- Conversational rhythm, short sentences, natural pauses implied by punctuation"}

Output the script text only. No preamble, no labels.`;

          const cRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': (env.ANTHROPIC_API_KEY || '').trim(), 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 400, messages: [{ role: 'user', content: scriptPrompt }] })
          });
          const cData = await cRes.json();
          script = cData.content?.[0]?.text?.trim() || "";
        } catch(e) { /* non-fatal  -  approve anyway */ }

        // 4  -  Update SM Post: Status=Publish + Script (if generated)
        const updateProps = { "Status": { select: { name: "Publish" } } };
        if (script) updateProps["Script"] = { rich_text: [{ type: "text", text: { content: script.slice(0, 2000) } }] };

        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(id)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: updateProps }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true, scriptGenerated: !!script });
      }

      // â"€â"€ SM POSTS: updateSmPostSettings â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
      if (body.action === "updateSmPostSettings") {
        const { id, voiceId, captionStyle, backgroundImage, voiceSettings } = body;
        if (!id) return json({ error: "id required" }, 400);
        const dash = i => i.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
        const props = {};
        if (voiceId !== undefined)        props["Voice ID"]        = { rich_text: [{ type: "text", text: { content: (voiceId || "").slice(0, 200) } }] };
        if (captionStyle !== undefined)   props["Caption Style"]   = { rich_text: [{ type: "text", text: { content: (captionStyle || "").slice(0, 2000) } }] };
        if (backgroundImage !== undefined)props["Background Image"]= { rich_text: [{ type: "text", text: { content: (backgroundImage || "").slice(0, 500) } }] };
        if (voiceSettings !== undefined)  props["Voice Settings"]  = { rich_text: [{ type: "text", text: { content: (voiceSettings || "").slice(0, 2000) } }] };
        if (body.imageStyleDna !== undefined) props["Image Style DNA"] = { rich_text: [{ type: "text", text: { content: (body.imageStyleDna || "").slice(0, 2000) } }] };
        if (body.script !== undefined)    props["Script"]          = { rich_text: [{ type: "text", text: { content: (body.script || "").slice(0, 2000) } }] };
        if (!Object.keys(props).length) return json({ success: true });
        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(id)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: props }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      // â"€â"€ SM POSTS: updateSmPostScript â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
      if (body.action === "updateSmPostScript") {
        const { id, script } = body;
        if (!id) return json({ error: "id required" }, 400);
        const dash = i => i.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(id)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Script": { rich_text: [{ type: "text", text: { content: (script || "").slice(0, 2000) } }] } } }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      // â"€â"€ SM POSTS: updateSmPostVideoPath â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
      if (body.action === "updateSmPostVideoPath") {
        const { id, localPath } = body;
        if (!id) return json({ error: "id required" }, 400);
        const dash = i => i.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(id)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Local Path": { rich_text: [{ type: "text", text: { content: (localPath || "").slice(0, 2000) } }] } } }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      // â"€â"€ SM POSTS: deleteSmPost â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
      if (body.action === "deleteSmPost") {
        const { id } = body;
        if (!id) return json({ error: "id required" }, 400);
        const dash = i => i.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(id)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Delete failed" }, resp.status);
        return json({ success: true });
      }

      // â"€â"€ SM POSTS: runSmResearch â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
      // 1. Scrape TikTok via Apify free-tiktok-scraper (searchQueries)
      // 2. Scrape YouTube via Apify api-ninja/youtube-search-scraper (query + type:video)
      // 3. Pass results to Claude Haiku â†' generate 5 script ideas
      // 4. Create SM Post records in Notion with Status=Draft + Campaign relation
      if (body.action === "runSmResearch") {
        const { campaignId, keywords } = body;
        if (!campaignId || !keywords) return json({ error: "campaignId and keywords required" }, 400);
        const dash = id => id.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
        const AT = (env.APIFY_TOKEN || '').trim();
        const kws = Array.isArray(keywords)
          ? keywords.filter(Boolean)
          : keywords.split(',').map(s => s.trim()).filter(Boolean);

        // 1  -  TikTok scrape
        let tiktokItems = [];
        if (AT) {
          try {
            const res = await fetch(
              `https://api.apify.com/v2/acts/clockworks~free-tiktok-scraper/run-sync-get-dataset-items?token=${AT}&timeout=45`,
              { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ searchQueries: kws.slice(0, 3), maxResults: 6 }) }
            );
            if (res.ok) tiktokItems = await res.json();
          } catch(e) { /* proceed without TikTok data */ }
        }

        // 2  -  YouTube scrape (one combined query)
        let ytItems = [];
        if (AT) {
          try {
            const res = await fetch(
              `https://api.apify.com/v2/acts/api-ninja~youtube-search-scraper/run-sync-get-dataset-items?token=${AT}&timeout=45`,
              { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: kws.slice(0, 3).join(' '), type: 'video', maxResults: 8, sortBy: 'viewCount' }) }
            );
            if (res.ok) ytItems = await res.json();
          } catch(e) { /* proceed without YouTube data */ }
        }

        // 3  -  Format scraped data
        // Indexed version (with URLs) sent to Claude so it can pick TopVideos per idea
        const tiktokData = Array.isArray(tiktokItems) ? tiktokItems.slice(0, 12) : [];
        const ytData     = Array.isArray(ytItems)     ? ytItems.slice(0, 10)     : [];

        const fmtTT = tiktokData.map((v, i) => {
          const url   = v.webVideoUrl || v.url || '';
          const title = (v.text || v.desc || v.title || '').slice(0, 70);
          const views = v.playCount || v.stats?.playCount || 0;
          return `[T${i+1}] "${title}" | views:${views}${url ? ' | ' + url : ''}`;
        }).join('\n') || '(no TikTok data  -  proceed from keywords only)';

        const fmtYT = ytData.map((v, i) => {
          const url   = v.url || v.videoUrl || (v.id ? `https://youtube.com/watch?v=${v.id}` : '');
          const title = (v.title || '').slice(0, 70);
          const views = v.viewCount || 0;
          return `[Y${i+1}] "${title}" | views:${views}${url ? ' | ' + url : ''}`;
        }).join('\n') || '(no YouTube data  -  proceed from keywords only)';

        // 3.5  -  Write compact summary (no URLs) to Research TikTok Trends field
        const fmtTTsummary = tiktokData.map(v =>
          `- "${(v.text || v.desc || v.title || '').slice(0, 80)}" | views: ${v.playCount || v.stats?.playCount || 0}`
        ).join('\n') || '(no TikTok data)';
        const fmtYTsummary = ytData.map(v =>
          `- "${(v.title || '').slice(0, 80)}" | views: ${v.viewCount || 0} | ${v.channelName || v.channelTitle || ''}`
        ).join('\n') || '(no YouTube data)';
        const rawSummary = `KEYWORDS: ${kws.join(', ')}\n\nTIKTOK TRENDING:\n${fmtTTsummary}\n\nYOUTUBE TRENDING:\n${fmtYTsummary}`;
        try {
          const resRows = await notionQuery(RESEARCH_DB, {
            filter: { property: "Campaign", relation: { contains: dash(campaignId) } }
          });
          if (resRows.length) {
            await fetch(`https://api.notion.com/v1/pages/${resRows[0].id}`, {
              method: 'PATCH',
              headers: { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
              body: JSON.stringify({ properties: { "TikTok Trends": { rich_text: [{ type: "text", text: { content: rawSummary.slice(0, 2000) } }] } } })
            });
          }
        } catch(e) { /* non-fatal  -  proceed without writing */ }

        const claudePrompt = `You are a social media content strategist. Based on trending content for the keywords "${kws.join(', ')}", generate exactly 5 short-form script ideas.

TRENDING TIKTOK (indexed  -  copy URLs exactly for TopVideos):
${fmtTT}

TRENDING YOUTUBE (indexed  -  copy URLs exactly for TopVideos):
${fmtYT}

Generate exactly 5 ideas. Use EXACTLY this format with no extra text before IDEA 1:

IDEA 1
Title: [compelling hook, max 10 words]
Platform: [TikTok | YouTube | Both]
Script: [2-3 sentence video outline]
TopVideos: [3 URLs from the lists above that best exemplify this idea's niche, space-separated]

IDEA 2
Title: ...
Platform: ...
Script: ...
TopVideos: ...

(continue through IDEA 5)

RULES: TopVideos must be real URLs copied exactly from the indexed lists. Pick the 3 that best match each specific idea's angle. If fewer than 3 URLs exist, use what is available. If no URLs at all, write "none".`;

        const cRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': (env.ANTHROPIC_API_KEY || '').trim(), 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content: claudePrompt }] })
        });
        const cData = await cRes.json();
        if (!cRes.ok) return json({ error: cData.error?.message || "Claude error" }, cRes.status);
        const ideas = cData.content?.[0]?.text || '';

        // 4  -  Parse + create Notion records
        const blocks = ideas.split(/(?=IDEA\s+\d)/i).filter(b => /IDEA\s+\d/i.test(b));
        const created = [];

        for (const block of blocks.slice(0, 5)) {
          const titleM   = block.match(/Title:\s*(.+)/i);
          const platM    = block.match(/Platform:\s*(.+)/i);
          const topVidM  = block.match(/TopVideos:\s*(.+)/i);
          const scriptM  = block.match(/Script:\s*([\s\S]+?)(?=\nTopVideos:|\n\nIDEA|\s*$)/i);

          const title      = (titleM?.[1] || '').trim() || 'Script Idea';
          const platRaw    = (platM?.[1] || 'TikTok').trim().toLowerCase();
          const script     = (scriptM?.[1] || '').trim() ||
            block.replace(/^IDEA\s+\d+\s*/i,'').replace(/Title:[^\n]+\n?/i,'').replace(/Platform:[^\n]+\n?/i,'').replace(/Script:\s*/i,'').replace(/TopVideos:[^\n]+\n?/i,'').trim();

          // Extract up to 3 real URLs from TopVideos line
          const topVidsRaw = (topVidM?.[1] || '').trim();
          const topVideos  = topVidsRaw === 'none' ? ''
            : topVidsRaw.split(/\s+/).filter(u => u.startsWith('http')).slice(0, 3).join('\n');

          const platforms = [];
          if (platRaw.includes('tiktok') || platRaw.includes('both')) platforms.push({ name: 'TikTok' });
          if (platRaw.includes('youtube') || platRaw.includes('shorts') || platRaw.includes('both')) platforms.push({ name: 'YouTube' });
          if (!platforms.length) platforms.push({ name: 'TikTok' });

          const props = {
            "Post Title": { title:        [{ type: "text", text: { content: title } }] },
            "Status":     { select:       { name: "Draft" } },
            "Platform":   { multi_select: platforms },
            "Campaign":   { relation:     [{ id: dash(campaignId) }] },
            "Post Copy":  { rich_text:    [{ type: "text", text: { content: script.slice(0, 2000) } }] },
          };
          if (topVideos) props["Top Videos"] = { rich_text: [{ type: "text", text: { content: topVideos } }] };

          try {
            const r = await fetch('https://api.notion.com/v1/pages', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
              body: JSON.stringify({ parent: { database_id: dash(SM_POSTS_DB) }, properties: props })
            });
            const page = await r.json();
            if (r.ok) created.push(page.id.replace(/-/g,""));
          } catch(e) { /* skip failed record */ }
        }

        return json({ success: true, count: created.length, ids: created });
      }

      // â"€â"€ TRADES â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

      if (body.action === 'saveTrade') {
        const { ticker, strike, expiry, direction, notes, entry_contract, contract_captured } = body;
        if (!ticker || !strike || !expiry || !direction) {
          return json({ error: 'Missing required trade fields' }, 400);
        }
        const now = new Date().toISOString();
        const ts  = now.replace(/[-:T.Z]/g, '').slice(0, 14);
        const id  = `${ticker.toUpperCase()}_${ts}`;
        const trade = {
          id,
          ticker:              ticker.toUpperCase(),
          strike:              parseFloat(strike),
          expiry,
          direction,
          notes:               notes || '',
          entry_time:          now,
          entry_price:         null,   // underlying at entry  -  filled by poller
          price_captured:      false,
          current_price:       null,
          current_pct:         null,   // % move of underlying since entry
          max_high:            null,
          max_high_time:       null,
          max_low:             null,
          max_low_time:        null,
          strike_reached:         false,
          strike_reached_time:    null,
          last_updated:           null,
          expired:                false,
          entry_contract:         entry_contract ?? null,
          contract_captured:      contract_captured ?? false,
          current_contract:       null,
          contract_pct:           null,
          contract_max_high:      null,
          contract_max_high_time: null,
          contract_max_low:       null,
          contract_max_low_time:  null,
        };
        await env.TRADES.put(`trades:${id}`, JSON.stringify(trade));
        return json({ success: true, id });
      }

      if (body.action === 'getTrades') {
        const list   = await env.TRADES.list({ prefix: 'trades:' });
        const trades = await Promise.all(list.keys.map(k => env.TRADES.get(k.name, 'json')));
        trades.sort((a, b) => new Date(b.entry_time) - new Date(a.entry_time));
        return json({ trades: trades.filter(Boolean) });
      }

      if (body.action === 'updateTrade') {
        const { id, action: _a, token: _t, ...fields } = body;
        if (!id) return json({ error: 'Missing trade id' }, 400);
        const existing = await env.TRADES.get(`trades:${id}`, 'json');
        if (!existing) return json({ error: 'Trade not found' }, 404);
        const updated = { ...existing, ...fields };
        await env.TRADES.put(`trades:${id}`, JSON.stringify(updated));

        // On expiry — archive full record to Notion then remove from KV
        if (fields.expired) {
          const rt = v => ({ rich_text: [{ type: "text", text: { content: String(v ?? "") } }] });
          const name = `${updated.ticker} ${updated.strike}${updated.direction || "C"} ${updated.expiry}`;
          let archiveOk = false;
          let archiveError = null;
          try {
            const notionResp = await fetch("https://api.notion.com/v1/pages", {
              method: "POST",
              headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
              body: JSON.stringify({
                parent: { database_id: TRADES_DB },
                properties: {
                  Name:                  { title: [{ type: "text", text: { content: name } }] },
                  Ticker:                rt(updated.ticker || ""),
                  Strike:                { number: updated.strike ?? null },
                  Expiry:                rt(updated.expiry || ""),
                  Direction:             { select: { name: updated.direction || "C" } },
                  Status:                { select: { name: "Expired" } },
                  "Entry Price":         { number: updated.entry_price ?? null },
                  "Current Price":       { number: updated.current_price ?? null },
                  "Current Pct":         { number: updated.current_pct ?? null },
                  "Max High":            { number: updated.max_high ?? null },
                  "Max High Time":       rt(updated.max_high_time || ""),
                  "Max Low":             { number: updated.max_low ?? null },
                  "Max Low Time":        rt(updated.max_low_time || ""),
                  "Strike Reached":         { checkbox: !!updated.strike_reached },
                  "Strike Reached Time":    rt(updated.strike_reached_time || ""),
                  "Price Captured":         { checkbox: !!updated.price_captured },
                  "Last Updated":           rt(updated.last_updated || ""),
                  "Entry Contract":         { number: updated.entry_contract ?? null },
                  "Current Contract":       { number: updated.current_contract ?? null },
                  "Contract Pct":           { number: updated.contract_pct ?? null },
                  "Contract Max High":      { number: updated.contract_max_high ?? null },
                  "Contract Max High Time": rt(updated.contract_max_high_time || ""),
                  "Contract Max Low":       { number: updated.contract_max_low ?? null },
                  "Contract Max Low Time":  rt(updated.contract_max_low_time || ""),
                }
              }),
            });
            if (notionResp.ok) {
              archiveOk = true;
            } else {
              const errBody = await notionResp.text().catch(() => '');
              archiveError = `Notion ${notionResp.status}: ${errBody.slice(0, 200)}`;
            }
          } catch(e) {
            archiveError = e.message || 'Network error';
          }

          if (archiveOk) {
            // Safe to remove from KV — confirmed in Notion
            await env.TRADES.delete(`trades:${id}`);
          } else {
            // Archive failed — keep in KV, flag it so the UI can warn the user
            await env.TRADES.put(`trades:${id}`, JSON.stringify({
              ...updated,
              archive_failed: true,
              archive_error: archiveError,
              archive_attempted: new Date().toISOString(),
            }));
          }
        }

        return json({ success: true });
      }

      if (body.action === 'retryArchiveTrade') {
        // Re-attempt Notion archive for a trade that previously failed
        const { id } = body;
        if (!id) return json({ error: 'Missing trade id' }, 400);
        const trade = await env.TRADES.get(`trades:${id}`, 'json');
        if (!trade) return json({ error: 'Trade not found' }, 404);
        if (!trade.expired) return json({ error: 'Trade is not marked expired' }, 400);
        // Trigger the same archive path by calling updateTrade logic inline
        const rt = v => ({ rich_text: [{ type: "text", text: { content: String(v ?? "") } }] });
        const name = `${trade.ticker} ${trade.strike}${trade.direction || "C"} ${trade.expiry}`;
        const notionResp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({
            parent: { database_id: TRADES_DB },
            properties: {
              Name:                  { title: [{ type: "text", text: { content: name } }] },
              Ticker:                rt(trade.ticker || ""),
              Strike:                { number: trade.strike ?? null },
              Expiry:                rt(trade.expiry || ""),
              Direction:             { select: { name: trade.direction || "C" } },
              Status:                { select: { name: "Expired" } },
              "Entry Price":         { number: trade.entry_price ?? null },
              "Current Price":       { number: trade.current_price ?? null },
              "Current Pct":         { number: trade.current_pct ?? null },
              "Max High":            { number: trade.max_high ?? null },
              "Max High Time":       rt(trade.max_high_time || ""),
              "Max Low":             { number: trade.max_low ?? null },
              "Max Low Time":        rt(trade.max_low_time || ""),
              "Strike Reached":         { checkbox: !!trade.strike_reached },
              "Strike Reached Time":    rt(trade.strike_reached_time || ""),
              "Price Captured":         { checkbox: !!trade.price_captured },
              "Last Updated":           rt(trade.last_updated || ""),
              "Entry Contract":         { number: trade.entry_contract ?? null },
              "Current Contract":       { number: trade.current_contract ?? null },
              "Contract Pct":           { number: trade.contract_pct ?? null },
              "Contract Max High":      { number: trade.contract_max_high ?? null },
              "Contract Max High Time": rt(trade.contract_max_high_time || ""),
              "Contract Max Low":       { number: trade.contract_max_low ?? null },
              "Contract Max Low Time":  rt(trade.contract_max_low_time || ""),
            }
          }),
        });
        if (!notionResp.ok) {
          const errBody = await notionResp.text().catch(() => '');
          return json({ error: `Notion ${notionResp.status}: ${errBody.slice(0, 200)}` }, 502);
        }
        await env.TRADES.delete(`trades:${id}`);
        return json({ success: true });
      }

      if (body.action === 'deleteTrade') {
        const { id } = body;
        if (!id) return json({ error: 'Missing trade id' }, 400);
        await env.TRADES.delete(`trades:${id}`);
        return json({ success: true });
      }

      if (body.action === 'getOptionsChain') {
        const { ticker, date } = body;
        if (!ticker) return json({ error: 'ticker required' }, 400);

        const YUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

        // Step 1 — get session cookie from Yahoo Finance
        const r0 = await fetch('https://finance.yahoo.com/', {
          headers: { 'User-Agent': YUA, 'Accept': 'text/html' },
          redirect: 'follow',
        });
        const rawCookies = r0.headers.getAll ? r0.headers.getAll('set-cookie') : [r0.headers.get('set-cookie')];
        const cookieStr  = rawCookies.filter(Boolean).map(c => c.split(';')[0]).join('; ');

        // Step 2 — exchange cookie for crumb
        const r1 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
          headers: { 'User-Agent': YUA, 'Cookie': cookieStr },
        });
        const crumb = (await r1.text()).trim();

        // Step 3 — fetch options chain
        let url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker.toUpperCase())}?crumb=${encodeURIComponent(crumb)}`;
        if (date) url += `&date=${date}`;
        const r = await fetch(url, { headers: { 'User-Agent': YUA, 'Cookie': cookieStr } });
        if (!r.ok) return json({ error: `Yahoo ${r.status}` }, 502);
        const data = await r.json();
        const result = data?.optionChain?.result?.[0];
        if (!result) return json({ error: 'No options data for ' + ticker }, 404);
        return json({
          underlying:      result.quote?.regularMarketPrice ?? null,
          expirationDates: result.expirationDates || [],
          fetchedDate:     result.options?.[0]?.expirationDate || null,
          calls:           result.options?.[0]?.calls || [],
          puts:            result.options?.[0]?.puts  || [],
        });
      }

      if (body.action === 'getActiveTrades') {
        const list = await env.TRADES.list({ prefix: 'trades:' });
        const all  = await Promise.all(list.keys.map(k => env.TRADES.get(k.name, 'json')));
        const active = all.filter(t => t && !t.expired);
        return json({ trades: active });
      }

      if (body.action === "duplicateAsset") {
        const { sourceAssetId, title, status, type, platformName, loginId } = body;
        if (!sourceAssetId) return json({ error: "sourceAssetId required" }, 400);
        const dash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+"-"+s.slice(8,12)+"-"+s.slice(12,16)+"-"+s.slice(16,20)+"-"+s.slice(20); };
        try {
          const srcResp = await fetch("https://api.notion.com/v1/pages/" + dash(sourceAssetId), {
            headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION }
          });
          const src = await srcResp.json();
          const sp = src.properties || {};
          const props = {
            "Asset Title": { title: [{ type: "text", text: { content: title || "Untitled" } }] },
            "Asset Status": { select: { name: status || "Draft" } },
            "Asset Type": { select: { name: type || "" } },
          };
          // Copy relations from source
          const campRel = sp["Campaign"]?.relation || [];
          if (campRel.length) props["Campaign"] = { relation: campRel.map(r => ({ id: r.id })) };
          const csRel = sp["Content Strategy"]?.relation || [];
          if (csRel.length) props["Content Strategy"] = { relation: csRel.map(r => ({ id: r.id })) };
          const platRel = sp["Platform"]?.relation || [];
          if (platRel.length) props["Platform"] = { relation: platRel.map(r => ({ id: r.id })) };
          const platName = platformName || sp["Platform Name"]?.select?.name;
          if (platName) props["Platform Name"] = { select: { name: platName } };
          if (loginId) props["Login"] = { relation: [{ id: dash(loginId) }] };
          const srcImages = sp["Images"]?.files || [];
          if (srcImages.length) props["Images"] = { files: srcImages };
          const resp = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
            body: JSON.stringify({ parent: { database_id: ASSETS_DB }, properties: props }),
          });
          const result = await resp.json();
          if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
          const newId = result.id;

          // Copy page block content from source
          async function fetchBlocks(blockId) {
            const r = await fetch(`https://api.notion.com/v1/blocks/${blockId}/children?page_size=100`, {
              headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION }
            });
            const d = await r.json();
            return d.results || [];
          }
          async function stripBlock(b) {
            const stripped = { type: b.type, [b.type]: b[b.type] };
            if (b.has_children) {
              const children = await fetchBlocks(b.id);
              stripped[b.type].children = await Promise.all(children.map(stripBlock));
            }
            return stripped;
          }
          try {
            const srcBlocks = await fetchBlocks(dash(sourceAssetId));
            if (srcBlocks.length) {
              const stripped = await Promise.all(srcBlocks.map(stripBlock));
              await fetch(`https://api.notion.com/v1/blocks/${newId}/children`, {
                method: "PATCH",
                headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
                body: JSON.stringify({ children: stripped }),
              });
            }
          } catch(_) {}

          return json({ success: true, id: newId.replace(/-/g,"") });
        } catch(e) { return json({ error: e.message }, 500); }
      }

      if (body.action === "setAssetDesignLink") {
        const { assetId, url } = body;
        if (!assetId) return json({ error: "assetId required" }, 400);
        const dash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+"-"+s.slice(8,12)+"-"+s.slice(12,16)+"-"+s.slice(16,20)+"-"+s.slice(20); };
        const resp = await fetch("https://api.notion.com/v1/pages/" + dash(assetId), {
          method: "PATCH",
          headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Design Link": { url: url || null } } }),
        });
        if (!resp.ok) { const e = await resp.json(); return json({ error: e.message || "Update failed" }, 400); }
        return json({ success: true });
      }

      if (body.action === "updateAssetField") {
        const { assetId, field, value } = body;
        if (!assetId || !field) return json({ error: "assetId and field required" }, 400);
        const dash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+"-"+s.slice(8,12)+"-"+s.slice(12,16)+"-"+s.slice(16,20)+"-"+s.slice(20); };
        const props = {};
        if (field === "Body") {
          props["Body"] = { rich_text: value ? [{ type: "text", text: { content: String(value).slice(0, 2000) } }] : [] };
        } else if (field === "Asset Title") {
          props["Asset Title"] = { title: value ? [{ type: "text", text: { content: String(value) } }] : [{ type: "text", text: { content: "Untitled" } }] };
        } else if (field === "Design Link") {
          props["Design Link"] = { url: value || null };
        } else if (field === "Asset Type") {
          props["Asset Type"] = value ? { select: { name: value } } : { select: null };
        } else if (field === "Asset Status") {
          props["Asset Status"] = value ? { select: { name: value } } : { select: null };
        } else if (field === "Status") {
          props["Status"] = value ? { select: { name: value } } : { select: null };
        } else if (field === "Notes") {
          props["Notes"] = { rich_text: value ? [{ type: "text", text: { content: String(value).slice(0, 2000) } }] : [] };
        } else {
          return json({ error: "Unsupported field: " + field }, 400);
        }
        const resp = await fetch("https://api.notion.com/v1/pages/" + dash(assetId), {
          method: "PATCH",
          headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: props }),
        });
        if (!resp.ok) { const e = await resp.json(); return json({ error: e.message || "Update failed" }, 400); }
        return json({ success: true });
      }

      if (body.action === "setAssetLogin") {
        const { assetId, loginId } = body;
        if (!assetId) return json({ error: "assetId required" }, 400);
        const dash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+"-"+s.slice(8,12)+"-"+s.slice(12,16)+"-"+s.slice(16,20)+"-"+s.slice(20); };
        const resp = await fetch("https://api.notion.com/v1/pages/" + dash(assetId), {
          method: "PATCH",
          headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Login": { relation: loginId ? [{ id: dash(loginId) }] : [] } } }),
        });
        if (!resp.ok) { const e = await resp.json(); return json({ error: e.message || "Update failed" }, 400); }
        return json({ success: true });
      }

      if (body.action === "createAssetComponent") {
        const { parentAssetId, assetType, title } = body;
        if (!parentAssetId || !assetType) return json({ error: "parentAssetId and assetType required" }, 400);
        const dash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+"-"+s.slice(8,12)+"-"+s.slice(12,16)+"-"+s.slice(16,20)+"-"+s.slice(20); };
        try {
          const srcResp = await fetch("https://api.notion.com/v1/pages/" + dash(parentAssetId), {
            headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION }
          });
          const src = await srcResp.json();
          const sp = src.properties || {};
          const props = {
            "Asset Title": { title: [{ type: "text", text: { content: title || (assetType + " — " + (sp["Asset Title"]?.title?.map(x=>x.plain_text).join("") || "Untitled")) } }] },
            "Asset Type": { select: { name: assetType } },
            "Asset Status": { select: { name: sp["Asset Status"]?.select?.name || "Development" } },
            "Status": { select: { name: "Draft" } },
            "Parent Asset": { relation: [{ id: dash(parentAssetId) }] },
          };
          const campRel = sp["Campaign"]?.relation || [];
          if (campRel.length) props["Campaign"] = { relation: campRel.map(r => ({ id: r.id })) };
          const csRel = sp["Content Strategy"]?.relation || [];
          if (csRel.length) props["Content Strategy"] = { relation: csRel.map(r => ({ id: r.id })) };
          const resp = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
            body: JSON.stringify({ parent: { database_id: ASSETS_DB }, properties: props }),
          });
          const result = await resp.json();
          if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
          return json({ success: true, id: result.id.replace(/-/g,""), assetTitle: props["Asset Title"].title[0].text.content, type: assetType, body: "", images: [], designLink: "", status: "Draft" });
        } catch(e) { return json({ error: e.message }, 500); }
      }

      if (body.action === "renameAssetImage") {
        const { assetId, imgKey, newName } = body;
        if (!assetId || !imgKey) return json({ error: "assetId and imgKey required" }, 400);
        const dash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+"-"+s.slice(8,12)+"-"+s.slice(12,16)+"-"+s.slice(16,20)+"-"+s.slice(20); };
        try {
          const pageResp = await fetch("https://api.notion.com/v1/pages/" + dash(assetId), {
            headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION }
          });
          const page = await pageResp.json();
          const existing = page.properties?.Images?.files || [];
          const updated = existing.map(f => {
            if (f.name?.startsWith("img:" + imgKey)) {
              return { ...f, name: "img:" + imgKey + "|" + (newName || "") };
            }
            return f;
          });
          const patchResp = await fetch("https://api.notion.com/v1/pages/" + dash(assetId), {
            method: "PATCH",
            headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
            body: JSON.stringify({ properties: { Images: { files: updated } } }),
          });
          if (!patchResp.ok) { const e = await patchResp.json(); return json({ error: e.message || "Rename failed" }, 400); }
          return json({ success: true });
        } catch(e) { return json({ error: e.message }, 500); }
      }

      if (body.action === "getAssetImages") {
        const { assetId } = body;
        if (!assetId) return json({ error: "assetId required" }, 400);
        const dash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+"-"+s.slice(8,12)+"-"+s.slice(12,16)+"-"+s.slice(16,20)+"-"+s.slice(20); };
        try {
          const resp = await fetch("https://api.notion.com/v1/pages/" + dash(assetId), {
            headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION }
          });
          const page = await resp.json();
          const files = (page.properties?.Images?.files || []).map(f => {
            const raw = f.name || "";
            let key = null, displayName = raw;
            if (raw.startsWith("img:")) {
              const pipeIdx = raw.indexOf("|", 4);
              if (pipeIdx !== -1) { key = raw.slice(4, pipeIdx); displayName = raw.slice(pipeIdx + 1); }
              else { key = raw.slice(4); displayName = ""; }
            }
            return { name: displayName, url: f.type === "external" ? f.external.url : (f.file?.url || ""), key };
          });
          return json({ images: files });
        } catch(e) { return json({ error: e.message }, 500); }
      }

      if (body.action === "uploadAssetImage") {
        const { assetId, imageData, fileName, mimeType } = body;
        if (!assetId || !imageData) return json({ error: "assetId and imageData required" }, 400);
        const dash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+"-"+s.slice(8,12)+"-"+s.slice(12,16)+"-"+s.slice(16,20)+"-"+s.slice(20); };
        try {
          // Decode base64 to binary
          const b64 = imageData.replace(/^data:[^;]+;base64,/, "");
          const binary = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const imgKey = "img:" + crypto.randomUUID().replace(/-/g,"");
          await env.TRADES.put(imgKey, binary, { metadata: { mime: mimeType || "image/jpeg", name: fileName || "image" } });
          const imgUrl = "https://jolly-darkness-5dcc.trailnotes2026.workers.dev/img/" + imgKey.slice(4);

          // Fetch current images from Notion
          const pageResp = await fetch("https://api.notion.com/v1/pages/" + dash(assetId), {
            headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION }
          });
          const page = await pageResp.json();
          const existing = page.properties?.Images?.files || [];
          const updated = [...existing, { type: "external", name: "img:" + imgKey.slice(4) + "|" + (fileName || "image"), external: { url: imgUrl } }];

          const patchResp = await fetch("https://api.notion.com/v1/pages/" + dash(assetId), {
            method: "PATCH",
            headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
            body: JSON.stringify({ properties: { Images: { files: updated } } }),
          });
          if (!patchResp.ok) {
            const err = await patchResp.json();
            await env.TRADES.delete(imgKey);
            return json({ error: err.message || "Notion update failed" }, 400);
          }
          return json({ success: true, url: imgUrl, key: imgKey.slice(4) });
        } catch(e) { return json({ error: e.message }, 500); }
      }

      if (body.action === "deleteAssetImage") {
        const { assetId, imgKey } = body;
        if (!assetId || !imgKey) return json({ error: "assetId and imgKey required" }, 400);
        const dash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+"-"+s.slice(8,12)+"-"+s.slice(12,16)+"-"+s.slice(16,20)+"-"+s.slice(20); };
        try {
          await env.TRADES.delete("img:" + imgKey);
          const pageResp = await fetch("https://api.notion.com/v1/pages/" + dash(assetId), {
            headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION }
          });
          const page = await pageResp.json();
          const existing = page.properties?.Images?.files || [];
          const updated = existing.filter(f => !f.name?.startsWith("img:" + imgKey));
          await fetch("https://api.notion.com/v1/pages/" + dash(assetId), {
            method: "PATCH",
            headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
            body: JSON.stringify({ properties: { Images: { files: updated } } }),
          });
          return json({ success: true });
        } catch(e) { return json({ error: e.message }, 500); }
      }

      // ── SCREENER ─────────────────────────────────────────────────────────────

      // Shared helpers used by screenStocks + discoverStocks
      async function fetchChart(sym) {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=90d`;
        const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!r.ok) throw new Error(`${sym}: HTTP ${r.status}`);
        return r.json();
      }

      function calcSignals(sym, data) {
        const res = data?.chart?.result?.[0];
        if (!res) return null;
        const quotes = res.indicators?.quote?.[0];
        const closes = quotes?.close;
        const highs  = quotes?.high;
        const lows   = quotes?.low;
        const vols   = quotes?.volume;
        if (!closes || closes.length < 22) return null;

        const rows = closes.map((c, i) => ({ c, h: highs[i], l: lows[i], v: vols[i] }))
                           .filter(r => r.c != null && r.v != null && r.h != null && r.l != null);
        if (rows.length < 22) return null;

        const n    = rows.length;
        const last = rows[n - 1];

        // Stochastic %K/%D (14-period)
        const stochK = [];
        for (let i = 13; i < rows.length; i++) {
          const window = rows.slice(i - 13, i + 1);
          const hh = Math.max(...window.map(r => r.h));
          const ll = Math.min(...window.map(r => r.l));
          stochK.push(hh === ll ? 50 : ((rows[i].c - ll) / (hh - ll)) * 100);
        }
        const recentK = stochK.slice(-3);
        const stochD  = recentK.reduce((a, b) => a + b, 0) / recentK.length;
        const kNow    = stochK[stochK.length - 1];

        // Volume vs 20-day avg
        const vol20    = rows.slice(n - 21, n - 1).reduce((s, r) => s + r.v, 0) / 20;
        const volRatio = last.v / vol20;

        // OBV trend — linear regression slope over last 20 periods (normalised)
        const obvArr = [];
        let obv = 0;
        for (let i = 1; i < rows.length; i++) {
          obv += rows[i].c > rows[i-1].c ? rows[i].v : rows[i].c < rows[i-1].c ? -rows[i].v : 0;
          obvArr.push(obv);
        }
        const recentObv = obvArr.slice(-20);
        const xBar = 9.5, yBar = recentObv.reduce((a, b) => a + b, 0) / 20;
        let num = 0, den = 0;
        recentObv.forEach((y, i) => { num += (i - xBar) * (y - yBar); den += (i - xBar) ** 2; });
        const obvSlope = den ? num / den : 0;
        const obvNorm  = yBar ? obvSlope / Math.abs(yBar) : 0;

        // Chaikin Money Flow (20-period)
        const cmfRows = rows.slice(n - 20);
        let mfvSum = 0, volSum = 0;
        for (const r of cmfRows) {
          const hl  = r.h - r.l;
          const mfm = hl ? ((r.c - r.l) - (r.h - r.c)) / hl : 0;
          mfvSum += mfm * r.v;
          volSum += r.v;
        }
        const cmf = volSum ? mfvSum / volSum : 0;

        // Score 0–3
        const volScore = Math.min(volRatio / 2, 1);
        const obvScore = Math.min(Math.max(obvNorm * 5 + 0.5, 0), 1);
        const cmfScore = Math.min(Math.max(cmf + 0.5, 0), 1);
        const score    = volScore + obvScore + cmfScore;

        // Verdict
        let verdict = 'SKIP';
        if (score >= 2.4 && obvNorm > 0 && cmf > 0) verdict = 'BUY';
        else if (score >= 1.6) verdict = 'WATCH';

        return {
          sym,
          price:    +last.c.toFixed(2),
          volRatio: +volRatio.toFixed(2),
          obvSlope: +obvNorm.toFixed(4),
          cmf:      +cmf.toFixed(3),
          stochK:   +kNow.toFixed(1),
          stochD:   +stochD.toFixed(1),
          score:    +score.toFixed(2),
          verdict,
        };
      }

      if (body.action === 'getWatchlist') {
        const raw = await env.TRADES.get('screener:watchlist');
        const tickers = raw ? JSON.parse(raw) : [];
        return json({ tickers });
      }

      if (body.action === 'saveWatchlist') {
        const { tickers } = body;
        if (!Array.isArray(tickers)) return json({ error: 'tickers array required' }, 400);
        const clean = tickers.map(t => t.toUpperCase().trim()).filter(Boolean);
        await env.TRADES.put('screener:watchlist', JSON.stringify(clean));
        return json({ ok: true });
      }

      if (body.action === 'screenStocks') {
        const { tickers } = body;
        if (!Array.isArray(tickers) || !tickers.length) return json({ error: 'tickers required' }, 400);
        const list = tickers.slice(0, 40).map(t => t.toUpperCase().trim());

        const results = await Promise.allSettled(
          list.map(sym => fetchChart(sym).then(d => calcSignals(sym, d)))
        );

        const screened = results
          .map((r, i) => r.status === 'fulfilled' ? r.value : { sym: list[i], error: true })
          .filter(Boolean)
          .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

        return json({ screened });
      }

      if (body.action === 'discoverStocks') {
        // Step 1: fetch top 100 most-active tickers from Yahoo Finance
        const scrUrl = 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=most_actives&count=100&formatted=false&lang=en-US&region=US';
        const scrResp = await fetch(scrUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!scrResp.ok) throw new Error(`Yahoo screener HTTP ${scrResp.status}`);
        const scrData = await scrResp.json();
        const quotes  = scrData?.finance?.result?.[0]?.quotes || [];
        const tickers = quotes.map(q => q.symbol).filter(Boolean).slice(0, 100);
        if (!tickers.length) return json({ error: 'No tickers from Yahoo screener' }, 502);

        // Step 2: fetch OHLCV for all in parallel
        const results = await Promise.allSettled(
          tickers.map(sym => fetchChart(sym).then(d => calcSignals(sym, d)))
        );

        const all = results
          .map((r, i) => r.status === 'fulfilled' ? r.value : null)
          .filter(Boolean);

        // Step 3: filter — stochastic %K < 50 (below midline, not yet extended)
        const filtered = all.filter(s => s.stochK < 50);

        // Step 4: sort by score, return top 15
        const top = filtered
          .sort((a, b) => b.score - a.score)
          .slice(0, 15);

        return json({ screened: top, universe: tickers.length, passed: filtered.length });
      }

      if (body.action === 'getEdgarPicks') {
        // SEC Archives are blocked from datacenter IPs (Akamai).
        // Universe is derived from latest public 13F filings for the 8 funds
        // and refreshed manually each quarter as filings come in.
        const INSTITUTIONAL_UNIVERSE = {
          // Berkshire Hathaway top holdings
          'AAPL':{ funds:['Berkshire','Coatue','Tiger Global','Two Sigma','Citadel'] },
          'BAC': { funds:['Berkshire'] },
          'AXP': { funds:['Berkshire'] },
          'KO':  { funds:['Berkshire'] },
          'OXY': { funds:['Berkshire'] },
          'CVX': { funds:['Berkshire','Citadel'] },
          'MCO': { funds:['Berkshire'] },
          'CB':  { funds:['Berkshire'] },
          // Mega-cap tech — held by most funds
          'MSFT':{ funds:['Coatue','Tiger Global','Two Sigma','Citadel','Renaissance'] },
          'NVDA':{ funds:['Coatue','Tiger Global','Two Sigma','Citadel','Renaissance','Bridgewater'] },
          'AMZN':{ funds:['Coatue','Tiger Global','Two Sigma','Citadel','Renaissance'] },
          'META':{ funds:['Coatue','Tiger Global','Two Sigma','Citadel'] },
          'GOOGL':{ funds:['Coatue','Tiger Global','Citadel','Renaissance'] },
          'TSLA':{ funds:['Coatue','Two Sigma','Citadel','Renaissance'] },
          'AVGO':{ funds:['Two Sigma','Citadel','Renaissance'] },
          // Financials
          'JPM': { funds:['Bridgewater','Two Sigma','Citadel'] },
          'V':   { funds:['Two Sigma','Citadel','Renaissance'] },
          'MA':  { funds:['Two Sigma','Citadel','Renaissance'] },
          'GS':  { funds:['Citadel','DE Shaw'] },
          'MS':  { funds:['Citadel','DE Shaw'] },
          'SPGI':{ funds:['Two Sigma','Citadel'] },
          'BLK': { funds:['Two Sigma','Citadel'] },
          'SCHW':{ funds:['Two Sigma','DE Shaw'] },
          // Healthcare
          'LLY': { funds:['Two Sigma','Citadel','Bridgewater','Renaissance'] },
          'UNH': { funds:['Bridgewater','Two Sigma','Citadel'] },
          'JNJ': { funds:['Bridgewater','Two Sigma'] },
          'MRK': { funds:['Two Sigma','Citadel','DE Shaw'] },
          'TMO': { funds:['Two Sigma','Citadel'] },
          'ABBV':{ funds:['Two Sigma','Citadel','Renaissance'] },
          'AMGN':{ funds:['Two Sigma','DE Shaw'] },
          'REGN':{ funds:['Two Sigma','Citadel','DE Shaw'] },
          'ISRG':{ funds:['Two Sigma','Citadel'] },
          'VRTX':{ funds:['Two Sigma','Citadel','DE Shaw'] },
          'GILD':{ funds:['Bridgewater','Two Sigma'] },
          // Tech / Cloud / Semi
          'ORCL':{ funds:['Two Sigma','Citadel','DE Shaw'] },
          'AMD': { funds:['Two Sigma','Citadel','Renaissance','Coatue'] },
          'QCOM':{ funds:['Two Sigma','Citadel','Renaissance'] },
          'TXN': { funds:['Two Sigma','Citadel'] },
          'ADBE':{ funds:['Tiger Global','Two Sigma','Citadel'] },
          'CRM': { funds:['Tiger Global','Two Sigma','Citadel'] },
          'NOW': { funds:['Tiger Global','Two Sigma','Citadel','Coatue'] },
          'INTU':{ funds:['Two Sigma','Citadel','Coatue'] },
          'PANW':{ funds:['Two Sigma','Citadel','Coatue','Tiger Global'] },
          'CRWD':{ funds:['Two Sigma','Citadel','Coatue'] },
          'DDOG':{ funds:['Two Sigma','Citadel','Coatue','Tiger Global'] },
          'NET': { funds:['Coatue','Tiger Global','Two Sigma'] },
          'SNOW':{ funds:['Coatue','Two Sigma','Citadel'] },
          'PLTR':{ funds:['Two Sigma','Citadel','Renaissance'] },
          'MDB': { funds:['Coatue','Tiger Global','Two Sigma'] },
          'NFLX':{ funds:['Tiger Global','Two Sigma','Citadel','Coatue'] },
          // Consumer / Industrial
          'HD':  { funds:['Bridgewater','Two Sigma','Citadel'] },
          'PG':  { funds:['Bridgewater','Two Sigma'] },
          'COST':{ funds:['Two Sigma','Citadel','Renaissance'] },
          'MCD': { funds:['Bridgewater','Two Sigma'] },
          'WMT': { funds:['Bridgewater','Two Sigma','Citadel'] },
          'CAT': { funds:['Two Sigma','Citadel','DE Shaw'] },
          'GE':  { funds:['Two Sigma','Citadel','Renaissance'] },
          'RTX': { funds:['Two Sigma','Citadel','DE Shaw'] },
          // Energy
          'XOM': { funds:['Bridgewater','Two Sigma','Citadel'] },
          'COP': { funds:['Two Sigma','Citadel','DE Shaw'] },
          'EOG': { funds:['Two Sigma','Citadel'] },
          'OXY': { funds:['Berkshire','Two Sigma'] },
          // Fintech / New Economy
          'COIN':{ funds:['Two Sigma','Citadel','Coatue'] },
          'UBER':{ funds:['Two Sigma','Citadel','Coatue','Tiger Global'] },
          'ABNB':{ funds:['Two Sigma','Citadel','Coatue'] },
          'PYPL':{ funds:['Two Sigma','Citadel','Renaissance'] },
          'SQ':  { funds:['Two Sigma','Coatue','Tiger Global'] },
          // Comm / Media
          'DIS': { funds:['Bridgewater','Two Sigma'] },
          'VZ':  { funds:['Berkshire','Bridgewater'] },
          'T':   { funds:['Bridgewater','Two Sigma'] },
          'SPOT':{ funds:['Tiger Global','Coatue'] },
          // Defensives / Dividend
          'PEP': { funds:['Bridgewater','Two Sigma'] },
          'KO':  { funds:['Berkshire','Bridgewater'] },
          'ABT': { funds:['Two Sigma','Citadel'] },
          'BMY': { funds:['Two Sigma','DE Shaw','Renaissance'] },
        };

        const tickers = Object.keys(INSTITUTIONAL_UNIVERSE);

        const results = await Promise.allSettled(
          tickers.map(sym => fetchChart(sym).then(d => {
            const s = calcSignals(sym, d);
            if (s && INSTITUTIONAL_UNIVERSE[sym]) {
              s.funds     = INSTITUTIONAL_UNIVERSE[sym].funds;
              s.fundCount = s.funds.length;
            }
            return s;
          }))
        );

        const all      = results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
        const filtered = all.filter(s => s.stochK < 50);
        const top      = filtered.sort((a, b) => b.score - a.score).slice(0, 15);

        return json({ screened: top, universe: tickers.length, passed: filtered.length });
      }

      // ── SENTIMENT (Reddit WSB + Yahoo Options P/C) ───────────────────────────
      if (body.action === 'getSentiment') {
        const { tickers } = body;
        if (!Array.isArray(tickers) || !tickers.length) return json({ error: 'tickers required' }, 400);
        const list = tickers.slice(0, 20).map(t => t.toUpperCase().trim());

        async function fetchRedditSentiment(sym) {
          const BULL = ['call','calls','bull','bullish','moon','buy','long','squeeze','breakout','pump','green','yolo','🚀','rip','gap up','upside'];
          const BEAR = ['put','puts','bear','bearish','short','dump','down','crash','sell','red','drop','fall','tank','collapse','puts printing'];
          try {
            const url = `https://www.reddit.com/search.json?q=%22${encodeURIComponent(sym)}%22+options&sort=new&t=day&limit=25&restrict_sr=false`;
            const r = await fetch(url, { headers: { 'User-Agent': 'HermesScanner/1.0 (market research)' } });
            if (!r.ok) return null;
            const data = await r.json();
            const posts = data?.data?.children || [];
            let bull = 0, bear = 0;
            for (const p of posts) {
              const text = ((p.data?.title || '') + ' ' + (p.data?.selftext || '')).toLowerCase();
              if (BULL.some(w => text.includes(w))) bull++;
              if (BEAR.some(w => text.includes(w))) bear++;
            }
            return { mentions: posts.length, bull, bear, score: posts.length === 0 ? 0 : (bull - bear) / Math.max(posts.length, 1) };
          } catch { return null; }
        }

        async function fetchPutCall(sym) {
          try {
            const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(sym)}`;
            const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!r.ok) return null;
            const data = await r.json();
            const opts = data?.optionChain?.result?.[0]?.options?.[0];
            if (!opts) return null;
            const callVol = (opts.calls || []).reduce((s, c) => s + (c.volume || 0), 0);
            const putVol  = (opts.puts  || []).reduce((s, p) => s + (p.volume || 0), 0);
            if (!callVol && !putVol) return null;
            return { callVol, putVol, ratio: callVol > 0 ? +(putVol / callVol).toFixed(2) : 99 };
          } catch { return null; }
        }

        const results = await Promise.allSettled(list.map(async sym => {
          const [red, pc] = await Promise.allSettled([fetchRedditSentiment(sym), fetchPutCall(sym)]);
          return {
            sym,
            reddit: red.status === 'fulfilled' ? red.value : null,
            putCall: pc.status  === 'fulfilled' ? pc.value  : null,
          };
        }));

        return json({ sentiment: results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean) });
      }

      // ── runDeepScan (manual trigger) ──
      if (body.action === "runDeepScan") {
        if (!await verifyToken(body.token, HMAC_SECRET)) return json({ error: "Unauthorized" }, 401);
        const diff = await deepScan(env);
        return json({ diff });
      }

      return json({ error: "Unknown action" }, 400);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(deepScan(env));
  },
};
