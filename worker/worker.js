const NOTION_TOKEN       = "ntn_i84528099155pTq2P4dwUSpqmZYBpTSsL0qFB9GsQP6bc4";
const NOTION_VERSION     = "2022-06-28";
const CAMPAIGNS_DB       = "087b1163b4e64975bc7a4b686ff801de";
const CONTENT_STRATEGY_DB = "9fa5f42f010b47e7a82032607e07d6a1";
const PRODUCTS_DB        = "e92fcfce75fc4f54b553df0b7672ff48";
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
  // Fetch all three datasets in parallel
  const [campRows, titleRows, productRows] = await Promise.all([
    notionQuery(CAMPAIGNS_DB, {
      filter: { property: "Status", select: { does_not_equal: "Delete" } },
      sorts:  [{ property: "Name", direction: "ascending" }],
    }),
    notionQuery(CONTENT_STRATEGY_DB, {}),
    notionQuery(PRODUCTS_DB, {}),
  ]);

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
      name:     c.properties.Name?.title?.map(t => t.plain_text).join("") || "Untitled",
      site:     c.properties.site?.select?.name || "Other",
      devTitles: devCount[id]  || 0,
      pubTitles: pubCount[id]  || 0,
      products:  prodCount[id] || 0,
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

          // Find campaign relation by scanning all relation props
          let campaignName = "";
          let site = props.Site?.select?.name || "";
          Object.values(props).forEach(prop => {
            if (prop.type !== "relation") return;
            (prop.relation || []).forEach(r => {
              const rid = r.id.replace(/-/g, "");
              if (campaignIds.has(rid)) {
                campaignName = campById[rid].name;
                if (!site) site = campById[rid].site;
              }
            });
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
      return json({ error: "Unknown action" }, 400);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
