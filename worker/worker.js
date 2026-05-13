const NOTION_TOKEN   = "ntn_i84528099155pTq2P4dwUSpqmZYBpTSsL0qFB9GsQP6bc4";
const NOTION_VERSION = "2022-06-28";
const CAMPAIGNS_DB   = "087b1163b4e64975bc7a4b686ff801de";
const PIN            = "1246";

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

async function getCampaigns() {
  const resp = await fetch(`https://api.notion.com/v1/databases/${CAMPAIGNS_DB}/query`, {
    method: "POST",
    headers: {
      "Authorization":  `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type":   "application/json",
    },
    body: JSON.stringify({
      filter: { property: "Status", select: { does_not_equal: "Delete" } },
      sorts:  [{ property: "Name", direction: "ascending" }],
      page_size: 100,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || "Notion error");

  return (data.results || []).map(c => ({
    id:   c.id.replace(/-/g, ""),
    name: c.properties.Name?.title?.map(t => t.plain_text).join("") || "Untitled",
    site: c.properties.site?.select?.name || "Other",
  }));
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
      return json({ error: "Unknown action" }, 400);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
