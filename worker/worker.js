const NOTION_TOKEN       = "ntn_i84528099155pTq2P4dwUSpqmZYBpTSsL0qFB9GsQP6bc4";
const NOTION_VERSION     = "2022-06-28";
const CAMPAIGNS_DB       = "087b1163b4e64975bc7a4b686ff801de";
const CONTENT_STRATEGY_DB = "9fa5f42f010b47e7a82032607e07d6a1";
const PRODUCTS_DB        = "e92fcfce75fc4f54b553df0b7672ff48";
const MAIN_TD_DB         = "3471f7d3a4bb80de87c1d9e850f4a426";
const METHODS_DB         = "285ed0b668be4dad89dfd090350096bc";
const LOGINS_DB          = "72d262278a4c4786b375959432fdd82a";
const PLATFORMS_DB       = "edc19791957542f2a6637127756720e8";
const ASSETS_DB          = "e91bdb6e770b4d298e9f62166a0fd5de";
const RESEARCH_DB        = "557e6b7b8c434a578d45ecb0a8329f63";
const PIN                = "1246";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function notionQuery(dbId, body) {
  const resp = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: "POST",
    headers: {
      "Authorization":  `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type":   "application/json",
    },
    body: JSON.stringify({ page_size: 100, ...body }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || "Notion error");
  return data.results || [];
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
    const rnotes = r.properties.Notes?.rich_text?.map(x => x.plain_text).join("") || "";
    (r.properties.Campaign?.relation || []).forEach(c => {
      const cid = c.id.replace(/-/g,"");
      campaignToResearch[cid] = { id: rid, name: rname, notes: rnotes };
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
  todoRows.forEach(t => {
    todoById[t.id.replace(/-/g,"")] = t.properties.Title?.title?.map(x => x.plain_text).join("") || "Untitled";
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

  // Count dev titles per campaign id
  const devCount = {};
  titleRows.forEach(t => {
    if (t.properties.Status?.select?.name !== "Development") return;
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
      siteUrl:          campaignToSiteUrl[id] || null,
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
      campaignPage: c.properties["Campaign Page"]?.url || null,
      devTitles:  devCount[id]  || 0,
      pubTitles:  pubCount[id]  || 0,
      pubTitleData: pubTitleMap[id] || [],
      products:   prodCount[id] || 0,
    };
  });

  return campaigns;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method === "GET")      return json({ status: "ok", version: "2026-05-18-01" });
    if (request.method !== "POST")    return json({ error: "POST only" }, 405);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Invalid JSON" }, 400); }

    if (body.pin !== PIN) return json({ error: "Unauthorized" }, 401);

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
          const camp    = campById[campId] || { name: "ΓÇö", site: "Other" };

          if (!campTitles[campId]) campTitles[campId] = { name: camp.name, site: camp.site, titles: [] };
          campTitles[campId].titles.push({ id, title, status, grouping: props.Grouping?.rich_text?.map(x => x.plain_text).join("") || "" });
        });

        // Add all campaigns ΓÇö even those with no titles
        Object.entries(campById).forEach(([campId, camp]) => {
          if (!campTitles[campId]) campTitles[campId] = { name: camp.name, site: camp.site, titles: [] };
        });

        const campaigns = Object.entries(campTitles).map(([campId, camp]) => {
          const devCount  = camp.titles.filter(t => t.status === "Development").length;
          const pubCount  = camp.titles.filter(t => t.status === "Publish").length;
          const prodCount = activeProdCount[campId] || 0;
          const STATUS_RANK = { "Development": 0, "Publish": 1 };
          camp.titles.sort((a, b) => (STATUS_RANK[a.status] ?? 2) - (STATUS_RANK[b.status] ?? 2));
          return { campId, name: camp.name, site: camp.site, titles: camp.titles, devCount, pubCount, prodCount };
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
        const { title } = body;
        if (!title) return json({ error: "title required" }, 400);
        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({
            parent: { database_id: PLATFORMS_DB },
            properties: { Name: { title: [{ type: "text", text: { content: title } }] } }
          }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
        return json({ success: true, id: result.id.replace(/-/g,""), name: title });
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
              const p = a.properties || {};
              return {
                id: assetId,
                title: p["Asset Title"]?.title?.map(t=>t.plain_text).join("") || "Untitled",
                platform: p["Platform Name"]?.select?.name || "",
                type: p["Asset Type"]?.select?.name || "",
                status: p["Asset Status"]?.select?.name || "",
              };
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
        try {
          const titles = await Promise.all(pubTitleData.map(async t => {
            const assets = await Promise.all((t.assetIds || []).map(async assetId => {
              try {
                const resp = await fetch("https://api.notion.com/v1/pages/" + dash(assetId), {
                  headers: { "Authorization": "Bearer " + NOTION_TOKEN, "Notion-Version": NOTION_VERSION }
                });
                const a = await resp.json();
                const p = a.properties || {};
                return {
                  id: assetId,
                  assetTitle: p["Asset Title"]?.title?.map(x=>x.plain_text).join("") || "Untitled",
                  platform: p["Platform Name"]?.select?.name || "",
                  type: p["Asset Type"]?.select?.name || "",
                  status: p["Asset Status"]?.select?.name || "",
                };
              } catch(e) { return null; }
            }));
            return { title: t.title, assets: assets.filter(Boolean) };
          }));
          return json({ titles });
        } catch(e) {
          return json({ error: e.message, titles: [] });
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
            name: c.properties.Name?.title?.map(t => t.plain_text).join("") || "Untitled",
            site: c.properties.site?.select?.name || "Other",
          };
        });

        const campaignIds = new Set(Object.keys(campById));

        const products = productRows.map(p => {
          const props = p.properties;
          const id = p.id.replace(/-/g, "");

          // Find campaign via the "Campaigns" relation property
          let campaignName = "";
          let site = props.Site?.select?.name || "";
          const campRel = props["Campaigns"]?.relation || [];
          campRel.forEach(r => {
            const rid = r.id.replace(/-/g, "");
            if (campaignIds.has(rid)) {
              campaignName = campById[rid].name;
              if (!site) site = campById[rid].site;
            }
          });

          return {
            id,
            name:     props.Name?.title?.map(t => t.plain_text).join("") || "Untitled",
            campaign: campaignName,
            site,
            status:   props.Status?.select?.name || "",
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

      // ΓöÇΓöÇ CAMPAIGN ADMIN: getTitles ΓöÇΓöÇ
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

      // ΓöÇΓöÇ CAMPAIGN ADMIN: getTodos ΓöÇΓöÇ
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

      // ΓöÇΓöÇ CAMPAIGN ADMIN: getExplodeQueue ΓöÇΓöÇ
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

      // ΓöÇΓöÇ CAMPAIGN ADMIN: getChildren (Notion page children) ΓöÇΓöÇ
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

      // ΓöÇΓöÇ CAMPAIGN ADMIN: getResearch ΓöÇΓöÇ
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
            platforms: props["Platforms & Methods"]?.rich_text?.map(t => t.plain_text).join("") || "",
            productIdeas: props["Product Ideas"]?.rich_text?.map(t => t.plain_text).join("") || "",
            tiktokTrends: props["TikTok Trends"]?.rich_text?.map(t => t.plain_text).join("") || "",
            keyMessage: props["Key Message"]?.rich_text?.map(t => t.plain_text).join("") || "",
            webPageUrl: props["Web Page URL"]?.url || "",
            campaignGoal: cp["Campaign Goal"]?.rich_text?.map(t => t.plain_text).join("") || "",
            painPoints: cp["Pain Points"]?.rich_text?.map(t => t.plain_text).join("") || "",
          }
        });
      }

      // ΓöÇΓöÇ CAMPAIGN ADMIN: condense via Claude ΓöÇΓöÇ
      if (body.action === "condense") {
        const { label, text } = body;
        if (!text) return json({ html: '<p>ΓÇö</p>' });
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY || '',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            system: `You are a content ops assistant. Rewrite the input as structured entries.

FORMAT ΓÇö each entry on its own line:
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
        const out = data.content?.[0]?.text || '';
        return json({ text: out });
      }

      // ΓöÇΓöÇ CAMPAIGN ADMIN: updateResearch ΓöÇΓöÇ
      if (body.action === "updateResearch") {
        const { researchId, field, value } = body;
        if (!researchId || !field) return json({ error: "researchId and field required" }, 400);
        const fieldMap = {
          productIdeas: "Product Ideas",
          notes:        "Notes",
          platforms:    "Platforms & Methods",
          tiktokTrends: "TikTok Trends",
          newsFeed:     "News Feed",
          keyMessage:   "Key Message",
        };
        const notionField = fieldMap[field];
        if (!notionField) return json({ error: "Unknown field: " + field }, 400);
        const dashed = researchId.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { [notionField]: { rich_text: [{ type: "text", text: { content: value || "" } }] } } })
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      // ΓöÇΓöÇ CAMPAIGN ADMIN: updateCampaignKeywords ΓöÇΓöÇ
      if (body.action === "updateCampaignKeywords") {
        const { campaignId, value } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashed = campaignId.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { Keywords: { rich_text: [{ type: "text", text: { content: value || "" } }] } } })
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      // ── MICROSITE: getCampaignTodos ──
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

      // ── MICROSITE: unlinkTodoFromCampaign ──
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

      // ── MICROSITE: updateCampaignField ──
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

      // ── MICROSITE: updateTitleStage ──
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

      // ── MICROSITE: getCampaignLogins ──
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

      // ── MICROSITE: createCampaignLogin ──
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

      // ── MICROSITE: updateLoginStatus ──
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

      // ── PUBLIC SITE: getPublishedPosts ──────────────────────────────────────
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
            if (textParts.join(" ").length > 280) excerpt += "…";
          } catch {
            // excerpt stays empty — front-end shows fallback text
          }

          return { id, title, stage, cohort, scheduled, excerpt };
        }));

        return json({ posts });
      }

      // ── getLogins — full login records with campaignIds and platformIds ──
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
          };
        });
        return json({ logins });
      }

      // ── createLoginFull — create login linked to campaign + platform ──
      if (body.action === "createLoginFull") {
        const { name, campaignId, platformId, category, status, usr, accountUrl } = body;
        if (!name) return json({ error: "name required" }, 400);
        const dash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const props = {
          Name:   { title: [{ type: "text", text: { content: name } }] },
          Status: { select: { name: status || "Planning" } },
        };
        if (category)   props.Category   = { select: { name: category } };
        if (usr)        props.Usr        = { rich_text: [{ type:"text", text:{ content: usr } }] };
        if (accountUrl) props["Account URL"] = { url: accountUrl };
        if (campaignId) props.Campaign   = { relation: [{ id: dash(campaignId) }] };
        if (platformId) props.Platform   = { relation: [{ id: dash(platformId) }] };

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
          campaignIds: campaignId ? [campaignId] : [],
          platformIds: platformId ? [platformId] : [],
        }});
      }

      // ── updateLoginFull — update login fields ──
      if (body.action === "updateLoginFull") {
        const { loginId, name, category, status, usr, accountUrl, headline, bio } = body;
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

        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(loginId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: props }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      // ── deleteLogin — archive login record ──
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

      // ── updatePlatformStatus — set platform Status field ──
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

      return json({ error: "Unknown action" }, 400);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
