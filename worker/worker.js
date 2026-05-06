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
    const name = props.Title?.title?.map(t=>t.plain_text).join("") || props.Name?.title?.map(t=>t.plain_text).join("") || "Untitled";
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
    NOTION_TOKEN = env.NOTION_TOKEN;
    ADMIN_PIN = env.ADMIN_PIN;
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
        const siteName = SITE_DB_NAMES[siteKey];
        if (!siteName) return json({ error:"Unknown site key" }, 400);
        const campaigns = await getCampaigns(siteName);
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
        // Fetch all campaigns for lookup
        const campData = await notionPost(`/databases/${"5e9f152a-bd65-4776-a81a-b6e85980cc41"}/query`, { page_size: 100 });
        const campById = {};
        (campData.results || []).forEach(c => {
          campById[c.id.replace(/-/g,'')] = {
            name: c.properties.Name?.title?.map(t=>t.plain_text).join('') || '',
            site: c.properties.site?.select?.name || c.properties.Site?.select?.name || '',
          };
        });

        const data = await notionPost(`/databases/${CONTENT_STRATEGY_DB}/query`, {
          filter: { property:"Status", select:{ equals:"Publish" } },
          sorts: [{ property:"Sequence Order", direction:"ascending" }],
          page_size: 100
        });
        const titles = (data.results || []).map(page => {
          const props = page.properties;
          const campaignRel = props.Campaign?.relation || [];
          const campId = campaignRel.length > 0 ? campaignRel[0].id.replace(/-/g,'') : '';
          const campInfo = campById[campId] || {};
          return {
            id: page.id.replace(/-/g,''),
            title: props.Title?.title?.map(t=>t.plain_text).join('') || 'Untitled',
            stage: props.Status?.select?.name || '',
            scheduled: props['Scheduled Date']?.date?.start || '',
            campaign: campInfo.name || '',
            site: campInfo.site || props.Site?.rollup?.array?.map(r=>r.select?.name).filter(Boolean).join('') || '',
          };
        });
        titles.sort((a,b) => {
          const s = (a.site||'zzz').localeCompare(b.site||'zzz');
          if (s !== 0) return s;
          return (a.campaign||'zzz').localeCompare(b.campaign||'zzz');
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
      if (action === "markPublished") {
        const { assetId } = body;
        if (!assetId) return json({ error: 'assetId required' }, 400);
        await notionPatch(`/pages/${assetId}`, {
          properties: {
            "Asset Status": { select: { name: "Published" } }
          }
        });
        return json({ success: true });
      }

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
              Title: { title: [{ type: "text", text: { content: name } }] },
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
            name: props.Title?.title?.map(t=>t.plain_text).join('') || props.Name?.title?.map(t=>t.plain_text).join('') || '',
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

      return json({ error:"Unknown action" }, 400);
    } catch(err) {
      return json({ error:err.message }, 500);
    }
  }
};
