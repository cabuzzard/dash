const NOTION_TOKEN       = "ntn_i84528099155pTq2P4dwUSpqmZYBpTSsL0qFB9GsQP6bc4";
const NOTION_VERSION     = "2022-06-28";
const CAMPAIGNS_DB       = "087b1163b4e64975bc7a4b686ff801de";
const CONTENT_STRATEGY_DB = "9fa5f42f010b47e7a82032607e07d6a1";
const PRODUCTS_DB        = "e92fcfce75fc4f54b553df0b7672ff48";
const MAIN_TD_DB         = "3471f7d3a4bb80de87c1d9e850f4a426";
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
  const [campRows, titleRows, productRows, todoRows] = await Promise.all([
    notionQuery(CAMPAIGNS_DB, {
      filter: { property: "Status", select: { does_not_equal: "Delete" } },
      sorts:  [{ property: "Name", direction: "ascending" }],
    }),
    notionQuery(CONTENT_STRATEGY_DB, {}),
    notionQuery(PRODUCTS_DB, {}),
    notionQuery(MAIN_TD_DB, {}),
  ]);

  // Build todo lookup by id
  const todoById = {};
  todoRows.forEach(t => {
    todoById[t.id.replace(/-/g,"")] = t.properties.Title?.title?.map(x => x.plain_text).join("") || "Untitled";
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

  // Count publish titles per campaign id
  const pubCount = {};
  titleRows.forEach(t => {
    if (t.properties.Status?.select?.name !== "Publish") return;
    (t.properties.Campaign?.relation || []).forEach(r => {
      const id = r.id.replace(/-/g, "");
      pubCount[id] = (pubCount[id] || 0) + 1;
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
      name:       c.properties.Name?.title?.map(t => t.plain_text).join("") || "Untitled",
      site:       c.properties.site?.select?.name || "Other",
      keyMessage: c.properties["Key Message"]?.rich_text?.map(t => t.plain_text).join("") || "",
      mainTd:     (c.properties["Associated To Do"]?.relation || []).map(r => ({
        id:   r.id.replace(/-/g,""),
        name: todoById[r.id.replace(/-/g,"")] || "Untitled",
      })),
      devTitles:  devCount[id]  || 0,
      pubTitles:  pubCount[id]  || 0,
      products:   prodCount[id] || 0,
    };
  });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
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
          const camp    = campById[campId] || { name: "—", site: "Other" };

          if (!campTitles[campId]) campTitles[campId] = { name: camp.name, site: camp.site, titles: [] };
          campTitles[campId].titles.push({ id, title, status });
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
        const { title, campaignId, status } = body;
        if (!title) return json({ error: "title required" }, 400);

        const props = {
          Title:  { title: [{ type: "text", text: { content: title } }] },
          Status: { select: { name: status || "Development" } },
        };
        if (campaignId) {
          const dashed = campaignId.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
          props["Campaign"] = { relation: [{ id: dashed }] };
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

      if (body.action === "updateCampaignTodos") {
        const { campaignId, todoIds } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashed = campaignId.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({
            properties: {
              "Associated To Do": {
                relation: (todoIds || []).map(id => ({
                  id: id.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5")
                }))
              }
            }
          }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed", detail: result }, resp.status);
        return json({ success: true, result });
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
        const { name } = body;
        if (!name) return json({ error: "name required" }, 400);
        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: {
            "Authorization":  `Bearer ${NOTION_TOKEN}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type":   "application/json",
          },
          body: JSON.stringify({
            parent: { database_id: CAMPAIGNS_DB },
            properties: {
              Name: { title: [{ type: "text", text: { content: name } }] },
            },
          }),
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

      return json({ error: "Unknown action" }, 400);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
