let NOTION_TOKEN = null;
const NOTION_VERSION = "2022-06-28";

let ADMIN_PIN = null;
let SITE_PINS_ENV = null;
const MAIN_TD_DB_ID = "3471f7d3a4bb80de87c1d9e850f4a426";
const CONTENT_STRATEGY_DB = "9fa5f42f010b47e7a82032607e07d6a1";
const CAMPAIGNS_DB = "087b1163b4e64975bc7a4b686ff801de";
const ASSETS_DB = "e91bdb6e770b4d298e9f62166a0fd5de";

// SITE_PINS loaded from environment at request time
const SITE_PINS = {};

// Site key → Campaigns DB "site" select value
const SITE_DB_NAMES = {
  "affiliates":      "Affiliates",
  "webguy":          "Webguy Business Services",
  "mountainwize":    "Mountainwize Coaching",
  "mobility_mentor": "Mobility Mentor",
  "trading":         "Trading",
  "hermes":          "Hermes",
  "main":            "Main Business",
};

const ALL_SITES = [
  { key: "affiliates",      name: "💰 Affiliates" },
  { key: "webguy",          name: "🖥️ Webguy" },
  { key: "mountainwize",    name: "⛰️ Mountainwize" },
  { key: "mobility_mentor", name: "♿ Mobility Mentor" },
  { key: "trading",         name: "📈 Trading" },
  { key: "hermes",          name: "🤖 Hermes" },
  { key: "main",            name: "🏠 Main" },
];

const METHODS_DB = "285ed0b668be4dad89dfd090350096bc";
const PRODUCTS_DB = "e92fcfce75fc4f54b553df0b7672ff48";
const PLATFORMS_DB = "8248b700ebb7428aa28d8b5246509898";
const LOGINS_DB = "72d262278a4c4786b375959432fdd82a";
const RESEARCH_DB = "557e6b7b8c434a578d45ecb0a8329f63";

const PLATFORM_URLS = {
  "LinkedIn":  "https://www.linkedin.com",
  "Beehiiv":   "https://app.beehiiv.com",
  "WordPress": "https://wordpress.com/posts",
  "Blog":      "https://wordpress.com/posts",
  "Fiverr":    "https://www.fiverr.com/seller_dashboard",
  "Upwork":    "https://www.upwork.com/freelancers/settings/profile",
  "Reddit":    "https://www.reddit.com",
  "Email":     "https://mail.proton.me",
  "Substack":  "https://substack.com/home",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS }
  });
}

async function notionGet(path) {
  const resp = await fetch(`https://api.notion.com/v1${path}`, {
    headers: {
      "Authorization": `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json"
    }
  });
  return resp.json();
}

async function notionPost(path, body) {
  const resp = await fetch(`https://api.notion.com/v1${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  return resp.json();
}

async function notionPatch(path, body) {
  const resp = await fetch(`https://api.notion.com/v1${path}`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  return resp.json();
}

// Get campaigns from DB filtered by site name
async function getCampaigns(siteName) {
  const data = await notionPost(`/databases/${CAMPAIGNS_DB}/query`, {
    filter: {
      and: [
        { property: "site", select: { equals: siteName } },
        { property: "Status", select: { does_not_equal: "Delete" } },
      ]
    },
    sorts: [{ property: "Name", direction: "ascending" }],
    page_size: 50
  });
  return (data.results || []).map(page => ({
    id: page.id.replace(/-/g, ''),
    name: page.properties.Name?.title?.map(t => t.plain_text).join('') || 'Untitled',
    status: page.properties.Status?.select?.name || '',
  }));
}

// Get titles from Content Strategy DB filtered by campaign ID
async function getTitles(campaignId) {
  const dashedId = campaignId.replace(/-/g, '').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  const data = await notionPost(`/databases/${CONTENT_STRATEGY_DB}/query`, {
    filter: {
      property: "Campaign",
      relation: { contains: dashedId }
    },
    sorts: [{ property: "Sequence Order", direction: "ascending" }],
    page_size: 100
  });
  const titles = (data.results || []).map(page => {
    const props = page.properties;
    return {
      id: page.id.replace(/-/g, ''),
      title: props.Title?.title?.map(t => t.plain_text).join('') || 'Untitled',
      stage: props.Status?.select?.name || '',
      grouping: props.Grouping?.rich_text?.map(t => t.plain_text).join('') || '',
      cohort: props.Cohort?.select?.name || '',
      postType: props['Post Type']?.select?.name || '',
      sequence: props['Sequence Order']?.number || 999,
      scheduled: props['Scheduled Date']?.date?.start || '',
    };
  });
  // Sort by Post Type first, then Sequence Order
  titles.sort((a, b) => {
    const pt = (a.postType||'').localeCompare(b.postType||'');
    if (pt !== 0) return pt;
    return a.sequence - b.sequence;
  });
  return titles;
}

// Get assets for a title
async function getAssetsByTitle(titleId) {
  const dashedId = titleId.replace(/-/g, '').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  const data = await notionPost(`/databases/${ASSETS_DB}/query`, {
    filter: { property: "Title", relation: { contains: dashedId } },
    sorts: [{ property: "Platform Name", direction: "ascending" }],
    page_size: 100
  });
  return (data.results || []).map(page => {
    const props = page.properties;
    const platform = props['Platform Name']?.select?.name || 'Other';
    return {
      id: page.id.replace(/-/g, ''),
      title: props['Asset Title']?.title?.map(t => t.plain_text).join('') || 'Untitled',
      platform,
      platformUrl: PLATFORM_URLS[platform] || '',
      type: props['Asset Type']?.select?.name || '',
      status: props['Asset Status']?.select?.name || 'Publish',
    };
  });
}

// Get page text as markdown
function richTextToMd(richText) {
  return richText.map(t => {
    let s = t.plain_text;
    if (t.annotations?.code)   s = '`' + s + '`';
    if (t.annotations?.bold)   s = '**' + s + '**';
    if (t.annotations?.italic) s = '*' + s + '*';
    if (t.href)                s = '[' + t.plain_text + '](' + t.href + ')';
    return s;
  }).join('');
}

async function getPageText(pageId) {
  const data = await notionGet(`/blocks/${pageId}/children?page_size=100`);
  if (!data.results) return "";
  const lines = [];
  for (const block of data.results) {
    const type = block.type;
    const content = block[type];
    if (!content) continue;
    const richText = content.rich_text || [];
    const text = richTextToMd(richText);
    if      (type === "heading_1")           lines.push(`# ${text}`);
    else if (type === "heading_2")           lines.push(`## ${text}`);
    else if (type === "heading_3")           lines.push(`### ${text}`);
    else if (type === "bulleted_list_item")  lines.push(`- ${text}`);
    else if (type === "numbered_list_item")  lines.push(`1. ${text}`);
    else if (type === "paragraph")           lines.push(text || "");
    else if (type === "divider")             lines.push("---");
    else if (type === "callout")             lines.push(`> ${text}`);
    else if (type === "quote")               lines.push(`> ${text}`);
    else if (type === "code")                lines.push(`\`\`\`\n${richText.map(t=>t.plain_text).join('')}\n\`\`\``);
  }
  return lines.join("\n");
}

function parseInlineToRichText(text) {
  const segments = [];
  const re = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))|([^*`\[]+|\[)/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match[1])       segments.push({ type:"text", text:{content:match[2]}, annotations:{bold:true} });
    else if (match[3])  segments.push({ type:"text", text:{content:match[4]}, annotations:{italic:true} });
    else if (match[5])  segments.push({ type:"text", text:{content:match[6]}, annotations:{code:true} });
    else if (match[7])  segments.push({ type:"text", text:{content:match[8], link:{url:match[9]}} });
    else if (match[10]) segments.push({ type:"text", text:{content:match[10]} });
  }
  return segments.length ? segments : [{type:"text", text:{content:text}}];
}

function markdownToBlocks(markdown) {
  const lines = markdown.split("\n");
  const blocks = [];
  for (const line of lines) {
    if (!line.trim()) { blocks.push({object:"block",type:"paragraph",paragraph:{rich_text:[]}}); continue; }
    if (line.trim()==="---") { blocks.push({object:"block",type:"divider",divider:{}}); continue; }
    if (line.startsWith("# "))    { blocks.push({object:"block",type:"heading_1",heading_1:{rich_text:parseInlineToRichText(line.slice(2))}}); continue; }
    if (line.startsWith("## "))   { blocks.push({object:"block",type:"heading_2",heading_2:{rich_text:parseInlineToRichText(line.slice(3))}}); continue; }
    if (line.startsWith("### "))  { blocks.push({object:"block",type:"heading_3",heading_3:{rich_text:parseInlineToRichText(line.slice(4))}}); continue; }
    if (line.startsWith("> "))    { blocks.push({object:"block",type:"quote",quote:{rich_text:parseInlineToRichText(line.slice(2))}}); continue; }
    if (line.startsWith("- "))    { blocks.push({object:"block",type:"bulleted_list_item",bulleted_list_item:{rich_text:parseInlineToRichText(line.slice(2))}}); continue; }
    if (/^\d+\. /.test(line))     { blocks.push({object:"block",type:"numbered_list_item",numbered_list_item:{rich_text:parseInlineToRichText(line.replace(/^\d+\. /,''))}}); continue; }
    blocks.push({object:"block",type:"paragraph",paragraph:{rich_text:parseInlineToRichText(line)}});
  }
  return blocks;
}

async function getTodos() {
  const data = await notionPost(`/databases/${MAIN_TD_DB_ID}/query`, {
    filter: {
      or: [
        { property:"priority", multi_select:{contains:"daily content"} },
        { property:"priority", multi_select:{contains:"daily household"} },
        { property:"priority", multi_select:{contains:"get"} },
        { property:"priority", multi_select:{contains:"high"} },
      ]
    },
    sorts: [{property:"Due Date",direction:"ascending"}],
    page_size: 100
  });
  if (!data.results) return [];
  const todos = await Promise.all(data.results.map(async (page) => {
    const props = page.properties;
    const name = props.Name?.title?.map(t=>t.plain_text).join("") || "Untitled";
    const priorities = props.priority?.multi_select?.map(s=>s.name) || [];
    const site = props.site?.multi_select?.map(s=>s.name).join(", ") || "";
    const campaignRefs = props.campaign?.relation || [];
    let campaignName = "";
    if (campaignRefs.length > 0) {
      try {
        const cp = await notionGet(`/pages/${campaignRefs[0].id}`);
        campaignName = cp.properties?.Name?.title?.map(t=>t.plain_text).join("") || "";
      } catch(e) {}
    }
    const category = priorities.includes("daily content") ? "daily content"
      : priorities.includes("daily household") ? "daily household"
      : priorities.includes("get") ? "get"
      : "high";
    return { id:page.id.replace(/-/g,""), name, campaign:campaignName, priority:priorities.join(", "), category, site };
  }));
  return todos;
}

export default {
  async fetch(request, env) {
    // Set secrets from environment at request time
    NOTION_TOKEN = env.NOTION_TOKEN || "ntn_i84528099155pTq2P4dwUSpqmZYBpTSsL0qFB9GsQP6bc4";
    ADMIN_PIN = env.ADMIN_PIN || "1246";
    // SITE_PINS stored as JSON in env: {"mobility_mentor":"1234"}
    try { Object.assign(SITE_PINS, JSON.parse(env.SITE_PINS || '{}')); } catch(e) {}
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method === "GET") return json({ status:"ok" });
    if (request.method !== "POST") return new Response("Method not allowed", { status:405 });

    let body;
    try { body = await request.json(); }
    catch(e) { return json({ error:"Invalid JSON" }, 400); }

    const { action, pin } = body;

    // Auth
    if (action === "auth") {
      if (pin === ADMIN_PIN) return json({ role:"admin", sites:ALL_SITES });
      for (const [key, clientPin] of Object.entries(SITE_PINS)) {
        if (pin === clientPin) {
          const site = ALL_SITES.find(s => s.key === key);
          return json({ role:"client", sites: site ? [site] : [] });
        }
      }
      return json({ error:"Invalid PIN" }, 401);
    }

    const isAdmin = pin === ADMIN_PIN;
    let isClient = false;
    for (const clientPin of Object.values(SITE_PINS)) {
      if (pin === clientPin) { isClient = true; break; }
    }
    if (!isAdmin && !isClient) return json({ error:"Unauthorized" }, 401);

    try {

      // L2: Get campaigns for a site
      if (action === "getCampaigns") {
        const { siteKey } = body;
        if (siteKey) {
          const siteName = SITE_DB_NAMES[siteKey];
          if (!siteName) return json({ error:"Unknown site key" }, 400);
          const campaigns = await getCampaigns(siteName);
          return json({ campaigns });
        }
        // No siteKey — return all campaigns for Hermes overview
        const [campData, titleData, researchData, assetData] = await Promise.all([
          notionPost(`/databases/${CAMPAIGNS_DB}/query`, {
            filter: { and: [
              { property: "Status", select: { does_not_equal: "Delete" } },
              { property: "Grouping", multi_select: { does_not_contain: "deprecate" } },
              { property: "Grouping", multi_select: { does_not_contain: "Del" } },
            ]},
            sorts: [{ property: "Name", direction: "ascending" }],
            page_size: 100
          }),
          notionPost(`/databases/${CONTENT_STRATEGY_DB}/query`, { page_size: 100 }),
          notionPost(`/databases/${RESEARCH_DB}/query`, { page_size: 100 }),
          notionPost(`/databases/${ASSETS_DB}/query`, {
            filter: { and: [
              { property: "Asset Type", select: { equals: "Microsite" } },
              { property: "Asset Status", select: { equals: "Published" } },
            ]},
            page_size: 100
          }),
        ]);

        // Build counts from titles
        const devCount = {}, pubCount = {}, pubTitleMap = {};
        (titleData.results || []).forEach(t => {
          const stage = t.properties.Status?.select?.name || '';
          const assetIds = (t.properties.Assets?.relation || []).map(r => r.id.replace(/-/g,''));
          const titleId = t.id.replace(/-/g,'');
          const titleName = t.properties.Title?.title?.map(x=>x.plain_text).join('') || 'Untitled';
          (t.properties.Campaign?.relation || []).forEach(r => {
            const id = r.id.replace(/-/g,'');
            if (['Development','Writing','Review','Approved','Explode'].includes(stage)) devCount[id] = (devCount[id]||0)+1;
            if (['Publish','Published','Done'].includes(stage)) {
              pubCount[id] = (pubCount[id]||0)+1;
              if (!pubTitleMap[id]) pubTitleMap[id] = [];
              pubTitleMap[id].push({ id: titleId, title: titleName, assetIds });
            }
          });
        });

        // Build research lookup
        const researchMap = {};
        (researchData.results || []).forEach(r => {
          const rid = r.id.replace(/-/g,'');
          const rname = r.properties.Name?.title?.map(x=>x.plain_text).join('') || '';
          const campRel = (r.properties.Campaign?.relation || []).concat(r.properties["Campaign 1"]?.relation || []);
          campRel.forEach(c => { researchMap[c.id.replace(/-/g,'')] = { id: rid, name: rname }; });
        });

        // Build siteUrl lookup from assets
        const siteUrlMap = {};
        (assetData.results || []).forEach(a => {
          const url = a.properties["Site URL"]?.url || '';
          if (!url) return;
          (a.properties.Campaign?.relation || []).forEach(r => { siteUrlMap[r.id.replace(/-/g,'')] = url; });
        });

        const campaigns = (campData.results || []).map(c => {
          const id = c.id.replace(/-/g,'');
          const p = c.properties;
          return {
            id,
            name: p.Name?.title?.map(t=>t.plain_text).join('') || 'Untitled',
            site: p.site?.select?.name || 'Other',
            status: p.Status?.select?.name || '',
            grouping: (p.Grouping?.multi_select || []).map(g=>g.name),
            keyMessage: p["Key Message"]?.rich_text?.map(t=>t.plain_text).join('') || '',
            siteUrl: siteUrlMap[id] || p["Campaign Page"]?.url || null,
            research: researchMap[id] || null,
            devTitles: devCount[id] || 0,
            pubTitles: pubCount[id] || 0,
            pubTitleData: pubTitleMap[id] || [],
            products: 0,
            mainTd: (p["Associated To Do"]?.relation || []).map(r => ({ id: r.id.replace(/-/g,''), name: '' })),
            campaignProducts: (p.Products?.relation || []).map(r => ({ id: r.id.replace(/-/g,''), name: '' })),
            campaignMethods: (p.Methods?.relation || []).map(r => ({ id: r.id.replace(/-/g,''), name: '' })),
            platforms: (p.Platforms?.relation || []).map(r => ({ id: r.id.replace(/-/g,''), name: '' })),
          };
        });
        return json({ campaigns });
      }

      // L3: Get titles for a campaign
      if (action === "getTitles") {
        const { campaignId } = body;
        if (!campaignId) return json({ error:"campaignId required" }, 400);
        const titles = await getTitles(campaignId);
        return json({ titles });
      }

      // L1 publish queue — all publish titles across all campaigns
      if (action === "getPublishQueue") {
        const data = await notionPost(`/databases/${CONTENT_STRATEGY_DB}/query`, {
          filter: { property:"Status", select:{ equals:"Publish" } },
          sorts: [{ property:"Sequence Order", direction:"ascending" }],
          page_size: 100
        });
        const titles = (data.results || []).map(page => {
          const props = page.properties;
          return {
            id: page.id.replace(/-/g,''),
            title: props.Title?.title?.map(t=>t.plain_text).join('') || 'Untitled',
            stage: props.Status?.select?.name || '',
            grouping: props.Grouping?.rich_text?.map(t=>t.plain_text).join('') || '',
            scheduled: props['Scheduled Date']?.date?.start || '',
          };
        });
        return json({ titles });
      }

      // L1 explode queue
      if (action === "getExplodeQueue") {
        const data = await notionPost(`/databases/${CONTENT_STRATEGY_DB}/query`, {
          filter: {
            or: [
              { property:"Status", select:{equals:"Review"} },
            ]
          },
          sorts: [{ property:"Sequence Order", direction:"ascending" }],
          page_size: 100
        });
        const titles = (data.results || []).map(page => {
          const props = page.properties;
          return {
            titleId: page.id.replace(/-/g,''),
            titleName: props.Title?.title?.map(t=>t.plain_text).join('') || 'Untitled',
            campaignName: props.Grouping?.rich_text?.map(t=>t.plain_text).join('') || '',
            stage: props.Status?.select?.name || '',
          };
        });
        return json({ titles });
      }

      // Assets for a title
      if (action === "getAssetsByTitle") {
        const { titleId } = body;
        if (!titleId) return json({ error:"titleId required" }, 400);
        const assets = await getAssetsByTitle(titleId);
        return json({ assets });
      }

      // Asset content for clipboard copy
      if (action === "getAssetContent") {
        const { assetId } = body;
        if (!assetId) return json({ error:"assetId required" }, 400);
        const text = await getPageText(assetId);
        return json({ content: text });
      }

      // Todos
      if (action === "getTodos") {
        const todos = await getTodos();
        return json({ todos });
      }

      // Add todo
      if (action === "addTodo") {
        const { name, category } = body;
        if (!name) return json({ error: "name required" }, 400);
        const priority = category || "high";
        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${NOTION_TOKEN}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            parent: { database_id: MAIN_TD_DB_ID },
            properties: {
              Name: { title: [{ type: "text", text: { content: name } }] },
              priority: { multi_select: [{ name: priority }] }
            }
          })
        });
        const data = await resp.json();
        if (!resp.ok) return json({ error: data.message || "Failed to create" }, 400);
        return json({ id: data.id.replace(/-/g, ''), name });
      }

      // Save page content
      if (action === "saveContent") {
        const { pageId, content } = body;
        const existing = await notionGet(`/blocks/${pageId}/children?page_size=100`);
        for (const block of (existing.results || [])) {
          await fetch(`https://api.notion.com/v1/blocks/${block.id}`, {
            method:"DELETE",
            headers:{ "Authorization":`Bearer ${NOTION_TOKEN}`, "Notion-Version":NOTION_VERSION }
          });
        }
        const blocks = markdownToBlocks(content);
        if (blocks.length > 0) await notionPatch(`/blocks/${pageId}/children`, { children:blocks });
        return json({ saved:true });
      }

      // Get all logins grouped by platform
      if (action === "getLogins") {
        // Fetch all platforms
        const platformData = await notionPost(`/databases/${PLATFORMS_DB}/query`, {
          sorts: [{ property: "Name", direction: "ascending" }],
          page_size: 50
        });
        const platforms = (platformData.results || []).map(p => ({
          id: p.id.replace(/-/g, ''),
          name: p.properties.Name?.title?.map(t => t.plain_text).join('') || '',
          url: p.properties['Base URL']?.url || '',
          status: p.properties.Status?.select?.name || '',
        }));

        // Fetch all logins
        const loginData = await notionPost(`/databases/${LOGINS_DB}/query`, {
          sorts: [{ property: "Name", direction: "ascending" }],
          page_size: 100
        });
        const logins = (loginData.results || []).map(l => {
          const props = l.properties;
          // Platform relation — Notion API returns [{id: "uuid-with-dashes"}]
          const platformRelation = props.Platform?.relation || [];
          const campaignRelation = props.Campaign?.relation || [];
          const platformRaw = platformRelation.length > 0 ? (platformRelation[0].id || '') : '';
          const campaignRaw = campaignRelation.length > 0 ? (campaignRelation[0].id || '') : '';
          return {
            id: l.id.replace(/-/g, ''),
            name: props.Name?.title?.map(t => t.plain_text).join('') || '',
            platformId: platformRaw.replace(/-/g, ''),
            campaignId: campaignRaw.replace(/-/g, ''),
            accountUrl: props['Account URL']?.url || '',
            username: props.Username?.rich_text?.map(t => t.plain_text).join('') || '',
            status: props.Status?.select?.name || '',
          };
        });

        // Build a platform lookup by ID for name resolution
        const platformById = {};
        platforms.forEach(p => { platformById[p.id.replace(/-/g,'')] = p; });

        // Parse login names "Platform × Campaign" and resolve site from campaign relation
        // Build campaign lookup from Campaigns DB for site info
        const campaignData = await notionPost(`/databases/${"5e9f152a-bd65-4776-a81a-b6e85980cc41"}/query`, {
          page_size: 100
        });
        const campaignById = {};
        (campaignData.results || []).forEach(c => {
          const id = c.id.replace(/-/g,'');
          campaignById[id] = {
            name: c.properties.Name?.title?.map(t=>t.plain_text).join('') || '',
            site: c.properties.site?.select?.name || ''
          };
        });

        // Parse each login — use platform relation for grouping, campaign relation for site
        const parsed = logins.map(l => {
          const platformInfo = platformById[l.platformId] || {};
          const platformName = platformInfo.name || 'Other';
          const platformUrl = platformInfo.url || '';
          const campaignInfo = campaignById[l.campaignId] || {};
          const campaignName = campaignInfo.name || l.name;
          const site = campaignInfo.site || 'Other';
          return { ...l, platformName, platformUrl, campaignName, site };
        });

        // Sort by platform → site → campaign
        parsed.sort((a, b) => {
          const p = a.platformName.localeCompare(b.platformName);
          if (p !== 0) return p;
          const s = a.site.localeCompare(b.site);
          if (s !== 0) return s;
          return a.campaignName.localeCompare(b.campaignName);
        });

        // Group by platform
        const platformMap = {};
        parsed.forEach(l => {
          if (!platformMap[l.platformName]) platformMap[l.platformName] = [];
          platformMap[l.platformName].push(l);
        });

        const grouped = Object.keys(platformMap).sort().map(platformName => ({
          platformName,
          logins: platformMap[platformName]
        }));

        return json({ campaigns: grouped });
      }

      if (action === "getWeeklySchedule") {
        // Fetch all campaigns with a Schedule Day set
        const data = await notionPost(`/databases/${"087b1163b4e64975bc7a4b686ff801de"}/query`, {
          filter: {
            property: "Schedule Day",
            select: { is_not_empty: true }
          },
          page_size: 100
        });

        const campaigns = (data.results || []).map(c => {
          const props = c.properties;
          return {
            id: c.id.replace(/-/g,''),
            name: props.Name?.title?.map(t=>t.plain_text).join('') || '',
            site: props.site?.select?.name || '',
            status: props.Status?.select?.name || '',
            day: props['Schedule Day']?.select?.name || '',
            time: props['Schedule Time']?.rich_text?.map(t=>t.plain_text).join('') || '',
          };
        });

        // Build ordered 7-day window starting from today
        const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const today = new Date();
        const todayIdx = today.getDay(); // 0=Sun, 1=Mon...

        // Build 7 days in order starting from today
        const week = [];
        for (let i = 0; i < 7; i++) {
          const dayIdx = (todayIdx + i) % 7;
          const dayName = days[dayIdx];
          const dayCampaigns = campaigns
            .filter(c => c.day === dayName)
            .sort((a,b) => (a.time||'').localeCompare(b.time||''));
          if (dayCampaigns.length > 0) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const label = i === 0 ? 'Today — ' + dayName
              : i === 1 ? 'Tomorrow — ' + dayName
              : dayName;
            week.push({ day: dayName, label, date: date.toLocaleDateString('en-US', {month:'short', day:'numeric'}), campaigns: dayCampaigns });
          }
        }

        return json({ week });
      }

      if (action === "getAllCampaigns") {
        const data = await notionPost(`/databases/${CAMPAIGNS_DB}/query`, {
          sorts: [
            { property: "site", direction: "ascending" },
            { property: "Name", direction: "ascending" }
          ],
          page_size: 100
        });
        const all = (data.results || []).map(c => ({
          id: c.id.replace(/-/g,''),
          name: c.properties.Name?.title?.map(t=>t.plain_text).join('') || '',
          site: c.properties.site?.select?.name || 'Other',
          status: c.properties.Status?.select?.name || '',
        }));
        // Group by site
        const siteMap = {};
        all.forEach(c => {
          if (!siteMap[c.site]) siteMap[c.site] = [];
          siteMap[c.site].push(c);
        });
        const sites = Object.keys(siteMap).sort().map(site => ({
          site,
          campaigns: siteMap[site]
        }));
        return json({ sites });
      }

      if (action === "getMethods") {
        const data = await notionPost(`/databases/${METHODS_DB}/query`, {
          sorts: [
            { property: "Type", direction: "ascending" },
            { property: "Name", direction: "ascending" }
          ],
          page_size: 100
        });
        const methods = (data.results || []).map(m => ({
          id: m.id.replace(/-/g,''),
          name: m.properties.Name?.title?.map(t=>t.plain_text).join('') || '',
          type: m.properties.Type?.select?.name || 'Other',
          platform: m.properties.Platform?.select?.name || '',
          notes: m.properties.Notes?.rich_text?.map(t=>t.plain_text).join('') || '',
        }));
        return json({ methods });
      }

      if (action === "getProducts") {
        const data = await notionPost(`/databases/${PRODUCTS_DB}/query`, {
          sorts: [
            { property: "Site", direction: "ascending" },
            { property: "Name", direction: "ascending" }
          ],
          page_size: 100
        });
        const products = (data.results || []).map(p => {
          const props = p.properties;
          const campaignRollup = props['Campaign Name']?.rollup?.array || [];
          const campaignName = campaignRollup.map(r => r.title?.map(t=>t.plain_text).join('')).filter(Boolean).join(', ');
          return {
            id: p.id.replace(/-/g,''),
            name: props.Name?.title?.map(t=>t.plain_text).join('') || '',
            description: props.Description?.rich_text?.map(t=>t.plain_text).join('') || '',
            price: props.Price?.rich_text?.map(t=>t.plain_text).join('') || '',
            site: props.Site?.select?.name || '',
            status: props.Status?.select?.name || '',
            campaign: campaignName,
            url: props['URL']?.url || '',
          };
        });

        // Group by site then campaign
        const siteMap = {};
        products.forEach(p => {
          if (!siteMap[p.site]) siteMap[p.site] = {};
          const camp = p.campaign || 'General';
          if (!siteMap[p.site][camp]) siteMap[p.site][camp] = [];
          siteMap[p.site][camp].push(p);
        });

        const grouped = Object.keys(siteMap).sort().map(site => ({
          site,
          campaigns: Object.keys(siteMap[site]).sort().map(campaign => ({
            campaign,
            products: siteMap[site][campaign]
          }))
        }));

        return json({ sites: grouped });
      }

      if (action === "testDbs") {
        const p = await notionPost(`/databases/${PLATFORMS_DB}/query`, { page_size: 3 });
        const l = await notionPost(`/databases/${LOGINS_DB}/query`, { page_size: 3 });
        return json({
          platforms: { count: p.results?.length, error: p.message, ids: p.results?.map(r=>r.id) },
          logins: { count: l.results?.length, error: l.message, ids: l.results?.map(r=>r.id) }
        });
      }


      if (action === "getHealthSchedule") {
        const data = await notionPost(`/databases/${MAIN_TD_DB_ID}/query`, {
          filter: {
            and: [
              { property: "priority", multi_select: { contains: "daily household" } },
              { property: "Schedule Day", select: { is_not_empty: true } }
            ]
          },
          page_size: 100
        });
        const todos = (data.results || []).map(c => {
          const props = c.properties;
          return {
            id: c.id.replace(/-/g,''),
            name: props.Name?.title?.map(t=>t.plain_text).join('') || '',
            day: props['Schedule Day']?.select?.name || '',
            time: props['Schedule Time']?.rich_text?.map(t=>t.plain_text).join('') || '',
          };
        });
        const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const today = new Date();
        const todayIdx = today.getDay();
        const week = [];
        for (let i = 0; i < 7; i++) {
          const dayIdx = (todayIdx + i) % 7;
          const dayName = days[dayIdx];
          const dayTodos = todos
            .filter(t => t.day === dayName)
            .sort((a,b) => (a.time||'').localeCompare(b.time||''));
          if (dayTodos.length > 0) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const label = i === 0 ? 'Today — ' + dayName
              : i === 1 ? 'Tomorrow — ' + dayName
              : dayName;
            week.push({ day: dayName, label, date: date.toLocaleDateString('en-US', {month:'short', day:'numeric'}), todos: dayTodos });
          }
        }
        return json({ week });
      }

      // ── MICROSITE: getResearch ──
      if (action === "getResearch") {
        const { campaignId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const [results, campResp] = await Promise.all([
          notionPost(`/databases/${RESEARCH_DB}/query`, { filter: { property: "Campaign", relation: { contains: dashId(campaignId) } } }),
          notionGet(`/pages/${dashId(campaignId)}`).catch(() => null),
        ]);
        if (!results.results?.length) return json({ research: null });
        const props = results.results[0].properties;
        const cp = campResp?.properties || {};
        return json({ research: {
          id: results.results[0].id.replace(/-/g,""),
          name: props.Name?.title?.map(t=>t.plain_text).join("") || "",
          status: props.Status?.select?.name || "",
          lastUpdated: props["date:Last Updated:start"]?.date?.start || "",
          keywords: props.Keywords?.rich_text?.map(t=>t.plain_text).join("") || "",
          newsFeed: props["News Feed"]?.rich_text?.map(t=>t.plain_text).join("") || "",
          notes: props.Notes?.rich_text?.map(t=>t.plain_text).join("") || "",
          platforms: props["Platforms & Methods"]?.rich_text?.map(t=>t.plain_text).join("") || "",
          productIdeas: props["Product Ideas"]?.rich_text?.map(t=>t.plain_text).join("") || "",
          tiktokTrends: props["TikTok Trends"]?.rich_text?.map(t=>t.plain_text).join("") || "",
          webPageUrl: props["Web Page URL"]?.url || "",
          campaignGoal: cp["Campaign Goal"]?.rich_text?.map(t=>t.plain_text).join("") || "",
          painPoints: cp["Pain Points"]?.rich_text?.map(t=>t.plain_text).join("") || "",
          keyMessage: cp["Key Message"]?.rich_text?.map(t=>t.plain_text).join("") || "",
        }});
      }

      // ── MICROSITE: condense via Claude ──
      if (action === "condense") {
        const { label, text } = body;
        if (!text) return json({ text: "" });
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 500,
            system: `You are a content ops assistant. Rewrite the input as structured entries.\n\nFORMAT — each entry on its own line:\nHEADING: body text\n\nRules:\n- HEADING is 2-4 words, ALL CAPS\n- Body text is the actionable insight, max 20 words\n- Total words per entry must not exceed 30\n- No bullets, no dashes, no markdown, no preamble\n- 3 to 6 entries total\n- Output only the entries, nothing else`,
            messages: [{ role: "user", content: (label || "") + ":\n" + text }]
          })
        });
        const data = await resp.json();
        return json({ text: data.content?.[0]?.text || "" });
      }

      // ── MICROSITE: updateResearch ──
      if (action === "updateResearch") {
        const { researchId, field, value } = body;
        if (!researchId || !field) return json({ error: "researchId and field required" }, 400);
        const fieldMap = { productIdeas: "Product Ideas", notes: "Notes", platforms: "Platforms & Methods", tiktokTrends: "TikTok Trends", newsFeed: "News Feed" };
        const notionField = fieldMap[field];
        if (!notionField) return json({ error: "Unknown field: " + field }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const result = await notionPatch(`/pages/${dashId(researchId)}`, { properties: { [notionField]: { rich_text: [{ type: "text", text: { content: value || "" } }] } } });
        if (result.object === "error") return json({ error: result.message }, 400);
        return json({ success: true });
      }

      // ── MICROSITE: updateCampaignKeywords ──
      if (action === "updateCampaignKeywords") {
        const { campaignId, value } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const result = await notionPatch(`/pages/${dashId(campaignId)}`, { properties: { Keywords: { rich_text: [{ type: "text", text: { content: value || "" } }] } } });
        if (result.object === "error") return json({ error: result.message }, 400);
        return json({ success: true });
      }

      // ── MICROSITE: updateCampaignField ──
      if (action === "updateCampaignField") {
        const { campaignId, field, value } = body;
        if (!campaignId || !field) return json({ error: "campaignId and field required" }, 400);
        const allowed = { keyMessage: "Key Message", painPoints: "Pain Points", campaignGoal: "Campaign Goal" };
        const notionField = allowed[field];
        if (!notionField) return json({ error: "Unknown field: " + field }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const result = await notionPatch(`/pages/${dashId(campaignId)}`, { properties: { [notionField]: { rich_text: [{ type: "text", text: { content: value || "" } }] } } });
        if (result.object === "error") return json({ error: result.message }, 400);
        return json({ success: true });
      }

      // ── MICROSITE: getCampaignTodos ──
      if (action === "getCampaignTodos") {
        const { campaignId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const campPage = await notionGet(`/pages/${dashId(campaignId)}`);
        const todoIds = (campPage.properties?.["Associated To Do"]?.relation || []).map(r => r.id.replace(/-/g,""));
        if (!todoIds.length) return json({ todos: [] });
        const todos = await Promise.all(todoIds.map(async id => {
          try {
            const p = await notionGet(`/pages/${dashId(id)}`);
            const name = p.properties?.Title?.title?.map(t=>t.plain_text).join("") || "Untitled";
            return { id, name };
          } catch { return null; }
        }));
        return json({ todos: todos.filter(Boolean) });
      }

      // ── MICROSITE: createTodo ──
      if (action === "createTodo") {
        const { name, campaignId } = body;
        if (!name) return json({ error: "name required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const created = await notionPost("/pages", { parent: { database_id: MAIN_TD_DB_ID }, properties: { Title: { title: [{ type: "text", text: { content: name } }] } } });
        if (created.object === "error") return json({ error: created.message }, 400);
        const newId = created.id.replace(/-/g,"");
        if (campaignId) {
          const campPage = await notionGet(`/pages/${dashId(campaignId)}`);
          const existing = (campPage.properties?.["Associated To Do"]?.relation || []).map(r => ({ id: r.id }));
          existing.push({ id: dashId(newId) });
          await notionPatch(`/pages/${dashId(campaignId)}`, { properties: { "Associated To Do": { relation: existing } } });
        }
        return json({ success: true, id: newId, name });
      }

      // ── MICROSITE: unlinkTodoFromCampaign ──
      if (action === "unlinkTodoFromCampaign") {
        const { campaignId, todoId } = body;
        if (!campaignId || !todoId) return json({ error: "campaignId and todoId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const campPage = await notionGet(`/pages/${dashId(campaignId)}`);
        const existing = (campPage.properties?.["Associated To Do"]?.relation || []).map(r => ({ id: r.id }));
        const updated = existing.filter(r => r.id.replace(/-/g,"") !== todoId);
        await notionPatch(`/pages/${dashId(campaignId)}`, { properties: { "Associated To Do": { relation: updated } } });
        return json({ success: true });
      }

      // ── HERMES: getDevTitles ──
      if (action === "getDevTitles") {
        const data = await notionPost(`/databases/${CONTENT_STRATEGY_DB}/query`, {
          filter: { property: "Status", select: { does_not_equal: "Delete" } },
          sorts: [{ property: "Sequence Order", direction: "ascending" }],
          page_size: 100
        });
        const campData = await notionPost(`/databases/${CAMPAIGNS_DB}/query`, { page_size: 100 });
        const campById = {};
        (campData.results || []).forEach(c => {
          campById[c.id.replace(/-/g,'')] = {
            name: c.properties.Name?.title?.map(t=>t.plain_text).join('') || '',
            site: c.properties.site?.select?.name || '',
            siteUrl: c.properties['Campaign Page']?.url || '',
          };
        });
        const STATUS_RANK = { Development:0, Writing:0, Review:1, Approved:1, Explode:1, Publish:2, Published:3, Done:3 };
        const campMap = {};
        (data.results || []).forEach(t => {
          const props = t.properties;
          const campRel = props.Campaign?.relation || [];
          const campId = campRel[0]?.id?.replace(/-/g,'') || 'unknown';
          const camp = campById[campId] || { name: 'Unknown', site: '', siteUrl: '' };
          const stage = props.Status?.select?.name || '';
          if (!campMap[campId]) campMap[campId] = { campId, name: camp.name, site: camp.site, siteUrl: camp.siteUrl, titles: [], devCount: 0, pubCount: 0, prodCount: 0 };
          campMap[campId].titles.push({
            id: t.id.replace(/-/g,''),
            title: props.Title?.title?.map(x=>x.plain_text).join('') || 'Untitled',
            stage,
            grouping: props.Grouping?.rich_text?.map(x=>x.plain_text).join('') || '',
          });
          if (['Development','Writing','Review','Approved','Explode'].includes(stage)) campMap[campId].devCount++;
          if (['Publish','Published','Done'].includes(stage)) campMap[campId].pubCount++;
        });
        const campaigns = Object.values(campMap).sort((a,b) => b.devCount - a.devCount);
        return json({ campaigns });
      }

      // ── HERMES: createDevTitle ──
      if (action === "createDevTitle") {
        const { title, campaignId, status, grouping } = body;
        if (!title) return json({ error: "title required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const props = {
          Title: { title: [{ type: "text", text: { content: title } }] },
          Status: { select: { name: status || "Development" } },
        };
        if (grouping) props["Grouping"] = { rich_text: [{ type: "text", text: { content: grouping } }] };
        if (campaignId) props["Campaign"] = { relation: [{ id: dashId(campaignId) }] };
        const result = await notionPost("/pages", { parent: { database_id: CONTENT_STRATEGY_DB }, properties: props });
        if (result.object === "error") return json({ error: result.message }, 400);
        return json({ success: true, id: result.id.replace(/-/g,"") });
      }

      // ── HERMES: deleteTitle ──
      if (action === "deleteTitle") {
        const { titleId } = body;
        if (!titleId) return json({ error: "titleId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const result = await notionPatch(`/pages/${dashId(titleId)}`, { archived: true });
        if (result.object === "error") return json({ error: result.message }, 400);
        return json({ success: true });
      }

      // ── HERMES: createProduct ──
      if (action === "createProduct") {
        const { title, status, campaignId } = body;
        if (!title) return json({ error: "title required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const props = { Name: { title: [{ type: "text", text: { content: title } }] }, Status: { select: { name: status || "Active" } } };
        const result = await notionPost("/pages", { parent: { database_id: PRODUCTS_DB }, properties: props });
        if (result.object === "error") return json({ error: result.message }, 400);
        return json({ success: true, id: result.id.replace(/-/g,"") });
      }

      // ── HERMES: createCampaign ──
      if (action === "createCampaign") {
        const { name, site, grouping } = body;
        if (!name) return json({ error: "name required" }, 400);
        const props = { Name: { title: [{ type: "text", text: { content: name } }] }, Status: { select: { name: "Planning" } } };
        if (site) props["site"] = { select: { name: site } };
        if (grouping?.length) props["Grouping"] = { multi_select: grouping.map(g => ({ name: g })) };
        const result = await notionPost("/pages", { parent: { database_id: CAMPAIGNS_DB }, properties: props });
        if (result.object === "error") return json({ error: result.message }, 400);
        return json({ success: true, id: result.id.replace(/-/g,""), name });
      }

      // ── HERMES: createTdItem ──
      if (action === "createTdItem") {
        const { title, grouping } = body;
        if (!title) return json({ error: "title required" }, 400);
        const result = await notionPost("/pages", { parent: { database_id: MAIN_TD_DB_ID }, properties: { Title: { title: [{ type: "text", text: { content: title } }] }, priority: { multi_select: [{ name: grouping || "high" }] } } });
        if (result.object === "error") return json({ error: result.message }, 400);
        return json({ success: true, id: result.id.replace(/-/g,"") });
      }

      // ── HERMES: deleteTdItem ──
      if (action === "deleteTdItem") {
        const { itemId } = body;
        if (!itemId) return json({ error: "itemId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/blocks/${dashId(itemId)}`, { method: "DELETE", headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION } });
        if (!resp.ok) { const r = await resp.json(); return json({ error: r.message || "Delete failed" }, resp.status); }
        return json({ success: true });
      }

      // ── HERMES: getTdItems ──
      if (action === "getTdItems") {
        const data = await notionPost(`/databases/${MAIN_TD_DB_ID}/query`, {
          filter: { or: [{ property: "priority", multi_select: { contains: "get" } }, { property: "priority", multi_select: { contains: "got" } }, { property: "priority", multi_select: { contains: "daily content" } }, { property: "priority", multi_select: { contains: "daily household" } }, { property: "priority", multi_select: { contains: "done" } }] },
          sorts: [{ property: "Title", direction: "ascending" }],
          page_size: 100
        });
        const items = (data.results || []).map(t => ({ id: t.id.replace(/-/g,""), name: t.properties.Title?.title?.map(x=>x.plain_text).join("") || "Untitled", priority: t.properties.priority?.multi_select?.map(s=>s.name) || [] }));
        return json({ items });
      }

      // ── HERMES: updateTdPriority ──
      if (action === "updateTdPriority") {
        const { itemId, priority } = body;
        if (!itemId) return json({ error: "itemId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const result = await notionPatch(`/pages/${dashId(itemId)}`, { properties: { priority: { multi_select: (priority || []).map(name => ({ name })) } } });
        if (result.object === "error") return json({ error: result.message }, 400);
        return json({ success: true });
      }

      // ── HERMES: searchTodos ──
      if (action === "searchTodos") {
        const { query } = body;
        const data = await notionPost(`/databases/${MAIN_TD_DB_ID}/query`, { sorts: [{ property: "Title", direction: "ascending" }], page_size: 100 });
        const todos = (data.results || []).map(t => ({ id: t.id.replace(/-/g,""), name: t.properties.Title?.title?.map(x=>x.plain_text).join("") || "Untitled" })).filter(t => !query || t.name.toLowerCase().includes(query.toLowerCase()));
        return json({ todos: todos.slice(0, 50) });
      }

      // ── HERMES: searchMethods ──
      if (action === "searchMethods") {
        const { query } = body;
        const data = await notionPost(`/databases/${METHODS_DB}/query`, { sorts: [{ property: "Name", direction: "ascending" }], page_size: 100 });
        const methods = (data.results || []).map(m => ({ id: m.id.replace(/-/g,""), name: m.properties.Name?.title?.map(x=>x.plain_text).join("") || "Untitled" })).filter(m => !query || m.name.toLowerCase().includes(query.toLowerCase()));
        return json({ methods: methods.slice(0, 50) });
      }

      // ── HERMES: searchLogins ──
      if (action === "searchLogins") {
        const { query } = body;
        const data = await notionPost(`/databases/${LOGINS_DB}/query`, { sorts: [{ property: "Name", direction: "ascending" }], page_size: 100 });
        const logins = (data.results || []).map(l => ({ id: l.id.replace(/-/g,""), name: l.properties.Name?.title?.map(x=>x.plain_text).join("") || "Untitled", status: l.properties.Status?.select?.name || "" })).filter(l => !query || l.name.toLowerCase().includes(query.toLowerCase()));
        return json({ logins: logins.slice(0, 50) });
      }

      // ── HERMES: getPlatforms ──
      if (action === "getPlatforms") {
        const data = await notionPost(`/databases/${PLATFORMS_DB}/query`, { sorts: [{ property: "Name", direction: "ascending" }], page_size: 100 });
        return json({ platforms: (data.results || []).map(p => ({ id: p.id.replace(/-/g,""), name: p.properties.Name?.title?.map(t=>t.plain_text).join("") || "" })) });
      }

      // ── HERMES: getProductStatuses ──
      if (action === "getProductStatuses") {
        return json({ statuses: ["Active","In Development","Research","Paused","Archived"] });
      }

      // ── HERMES: getGroupingOptions ──
      if (action === "getGroupingOptions") {
        return json({ options: ["Group 1","Group 2","Group 3","Group 4","content machines","mm","content machine","blogging","music","method","leadgen","construction","digital products","crunch","app","products","product","digital product","deprecate","fundraising","methods","Del","this week"] });
      }

      // ── HERMES: updateKeyMessage ──
      if (action === "updateKeyMessage") {
        const { campaignId, keyMessage } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const result = await notionPatch(`/pages/${dashId(campaignId)}`, { properties: { "Key Message": { rich_text: [{ type: "text", text: { content: keyMessage || "" } }] } } });
        if (result.object === "error") return json({ error: result.message }, 400);
        return json({ success: true });
      }

      // ── HERMES: updateCampaignName ──
      if (action === "updateCampaignName") {
        const { campaignId, name } = body;
        if (!campaignId || !name) return json({ error: "campaignId and name required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const result = await notionPatch(`/pages/${dashId(campaignId)}`, { properties: { "Name": { title: [{ type: "text", text: { content: name } }] } } });
        if (result.object === "error") return json({ error: result.message }, 400);
        return json({ success: true });
      }

      // ── HERMES: updateCampaignStatus ──
      if (action === "updateCampaignStatus") {
        const { campaignId, status } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const result = await notionPatch(`/pages/${dashId(campaignId)}`, { properties: { "Status": { select: { name: status } } } });
        if (result.object === "error") return json({ error: result.message }, 400);
        return json({ success: true });
      }

      // ── HERMES: updateGrouping ──
      if (action === "updateGrouping") {
        const { campaignId, grouping } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const result = await notionPatch(`/pages/${dashId(campaignId)}`, { properties: { "Grouping": { multi_select: (grouping || []).map(g => ({ name: g })) } } });
        if (result.object === "error") return json({ error: result.message }, 400);
        return json({ success: true });
      }

      // ── HERMES: updateCampaignProducts ──
      if (action === "updateCampaignProducts") {
        const { campaignId, productIds } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const result = await notionPatch(`/pages/${dashId(campaignId)}`, { properties: { "Products": { relation: (productIds||[]).map(id => ({ id: dashId(id) })) } } });
        if (result.object === "error") return json({ error: result.message }, 400);
        return json({ success: true });
      }

      // ── HERMES: updateCampaignMethods ──
      if (action === "updateCampaignMethods") {
        const { campaignId, methodIds } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const result = await notionPatch(`/pages/${dashId(campaignId)}`, { properties: { "Methods": { relation: (methodIds||[]).map(id => ({ id: dashId(id) })) } } });
        if (result.object === "error") return json({ error: result.message }, 400);
        return json({ success: true });
      }

      // ── HERMES: updateCampaignPlatforms ──
      if (action === "updateCampaignPlatforms") {
        const { campaignId, platformIds } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const result = await notionPatch(`/pages/${dashId(campaignId)}`, { properties: { "Platforms": { relation: (platformIds||[]).map(id => ({ id: dashId(id) })) } } });
        if (result.object === "error") return json({ error: result.message }, 400);
        return json({ success: true });
      }

      // ── HERMES: updateCampaignLogins ──
      if (action === "updateCampaignLogins") {
        const { campaignId, loginIds } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const result = await notionPatch(`/pages/${dashId(campaignId)}`, { properties: { "Logins": { relation: (loginIds||[]).map(id => ({ id: dashId(id) })) } } });
        if (result.object === "error") return json({ error: result.message }, 400);
        return json({ success: true });
      }

      // ── HERMES: updateCampaignTodos ──
      if (action === "updateCampaignTodos") {
        const { campaignId, todoIds } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const result = await notionPatch(`/pages/${dashId(campaignId)}`, { properties: { "Associated To Do": { relation: (todoIds||[]).map(id => ({ id: dashId(id) })) } } });
        if (result.object === "error") return json({ error: result.message }, 400);
        return json({ success: true });
      }

      // ── HERMES: updateProductStatus ──
      if (action === "updateProductStatus") {
        const { productId, status } = body;
        if (!productId) return json({ error: "productId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const result = await notionPatch(`/pages/${dashId(productId)}`, { properties: { "Status": { select: { name: status } } } });
        if (result.object === "error") return json({ error: result.message }, 400);
        return json({ success: true });
      }

      // ── HERMES: getAssetsByCampaign ──
      if (action === "getAssetsByCampaign") {
        const { campaignId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const data = await notionPost(`/databases/${ASSETS_DB}/query`, {
          filter: { property: "Campaign", relation: { contains: dashId(campaignId) } },
          page_size: 100
        });
        const assets = (data.results || []).map(a => ({ id: a.id.replace(/-/g,""), title: a.properties["Asset Title"]?.title?.map(t=>t.plain_text).join("") || "Untitled", type: a.properties["Asset Type"]?.select?.name || "", status: a.properties["Asset Status"]?.select?.name || "", siteUrl: a.properties["Site URL"]?.url || "" }));
        return json({ assets });
      }

      // ── HERMES: getTitleAssets ──
      if (action === "getTitleAssets") {
        const { titleId } = body;
        if (!titleId) return json({ error: "titleId required" }, 400);
        const assets = await getAssetsByTitle(titleId);
        return json({ assets });
      }

      return json({ error:"Unknown action" }, 400);
    } catch(err) {
      return json({ error:err.message }, 500);
    }
  }
};
