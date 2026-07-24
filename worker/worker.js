// NOTION_TOKEN, PIN, HMAC_SECRET, TURNSTILE_SECRET are set as Cloudflare Worker secrets (env vars).
// They are loaded from env at the start of each request  -  never hardcoded here.
let NOTION_TOKEN = ""; // set per-request from env.NOTION_TOKEN
const NOTION_VERSION     = "2022-06-28";
const CAMPAIGNS_DB       = "087b1163b4e64975bc7a4b686ff801de";
const CONTENT_STRATEGY_DB = "9fa5f42f010b47e7a82032607e07d6a1";
const PRODUCTS_DB        = "e92fcfce75fc4f54b553df0b7672ff48";
const MAIN_TD_DB         = "3471f7d3a4bb80de87c1d9e850f4a426";
const METHODS_DB         = "285ed0b668be4dad89dfd090350096bc";
const STRATEGY_DB        = "6f7a8666944746b2ae98d41db0c4e419";
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
const DESIGN_SPECS_DB    = "3981f7d3a4bb817c8edad15db64fa50d";
const SAVED_POSTS_DB     = "0a037d3a9a9a4289a41f76050055c795";

// Strategy DB (per-PRODUCT, not per-method) — a fixed positioning schema
// true for the product regardless of which platform/method it's marketed
// through. "Customer"/"Niche"/"Keywords" have no direct source in a
// method's own framework and are generated from product context alone;
// the rest map to whichever attached method's framework defines that
// concept (best-effort — a method without a matching phase just falls
// back to product-context-only generation for that field too).
// "Keywords" deliberately excluded — Products DB already has its own
// Keywords field (generateProductKeywords), which every field below reads
// as grounding. One canonical Keywords field, not a duplicate per record.
const STRATEGY_FIELDS = ["Customer", "Niche", "Pain Points", "Emotions", "Solution", "Benefits", "Unique Opportunity", "Transformation", "Offer Structure", "Proof Points", "Objections"];
const STRATEGY_FIELD_PHASE_MAP = {
  "Pain Points": "Problem", "Emotions": "Problem",
  "Solution": "Solution", "Benefits": "Solution", "Unique Opportunity": "Solution", "Transformation": "Solution",
  "Offer Structure": "Offer",
  "Proof Points": "Proof",
  "Objections": "Objection Handling",
};
const STRATEGY_FIELD_HINTS = {
  "Customer": "Who this product is for — specific situation, identity, demographic/psychographic details.",
  "Niche": "The specific market/positioning angle — how this fits into a broader category, what makes it a distinct niche rather than a generic offer.",
  "Pain Points": "The specific problems, frustrations, and situations the customer is in right now.",
  "Emotions": "The emotional state connected to the problem and the desired outcome — what they feel now, what they want to feel instead.",
  "Solution": "The mechanism — how this product actually solves the problem, the core approach or system, not just a features list.",
  "Benefits": "The outcomes the customer gets — framed as what they get, not what the product does.",
  "Unique Opportunity": "Why this product/approach beats every alternative — the differentiator, the thing no one else can say.",
  "Transformation": "Before state → after state. What changes and how life looks different.",
  "Offer Structure": "What's included, format, duration, delivery method, pricing, guarantee.",
  "Proof Points": "The kind of proof, results, and credibility signals this product should point to.",
  "Objections": "The top objections a buyer would have and the honest answer to each.",
};
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

// Some Apify actors (e.g. the YouTube transcripts one) return captions with
// raw HTML entities instead of real characters (&#39;s instead of 's).
const HTML_ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };
function decodeHtmlEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&apos;|&nbsp;/g, m => HTML_ENTITIES[m]);
}

// Strip backslash-escaping that the Notion MCP applies to JSON strings.
// Notion MCP stores '{"key":"val"}' as '\{"key":"val"\}' (literal leading/trailing backslash).
function stripMcpEscaping(s) {
  if (!s) return s;
  if (s.startsWith('\\{')) s = '{' + s.slice(2);
  if (s.endsWith('\\}'))   s = s.slice(0, -2) + '}';
  return s;
}

// Claude's JSON output occasionally contains a raw (unescaped) newline or tab
// inside a string value — invalid JSON, but easy to repair: walk the string
// tracking whether we're inside a quoted literal (respecting \" escapes) and
// escape any raw control character found there before JSON.parse sees it.
function sanitizeJsonControlChars(str) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of str) {
    if (inString) {
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === '\\') { out += ch; escaped = true; continue; }
      if (ch === '"') { inString = false; out += ch; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch;
    } else {
      if (ch === '"') inString = true;
      out += ch;
    }
  }
  return out;
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

// Whenever a Method gets attached to a Product (AI-matched or manually), also
// attach it to every Campaign that Product is linked to, so it shows up in
// the campaign microsite's Methods field too — not just on the product.
// Best-effort: failures here don't fail the caller's product-method attach.
async function propagateMethodToCampaigns(productId, methodId) {
  const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
  const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
  try {
    const prodResp = await fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, { headers: hdr });
    const prodPage = await prodResp.json();
    const campaignRels = (prodPage.properties?.["Campaigns"]?.relation || []).map(r => r.id.replace(/-/g,""));
    for (const campaignId of campaignRels) {
      try {
        const campResp = await fetch(`https://api.notion.com/v1/pages/${dash(campaignId)}`, { headers: hdr });
        const campPage = await campResp.json();
        const existing = (campPage.properties?.["Methods"]?.relation || []).map(r => ({ id: r.id }));
        if (existing.some(r => r.id.replace(/-/g,"") === methodId.replace(/-/g,""))) continue;
        existing.push({ id: dash(methodId) });
        await fetch(`https://api.notion.com/v1/pages/${dash(campaignId)}`, {
          method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Methods": { relation: existing } } }),
        });
      } catch(e) { /* best-effort per campaign */ }
    }
  } catch(e) { /* best-effort — never block the product-method attach */ }
}

// Recursively reads a Notion block's children into a flattened text outline,
// descending into any block with has_children (toggles and toggleable
// headings included). A Method's own methodology page is commonly
// hand-authored as a nested toggle outline (Section > Subsection > items) —
// Notion stores everything nested inside a toggle as CHILDREN of that
// toggle block, not as page-level siblings, so a single non-recursive
// `blocks/{id}/children` fetch only sees the outermost toggle labels and
// silently misses everything nested inside them. This is what feeds the
// "METHOD FRAMEWORK" section of every title/strategy-generation prompt, so
// missing it means the AI never actually saw most of the real framework.
async function extractBlocksTextRecursive(hdr, blockId, depth = 0) {
  if (depth > 4) return ""; // guard against runaway/circular nesting
  const resp = await fetch(`https://api.notion.com/v1/blocks/${blockId}/children?page_size=100`, { headers: hdr }).then(r => r.json());
  const blocks = resp.results || [];
  const indent = "  ".repeat(depth);
  const parts = await Promise.all(blocks.map(async b => {
    const type = b.type;
    const rich = b[type]?.rich_text || [];
    const text = rich.map(t => t.plain_text).join("");
    let line = "";
    if (type === "heading_1") line = `\n${indent}# ${text}`;
    else if (type === "heading_2") line = `\n${indent}## ${text}`;
    else if (type === "heading_3") line = `\n${indent}### ${text}`;
    else if (type === "toggle") line = `\n${indent}#### ${text}`; // plain toggle block used as a sub-heading label
    else if (type === "bulleted_list_item") line = `${indent}- ${text}`;
    else if (type === "numbered_list_item") line = `${indent}${text}`;
    else if (type === "paragraph" && text) line = `${indent}${text}`;
    const childText = b.has_children ? await extractBlocksTextRecursive(hdr, b.id, depth + 1) : "";
    return [line, childText].filter(Boolean).join("\n");
  }));
  return parts.filter(Boolean).join("\n");
}

// Parses a Method's own page body into its natural Phase > Grouping
// structure by BLOCK TYPE (heading_1/2 = phase boundary, heading_3 =
// grouping boundary within the current phase, bullets/numbered items =
// counted as that grouping's items) — not by text pattern-matching, since
// a method's heading text is free-form (e.g. "Above the Fold" has no
// literal "Phase:" prefix on some methods but does on others). Single-level
// only (methodology pages are typically flat headings, not toggle-nested —
// see extractBlocksTextRecursive for the toggle-aware variant used when
// reading a method's FULL text for a single generation pass). Returns
// phases in document order — this is what lets a big framework (e.g. an
// 11-phase Product Page framework) be generated ONE PHASE AT A TIME instead
// of in one Claude call that risks truncating well before the last phases.
//
// Each phase also gets a `kind`: "strategy" (positioning/messaging content
// true of the product regardless of platform — belongs in the product-level
// Strategy DB) or "asset" (platform/destination-specific deliverables —
// belongs in Titles). Freshly-researched methods (via
// researchAndWriteMethodology) tag this directly in the heading text —
// "Phase: Problem [Strategy]" — so classification works for ANY method
// going forward without a hardcoded name list. Older methods authored
// before that convention (e.g. Product Page) have no tag, so this falls
// back to STRATEGY_FIELD_PHASE_MAP's reverse lookup (a phase name that
// equals one of that map's *values* is "strategy"); anything else defaults
// to "asset" — the safe default, since assets flow to Titles rather than
// silently overwriting one of the 12 fixed Strategy fields.
const STRATEGY_PHASE_NAMES = new Set(Object.values(STRATEGY_FIELD_PHASE_MAP));

// Reads an idea-title's stored guidance (Core Idea = content description,
// "seed idea" = seed keywords, Notes = research instructions) and returns
// { text, keywords } for folding into research prompts. `text` falls back to
// the plain parentTitle string when there's no id or the fetch fails, so
// callers can use it unconditionally wherever they used parentTitle before.
async function buildTitleSeedContext(hdr, parentTitleId, parentTitleText) {
  const fallback = { text: parentTitleText || "", keywords: "" };
  if (!parentTitleId) return fallback;
  try {
    const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
    const resp = await fetch(`https://api.notion.com/v1/pages/${dash(parentTitleId)}`, { headers: hdr });
    if (!resp.ok) return fallback;
    const page = await resp.json();
    const p = page.properties || {};
    const rtx = prop => (p[prop]?.rich_text || []).map(t => t.plain_text).join("");
    const name = (p.Title?.title || []).map(t => t.plain_text).join("") || parentTitleText || "";
    const description = rtx("Core Idea");
    const seedKeywords = rtx("seed idea");
    const instructions = rtx("Notes");
    const parts = [];
    if (name) parts.push(`Idea: ${name}`);
    if (description) parts.push(`Content description: ${description}`);
    if (seedKeywords) parts.push(`Seed keywords: ${seedKeywords}`);
    if (instructions) parts.push(`Research instructions (follow these when researching, choosing angles, and shaping titles): ${instructions}`);
    return { text: parts.length ? parts.join("\n") : fallback.text, keywords: seedKeywords };
  } catch { return fallback; }
}

// Optional operator "research guidelines" — free-text routing recommendations
// sent by the front-end with every request (see w() in the site templates).
// Prepended to AI research/generation prompts so the operator can steer
// sources, angles, framing, and routing across the whole production flow
// without editing each prompt. Returns '' when unset so call sites can
// interpolate unconditionally.
const researchGuidelinesBlock = g => {
  const t = (g == null ? "" : String(g)).trim();
  if (!t) return "";
  return `OPERATOR RESEARCH GUIDELINES (standing routing recommendations from the user — apply them when choosing sources, angles, framing, and routing; where they conflict with the default approach below, the guidelines win):\n${t.slice(0, 1500)}\n\n`;
};

async function parseMethodPhases(hdr, methodId) {
  const resp = await fetch(`https://api.notion.com/v1/blocks/${methodId}/children?page_size=100`, { headers: hdr }).then(r => r.json());
  const blocks = resp.results || [];
  const phases = [];
  let curPhase = null, curGrouping = null;
  for (const b of blocks) {
    const type = b.type;
    const rich = b[type]?.rich_text || [];
    const rawText = rich.map(t => t.plain_text).join("");
    const text = rawText.replace(/^Phase:\s*/i, "").trim();
    const groupingText = rawText.replace(/^Grouping:\s*/i, "").trim();
    if (type === "heading_1" || type === "heading_2") {
      if (!text) continue;
      const tagMatch = text.match(/^(.*?)\s*\[(Strategy|Asset|Arc)\]\s*$/i);
      const name = tagMatch ? tagMatch[1].trim() : text;
      const kind = tagMatch ? tagMatch[2].toLowerCase() : (STRATEGY_PHASE_NAMES.has(text) ? "strategy" : "asset");
      curPhase = { name, kind, groupings: [] };
      phases.push(curPhase);
      curGrouping = null;
    } else if (type === "heading_3") {
      if (!curPhase || !groupingText) continue;
      curGrouping = { name: groupingText, notes: [] };
      curPhase.groupings.push(curGrouping);
    } else if ((type === "bulleted_list_item" || type === "numbered_list_item") && text) {
      if (curGrouping) curGrouping.notes.push(text);
      else if (curPhase) { curGrouping = { name: curPhase.name, notes: [text] }; curPhase.groupings.push(curGrouping); }
    }
  }
  return phases;
}

// ── CONTENT GRADING — "graded by skill not human" ──────────────────────
// A generated concept only counts as done once it passes: it must clearly
// serve the product's actual Strategy (the whole point of doing Strategy
// work is that virality is judged against real positioning, not in the
// abstract) AND execute a real, named viral hook framework. Mechanical
// hygiene (banned filler words, em-dashes) is checked in CODE, not asked
// of the model — deterministic rules can't be talked out of by a generous
// grader, mirroring the hard pre-publish checks other tools use.
const GRADE_PASS_THRESHOLD = 7; // out of 10
const GRADE_MAX_ATTEMPTS   = 3; // 1 initial + up to 2 regenerate-and-regrade passes
const GRADE_BANNED_WORDS = [
  "unlock", "unleash", "elevate", "seamless", "seamlessly", "dive in", "dive into",
  "game-changer", "game changer", "revolutionize", "supercharge", "next-level",
  "in today's world", "in today's fast-paced", "navigate the", "delve into",
  "it's important to note", "boost your", "take it to the next level",
];
const GRADE_HOOK_FORMS = [
  "Reverse Hook (say the opposite of the common advice)",
  "Contrarian Claim (a polarizing take, pick-a-side)",
  "Specific Numbers / Receipts (real, precise figures instead of vague claims)",
  "Curiosity Gap (withholds the payoff to force a read-on)",
  "Pattern Interrupt (breaks the expected format/opening for the platform)",
  "Before/After Transformation (concrete then-vs-now contrast)",
  "Social Proof (real results, real people, real numbers behind them)",
];

function gradeMechanicalCheck(text) {
  const t = String(text || "");
  const issues = [];
  if (/—/.test(t)) issues.push("contains an em-dash (—)");
  const lower = t.toLowerCase();
  GRADE_BANNED_WORDS.forEach(w => { if (lower.includes(w)) issues.push(`contains banned phrase "${w}"`); });
  return { ok: issues.length === 0, issues };
}

// Pulls the product's real Strategy record (the 11 STRATEGY_FIELDS,
// Product-only per the current schema — Method relation must be empty, see
// getProductStrategy) so grading judges against actual positioning, not
// virality in a vacuum. Falls back to campaign-level Statement/Unique
// Opportunity/Pain Points when no product is attached. `productId`/
// `campaignId` must already be dashed (caller's responsibility, same
// convention as extractBlocksTextRecursive).
async function fetchStrategyForGrading(hdr, campaignId, productId, hasProduct) {
  if (hasProduct) {
    try {
      const q = await fetch(`https://api.notion.com/v1/databases/${STRATEGY_DB}/query`, {
        method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ filter: { and: [
          { property: "Product", relation: { contains: productId } },
          { property: "Method", relation: { is_empty: true } },
        ] } }),
      }).then(r => r.json());
      const record = (q.results || [])[0];
      if (record) {
        const props = record.properties || {};
        const rt = key => (props[key]?.rich_text || []).map(t => t.plain_text).join("");
        const lines = STRATEGY_FIELDS.map(f => { const v = rt(f); return v ? `${f}: ${v}` : ""; }).filter(Boolean);
        if (lines.length) return lines.join("\n");
      }
    } catch(e) { /* fall through to campaign-level fallback */ }
  }
  try {
    const researchRaw = await fetch(`https://api.notion.com/v1/databases/${RESEARCH_DB}/query`, {
      method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ filter: { property: "Campaign", relation: { contains: campaignId } } }),
    }).then(r => r.json());
    const rt = key => { for (const r of (researchRaw.results || [])) { const v = (r.properties[key]?.rich_text || []).map(t => t.plain_text).join(""); if (v) return v; } return ""; };
    const lines = [
      rt("Statement")          && `Statement: ${rt("Statement")}`,
      rt("Unique Opportunity") && `Unique Opportunity: ${rt("Unique Opportunity")}`,
      rt("Pain Points")        && `Pain Points: ${rt("Pain Points")}`,
    ].filter(Boolean);
    return lines.join("\n");
  } catch(e) { return ""; }
}

// One Claude call: scores strategy fit (0-5) + viral hook execution (0-5).
// Mechanical hygiene is checked in code and hard-caps the final score at 5
// when it fails, so a slick-sounding grade can never paper over a literal
// banned word or em-dash.
async function gradeConcept(env, { body, assetType, strategyBlock, keywords, platformName }) {
  const mech = gradeMechanicalCheck(body);
  if (!env.ANTHROPIC_API_KEY) {
    // No grading available — pass through on mechanical check alone rather
    // than block content creation entirely on a missing key.
    return { score: mech.ok ? 10 : 5, passed: mech.ok, hookForm: "", notes: mech.ok ? "Not graded (no ANTHROPIC_API_KEY) — mechanical check only." : "Mechanical issues: " + mech.issues.join("; "), fixInstructions: mech.issues.join("; ") };
  }
  const prompt = `You are a strict content grader. Score this ${assetType}${platformName ? ` for ${platformName}` : ""} on exactly two dimensions.

CONTENT TO GRADE:
${body}

${strategyBlock ? `PRODUCT/CAMPAIGN STRATEGY (the content must clearly serve THIS positioning — virality that ignores strategy is not a pass):\n${strategyBlock}\n` : "(No strategy on file — grade strategy fit as neutral/3, note that strategy is missing.)\n"}${keywords ? `KEYWORDS it should naturally reflect: ${keywords}\n` : ""}
RECOGNIZED VIRAL HOOK FORMS (the content must clearly execute ONE of these, not a vague good-vibes opener):
${GRADE_HOOK_FORMS.map(f => "- " + f).join("\n")}

Score:
1. STRATEGY FIT (0-5): does it speak to the customer/pain points/emotions/benefits/unique opportunity above, and naturally include the keywords?
2. VIRAL FORM (0-5): does it clearly execute one named hook form above, well?

Return ONLY this JSON, no other text:
{ "strategyScore": 0-5, "viralScore": 0-5, "hookForm": "which form it uses, or 'none'", "strategyNotes": "1-2 sentences", "fixInstructions": "if scoring below 4/5 on either, specific actionable rewrite instructions — otherwise empty string" }`;

  try {
    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
    });
    const aiData = await aiResp.json();
    if (!aiResp.ok) throw new Error(aiData.error?.message || "grading call failed");
    const raw = (aiData.content?.[0]?.text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    const strategyScore = Math.max(0, Math.min(5, Number(parsed.strategyScore) || 0));
    const viralScore    = Math.max(0, Math.min(5, Number(parsed.viralScore) || 0));
    let score = strategyScore + viralScore;
    const notesParts = [`Hook form: ${parsed.hookForm || "none"}.`, parsed.strategyNotes || ""];
    if (!mech.ok) { score = Math.min(score, 5); notesParts.push("Mechanical issues: " + mech.issues.join("; ") + "."); }
    return {
      score,
      passed: score >= GRADE_PASS_THRESHOLD && mech.ok,
      hookForm: parsed.hookForm || "",
      notes: notesParts.filter(Boolean).join(" "),
      fixInstructions: [parsed.fixInstructions || "", !mech.ok ? "Also fix: " + mech.issues.join("; ") : ""].filter(Boolean).join(" "),
    };
  } catch(e) {
    return { score: 0, passed: false, hookForm: "", notes: "Grading failed: " + e.message, fixInstructions: "" };
  }
}

// Regenerates ONE failing concept in isolation — reads the grader's fix
// instructions and keeps every sibling option's title in view so the
// rewrite stays distinct from the rest of the batch. Same grounding as the
// original batch generation. Returns the original concept unchanged if
// regeneration itself fails, so a flaky retry never loses the last-good copy.
async function regenerateConcept(env, { original, assetType, title, description, seedKeywords, researchInstructions, methodName, methodBody, subMethodName, subMethodBody, platformName, spec, isDrawingPost, siblingTitles, fixInstructions, guidelines }) {
  if (!env.ANTHROPIC_API_KEY) return original;
  const prompt = `${researchGuidelinesBlock(guidelines)}You are revising ONE content concept that failed a quality grade. Fix it — do not start over from scratch unless the fix requires it.

ORIGINAL CONCEPT: ${original.assetTitle || ""}
${original.body || ""}

WHAT NEEDS TO CHANGE: ${fixInstructions || "Strengthen strategy fit and viral hook execution."}

IDEA / TITLE: ${title}
${description ? `DESCRIPTION: ${description}\n` : ""}${seedKeywords ? `SEED KEYWORDS: ${seedKeywords}\n` : ""}${researchInstructions ? `OPERATOR INSTRUCTIONS: ${researchInstructions}\n` : ""}${methodName ? `METHOD: ${methodName}${methodBody ? `\nMETHOD NOTES: ${methodBody}` : ""}\n` : ""}${platformName ? `PLATFORM: ${platformName}\n` : ""}${subMethodName ? `SUB METHOD: ${subMethodName}${subMethodBody ? `\n${subMethodBody}` : ""}\n` : ""}
DESIGN SPEC: Background ${spec.bg} · Ink ${spec.ink} · Accent ${spec.accent} · Headline font ${spec.headlineFont} · Body font ${spec.bodyFont}
${(siblingTitles || []).length ? `OTHER OPTIONS ALREADY IN THIS BATCH (stay distinct from these): ${siblingTitles.filter(t => t !== original.assetTitle).join(", ")}\n` : ""}
Every concept is a ${assetType} — do not propose other formats. Must be complete enough to build immediately.
${isDrawingPost ? `Also include "canvaQuery": a short 2-4 word Canva template search phrase.\n` : ""}
Return ONLY this JSON, no other text: { "assetTitle": "short distinct option name", "platform": "${original.platform || "Instagram"}", "body": "full revised concept: on-image text, layout, spec usage, caption"${isDrawingPost ? ', "canvaQuery": "2-4 word Canva search phrase"' : ""} }`;

  try {
    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
    });
    const aiData = await aiResp.json();
    if (!aiResp.ok) return original;
    const raw = (aiData.content?.[0]?.text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    return { assetTitle: parsed.assetTitle || original.assetTitle, platform: parsed.platform || original.platform, body: parsed.body || original.body, canvaQuery: parsed.canvaQuery || original.canvaQuery };
  } catch(e) { return original; }
}

// Researches and writes a COMPLETE Phase>Grouping>items methodology
// framework for a method — the "replenish until fully researched" step.
// Skips (returns {skipped:true}) if the method already has a substantial
// framework (>= 3 phases) unless `force` is set, so this is safe to call
// automatically on every method create/attach without clobbering existing
// work.
//
// Branches on `isDestination` (the method's own "Needs Traffic Plan"
// checkbox) — the two kinds of method need fundamentally different
// research:
// - Destination (a landing page, a booking form): genuinely component-
//   based — a page has a Headline, a CTA, a Guarantee. Each phase gets
//   tagged [Strategy] (positioning content that belongs in the product-
//   level Strategy DB) or [Asset] (page components — belongs in Titles).
// - Growth/distribution (Instagram, X, Pinterest, Email, LinkedIn — a
//   platform people grow an audience ON, not a page they land on):
//   arc/sequence-based, NOT component-based. What matters is the
//   STRUCTURE of how content unfolds on that platform (a carousel-launch
//   arc, a nurture-email sequence, a trend-jack reel) — reusable
//   knowledge about the platform itself, independent of any product's
//   subject matter or keywords. Every phase here is tagged [Arc].
async function researchAndWriteMethodology(hdr, env, methodId, methodName, platform, productContext, force, isDestination, guidelines) {
  if (!env.ANTHROPIC_API_KEY) return { skipped: true, reason: "no API key" };
  if (!force) {
    try {
      const existing = await parseMethodPhases(hdr, methodId);
      if (existing.length >= 3) return { skipped: true, reason: "already researched", phaseCount: existing.length };
    } catch(e) { /* fall through and research anyway */ }
  }
  const prompt = isDestination
    ? `${researchGuidelinesBlock(guidelines)}You are a marketing methodologist. Research and write a COMPLETE marketing methodology framework for the method "${methodName}"${platform ? ` (platform: ${platform})` : ''}, as it would be used to market and sell a product.
${productContext ? `\nCONTEXT — being set up right now for this product: ${productContext}\n` : ''}
Organize the methodology into PHASES (major stages of using this method) and, within each phase, GROUPINGS (sub-categories), each with 2-5 specific deliverable-prompt bullet items.

CRITICAL — classify EVERY phase as one of:
- "strategy": positioning/messaging content that is TRUE OF THE PRODUCT regardless of which platform/method markets it (audience/pain points, proof, offer structure, objections, benefits, emotional drivers, transformation). Reusable across any method — not specific to "${methodName}".
- "asset": platform/destination-specific deliverables — actual pieces that must be built/written/published specifically for ${methodName} (headlines, captions, visuals, technical specs, format/length/character-count constraints, etc.)

Ground this in real, current best practices for "${methodName}" — cite real tactics, formats, and constraints (character limits, ideal lengths, platform conventions) where relevant, not generic funnel theory.

Return ONLY a JSON array, no other text, no markdown fences:
[{ "phase": "...", "kind": "strategy"|"asset", "groupings": [{ "name": "...", "items": ["...", "..."] }] }]`
    : `${researchGuidelinesBlock(guidelines)}You are a growth strategist. Research and define 2-4 reusable CONTENT ARC/SEQUENCE TYPES for growing an audience on "${methodName}"${platform ? ` (platform: ${platform})` : ''} — the STRUCTURAL patterns that actually drive growth on this specific platform. This must be reusable for ANY product that uses this platform — do NOT reference a specific product, keyword, or subject matter anywhere in the output.

For each arc/sequence type, describe (as GROUPINGS, one per structural piece/step):
- The STRUCTURE: how many pieces, what role each one plays in the sequence (e.g. hook -> problem -> proof -> CTA), and the order they go in.
- The CADENCE/PACING: how often, over what timeframe, the platform-native posting rhythm.
- WHY it drives growth specifically on this platform — algorithm behavior, audience habits, format strengths.

Ground this in real, current best practices for growing on "${methodName}" — cite real, specific platform mechanics (character/length limits, native formats, algorithm/discovery signals) — not generic funnel theory.

Return ONLY a JSON array, no other text, no markdown fences:
[{ "phase": "Arc: <name, e.g. Carousel Launch Arc>", "groupings": [{ "name": "structural role, e.g. Post 1 — Hook", "items": ["what this piece's job is", "format/length/cadence notes"] }] }]`;

  const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "anthropic-beta": "web-search-2025-03-05", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 4000, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }], messages: [{ role: "user", content: prompt }] }),
  });
  const aiData = await aiResp.json();
  if (!aiResp.ok) return { error: aiData.error?.message || "Claude API error" };
  let raw = '';
  for (const block of (aiData.content || [])) { if (block.type === 'text') raw += block.text; }
  let phases;
  try {
    const s = raw.indexOf('['), e = raw.lastIndexOf(']');
    if (s === -1 || e === -1 || e < s) throw new Error("No JSON array found");
    phases = JSON.parse(sanitizeJsonControlChars(raw.slice(s, e + 1)));
    if (!Array.isArray(phases)) throw new Error("Not an array");
  } catch(e) {
    return { error: "Failed to parse methodology JSON: " + e.message + " | RAW: " + raw.slice(0, 300) };
  }

  const rtBlock = t => t ? [{ type: "text", text: { content: String(t).slice(0, 1990), link: null }, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: "default" } }] : [];
  const headingBlock = (level, text) => ({ object: "block", type: `heading_${level}`, [`heading_${level}`]: { rich_text: rtBlock(text) } });
  const bulletBlock = text => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rtBlock(text) } });
  const children = [];
  for (const p of phases) {
    const kind = isDestination ? (/^strategy$/i.test(p.kind) ? "Strategy" : "Asset") : "Arc";
    children.push(headingBlock(2, `Phase: ${p.phase} [${kind}]`));
    for (const g of (p.groupings || [])) {
      children.push(headingBlock(3, `Grouping: ${g.name}`));
      for (const item of (g.items || [])) children.push(bulletBlock(item));
    }
  }

  // Replace whatever body currently exists — this only runs when the
  // method is thin/stub (see the skip check above) or explicitly forced.
  const existingBlocks = await fetch(`https://api.notion.com/v1/blocks/${methodId}/children?page_size=100`, { headers: hdr }).then(r => r.json());
  await Promise.all((existingBlocks.results || []).map(b => fetch(`https://api.notion.com/v1/blocks/${b.id}`, { method: "DELETE", headers: hdr })));
  for (let i = 0; i < children.length; i += 90) {
    await fetch(`https://api.notion.com/v1/blocks/${methodId}/children`, {
      method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ children: children.slice(i, i + 90) }),
    });
  }
  return { researched: true, phaseCount: phases.length };
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
      scheduleDay:      (c.properties["Schedule Day"]?.multi_select || []).map(g => g.name)[0] || "",
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
      domain: c.properties["domain"]?.rich_text?.map(t => t.plain_text).join("") || "",
      email:  c.properties["email"]?.rich_text?.map(t => t.plain_text).join("") || "",
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

// ── SCREENER (shared by the screenStocks/discoverStocks/getEdgarPicks HTTP
// actions and the scheduled auto-trade scan below) ─────────────────────────

async function fetchChart(sym, interval = '1d', range = '90d') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${sym}: HTTP ${r.status}`);
  return r.json();
}

// Weekly EMA (50/200) distance — informational only, not used for screening
function calcEma(closes, period) {
  if (!closes || closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

function calcWeeklyEmaDistances(weeklyData, price) {
  const res    = weeklyData?.chart?.result?.[0];
  const closes = res?.indicators?.quote?.[0]?.close?.filter(c => c != null);
  const ema50  = calcEma(closes, 50);
  const ema200 = calcEma(closes, 200);
  return {
    ema50Dist:  ema50  != null ? +(((price - ema50)  / ema50)  * 100).toFixed(2) : null,
    ema200Dist: ema200 != null ? +(((price - ema200) / ema200) * 100).toFixed(2) : null,
  };
}

// ── SECTOR / RRG (Relative Rotation Graph) ───────────────────────────────
// Informational only — classifies each stock's sector as Leading / Weakening /
// Lagging / Improving relative to SPY, so early-rotation sectors are visible
// even before individual stocks show their own accumulation signals.
const SECTOR_ETF = {
  'Technology':             'XLK',
  'Financial Services':     'XLF',
  'Energy':                 'XLE',
  'Healthcare':             'XLV',
  'Consumer Cyclical':      'XLY',
  'Consumer Defensive':     'XLP',
  'Industrials':            'XLI',
  'Basic Materials':        'XLB',
  'Utilities':              'XLU',
  'Real Estate':            'XLRE',
  'Communication Services': 'XLC',
};

async function fetchSector(sym) {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=assetProfile`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.quoteSummary?.result?.[0]?.assetProfile?.sector || null;
  } catch { return null; }
}

// RS-Ratio: sector-vs-SPY relative price, normalised around 100 (its own recent average).
// RS-Momentum: trend of that relative ratio over the last 10 weeks, normalised.
function calcRrg(etfCloses, spyCloses) {
  const n = Math.min(etfCloses?.length || 0, spyCloses?.length || 0);
  if (n < 15) return null;
  const rel = etfCloses.slice(-n).map((v, i) => v / spyCloses.slice(-n)[i]);

  const recent = rel.slice(-20);
  const mean   = recent.reduce((a, x) => a + x, 0) / recent.length;
  const rsRatio = mean ? (recent[recent.length - 1] / mean) * 100 : 100;

  const window = rel.slice(-10);
  const xBar = (window.length - 1) / 2;
  const yBar = window.reduce((a, x) => a + x, 0) / window.length;
  let num = 0, den = 0;
  window.forEach((y, i) => { num += (i - xBar) * (y - yBar); den += (i - xBar) ** 2; });
  const slope = den ? num / den : 0;
  const rsMomentum = yBar ? slope / Math.abs(yBar) : 0;

  let quadrant;
  if (rsRatio >= 100 && rsMomentum > 0)  quadrant = 'Leading';
  else if (rsRatio >= 100)                quadrant = 'Weakening';
  else if (rsMomentum > 0)                quadrant = 'Improving';
  else                                    quadrant = 'Lagging';

  return { rsRatio: +rsRatio.toFixed(1), rsMomentum: +rsMomentum.toFixed(4), quadrant };
}

// Computed once per scan (not per ticker) — fetches SPY + the 11 sector ETFs.
async function buildSectorRrgCache() {
  const spyData   = await fetchChart('SPY', '1wk', '2y');
  const spyCloses = spyData?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(c => c != null);

  const cache = {};
  await Promise.all(Object.entries(SECTOR_ETF).map(async ([sector, etf]) => {
    try {
      const etfData   = await fetchChart(etf, '1wk', '2y');
      const etfCloses = etfData?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(c => c != null);
      const rrg = calcRrg(etfCloses, spyCloses);
      if (rrg) cache[sector] = { etf, ...rrg };
    } catch { /* skip this sector */ }
  }));
  return cache;
}

// Fetches daily + weekly charts and returns signals + EMA distances + sector RRG merged
async function calcFullSignals(sym, sectorRrgCache) {
  const [dailyData, weeklyData, sector] = await Promise.all([
    fetchChart(sym),
    fetchChart(sym, '1wk', '5y'),
    sectorRrgCache ? fetchSector(sym) : Promise.resolve(null),
  ]);
  const s = calcSignals(sym, dailyData);
  if (!s) return null;
  Object.assign(s, calcWeeklyEmaDistances(weeklyData, s.price));

  const rrg = sector && sectorRrgCache?.[sector];
  s.sector      = sector || null;
  s.sectorEtf   = rrg ? rrg.etf : null;
  s.rrgQuadrant = rrg ? rrg.quadrant : null;

  return s;
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

// ── AUTO-TRADE SCAN (scheduled) ──────────────────────────────────────────
// Runs on the daily cron alongside deepScan(). Scans the saved watchlist +
// Yahoo's top-100 most-active tickers; for any BUY verdict with no existing
// open trade on that ticker, picks a swing-tier call (0.60–0.75 delta,
// ~28–56 DTE) off the live chain and logs it via the same KV trade record
// saveTrade uses. This only writes to this app's own trade-tracking KV —
// it never places a real order or touches a brokerage account.

// Standard normal CDF via Abramowitz-Stegun approximation.
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x >= 0 ? 1 - p : p;
}

// Black-Scholes call delta = N(d1). r is an approximate risk-free rate.
function callDelta(S, K, T, sigma, r = 0.045) {
  if (!(S > 0) || !(K > 0) || !(T > 0) || !(sigma > 0)) return null;
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  return normCdf(d1);
}

async function fetchYahooOptionsChain(ticker, dateTs) {
  const YUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const r0 = await fetch('https://finance.yahoo.com/', { headers: { 'User-Agent': YUA, 'Accept': 'text/html' }, redirect: 'follow' });
  const rawCookies = r0.headers.getAll ? r0.headers.getAll('set-cookie') : [r0.headers.get('set-cookie')];
  const cookieStr  = rawCookies.filter(Boolean).map(c => c.split(';')[0]).join('; ');
  const r1 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': YUA, 'Cookie': cookieStr } });
  const crumb = (await r1.text()).trim();
  let url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker.toUpperCase())}?crumb=${encodeURIComponent(crumb)}`;
  if (dateTs) url += `&date=${dateTs}`;
  const r = await fetch(url, { headers: { 'User-Agent': YUA, 'Cookie': cookieStr } });
  if (!r.ok) throw new Error(`Yahoo options ${r.status}`);
  const data = await r.json();
  const result = data?.optionChain?.result?.[0];
  if (!result) throw new Error('No options data for ' + ticker);
  return {
    underlying:      result.quote?.regularMarketPrice ?? null,
    expirationDates: result.expirationDates || [],
    fetchedDate:     result.options?.[0]?.expirationDate || null,
    calls:           result.options?.[0]?.calls || [],
    puts:            result.options?.[0]?.puts  || [],
  };
}

// Picks the expiry closest to 42 days out (middle of the 28–56 day swing window),
// then the call contract whose Black-Scholes delta is closest to 0.675 (the
// middle of the 0.60–0.75 target band).
async function pickSwingCallContract(ticker) {
  const first = await fetchYahooOptionsChain(ticker);
  if (!first.underlying || !first.expirationDates.length) return null;

  const now = Date.now() / 1000;
  const targetSecs = 42 * 86400;
  let bestExpiry = first.expirationDates[0];
  let bestDiff = Infinity;
  for (const ts of first.expirationDates) {
    const diff = Math.abs((ts - now) - targetSecs);
    if (diff < bestDiff) { bestDiff = diff; bestExpiry = ts; }
  }

  const chain = bestExpiry === first.fetchedDate ? first : await fetchYahooOptionsChain(ticker, bestExpiry);
  if (!chain.calls?.length) return null;

  const T = Math.max((bestExpiry - now) / (365 * 86400), 1 / 365);
  let best = null, bestDeltaDiff = Infinity;
  for (const c of chain.calls) {
    const iv = c.impliedVolatility;
    if (!(iv > 0) || !(c.strike > 0)) continue;
    const delta = callDelta(chain.underlying, c.strike, T, iv);
    if (delta == null) continue;
    const diff = Math.abs(delta - 0.675);
    if (diff < bestDeltaDiff) { bestDeltaDiff = diff; best = { contract: c, delta }; }
  }
  if (!best) return null;

  const c = best.contract;
  const price = c.lastPrice > 0 ? c.lastPrice : (c.bid > 0 && c.ask > 0 ? (c.bid + c.ask) / 2 : null);
  const d = new Date(bestExpiry * 1000);
  const expYYYYMMDD = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

  return { ticker, strike: c.strike, expiry: expYYYYMMDD, price, delta: best.delta, dte: Math.round((bestExpiry - now) / 86400) };
}

async function runAutoTradeScan(env) {
  // 1. Universe = saved watchlist ∪ Yahoo top-100 most-active
  const rawWatchlist = await env.TRADES.get('screener:watchlist');
  const watchlist = rawWatchlist ? JSON.parse(rawWatchlist) : [];

  let mostActive = [];
  try {
    const scrUrl = 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=most_actives&count=100&formatted=false&lang=en-US&region=US';
    const scrResp = await fetch(scrUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (scrResp.ok) {
      const scrData = await scrResp.json();
      mostActive = (scrData?.finance?.result?.[0]?.quotes || []).map(q => q.symbol).filter(Boolean);
    }
  } catch { /* skip most-active leg if Yahoo screener fails */ }

  const universe = Array.from(new Set([...watchlist, ...mostActive]));
  if (!universe.length) return { scanned: 0, created: 0 };

  // 2. Score every ticker
  const sectorRrgCache = await buildSectorRrgCache();
  const results = await Promise.allSettled(universe.map(sym => calcFullSignals(sym, sectorRrgCache)));
  const buys = results
    .map(r => r.status === 'fulfilled' ? r.value : null)
    .filter(s => s && s.verdict === 'BUY');

  // 3. Dedup — skip tickers that already have an open (non-expired) trade
  const tradeKeys = await env.TRADES.list({ prefix: 'trades:' });
  const openTrades = (await Promise.all(tradeKeys.keys.map(k => env.TRADES.get(k.name, 'json'))))
    .filter(t => t && !t.expired);
  const openTickers = new Set(openTrades.map(t => t.ticker));

  const candidates = buys.filter(s => !openTickers.has(s.sym));

  // 4. For each new BUY, pick a swing call off the live chain and log the trade
  let created = 0;
  for (const s of candidates) {
    try {
      const pick = await pickSwingCallContract(s.sym);
      if (!pick) continue;

      const now = new Date();
      const ts  = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
      const id  = `${s.sym}_${ts}`;
      const trade = {
        id,
        ticker:                 s.sym,
        strike:                 pick.strike,
        expiry:                 pick.expiry,
        direction:              'C',
        notes:                  `Auto-created by screener — BUY verdict (score ${s.score}, vol ${s.volRatio}×, `
                                 + `OBV ${s.obvSlope}, CMF ${s.cmf}, stoch %K ${s.stochK}). Swing call, `
                                 + `~${pick.dte}d DTE, ~${pick.delta.toFixed(2)} delta.`,
        entry_time:             now.toISOString(),
        entry_price:            s.price,
        price_captured:         true,
        current_price:          null,
        current_pct:            null,
        max_high:               null,
        max_high_time:          null,
        max_low:                null,
        max_low_time:           null,
        strike_reached:         false,
        strike_reached_time:    null,
        last_updated:           null,
        expired:                false,
        entry_contract:         pick.price,
        contract_captured:      pick.price != null,
        current_contract:       null,
        contract_pct:           null,
        contract_max_high:      null,
        contract_max_high_time: null,
        contract_max_low:       null,
        contract_max_low_time:  null,
        auto_created:           true,
      };
      await env.TRADES.put(`trades:${id}`, JSON.stringify(trade));
      created++;
    } catch { /* skip this ticker on any chain/pricing error, continue scan */ }
  }

  return { scanned: universe.length, buys: buys.length, created };
}

// ── SAVED POSTS PIPELINE (Notion "Saved Posts (Swipe File)" → Apify scrape → ─
// transcribe if video → Claude summary). Content TYPE (text vs video/speech)
// is detected from what the scraper actually returns for that URL, not
// hardcoded per platform — a tweet with a video attachment is treated the
// same as a YouTube video: transcribe, don't just summarize the caption.
async function callApifyActor(token, actorSlug, input, timeoutSec = 60) {
  const resp = await fetch(`https://api.apify.com/v2/acts/${actorSlug}/run-sync-get-dataset-items?token=${token}&timeout=${timeoutSec}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || data?.errorDescription || `Apify actor ${actorSlug} failed`);
  return Array.isArray(data) ? data : [data];
}

// Downloads a video/audio file and transcribes it via ElevenLabs Scribe.
// Used for any content that turns out to be video/speech, regardless of
// platform (X video posts, Instagram reels, YouTube fallback).
async function transcribeViaElevenLabs(env, mediaUrl) {
  const key = (env.ELEVENLABS_API_KEY || "").trim();
  if (!key) throw new Error("ELEVENLABS_API_KEY not configured");
  const mediaResp = await fetch(mediaUrl);
  if (!mediaResp.ok) throw new Error("Could not download media for transcription");
  const contentType = mediaResp.headers.get("content-type") || "";
  if (!/^(audio|video)\//.test(contentType)) throw new Error(`Media URL did not resolve to audio/video (got ${contentType || "unknown type"})`);
  const blob = await mediaResp.blob();
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("file", blob, "media");
  const resp = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: form,
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.detail?.message || data?.detail || "ElevenLabs transcription failed");
  return data.text || "";
}

// Scrapes the saved URL via the right Apify actor for its platform, then
// detects whether the actual post is text or video/speech from the scraped
// output itself (media attachments / videoUrl field) and transcribes when
// it is. Returns raw text, transcript (if any), detected author, and a note
// for anything degraded (e.g. transcription unavailable).
async function fetchSavedPostContent(env, platform, url) {
  const AT = (env.APIFY_TOKEN || "").trim();
  if (!AT) throw new Error("APIFY_TOKEN not configured");

  if (platform === "X") {
    // apidojo/tweet-scraper was returning noResults for every URL under this
    // account/tier (confirmed against known-good tweets, not just the saved
    // ones) — switched to calm_builder/twitter-posts-scraper, verified working
    // against real saved URLs during setup.
    const items = await callApifyActor(AT, "calm_builder~twitter-posts-scraper", {
      postUrls: [{ url }], flattenOutput: true, includeAuthorProfile: false,
    });
    const tweet = items?.[0];
    if (!tweet || tweet.success === false) throw new Error(tweet?.error || "Tweet not found or unavailable (deleted/private)");
    const text = tweet.text || "";
    const author = tweet.author?.username || tweet.author?.name || "";
    const media = tweet.media || [];
    const videoMedia = media.find(m => m.type === "video" || m.type === "animated_gif");
    let transcript = "", note = "";
    if (videoMedia) {
      const videoUrl = videoMedia.url || videoMedia.video_url || videoMedia.variants?.[0]?.url;
      if (videoUrl) {
        try { transcript = await transcribeViaElevenLabs(env, videoUrl); }
        catch (e) { note = `Video post — transcription failed (${e.message}), summarized from tweet text only.`; }
      } else {
        note = "Video post — no downloadable video URL found, summarized from tweet text only.";
      }
    }
    return { text, transcript, author, note };
  }

  if (platform === "Instagram") {
    const items = await callApifyActor(AT, "apify~instagram-scraper", { directUrls: [url], resultsType: "posts", resultsLimit: 1 });
    const post = items?.[0];
    if (!post || post.error) throw new Error(post?.errorDescription || "Instagram post not found or unavailable (private/deleted)");
    const text = post.caption || "";
    const author = post.ownerUsername || "";
    let transcript = "", note = "";
    if (post.videoUrl) {
      try { transcript = await transcribeViaElevenLabs(env, post.videoUrl); }
      catch (e) { note = `Reel/video post — transcription failed (${e.message}), summarized from caption only.`; }
    }
    return { text, transcript, author, note };
  }

  if (platform === "YouTube") {
    // codepoetry/youtube-transcript-ai-scraper failed on every video tested
    // (including the actor's own documented example) — switched to
    // karamelo/youtube-transcripts, verified working against real saved URLs.
    let transcript = "", title = "", author = "", note = "";
    try {
      const items = await callApifyActor(AT, "karamelo~youtube-transcripts", {
        urls: [url], outputFormat: "singleStringText", channelNameBoolean: true, descriptionBoolean: true,
      }, 90);
      const yt = items?.[0];
      if (!yt || !yt.captions) throw new Error("No captions returned (video may have none)");
      transcript = decodeHtmlEntities(String(yt.captions));
      title = yt.title || "";
      author = yt.channelName || "";
    } catch (e) {
      note = `Transcript actor failed (${e.message}) — trying audio download + ElevenLabs.`;
    }
    if (!transcript) {
      try {
        const dl = await callApifyActor(AT, "streamers~youtube-video-downloader", { videos: [{ url }], preferredFormat: "mp3" }, 180);
        const audioUrl = dl?.[0]?.downloadUrl || dl?.[0]?.url;
        if (!audioUrl) throw new Error("no downloadable audio URL returned");
        transcript = await transcribeViaElevenLabs(env, audioUrl);
        note = "Transcribed via audio download + ElevenLabs (no actor captions available).";
      } catch (e2) {
        note = (note ? note + " " : "") + `ElevenLabs fallback also failed (${e2.message}) — summarized from title only.`;
      }
    }
    return { text: title, transcript, author, note };
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

async function summarizeSavedPost(env, { text, transcript, platform, author }) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
  const content = [text, transcript].filter(Boolean).join("\n\n---\n\n") || "(no text or transcript could be extracted)";
  const prompt = `Summarize this ${platform} post for a content swipe file. Provide:
1. A short headline (under 8 words) capturing the core idea
2. A 2-4 sentence summary covering: the hook/opening, the core argument or story, and why it might be worth referencing later

Respond ONLY with JSON: {"headline": "...", "body": "..."}

Post content:
${content.slice(0, 12000)}
Author: ${author || "unknown"}`;
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6", max_tokens: 600,
      system: "You are summarizing social media content for a personal swipe file used for content research and inspiration. Be concise and specific — extract the actual hook, structure, or insight, not a generic description.",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || "Claude summarization failed");
  const raw = data.content?.[0]?.text || "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Could not parse summary response");
  const parsed = JSON.parse(sanitizeJsonControlChars(match[0]));
  return { headline: parsed.headline || "Saved Post", body: parsed.body || raw.slice(0, 500) };
}

async function patchSavedPostPage(pageId, properties) {
  const resp = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
    body: JSON.stringify({ properties }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || "Notion page update failed");
  return data;
}

// Full raw text/transcript has no 2000-char property limit workaround here —
// it's written into the page BODY as paragraph blocks (same pattern as the
// Strategy docs elsewhere in this worker), chunked under Notion's per-block
// rich_text length limit and batched under the 100-blocks-per-request cap.
async function appendFullContentToPage(pageId, { text, transcript }) {
  const chunk = s => { const out = []; let r = s; while (r.length) { out.push(r.slice(0, 1900)); r = r.slice(1900); } return out; };
  const blocks = [];
  if (transcript) {
    blocks.push({ object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: "Full Transcript" } }] } });
    for (const c of chunk(transcript)) blocks.push({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: c } }] } });
  }
  if (text) {
    blocks.push({ object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: transcript ? "Original Post Text" : "Full Text" } }] } });
    for (const c of chunk(text)) blocks.push({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: c } }] } });
  }
  for (let i = 0; i < blocks.length; i += 90) {
    const batch = blocks.slice(i, i + 90);
    const resp = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
      body: JSON.stringify({ children: batch }),
    });
    if (!resp.ok) { const d = await resp.json(); throw new Error(d.message || "Failed to write transcript blocks"); }
  }
}

// The iOS Shortcut that saves rows only reliably fills in URL (and not
// always even that) — Platform is regularly left empty. Rather than depend
// on it, detect the platform from the URL's own hostname whenever the
// Platform select is unset, and backfill the select so it's visible in
// Notion for manual curation too.
function detectPlatformFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) return "X";
    if (host === "instagram.com" || host.endsWith(".instagram.com")) return "Instagram";
    if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") return "YouTube";
  } catch { /* invalid URL */ }
  return null;
}

async function processSavedPost(env, page) {
  const props = page.properties || {};
  const url = (props.URL?.url || "").trim();
  let platform = props.Platform?.select?.name;
  const pageId = page.id;

  await patchSavedPostPage(pageId, { Status: { status: { name: "In progress" } } });

  try {
    if (!url) throw new Error("No URL set on this row");
    if (!platform) {
      platform = detectPlatformFromUrl(url);
      if (!platform) throw new Error(`Could not detect platform from URL: ${url}`);
      await patchSavedPostPage(pageId, { Platform: { select: { name: platform } } });
    }

    const { text, transcript, author, note } = await fetchSavedPostContent(env, platform, url);
    if (!text.trim() && !transcript.trim()) throw new Error("No content could be extracted from this URL");

    const summary = await summarizeSavedPost(env, { text, transcript, platform, author });

    const patchProps = {
      Name: { title: [{ type: "text", text: { content: summary.headline.slice(0, 200) } }] },
      Notes: { rich_text: [{ type: "text", text: { content: (summary.body + (note ? `\n\n(${note})` : "")).slice(0, 1990) } }] },
      Status: { status: { name: "Done" } },
      "Summary Error": { rich_text: [] },
    };
    if (author) patchProps.Account = { rich_text: [{ type: "text", text: { content: author.slice(0, 1990) } }] };
    await patchSavedPostPage(pageId, patchProps);
    await appendFullContentToPage(pageId, { text, transcript });

    return { id: pageId, ok: true };
  } catch (e) {
    await patchSavedPostPage(pageId, {
      Status: { status: { name: "Not started" } },
      "Summary Error": { rich_text: [{ type: "text", text: { content: String(e.message || e).slice(0, 1990) } }] },
    });
    return { id: pageId, ok: false, error: e.message };
  }
}

async function runSavedPostsPipeline(env, limit) {
  const rows = await notionQuery(SAVED_POSTS_DB, {
    filter: { property: "Status", status: { equals: "Not started" } },
  });
  const toRun = limit ? rows.slice(0, limit) : rows;
  const results = [];
  for (const page of toRun) results.push(await processSavedPost(env, page));
  return { processed: results.length, ok: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results };
}

export default {
  async fetch(request, env) {
    // Load secrets from environment on every request (.trim() guards against
    // trailing newlines that piped input (e.g. PowerShell) can introduce)
    NOTION_TOKEN = (env.NOTION_TOKEN || "").trim();
    const PIN_VAL        = (env.PIN             || "").trim();
    const HMAC_SECRET    = (env.HMAC_SECRET     || "").trim();
    const TS_SECRET      = (env.TURNSTILE_SECRET|| "1x0000000000000000000000000000000AA").trim();
    const AC_API_URL     = (env.ACTIVECAMPAIGN_API_URL || "").trim().replace(/\/$/, "");
    const AC_API_KEY     = (env.ACTIVECAMPAIGN_API_KEY || "").trim();

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
      if (url.pathname === "/ping-claude") {
        const testResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 10, messages: [{ role: "user", content: "hi" }] })
        });
        const testData = await testResp.json();
        return json({ http_status: testResp.status, ok: testResp.ok, response: testData });
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

      // --- Input validation --- (phone is optional — some campaigns are email-only lead magnets)
      if (!email || !fraudType) return json({ error: "email and fraudType are required" }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Invalid email address" }, 400);
      if (phone && !/^[\d\s\-\+\(\)\.]{7,20}$/.test(phone)) return json({ error: "Invalid phone number" }, 400);
      const validFraudTypes = ["Robo-signing","Chain of title fraud","Loan modification fraud","Improper procedures","Mortgage servicing fraud","MERS assignment void","Divorce - property dispute","Probate - estate sale","Will contest","Executor dispute","Coaching - one hour session","Coaching - package","Coaching - general inquiry","Webguy B2C - done-for-you system","Webguy B2C - template","Webguy B2B - content machine","Webguy B2B - AI implementation","Webguy B2B - retainer","Webguy - general inquiry","Webguy - Financial Freedom","Webguy - Retirement Ready","Webguy - Dream Home Build","Webguy - Hard Grind","Webguy - Mountainwize Purpose Coaching","Evergreen Home - Garden Planning Book","Other"];
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
            ...(phone ? { Phone: { phone_number: phone } } : {}),
            "Fraud Type":  { select:       { name: fraudType } },
            Note:          { rich_text:    [{ type: "text", text: { content: (note || "").slice(0,600) } }] },
            Status:        { select:       { name: "New" } },
          }
        }),
      });
      const result = await resp.json();
      if (!resp.ok) return json({ error: "Submission failed  -  please try again" }, resp.status);

      // --- ActiveCampaign: tag the contact so the matching automation fires ---
      // Best-effort only — a failure here must never break lead capture into Notion.
      if (AC_API_URL && AC_API_KEY && campaign) {
        try {
          const acHeaders = { "Api-Token": AC_API_KEY, "Content-Type": "application/json" };
          const syncResp = await fetch(`${AC_API_URL}/api/3/contact/sync`, {
            method: "POST",
            headers: acHeaders,
            body: JSON.stringify({ contact: { email, phone } }),
          });
          const syncData = await syncResp.json();
          const contactId = syncData.contact?.id;

          if (contactId) {
            const tagName = `lead-${campaign}`;
            const searchResp = await fetch(`${AC_API_URL}/api/3/tags?search=${encodeURIComponent(tagName)}`, { headers: acHeaders });
            const searchData = await searchResp.json();
            let tagId = (searchData.tags || []).find(t => t.tag === tagName)?.id;

            if (!tagId) {
              const createResp = await fetch(`${AC_API_URL}/api/3/tags`, {
                method: "POST",
                headers: acHeaders,
                body: JSON.stringify({ tag: { tag: tagName, tagType: "contact" } }),
              });
              const createData = await createResp.json();
              tagId = createData.tag?.id;
            }

            if (tagId) {
              await fetch(`${AC_API_URL}/api/3/contactTags`, {
                method: "POST",
                headers: acHeaders,
                body: JSON.stringify({ contactTag: { contact: contactId, tag: tagId } }),
              });
            }
          }
        } catch (acErr) {
          // Swallow — ActiveCampaign hiccups shouldn't fail the lead submission.
        }
      }

      return json({ success: true });
    }

    // â"€â"€ All other actions require a valid session token â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    if (!HMAC_SECRET || !(await verifyToken(body.token, HMAC_SECRET))) {
      return json({ error: "Unauthorized" }, 401);
    }

    try {
      // ── getContentOutputStats ──
      // Weekly Reel-vs-Carousel output from the 📝 Content Strategy DB, for the
      // dashboard's "Weekly Content Output" card. "Output" = items whose
      // Scheduled Date falls within a given Mon–Sun week.
      // DECISION: default to Status = "Published" (what actually went out).
      // Pass mode:"planned" to instead count everything scheduled that week.
      if (body.action === "getContentOutputStats") {
        const weeks = Math.max(1, Math.min(26, body.weeks || 8));
        const mode = body.mode === "planned" ? "planned" : "published";
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" };
        const iso = d => d.toISOString().slice(0, 10);

        // Monday (UTC) of the current week → earliest & latest Monday in the window.
        const now = new Date();
        const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const dow = (today.getUTCDay() + 6) % 7; // 0 = Monday
        const curMonday = new Date(today); curMonday.setUTCDate(today.getUTCDate() - dow);
        const firstMonday = new Date(curMonday); firstMonday.setUTCDate(curMonday.getUTCDate() - (weeks - 1) * 7);
        const curSunday = new Date(curMonday); curSunday.setUTCDate(curMonday.getUTCDate() + 6);

        const buckets = [];
        for (let i = 0; i < weeks; i++) {
          const m = new Date(firstMonday); m.setUTCDate(firstMonday.getUTCDate() + i * 7);
          buckets.push({ weekStart: iso(m), reels: 0, carousels: 0 });
        }
        const byWeekStart = Object.fromEntries(buckets.map((b, i) => [b.weekStart, i]));
        const bucketIndex = dateStr => {
          const d = new Date(dateStr + "T00:00:00Z");
          if (isNaN(d)) return -1;
          const dd = (d.getUTCDay() + 6) % 7;
          const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - dd);
          const idx = byWeekStart[iso(mon)];
          return idx === undefined ? -1 : idx;
        };

        const andFilter = [
          { or: [ { property: "Format", select: { equals: "Reel" } }, { property: "Format", select: { equals: "Carousel" } } ] },
          { property: "Scheduled Date", date: { on_or_after: iso(firstMonday) } },
          { property: "Scheduled Date", date: { on_or_before: iso(curSunday) } },
        ];
        if (mode === "published") andFilter.push({ property: "Status", select: { equals: "Published" } });

        let cursor, counted = 0;
        for (let page = 0; page < 20; page++) {
          const resp = await fetch(`https://api.notion.com/v1/databases/${CONTENT_STRATEGY_DB}/query`, {
            method: "POST", headers: hdr,
            body: JSON.stringify({ filter: { and: andFilter }, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
          });
          const data = await resp.json();
          if (!resp.ok) return json({ error: data.message || "Notion query failed" }, resp.status);
          for (const p of (data.results || [])) {
            const fmt = p.properties?.Format?.select?.name;
            const ds = p.properties?.["Scheduled Date"]?.date?.start;
            if (!fmt || !ds) continue;
            const idx = bucketIndex(ds.slice(0, 10));
            if (idx === -1) continue;
            if (fmt === "Reel") buckets[idx].reels++;
            else if (fmt === "Carousel") buckets[idx].carousels++;
            counted++;
          }
          if (!data.has_more) break;
          cursor = data.next_cursor;
        }
        const cur = buckets[buckets.length - 1];
        return json({ mode, weeks: buckets, current: { weekStart: cur.weekStart, reels: cur.reels, carousels: cur.carousels }, counted });
      }

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
          const rawGrouping = props.Grouping?.rich_text?.map(x => x.plain_text).join("") || "";
          const gtParts = rawGrouping.split(" > ");
          campTitles[campId].titles.push({
            id, title, status,
            phase:      gtParts.length > 1 ? gtParts[0].trim() : "",
            grouping:   gtParts.length > 1 ? gtParts.slice(1).join(" > ").trim() : rawGrouping,
            productId:  (props.product?.relation || [])[0]?.id?.replace(/-/g,"") || "__none__",
            methodId:   (props.method?.relation  || [])[0]?.id?.replace(/-/g,"") || "__none__",
          });
        });

        // Add all campaigns — even those with no titles
        Object.entries(campById).forEach(([campId, camp]) => {
          if (!campTitles[campId]) campTitles[campId] = { name: camp.name, site: camp.site, parentCampaignId: camp.parentCampaignId || "", titles: [] };
        });

        // Resolve product and method names
        const prodIdSet = new Set(), methIdSet = new Set();
        Object.values(campTitles).forEach(c => c.titles.forEach(t => {
          if (t.productId !== '__none__') prodIdSet.add(t.productId);
          if (t.methodId  !== '__none__') methIdSet.add(t.methodId);
        }));
        const dashify = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const fetchPgName = async id => {
          try {
            const r = await fetch(`https://api.notion.com/v1/pages/${dashify(id)}`, { headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION } });
            const p = await r.json();
            return { id, name: (p.properties?.Name?.title || p.properties?.title?.title || []).map(x => x.plain_text).join("") || "?" };
          } catch(e) { return { id, name: "?" }; }
        };
        const [prodPages2, methPages2] = await Promise.all([
          Promise.all([...prodIdSet].map(fetchPgName)),
          Promise.all([...methIdSet].map(fetchPgName)),
        ]);
        const pNames = Object.fromEntries(prodPages2.map(p => [p.id, p.name]));
        const mNames = Object.fromEntries(methPages2.map(p => [p.id, p.name]));
        Object.values(campTitles).forEach(c => c.titles.forEach(t => {
          t.productName = t.productId === '__none__' ? 'No Product' : (pNames[t.productId] || '?');
          t.methodName  = t.methodId  === '__none__' ? 'No Method'  : (mNames[t.methodId]  || '?');
        }));

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
        // Extended idea-input shape: an idea (the title) plus optional method/
        // product relations, a content description (→ Core Idea), seed
        // keywords (→ "seed idea"), and research instructions (→ Notes) that
        // downstream research flows read back via buildTitleSeedContext.
        // productId used to be silently ignored here — product sites were
        // creating titles with no product relation at all.
        const { title, campaignId, productId, methodId, status, grouping, description, seedKeywords, researchInstructions } = body;
        if (!title) return json({ error: "title required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };

        const props = {
          Title:  { title: [{ type: "text", text: { content: title } }] },
          Status: { select: { name: status || "Development" } },
        };
        const rtProp = v => ({ rich_text: [{ type: "text", text: { content: String(v).slice(0, 1990) } }] });
        if (grouping) props["Grouping"] = rtProp(grouping);
        if (description) props["Core Idea"] = rtProp(description);
        if (seedKeywords) props["seed idea"] = rtProp(seedKeywords);
        if (researchInstructions) props["Notes"] = rtProp(researchInstructions);
        if (campaignId) props["Campaign"] = { relation: [{ id: dashId(campaignId) }] };
        if (productId && productId !== '__none__' && productId !== campaignId) props["product"] = { relation: [{ id: dashId(productId) }] };
        if (methodId) props["method"] = { relation: [{ id: dashId(methodId) }] };

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

      // ── getProductTypes ──
      // Distinct Type values already in use across the whole Products DB —
      // feeds the Add Product modal's Type dropdown (search-existing-or-
      // create-new), so "new type" can be detected client-side and routed to
      // matchProductMethod's researched-from-scratch path.
      if (body.action === "getProductTypes") {
        const rows = await notionQuery(PRODUCTS_DB, { page_size: 100 });
        const seen = new Map();
        for (const p of rows) {
          const t = (p.properties?.Type?.rich_text || []).map(x => x.plain_text).join("").trim();
          if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
        }
        return json({ types: [...seen.values()].sort((a, b) => a.localeCompare(b)) });
      }

      // ── setProductType ──
      // Explicitly (re)writes a product's Type property, independent of
      // creation. Needed because the Add Product modal's name-dropdown
      // "+ Create" can fire before the Type field is filled in — this closes
      // that race by letting the front-end save Type again right before
      // matching runs, regardless of how/when the product was created.
      if (body.action === "setProductType") {
        const { productId, type } = body;
        if (!productId || !type) return json({ error: "productId and type required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { Type: { rich_text: [{ type: "text", text: { content: String(type).slice(0, 100) } }] } } }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      // ── updateProductTitleDescription ──
      // Lets the ⚙ Methods modal edit a product's Name/Description in place
      // (pre-filled from Notion when the modal opens) — since these are the
      // PRIMARY signal suggestProductMethod reasons from, editing them here
      // and re-suggesting is how a vague/AI-seeded product gets sharpened
      // before methods are chosen.
      if (body.action === "updateProductTitleDescription") {
        const { productId, title, description, keywords } = body;
        if (!productId) return json({ error: "productId required" }, 400);
        if (!title && description == null && keywords == null) return json({ error: "title, description, or keywords required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const props = {};
        if (title) props["Name"] = { title: [{ type: "text", text: { content: String(title).slice(0, 200) } }] };
        if (description != null) props["Description"] = { rich_text: [{ type: "text", text: { content: String(description).slice(0, 1990) } }] };
        if (keywords != null) props["Keywords"] = { rich_text: [{ type: "text", text: { content: String(keywords).slice(0, 1990) } }] };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: props }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      // ── generateProductKeywords ──
      // Refines/expands the product's own Keywords field, grounded in its
      // Title + Description (+ whatever's already there, to refine rather
      // than replace from scratch). This is the ONE place Keywords lives —
      // the Strategy panel's fields all read this rather than having their
      // own separate Keywords field, so there's a single "Generate" for the
      // whole product's keyword set at the top of the page.
      if (body.action === "generateProductKeywords") {
        const { productId } = body;
        if (!productId) return json({ error: "productId required" }, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const productPage = await fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, { headers: hdr }).then(r => r.json());
        const pp = productPage.properties || {};
        const productName = (pp.Name?.title || []).map(t => t.plain_text).join("") || "Product";
        const productDesc = (pp.Description?.rich_text || []).map(t => t.plain_text).join("");
        const currentKeywords = (pp.Keywords?.rich_text || []).map(t => t.plain_text).join("");

        const prompt = `${researchGuidelinesBlock(body.researchGuidelines)}You are an SEO/positioning strategist. Generate a refined, specific keyword list for this product.

PRODUCT: ${productName}
DESCRIPTION: ${productDesc || "(none)"}
${currentKeywords ? `CURRENT KEYWORDS (refine and expand these, don't just repeat them back): ${currentKeywords}` : ''}

Return 10-15 real, specific keywords/phrases this product should be associated with — a mix of category terms, buyer-intent phrases, and long-tail specifics. Comma-separated, no other text, no numbering, no explanation.`;

        const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
        });
        const aiData = await aiResp.json();
        if (!aiResp.ok) return json({ error: aiData.error?.message || "Claude API error" }, 500);
        const keywords = (aiData.content?.[0]?.text || "").trim();
        if (!keywords) return json({ error: "Empty response from Claude" }, 500);

        await fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, {
          method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { Keywords: { rich_text: [{ type: "text", text: { content: keywords.slice(0, 1990) } }] } } }),
        });
        return json({ success: true, keywords });
      }

      if (body.action === "createProduct") {
        const { title, type, description } = body;
        if (!title) return json({ error: "title required" }, 400);
        const createProps = { Name: { title: [{ type: "text", text: { content: title } }] } };
        // Type = concrete FORMAT (PDF/Email/Quiz/Coaching/Membership/etc.) —
        // set at manual creation so the ecosystem/method pipeline (run right
        // after by the front-end) has a real signal to work from.
        if (type) createProps["Type"] = { rich_text: [{ type: "text", text: { content: String(type).slice(0, 100) } }] };
        if (description) createProps["Description"] = { rich_text: [{ type: "text", text: { content: String(description).slice(0, 1990) } }] };
        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({
            parent: { database_id: PRODUCTS_DB },
            properties: createProps
          }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
        return json({ success: true, id: result.id.replace(/-/g,""), name: title });
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

      if (body.action === "getPageBody") {
        const { pageId } = body;
        if (!pageId) return json({ error: "pageId required" }, 400);
        const dash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/blocks/${dash(pageId)}/children?page_size=100`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }
        });
        const data = await resp.json();
        const text = (data.results || [])
          .filter(b => b.type === "paragraph")
          .map(b => b.paragraph?.rich_text?.map(t => t.plain_text).join("") || "")
          .join("\n\n");
        return json({ text });
      }

      // ── getTitleContent ──
      // Parses a Content Strategy title's body into structured sections —
      // used by the carousel "Build" button to pull slide headline/body pairs
      // (and Description/Sources for description-only concepts) back out of
      // the heading_3 + paragraph/bullet structure written by
      // generateTitleSlides / researchAndGenerateCarouselTitles.
      if (body.action === "getTitleContent") {
        const { pageId } = body;
        if (!pageId) return json({ error: "pageId required" }, 400);
        const dash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/blocks/${dash(pageId)}/children?page_size=100`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }
        });
        const data = await resp.json();
        const blocks = data.results || [];
        const sections = [];
        let current = null;
        for (const b of blocks) {
          if (b.type === "heading_3") {
            current = { heading: (b.heading_3?.rich_text || []).map(t => t.plain_text).join(""), lines: [] };
            sections.push(current);
          } else if (current && (b.type === "paragraph" || b.type === "bulleted_list_item")) {
            const rt = b[b.type]?.rich_text || [];
            const text = rt.map(t => t.plain_text).join("");
            const url = (rt.find(t => t.text?.link) || {}).text?.link?.url || null;
            const bold = !!rt[0]?.annotations?.bold;
            if (text) current.lines.push({ text, url, bold });
          }
        }
        const findSection = name => sections.find(s => s.heading.toLowerCase() === name.toLowerCase());
        const slides = sections
          .filter(s => /^Slide \d+/i.test(s.heading))
          .map(s => ({
            label: s.heading,
            headline: (s.lines.find(l => l.bold) || s.lines[0] || {}).text || "",
            body: (s.lines.find(l => !l.bold) || {}).text || "",
          }));
        const description = findSection("Description")?.lines?.[0]?.text || "";
        const caption = findSection("Caption")?.lines?.[0]?.text || "";
        const hashtags = findSection("Hashtags")?.lines?.[0]?.text || "";
        const sources = (findSection("Sources")?.lines || []).filter(l => l.url).map(l => ({ text: l.text, url: l.url }));
        return json({ slides, description, caption, hashtags, sources });
      }

      if (body.action === "updatePageBody") {
        const { pageId, text } = body;
        if (!pageId) return json({ error: "pageId required" }, 400);
        const dash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const dashed = dash(pageId);
        // Archive existing children first by fetching and deleting
        const existing = await fetch(`https://api.notion.com/v1/blocks/${dashed}/children?page_size=100`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }
        }).then(r => r.json());
        await Promise.all((existing.results || []).map(b =>
          fetch(`https://api.notion.com/v1/blocks/${b.id}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }
          })
        ));
        // Write new paragraphs (chunk by 2000 chars per block, max 100 blocks per request)
        const paragraphs = (text || "").split(/\n\n+/).filter(p => p.trim());
        const children = paragraphs.length
          ? paragraphs.map(p => ({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: p.slice(0, 2000) } }] } }))
          : [{ object: "block", type: "paragraph", paragraph: { rich_text: [] } }];
        const resp = await fetch(`https://api.notion.com/v1/blocks/${dashed}/children`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ children })
        });
        if (!resp.ok) { const r = await resp.json(); return json({ error: r.message || "Update failed" }, resp.status); }
        return json({ success: true });
      }

      if (body.action === "deleteMethod") {
        const { methodId } = body;
        if (!methodId) return json({ error: "methodId required" }, 400);
        const dash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(methodId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
        });
        if (!resp.ok) { const r = await resp.json(); return json({ error: r.message || "Delete failed" }, resp.status); }
        return json({ success: true });
      }

      if (body.action === "searchMethods") {
        const { query } = body;
        const rows = await notionQuery(METHODS_DB, { sorts: [{ property: "Name", direction: "ascending" }] });
        const methods = rows.map(m => ({
          id:   m.id.replace(/-/g,""),
          name: m.properties.Name?.title?.map(x => x.plain_text).join("") || "Untitled",
        })).filter(m => !query || m.name.toLowerCase().includes(query.toLowerCase()));
        // Same payload-guard-not-cap rationale as searchProducts.
        return json({ methods: methods.slice(0, 500) });
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

      if (body.action === "getCampaignProducts") {
        const { campaignId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const campResp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        const campPage = await campResp.json();
        const productRels = campPage.properties?.["Products"]?.relation || [];
        if (!productRels.length) return json({ products: [] });
        const productPages = await Promise.all(productRels.map(r =>
          fetch(`https://api.notion.com/v1/pages/${r.id}`, {
            headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
          }).then(res => res.json())
        ));
        const products = productPages.map(p => ({
          id:     p.id.replace(/-/g,""),
          name:   p.properties?.Name?.title?.map(t => t.plain_text).join("") || "Untitled",
          status: p.properties?.Status?.select?.name || "In Development",
          // The product's URL property — feeds the "site" chip on the product
          // row (links to its productsites/ page when set).
          productsite: p.properties?.["URL"]?.url || null,
          // Shared tag set by the ecosystem pipeline (createEcosystemProduct) —
          // groups sibling products spawned from the same seed idea.
          ecosystem: (p.properties?.["Ecosystem"]?.rich_text || []).map(t => t.plain_text).join("") || null,
          // Type = concrete FORMAT (PDF/Email/Quiz/Coaching/Membership/etc.) —
          // shown on the row and fed into matchProductMethod's matching.
          type: (p.properties?.["Type"]?.rich_text || []).map(t => t.plain_text).join("") || null,
          // Marketing Phase = funnel role (Top of funnel/Lead-in/Core
          // offer/Retention) — orders rows within an ecosystem group.
          marketingPhase: (p.properties?.["Marketing Phase"]?.rich_text || []).map(t => t.plain_text).join("") || null,
        }));
        return json({ products });
      }

      if (body.action === "addCampaignProduct") {
        const { campaignId, productId } = body;
        if (!campaignId || !productId) return json({ error: "campaignId and productId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const campResp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        const campPage = await campResp.json();
        const existing = (campPage.properties?.["Products"]?.relation || []).map(r => ({ id: r.id }));
        if (!existing.some(r => r.id.replace(/-/g,"") === productId.replace(/-/g,""))) existing.push({ id: dashId(productId) });
        const patchResp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Products": { relation: existing } } }),
        });
        const result = await patchResp.json();
        if (!patchResp.ok) return json({ error: result.message || "Update failed" }, patchResp.status);
        return json({ success: true });
      }

      if (body.action === "removeCampaignProduct") {
        const { campaignId, productId } = body;
        if (!campaignId || !productId) return json({ error: "campaignId and productId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const campResp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        const campPage = await campResp.json();
        const filtered = (campPage.properties?.["Products"]?.relation || [])
          .filter(r => r.id.replace(/-/g,"") !== productId.replace(/-/g,""))
          .map(r => ({ id: r.id }));
        const patchResp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Products": { relation: filtered } } }),
        });
        const result = await patchResp.json();
        if (!patchResp.ok) return json({ error: result.message || "Update failed" }, patchResp.status);
        return json({ success: true });
      }

      if (body.action === "searchProducts") {
        const { query } = body;
        const rows = await notionQuery(PRODUCTS_DB, { sorts: [{ property: "Name", direction: "ascending" }] });
        const products = rows.map(p => ({
          id:   p.id.replace(/-/g,""),
          name: p.properties.Name?.title?.map(x => x.plain_text).join("") || "Untitled",
        })).filter(p => !query || p.name.toLowerCase().includes(query.toLowerCase()));
        // No tight cap: pickers filter client-side over the full list — a 50
        // cap silently hid every product past the 50th alphabetically (204 in
        // the DB when this bit). 500 is a payload guard, not a working limit.
        return json({ products: products.slice(0, 500) });
      }

      if (body.action === "uploadProductFile") {
        const { productId, fileName, contentType, fileData } = body;
        if (!productId || !fileName || !contentType || !fileData) return json({ error: "productId, fileName, contentType, fileData required" }, 400);
        const dashId = s => { const r = s.replace(/-/g,""); return r.slice(0,8)+'-'+r.slice(8,12)+'-'+r.slice(12,16)+'-'+r.slice(16,20)+'-'+r.slice(20); };
        const dashed = dashId(productId);
        const binary = atob(fileData);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const createResp = await fetch("https://api.notion.com/v1/file_uploads", {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ content_type: contentType, mode: "single_part" }),
        });
        const createData = await createResp.json();
        if (!createResp.ok) return json({ error: createData.message || "File upload init failed" }, createResp.status);
        const { id: uploadId, upload_url: uploadUrl } = createData;
        if (!uploadId) return json({ error: "File upload init returned no ID" }, 500);
        const formData = new FormData();
        formData.append("file", new Blob([bytes], { type: contentType }), fileName);
        const putResp = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
          body: formData,
        });
        if (!putResp.ok) return json({ error: "File upload failed: " + (await putResp.text()).slice(0, 200) }, putResp.status);
        // Fetch existing files to append rather than overwrite
        const existingResp = await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        const existingData = await existingResp.json();
        const existingFiles = (existingData.properties?.["Files"]?.files || []).flatMap(f => {
          if (f.type === "file" && f.file?.url) return [{ type: "file", name: f.name, file: { url: f.file.url } }];
          if (f.type === "external" && f.external?.url) return [{ type: "external", name: f.name, external: { url: f.external.url } }];
          return [];
        });
        const patchResp = await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Files": { files: [...existingFiles, { type: "file_upload", name: fileName, file_upload: { id: uploadId } }] } } }),
        });
        const patchData = await patchResp.json();
        if (!patchResp.ok) return json({ error: patchData.message || "Failed to attach file to product" }, patchResp.status);
        const fileUrl = patchData.properties?.["Files"]?.files?.slice(-1)[0]?.file?.url || null;
        return json({ success: true, fileName, fileUrl });
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

      if (body.action === "getCampaignMethods") {
        const { campaignId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const campResp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        const campPage = await campResp.json();
        const methodRels = campPage.properties?.["Methods"]?.relation || [];
        if (!methodRels.length) return json({ methods: [] });
        const methodPages = await Promise.all(methodRels.map(r =>
          fetch(`https://api.notion.com/v1/pages/${r.id}`, {
            headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
          }).then(res => res.json())
        ));
        const methods = methodPages.map(p => ({
          id:   p.id.replace(/-/g,""),
          name: p.properties?.Name?.title?.map(t => t.plain_text).join("") || "Untitled",
        }));
        return json({ methods });
      }

      if (body.action === "addCampaignMethod") {
        const { campaignId, methodId } = body;
        if (!campaignId || !methodId) return json({ error: "campaignId and methodId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const campResp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        const campPage = await campResp.json();
        const existing = (campPage.properties?.["Methods"]?.relation || []).map(r => ({ id: r.id }));
        const alreadyLinked = existing.some(r => r.id.replace(/-/g,"") === methodId.replace(/-/g,""));
        if (!alreadyLinked) existing.push({ id: dashId(methodId) });
        const patchResp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Methods": { relation: existing } } }),
        });
        const result = await patchResp.json();
        if (!patchResp.ok) return json({ error: result.message || "Update failed" }, patchResp.status);
        return json({ success: true });
      }

      if (body.action === "removeCampaignMethod") {
        const { campaignId, methodId } = body;
        if (!campaignId || !methodId) return json({ error: "campaignId and methodId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const campResp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        const campPage = await campResp.json();
        const filtered = (campPage.properties?.["Methods"]?.relation || [])
          .filter(r => r.id.replace(/-/g,"") !== methodId.replace(/-/g,""))
          .map(r => ({ id: r.id }));
        const patchResp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Methods": { relation: filtered } } }),
        });
        const result = await patchResp.json();
        if (!patchResp.ok) return json({ error: result.message || "Update failed" }, patchResp.status);
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
              filter: { or: [
                { property: "Asset Status", select: { equals: "Published" } },
                { property: "Asset Status", select: { equals: "Publish" } },
              ]},
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

      if (body.action === "checkDomains") {
        const { keywords } = body;
        if (!keywords) return json({ error: "keywords required" }, 400);
        const words = keywords.split(',')
          .map(k => k.trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
          .filter(w => w.length >= 3);
        const unique = [...new Set(words)];
        const tlds = ['.com', '.net', '.online', '.info'];
        const candidates = new Set();
        // single words
        unique.slice(0, 6).forEach(w => tlds.forEach(t => candidates.add(w + t)));
        // two-word combos (.com only)
        for (let i = 0; i < Math.min(unique.length, 4); i++) {
          for (let j = 0; j < Math.min(unique.length, 4); j++) {
            if (i !== j) candidates.add(unique[i] + unique[j] + '.com');
          }
        }
        const list = [...candidates].slice(0, 30);
        const results = await Promise.all(list.map(async domain => {
          try {
            const r = await fetch(`https://rdap.org/domain/${domain}`, { headers: { Accept: 'application/json' } });
            return { domain, available: r.status === 404 };
          } catch(e) {
            return { domain, available: null };
          }
        }));
        return json({ results });
      }

      if (body.action === "updateCampaignDomain") {
        const { campaignId, domain } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const propVal = { rich_text: domain ? [{ type: "text", text: { content: domain } }] : [] };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "domain": propVal } }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      if (body.action === "updateCampaignEmail") {
        const { campaignId, email } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const propVal = { rich_text: email ? [{ type: "text", text: { content: email } }] : [] };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashId(campaignId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "email": propVal } }),
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
            name:        props.Name?.title?.map(t => t.plain_text).join("") || "Untitled",
            campaign:    campaignName,
            site,
            status:      props.Status?.select?.name || "",
            microsite:   micrositeUrl,
            productsite: props["URL"]?.url || null,
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

      // ── createProductFromTitle ──
      // Spins an existing Content Strategy title into a seed Product: copies the
      // title's name + Core Idea + full body text into the product's
      // Name/Description/Notes, carries over the campaign and the title's method
      // relation, so a method can be re-run against it as a fresh product seed.
      // Powers the title-row "♻ copy to product & re-run" button.
      if (body.action === "createProductFromTitle") {
        const { titleId, campaignId } = body;
        if (!titleId) return json({ error: "titleId required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const [titlePage, blocksResp] = await Promise.all([
          fetch(`https://api.notion.com/v1/pages/${dash(titleId)}`, { headers: hdr }).then(r => r.json()),
          fetch(`https://api.notion.com/v1/blocks/${dash(titleId)}/children?page_size=100`, { headers: hdr }).then(r => r.json()),
        ]);
        if (titlePage.object === "error" || !titlePage.properties) return json({ error: titlePage.message || "Title not found" }, 404);
        const tp = titlePage.properties || {};
        const titleText = (tp.Title?.title || tp.Name?.title || []).map(t => t.plain_text).join("") || "Untitled";
        const coreIdea = (tp["Core Idea"]?.rich_text || []).map(t => t.plain_text).join("");
        const methodRel = (tp.method?.relation || [])[0]?.id?.replace(/-/g,"") || "";
        const campRel = (campaignId || (tp.Campaign?.relation || [])[0]?.id || "").toString().replace(/-/g,"");
        // Full body text, preserving heading/bullet structure as plain text.
        const bodyText = (blocksResp.results || []).map(b => {
          const type = b.type; const rich = b[type]?.rich_text || [];
          const text = rich.map(t => t.plain_text).join("");
          if (!text) return "";
          if (/^heading/.test(type)) return `\n${text}`;
          if (type === "bulleted_list_item" || type === "numbered_list_item") return `• ${text}`;
          return text;
        }).filter(Boolean).join("\n");
        // Notion caps a single rich_text run at 2000 chars — keep the seed under.
        const description = ([coreIdea, bodyText].filter(Boolean).join("\n\n") || titleText).slice(0, 1990);
        const props = {
          Name:        { title: [{ type: "text", text: { content: titleText.slice(0, 200) } }] },
          Status:      { select: { name: "In Development" } },
          Description: { rich_text: [{ type: "text", text: { content: description } }] },
          Notes:       { rich_text: [{ type: "text", text: { content: `Seeded from title ${titleId} for method re-run.`.slice(0, 1990) } }] },
        };
        if (campRel)   props["Campaigns"] = { relation: [{ id: dash(campRel) }] };
        if (methodRel) props["Methods"]   = { relation: [{ id: dash(methodRel) }] };
        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ parent: { database_id: PRODUCTS_DB }, properties: props }),
        });
        const result = await resp.json();
        if (!resp.ok || !result.id) return json({ error: result.message || "Create failed" }, resp.status || 500);
        return json({ success: true, productId: result.id.replace(/-/g,""), productName: titleText, methodId: methodRel || null });
      }

      // ── createProductSite ──
      // Deploys a per-product admin site under productsites/{slug}/ by committing
      // to GitHub (GitHub Pages serves it). The Worker can't run local git, so it
      // fetches the operator-resilience-intensive template via the GitHub API,
      // fills in PRODUCT_ID / RESEARCH_ID / SITE_URL / Notion links / title, and
      // PUTs productsites/{slug}/index.html. Then sets the product's URL property
      // so the row's "site" chip links to it. Powers the product-row "+ site"
      // button. Requires a GITHUB_TOKEN secret (PAT with repo write scope).
      if (body.action === "createProductSite") {
        const { productId, campaignId } = body;
        if (!productId) return json({ error: "productId required" }, 400);
        const GT = (env.GITHUB_TOKEN || '').trim();
        if (!GT) return json({ error: "GITHUB_TOKEN not set — run: wrangler secret put GITHUB_TOKEN (a GitHub PAT with 'repo' / Contents write scope for cabuzzard/dash)" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const REPO = "cabuzzard/dash", BRANCH = "main", TEMPLATE_PATH = "productsites/operator-resilience-intensive/index.html";
        const gh = { "Authorization": `Bearer ${GT}`, "Accept": "application/vnd.github+json", "User-Agent": "dash-worker" };

        // Product name → slug; look up the campaign's research for RESEARCH_ID.
        const productPage = await fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, { headers: hdr }).then(r => r.json());
        if (productPage.object === "error" || !productPage.properties) return json({ error: productPage.message || "Product not found" }, 404);
        const productName = (productPage.properties?.Name?.title || []).map(t => t.plain_text).join("") || "Product";
        const slug = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || ('product-' + productId.slice(0, 8));
        let researchId = "";
        if (campaignId) {
          const rq = await fetch(`https://api.notion.com/v1/databases/${RESEARCH_DB}/query`, {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ filter: { property: "Campaign", relation: { contains: dash(campaignId) } }, page_size: 1 }),
          }).then(r => r.json());
          researchId = (rq.results?.[0]?.id || "").replace(/-/g, "");
        }
        const siteUrl = `https://cabuzzard.github.io/dash/productsites/${slug}/`;

        // Fetch the template (via the GitHub API so it works even if the repo is
        // private — uses the same token).
        const tmplResp = await fetch(`https://api.github.com/repos/${REPO}/contents/${TEMPLATE_PATH}?ref=${BRANCH}`, {
          headers: { ...gh, "Accept": "application/vnd.github.raw" },
        });
        if (!tmplResp.ok) return json({ error: `Could not fetch product-site template from GitHub (HTTP ${tmplResp.status}) — check GITHUB_TOKEN scope` }, 502);
        let html = await tmplResp.text();

        // Substitute the site-specific constants (mirrors sync_productsites.py).
        html = html.replace(/const PRODUCT_ID\s*=\s*"[^"]*";[^\n]*/, `const PRODUCT_ID  = "${productId}"; // ${slug}`);
        html = html.replace(/const RESEARCH_ID\s*=\s*"[^"]*";[^\n]*/, `const RESEARCH_ID = "${researchId}"; // research`);
        html = html.replace(/const SITE_URL\s*=\s*"[^"]*";/, `const SITE_URL    = "${siteUrl}";`);
        html = html.replace(/<title>[^<]*<\/title>/, `<title>${productName} — Product Admin</title>`);
        const notionLinks = `<a href="https://www.notion.so/${productId}" target="_blank" class="notion-link">↗ Product</a>${researchId ? ` &nbsp; <a href="https://www.notion.so/${researchId}" target="_blank" class="notion-link">↗ Research</a>` : ''}`;
        html = html.replace(/<a href="https:\/\/www\.notion\.so\/[^"]+" target="_blank" class="notion-link">↗ \w+<\/a>(?:\s*&nbsp;\s*<a href="https:\/\/www\.notion\.so\/[^"]+" target="_blank" class="notion-link">↗ \w+<\/a>)?/, notionLinks);

        // Commit productsites/{slug}/index.html (create or update).
        const targetPath = `productsites/${slug}/index.html`;
        const getResp = await fetch(`https://api.github.com/repos/${REPO}/contents/${targetPath}?ref=${BRANCH}`, { headers: gh });
        let existingSha = null;
        if (getResp.ok) { try { existingSha = (await getResp.json()).sha || null; } catch(e) {} }
        // UTF-8-safe base64 (btoa is Latin1-only; the template has em dashes/emoji).
        const toB64 = str => { const bytes = new TextEncoder().encode(str); let bin = ''; const chunk = 0x8000; for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)); return btoa(bin); };
        const putBody = { message: `Add product site: ${slug}`, content: toB64(html), branch: BRANCH };
        if (existingSha) putBody.sha = existingSha;
        const putResp = await fetch(`https://api.github.com/repos/${REPO}/contents/${targetPath}`, {
          method: "PUT", headers: { ...gh, "Content-Type": "application/json" }, body: JSON.stringify(putBody),
        });
        const putResult = await putResp.json();
        if (!putResp.ok) return json({ error: `GitHub commit failed (HTTP ${putResp.status}): ${putResult.message || 'unknown'}` }, 502);

        // Point the product's URL property at the new site so the chip links to it.
        await fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, {
          method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "URL": { url: siteUrl } } }),
        });

        return json({ success: true, url: siteUrl, slug, updated: !!existingSha, commit: putResult.commit?.sha || null });
      }

      // ── createMicrosite ──
      // Mirrors createProductSite above, but for the campaign-level admin
      // microsite (the STE column on the dashboard Overview table). Commits
      // microsites/{slug}/index.html from the hard-grind template, filling in
      // CAMPAIGN_ID / RESEARCH_ID / SITE_URL / Notion links, then sets the
      // Campaign's "microsite" URL property. Campaigns manually created (not
      // through a research-generation flow) often have no Research record at
      // all — the microsite template hard-requires a RESEARCH_ID, so this
      // creates a minimal Research record first when one is missing, same as
      // the standalone createResearchForCampaign action.
      if (body.action === "createMicrosite") {
        const { campaignId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const GT = (env.GITHUB_TOKEN || '').trim();
        if (!GT) return json({ error: "GITHUB_TOKEN not set — run: wrangler secret put GITHUB_TOKEN (a GitHub PAT with 'repo' / Contents write scope for cabuzzard/dash)" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const REPO = "cabuzzard/dash", BRANCH = "main", TEMPLATE_PATH = "microsites/hard-grind/index.html";
        const gh = { "Authorization": `Bearer ${GT}`, "Accept": "application/vnd.github+json", "User-Agent": "dash-worker" };

        const campPage = await fetch(`https://api.notion.com/v1/pages/${dash(campaignId)}`, { headers: hdr }).then(r => r.json());
        if (campPage.object === "error" || !campPage.properties) return json({ error: campPage.message || "Campaign not found" }, 404);
        const campaignName = (campPage.properties?.Name?.title || []).map(t => t.plain_text).join("") || "Campaign";
        if (campPage.properties?.["microsite"]?.url) return json({ error: "This campaign already has a microsite set." }, 400);
        const slug = campaignName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || ('campaign-' + campaignId.slice(0, 8));

        // Find (or create) the campaign's Research record — a bare microsite
        // with no RESEARCH_ID would leave every research-panel feature on the
        // page silently broken.
        const rq = await fetch(`https://api.notion.com/v1/databases/${RESEARCH_DB}/query`, {
          method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ filter: { property: "Campaign", relation: { contains: dash(campaignId) } }, page_size: 1 }),
        }).then(r => r.json());
        let researchId = (rq.results?.[0]?.id || "").replace(/-/g, "");
        let researchCreated = false;
        if (!researchId) {
          const rCreate = await fetch("https://api.notion.com/v1/pages", {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({
              parent: { database_id: RESEARCH_DB },
              properties: {
                Name:     { title: [{ type: "text", text: { content: campaignName } }] },
                Campaign: { relation: [{ id: dash(campaignId) }] },
                Status:   { select: { name: "Draft" } },
              },
            }),
          }).then(r => r.json());
          if (!rCreate.id) return json({ error: rCreate.message || "Could not create Research record" }, 500);
          researchId = rCreate.id.replace(/-/g, "");
          researchCreated = true;
        }

        const siteUrl = `https://cabuzzard.github.io/dash/microsites/${slug}/`;

        // Fetch the template (via the GitHub API so it works even if the repo
        // is private — uses the same token).
        const tmplResp = await fetch(`https://api.github.com/repos/${REPO}/contents/${TEMPLATE_PATH}?ref=${BRANCH}`, {
          headers: { ...gh, "Accept": "application/vnd.github.raw" },
        });
        if (!tmplResp.ok) return json({ error: `Could not fetch microsite template from GitHub (HTTP ${tmplResp.status}) — check GITHUB_TOKEN scope` }, 502);
        let html = await tmplResp.text();

        // Substitute the site-specific constants (mirrors sync_microsites.py's
        // "unique header block": WORKER_URL is identical across sites, so
        // only CAMPAIGN_ID / RESEARCH_ID / SITE_URL + the Notion links change).
        html = html.replace(/const CAMPAIGN_ID\s*=\s*"[^"]*";[^\n]*/, `const CAMPAIGN_ID = "${campaignId}"; // ${slug}`);
        html = html.replace(/const RESEARCH_ID\s*=\s*"[^"]*";[^\n]*/, `const RESEARCH_ID = "${researchId}"; // research`);
        html = html.replace(/const SITE_URL\s*=\s*"[^"]*";/, `const SITE_URL    = "${siteUrl}";`);
        const notionLinks = `<a href="https://www.notion.so/${campaignId}" target="_blank" class="notion-link">↗ Campaign</a> &nbsp; <a href="https://www.notion.so/${researchId}" target="_blank" class="notion-link">↗ Research</a>`;
        html = html.replace(/<a href="https:\/\/www\.notion\.so\/[^"]+" target="_blank" class="notion-link">↗ \w+<\/a>(?:\s*&nbsp;\s*<a href="https:\/\/www\.notion\.so\/[^"]+" target="_blank" class="notion-link">↗ \w+<\/a>)?/, notionLinks);

        // Commit microsites/{slug}/index.html (create, or overwrite if a stale
        // file exists at that path from an earlier attempt).
        const targetPath = `microsites/${slug}/index.html`;
        const getResp = await fetch(`https://api.github.com/repos/${REPO}/contents/${targetPath}?ref=${BRANCH}`, { headers: gh });
        let existingSha = null;
        if (getResp.ok) { try { existingSha = (await getResp.json()).sha || null; } catch(e) {} }
        const toB64 = str => { const bytes = new TextEncoder().encode(str); let bin = ''; const chunk = 0x8000; for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)); return btoa(bin); };
        const putBody = { message: `Add microsite: ${slug}`, content: toB64(html), branch: BRANCH };
        if (existingSha) putBody.sha = existingSha;
        const putResp = await fetch(`https://api.github.com/repos/${REPO}/contents/${targetPath}`, {
          method: "PUT", headers: { ...gh, "Content-Type": "application/json" }, body: JSON.stringify(putBody),
        });
        const putResult = await putResp.json();
        if (!putResp.ok) return json({ error: `GitHub commit failed (HTTP ${putResp.status}): ${putResult.message || 'unknown'}` }, 502);

        // Point the campaign's "microsite" URL property at the new site (feeds
        // the STE column) and the Research record's "Web Page URL" (per the
        // documented manual deploy steps in CLAUDE.md — same field the
        // research-panel features expect to be populated).
        await Promise.all([
          fetch(`https://api.notion.com/v1/pages/${dash(campaignId)}`, {
            method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ properties: { "microsite": { url: siteUrl } } }),
          }),
          fetch(`https://api.notion.com/v1/pages/${dash(researchId)}`, {
            method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ properties: { "Web Page URL": { url: siteUrl } } }),
          }),
        ]);

        return json({ success: true, url: siteUrl, slug, researchId, researchCreated, updated: !!existingSha, commit: putResult.commit?.sha || null });
      }

      // ══════════════════════════════════════════════════════════════════
      // PRODUCT ECOSYSTEM PIPELINE — idea → funnel ecosystem of Products →
      // Methods matched (existing-first) → reused Methods' methodology
      // augmented with the new pattern. Orchestrated client-side as three
      // chained calls (mirrors generateMethodTitles→saveMethodTitles and
      // researchAndGenerateCarouselTitles): researchProductEcosystem (one
      // fast Claude call, no writes) → createEcosystemProduct (one per item)
      // → matchProductMethod (one per created product). Kept in three small
      // steps so no single call risks Cloudflare's 524 edge timeout.
      // ══════════════════════════════════════════════════════════════════

      // ── researchProductEcosystem ──
      // Given a (user-edited) product idea title + description, determines
      // the funnel ecosystem of products needed to market and sell it — e.g.
      // a lead magnet, a low-ticket entry point, the core offer, a retention
      // product — grounded in campaign research. Returns the proposed list
      // only; nothing is created yet (saveMethodTitles-style split).
      if (body.action === "researchProductEcosystem") {
        const { ideaTitle, ideaDescription, campaignId, seedType, excludeSeed } = body;
        if (!ideaTitle || !campaignId) return json({ error: "ideaTitle and campaignId required" }, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const rt = (results, key) => { for (const r of (results.results || [])) { const v = (r.properties[key]?.rich_text || []).map(t => t.plain_text).join(""); if (v) return v; } return ""; };

        const [researchRaw, campRaw] = await Promise.all([
          fetch(`https://api.notion.com/v1/databases/${RESEARCH_DB}/query`, {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ filter: { property: "Campaign", relation: { contains: dash(campaignId) } } }),
          }).then(r => r.json()),
          fetch(`https://api.notion.com/v1/pages/${dash(campaignId)}`, { headers: hdr }).then(r => r.json()),
        ]);
        const cp = campRaw.properties || {};
        const campaignName = (cp.Name?.title || []).map(t => t.plain_text).join("") || "Campaign";
        const keywords = rt(researchRaw, "Keywords") || (cp["Keywords"]?.rich_text || []).map(t => t.plain_text).join("");
        const buyerIntent = (cp["Pain Points"]?.rich_text || []).map(t => t.plain_text).join("") || "(none on file)";

        const prompt = `${researchGuidelinesBlock(body.researchGuidelines)}You are a product and funnel strategist. A campaign has one seed product idea. Determine the full ECOSYSTEM of products needed to market and sell it — not just the core offer itself, but the supporting products at other funnel stages (e.g. a free/low-ticket lead-in, a credibility or content product, the core offer, a retention/upsell product) that a real launch plan would need. Ground everything in the campaign context below. Not every idea needs every stage — a simple info product might only need 2-3 items; a high-ticket offer might need the full ladder.

CAMPAIGN: ${campaignName}
CAMPAIGN KEYWORDS: ${keywords || "(none on file)"}
BUYER / PAIN POINTS: ${buyerIntent}

SEED IDEA:
Title: ${ideaTitle}
Description: ${ideaDescription || "(no description given — infer from the title)"}
${seedType ? `Type (format already chosen for this seed — ground the rest of the funnel in what makes sense to pair with this format): ${seedType}` : ''}

INSTRUCTIONS:
${excludeSeed
  ? `- The seed product ALREADY EXISTS — do NOT include it in your returned array. Return 2-4 SUPPORTING products only (a lead-in, a credibility piece, a retention/upsell, etc. — whatever the seed's funnel role and type genuinely calls for).`
  : `- Return 2-5 products total, including the seed idea itself as one of them (use the exact seed title for that one).`}
- Each product needs a clear funnel role — do not invent products that don't serve getting someone to (or past) the core offer.
- Descriptions must be concrete and specific to this idea, not generic funnel theory.
- "type" and "funnelStage" are TWO DIFFERENT THINGS — do not conflate them:
  - "type" = the concrete FORMAT/deliverable of the product — what it actually IS (e.g. PDF, Email, Video, Quiz, Coaching, Membership, Landing Page, Ebook, Webinar, App, Physical/Print, Course). This is what determines HOW it gets marketed.
  - "funnelStage" = WHERE it sits in the funnel (e.g. Top of funnel, Lead-in, Core offer, Retention) — this is context for the methodology, not a format.

Return ONLY a JSON array — no other text, no markdown fences:
{ "name": "product name", "description": "1-3 sentences, specific to this idea", "type": "concrete format, e.g. PDF / Email / Quiz / Coaching / Membership / Video / Landing Page", "funnelStage": "e.g. Top of funnel / Lead-in / Core offer / Retention" }`;

        const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
        });
        const aiData = await aiResp.json();
        if (!aiResp.ok) return json({ error: aiData.error?.message || "Claude API error" }, 500);

        let ecosystem;
        try {
          const raw = aiData.content?.[0]?.text || "";
          const s = raw.indexOf('['), e = raw.lastIndexOf(']');
          if (s === -1 || e === -1 || e < s) throw new Error("No JSON array found");
          ecosystem = JSON.parse(sanitizeJsonControlChars(raw.slice(s, e + 1)));
          if (!Array.isArray(ecosystem)) throw new Error("Not an array");
        } catch(e) {
          return json({ error: "Failed to parse ecosystem JSON: " + e.message + " | RAW: " + (aiData.content?.[0]?.text || '').slice(0, 300) }, 500);
        }
        return json({ ecosystem: ecosystem.slice(0, 5) });
      }

      // ── createEcosystemProduct ──
      // Creates ONE Product from the researchProductEcosystem output, tagged
      // with the shared Ecosystem group (the original seed idea title) so
      // sibling products can be found/displayed together later.
      if (body.action === "createEcosystemProduct") {
        const { name, description, campaignId, ecosystemTag, type, marketingPhase } = body;
        if (!name || !campaignId) return json({ error: "name and campaignId required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const props = {
          Name:        { title: [{ type: "text", text: { content: String(name).slice(0, 200) } }] },
          Status:      { select: { name: "In Development" } },
          Campaigns:   { relation: [{ id: dash(campaignId) }] },
        };
        if (description) props["Description"] = { rich_text: [{ type: "text", text: { content: String(description).slice(0, 1990) } }] };
        if (ecosystemTag) props["Ecosystem"] = { rich_text: [{ type: "text", text: { content: String(ecosystemTag).slice(0, 200) } }] };
        // Type = concrete FORMAT (PDF, Email, Quiz, Coaching, Membership...) —
        // this is what matchProductMethod uses to pick a method. Marketing
        // Phase = funnel role (Top of funnel/Lead-in/Core offer/Retention) —
        // context only, folded into the attached method's methodology text,
        // not used to select the method itself.
        if (type) props["Type"] = { rich_text: [{ type: "text", text: { content: String(type).slice(0, 100) } }] };
        if (marketingPhase) props["Marketing Phase"] = { rich_text: [{ type: "text", text: { content: String(marketingPhase).slice(0, 100) } }] };
        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ parent: { database_id: PRODUCTS_DB }, properties: props }),
        });
        const result = await resp.json();
        if (!resp.ok || !result.id) return json({ error: result.message || "Create failed" }, resp.status || 500);
        return json({ success: true, productId: result.id.replace(/-/g,""), name });
      }

      // ── tagProductEcosystem ──
      // Tags an ALREADY-EXISTING product into an ecosystem group. Used by the
      // "+ Add Product" flow: the seed product is created first (with its own
      // Type), then researchProductEcosystem runs with excludeSeed so it only
      // returns supporting products — this call retroactively groups the
      // already-created seed alongside them instead of duplicating it.
      if (body.action === "tagProductEcosystem") {
        const { productId, ecosystemTag } = body;
        if (!productId || !ecosystemTag) return json({ error: "productId and ecosystemTag required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { Ecosystem: { rich_text: [{ type: "text", text: { content: String(ecosystemTag).slice(0, 200) } }] } } }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Update failed" }, resp.status);
        return json({ success: true });
      }

      // ── suggestProductMethod ──
      // READ-ONLY — no Notion writes. For one product, checks the FULL
      // existing Methods DB and asks Claude to pick the best fit; if nothing
      // genuinely fits, automatically escalates to a web-search-grounded
      // research pass for a from-scratch methodology. Returns the suggestion
      // PLUS the product's currently-attached methods, so the front-end's
      // review modal can show both and let the user accept/reject/add before
      // anything is actually written — committing happens via a separate
      // explicit action (addProductMethod / createAndAttachMethod).
      if (body.action === "suggestProductMethod") {
        const { productId } = body;
        if (!productId) return json({ error: "productId required" }, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };

        const [productPage, methodsResults, strategyQ] = await Promise.all([
          fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, { headers: hdr }).then(r => r.json()),
          fetch(`https://api.notion.com/v1/databases/${METHODS_DB}/query`, {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" }, body: JSON.stringify({ page_size: 100 }),
          }).then(r => r.json()),
          fetch(`https://api.notion.com/v1/databases/${STRATEGY_DB}/query`, {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ filter: { and: [
              { property: "Product", relation: { contains: dash(productId) } },
              { property: "Method", relation: { is_empty: true } },
            ] } }),
          }).then(r => r.json()).catch(() => ({ results: [] })),
        ]);
        if (productPage.object === "error" || !productPage.properties) return json({ error: productPage.message || "Product not found" }, 404);
        const pp = productPage.properties || {};
        const productName = (pp.Name?.title || []).map(t => t.plain_text).join("") || "Product";
        const productDesc = (pp.Description?.rich_text || []).map(t => t.plain_text).join("");
        const productType = (pp.Type?.rich_text || []).map(t => t.plain_text).join("");
        const marketingPhase = (pp["Marketing Phase"]?.rich_text || []).map(t => t.plain_text).join("");

        // Once a Product Strategy exists, ground the method suggestion in it —
        // the positioning (who it's for, what problem, what's unique) narrows
        // which method actually fits better than Type/Description alone can.
        const stratRecord = (strategyQ.results || [])[0];
        let strategyBlock = "";
        if (stratRecord) {
          const sp = stratRecord.properties || {};
          const srt = key => (sp[key]?.rich_text || []).map(t => t.plain_text).join("");
          const lines = ["Customer", "Pain Points", "Solution", "Unique Opportunity", "Offer Structure"]
            .map(f => srt(f) && `${f}: ${srt(f)}`).filter(Boolean);
          if (lines.length) strategyBlock = `\nPRODUCT STRATEGY (use this to sharpen the match — it's the real positioning, weighs more than Type alone):\n${lines.join("\n")}\n`;
        }

        // Already-attached methods, resolved to names, for the modal to show
        // alongside the fresh suggestion.
        const attachedIds = (pp.Methods?.relation || []).map(r => r.id.replace(/-/g,""));
        const alreadyAttached = attachedIds.length
          ? await Promise.all(attachedIds.map(async id => {
              try {
                const r = await fetch(`https://api.notion.com/v1/pages/${dash(id)}`, { headers: hdr }).then(r => r.json());
                return { id, name: (r.properties?.Name?.title || []).map(t => t.plain_text).join("") || "Untitled" };
              } catch(e) { return { id, name: "?" }; }
            }))
          : [];

        // Dedupe existing methods by NAME (case-insensitive) — the Methods DB
        // has known duplicates; prefer whichever copy has real Notes.
        const byName = new Map();
        for (const m of (methodsResults.results || [])) {
          const mName = (m.properties?.Name?.title || []).map(t => t.plain_text).join("").trim();
          if (!mName) continue;
          const notes = (m.properties?.Notes?.rich_text || []).map(t => t.plain_text).join("");
          const key = mName.toLowerCase();
          const existing = byName.get(key);
          if (!existing || (notes.length > existing.notes.length)) {
            byName.set(key, {
              id: m.id.replace(/-/g,""), name: mName, notes, platform: m.properties?.Platform?.select?.name || "",
              // Destination/conversion methods (like a landing page) assume
              // traffic already exists — flagged so a traffic/distribution
              // method can be suggested alongside them when missing.
              needsTrafficPlan: !!m.properties?.["Needs Traffic Plan"]?.checkbox,
              hasTrafficPlan: (m.properties?.["Traffic Methods"]?.relation || []).length > 0,
            });
          }
        }
        const existingMethods = [...byName.values()];
        const methodsBlock = existingMethods.length
          ? existingMethods.map((m, i) => `[E${i+1}] ${m.name}${m.platform ? ` (${m.platform})` : ''}${m.notes ? ` — ${m.notes.slice(0, 200)}` : ' — (no methodology written yet)'}`).join('\n')
          : '(no existing methods on file)';

        const prompt = `${researchGuidelinesBlock(body.researchGuidelines)}You are a marketing strategist choosing HOW to market and sell one specific product. Below is the full list of EXISTING marketing methods already on file. Strongly prefer reusing one of them — only propose a new method if none of them genuinely fit this product's context.

PRODUCT: ${productName}
TYPE (format — this is the PRIMARY signal for which method fits): ${productType || "(not set — infer format from the name/description)"}
MARKETING PHASE (funnel role — context only, not a format): ${marketingPhase || "(not set)"}
DESCRIPTION: ${productDesc || "(none)"}
${strategyBlock}
EXISTING METHODS ON FILE:
${methodsBlock}

INSTRUCTIONS:
- Match primarily on TYPE — an Email-type product needs an email/nurture method, a PDF/Quiz/Lead Magnet needs a landing-page or download method, a Coaching-type product needs a booking/outreach method, a Membership needs a community/retention method, a Video needs a video-creation method. Don't match on the product's specific topic — match on what format it IS.
- If an existing method fits the TYPE (even loosely — e.g. a generic "Campaign Page" method can serve a booking page, a waitlist page, or an offer page for several different types), choose it. Reference it by its [E#] tag.
- Only set "isNew": true if nothing existing is even a loose fit for this product's TYPE.
- If reusing an existing method, write "augmentedNotes": a short (2-4 sentence) GENERALIZED methodology that MERGES what that method already does with this new use case. Weave in the MARKETING PHASE as context. Broaden the definition, don't just describe this one product.
- If proposing new, give it a short reusable name tied to the TYPE, not this one product (e.g. "Email Nurture Sequence", not "${productName} Email").

Return ONLY a JSON object, no other text, no markdown fences:
{ "isNew": false, "existingTag": "E2", "augmentedNotes": "..." }
OR
{ "isNew": true, "name": "...", "platform": "...", "category": "...", "notes": "..." }`;

        const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 800, messages: [{ role: "user", content: prompt }] }),
        });
        const aiData = await aiResp.json();
        if (!aiResp.ok) return json({ error: aiData.error?.message || "Claude API error" }, 500);

        let decision;
        try {
          const raw = aiData.content?.[0]?.text || "";
          const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
          if (s === -1 || e === -1 || e < s) throw new Error("No JSON object found");
          decision = JSON.parse(sanitizeJsonControlChars(raw.slice(s, e + 1)));
        } catch(e) {
          return json({ error: "Failed to parse method decision: " + e.message + " | RAW: " + (aiData.content?.[0]?.text || '').slice(0, 300) }, 500);
        }

        // Destination/conversion methods (a landing page, a booking page)
        // assume traffic already exists — they don't generate awareness
        // themselves. When the chosen/researched method needs a traffic plan
        // and doesn't already have one, suggest ONE distribution method to
        // drive people to it too (existing-first, same escalation pattern).
        async function suggestTrafficPlan(parentName, parentNotes) {
          const trafficPrompt = `You are picking a DISTRIBUTION/AWARENESS method to drive traffic to an existing destination method. The destination method converts visitors once they arrive — it does not generate them. Your job is choosing HOW people discover and arrive at it.

DESTINATION METHOD: ${parentName}
WHAT IT DOES: ${parentNotes || "(no notes on file)"}
PRODUCT THIS SERVES: ${productName} (${productType || "type not set"})
MARKETING PHASE: ${marketingPhase || "(not set)"}

EXISTING METHODS ON FILE:
${methodsBlock}

INSTRUCTIONS:
- Pick a method whose JOB is generating awareness/traffic (e.g. social content, organic content, SEO, paid ads, outreach) — NOT another destination/conversion surface like a landing page.
- Strongly prefer an existing method if one fits. Only propose new if nothing existing does this job.
- If reusing existing, write "augmentedNotes" the same way as before — generalized, merged with this new use case.

Return ONLY a JSON object, no other text, no markdown fences:
{ "isNew": false, "existingTag": "E2", "augmentedNotes": "..." }
OR
{ "isNew": true, "name": "...", "platform": "...", "category": "...", "notes": "..." }`;
          const tResp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 800, messages: [{ role: "user", content: trafficPrompt }] }),
          });
          const tData = await tResp.json();
          if (!tResp.ok) return null;
          let tDecision;
          try {
            const raw = tData.content?.[0]?.text || "";
            const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
            tDecision = JSON.parse(sanitizeJsonControlChars(raw.slice(s, e + 1)));
          } catch(e) { return null; }
          if (!tDecision.isNew) {
            const tagMatch = String(tDecision.existingTag || '').match(/E(\d+)/i);
            const idx = tagMatch ? parseInt(tagMatch[1], 10) - 1 : -1;
            const matched = existingMethods[idx];
            if (matched) return { isExisting: true, methodId: matched.id, methodName: matched.name, notes: tDecision.augmentedNotes || '', researched: false };
          }
          if (tDecision.isNew && tDecision.name) {
            return { isExisting: false, methodName: tDecision.name, notes: tDecision.notes || '', platform: tDecision.platform || '', category: tDecision.category || '', researched: false };
          }
          return null;
        }

        if (!decision.isNew) {
          const tagMatch = String(decision.existingTag || '').match(/E(\d+)/i);
          const idx = tagMatch ? parseInt(tagMatch[1], 10) - 1 : -1;
          const matched = existingMethods[idx];
          if (matched) {
            const needsTrafficPlan = matched.needsTrafficPlan && !matched.hasTrafficPlan;
            const trafficSuggestion = needsTrafficPlan ? await suggestTrafficPlan(matched.name, matched.notes) : null;
            return json({
              alreadyAttached, productName, productDescription: productDesc,
              suggestion: { isExisting: true, methodId: matched.id, methodName: matched.name, notes: decision.augmentedNotes || '', researched: false, needsTrafficPlan, trafficSuggestion },
            });
          }
          // Model referenced an unknown tag — fall through to research instead
          // of erroring the whole suggestion.
        }

        // Nothing existing fits (or the match was unparseable) — auto-escalate
        // to a web-search-grounded research pass for a from-scratch methodology.
        const researchPrompt = `You are a marketing strategist. No existing method genuinely fits this product — research and write a real methodology from scratch.

PRODUCT TYPE (format): ${productType || productName}
PRODUCT: ${productName}
DESCRIPTION: ${productDesc || "(none)"}
MARKETING PHASE (funnel role — weave this into the methodology's guidance, don't treat it as a separate field): ${marketingPhase || "(not set)"}

Research current, real, up-to-date best practices, channels, and tactics for marketing and selling a "${productType || productName}" product. Ground the methodology in what you find — specific tactics and channels, not generic funnel theory.

Return ONLY a JSON object, no other text, no markdown fences:
{ "name": "short reusable method name tied to the TYPE, not this specific product (e.g. 'Quiz Lead Magnet Funnel', not '${productName} Quiz')", "platform": "e.g. Instagram, Email, YouTube, Landing Page, Other", "category": "Content, Outreach, Research, SEO, Ecommerce, or Video", "notes": "the researched methodology — 3-5 sentences, specific tactics grounded in what you found, incorporating the marketing phase context", "needsTrafficPlan": true|false, "needsTrafficPlanReason": "one phrase — true if this method is a DESTINATION/conversion surface that assumes traffic already exists (a page, a booking form), false if the method itself generates awareness/traffic (social content, SEO, ads, outreach)" }`;
        const researchResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "anthropic-beta": "web-search-2025-03-05", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1500, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }], messages: [{ role: "user", content: researchPrompt }] }),
        });
        const researchData = await researchResp.json();
        if (!researchResp.ok) return json({ error: researchData.error?.message || "Claude API error" }, 500);
        let raw = '';
        for (const block of (researchData.content || [])) { if (block.type === 'text') raw += block.text; }
        try {
          const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
          if (s === -1 || e === -1 || e < s) throw new Error("No JSON object found");
          const researched = JSON.parse(sanitizeJsonControlChars(raw.slice(s, e + 1)));
          const needsTrafficPlan = !!researched.needsTrafficPlan;
          const trafficSuggestion = needsTrafficPlan ? await suggestTrafficPlan(researched.name || productName, researched.notes || '') : null;
          return json({
            alreadyAttached, productName, productDescription: productDesc,
            suggestion: { isExisting: false, methodName: researched.name || `Method for ${productName}`, notes: researched.notes || '', platform: researched.platform || '', category: researched.category || '', researched: true, needsTrafficPlan, trafficSuggestion },
          });
        } catch(e) {
          return json({ error: "Failed to parse researched methodology: " + e.message + " | RAW: " + raw.slice(0, 300) }, 500);
        }
      }

      // ── createAndAttachMethod ──
      // Commit step for a NEW method (AI-suggested-and-kept, or manually
      // typed in the review modal): creates it with full metadata, attaches
      // to the product, and propagates to every campaign the product belongs
      // to. Nothing here runs until the user explicitly clicks "Add Methods".
      if (body.action === "createAndAttachMethod") {
        const { productId, name, platform, category, notes, needsTrafficPlan } = body;
        if (!productId || !name) return json({ error: "productId and name required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const createProps = { Name: { title: [{ type: "text", text: { content: String(name).slice(0, 200) } }] } };
        if (platform) createProps["Platform"] = { select: { name: platform } };
        if (category) createProps["Category"] = { multi_select: [{ name: category }] };
        if (notes) createProps["Notes"] = { rich_text: [{ type: "text", text: { content: String(notes).slice(0, 1990) } }] };
        if (needsTrafficPlan) createProps["Needs Traffic Plan"] = { checkbox: true };
        const createResp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ parent: { database_id: METHODS_DB }, properties: createProps }),
        });
        const created = await createResp.json();
        if (!createResp.ok || !created.id) return json({ error: created.message || "Method create failed" }, createResp.status || 500);
        const methodId = created.id.replace(/-/g,"");

        const prodResp = await fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, { headers: hdr });
        const prodPage = await prodResp.json();
        const existingRel = (prodPage.properties?.Methods?.relation || []).map(r => ({ id: r.id }));
        existingRel.push({ id: dash(methodId) });
        await fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, {
          method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { Methods: { relation: existingRel } } }),
        });
        await propagateMethodToCampaigns(productId, methodId);

        // Replenish the new method's methodology into a full, classified
        // Phase>Grouping framework — best-effort, never blocks the attach.
        // The short `notes` paragraph (if any) becomes the seed/context for
        // a genuinely researched framework, not the final methodology.
        try {
          const ppc = prodPage.properties || {};
          const productContext = [
            (ppc.Name?.title || []).map(t => t.plain_text).join(""),
            (ppc.Description?.rich_text || []).map(t => t.plain_text).join(""),
            notes ? `Seed notes for this method: ${notes}` : '',
          ].filter(Boolean).join(" — ");
          await researchAndWriteMethodology(hdr, env, dash(methodId), name, platform, productContext, false, !!needsTrafficPlan, body.researchGuidelines);
        } catch(e) { /* best-effort — method still usable with just its short notes */ }

        return json({ success: true, methodId, methodName: name });
      }

      // ── linkTrafficMethod ──
      // Links a child distribution/traffic method under a parent destination
      // method's "Traffic Methods" relation (dual — the child's "Drives
      // Traffic To" auto-syncs). This is the hierarchy itself: Page →
      // Traffic Methods → [Carousel Content, Organic Social, ...]. Called
      // after the child method is attached to the product (still a flat
      // per-product Methods list) so it's ALSO documented as this parent's
      // canonical traffic plan for reuse by future products.
      if (body.action === "linkTrafficMethod") {
        const { parentMethodId, childMethodId } = body;
        if (!parentMethodId || !childMethodId) return json({ error: "parentMethodId and childMethodId required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const parentResp = await fetch(`https://api.notion.com/v1/pages/${dash(parentMethodId)}`, { headers: hdr });
        const parentPage = await parentResp.json();
        const existing = (parentPage.properties?.["Traffic Methods"]?.relation || []).map(r => ({ id: r.id }));
        if (!existing.some(r => r.id.replace(/-/g,"") === childMethodId.replace(/-/g,""))) existing.push({ id: dash(childMethodId) });
        const patchResp = await fetch(`https://api.notion.com/v1/pages/${dash(parentMethodId)}`, {
          method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Traffic Methods": { relation: existing } } }),
        });
        const result = await patchResp.json();
        if (!patchResp.ok) return json({ error: result.message || "Update failed" }, patchResp.status);
        return json({ success: true });
      }

      // ── getProductMethods ──
      // A product's currently-attached methods (id+name only) — cheap, no AI
      // call. Used by "Generate Titles" in the ⚙ modal to read the real,
      // committed state rather than whatever's staged-but-unsaved in the UI.
      if (body.action === "getProductMethods") {
        const { productId } = body;
        if (!productId) return json({ error: "productId required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const page = await fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, { headers: hdr }).then(r => r.json());
        if (page.object === "error" || !page.properties) return json({ error: page.message || "Product not found" }, 404);
        const ids = (page.properties?.Methods?.relation || []).map(r => r.id.replace(/-/g,""));
        const methods = ids.length
          ? await Promise.all(ids.map(async id => {
              const mp = await fetch(`https://api.notion.com/v1/pages/${dash(id)}`, { headers: hdr }).then(r => r.json());
              return { id, name: (mp.properties?.Name?.title || []).map(t => t.plain_text).join("") || "Method" };
            }))
          : [];
        return json({ methods });
      }

      // ── getMethodDetails ──
      // One method's Name/Notes/Platform plus its linked Traffic Methods
      // (children, resolved to name+notes) — feeds the "Generate Titles"
      // flow in the ⚙ Methods modal, which needs to know each attached
      // method's traffic children before generating for both levels.
      if (body.action === "getMethodDetails") {
        const { methodId } = body;
        if (!methodId) return json({ error: "methodId required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const page = await fetch(`https://api.notion.com/v1/pages/${dash(methodId)}`, { headers: hdr }).then(r => r.json());
        if (page.object === "error" || !page.properties) return json({ error: page.message || "Method not found" }, 404);
        const p = page.properties;
        const name = (p.Name?.title || []).map(t => t.plain_text).join("") || "Method";
        const notes = (p.Notes?.rich_text || []).map(t => t.plain_text).join("");
        const platform = p.Platform?.select?.name || "";
        const trafficIds = (p["Traffic Methods"]?.relation || []).map(r => r.id.replace(/-/g,""));
        const trafficMethods = trafficIds.length
          ? await Promise.all(trafficIds.map(async id => {
              const tp = await fetch(`https://api.notion.com/v1/pages/${dash(id)}`, { headers: hdr }).then(r => r.json());
              return {
                id, name: (tp.properties?.Name?.title || []).map(t => t.plain_text).join("") || "Method",
                notes: (tp.properties?.Notes?.rich_text || []).map(t => t.plain_text).join(""),
                platform: tp.properties?.Platform?.select?.name || "",
              };
            }))
          : [];
        const needsTrafficPlan = !!p["Needs Traffic Plan"]?.checkbox;
        return json({ id: methodId, name, notes, platform, trafficMethods, needsTrafficPlan });
      }

      // ── saveMethodStrategy ──
      // Consolidates a generateMethodTitles-shaped items array (title/phase/
      // grouping — the SAME output that used to be exploded into N Title
      // rows) into ONE Strategy record instead: planning/brief content
      // (headlines, CTA copy, pricing, proof, offer structure) for a
      // Product+Method pairing. Upserts — regenerating replaces the body with
      // the latest pass rather than piling up duplicates. This is what
      // "Generate Strategy" in the ⚙ modal calls; it does not create any
      // Titles. Titles come later, via generateTitlesFromStrategy, informed
      // by reading this document back.
      if (body.action === "saveMethodStrategy") {
        const { items, campaignId, methodId, methodName, productId, productName } = body;
        if (!items?.length || !campaignId || !methodId || !productId) return json({ error: "items, campaignId, methodId, productId required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };

        // Assemble the flat items into a structured document: Phase as H2,
        // Grouping as H3, each item's title+notes as a bullet.
        const byPhase = {};
        for (const it of items) {
          const phase = it.phase || 'General';
          const grouping = it.grouping || 'General';
          byPhase[phase] = byPhase[phase] || {};
          byPhase[phase][grouping] = byPhase[phase][grouping] || [];
          byPhase[phase][grouping].push(it);
        }
        let body_md = '';
        for (const phase of Object.keys(byPhase)) {
          body_md += `\n## ${phase}\n`;
          for (const grouping of Object.keys(byPhase[phase])) {
            body_md += `### ${grouping}\n`;
            for (const it of byPhase[phase][grouping]) {
              body_md += `- **${it.title}**${it.description ? `: ${it.description}` : ''}\n`;
            }
          }
        }
        const rtBlock = text => text ? [{ type: "text", text: { content: String(text).slice(0, 1990), link: null }, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: "default" } }] : [];
        const headingBlock = (level, text) => ({ object: "block", type: `heading_${level}`, [`heading_${level}`]: { rich_text: rtBlock(text) } });
        const bulletBlock = text => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rtBlock(text) } });
        const children = [];
        for (const phase of Object.keys(byPhase)) {
          children.push(headingBlock(2, phase));
          for (const grouping of Object.keys(byPhase[phase])) {
            children.push(headingBlock(3, grouping));
            for (const it of byPhase[phase][grouping]) {
              children.push(bulletBlock(`${it.title}${it.description ? `: ${it.description}` : ''}`));
            }
          }
        }

        // Upsert — find an existing Strategy record for this exact
        // Product+Method pairing first.
        const existingQuery = await fetch(`https://api.notion.com/v1/databases/${STRATEGY_DB}/query`, {
          method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ filter: { and: [
            { property: "Product", relation: { contains: dash(productId) } },
            { property: "Method", relation: { contains: dash(methodId) } },
          ] } }),
        }).then(r => r.json());
        const existing = (existingQuery.results || [])[0];

        const strategyName = `${productName || 'Product'} — ${methodName || 'Method'} Strategy`;
        if (existing) {
          const strategyId = existing.id.replace(/-/g,"");
          // Replace body wholesale — regeneration should reflect the latest pass.
          const blocksResp = await fetch(`https://api.notion.com/v1/blocks/${dash(strategyId)}/children?page_size=100`, { headers: hdr }).then(r => r.json());
          const existingBlockIds = (blocksResp.results || []).map(b => b.id);
          await Promise.all(existingBlockIds.map(id => fetch(`https://api.notion.com/v1/blocks/${id}`, { method: "DELETE", headers: hdr })));
          await fetch(`https://api.notion.com/v1/blocks/${dash(strategyId)}/children`, {
            method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ children }),
          });
          await fetch(`https://api.notion.com/v1/pages/${dash(strategyId)}`, {
            method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ properties: { Status: { select: { name: "Current" } } } }),
          });
          return json({ success: true, strategyId, url: existing.url, updated: true });
        } else {
          const createResp = await fetch("https://api.notion.com/v1/pages", {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({
              parent: { database_id: STRATEGY_DB },
              properties: {
                Name: { title: [{ type: "text", text: { content: strategyName.slice(0, 200) } }] },
                Product: { relation: [{ id: dash(productId) }] },
                Method: { relation: [{ id: dash(methodId) }] },
                Campaigns: { relation: [{ id: dash(campaignId) }] },
                Status: { select: { name: "Current" } },
              },
              children,
            }),
          });
          const created = await createResp.json();
          if (!createResp.ok || !created.id) return json({ error: created.message || "Strategy create failed" }, createResp.status || 500);
          return json({ success: true, strategyId: created.id.replace(/-/g,""), url: created.url, updated: false });
        }
      }

      // ── getMethodStrategy ──
      // Reads the Strategy record (if any) for a Product+Method pairing —
      // used both to display it in the ⚙ modal and as grounding context when
      // generating actual Titles from it.
      if (body.action === "getMethodStrategy") {
        const { productId, methodId } = body;
        if (!productId || !methodId) return json({ error: "productId and methodId required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const q = await fetch(`https://api.notion.com/v1/databases/${STRATEGY_DB}/query`, {
          method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ filter: { and: [
            { property: "Product", relation: { contains: dash(productId) } },
            { property: "Method", relation: { contains: dash(methodId) } },
          ] } }),
        }).then(r => r.json());
        const record = (q.results || [])[0];
        if (!record) return json({ strategy: null });
        const strategyId = record.id.replace(/-/g,"");
        const blocksResp = await fetch(`https://api.notion.com/v1/blocks/${dash(strategyId)}/children?page_size=100`, { headers: hdr }).then(r => r.json());
        const text = (blocksResp.results || []).map(b => {
          const type = b.type; const rich = b[type]?.rich_text || [];
          const t = rich.map(x => x.plain_text).join("");
          if (!t) return "";
          if (/^heading/.test(type)) return `\n${t}`;
          if (type === "bulleted_list_item") return `- ${t}`;
          return t;
        }).filter(Boolean).join("\n");
        return json({ strategy: { id: strategyId, url: record.url, text, status: record.properties?.Status?.select?.name || "" } });
      }

      // ── getProductStrategy ──
      // Reads the PRODUCT-level Strategy record — the positioning doc (one
      // per product): STRATEGY_FIELDS values plus Status/url. Powers the
      // product site's Strategy panel.
      //
      // The Strategy DB holds two DIFFERENT things under one schema: this
      // product-level positioning record (Method relation empty) and
      // separate per-method Briefs (Method relation set — see
      // getMethodStrategy/saveMethodStrategy). Both share the same Product
      // relation, so filtering on Product alone and taking the first result
      // could silently return a Brief instead of the actual strategy — this
      // now explicitly excludes records with a Method set.
      if (body.action === "getProductStrategy") {
        const { productId } = body;
        if (!productId) return json({ error: "productId required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const q = await fetch(`https://api.notion.com/v1/databases/${STRATEGY_DB}/query`, {
          method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ filter: { and: [
            { property: "Product", relation: { contains: dash(productId) } },
            { property: "Method", relation: { is_empty: true } },
          ] } }),
        }).then(r => r.json());
        const record = (q.results || [])[0];
        if (!record) return json({ strategy: null });
        const props = record.properties || {};
        const rt = key => (props[key]?.rich_text || []).map(t => t.plain_text).join("");
        const fields = {};
        for (const f of STRATEGY_FIELDS) fields[f] = rt(f);
        return json({ strategy: { id: record.id.replace(/-/g,""), url: record.url, status: props.Status?.select?.name || "", fields } });
      }

      // ── getCampaignStrategies ──
      // Lists every product under a campaign with its Product Strategy
      // (positioning) status/link and any Method Briefs under it — the
      // campaign-wide "where are the strategies" view, since today they're
      // only visible one product page at a time.
      if (body.action === "getCampaignStrategies") {
        const { campaignId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const campPage = await fetch(`https://api.notion.com/v1/pages/${dash(campaignId)}`, { headers: hdr }).then(r => r.json());
        const productRels = campPage.properties?.["Products"]?.relation || [];
        if (!productRels.length) return json({ products: [] });

        const productPages = await Promise.all(productRels.map(r =>
          fetch(`https://api.notion.com/v1/pages/${r.id}`, { headers: hdr }).then(res => res.json())
        ));
        const results = await Promise.all(productPages.map(async p => {
          const productId = p.id.replace(/-/g, "");
          const productName = (p.properties?.Name?.title || []).map(t => t.plain_text).join("") || "Untitled";
          const q = await fetch(`https://api.notion.com/v1/databases/${STRATEGY_DB}/query`, {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ filter: { property: "Product", relation: { contains: dash(productId) } } }),
          }).then(r => r.json()).catch(() => ({ results: [] }));
          const records = q.results || [];
          const strategyRec = records.find(r => !(r.properties?.Method?.relation || []).length);
          const briefRecs = records.filter(r => (r.properties?.Method?.relation || []).length);
          const briefs = await Promise.all(briefRecs.map(async r => {
            const methodRelId = r.properties.Method.relation[0]?.id;
            let methodName = "Method";
            if (methodRelId) {
              const mp = await fetch(`https://api.notion.com/v1/pages/${methodRelId}`, { headers: hdr }).then(res => res.json()).catch(() => null);
              methodName = (mp?.properties?.Name?.title || []).map(t => t.plain_text).join("") || "Method";
            }
            return { id: r.id.replace(/-/g, ""), url: r.url, methodName, status: r.properties?.Status?.select?.name || "" };
          }));
          return {
            productId, productName,
            strategy: strategyRec ? { id: strategyRec.id.replace(/-/g, ""), url: strategyRec.url, status: strategyRec.properties?.Status?.select?.name || "" } : null,
            briefs,
          };
        }));
        return json({ products: results });
      }

      // ── generateStrategyField ──
      // Generates ONE field of the product-level Strategy — grounded in the
      // product's own Title/Description/Keywords, whichever attached
      // method's framework defines the mapped phase (best-effort, via
      // STRATEGY_FIELD_PHASE_MAP + parseMethodPhases), and every
      // already-generated field on this Strategy record (for coherence —
      // e.g. Benefits should stay consistent with an already-written Pain
      // Points). Upserts by PRODUCT only, writing just this one property —
      // every other field is untouched.
      if (body.action === "generateStrategyField") {
        const { productId, field } = body;
        if (!productId || !field) return json({ error: "productId and field required" }, 400);
        if (!STRATEGY_FIELDS.includes(field)) return json({ error: "Unknown field: " + field }, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };

        const productPage = await fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, { headers: hdr }).then(r => r.json());
        const pp = productPage.properties || {};
        const productName = (pp.Name?.title || []).map(t => t.plain_text).join("") || "Product";
        const productDesc = (pp.Description?.rich_text || []).map(t => t.plain_text).join("");
        const productKeywords = (pp.Keywords?.rich_text || []).map(t => t.plain_text).join("");

        // Best-effort: pull the mapped phase's text from whichever attached
        // method actually defines it.
        let phaseSource = '', phaseSourceName = STRATEGY_FIELD_PHASE_MAP[field] || '';
        if (phaseSourceName) {
          const methodIds = (pp.Methods?.relation || []).map(r => r.id.replace(/-/g,""));
          for (const mid of methodIds) {
            try {
              const phases = await parseMethodPhases(hdr, dash(mid));
              const match = phases.find(p => p.name === phaseSourceName);
              if (match) {
                phaseSource = match.groupings.map(g => `${g.name}:\n${g.notes.map(n => `- ${n}`).join("\n")}`).join("\n\n");
                break;
              }
            } catch(e) { /* try next method */ }
          }
        }

        // Existing other fields on this Strategy record, for coherence.
        // Method: is_empty excludes per-method Briefs, which share this same
        // Product relation but are a different record (see getProductStrategy).
        const q = await fetch(`https://api.notion.com/v1/databases/${STRATEGY_DB}/query`, {
          method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ filter: { and: [
            { property: "Product", relation: { contains: dash(productId) } },
            { property: "Method", relation: { is_empty: true } },
          ] } }),
        }).then(r => r.json());
        const existing = (q.results || [])[0];
        const existingProps = existing?.properties || {};
        const otherFieldsText = STRATEGY_FIELDS.filter(f => f !== field).map(f => {
          const v = (existingProps[f]?.rich_text || []).map(t => t.plain_text).join("");
          return v ? `${f}: ${v}` : '';
        }).filter(Boolean).join("\n");

        const prompt = `${researchGuidelinesBlock(body.researchGuidelines)}You are a marketing strategist writing ONE field of a product's core strategy document — a fixed positioning reference used across every marketing channel this product is sold through, not tied to any one platform.

PRODUCT: ${productName}
DESCRIPTION: ${productDesc || "(none)"}
KEYWORDS: ${productKeywords || "(none)"}
${otherFieldsText ? `\nALREADY-ESTABLISHED STRATEGY (stay consistent with this):\n${otherFieldsText}\n` : ''}${phaseSource ? `\nRELEVANT FRAMEWORK GUIDANCE (from an attached method's "${phaseSourceName}" section — use this to inform what to write, don't just restate it verbatim):\n${phaseSource}\n` : ''}
FIELD TO WRITE: ${field}
${STRATEGY_FIELD_HINTS[field] || ''}

Write ONLY the content for this field — 2-5 sentences, or a short bulleted list if the field is naturally list-shaped (e.g. Objections, Pain Points). No headers, no preamble, no "Here is...". Output only the field content itself.`;

        const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
        });
        const aiData = await aiResp.json();
        if (!aiResp.ok) return json({ error: aiData.error?.message || "Claude API error" }, 500);
        const text = (aiData.content?.[0]?.text || "").trim();
        if (!text) return json({ error: "Empty response from Claude" }, 500);

        const rtChunks = [];
        for (let i = 0; i < Math.max(text.length, 1); i += 2000) rtChunks.push({ type: "text", text: { content: text.slice(i, i + 2000) } });

        let strategyId, strategyUrl;
        if (existing) {
          strategyId = existing.id.replace(/-/g,""); strategyUrl = existing.url;
          await fetch(`https://api.notion.com/v1/pages/${dash(strategyId)}`, {
            method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ properties: { [field]: { rich_text: rtChunks }, Status: { select: { name: "Current" } } } }),
          });
        } else {
          const createResp = await fetch("https://api.notion.com/v1/pages", {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({
              parent: { database_id: STRATEGY_DB },
              properties: {
                Name: { title: [{ type: "text", text: { content: `${productName} — Strategy`.slice(0, 200) } }] },
                Product: { relation: [{ id: dash(productId) }] },
                Status: { select: { name: "Current" } },
                [field]: { rich_text: rtChunks },
              },
            }),
          });
          const created = await createResp.json();
          if (!createResp.ok || !created.id) return json({ error: created.message || "Strategy create failed" }, createResp.status || 500);
          strategyId = created.id.replace(/-/g,""); strategyUrl = created.url;
        }

        return json({ success: true, strategyId, url: strategyUrl, text });
      }

      // ── updateProductStrategyField ──
      // Hand-edit / manual entry for one Strategy field — same upsert as
      // generateStrategyField but writes a caller-supplied value directly.
      if (body.action === "updateProductStrategyField") {
        const { productId, field, value } = body;
        if (!productId || !field) return json({ error: "productId and field required" }, 400);
        if (!STRATEGY_FIELDS.includes(field)) return json({ error: "Unknown field: " + field }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const rtStr = value || "";
        const rtChunks = [];
        for (let i = 0; i < Math.max(rtStr.length, 1); i += 2000) rtChunks.push({ type: "text", text: { content: rtStr.slice(i, i + 2000) } });

        const q = await fetch(`https://api.notion.com/v1/databases/${STRATEGY_DB}/query`, {
          method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ filter: { and: [
            { property: "Product", relation: { contains: dash(productId) } },
            { property: "Method", relation: { is_empty: true } },
          ] } }),
        }).then(r => r.json());
        const existing = (q.results || [])[0];
        if (existing) {
          const strategyId = existing.id.replace(/-/g,"");
          await fetch(`https://api.notion.com/v1/pages/${dash(strategyId)}`, {
            method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ properties: { [field]: { rich_text: rtChunks } } }),
          });
          return json({ success: true, strategyId, url: existing.url });
        }
        const productPage = await fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, { headers: hdr }).then(r => r.json());
        const productName = (productPage.properties?.Name?.title || []).map(t => t.plain_text).join("") || "Product";
        const createResp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({
            parent: { database_id: STRATEGY_DB },
            properties: {
              Name: { title: [{ type: "text", text: { content: `${productName} — Strategy`.slice(0, 200) } }] },
              Product: { relation: [{ id: dash(productId) }] },
              Status: { select: { name: "Current" } },
              [field]: { rich_text: rtChunks },
            },
          }),
        });
        const created = await createResp.json();
        if (!createResp.ok || !created.id) return json({ error: created.message || "Strategy create failed" }, createResp.status || 500);
        return json({ success: true, strategyId: created.id.replace(/-/g,""), url: created.url });
      }

      // ── researchMethodology ──
      // Explicit/manual trigger for researchAndWriteMethodology — normally
      // this runs automatically (best-effort) inside createAndAttachMethod
      // and addProductMethod, but this lets a thin method be re-researched
      // on demand (pass force:true to overwrite an existing framework, e.g.
      // after the auto-run produced something too shallow).
      if (body.action === "researchMethodology") {
        const { methodId, productId, force } = body;
        if (!methodId) return json({ error: "methodId required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const methodPage = await fetch(`https://api.notion.com/v1/pages/${dash(methodId)}`, { headers: hdr }).then(r => r.json());
        if (methodPage.object === "error" || !methodPage.properties) return json({ error: methodPage.message || "Method not found" }, 404);
        const methodName = (methodPage.properties?.Name?.title || []).map(t => t.plain_text).join("") || "Method";
        const platform = methodPage.properties?.Platform?.select?.name || "";
        const isDestination = !!methodPage.properties?.["Needs Traffic Plan"]?.checkbox;
        let productContext = "";
        if (productId) {
          try {
            const productPage = await fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, { headers: hdr }).then(r => r.json());
            const ppc = productPage.properties || {};
            productContext = [
              (ppc.Name?.title || []).map(t => t.plain_text).join(""),
              (ppc.Description?.rich_text || []).map(t => t.plain_text).join(""),
            ].filter(Boolean).join(" — ");
          } catch(e) { /* research still runs without product context */ }
        }
        const result = await researchAndWriteMethodology(hdr, env, dash(methodId), methodName, platform, productContext, !!force, isDestination, body.researchGuidelines);
        if (result.error) return json({ error: result.error }, 500);
        return json(result);
      }

      // ── getMethodPhases ──
      // Lists a Method's own Phase>Grouping structure (parsed by block type
      // via parseMethodPhases, not text pattern) alongside which phases
      // already have content in this Product's Strategy record — powers
      // the product site's per-phase generation rows, so a big framework
      // (e.g. an 11-phase Product Page) never has to be generated in one
      // Claude call that risks truncating partway through.
      if (body.action === "getMethodPhases") {
        const { productId, methodId } = body;
        if (!methodId) return json({ error: "methodId required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const phasesRaw = await parseMethodPhases(hdr, dash(methodId));

        let existingPhaseNames = new Set();
        let strategyUrl = null;
        if (productId) {
          const q = await fetch(`https://api.notion.com/v1/databases/${STRATEGY_DB}/query`, {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ filter: { and: [
              { property: "Product", relation: { contains: dash(productId) } },
              { property: "Method", relation: { contains: dash(methodId) } },
            ] } }),
          }).then(r => r.json());
          const record = (q.results || [])[0];
          if (record) {
            strategyUrl = record.url;
            const strategyId = record.id.replace(/-/g,"");
            const blocksResp = await fetch(`https://api.notion.com/v1/blocks/${dash(strategyId)}/children?page_size=100`, { headers: hdr }).then(r => r.json());
            for (const b of (blocksResp.results || [])) {
              if (b.type === "heading_2") {
                const t = (b.heading_2?.rich_text || []).map(x => x.plain_text).join("").trim();
                if (t) existingPhaseNames.add(t);
              }
            }
          }
        }

        const phases = phasesRaw.map(p => ({
          name: p.name,
          groupingCount: p.groupings.length,
          itemCount: p.groupings.reduce((n, g) => n + g.notes.length, 0),
          hasContent: existingPhaseNames.has(p.name),
        }));
        return json({ phases, strategyUrl });
      }

      // ── generateStrategySection ──
      // Generates ONE phase of a Strategy document at a time — grounded in
      // the PRODUCT's own Title/Description/Keywords (not campaign
      // research) — and splices the result into the Strategy record's page
      // body, replacing only that phase's own blocks (if any) so
      // regenerating one phase never clobbers the others. This is what
      // "run every section" on the product site calls, deliberately
      // avoiding the single-big-call approach that silently truncates once
      // a framework has more than a handful of phases.
      if (body.action === "generateStrategySection") {
        const { productId, methodId, methodName, phase, campaignId } = body;
        if (!productId || !methodId || !phase) return json({ error: "productId, methodId, phase required" }, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };

        const [phasesRaw, productPage] = await Promise.all([
          parseMethodPhases(hdr, dash(methodId)),
          fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, { headers: hdr }).then(r => r.json()),
        ]);
        const target = phasesRaw.find(p => p.name === phase);
        if (!target) return json({ error: `Phase "${phase}" not found on this method` }, 404);

        const pp = productPage.properties || {};
        const productName = (pp.Name?.title || []).map(t => t.plain_text).join("") || "Product";
        const productDesc = (pp.Description?.rich_text || []).map(t => t.plain_text).join("");
        const productKeywords = (pp.Keywords?.rich_text || []).map(t => t.plain_text).join("");

        const groupingsBlock = target.groupings.map(g => `${g.name}:\n${g.notes.map(n => `- ${n}`).join("\n")}`).join("\n\n");
        const prompt = `${researchGuidelinesBlock(body.researchGuidelines)}You are a marketing strategist writing ONE section of a larger product-page brief.

PRODUCT: ${productName}
DESCRIPTION: ${productDesc || "(none)"}
KEYWORDS: ${productKeywords || "(none)"}

SECTION: ${target.name}
This section's groupings and the deliverable prompts under each (from the method's own framework):
${groupingsBlock}

INSTRUCTIONS:
- For each grouping listed, generate 1-3 specific, named deliverable items — concrete work someone could sit down and produce, grounded in the PRODUCT/DESCRIPTION/KEYWORDS above. Not generic — use the real product name and specifics.
- Stay within THIS section only — do not invent content for other sections.

Return ONLY a JSON array, no other text, no markdown fences:
{ "title": "...", "grouping": "exact grouping name from the list above", "description": "1-2 sentences, specific to this product" }`;

        const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 3000, messages: [{ role: "user", content: prompt }] }),
        });
        const aiData = await aiResp.json();
        if (!aiResp.ok) return json({ error: aiData.error?.message || "Claude API error" }, 500);
        let items;
        try {
          const raw = aiData.content?.[0]?.text || "";
          const s = raw.indexOf('['), e = raw.lastIndexOf(']');
          if (s === -1 || e === -1 || e < s) throw new Error("No JSON array found");
          items = JSON.parse(sanitizeJsonControlChars(raw.slice(s, e + 1)));
          if (!Array.isArray(items)) throw new Error("Not an array");
        } catch(e) {
          return json({ error: "Failed to parse section JSON: " + e.message + " | RAW: " + (aiData.content?.[0]?.text || '').slice(0, 300) }, 500);
        }

        // Upsert the Strategy record (same find-or-create as saveMethodStrategy).
        const q = await fetch(`https://api.notion.com/v1/databases/${STRATEGY_DB}/query`, {
          method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ filter: { and: [
            { property: "Product", relation: { contains: dash(productId) } },
            { property: "Method", relation: { contains: dash(methodId) } },
          ] } }),
        }).then(r => r.json());
        const existing = (q.results || [])[0];

        const rtBlock = t => t ? [{ type: "text", text: { content: String(t).slice(0, 1990), link: null }, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: "default" } }] : [];
        const headingBlock = (level, text) => ({ object: "block", type: `heading_${level}`, [`heading_${level}`]: { rich_text: rtBlock(text) } });
        const bulletBlock = text => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rtBlock(text) } });

        const byGrouping = {};
        for (const it of items) { const g = it.grouping || target.name; byGrouping[g] = byGrouping[g] || []; byGrouping[g].push(it); }
        const newBlocks = [headingBlock(2, target.name)];
        for (const g of Object.keys(byGrouping)) {
          newBlocks.push(headingBlock(3, g));
          for (const it of byGrouping[g]) newBlocks.push(bulletBlock(`${it.title}${it.description ? `: ${it.description}` : ''}`));
        }

        let strategyId, strategyUrl;
        if (existing) {
          strategyId = existing.id.replace(/-/g,""); strategyUrl = existing.url;
          // Remove ONLY this phase's existing blocks (the heading_2 matching
          // this phase's name, and everything up to the next heading_2) —
          // every other phase's blocks are left untouched.
          const blocksResp = await fetch(`https://api.notion.com/v1/blocks/${dash(strategyId)}/children?page_size=100`, { headers: hdr }).then(r => r.json());
          const allBlocks = blocksResp.results || [];
          const toDelete = [];
          let inTarget = false;
          for (const b of allBlocks) {
            if (b.type === "heading_2") {
              const t = (b.heading_2?.rich_text || []).map(x => x.plain_text).join("").trim();
              inTarget = t === target.name;
            }
            if (inTarget) toDelete.push(b.id);
          }
          await Promise.all(toDelete.map(id => fetch(`https://api.notion.com/v1/blocks/${id}`, { method: "DELETE", headers: hdr })));
          await fetch(`https://api.notion.com/v1/blocks/${dash(strategyId)}/children`, {
            method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ children: newBlocks }),
          });
          await fetch(`https://api.notion.com/v1/pages/${dash(strategyId)}`, {
            method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ properties: { Status: { select: { name: "Current" } } } }),
          });
        } else {
          const createResp = await fetch("https://api.notion.com/v1/pages", {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({
              parent: { database_id: STRATEGY_DB },
              properties: {
                Name: { title: [{ type: "text", text: { content: `${productName} — ${methodName || 'Method'} Strategy`.slice(0, 200) } }] },
                Product: { relation: [{ id: dash(productId) }] },
                Method: { relation: [{ id: dash(methodId) }] },
                Campaigns: campaignId ? { relation: [{ id: dash(campaignId) }] } : undefined,
                Status: { select: { name: "Current" } },
              },
              children: newBlocks,
            }),
          });
          const created = await createResp.json();
          if (!createResp.ok || !created.id) return json({ error: created.message || "Strategy create failed" }, createResp.status || 500);
          strategyId = created.id.replace(/-/g,""); strategyUrl = created.url;
        }

        return json({ success: true, strategyId, url: strategyUrl, itemCount: items.length });
      }

      // ── updateMethodStrategyText ──
      // Hand-edit for an existing Strategy record — the product site's ✎
      // Edit control reads getMethodStrategy's flat text, lets the user
      // rewrite it freely, and this replaces the body wholesale. Heading
      // structure (Phase/Grouping) isn't reconstructed from the edited text
      // — "- " prefixed lines become bullets, everything else becomes a
      // plain paragraph; re-running Generate Strategy still produces full
      // H2/H3 structure if the user wants that back.
      if (body.action === "updateMethodStrategyText") {
        const { productId, methodId, text } = body;
        if (!productId || !methodId || typeof text !== "string") return json({ error: "productId, methodId, text required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const q = await fetch(`https://api.notion.com/v1/databases/${STRATEGY_DB}/query`, {
          method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ filter: { and: [
            { property: "Product", relation: { contains: dash(productId) } },
            { property: "Method", relation: { contains: dash(methodId) } },
          ] } }),
        }).then(r => r.json());
        const existing = (q.results || [])[0];
        if (!existing) return json({ error: "No Strategy found for this method — run Generate Strategy first." }, 400);
        const strategyId = existing.id.replace(/-/g,"");
        const rtBlock = t => t ? [{ type: "text", text: { content: String(t).slice(0, 1990), link: null }, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: "default" } }] : [];
        const children = text.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 100).map(line => {
          if (line.startsWith("- ")) return { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rtBlock(line.slice(2)) } };
          return { object: "block", type: "paragraph", paragraph: { rich_text: rtBlock(line) } };
        });
        const blocksResp = await fetch(`https://api.notion.com/v1/blocks/${dash(strategyId)}/children?page_size=100`, { headers: hdr }).then(r => r.json());
        const existingBlockIds = (blocksResp.results || []).map(b => b.id);
        await Promise.all(existingBlockIds.map(id => fetch(`https://api.notion.com/v1/blocks/${id}`, { method: "DELETE", headers: hdr })));
        await fetch(`https://api.notion.com/v1/blocks/${dash(strategyId)}/children`, {
          method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ children }),
        });
        await fetch(`https://api.notion.com/v1/pages/${dash(strategyId)}`, {
          method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { Status: { select: { name: "Current" } } } }),
        });
        return json({ success: true, strategyId, url: existing.url });
      }

      // ── generateTitlesFromProductStrategy ──
      // Generates titles for ANY attached method (destination, traffic-
      // child, or ordinary flat method alike — no per-type branching),
      // grounded in the PRODUCT-level Strategy (all 11 STRATEGY_FIELDS) +
      // Keywords — the "what to say" — plus this method's own framework —
      // the "what to build for this platform". ONE Claude call PER
      // ASSET-classified phase, not one call for the whole method — trying
      // to write full assembled content for every phase in a single call is
      // exactly the truncation failure that hit the earlier per-method
      // Strategy design (a big/verbose phase like "Campaign Architecture"
      // alone can burn the whole token budget mid-string). Each phase call
      // is small and safe regardless of how many phases the method has.
      // Falls back to the method's full framework as one pseudo-phase if
      // nothing is tagged [Asset] and no legacy-name match either.
      if (body.action === "generateTitlesFromProductStrategy") {
        const { productId, campaignId, methodId, methodName } = body;
        if (!productId || !methodId) return json({ error: "productId and methodId required" }, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };

        const [productPage, stratQ, phases] = await Promise.all([
          fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, { headers: hdr }).then(r => r.json()),
          // Method: is_empty excludes per-method Briefs (a separate record
          // sharing this same Product relation) — this needs the actual
          // product-level Strategy, not whichever record sorts first.
          fetch(`https://api.notion.com/v1/databases/${STRATEGY_DB}/query`, {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ filter: { and: [
              { property: "Product", relation: { contains: dash(productId) } },
              { property: "Method", relation: { is_empty: true } },
            ] } }),
          }).then(r => r.json()),
          parseMethodPhases(hdr, dash(methodId)),
        ]);
        const pp = productPage.properties || {};
        const productName = (pp.Name?.title || []).map(t => t.plain_text).join("") || "Product";
        const productKeywords = (pp.Keywords?.rich_text || []).map(t => t.plain_text).join("");

        const stratRecord = (stratQ.results || [])[0];
        const stratProps = stratRecord?.properties || {};
        const strategyBlock = STRATEGY_FIELDS.map(f => {
          const v = (stratProps[f]?.rich_text || []).map(t => t.plain_text).join("");
          return v ? `${f}: ${v}` : '';
        }).filter(Boolean).join("\n");

        const assetPhases = phases.filter(p => p.kind !== "strategy");
        const relevantPhases = assetPhases.length ? assetPhases : (phases.length ? phases : [{ name: methodName, groupings: [] }]);

        const rtBlock = t => t ? [{ type: "text", text: { content: String(t).slice(0, 1990), link: null }, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: "default" } }] : [];
        let created = 0;
        const failedPhases = [];
        for (const phase of relevantPhases) {
          const frameworkBlock = `PHASE: ${phase.name}\n` + phase.groupings.map(g => `${g.name}: ${g.notes.join("; ")}`).join("\n");
          const prompt = `${researchGuidelinesBlock(body.researchGuidelines)}You are producing the actual publishable deliverable(s) for ONE section of a marketing method, using this product's core strategy as the source material for what to say.

PRODUCT: ${productName}
KEYWORDS: ${productKeywords || "(none)"}

PRODUCT STRATEGY (use this as the substance — don't invent positioning that contradicts it):
${strategyBlock || "(no strategy fields generated yet — ground in PRODUCT/KEYWORDS only)"}

METHOD: ${methodName}
SECTION TO PRODUCE: ${phase.name}
WHAT THIS SECTION NEEDS BUILT (from the method's own framework):
${frameworkBlock}

INSTRUCTIONS:
- Produce ONE cohesive, real, assembled deliverable for THIS section only — consolidate everything above into one piece of content, not a restatement of the framework, not one title per bullet. Only propose a second item if this section genuinely needs two distinct pieces (rare).
- Ground it in the PRODUCT STRATEGY above — real specifics, not generic marketing language.
- Keep the assembled content focused and complete for this one section — don't try to cover other sections of the method.

Return ONLY a JSON array, no other text, no markdown fences:
{ "title": "deliverable name, e.g. '${phase.name} — <product>'", "content": "the actual assembled copy/content for this deliverable" }`;

          try {
            const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
              body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2500, messages: [{ role: "user", content: prompt }] }),
            });
            const aiData = await aiResp.json();
            if (!aiResp.ok) throw new Error(aiData.error?.message || "Claude API error");
            const raw = aiData.content?.[0]?.text || "";
            const s = raw.indexOf('['), e = raw.lastIndexOf(']');
            if (s === -1 || e === -1 || e < s) throw new Error("No JSON array found");
            const items = JSON.parse(sanitizeJsonControlChars(raw.slice(s, e + 1)));
            if (!Array.isArray(items)) throw new Error("Not an array");

            for (const it of items.slice(0, 2)) {
              const props = {
                "Title":    { title: rtBlock(String(it.title || phase.name).slice(0, 200)) },
                "Status":   { select: { name: "Development" } },
                "Grouping": { rich_text: rtBlock(`${methodName} > ${phase.name}`) },
                "method":   { relation: [{ id: dash(methodId) }] },
                "product":  { relation: [{ id: dash(productId) }] },
              };
              if (campaignId) props["Campaign"] = { relation: [{ id: dash(campaignId) }] };
              const children = String(it.content || '').split(/\n\n+/).filter(Boolean).map(pg => ({ object: "block", type: "paragraph", paragraph: { rich_text: rtBlock(pg.slice(0, 1990)) } }));
              const resp = await fetch("https://api.notion.com/v1/pages", {
                method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
                body: JSON.stringify({ parent: { database_id: CONTENT_STRATEGY_DB }, properties: props, children }),
              });
              const page = await resp.json();
              if (page.id) created++;
            }
          } catch(e) { failedPhases.push(phase.name); }
        }
        if (!created) return json({ error: `Failed to generate any titles — every section failed: ${failedPhases.join(", ") || "unknown error"}` }, 500);
        return json({ created, phaseCount: relevantPhases.length, failedPhases });
      }

      // ── generateTitlesFromStrategy ──
      // For a DESTINATION method (has a Strategy doc): reads the strategy
      // back and produces a small set of GENUINE publishable titles informed
      // by it — e.g. the actual page copy as one title — instead of the raw
      // framework being exploded into dozens of planning-decision "titles".
      if (body.action === "generateTitlesFromStrategy") {
        const { productId, campaignId, methodId, methodName } = body;
        if (!productId || !campaignId || !methodId) return json({ error: "productId, campaignId, methodId required" }, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };

        const q = await fetch(`https://api.notion.com/v1/databases/${STRATEGY_DB}/query`, {
          method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ filter: { and: [
            { property: "Product", relation: { contains: dash(productId) } },
            { property: "Method", relation: { contains: dash(methodId) } },
          ] } }),
        }).then(r => r.json());
        const record = (q.results || [])[0];
        if (!record) return json({ error: "No Strategy found for this method — run Generate Strategy first." }, 400);
        const strategyId = record.id.replace(/-/g,"");
        const blocksResp = await fetch(`https://api.notion.com/v1/blocks/${dash(strategyId)}/children?page_size=100`, { headers: hdr }).then(r => r.json());
        const strategyText = (blocksResp.results || []).map(b => {
          const type = b.type; const rich = b[type]?.rich_text || [];
          const t = rich.map(x => x.plain_text).join("");
          if (!t) return "";
          if (/^heading/.test(type)) return `\n${t}`;
          if (type === "bulleted_list_item") return `- ${t}`;
          return t;
        }).filter(Boolean).join("\n");

        const productPage = await fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, { headers: hdr }).then(r => r.json());
        const productName = (productPage.properties?.Name?.title || []).map(t => t.plain_text).join("") || "Product";

        const prompt = `${researchGuidelinesBlock(body.researchGuidelines)}You have a complete marketing STRATEGY document below for one product and destination method. Your job is to turn it into actual PUBLISHABLE deliverables — real assets with a publication destination — NOT a restatement of the strategy's planning decisions.

PRODUCT: ${productName}
METHOD: ${methodName}

STRATEGY DOCUMENT:
${strategyText.slice(0, 6000)}

INSTRUCTIONS:
- Propose 1-3 genuine publishable deliverables this strategy produces (e.g. for a landing page method: the actual assembled page itself, maybe a distinct pricing/FAQ section if it warrants its own page). Do NOT list out individual planning decisions (headlines, CTA copy, pricing framing) as separate items — those already live in the strategy above and should be USED to inform these deliverables, not repeated as their own titles.
- Each deliverable's "content" field should be the actual assembled copy/content for that piece, written using the strategy above as its source material — a real draft, not an outline.

Return ONLY a JSON array — no other text, no markdown fences:
{ "title": "deliverable name, e.g. 'Homepage Copy — <product>'", "content": "the actual assembled copy for this deliverable, grounded in the strategy above" }`;

        const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
        });
        const aiData = await aiResp.json();
        if (!aiResp.ok) return json({ error: aiData.error?.message || "Claude API error" }, 500);

        let items;
        try {
          const raw = aiData.content?.[0]?.text || "";
          const s = raw.indexOf('['), e = raw.lastIndexOf(']');
          if (s === -1 || e === -1 || e < s) throw new Error("No JSON array found");
          items = JSON.parse(sanitizeJsonControlChars(raw.slice(s, e + 1)));
          if (!Array.isArray(items)) throw new Error("Not an array");
        } catch(e) {
          return json({ error: "Failed to parse titles JSON: " + e.message + " | RAW: " + (aiData.content?.[0]?.text || '').slice(0, 300) }, 500);
        }

        const rtBlock = text => text ? [{ type: "text", text: { content: String(text).slice(0, 1990), link: null }, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: "default" } }] : [];
        let created = 0;
        for (const it of items.slice(0, 5)) {
          const props = {
            "Title":    { title: rtBlock(String(it.title || 'Untitled').slice(0, 200)) },
            "Status":   { select: { name: "Development" } },
            "Grouping": { rich_text: rtBlock(methodName || '') },
            "Campaign": { relation: [{ id: dash(campaignId) }] },
            "method":   { relation: [{ id: dash(methodId) }] },
            "product":  { relation: [{ id: dash(productId) }] },
          };
          const children = String(it.content || '').split(/\n\n+/).filter(Boolean).map(pg => ({ object: "block", type: "paragraph", paragraph: { rich_text: rtBlock(pg.slice(0, 1990)) } }));
          const resp = await fetch("https://api.notion.com/v1/pages", {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ parent: { database_id: CONTENT_STRATEGY_DB }, properties: props, children }),
          });
          const page = await resp.json();
          if (page.id) created++;
        }
        return json({ created });
      }

      // ── generateTrafficMethodTitles ──
      // For a GROWTH/DISTRIBUTION method (Instagram, X, Pinterest, Email —
      // a platform an audience is grown ON, not a page landed on), generates
      // a comprehensive, multi-post-type title set in one pass. Grounded in
      // the PRODUCT-level Strategy (11 fields — what to say) AND the
      // method's own researched [Arc] phases (parseMethodPhases — the
      // reusable, product-agnostic structural patterns that drive growth on
      // THIS platform, from researchAndWriteMethodology). Claude organizes
      // titles by POST TYPE (Carousel/Reel/Picture Post, or whatever
      // genuinely fits — informed by the method's own arc research, not
      // invented from scratch each time), with 2-4 titles per type carrying
      // an explicit sequenceOrder so a rollout (Reel 1, Reel 2, Reel 3...)
      // is a real, orderable sequence. Works standalone OR nested under a
      // destination (parentMethodId/parentMethodName are optional, purely
      // for the Grouping lineage label) — a growth method doesn't require a
      // parent destination to be worth generating for.
      if (body.action === "generateTrafficMethodTitles") {
        const { productId, campaignId, parentMethodName, parentMethodId, childMethodId, childMethodName, childMethodNotes } = body;
        if (!productId || !childMethodId || !childMethodName) return json({ error: "productId, childMethodId, childMethodName required" }, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };

        const [productPage, stratQ, arcPhases] = await Promise.all([
          fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, { headers: hdr }).then(r => r.json()),
          // Method: is_empty — see generateTitlesFromProductStrategy.
          fetch(`https://api.notion.com/v1/databases/${STRATEGY_DB}/query`, {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ filter: { and: [
              { property: "Product", relation: { contains: dash(productId) } },
              { property: "Method", relation: { is_empty: true } },
            ] } }),
          }).then(r => r.json()),
          parseMethodPhases(hdr, dash(childMethodId)),
        ]);
        const pp = productPage.properties || {};
        const productName = (pp.Name?.title || []).map(t => t.plain_text).join("") || "Product";
        const productKeywords = (pp.Keywords?.rich_text || []).map(t => t.plain_text).join("");

        const stratRecord = (stratQ.results || [])[0];
        const stratProps = stratRecord?.properties || {};
        const strategyBlock = STRATEGY_FIELDS.map(f => {
          const v = (stratProps[f]?.rich_text || []).map(t => t.plain_text).join("");
          return v ? `${f}: ${v}` : '';
        }).filter(Boolean).join("\n");

        const arcBlock = arcPhases.map(p =>
          `${p.name}\n` + p.groupings.map(g => `  ${g.name}: ${g.notes.join("; ")}`).join("\n")
        ).join("\n\n");

        const prompt = `${researchGuidelinesBlock(body.researchGuidelines)}You are a content strategist planning growth content for one platform. Organize your plan by POST TYPE (the distinct content formats this platform actually supports — e.g. Carousel, Reel, Picture Post for Instagram; just "Email" for an email list; "Video" for YouTube).

${arcBlock ? `THIS PLATFORM'S RESEARCHED GROWTH ARCS (reusable structural patterns for ${childMethodName} — use these as the actual postType/sequence structure, don't invent a different structure from scratch):\n${arcBlock}\n\n` : ''}${parentMethodName ? `DESTINATION THIS TRAFFIC SERVES: ${parentMethodName}\n\n` : ''}PRODUCT STRATEGY (the substance — what to actually say, ground every title in this):
${strategyBlock || "(no strategy fields generated yet)"}

PLATFORM/METHOD: ${childMethodName}
METHOD NOTES: ${childMethodNotes || "(none)"}
PRODUCT: ${productName}
KEYWORDS: ${productKeywords || "(none on file)"}

INSTRUCTIONS:
- Group titles by postType, following the researched growth arcs above where provided. For each postType with more than one title, they form a ROLLOUT SEQUENCE — assign sequenceOrder 1, 2, 3... reflecting the order they'd actually post in (each building on or varying the last per the arc's structure, not repetitive).
- 2-4 titles per postType. 2-4 postTypes total (only ones that genuinely fit this platform).
- Titles are deliverable names (things to produce), specific to this product's strategy above — not generic content ideas.

Return ONLY a JSON array — no other text, no markdown fences:
{ "title": "...", "description": "1-2 sentences, specific to this product", "postType": "e.g. Carousel", "sequenceOrder": 1 }`;

        const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2500, messages: [{ role: "user", content: prompt }] }),
        });
        const aiData = await aiResp.json();
        if (!aiResp.ok) return json({ error: aiData.error?.message || "Claude API error" }, 500);

        let items;
        try {
          const raw = aiData.content?.[0]?.text || "";
          const s = raw.indexOf('['), e = raw.lastIndexOf(']');
          if (s === -1 || e === -1 || e < s) throw new Error("No JSON array found");
          items = JSON.parse(sanitizeJsonControlChars(raw.slice(s, e + 1)));
          if (!Array.isArray(items)) throw new Error("Not an array");
        } catch(e) {
          return json({ error: "Failed to parse titles JSON: " + e.message + " | RAW: " + (aiData.content?.[0]?.text || '').slice(0, 300) }, 500);
        }

        const rtBlock = text => text ? [{ type: "text", text: { content: String(text), link: null }, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: "default" } }] : [];
        let created = 0;
        const byPostType = {};
        for (const it of items) {
          const grouping = [parentMethodName, childMethodName, it.postType].filter(Boolean).join(' > ');
          const props = {
            "Title":          { title: rtBlock(String(it.title || 'Untitled').slice(0, 200)) },
            "Status":         { select: { name: "Development" } },
            "Grouping":       { rich_text: rtBlock(grouping) },
            "Core Idea":      { rich_text: rtBlock(String(it.description || '').slice(0, 1990)) },
            "method":         { relation: [{ id: dash(childMethodId) }] },
            "product":        { relation: [{ id: dash(productId) }] },
          };
          if (campaignId) props["Campaign"] = { relation: [{ id: dash(campaignId) }] };
          if (Number.isFinite(it.sequenceOrder)) props["Sequence Order"] = { number: it.sequenceOrder };
          const resp = await fetch("https://api.notion.com/v1/pages", {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ parent: { database_id: CONTENT_STRATEGY_DB }, properties: props }),
          });
          const page = await resp.json();
          if (page.id) { created++; byPostType[it.postType || 'Other'] = (byPostType[it.postType || 'Other'] || 0) + 1; }
        }
        return json({ created, postTypes: byPostType });
      }

      // ── addProductMethod / removeProductMethod ──
      // Manual attach/detach of an existing Method to a product — kept
      // available independent of the AI matching pipeline above, so a
      // product's methods can always be hand-edited/augmented directly.
      if (body.action === "addProductMethod") {
        const { productId, methodId, augmentedNotes } = body;
        if (!productId || !methodId) return json({ error: "productId and methodId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const prodResp = await fetch(`https://api.notion.com/v1/pages/${dashId(productId)}`, { headers: hdr });
        const prodPage = await prodResp.json();
        const existing = (prodPage.properties?.["Methods"]?.relation || []).map(r => ({ id: r.id }));
        const alreadyLinked = existing.some(r => r.id.replace(/-/g,"") === methodId.replace(/-/g,""));
        if (!alreadyLinked) existing.push({ id: dashId(methodId) });
        const patchResp = await fetch(`https://api.notion.com/v1/pages/${dashId(productId)}`, {
          method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Methods": { relation: existing } } }),
        });
        const result = await patchResp.json();
        if (!patchResp.ok) return json({ error: result.message || "Update failed" }, patchResp.status);
        // Optional — from suggestProductMethod's augmentedNotes, applied only
        // now that the user has explicitly committed to this method.
        if (augmentedNotes) {
          await fetch(`https://api.notion.com/v1/pages/${dashId(methodId)}`, {
            method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ properties: { Notes: { rich_text: [{ type: "text", text: { content: String(augmentedNotes).slice(0, 1990) } }] } } }),
          });
        }
        // Also attach to every Campaign this product belongs to.
        await propagateMethodToCampaigns(productId, methodId);

        // Reusing an EXISTING method still needs to be "fully researched" —
        // best-effort; researchAndWriteMethodology no-ops if this method
        // already has a substantial framework, so this is safe to run on
        // every attach without re-researching methods that don't need it.
        try {
          const methodPage = await fetch(`https://api.notion.com/v1/pages/${dashId(methodId)}`, { headers: hdr }).then(r => r.json());
          const methodName = (methodPage.properties?.Name?.title || []).map(t => t.plain_text).join("") || "Method";
          const platform = methodPage.properties?.Platform?.select?.name || "";
          const isDestination = !!methodPage.properties?.["Needs Traffic Plan"]?.checkbox;
          const ppc = prodPage.properties || {};
          const productContext = [
            (ppc.Name?.title || []).map(t => t.plain_text).join(""),
            (ppc.Description?.rich_text || []).map(t => t.plain_text).join(""),
          ].filter(Boolean).join(" — ");
          await researchAndWriteMethodology(hdr, env, dashId(methodId), methodName, platform, productContext, false, isDestination, body.researchGuidelines);
        } catch(e) { /* best-effort — method stays usable as-is */ }

        return json({ success: true });
      }

      if (body.action === "removeProductMethod") {
        const { productId, methodId } = body;
        if (!productId || !methodId) return json({ error: "productId and methodId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const prodResp = await fetch(`https://api.notion.com/v1/pages/${dashId(productId)}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        const prodPage = await prodResp.json();
        const filtered = (prodPage.properties?.["Methods"]?.relation || [])
          .filter(r => r.id.replace(/-/g,"") !== methodId.replace(/-/g,""))
          .map(r => ({ id: r.id }));
        const patchResp = await fetch(`https://api.notion.com/v1/pages/${dashId(productId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Methods": { relation: filtered } } }),
        });
        const result = await patchResp.json();
        if (!patchResp.ok) return json({ error: result.message || "Update failed" }, patchResp.status);
        return json({ success: true });
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
        const { stages, campaignId, productId } = body;
        const stageFilters = (stages || ["Review", "Publish"]).map(s => ({
          property: "Status",
          select: { equals: s }
        }));
        const filter = campaignId
          ? { and: [
              { or: stageFilters },
              { property: "Campaign", relation: { contains: campaignId } }
            ]}
          : productId
          ? { and: [
              { or: stageFilters },
              { property: "product", relation: { contains: productId } }
            ]}
          : { or: stageFilters };
        const results = await notionQuery(CONTENT_STRATEGY_DB, {
          filter,
          sorts: [{ property: "Sequence Order", direction: "ascending" }],
        });
        const titleList = results.map(page => {
          const props = page.properties;
          return {
            id:        page.id.replace(/-/g, ""),
            title:     props.Title?.title?.map(t => t.plain_text).join("") || "Untitled",
            stage:     props.Status?.select?.name || "",
            _rawGrouping: props.Grouping?.rich_text?.map(t => t.plain_text).join("") || "",
            sequence:  props["Sequence Order"]?.number || 999,
            scheduled: props["Scheduled Date"]?.date?.start || "",
            productId: (props.product?.relation || [])[0]?.id?.replace(/-/g,"") || "__none__",
            methodId:  (props.method?.relation  || [])[0]?.id?.replace(/-/g,"") || "__none__",
            assetIds:  (props.Assets?.relation || []).map(r => r.id.replace(/-/g,"")),
          };
        });
        // Resolve product + method names
        const pIds = [...new Set(titleList.map(t => t.productId).filter(x => x !== '__none__'))];
        const mIds = [...new Set(titleList.map(t => t.methodId).filter(x => x !== '__none__'))];
        const dashify = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const fetchName = async id => { try { const r = await fetch(`https://api.notion.com/v1/pages/${dashify(id)}`, { headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION } }); const p = await r.json(); return { id, name: (p.properties?.Name?.title || []).map(t => t.plain_text).join("") || "?" }; } catch(e) { return { id, name: "?" }; } };
        const [prodPages, methPages] = await Promise.all([Promise.all(pIds.map(fetchName)), Promise.all(mIds.map(fetchName))]);
        const pNames = Object.fromEntries(prodPages.map(p => [p.id, p.name]));
        const mNames = Object.fromEntries(methPages.map(p => [p.id, p.name]));
        titleList.forEach(t => {
          t.productName = t.productId === '__none__' ? 'No Product' : (pNames[t.productId] || '?');
          t.methodName  = t.methodId  === '__none__' ? 'No Method'  : (mNames[t.methodId]  || '?');
          const parts = (t._rawGrouping || '').split(' > ');
          t.phase    = parts.length > 1 ? parts[0].trim() : '';
          t.grouping = parts.length > 1 ? parts.slice(1).join(' > ').trim() : (t._rawGrouping || '');
          delete t._rawGrouping;
        });
        // Attach asset summaries to any title that already has generated
        // Assets — regardless of stage, since Generate Assets now runs
        // directly from Development titles too (not just Publish-stage) and
        // both the title row and the Generate Assets modal's "existing
        // assets" panel need to see them. Titles with no assetIds cost
        // nothing extra either way.
        await Promise.all(titleList.map(async t => {
          if (!t.assetIds.length) { t.assets = []; return; }
          t.assets = (await Promise.all(t.assetIds.map(async aid => {
            try {
              const r = await fetch(`https://api.notion.com/v1/pages/${dashify(aid)}`, { headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION } });
              if (!r.ok) return null;
              const p = (await r.json()).properties || {};
              return {
                id: aid,
                title: p["Asset Title"]?.title?.map(x => x.plain_text).join("") || "Untitled",
                platform: p["Platform Name"]?.select?.name || "",
                type: p["Asset Type"]?.select?.name || "",
                status: p["Asset Status"]?.select?.name || "",
                designLink: p["Design Link"]?.url || "",
                gradeScore: p["Grade Score"]?.number ?? null,
                gradeStatus: p["Status"]?.select?.name || "",
                gradeNotes: p["Grade Notes"]?.rich_text?.map(x => x.plain_text).join("") || "",
              };
            } catch(e) { return null; }
          }))).filter(Boolean);
        }));
        return json({ titles: titleList });
      }

      // ── generateMethodTitles ──
      // ── getSeedKeywordCandidates ──
      // Structures a campaign's (and optionally a product's) Keywords text
      // into pickable groups for the SEO Post seed-keyword picker. Research
      // Keywords fields are sometimes plain comma lists and sometimes
      // clustered prose (e.g. "CLUSTER category/trend hook: term, term.
      // CLUSTER comparison/decision: term, term...") depending on how that
      // campaign's research was run — a fixed regex tuned to one exact
      // phrasing would break on the other, so this asks Claude to extract
      // clean individual keyword terms grouped however the source text
      // itself groups them (one ungrouped bucket if it's just a flat list).
      if (body.action === "getSeedKeywordCandidates") {
        const { campaignId, productId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const hasProduct = productId && productId !== "__none__" && productId !== campaignId;
        const [researchRaw, productPage] = await Promise.all([
          fetch(`https://api.notion.com/v1/databases/${RESEARCH_DB}/query`, {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ filter: { property: "Campaign", relation: { contains: dash(campaignId) } } }),
          }).then(r => r.json()).catch(() => ({ results: [] })),
          hasProduct ? fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, { headers: hdr }).then(r => r.json()).catch(() => null) : Promise.resolve(null),
        ]);
        const rt = (results, key) => { for (const r of (results.results || [])) { const v = (r.properties[key]?.rich_text || []).map(t => t.plain_text).join(""); if (v) return v; } return ""; };
        const campaignKeywords = rt(researchRaw, "Keywords");
        const productKeywords = productPage?.properties?.Keywords?.rich_text ? (productPage.properties.Keywords.rich_text || []).map(t => t.plain_text).join("") : "";

        if (!campaignKeywords && !productKeywords) return json({ groups: [] });

        const naiveFlatGroups = () => {
          const groups = [];
          if (productKeywords) groups.push({ source: "product", label: "", keywords: productKeywords.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) });
          if (campaignKeywords) groups.push({ source: "campaign", label: "", keywords: campaignKeywords.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) });
          return groups;
        };
        if (!env.ANTHROPIC_API_KEY) return json({ groups: naiveFlatGroups() });

        const prompt = `Extract clean, individual keyword candidates from this research text, grouped exactly as the text itself groups them — if it's organized into labeled clusters, keep those labels verbatim; if it's a plain comma-separated list with no structure, return one group with an empty label.

${productKeywords ? `PRODUCT KEYWORDS:\n${productKeywords}\n\n` : ''}${campaignKeywords ? `CAMPAIGN KEYWORDS:\n${campaignKeywords}` : ''}

Return ONLY a JSON array, no other text, no markdown fences:
[{ "source": "product"|"campaign", "label": "cluster label verbatim, or empty string if flat", "keywords": ["term1", "term2", ...] }]`;

        try {
          const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
          });
          const aiData = await aiResp.json();
          if (!aiResp.ok) return json({ groups: naiveFlatGroups() });
          const raw = aiData.content?.[0]?.text || "";
          const s = raw.indexOf('['), e = raw.lastIndexOf(']');
          if (s === -1 || e === -1 || e < s) return json({ groups: naiveFlatGroups() });
          const groups = JSON.parse(sanitizeJsonControlChars(raw.slice(s, e + 1)));
          if (!Array.isArray(groups) || !groups.length) return json({ groups: naiveFlatGroups() });
          return json({ groups });
        } catch(e) {
          return json({ groups: naiveFlatGroups() });
        }
      }

      if (body.action === "generateMethodTitles") {
        const { campaignId, methodId, productId, parentTitle, parentTitleId } = body;
        if (!campaignId || !methodId) return json({ error: "campaignId and methodId required" }, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
        // "blend" (default) = campaign research + product context together, as
        // this action has always behaved. "isolate" = product context only,
        // no campaign research block at all — requires a product to isolate to.
        const contextMode = body.contextMode === "isolate" ? "isolate" : "blend";
        if (contextMode === "isolate" && (!productId || productId === "__none__" || productId === campaignId)) {
          return json({ error: "Isolate mode requires a product to isolate to — pick a product, or use Blend." }, 400);
        }
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const parentSeed = await buildTitleSeedContext(hdr, parentTitleId, parentTitle);
        // "no product" is signaled two ways in this codebase: the literal
        // sentinel '__none__', or the campaignId itself (the modal's "Campaign"
        // option sets productId=campaignId) — treat both as no product, else
        // the campaign page gets fetched and read as if it were a product.
        const hasProduct = productId && productId !== '__none__' && productId !== campaignId;

        // Fetch research, method page+body, and optionally product (+ its
        // Strategy record) in parallel
        const fetches = [
          fetch(`https://api.notion.com/v1/databases/${RESEARCH_DB}/query`, {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ filter: { property: "Campaign", relation: { contains: dash(campaignId) } } }),
          }).then(r => r.json()),
          fetch(`https://api.notion.com/v1/pages/${dash(campaignId)}`, { headers: hdr }).then(r => r.json()),
          fetch(`https://api.notion.com/v1/pages/${dash(methodId)}`, { headers: hdr }).then(r => r.json()),
          hasProduct ? fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, { headers: hdr }).then(r => r.json()) : Promise.resolve(null),
          hasProduct ? fetch(`https://api.notion.com/v1/databases/${STRATEGY_DB}/query`, {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ filter: { and: [
              { property: "Product", relation: { contains: dash(productId) } },
              { property: "Method", relation: { is_empty: true } },
            ] } }),
          }).then(r => r.json()).catch(() => ({ results: [] })) : Promise.resolve({ results: [] }),
        ];
        const [researchRaw, campRaw, methodPage, productPage, strategyQ] = await Promise.all(fetches);
        const methodBody = await extractBlocksTextRecursive(hdr, dash(methodId));

        // Extract research
        const rt = (results, key) => { for (const r of (results.results || [])) { const v = (r.properties[key]?.rich_text || []).map(t => t.plain_text).join(""); if (v) return v; } return ""; };
        const cp = campRaw.properties || {};
        const campaignName = (cp.Name?.title || cp["Campaign Name"]?.title || []).map(t => t.plain_text).join("") || "Campaign";
        const research = {
          keywords:          rt(researchRaw, "Keywords"),
          statement:         rt(researchRaw, "Statement"),
          uniqueOpportunity: rt(researchRaw, "Unique Opportunity"),
          keyMessage:        rt(researchRaw, "Key Message"),
          campaignGoal:      (cp["Campaign Goal"]?.rich_text || []).map(t => t.plain_text).join(""),
          painPoints:        (cp["Pain Points"]?.rich_text || []).map(t => t.plain_text).join(""),
          tiktokTrends:      rt(researchRaw, "TikTok Trends"),
          trendIntelligence: rt(researchRaw, "Trend Intelligence"),
        };

        // Extract method info
        const methodName = (methodPage.properties?.Name?.title || []).map(t => t.plain_text).join("") || "Unknown Method";

        // Extract product strategy (optional) — the product's own page
        // fields, plus its Strategy DB record (positioning: Customer, Pain
        // Points, Solution, Benefits, Emotions, Unique Opportunity — the
        // deeper worked-out doc, not just the page's short fields). Included
        // whenever a product is selected, in both Blend and Isolate — Isolate
        // only excludes CAMPAIGN-level data, product-level data stays either way.
        let productSection = "No product — this is a campaign-level page.";
        if (hasProduct && productPage) {
          const pp = productPage.properties || {};
          const ptxt = prop => (pp[prop]?.rich_text || []).map(x => x.plain_text).join("") || "";
          const productName = (pp.Name?.title || []).map(x => x.plain_text).join("") || "Unknown Product";
          productSection = `PRODUCT: ${productName}
Avatar: ${ptxt("Avatar")}
Transformation: ${ptxt("Transformation")}
Offer Structure: ${ptxt("Offer Structure")}
Price: ${ptxt("Price")}
Proof Points: ${ptxt("Proof Points")}
Objections: ${ptxt("Objections")}
Unique Angle: ${ptxt("Unique Angle")}`;

          const stratRecord = (strategyQ.results || [])[0];
          if (stratRecord) {
            const sp = stratRecord.properties || {};
            const srt = key => (sp[key]?.rich_text || []).map(t => t.plain_text).join("");
            const stratLines = ["Customer", "Pain Points", "Solution", "Benefits", "Emotions", "Niche", "Unique Opportunity", "Offer Structure"]
              .map(f => srt(f) && `${f}: ${srt(f)}`).filter(Boolean);
            if (stratLines.length) productSection += `\n\nPRODUCT STRATEGY (the worked-out positioning doc — weighs more than the fields above where they overlap):\n${stratLines.join("\n")}`;
          }
        }

        // Prefer live-researched TikTok Trends (real scraped post data) over the
        // Haiku-guessed Trend Intelligence niches; use whichever exists. Trend
        // research lives on the campaign's Research record, so isolate mode
        // (no campaign context at all) excludes it too.
        const trendResearch = research.tiktokTrends || research.trendIntelligence || "";
        const trendSource = research.tiktokTrends ? "TikTok Trends (live research)" : (research.trendIntelligence ? "Trend Intelligence (AI-suggested niches)" : "");
        const hasTrendResearch = contextMode === "blend" && !!trendResearch;
        const isolateNote = contextMode === "isolate" ? "\n(Isolate mode — this run intentionally excludes campaign-level research; grounded in this product's own fields only.)\n" : "";

        const campaignResearchBlock = contextMode === "blend" ? `CAMPAIGN: ${campaignName}
CAMPAIGN RESEARCH:
Keywords: ${research.keywords}
Statement: ${research.statement}
Unique Opportunity: ${research.uniqueOpportunity}
Key Message: ${research.keyMessage}
Campaign Goal: ${research.campaignGoal}
Pain Points: ${research.painPoints}
${hasTrendResearch ? `\nTRENDING RESEARCH (${trendSource}):\n${trendResearch.slice(0, 1500)}\n` : '\n(No trend research on file for this campaign — titles below are grounded in static campaign research only, not current trends.)\n'}` : isolateNote;

        // Call Claude to generate titles
        const prompt = `${researchGuidelinesBlock(body.researchGuidelines)}You are a content strategist. Generate all deliverable titles for a method, grounded in ${contextMode === "blend" ? `the campaign research${hasProduct ? " and product strategy" : ""}${hasTrendResearch ? " and current trend research" : ""}` : "this product's own strategy only (isolated from campaign-level research)"}.

${campaignResearchBlock}
METHOD: ${methodName}
METHOD FRAMEWORK:
${methodBody || "(No framework defined — infer phases and groupings from method name and best practices)"}

${productSection}
${parentSeed.text ? `\nSEED IDEA (this run was started from an existing title — use it as inspiration/starting point for the angle, still organized across the framework's phases and groupings, not a rewrite of the seed itself):\n${parentSeed.text}\n` : ''}${body.seedKeyword ? `\nSEED KEYWORD (operator-picked — every title should target this specific keyword/angle, not the campaign's keyword list broadly):\n${body.seedKeyword}\n` : ''}
INSTRUCTIONS:
- Read the method framework carefully. Each Phase heading in the framework is a Phase. Each Grouping heading is a Grouping.
- Generate titles for EVERY phase and grouping defined in the framework.
- Each title must be specific to this ${contextMode === "blend" ? "campaign" : "product"}${hasProduct && contextMode === "blend" ? " and product" : ""}${parentSeed.text ? " and should extend or riff on the seed idea above where it fits naturally" : ""} — use real names, real keywords, real positioning language. No generic titles.
${hasTrendResearch ? '- Ground titles in the trending research above wherever it fits the pillar/grouping — especially any pillar about timing, seasonality, or current moments. Prefer angles the trend research shows real demand for over generic ones.' : ''}
- Titles are deliverable names (things to produce), not content post headlines.
- Aim for 2–3 titles per grouping unless the framework specifies otherwise.
- Flag whether each title is a multi-slide / carousel / swipe-style deliverable (the method framework describes this — look for words like "slide", "carousel", "swipe", "panel") with "slideFormat": true. Otherwise "slideFormat": false. Do NOT write the slide content itself here — that happens in a separate follow-up step. Just flag it.
- Flag whether each title needs a 3-subhead SEO/pillar-post outline (the method framework describes this — look for words like "SEO post", "pillar", "subheads", "outline") with "subheadFormat": true. Otherwise "subheadFormat": false. Do NOT write the outline itself here — that happens in a separate follow-up step. Just flag it.

Return ONLY a JSON array. Each item:
{ "title": "...", "phase": "exact phase name from framework", "grouping": "exact grouping name from framework", "slideFormat": true|false, "subheadFormat": true|false }
No other text. No markdown fences.
If the framework has no clear phases, use the framework section names as phase and content types as grouping.
No other text. No markdown fences.`;

        const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 8000, messages: [{ role: "user", content: prompt }] }),
        });
        const aiData = await aiResp.json();
        if (!aiResp.ok) return json({ error: aiData.error?.message || "Claude API error" }, 500);

        let titles;
        try {
          const raw = aiData.content?.[0]?.text || "";
          const start = raw.indexOf('[');
          const end = raw.lastIndexOf(']');
          if (start === -1 || end === -1 || end < start) throw new Error("No JSON array found");
          titles = JSON.parse(sanitizeJsonControlChars(raw.slice(start, end + 1)));
          if (!Array.isArray(titles)) throw new Error("Not an array");
        } catch(e) {
          const rawText = aiData.content?.[0]?.text || "";
          return json({ error: "Failed to parse titles JSON: " + e.message + " | RAW: " + rawText.slice(0, 300) }, 500);
        }

        // Don't rely solely on the model to notice a slide/carousel format from
        // framework wording — if the Method itself is named for it, force the
        // flag deterministically so titles never silently skip slide generation.
        if (/carousel|slide|swipe|panel/i.test(methodName)) {
          titles.forEach(t => { t.slideFormat = true; });
        }

        // SEO Post: cap at 5 titles and pin every title's grouping to one
        // explicit seed keyword rather than trusting the model to reproduce
        // it verbatim — this is what "grouped together under the seed
        // keyword" depends on downstream. Keyword source, most specific
        // first: an explicit seedKeyword passed by the caller > the selected
        // PRODUCT's own Keywords field (specific to what's being generated
        // for) > the campaign's shared Research Keywords field — the campaign
        // fallback is skipped entirely in isolate mode, since the whole point
        // of isolate is no campaign-level data leaking in.
        if (/seo post/i.test(methodName)) {
          // Fallback only — the UI's seed-keyword picker (getSeedKeywordCandidates)
          // is the real answer to clustered Keywords text ("CLUSTER category/trend
          // hook: term, term. CLUSTER comparison/decision: term, term..."). If the
          // client didn't send an explicit pick, still don't blindly take everything
          // before the first comma — that would grab "CLUSTER label: term" whole.
          // Strip a leading "CLUSTER <label>:" if present, then take the first term.
          const firstTerm = text => (text || "").replace(/^\s*CLUSTER\s+[^:]+:\s*/i, "").split(/[,;\n]/)[0].trim();
          const productKeywords = hasProduct && productPage ? (productPage.properties?.Keywords?.rich_text || []).map(t => t.plain_text).join("") : "";
          const seedKeyword = (body.seedKeyword && body.seedKeyword.trim()) || firstTerm(productKeywords) || (contextMode === "blend" ? firstTerm(research.keywords) : "") || methodName;
          titles = titles.slice(0, 5);
          titles.forEach(t => { t.subheadFormat = true; t.phase = null; t.grouping = seedKeyword; });
        }

        // Return titles to client — client will save in batches via saveMethodTitles
        return json({ titles, hasTrendResearch, trendSource: hasTrendResearch ? trendSource : null, contextMode });
      }

      // ── saveMethodTitles ──
      if (body.action === "saveMethodTitles") {
        const { titles, campaignId, methodId, productId } = body;
        if (!titles?.length || !campaignId || !methodId) return json({ error: "titles, campaignId, methodId required" }, 400);
        // "no product" is signaled two ways in this codebase: the literal
        // sentinel '__none__', or the campaignId itself (the modal's "Campaign"
        // option sets productId=campaignId) — treat both as no product, else
        // the campaign page gets fetched and read as if it were a product.
        const hasProduct = productId && productId !== '__none__' && productId !== campaignId;
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const rtBlock = (text, opts = {}) => text ? [{ type: "text", text: { content: String(text), link: null }, annotations: { bold: !!opts.bold, italic: !!opts.italic, strikethrough: false, underline: false, code: false, color: "default" } }] : [];
        let created = 0;
        const saved = [];
        for (const t of titles) {
          const props = {
            "Title":    { title: rtBlock(t.title) },
            "Status":   { select: { name: "Development" } },
            "Grouping": { rich_text: rtBlock(t.phase ? `${t.phase} > ${t.grouping || ''}` : (t.grouping || "")) },
            "Campaign": { relation: [{ id: dash(campaignId) }] },
            "method":   { relation: [{ id: dash(methodId) }] },
          };
          if (hasProduct) props["product"] = { relation: [{ id: dash(productId) }] };

          const resp = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ parent: { database_id: CONTENT_STRATEGY_DB }, properties: props }),
          });
          const page = await resp.json();
          created++;
          // slideFormat/subheadFormat titles need a separate follow-up call per
          // title (kept out of this batch write, and out of the generation call
          // above, so no single request has to write dozens of full carousel
          // scripts or outlines — that was slow enough to trip Cloudflare's 524
          // timeout).
          if ((t.slideFormat || t.subheadFormat) && page.id) {
            saved.push({ id: page.id.replace(/-/g, ""), title: t.title, slideFormat: !!t.slideFormat, subheadFormat: !!t.subheadFormat });
          }
        }
        return json({ created, titles: saved });
      }

      // ── generateTitleSlides ──
      // Follow-up step for a slideFormat title from saveMethodTitles: one small,
      // fast AI call per title that writes its full carousel script into the
      // already-created page's body. Kept separate from generateMethodTitles so
      // a framework with many carousel titles doesn't blow past Cloudflare's
      // response timeout in one giant call.
      if (body.action === "generateTitleSlides") {
        const { pageId, title, campaignId } = body;
        if (!pageId || !title) return json({ error: "pageId and title required" }, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };

        let keywords = "";
        if (campaignId) {
          const researchRaw = await fetch(`https://api.notion.com/v1/databases/${RESEARCH_DB}/query`, {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ filter: { property: "Campaign", relation: { contains: dash(campaignId) } } }),
          }).then(r => r.json()).catch(() => ({ results: [] }));
          const rt = (results, key) => { for (const r of (results.results || [])) { const v = (r.properties[key]?.rich_text || []).map(t => t.plain_text).join(""); if (v) return v; } return ""; };
          keywords = rt(researchRaw, "Keywords");
        }

        const prompt = `${researchGuidelinesBlock(body.researchGuidelines)}Write a full 7-slide Instagram carousel script for this specific title.

TITLE: ${title}
${keywords ? `KEYWORDS: ${keywords}\n` : ''}
Write EXACTLY 7 slides, no more, no fewer:
- Slide 1 (hook): short punchy headline + one-line subtext as "body"
- Slides 2-6 (insights): 5 slides, each a short headline + 2-3 sentence body — real substance, not placeholders
- Slide 7 (CTA): short quote/summary line as headline + save/follow/next-step prompt as "body"
- Instagram caption (150-200 words) — required, never leave empty
- 8-10 hashtags (no # prefix needed) — required, never leave empty

Every slide must have both a non-empty "headline" and a non-empty "body" — do not add a trailing empty slide.

Return ONLY this JSON object, no other text, no markdown fences:
{ "slides": [ { "headline": "...", "body": "..." }, ... exactly 7 total ... ], "caption": "...", "hashtags": ["...", "..."] }`;

        const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
        });
        const aiData = await aiResp.json();
        if (!aiResp.ok) return json({ error: aiData.error?.message || "Claude API error" }, 500);

        let parsed;
        try {
          const raw = aiData.content?.[0]?.text || "";
          const start = raw.indexOf('{');
          const end = raw.lastIndexOf('}');
          if (start === -1 || end === -1 || end < start) throw new Error("No JSON object found");
          parsed = JSON.parse(sanitizeJsonControlChars(raw.slice(start, end + 1)));
        } catch(e) {
          return json({ error: "Failed to parse slides JSON: " + e.message }, 500);
        }

        const rtBlock = (text, opts = {}) => text ? [{ type: "text", text: { content: String(text), link: null }, annotations: { bold: !!opts.bold, italic: !!opts.italic, strikethrough: false, underline: false, code: false, color: "default" } }] : [];
        const heading = text => ({ object: "block", type: "heading_3", heading_3: { rich_text: rtBlock(text) } });
        const para = (text, opts = {}) => ({ object: "block", type: "paragraph", paragraph: { rich_text: rtBlock(text, opts) } });
        const divider = () => ({ object: "block", type: "divider", divider: {} });

        const slides = (Array.isArray(parsed.slides) ? parsed.slides : []).filter(s => s && (s.headline || s.body));
        const n = slides.length;
        const children = [];
        slides.forEach((s, idx) => {
          children.push(heading(`Slide ${idx + 1} (${idx + 1}/${n})`));
          if (s.headline) children.push(para(s.headline, { bold: true }));
          if (s.body) children.push(para(s.body));
          children.push(divider());
        });
        if (parsed.caption) { children.push(heading('Caption')); children.push(para(parsed.caption)); }
        if (Array.isArray(parsed.hashtags) && parsed.hashtags.length) {
          children.push(heading('Hashtags'));
          children.push(para(parsed.hashtags.map(h => h.startsWith('#') ? h : '#' + h).join(' ')));
        }

        if (children.length) {
          const resp = await fetch(`https://api.notion.com/v1/blocks/${dash(pageId)}/children`, {
            method: "PATCH",
            headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ children }),
          });
          if (!resp.ok) { const r = await resp.json(); return json({ error: r.message || "Failed to write slides to page" }, resp.status); }
        }

        return json({ success: true, slideCount: n });
      }

      // ── generateTitleSubheads ──
      // Follow-up step for a subheadFormat title from saveMethodTitles (the
      // SEO Post method): writes a 3-subhead outline into the already-created
      // page's body. Mirrors generateTitleSlides but produces a long-form
      // pillar-post outline instead of a carousel script.
      if (body.action === "generateTitleSubheads") {
        const { pageId, title, campaignId } = body;
        if (!pageId || !title) return json({ error: "pageId and title required" }, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };

        let keywords = "";
        if (campaignId) {
          const researchRaw = await fetch(`https://api.notion.com/v1/databases/${RESEARCH_DB}/query`, {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ filter: { property: "Campaign", relation: { contains: dash(campaignId) } } }),
          }).then(r => r.json()).catch(() => ({ results: [] }));
          const rt = (results, key) => { for (const r of (results.results || [])) { const v = (r.properties[key]?.rich_text || []).map(t => t.plain_text).join(""); if (v) return v; } return ""; };
          keywords = rt(researchRaw, "Keywords");
        }

        const prompt = `${researchGuidelinesBlock(body.researchGuidelines)}Write a 3-subhead outline for this SEO pillar-post title — the structure a writer will fill in to produce a mid-length, full-page article.

TITLE: ${title}
${keywords ? `KEYWORDS: ${keywords}\n` : ''}
Write EXACTLY 3 subheads, no more, no fewer:
- Each subhead is a real H2-style section heading (specific, not generic like "Introduction" or "Conclusion") that together cover the title's topic in a logical order
- Each subhead gets a 2-3 sentence description of what that section should cover and argue — real substance, not placeholders

Return ONLY this JSON object, no other text, no markdown fences:
{ "subheads": [ { "heading": "...", "description": "..." }, ... exactly 3 total ... ] }`;

        const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
        });
        const aiData = await aiResp.json();
        if (!aiResp.ok) return json({ error: aiData.error?.message || "Claude API error" }, 500);

        let parsed;
        try {
          const raw = aiData.content?.[0]?.text || "";
          const start = raw.indexOf('{');
          const end = raw.lastIndexOf('}');
          if (start === -1 || end === -1 || end < start) throw new Error("No JSON object found");
          parsed = JSON.parse(sanitizeJsonControlChars(raw.slice(start, end + 1)));
        } catch(e) {
          return json({ error: "Failed to parse subheads JSON: " + e.message }, 500);
        }

        const rtBlock = (text, opts = {}) => text ? [{ type: "text", text: { content: String(text), link: null }, annotations: { bold: !!opts.bold, italic: !!opts.italic, strikethrough: false, underline: false, code: false, color: "default" } }] : [];
        const heading3 = text => ({ object: "block", type: "heading_3", heading_3: { rich_text: rtBlock(text) } });
        const heading2 = text => ({ object: "block", type: "heading_2", heading_2: { rich_text: rtBlock(text) } });
        const para = (text, opts = {}) => ({ object: "block", type: "paragraph", paragraph: { rich_text: rtBlock(text, opts) } });

        const subheads = (Array.isArray(parsed.subheads) ? parsed.subheads : []).filter(s => s && s.heading);
        const children = [];
        if (subheads.length) children.push(heading3('Outline'));
        subheads.forEach(s => {
          children.push(heading2(s.heading));
          if (s.description) children.push(para(s.description));
        });

        if (children.length) {
          const resp = await fetch(`https://api.notion.com/v1/blocks/${dash(pageId)}/children`, {
            method: "PATCH",
            headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ children }),
          });
          if (!resp.ok) { const r = await resp.json(); return json({ error: r.message || "Failed to write subheads to page" }, resp.status); }
        }

        return json({ success: true, subheadCount: subheads.length });
      }

      // ── Design Spec (reusable branding records, attached to a campaign
      // and/or a specific product via relation — same pattern as Methods) ──
      const DESIGN_SPEC_DEFAULTS = {
        bg: "#F7F1E6", ink: "#2B2620", accent: "#8A6D4B",
        headlineFont: "Playfair Display", bodyFont: "EB Garamond",
        notes: "Editorial minimal — no photography, no faces, no loud colors.",
        canvaLink: "",
      };
      const dsDash = id => { const s = id.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
      const dsHdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
      const dsFromPage = p => ({
        id:           p.id.replace(/-/g,""),
        name:         p.properties?.Name?.title?.map(t => t.plain_text).join("") || "Untitled",
        bg:           p.properties?.Background?.rich_text?.map(t => t.plain_text).join("") || "",
        ink:          p.properties?.Ink?.rich_text?.map(t => t.plain_text).join("") || "",
        accent:       p.properties?.Accent?.rich_text?.map(t => t.plain_text).join("") || "",
        headlineFont: p.properties?.["Headline Font"]?.rich_text?.map(t => t.plain_text).join("") || "",
        bodyFont:     p.properties?.["Body Font"]?.rich_text?.map(t => t.plain_text).join("") || "",
        notes:        p.properties?.["Aesthetic Description"]?.rich_text?.map(t => t.plain_text).join("") || "",
        canvaLink:    p.properties?.["Canva Link"]?.url || "",
      });

      if (body.action === "searchDesignSpecs") {
        const { query } = body;
        const rows = await notionQuery(DESIGN_SPECS_DB, { sorts: [{ property: "Name", direction: "ascending" }] });
        const specs = rows.map(r => dsFromPage(r)).filter(s => !query || s.name.toLowerCase().includes(query.toLowerCase()));
        return json({ specs: specs.slice(0, 100) });
      }

      // All design specs belonging to a campaign (via the Campaigns relation
      // on the Design Specs DB). This is what the campaign "Design" section
      // lists and what the Build picker offers.
      if (body.action === "getCampaignDesignSpecs") {
        const { campaignId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const rows = await notionQuery(DESIGN_SPECS_DB, {
          filter: { property: "Campaigns", relation: { contains: dsDash(campaignId) } },
          sorts: [{ property: "Name", direction: "ascending" }],
        });
        const specs = rows.map(r => dsFromPage(r));
        // Self-heal: a spec attached via the campaign's single "Design Spec"
        // relation (older flow) may not have its Campaigns back-relation set,
        // so it wouldn't show up above. Fold it in and backfill the link.
        const campPage = await fetch(`https://api.notion.com/v1/pages/${dsDash(campaignId)}`, { headers: dsHdr }).then(r => r.json());
        const attachedId = campPage.properties?.["Design Spec"]?.relation?.[0]?.id || null;
        if (attachedId && !specs.some(s => s.id === attachedId.replace(/-/g,""))) {
          const sp = await fetch(`https://api.notion.com/v1/pages/${attachedId}`, { headers: dsHdr }).then(r => r.json());
          if (sp && sp.id) {
            specs.push(dsFromPage(sp));
            const existing = (sp.properties?.["Campaigns"]?.relation || []).map(r => ({ id: r.id }));
            if (!existing.some(r => r.id.replace(/-/g,"") === dsDash(campaignId).replace(/-/g,""))) {
              existing.push({ id: dsDash(campaignId) });
              await fetch(`https://api.notion.com/v1/pages/${attachedId}`, {
                method: "PATCH", headers: { ...dsHdr, "Content-Type": "application/json" },
                body: JSON.stringify({ properties: { "Campaigns": { relation: existing } } }),
              }).catch(() => {});
            }
          }
        }
        return json({ specs, attachedId: attachedId ? attachedId.replace(/-/g,"") : null });
      }

      // Merge the visual style of an uploaded photo/drawing into a design spec.
      // Client sends a data URL (jpg/png, downscaled) + the current spec fields;
      // Claude vision returns merged colors/fonts/aesthetic to fill the edit form.
      if (body.action === "mergeSpecStyleFromImage") {
        const { image, current } = body;
        if (!image) return json({ error: "image required" }, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
        const m = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/i.exec(image || "");
        if (!m) return json({ error: "image must be a base64 data URL (png/jpeg/webp)" }, 400);
        let mediaType = m[1].toLowerCase(); if (mediaType === "image/jpg") mediaType = "image/jpeg";
        const b64 = m[3];
        const cur = current || {};
        const prompt = `You are a brand designer. The attached image is a reference photo or drawing. Analyze its visual style — dominant colors, mood, contrast, texture, and the kind of typography that would suit it.

Merge that style INTO this existing design spec (keep what still fits, but adopt the image's palette and mood):
Name: ${cur.name || "(unnamed)"}
Background: ${cur.bg || "(none)"}
Ink/text: ${cur.ink || "(none)"}
Accent: ${cur.accent || "(none)"}
Headline font: ${cur.headlineFont || "(none)"}
Body font: ${cur.bodyFont || "(none)"}
Aesthetic notes: ${cur.notes || "(none)"}

Return updated values:
- bg: a hex background color drawn from the image
- ink: a hex text color with strong contrast on bg (readable)
- accent: a hex supporting color pulled from the image
- headlineFont / bodyFont: real Google Fonts family names whose feel matches the image
- notes: 1-2 sentences describing the merged aesthetic (the image's feel blended with the existing direction), including what to avoid

Return ONLY this JSON, no other text, no markdown fences:
{ "bg": "#RRGGBB", "ink": "#RRGGBB", "accent": "#RRGGBB", "headlineFont": "...", "bodyFont": "...", "notes": "..." }`;
        const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-6", max_tokens: 700,
            messages: [{ role: "user", content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
              { type: "text", text: prompt },
            ] }],
          }),
        });
        const aiData = await aiResp.json();
        if (!aiResp.ok) return json({ error: aiData.error?.message || "Claude vision error" }, 500);
        let merged;
        try {
          const raw = aiData.content?.[0]?.text || "";
          const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
          if (s === -1 || e === -1 || e < s) throw new Error("No JSON object found");
          merged = JSON.parse(sanitizeJsonControlChars(raw.slice(s, e + 1)));
        } catch(e) {
          return json({ error: "Failed to parse merged spec: " + e.message }, 500);
        }
        return json({ merged });
      }

      if (body.action === "createDesignSpec") {
        const { name, bg, ink, accent, headlineFont, bodyFont, notes, canvaLink, campaignId, productId } = body;
        if (!name) return json({ error: "name required" }, 400);
        const rt = v => v ? [{ type: "text", text: { content: String(v).slice(0, 2000) } }] : [];
        const props = {
          Name: { title: [{ type: "text", text: { content: name } }] },
          Background: { rich_text: rt(bg) }, Ink: { rich_text: rt(ink) }, Accent: { rich_text: rt(accent) },
          "Headline Font": { rich_text: rt(headlineFont) }, "Body Font": { rich_text: rt(bodyFont) },
          "Aesthetic Description": { rich_text: rt(notes) },
        };
        if (canvaLink) props["Canva Link"] = { url: canvaLink };
        if (campaignId) props["Campaigns"] = { relation: [{ id: dsDash(campaignId) }] };
        if (productId && productId !== "__none__" && productId !== campaignId) props["Products"] = { relation: [{ id: dsDash(productId) }] };
        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST", headers: { ...dsHdr, "Content-Type": "application/json" },
          body: JSON.stringify({ parent: { database_id: DESIGN_SPECS_DB }, properties: props }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
        return json({ success: true, id: result.id.replace(/-/g,"") });
      }

      // AI-generate up to 3 design specs grounded in the campaign's research,
      // each linked to the campaign. Canva Link is a template-SEARCH URL built
      // from the aesthetic (a real, useful starting point — an actual Canva
      // design link still has to be created manually and pasted back, since
      // there's no Canva Connect OAuth wired up here).
      if (body.action === "generateCampaignDesignSpecs") {
        const { campaignId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
        const researchRaw = await fetch(`https://api.notion.com/v1/databases/${RESEARCH_DB}/query`, {
          method: "POST", headers: { ...dsHdr, "Content-Type": "application/json" },
          body: JSON.stringify({ filter: { property: "Campaign", relation: { contains: dsDash(campaignId) } } }),
        }).then(r => r.json());
        const campRaw = await fetch(`https://api.notion.com/v1/pages/${dsDash(campaignId)}`, { headers: dsHdr }).then(r => r.json());
        const rt = (results, key) => { for (const r of (results.results || [])) { const v = (r.properties[key]?.rich_text || []).map(t => t.plain_text).join(""); if (v) return v; } return ""; };
        const cp = campRaw.properties || {};
        const campaignName = (cp.Name?.title || cp["Campaign Name"]?.title || []).map(t => t.plain_text).join("") || "Campaign";
        const research = {
          keywords:          rt(researchRaw, "Keywords"),
          statement:         rt(researchRaw, "Statement"),
          uniqueOpportunity: rt(researchRaw, "Unique Opportunity"),
          keyMessage:        rt(researchRaw, "Key Message"),
          targetAudience:    (cp["Target Audience"]?.rich_text || []).map(t => t.plain_text).join(""),
          painPoints:        (cp["Pain Points"]?.rich_text || []).map(t => t.plain_text).join(""),
          notes:             (cp["Notes"]?.rich_text || []).map(t => t.plain_text).join(""),
        };

        const prompt = `${researchGuidelinesBlock(body.researchGuidelines)}You are a brand & visual designer. Based on the campaign research below, propose exactly 3 DISTINCT design specs for its social carousels — each a different coherent aesthetic direction that fits the audience and positioning (e.g. one editorial/quiet, one bold/high-contrast, one warm/human — but choose whatever actually fits THIS campaign).

CAMPAIGN: ${campaignName}
Keywords: ${research.keywords}
Statement: ${research.statement}
Unique Opportunity: ${research.uniqueOpportunity}
Key Message: ${research.keyMessage}
Target Audience: ${research.targetAudience}
Pain Points: ${research.painPoints}
Notes: ${research.notes}

For each spec give:
- name: 2-4 words naming the aesthetic (e.g. "Editorial Minimal", "Bold Operator")
- bg / ink / accent: hex colors (#RRGGBB). bg = slide background, ink = body/headline text (must be high-contrast on bg), accent = a supporting color.
- headlineFont / bodyFont: real Google Fonts font-family names that fit the aesthetic (e.g. "Playfair Display", "Archivo Black", "Inter", "Fraunces", "Space Grotesk").
- aesthetic: 1-2 sentences describing the visual direction, mood, and what to avoid.
- canvaQuery: 3-6 words to search Canva templates for this look (e.g. "minimal editorial instagram carousel").

Return ONLY a JSON array of exactly 3 objects with keys: name, bg, ink, accent, headlineFont, bodyFont, aesthetic, canvaQuery. No other text, no markdown fences.`;

        const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
        });
        const aiData = await aiResp.json();
        if (!aiResp.ok) return json({ error: aiData.error?.message || "Claude API error" }, 500);
        let specs;
        try {
          const raw = aiData.content?.[0]?.text || "";
          const start = raw.indexOf('['), end = raw.lastIndexOf(']');
          if (start === -1 || end === -1 || end < start) throw new Error("No JSON array found");
          specs = JSON.parse(sanitizeJsonControlChars(raw.slice(start, end + 1)));
          if (!Array.isArray(specs)) throw new Error("Not an array");
        } catch(e) {
          return json({ error: "Failed to parse design specs JSON: " + e.message }, 500);
        }

        const rtB = v => v ? [{ type: "text", text: { content: String(v).slice(0, 2000) } }] : [];
        let created = 0;
        const out = [];
        for (const s of specs.slice(0, 3)) {
          const canvaLink = s.canvaQuery ? `https://www.canva.com/templates/?query=${encodeURIComponent(String(s.canvaQuery).slice(0, 80))}` : "";
          const props = {
            Name: { title: [{ type: "text", text: { content: (s.name || "Design Spec").slice(0, 100) } }] },
            Background: { rich_text: rtB(s.bg) }, Ink: { rich_text: rtB(s.ink) }, Accent: { rich_text: rtB(s.accent) },
            "Headline Font": { rich_text: rtB(s.headlineFont) }, "Body Font": { rich_text: rtB(s.bodyFont) },
            "Aesthetic Description": { rich_text: rtB(s.aesthetic) },
            "Campaigns": { relation: [{ id: dsDash(campaignId) }] },
          };
          if (canvaLink) props["Canva Link"] = { url: canvaLink };
          const resp = await fetch("https://api.notion.com/v1/pages", {
            method: "POST", headers: { ...dsHdr, "Content-Type": "application/json" },
            body: JSON.stringify({ parent: { database_id: DESIGN_SPECS_DB }, properties: props }),
          });
          const page = await resp.json();
          if (page.id) { created++; out.push({ id: page.id.replace(/-/g,""), name: s.name }); }
        }
        return json({ created, specs: out });
      }

      if (body.action === "updateDesignSpec") {
        const { id, name, bg, ink, accent, headlineFont, bodyFont, notes, canvaLink } = body;
        if (!id) return json({ error: "id required" }, 400);
        const rt = v => v ? [{ type: "text", text: { content: String(v).slice(0, 2000) } }] : [];
        const props = {
          Background: { rich_text: rt(bg) }, Ink: { rich_text: rt(ink) }, Accent: { rich_text: rt(accent) },
          "Headline Font": { rich_text: rt(headlineFont) }, "Body Font": { rich_text: rt(bodyFont) },
          "Aesthetic Description": { rich_text: rt(notes) },
          "Canva Link": { url: canvaLink || null },
        };
        if (name) props.Name = { title: [{ type: "text", text: { content: name } }] };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dsDash(id)}`, {
          method: "PATCH", headers: { ...dsHdr, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: props }),
        });
        if (!resp.ok) { const r = await resp.json(); return json({ error: r.message || "Update failed" }, resp.status); }
        return json({ success: true });
      }

      if (body.action === "deleteDesignSpec") {
        const { id } = body;
        if (!id) return json({ error: "id required" }, 400);
        const resp = await fetch(`https://api.notion.com/v1/pages/${dsDash(id)}`, {
          method: "PATCH", headers: { ...dsHdr, "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
        });
        if (!resp.ok) { const r = await resp.json(); return json({ error: "Delete failed" }, resp.status); }
        return json({ success: true });
      }

      if (body.action === "setCampaignDesignSpec") {
        const { campaignId, designSpecId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const resp = await fetch(`https://api.notion.com/v1/pages/${dsDash(campaignId)}`, {
          method: "PATCH", headers: { ...dsHdr, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Design Spec": { relation: designSpecId ? [{ id: dsDash(designSpecId) }] : [] } } }),
        });
        if (!resp.ok) { const r = await resp.json(); return json({ error: r.message || "Update failed" }, resp.status); }
        return json({ success: true });
      }

      if (body.action === "setProductDesignSpec") {
        const { productId, designSpecId } = body;
        if (!productId) return json({ error: "productId required" }, 400);
        const resp = await fetch(`https://api.notion.com/v1/pages/${dsDash(productId)}`, {
          method: "PATCH", headers: { ...dsHdr, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Design Spec": { relation: designSpecId ? [{ id: dsDash(designSpecId) }] : [] } } }),
        });
        if (!resp.ok) { const r = await resp.json(); return json({ error: r.message || "Update failed" }, resp.status); }
        return json({ success: true });
      }

      // Resolves the effective design spec for a Build render: campaign's
      // attached spec, overridden field-by-field by the product's attached
      // spec (if the title has a product and it has its own spec), falling
      // back to DESIGN_SPEC_DEFAULTS for anything still unset.
      if (body.action === "getEffectiveDesignSpec") {
        const { campaignId, productId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const hasProduct = productId && productId !== "__none__" && productId !== campaignId;
        const [campPage, prodPage] = await Promise.all([
          fetch(`https://api.notion.com/v1/pages/${dsDash(campaignId)}`, { headers: dsHdr }).then(r => r.json()),
          hasProduct ? fetch(`https://api.notion.com/v1/pages/${dsDash(productId)}`, { headers: dsHdr }).then(r => r.json()) : Promise.resolve(null),
        ]);
        const campSpecId = campPage.properties?.["Design Spec"]?.relation?.[0]?.id || null;
        const prodSpecId = hasProduct ? (prodPage?.properties?.["Design Spec"]?.relation?.[0]?.id || null) : null;
        const [campSpecPage, prodSpecPage] = await Promise.all([
          campSpecId ? fetch(`https://api.notion.com/v1/pages/${campSpecId}`, { headers: dsHdr }).then(r => r.json()) : Promise.resolve(null),
          prodSpecId ? fetch(`https://api.notion.com/v1/pages/${prodSpecId}`, { headers: dsHdr }).then(r => r.json()) : Promise.resolve(null),
        ]);
        const stripEmpty = obj => Object.fromEntries(Object.entries(obj).filter(([k, v]) => k !== "id" && k !== "name" && v));
        const campaignSpec = campSpecPage ? dsFromPage(campSpecPage) : null;
        const productSpec = prodSpecPage ? dsFromPage(prodSpecPage) : null;
        const merged = { ...DESIGN_SPEC_DEFAULTS, ...(campaignSpec ? stripEmpty(campaignSpec) : {}), ...(productSpec ? stripEmpty(productSpec) : {}) };
        return json({ spec: merged, campaignSpec, productSpec });
      }

      // ── generateIdeaTitles ──
      // AI-generates N distinct titles from one idea (the add-title modal's
      // generation mode) and creates each as a Content Strategy record with
      // the same relations/fields the single-title path writes. Honors the
      // operator's research instructions + standing research guidelines.
      if (body.action === "generateIdeaTitles") {
        const { title, description, seedKeywords, researchInstructions, campaignId, productId, methodId } = body;
        const count = Math.min(Math.max(parseInt(body.count) || 5, 2), 15);
        if (!title) return json({ error: "title required" }, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

        // light grounding from the campaign + method names/context
        let campaignCtx = "", methodName = "";
        try {
          if (campaignId) {
            const cpg = await fetch(`https://api.notion.com/v1/pages/${dsDash(campaignId)}`, { headers: dsHdr }).then(r => r.json());
            const cp = cpg.properties || {};
            const rtc = k => (cp[k]?.rich_text || []).map(t => t.plain_text).join("");
            campaignCtx = [
              (cp.Name?.title || []).map(t => t.plain_text).join("") ? `CAMPAIGN: ${(cp.Name.title || []).map(t => t.plain_text).join("")}` : "",
              rtc("Key Message") ? `Key message: ${rtc("Key Message")}` : "",
              rtc("Pain Points") ? `Audience pain points: ${rtc("Pain Points").slice(0, 500)}` : "",
            ].filter(Boolean).join("\n");
          }
          if (methodId) {
            const mp = await fetch(`https://api.notion.com/v1/pages/${dsDash(methodId)}`, { headers: dsHdr }).then(r => r.json());
            methodName = (mp.properties?.Name?.title || []).map(t => t.plain_text).join("");
          }
        } catch(e) {}

        const prompt = `${researchGuidelinesBlock(body.researchGuidelines)}You are a content strategist. Generate exactly ${count} DISTINCT publishable content titles derived from the idea below — each a different angle, hook, or framing of the same core idea (not rewordings of each other).

IDEA: ${title}
${description ? `DESCRIPTION: ${description}\n` : ""}${seedKeywords ? `SEED KEYWORDS (work these in naturally): ${seedKeywords}\n` : ""}${researchInstructions ? `OPERATOR INSTRUCTIONS (follow these exactly — they override the defaults): ${researchInstructions}\n` : ""}${methodName ? `METHOD (the content format these titles are for): ${methodName}\n` : ""}${campaignCtx ? campaignCtx + "\n" : ""}
Return ONLY a JSON array of exactly ${count} items, no markdown fences:
[{ "title": "the publishable title", "angle": "1-2 sentence description of this title's specific angle" }]`;

        const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 3000, messages: [{ role: "user", content: prompt }] }),
        });
        const aiData = await aiResp.json();
        if (!aiResp.ok) return json({ error: aiData.error?.message || "Claude error" }, 502);
        let ideas;
        try {
          const raw = (aiData.content?.[0]?.text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
          ideas = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1));
        } catch(e) { return json({ error: "Could not parse generated titles — try again" }, 502); }
        if (!Array.isArray(ideas) || !ideas.length) return json({ error: "No titles generated — try again" }, 502);

        const rtProp2 = v => ({ rich_text: [{ type: "text", text: { content: String(v).slice(0, 1990) } }] });
        const created = [], failures = [];
        for (const idea of ideas.slice(0, count)) {
          const props = {
            Title:  { title: [{ type: "text", text: { content: String(idea.title || "Untitled").slice(0, 200) } }] },
            Status: { select: { name: "Development" } },
          };
          if (idea.angle) props["Core Idea"] = rtProp2(idea.angle);
          if (seedKeywords) props["seed idea"] = rtProp2(seedKeywords);
          if (researchInstructions) props["Notes"] = rtProp2(researchInstructions);
          if (campaignId) props["Campaign"] = { relation: [{ id: dsDash(campaignId) }] };
          if (productId && productId !== '__none__' && productId !== campaignId) props["product"] = { relation: [{ id: dsDash(productId) }] };
          if (methodId) props["method"] = { relation: [{ id: dsDash(methodId) }] };
          const resp = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: { ...dsHdr, "Content-Type": "application/json" },
            body: JSON.stringify({ parent: { database_id: CONTENT_STRATEGY_DB }, properties: props }),
          });
          const result = await resp.json();
          if (resp.ok && result.id) created.push({ id: result.id.replace(/-/g,""), title: idea.title });
          else failures.push(result.message || "create failed");
        }
        if (!created.length) return json({ error: "All title creates failed: " + (failures[0] || "unknown") }, 502);
        return json({ success: true, created: created.length, titles: created, failed: failures.length });
      }

      // ── getTitleDetails ──
      // Everything the generate-assets modal needs to prefill from an
      // existing Content Strategy title: text fields + relation ids AND
      // resolved names (for the method/product picker inputs).
      if (body.action === "getTitleDetails") {
        const { titleId } = body;
        if (!titleId) return json({ error: "titleId required" }, 400);
        const page = await fetch(`https://api.notion.com/v1/pages/${dsDash(titleId)}`, { headers: dsHdr }).then(r => r.json());
        const p = page.properties || {};
        const rtx = k => (p[k]?.rich_text || []).map(t => t.plain_text).join("");
        const rel = k => (p[k]?.relation || [])[0]?.id?.replace(/-/g,"") || "";
        const out = {
          title: (p.Title?.title || []).map(t => t.plain_text).join(""),
          description: rtx("Core Idea"),
          seedKeywords: rtx("seed idea"),
          researchInstructions: rtx("Notes"),
          campaignId: rel("Campaign"),
          productId:  rel("product"),
          methodId:   rel("method"),
        };
        const nameOf = async id => {
          if (!id) return "";
          try {
            const r = await fetch(`https://api.notion.com/v1/pages/${dsDash(id)}`, { headers: dsHdr }).then(x => x.json());
            return (r.properties?.Name?.title || []).map(t => t.plain_text).join("");
          } catch(e) { return ""; }
        };
        [out.campaignName, out.productName, out.methodName] = await Promise.all([nameOf(out.campaignId), nameOf(out.productId), nameOf(out.methodId)]);
        return json(out);
      }

      // ── deleteAsset ──
      // Archives an Asset record (Notion soft-delete) — used by the ✕ on
      // asset rows under publish titles.
      if (body.action === "deleteAsset") {
        const { assetId } = body;
        if (!assetId) return json({ error: "assetId required" }, 400);
        const resp = await fetch(`https://api.notion.com/v1/pages/${dsDash(assetId)}`, {
          method: "PATCH",
          headers: { ...dsHdr, "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
        });
        if (!resp.ok) { const r = await resp.json(); return json({ error: r.message || "Delete failed" }, resp.status); }
        return json({ success: true });
      }

      // ── getAssetTypes ──
      // Existing "Asset Type" select options from the Assets DB schema, for
      // the generate-assets modal's pick-or-create type field. (Typing a new
      // type just passes the string — Notion auto-creates select options.)
      if (body.action === "getAssetTypes") {
        const resp = await fetch(`https://api.notion.com/v1/databases/${ASSETS_DB}`, { headers: dsHdr });
        const db = await resp.json();
        if (!resp.ok) return json({ error: db.message || "Schema fetch failed" }, resp.status);
        const types = (db.properties?.["Asset Type"]?.select?.options || []).map(o => o.name).filter(Boolean);
        return json({ types });
      }

      // ── generateTitleAssets ──
      // The real "create assets" flow: generates N distinct, build-ready
      // asset concepts for one title (grounded in the title's idea/
      // description/keywords/instructions, the attached method's framework,
      // and the campaign/product design spec) and creates each as a REAL
      // record in the Assets DB linked to the title via its Content Strategy
      // relation — so they render as rows under the publish title.
      if (body.action === "generateTitleAssets") {
        const { titleId, campaignId, productId, methodId, subMethodId, title, description, seedKeywords, researchInstructions, assetType, platformName, platformId, loginId } = body;
        const count = Math.min(Math.max(parseInt(body.count) || 4, 1), 8);
        if (!titleId || !title) return json({ error: "titleId and title required" }, 400);
        if (!assetType) return json({ error: "assetType required — every asset must have a type" }, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
        const hasProduct = productId && productId !== "__none__" && productId !== campaignId;

        // ── SEO Post asset type: one full written pillar post, not N visual
        // concept options to pick between. Reuses the title's existing
        // 3-subhead outline (written by the SEO Post method's follow-up step)
        // as the article's structure if present, completes it with 3 fresh
        // subheads if not, writes the full article into the new asset's page
        // body, and publishes BOTH the asset and the source title immediately
        // — this asset type is finished text, not a design pick-one that
        // waits in Development for operator review.
        if (/seo post/i.test(assetType)) {
          // "blend" (opt-in) adds campaign + product strategy as grounding on
          // top of the title's own description/keywords/outline. "isolate"
          // (default — matches this asset type's original behavior) uses only
          // the title's own fields, no campaign/product fetch at all.
          const contextMode = body.contextMode === "blend" ? "blend" : "isolate";
          const [existingOutline, blendBlock] = await Promise.all([
            extractBlocksTextRecursive(dsHdr, dsDash(titleId)).catch(() => ""),
            contextMode === "blend" ? (async () => {
              const [researchRaw, prodPage] = await Promise.all([
                campaignId ? fetch(`https://api.notion.com/v1/databases/${RESEARCH_DB}/query`, {
                  method: "POST", headers: { ...dsHdr, "Content-Type": "application/json" },
                  body: JSON.stringify({ filter: { property: "Campaign", relation: { contains: dsDash(campaignId) } } }),
                }).then(r => r.json()).catch(() => ({ results: [] })) : Promise.resolve({ results: [] }),
                hasProduct ? fetch(`https://api.notion.com/v1/pages/${dsDash(productId)}`, { headers: dsHdr }).then(r => r.json()).catch(() => null) : Promise.resolve(null),
              ]);
              const rt = (results, key) => { for (const r of (results.results || [])) { const v = (r.properties[key]?.rich_text || []).map(t => t.plain_text).join(""); if (v) return v; } return ""; };
              const campaignPart = [
                rt(researchRaw, "Statement")          && `Statement: ${rt(researchRaw, "Statement")}`,
                rt(researchRaw, "Unique Opportunity")  && `Unique Opportunity: ${rt(researchRaw, "Unique Opportunity")}`,
                rt(researchRaw, "Pain Points")          && `Pain Points: ${rt(researchRaw, "Pain Points")}`,
              ].filter(Boolean).join("\n");
              let productPart = "";
              if (prodPage?.properties) {
                const pp = prodPage.properties;
                const ptxt = prop => (pp[prop]?.rich_text || []).map(x => x.plain_text).join("") || "";
                productPart = [
                  ptxt("Avatar")          && `Avatar: ${ptxt("Avatar")}`,
                  ptxt("Transformation")  && `Transformation: ${ptxt("Transformation")}`,
                  ptxt("Offer Structure") && `Offer Structure: ${ptxt("Offer Structure")}`,
                  ptxt("Proof Points")    && `Proof Points: ${ptxt("Proof Points")}`,
                  ptxt("Unique Angle")    && `Unique Angle: ${ptxt("Unique Angle")}`,
                ].filter(Boolean).join("\n");
              }
              const parts = [campaignPart && `CAMPAIGN CONTEXT:\n${campaignPart}`, productPart && `PRODUCT CONTEXT:\n${productPart}`].filter(Boolean);
              return parts.length ? parts.join("\n\n") + "\n" : "";
            })() : Promise.resolve(""),
          ]);

          const prompt = `${researchGuidelinesBlock(body.researchGuidelines)}You are an SEO content writer. Write a complete, publish-ready pillar blog post for this title.

TITLE: ${title}
${description ? `DESCRIPTION: ${description}\n` : ""}${seedKeywords ? `KEYWORDS: ${seedKeywords}\n` : ""}${researchInstructions ? `OPERATOR INSTRUCTIONS (follow these exactly): ${researchInstructions}\n` : ""}${platformName ? `PUBLISHING TO: ${platformName} — write for that platform's norms if it isn't a standard blog destination.\n` : ""}${blendBlock}${existingOutline ? `EXISTING NOTES/OUTLINE ON THIS TITLE (if it already defines 3 subheads, use those headings verbatim as the article's structure — otherwise write 3 new ones):\n${existingOutline.slice(0, 2000)}\n` : ""}
Requirements:
- Structure the post under EXACTLY 3 subheads (H2-level sections) covering the topic in a logical order.
- Each section is substantial, specific, useful writing — roughly 400-700 words per section, not filler.
- Write a short 2-3 sentence intro before the first subhead, and a short concluding paragraph after the last section.
- No meta-commentary, no "in this article we will," no headers other than the 3 subheads.

Return ONLY this JSON object, no other text, no markdown fences:
{ "intro": "...", "sections": [ { "heading": "...", "body": "..." }, ... exactly 3 total ... ], "conclusion": "..." }`;

          const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 6000, messages: [{ role: "user", content: prompt }] }),
          });
          const aiData = await aiResp.json();
          if (!aiResp.ok) return json({ error: aiData.error?.message || "Claude API error" }, 502);

          let post;
          try {
            const raw = aiData.content?.[0]?.text || "";
            const start = raw.indexOf('{');
            const end = raw.lastIndexOf('}');
            if (start === -1 || end === -1 || end < start) throw new Error("No JSON object found");
            post = JSON.parse(sanitizeJsonControlChars(raw.slice(start, end + 1)));
          } catch(e) {
            return json({ error: "Failed to parse post JSON: " + e.message }, 502);
          }
          const sections = (Array.isArray(post.sections) ? post.sections : []).filter(s => s && s.heading);
          if (!sections.length) return json({ error: "No sections generated — try again" }, 502);

          // Create the Asset record — published immediately, no Development review step.
          const assetProps = {
            "Asset Title":  { title: [{ text: { content: String(title).slice(0, 200) } }] },
            "Asset Status": { select: { name: "Publish" } },
            "Asset Type":   { select: { name: String(assetType).slice(0, 100) } },
            "Body":         { rich_text: [{ text: { content: String(post.intro || "").slice(0, 2000) } }] },
            "Content Strategy": { relation: [{ id: dsDash(titleId) }] },
          };
          if (campaignId) assetProps["Campaign"] = { relation: [{ id: dsDash(campaignId) }] };
          // Explicit Platform pick (from the real Platforms DB) wins over
          // anything guessed — this asset is "packaged for" that platform.
          if (platformName) assetProps["Platform Name"] = { select: { name: String(platformName).slice(0, 100) } };
          if (platformId) assetProps["Platform"] = { relation: [{ id: dsDash(platformId) }] };
          if (loginId) assetProps["Login"] = { relation: [{ id: dsDash(loginId) }] };
          const assetResp = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: { ...dsHdr, "Content-Type": "application/json" },
            body: JSON.stringify({ parent: { database_id: ASSETS_DB }, properties: assetProps }),
          });
          const assetResult = await assetResp.json();
          if (!assetResp.ok || !assetResult.id) return json({ error: assetResult.message || "Failed to create SEO Post asset" }, 502);
          const assetId = assetResult.id.replace(/-/g, "");

          // Write the full article into the asset's page body.
          const rtBlock = (text, opts = {}) => text ? [{ type: "text", text: { content: String(text), link: null }, annotations: { bold: !!opts.bold, italic: !!opts.italic, strikethrough: false, underline: false, code: false, color: "default" } }] : [];
          const heading2 = text => ({ object: "block", type: "heading_2", heading_2: { rich_text: rtBlock(text) } });
          const para = text => ({ object: "block", type: "paragraph", paragraph: { rich_text: rtBlock(text) } });
          const children = [];
          if (post.intro) children.push(para(post.intro));
          sections.forEach(s => { children.push(heading2(s.heading)); if (s.body) children.push(para(s.body)); });
          if (post.conclusion) children.push(para(post.conclusion));
          if (children.length) {
            const blocksResp = await fetch(`https://api.notion.com/v1/blocks/${dsDash(assetId)}/children`, {
              method: "PATCH",
              headers: { ...dsHdr, "Content-Type": "application/json" },
              body: JSON.stringify({ children }),
            });
            if (!blocksResp.ok) { const r = await blocksResp.json(); return json({ error: r.message || "Asset created but failed to write post body" }, 502); }
          }

          // Publish the source title too — the pillar post is done, not pending.
          await fetch(`https://api.notion.com/v1/pages/${dsDash(titleId)}`, {
            method: "PATCH",
            headers: { ...dsHdr, "Content-Type": "application/json" },
            body: JSON.stringify({ properties: { "Status": { select: { name: "Publish" } } } }),
          });

          return json({ success: true, created: 1, assets: [{ id: assetId, title }], sectionCount: sections.length, contextMode });
        }

        // design spec: explicit modal pick wins, else campaign default →
        // product override → hard defaults
        let spec = { ...DESIGN_SPEC_DEFAULTS };
        try {
          const stripEmpty = obj => Object.fromEntries(Object.entries(obj).filter(([k, v]) => k !== "id" && k !== "name" && v));
          if (body.designSpecId) {
            const sp = await fetch(`https://api.notion.com/v1/pages/${dsDash(body.designSpecId)}`, { headers: dsHdr }).then(r => r.json());
            if (sp && sp.id) spec = { ...spec, ...stripEmpty(dsFromPage(sp)) };
          } else {
            const [campPage, prodPage] = await Promise.all([
              campaignId ? fetch(`https://api.notion.com/v1/pages/${dsDash(campaignId)}`, { headers: dsHdr }).then(r => r.json()) : Promise.resolve(null),
              hasProduct ? fetch(`https://api.notion.com/v1/pages/${dsDash(productId)}`, { headers: dsHdr }).then(r => r.json()) : Promise.resolve(null),
            ]);
            const campSpecId = campPage?.properties?.["Design Spec"]?.relation?.[0]?.id || null;
            const prodSpecId = prodPage?.properties?.["Design Spec"]?.relation?.[0]?.id || null;
            const [cs, ps] = await Promise.all([
              campSpecId ? fetch(`https://api.notion.com/v1/pages/${campSpecId}`, { headers: dsHdr }).then(r => r.json()) : Promise.resolve(null),
              prodSpecId ? fetch(`https://api.notion.com/v1/pages/${prodSpecId}`, { headers: dsHdr }).then(r => r.json()) : Promise.resolve(null),
            ]);
            spec = { ...spec, ...(cs ? stripEmpty(dsFromPage(cs)) : {}), ...(ps ? stripEmpty(dsFromPage(ps)) : {}) };
          }
        } catch(e) { /* defaults are fine */ }

        // method grounding (name + framework text)
        let methodName = "", methodBody = "";
        if (methodId && methodId !== "__none__") {
          try {
            const mp = await fetch(`https://api.notion.com/v1/pages/${dsDash(methodId)}`, { headers: dsHdr }).then(r => r.json());
            methodName = (mp.properties?.Name?.title || []).map(t => t.plain_text).join("");
            methodBody = (await extractBlocksTextRecursive(dsHdr, dsDash(methodId))).slice(0, 2500);
          } catch(e) {}
        }
        // Optional SUB METHOD — the platform layer under the primary method
        // (e.g. Drawing Post → Instagram). Its framework constrains formats;
        // its name becomes the created assets' Platform Name.
        let subMethodName = "", subMethodBody = "";
        if (subMethodId && subMethodId !== "__none__") {
          try {
            const sp = await fetch(`https://api.notion.com/v1/pages/${dsDash(subMethodId)}`, { headers: dsHdr }).then(r => r.json());
            subMethodName = (sp.properties?.Name?.title || []).map(t => t.plain_text).join("");
            subMethodBody = (await extractBlocksTextRecursive(dsHdr, dsDash(subMethodId))).slice(0, 1500);
          } catch(e) {}
        }
        // Drawing Post assets get a Canva starting-point link (template
        // search built from a per-concept query — real Canva design creation
        // can't be automated from the worker, so this is the fastest manual
        // entry point that still matches each concept).
        const isDrawingPost = /drawing/i.test(methodName);

        const prompt = `${researchGuidelinesBlock(body.researchGuidelines)}You are a senior content designer and copywriter. Create exactly ${count} DISTINCT asset concepts — options for the operator to choose between — for the content idea below. Every concept is a ${assetType} — do not propose other formats. Each must be complete enough to build immediately without further questions.

IDEA / TITLE: ${title}
${description ? `DESCRIPTION: ${description}\n` : ""}${seedKeywords ? `SEED KEYWORDS: ${seedKeywords}\n` : ""}${researchInstructions ? `OPERATOR INSTRUCTIONS (follow these exactly): ${researchInstructions}\n` : ""}${methodName ? `METHOD: ${methodName}${methodBody ? `\nMETHOD NOTES/FRAMEWORK (dictates the deliverable format):\n${methodBody}` : ""}\n` : ""}${platformName ? `PLATFORM (from the Platforms DB — this asset is being packaged for publishing here, every concept must fit its native format/length/conventions): ${platformName}\n` : ""}${subMethodName ? `SUB METHOD / TARGET PLATFORM: ${subMethodName} — every concept must be built for ${subMethodName} specifically (its native formats, dimensions, character limits, and audience behavior).${subMethodBody ? `\nPLATFORM FRAMEWORK NOTES:\n${subMethodBody}` : ""}\n` : ""}
DESIGN SPEC (every concept must match this aesthetic):
Background ${spec.bg} · Ink ${spec.ink} · Accent ${spec.accent} · Headline font ${spec.headlineFont} · Body font ${spec.bodyFont}
${spec.notes ? `Aesthetic: ${spec.notes}` : ""}

Each concept must take a genuinely different approach to the same idea — different layout, hook, or visual metaphor, not just a color swap. The body must fully specify the deliverable: exact on-image headline/text, visual layout description, how the design spec colors/fonts are used, and the accompanying post caption.
${isDrawingPost ? `Each item must ALSO include "canvaQuery": a short 2-4 word Canva template search phrase matching that concept's visual style and subject (e.g. "minimal line diagram", "hand drawn infographic") — used to build a Canva starting-point link.\n` : ""}
Return ONLY a JSON array of exactly ${count} items, no markdown fences:
[{ "assetTitle": "short distinct option name", "platform": "Instagram" | "LinkedIn" | "TikTok" | "YouTube" | "Facebook" | "X / Twitter" | "Other", "body": "full concept: on-image text, layout, spec usage, caption"${isDrawingPost ? ', "canvaQuery": "2-4 word Canva search phrase"' : ""} }]`;

        const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 6000, messages: [{ role: "user", content: prompt }] }),
        });
        const aiData = await aiResp.json();
        if (!aiResp.ok) return json({ error: aiData.error?.message || "Claude error" }, 502);
        let concepts;
        try {
          const raw = (aiData.content?.[0]?.text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
          concepts = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1));
        } catch(e) { return json({ error: "Could not parse generated concepts — try again" }, 502); }
        if (!Array.isArray(concepts) || !concepts.length) return json({ error: "No concepts generated — try again" }, 502);

        // ── GRADING GATE — the last stage of generation, not a separate
        // human review step. Every concept is scored against the product's
        // real Strategy + a named viral hook form before it's saved; a
        // failing concept gets regenerated (with the grader's specific fix
        // instructions fed back in) up to GRADE_MAX_ATTEMPTS times. Concepts
        // that still fail after that are saved anyway (never silently
        // dropped) but tagged Status="Needs Revision" instead of "Ready".
        const strategyBlock = await fetchStrategyForGrading(dsHdr, dsDash(campaignId), hasProduct ? dsDash(productId) : "", hasProduct);
        const keywordsForGrading = [seedKeywords].filter(Boolean).join(", ");
        const siblingTitles = concepts.map(c => c.assetTitle).filter(Boolean);

        const created = [];
        const failures = [];
        for (const c of concepts.slice(0, count)) {
          let current = c;
          let grade = null;
          for (let attempt = 1; attempt <= GRADE_MAX_ATTEMPTS; attempt++) {
            grade = await gradeConcept(env, {
              body: current.body, assetType, strategyBlock, keywords: keywordsForGrading,
              platformName: platformName || subMethodName || current.platform,
            });
            if (grade.passed || attempt === GRADE_MAX_ATTEMPTS) break;
            current = await regenerateConcept(env, {
              original: current, assetType, title, description, seedKeywords, researchInstructions,
              methodName, methodBody, subMethodName, subMethodBody,
              platformName: platformName || subMethodName || current.platform,
              spec, isDrawingPost, siblingTitles, fixInstructions: grade.fixInstructions,
              guidelines: body.researchGuidelines,
            });
          }
          const passed = !!(grade && grade.passed);
          const properties = {
            "Asset Title":  { title: [{ text: { content: String(current.assetTitle || "Untitled option").slice(0, 200) } }] },
            "Asset Status": { select: { name: "Development" } },
            "Body":         { rich_text: [{ text: { content: String(current.body || "").slice(0, 2000) } }] },
            "Content Strategy": { relation: [{ id: dsDash(titleId) }] },
            "Status":       { select: { name: passed ? "Ready" : "Needs Revision" } },
            "Grade Score":  { number: grade ? grade.score : null },
            "Grade Notes":  { rich_text: [{ text: { content: String((grade && grade.notes) || "").slice(0, 2000) } }] },
          };
          const platName = platformName || subMethodName || current.platform; // explicit pick > sub method > AI-guessed
          if (platName) properties["Platform Name"] = { select: { name: String(platName).slice(0, 100) } };
          if (platformId) properties["Platform"] = { relation: [{ id: dsDash(platformId) }] };
          if (loginId) properties["Login"] = { relation: [{ id: dsDash(loginId) }] };
          properties["Asset Type"] = { select: { name: String(assetType).slice(0, 100) } }; // required — every asset has a type
          if (isDrawingPost && current.canvaQuery) properties["Design Link"] = { url: "https://www.canva.com/templates/?query=" + encodeURIComponent(String(current.canvaQuery).slice(0, 80)) };
          if (campaignId)  properties["Campaign"]      = { relation: [{ id: dsDash(campaignId) }] };
          const resp = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: { ...dsHdr, "Content-Type": "application/json" },
            body: JSON.stringify({ parent: { database_id: ASSETS_DB }, properties }),
          });
          const result = await resp.json();
          if (resp.ok && result.id) created.push({ id: result.id.replace(/-/g,""), title: current.assetTitle || "Untitled option", gradeScore: grade ? grade.score : null, passed });
          else failures.push(result.message || "create failed");
        }
        if (!created.length) return json({ error: "All asset creates failed: " + (failures[0] || "unknown") }, 502);
        return json({
          success: true, created: created.length, assets: created, failed: failures.length,
          passedCount: created.filter(a => a.passed).length,
          revisionCount: created.filter(a => !a.passed).length,
        });
      }

      // ── researchAndGenerateCarouselTitles ──
      // Called instead of generateMethodTitles when the selected Method is
      // "carousel". Merges campaign + product keyword signal, folds in any
      // existing TikTok Trends / Trend Intelligence research already on the
      // campaign, optionally benchmarks live Instagram posts (if APIFY_TOKEN
      // is configured), then recommends exactly 10 titles with a short
      // description each — NOT full scripts (that stays a separate per-title
      // step via generateTitleSlides, to keep this call fast).
      if (body.action === "researchAndGenerateCarouselTitles") {
        const { campaignId, methodId, productId, parentTitle, parentTitleId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const parentSeed = await buildTitleSeedContext(hdr, parentTitleId, parentTitle);
        // "no product" is signaled two ways in this codebase: the literal
        // sentinel '__none__', or the campaignId itself (the modal's "Campaign"
        // option sets productId=campaignId) — treat both as no product, else
        // the campaign page gets fetched and read as if it were a product.
        const hasProduct = productId && productId !== '__none__' && productId !== campaignId;
        const rt = (results, key) => { for (const r of (results.results || [])) { const v = (r.properties[key]?.rich_text || []).map(t => t.plain_text).join(""); if (v) return v; } return ""; };

        const [researchRaw, campRaw, productPage] = await Promise.all([
          fetch(`https://api.notion.com/v1/databases/${RESEARCH_DB}/query`, {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ filter: { property: "Campaign", relation: { contains: dash(campaignId) } } }),
          }).then(r => r.json()),
          fetch(`https://api.notion.com/v1/pages/${dash(campaignId)}`, { headers: hdr }).then(r => r.json()),
          hasProduct ? fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, { headers: hdr }).then(r => r.json()) : Promise.resolve(null),
        ]);
        const cp = campRaw.properties || {};
        const campaignName = (cp.Name?.title || cp["Campaign Name"]?.title || []).map(t => t.plain_text).join("") || "Campaign";
        const campaignKeywords = rt(researchRaw, "Keywords");
        const tiktokTrends      = rt(researchRaw, "TikTok Trends");
        const trendIntelligence = rt(researchRaw, "Trend Intelligence");
        const existingTrendResearch = tiktokTrends || trendIntelligence || "";
        const existingTrendSource = tiktokTrends ? "TikTok Trends (live research)" : (trendIntelligence ? "Trend Intelligence (AI-suggested niches)" : "");

        // Products DB has no "Keywords" field — derive product-side keyword
        // signal from its positioning text instead, then merge with campaign
        // keywords for a single combined research query.
        let productSection = "No specific product — general campaign content.";
        let productName = "";
        let productKeywordSignal = "";
        let buyerIntent = (cp["Pain Points"]?.rich_text || []).map(t => t.plain_text).join("") || "(no campaign pain points on file)";
        if (hasProduct && productPage) {
          const pp = productPage.properties || {};
          const ptxt = prop => (pp[prop]?.rich_text || []).map(x => x.plain_text).join("") || "";
          productName = (pp.Name?.title || []).map(x => x.plain_text).join("") || "Unknown Product";
          const desc = ptxt("Description"), avatar = ptxt("Avatar"), transformation = ptxt("Transformation"), uniqueAngle = ptxt("Unique Angle"), offer = ptxt("Offer Structure"), notes = ptxt("Notes");
          productSection = `PRODUCT: ${productName}
Description: ${desc || "(none)"}
Avatar: ${avatar || "(none)"}
Transformation: ${transformation || "(none)"}
Unique Angle: ${uniqueAngle || "(none)"}
Offer Structure: ${offer || "(none)"}
Notes: ${notes || "(none)"}`;
          productKeywordSignal = [desc, avatar, transformation, uniqueAngle, notes].filter(Boolean).join(" ");
          buyerIntent = avatar || buyerIntent;
        }
        const mergedKeywords = [parentSeed.keywords, campaignKeywords, productKeywordSignal].filter(Boolean).join(", ");
        if (!mergedKeywords) return json({ error: "No campaign Keywords on file and no product selected — add campaign Keywords in Research first" }, 400);

        // ── Live Instagram benchmarking (real posts, real engagement) when
        // APIFY_TOKEN is configured. Long invented keyword phrases (e.g. "real
        // accountability for founders") are almost never real hashtags, so try
        // the shortest few merged-keyword tokens in order — short, generic
        // words are far more likely to be hashtags anyone actually used —
        // stopping at the first one that returns real posts.
        const AT = (env.APIFY_TOKEN || '').trim();
        const kwTokens = mergedKeywords.split(/[,\n]/).map(k => k.trim().toLowerCase()).filter(Boolean);
        // Candidate hashtags are individual WORDS pulled from the merged
        // keywords, not the invented compound phrases themselves — nobody
        // hashtags "#realaccountabilityforfounders", but "#accountability" is
        // a real, populated tag. Shortest-first since shorter/generic words
        // are more likely to be tags people actually used.
        const STOPWORDS = new Set(['for','the','and','or','of','to','in','on','with','without','your','you','their','is','are','not','but','from','that','this','it','no']);
        const candidateTags = Array.from(new Set(
          mergedKeywords.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOPWORDS.has(w))
        )).sort((a, b) => a.length - b.length).slice(0, 5);
        let refs = [];
        let refNote = '';
        let primaryTag = candidateTags[0] || '';
        if (AT && candidateTags.length) {
          for (const tag of candidateTags) {
            try {
              // directUrls hits the hashtag's explore page directly. The
              // search+searchType:'hashtag' input does fuzzy discovery via
              // Google and can resolve to an unrelated tag with 0 posts —
              // confirmed live, do not use it for a known hashtag lookup.
              const res = await fetch(
                `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${AT}&timeout=55`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ directUrls: [`https://www.instagram.com/explore/tags/${tag}/`], resultsType: 'posts', resultsLimit: 30 }) }
              );
              if (!res.ok) { refNote = 'Instagram reference search failed.'; continue; }
              const items = await res.json();
              // Apify returns a single { error, errorDescription } item (not an
              // HTTP error) when a hashtag has no results — filter those out so
              // they aren't miscounted as a real reference post.
              const posts = (Array.isArray(items) ? items : []).filter(p => p && !p.error);
              if (!posts.length) { refNote = `No results for any of #${candidateTags.join(', #')}.`; continue; }
              primaryTag = tag;
              refs = posts.map(p => {
                const caption = (p.caption || '');
                const hay = (caption + ' ' + (Array.isArray(p.hashtags) ? p.hashtags.join(' ') : '')).toLowerCase();
                const keywordHits = kwTokens.filter(k => k && hay.includes(k)).length;
                const isCarousel = p.type === 'Sidecar';
                const likes = Math.max(p.likesCount ?? 0, 0);
                const comments = Math.max(p.commentsCount ?? 0, 0);
                const engagement = likes + comments * 3;
                const score = engagement * (1 + keywordHits * 0.4) * (isCarousel ? 1.4 : 1);
                const url = p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : '');
                return { owner: p.ownerUsername || 'unknown', caption: caption.slice(0, 200), likes, comments, isCarousel, slides: p.carouselImageCount || 0, keywordHits, score, url };
              }).sort((a, b) => b.score - a.score).slice(0, 8);
              refNote = '';
              break;
            } catch(e) { refNote = 'Instagram reference search failed.'; }
          }
        } else if (!AT) {
          refNote = 'APIFY_TOKEN not configured — no live Instagram benchmarking available.';
        }
        const carouselRefCount = refs.filter(r => r.isCarousel).length;
        const refBlock = refs.length
          ? refs.map((r, i) =>
              `[R${i+1}] @${r.owner} | ${r.isCarousel ? `CAROUSEL (${r.slides || '?'} slides)` : 'single image/video (not a carousel)'} | ${r.likes} likes, ${r.comments} comments | keyword matches: ${r.keywordHits} | "${r.caption}"`
            ).join('\n')
          : `(no live reference posts${refNote ? ' — ' + refNote : ''})`;

        const prompt = `${researchGuidelinesBlock(body.researchGuidelines)}You are a social media trend analyst and content strategist. Analyze the research below, then recommend exactly 10 Instagram carousel concepts — compelling working titles for FUTURE carousels that have not been written yet, each with a short description. These are recommendations only, not scripts.

CAMPAIGN: ${campaignName}
MERGED KEYWORDS (campaign + product): ${mergedKeywords}
BUYER INTENT / AVATAR (who this needs to resonate with): ${buyerIntent}
${productSection}
${existingTrendResearch ? `\nEXISTING TREND RESEARCH ON FILE (${existingTrendSource}):\n${existingTrendResearch.slice(0, 1500)}\n` : '\n(No trend research on file for this campaign yet.)\n'}
${parentSeed.text ? `SEED THEME (this run was started from an existing title — most concepts should extend or riff on this theme where it fits naturally, but don't force all 10 into it if the research points elsewhere):\n${parentSeed.text}\n\n` : ''}LIVE INSTAGRAM REFERENCE POSTS (real posts found just now for this topic, ranked by keyword relevance + engagement, carousel format flagged):
${refBlock}

INSTRUCTIONS:
1. Analyze all the research above — the existing trend research, the live Instagram references (if any), and the merged keywords — to identify which angles have real current demand vs. which are generic.
2. Rank concepts by: topical relevance to the merged keywords, fit with the buyer intent/avatar, and (where possible) alignment with what the CAROUSEL-flagged live references show is working (list-style breakdowns, before/after, myth-busting, numbered frameworks).
3. Do not copy any reference caption or wording — these are signal for what resonates, not source material.
4. For each concept, write a 1-3 sentence description of what the carousel would actually cover — specific enough that someone could start writing it from the description alone.

Return ONLY a JSON array of exactly 10 objects, each shaped exactly like this — no other text, no markdown fences:
{
  "title": "compelling carousel title, max 12 words",
  "description": "1-3 sentences describing what this carousel covers and the angle it takes",
  "basedOn": "one short phrase naming which reference (e.g. R3), existing trend research, or 'keywords/buyer intent only' if neither applied"
}`;

        const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 3000, messages: [{ role: "user", content: prompt }] }),
        });
        const aiData = await aiResp.json();
        if (!aiResp.ok) return json({ error: aiData.error?.message || "Claude API error" }, 500);

        let concepts;
        try {
          const raw = aiData.content?.[0]?.text || "";
          const start = raw.indexOf('[');
          const end = raw.lastIndexOf(']');
          if (start === -1 || end === -1 || end < start) throw new Error("No JSON array found");
          concepts = JSON.parse(sanitizeJsonControlChars(raw.slice(start, end + 1)));
          if (!Array.isArray(concepts)) throw new Error("Not an array");
        } catch(e) {
          const rawText = aiData.content?.[0]?.text || "";
          return json({ error: "Failed to parse concepts JSON: " + e.message + " | RAW: " + rawText.slice(0, 300) }, 500);
        }

        const rtBlock = (text, opts = {}) => text ? [{ type: "text", text: { content: String(text), link: opts.url ? { url: opts.url } : null }, annotations: { bold: !!opts.bold, italic: !!opts.italic, strikethrough: false, underline: false, code: false, color: "default" } }] : [];
        const heading = text => ({ object: "block", type: "heading_3", heading_3: { rich_text: rtBlock(text) } });
        const para = (text, opts = {}) => ({ object: "block", type: "paragraph", paragraph: { rich_text: rtBlock(text, opts) } });
        const bullet = (text, opts = {}) => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rtBlock(text, opts) } });

        // Up to 5 source links written into every title's body for comparison —
        // shared across the batch since the Instagram benchmarking was one
        // search covering all 10 concepts, not a per-title lookup.
        const sourceRefs = refs.filter(r => r.url).slice(0, 5);

        let created = 0;
        const saved = [];
        const saveErrors = [];
        for (const c of concepts.slice(0, 10)) {
          const titleText = c.title || 'Carousel Idea';
          const description = c.description || '';
          const basedOn = c.basedOn || '';
          const props = {
            "Title":     { title: rtBlock(titleText) },
            "Status":    { select: { name: "Development" } },
            "Grouping":  { rich_text: rtBlock("Carousel Concepts") },
            "Core Idea": { rich_text: rtBlock(description.slice(0, 1990)) },
            "Campaign":  { relation: [{ id: dash(campaignId) }] },
          };
          if (methodId) props["method"] = { relation: [{ id: dash(methodId) }] };
          if (hasProduct) props["product"] = { relation: [{ id: dash(productId) }] };

          const children = [
            heading('Description'),
            para(description.slice(0, 1990)),
            heading('Research Notes'),
            bullet(`Merged keywords: ${mergedKeywords}`.slice(0, 1990)),
          ];
          if (hasProduct && productName) children.push(bullet(`Product: ${productName}`));
          if (existingTrendResearch) children.push(bullet(`Existing research considered: ${existingTrendSource}`));
          if (basedOn) children.push(bullet(`Based on: ${basedOn}`));
          if (refs.length) children.push(bullet(`Benchmarked against ${refs.length} live Instagram posts (${carouselRefCount} actual carousels) for #${primaryTag}`));
          if (sourceRefs.length) {
            children.push(heading('Sources'));
            sourceRefs.forEach(r => children.push(bullet(`@${r.owner}${r.isCarousel ? ' (carousel)' : ''} — ${r.likes} likes, ${r.comments} comments`, { url: r.url })));
          }

          const resp = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ parent: { database_id: CONTENT_STRATEGY_DB }, properties: props, children }),
          });
          const page = await resp.json();
          if (page.id) { created++; saved.push({ id: page.id.replace(/-/g, ""), title: titleText, description }); }
          else saveErrors.push({ title: titleText, status: resp.status, error: page.message || JSON.stringify(page).slice(0, 300) });
        }
        return json({
          created, titles: saved, saveErrors: saveErrors.length ? saveErrors : undefined,
          mergedKeywords,
          hasExistingTrendResearch: !!existingTrendResearch, existingTrendSource: existingTrendResearch ? existingTrendSource : null,
          referencesFound: refs.length, carouselReferencesFound: carouselRefCount, apifyConfigured: !!AT,
        });
      }

      // ── researchUpworkMarketTitles ──
      // Turns a (possibly weak) seed keyword into ACTIVE Upwork market angles:
      // (1) Claude expands the seed + product into real client-side Upwork
      // search phrases, (2) scrapes each on Upwork in parallel to measure live
      // demand (ad counts + budgets), (3) Claude proposes ~10 titles aimed at
      // the markets that ACTUALLY have live ads, grounded in the seed. Each
      // title is saved with its market, a demand signal, and reference-gig
      // links. Routed when the Method name matches /upwork/i AND
      // /title|market|trend/i (so "Upwork Proposal" still hits the proposal
      // action, "Upwork Titles"/"Upwork Market" hits this one).
      if (body.action === "researchUpworkMarketTitles") {
        const { campaignId, methodId, productId, parentTitle, parentTitleId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const parentSeed = await buildTitleSeedContext(hdr, parentTitleId, parentTitle);
        const hasProduct = productId && productId !== '__none__' && productId !== campaignId;
        const rt = (results, key) => { for (const r of (results.results || [])) { const v = (r.properties[key]?.rich_text || []).map(t => t.plain_text).join(""); if (v) return v; } return ""; };

        const [researchRaw, campRaw, productPage] = await Promise.all([
          fetch(`https://api.notion.com/v1/databases/${RESEARCH_DB}/query`, {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ filter: { property: "Campaign", relation: { contains: dash(campaignId) } } }),
          }).then(r => r.json()),
          fetch(`https://api.notion.com/v1/pages/${dash(campaignId)}`, { headers: hdr }).then(r => r.json()),
          hasProduct ? fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, { headers: hdr }).then(r => r.json()) : Promise.resolve(null),
        ]);
        const cp = campRaw.properties || {};
        const campaignName = (cp.Name?.title || cp["Campaign Name"]?.title || []).map(t => t.plain_text).join("") || "Campaign";
        const campaignKeywords = rt(researchRaw, "Keywords") || (cp["Keywords"]?.rich_text || []).map(t => t.plain_text).join("");
        let productSection = "No specific product — use the campaign seed only.";
        let productName = "", productKeywordSignal = "";
        let buyerIntent = (cp["Pain Points"]?.rich_text || []).map(t => t.plain_text).join("") || "(none)";
        if (hasProduct && productPage) {
          const pp = productPage.properties || {};
          const ptxt = prop => (pp[prop]?.rich_text || []).map(x => x.plain_text).join("") || "";
          productName = (pp.Name?.title || []).map(x => x.plain_text).join("") || "Unknown Product";
          const desc = ptxt("Description"), avatar = ptxt("Avatar"), transformation = ptxt("Transformation"), uniqueAngle = ptxt("Unique Angle"), offer = ptxt("Offer Structure");
          productSection = `PRODUCT: ${productName}\nDescription: ${(desc||"(none)").slice(0,600)}\nAvatar: ${avatar||"(none)"}\nTransformation: ${transformation||"(none)"}\nUnique Angle: ${uniqueAngle||"(none)"}\nOffer: ${offer||"(none)"}`;
          productKeywordSignal = [productName, uniqueAngle, offer].filter(Boolean).join(" ");
          buyerIntent = avatar || buyerIntent;
        }
        const seed = [parentSeed.keywords, campaignKeywords, productKeywordSignal].filter(Boolean).join(", ");
        if (!seed) return json({ error: "No campaign Keywords and no product — add Keywords in Research first" }, 400);

        // Step 1 — Claude translates the (possibly job-seeker-style) seed into
        // real client-side Upwork search phrases (short skill/service terms).
        const expandPrompt = `${researchGuidelinesBlock(body.researchGuidelines)}A freelancer wants to find ACTIVE work on Upwork related to this seed. The seed may be phrased like a job-seeker ("freelance jobs, work from home") rather than a skill clients hire for. Translate it into 6 concrete Upwork SEARCH PHRASES that hiring CLIENTS would actually title a job with — short skill/service phrases (2-4 words), specific and real, spanning the most likely active markets for this seed${hasProduct ? " and product" : ""}.

SEED KEYWORDS: ${seed}
${hasProduct ? productSection : ""}
BUYER/AVATAR: ${buyerIntent}

Return ONLY a JSON array of 6 short strings — no other text, no fences. Example: ["ai automation setup","zapier integration","chatbot development","make.com automation","openai api integration","workflow automation"]`;
        const expandResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 400, messages: [{ role: "user", content: expandPrompt }] }),
        });
        const expandData = await expandResp.json();
        if (!expandResp.ok) return json({ error: expandData.error?.message || "Claude API error (expand)" }, 500);
        let candidates = [];
        try {
          const raw = expandData.content?.[0]?.text || "";
          const s = raw.indexOf('['), e = raw.lastIndexOf(']');
          candidates = JSON.parse(sanitizeJsonControlChars(raw.slice(s, e + 1))).filter(x => typeof x === 'string').map(x => x.trim()).filter(Boolean);
        } catch(e) { candidates = []; }
        if (!candidates.length) candidates = [ (seed.split(',')[0] || '').trim() ].filter(Boolean);
        candidates = Array.from(new Set(candidates.map(c => c.toLowerCase()))).slice(0, 6);

        // Step 2 — measure live demand: scrape the top candidates in parallel
        // (wall-clock ≈ one scrape) and rank markets by live-ad count.
        const AT = (env.APIFY_TOKEN || '').trim();
        const scrapeCandidates = candidates.slice(0, 4);
        const pick = (o, keys) => { for (const k of keys) { if (o[k] != null && o[k] !== '') return o[k]; } return ''; };
        const normalize = j => {
          const skillsRaw = pick(j, ['skills','tags','requiredSkills']);
          return {
            title:       String(pick(j, ['title','jobTitle','name']) || '').slice(0, 160),
            description: String(pick(j, ['description','descriptionText','snippet']) || '').replace(/\s+/g, ' ').trim().slice(0, 300),
            url:         (v => typeof v === 'string' ? v : '')(pick(j, ['url','link','jobUrl'])),
            type:        pick(j, ['type','jobType','contractType']) || '',
            budget:      pick(j, ['budget','amount','fixedPrice','price']) || '',
            hourly:      pick(j, ['hourlyRate','hourlyBudget','hourly','rate']) || '',
            skills:      Array.isArray(skillsRaw) ? skillsRaw.map(s => typeof s === 'string' ? s : (s?.name || '')).filter(Boolean).slice(0, 8) : [],
          };
        };
        let markets = [];
        let apifyNote = '';
        if (AT && scrapeCandidates.length) {
          const results = await Promise.all(scrapeCandidates.map(async q => {
            try {
              const res = await fetch(`https://api.apify.com/v2/acts/neatrat~upwork-job-scraper/run-sync-get-dataset-items?token=${AT}&timeout=60`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ query: q, sort: 'newest', perPage: 12, pagesToScrape: 1, maxJobAge: { value: 30, unit: 'days' } }) });
              if (!res.ok) return { query: q, ads: [] };
              const items = await res.json();
              const ads = (Array.isArray(items) ? items : []).filter(j => j && !j.error).map(normalize).filter(a => a.title || a.description);
              return { query: q, ads };
            } catch(e) { return { query: q, ads: [] }; }
          }));
          markets = results.map(r => ({ ...r, adCount: r.ads.length })).sort((a, b) => b.adCount - a.adCount);
          if (!markets.some(m => m.adCount)) apifyNote = 'No live Upwork ads for any candidate market — titles are AI-suggested, not demand-validated.';
        } else {
          apifyNote = AT ? 'No candidate markets to scrape.' : 'APIFY_TOKEN not configured — titles are AI-suggested, not demand-validated.';
          markets = scrapeCandidates.map(q => ({ query: q, ads: [], adCount: 0 }));
        }
        const totalAds = markets.reduce((n, m) => n + m.adCount, 0);
        const hasDemand = totalAds > 0;

        const marketBlock = markets.map((m, i) => {
          const sample = m.ads.slice(0, 3).map(a => `"${a.title}"${a.budget ? ` (${a.budget})` : a.hourly ? ` (${a.hourly})` : ''}`).join('; ');
          return `[M${i+1}] "${m.query}" — ${m.adCount} live ad${m.adCount === 1 ? '' : 's'}${sample ? ` | samples: ${sample}` : ''}`;
        }).join('\n');

        // Step 3 — Claude proposes titles for the ACTIVE markets, weighted by
        // real live-ad volume, grounded in the seed.
        const titlePrompt = `${researchGuidelinesBlock(body.researchGuidelines)}You are a freelance market strategist. Below are candidate Upwork markets for a seed, each with the number of LIVE ads found just now (real current demand). Propose exactly 10 titles for content/offers this campaign${hasProduct ? "/product" : ""} should make to win work in the markets that are ACTUALLY ACTIVE.

SEED KEYWORDS: ${seed}
${hasProduct ? productSection : ""}
BUYER/AVATAR: ${buyerIntent}
${parentSeed.text ? `SEED THEME (riff on this where it fits):\n${parentSeed.text}\n` : ''}
CANDIDATE UPWORK MARKETS (with live demand):
${marketBlock}

INSTRUCTIONS:
- PRIORITIZE markets with more live ads — that's where real demand is. Give little/no weight to markets with 0 live ads.
- Each title is a specific angle/offer that maps to one active market and is grounded in the seed${hasProduct ? " and product" : ""}.
- Titles are things to produce (a gig/offer title, a portfolio piece, a lead magnet, a positioning angle) — specific, not generic.
${hasDemand ? '' : '- No live demand data was available, so base titles on the most plausible active markets from the candidates and flag them as unvalidated.'}

Return ONLY a JSON array of exactly 10 objects — no other text, no fences:
{ "title": "max 12 words", "description": "1-2 sentences on the angle and who it targets", "market": "which candidate market (M#) or its phrase", "demandSignal": "e.g. '14 live ads' or 'no live ads (unvalidated)'" }`;
        const titleResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 3000, messages: [{ role: "user", content: titlePrompt }] }),
        });
        const titleData = await titleResp.json();
        if (!titleResp.ok) return json({ error: titleData.error?.message || "Claude API error (titles)" }, 500);
        let concepts;
        try {
          const raw = titleData.content?.[0]?.text || "";
          const s = raw.indexOf('['), e = raw.lastIndexOf(']');
          if (s === -1 || e === -1 || e < s) throw new Error("No JSON array found");
          concepts = JSON.parse(sanitizeJsonControlChars(raw.slice(s, e + 1)));
          if (!Array.isArray(concepts)) throw new Error("Not an array");
        } catch(e) {
          return json({ error: "Failed to parse titles JSON: " + e.message + " | RAW: " + (titleData.content?.[0]?.text || '').slice(0, 300) }, 500);
        }

        // Map a concept back to its market (by M# or phrase) for its gig links.
        const matchMarket = c => {
          const m = String(c.market || '');
          const byNum = m.match(/M(\d+)/i);
          if (byNum) { const idx = parseInt(byNum[1], 10) - 1; if (markets[idx]) return markets[idx]; }
          const low = m.toLowerCase();
          return markets.find(mk => mk.query && (low.includes(mk.query) || mk.query.includes(low))) || null;
        };

        const rtBlock = (text, opts = {}) => text ? [{ type: "text", text: { content: String(text), link: opts.url ? { url: opts.url } : null }, annotations: { bold: !!opts.bold, italic: false, strikethrough: false, underline: false, code: false, color: "default" } }] : [];
        const heading = text => ({ object: "block", type: "heading_3", heading_3: { rich_text: rtBlock(text) } });
        const para = text => ({ object: "block", type: "paragraph", paragraph: { rich_text: rtBlock(text) } });
        const bullet = (text, opts = {}) => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rtBlock(text, opts) } });

        let created = 0; const saved = []; const saveErrors = [];
        for (const c of concepts.slice(0, 10)) {
          const titleText = (c.title || 'Upwork Market Title').slice(0, 200);
          const description = c.description || '';
          const market = matchMarket(c);
          const props = {
            "Title":     { title: rtBlock(titleText) },
            "Status":    { select: { name: "Development" } },
            "Grouping":  { rich_text: rtBlock("Upwork Market Titles") },
            "Core Idea": { rich_text: rtBlock(description.slice(0, 1990)) },
            "Campaign":  { relation: [{ id: dash(campaignId) }] },
          };
          if (methodId) props["method"] = { relation: [{ id: dash(methodId) }] };
          if (hasProduct) props["product"] = { relation: [{ id: dash(productId) }] };
          const children = [
            heading('Description'), para(description.slice(0, 1990)),
            heading('Active Market'),
            bullet(`Market: ${market ? market.query : (c.market || '?')}`),
            bullet(`Demand: ${c.demandSignal || (market ? `${market.adCount} live ads` : 'unvalidated')}`),
          ];
          const gigLinks = (market ? market.ads : []).filter(a => a.url && /^https?:\/\//i.test(a.url)).slice(0, 6);
          if (gigLinks.length) {
            children.push(heading('Reference Upwork Gigs'));
            gigLinks.forEach(a => {
              const meta = [a.type, a.budget, a.hourly].filter(Boolean).join(' · ');
              children.push(bullet(`${a.title}${meta ? ` — ${meta}` : ''} ↗`.slice(0, 1990), { url: a.url }));
            });
          }
          children.push(heading('Research Notes'));
          children.push(bullet(`Seed: ${seed}`.slice(0, 1990)));
          children.push(bullet(`Candidate markets: ${markets.map(m => `${m.query} (${m.adCount})`).join(', ')}`.slice(0, 1990)));
          if (apifyNote) children.push(bullet(apifyNote.slice(0, 1990)));

          const resp = await fetch("https://api.notion.com/v1/pages", {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ parent: { database_id: CONTENT_STRATEGY_DB }, properties: props, children }),
          });
          const page = await resp.json();
          if (page.id) { created++; saved.push({ id: page.id.replace(/-/g, ''), title: titleText }); }
          else saveErrors.push({ title: titleText, status: resp.status, error: page.message || JSON.stringify(page).slice(0, 300) });
        }
        return json({
          created, titles: saved, saveErrors: saveErrors.length ? saveErrors : undefined,
          candidates, markets: markets.map(m => ({ query: m.query, adCount: m.adCount })),
          totalAds, hasDemand, apifyConfigured: !!AT, note: apifyNote || undefined,
        });
      }

      // ── getDeliverables ──
      if (body.action === "getDeliverables") {
        const { campaignId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const DELIVERABLES_DB = "984754dc18434dd4847e0ac1c05550f8";
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" };
        // Fetch all products for this campaign first
        const prodResp = await fetch(`https://api.notion.com/v1/databases/${PRODUCTS_DB}/query`, {
          method: "POST", headers: hdr,
          body: JSON.stringify({ filter: { property: "Campaigns", relation: { contains: dash(campaignId) } }, page_size: 100 }),
        }).then(r => r.json());
        const productIds = new Set((prodResp.results || []).map(p => p.id.replace(/-/g,"")));
        const productNames = {};
        (prodResp.results || []).forEach(p => { productNames[p.id.replace(/-/g,"")] = (p.properties.Name?.title || []).map(t => t.plain_text).join("") || "Unnamed"; });
        if (!productIds.size) return json({ deliverables: [] });
        // Fetch deliverables DB records + product Files in parallel
        const allDeliverables = [];
        await Promise.all([...productIds].map(async pid => {
          const [delResp, prodPage] = await Promise.all([
            fetch(`https://api.notion.com/v1/databases/${dash(DELIVERABLES_DB)}/query`, {
              method: "POST", headers: hdr,
              body: JSON.stringify({ filter: { property: "Product", relation: { contains: dash(pid) } }, page_size: 100 }),
            }).then(r => r.json()),
            fetch(`https://api.notion.com/v1/pages/${dash(pid)}`, { headers: hdr }).then(r => r.json()),
          ]);
          // Deliverables DB records
          (delResp.results || []).forEach(d => {
            const dp = d.properties || {};
            allDeliverables.push({
              id:          d.id.replace(/-/g,""),
              name:        (dp.Name?.title || []).map(t => t.plain_text).join("") || "Untitled",
              type:        dp.Type?.select?.name || "",
              status:      dp.Status?.select?.name || "Draft",
              productId:   pid,
              productName: productNames[pid] || "",
              url:         d.url || "",
              isFile:      false,
            });
          });
          // Product-level attached files
          (prodPage.properties?.["Files"]?.files || []).forEach(f => {
            const fileUrl = f.file?.url || f.external?.url || "";
            if (!fileUrl) return;
            allDeliverables.push({
              id:          pid + "_" + encodeURIComponent(f.name || "file"),
              name:        f.name || "File",
              type:        "File",
              status:      "",
              productId:   pid,
              productName: productNames[pid] || "",
              url:         fileUrl,
              isFile:      true,
            });
          });
        }));
        return json({ deliverables: allDeliverables });
      }

      // ── getProductDeliverables ──
      if (body.action === "getProductDeliverables") {
        const { productId } = body;
        if (!productId) return json({ error: "productId required" }, 400);
        const DELIVERABLES_DB = "984754dc18434dd4847e0ac1c05550f8";
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" };
        const [delResp, prodPage] = await Promise.all([
          fetch(`https://api.notion.com/v1/databases/${dash(DELIVERABLES_DB)}/query`, {
            method: "POST", headers: hdr,
            body: JSON.stringify({ filter: { property: "Product", relation: { contains: dash(productId) } }, page_size: 100 }),
          }).then(r => r.json()),
          fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, { headers: hdr }).then(r => r.json()),
        ]);
        const productName = (prodPage.properties?.Name?.title || []).map(t => t.plain_text).join("") || "";
        const deliverables = [];
        (delResp.results || []).forEach(d => {
          const dp = d.properties || {};
          deliverables.push({
            id:          d.id.replace(/-/g,""),
            name:        (dp.Name?.title || []).map(t => t.plain_text).join("") || "Untitled",
            type:        dp.Type?.select?.name || "",
            status:      dp.Status?.select?.name || "Draft",
            productId,   productName,
            url:         d.url || "",
            isFile:      false,
          });
        });
        (prodPage.properties?.["Files"]?.files || []).forEach(f => {
          const fileUrl = f.file?.url || f.external?.url || "";
          if (!fileUrl) return;
          deliverables.push({
            id: productId + "_" + encodeURIComponent(f.name || "file"),
            name: f.name || "File", type: "File", status: "",
            productId, productName, url: fileUrl, isFile: true,
          });
        });
        return json({ deliverables });
      }

      // ── writeContent: generate and save actual content for a title ──
      if (body.action === "writeContent") {
        const { titleId } = body;
        if (!titleId) return json({ error: "titleId required" }, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const dashedTitle = dash(titleId);

        // Fetch the title page
        const titlePage = await fetch(`https://api.notion.com/v1/pages/${dashedTitle}`, { headers: hdr }).then(r => r.json());
        const tp = titlePage.properties || {};
        const titleName    = (tp.Title?.title || []).map(x => x.plain_text).join("") || "Untitled";
        const rawGrouping  = (tp.Grouping?.rich_text || []).map(x => x.plain_text).join("") || "";
        const gtParts      = rawGrouping.split(" > ");
        const phase        = gtParts.length > 1 ? gtParts[0].trim() : "";
        const grouping     = gtParts.length > 1 ? gtParts.slice(1).join(" > ").trim() : rawGrouping;
        const methodId     = (tp.method?.relation || [])[0]?.id || "";
        const campaignId   = (tp.Campaign?.relation || [])[0]?.id || "";
        const productId    = (tp.product?.relation || [])[0]?.id || "";

        // Parallel fetch method, campaign research, product
        const [methodPage, researchRaw, campRaw, productPage] = await Promise.all([
          methodId ? fetch(`https://api.notion.com/v1/pages/${methodId}`, { headers: hdr }).then(r => r.json()) : Promise.resolve(null),
          campaignId ? fetch(`https://api.notion.com/v1/databases/${RESEARCH_DB}/query`, {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ filter: { property: "Campaign", relation: { contains: campaignId } } }),
          }).then(r => r.json()) : Promise.resolve({ results: [] }),
          campaignId ? fetch(`https://api.notion.com/v1/pages/${campaignId}`, { headers: hdr }).then(r => r.json()) : Promise.resolve(null),
          productId ? fetch(`https://api.notion.com/v1/pages/${productId}`, { headers: hdr }).then(r => r.json()) : Promise.resolve(null),
        ]);

        // Fetch method body (recursively — see extractBlocksTextRecursive)
        const methodBody = methodId ? await extractBlocksTextRecursive(hdr, methodId) : "";
        const methodName = (methodPage?.properties?.Name?.title || []).map(t => t.plain_text).join("") || "Unknown Method";

        const rt = (results, key) => { for (const r of (results.results || [])) { const v = (r.properties[key]?.rich_text || []).map(t => t.plain_text).join(""); if (v) return v; } return ""; };
        const cp = campRaw?.properties || {};
        const research = {
          keywords:          rt(researchRaw, "Keywords"),
          statement:         rt(researchRaw, "Statement"),
          uniqueOpportunity: rt(researchRaw, "Unique Opportunity"),
          keyMessage:        rt(researchRaw, "Key Message"),
          campaignGoal:      (cp["Campaign Goal"]?.rich_text || []).map(t => t.plain_text).join(""),
          painPoints:        (cp["Pain Points"]?.rich_text || []).map(t => t.plain_text).join(""),
        };

        const pp = productPage?.properties || {};
        const ptxt = prop => (pp[prop]?.rich_text || []).map(x => x.plain_text).join("") || "";
        const productName    = (pp.Name?.title || []).map(x => x.plain_text).join("") || "";
        const offerStructure = ptxt("Offer Structure");
        const productStrategy = {
          avatar:         ptxt("Avatar"),
          transformation: ptxt("Transformation"),
          offerStructure,
          price:          ptxt("Price"),
          proofPoints:    ptxt("Proof Points"),
          objections:     ptxt("Objections"),
          uniqueAngle:    ptxt("Unique Angle"),
        };

        const prompt = `${researchGuidelinesBlock(body.researchGuidelines)}You are an expert content writer. Write the actual content for a specific deliverable in a content system.

METHOD: ${methodName}
METHOD FRAMEWORK (defines the content format and how to write for this method):
${methodBody || "(No framework — infer format from method name)"}

DELIVERABLE TO WRITE:
Title: ${titleName}
Phase: ${phase || "(none)"}
Grouping: ${grouping || "(none)"}

CAMPAIGN RESEARCH:
Keywords: ${research.keywords}
Positioning: ${research.statement}
Unique Opportunity: ${research.uniqueOpportunity}
Key Message: ${research.keyMessage}
Campaign Goal: ${research.campaignGoal}
Pain Points: ${research.painPoints}

${productName ? `PRODUCT: ${productName}
Product Type / Offer Structure: ${offerStructure}
Avatar: ${productStrategy.avatar}
Transformation: ${productStrategy.transformation}
Price: ${productStrategy.price}
Proof Points: ${productStrategy.proofPoints}
Objections: ${productStrategy.objections}
Unique Angle: ${productStrategy.uniqueAngle}` : "No specific product — write for the campaign itself."}

INSTRUCTIONS:
- The method framework defines WHAT FORMAT to write in (Instagram caption, email body, HTML section, landing page copy, video script, etc.). Follow it exactly.
- The product type / offer structure tells you WHO this is selling and HOW — a coaching program writes differently than a SaaS tool, a course, or a physical product.
- Write the actual finished content for the deliverable named above — not an outline, not a plan. The real thing, ready to use.
- Be specific: use the real campaign keywords, real pain points, real transformation language. No placeholders.
- Match the voice: direct, confident, specific. No fluff, no buzzwords (no "leverage", "delve", "harness", "unlock", "transformative").
- Length and format should match what this method and deliverable type calls for.

Write only the content itself. No preamble, no meta-commentary, no "Here's the content:".`;

        const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
        });
        const aiData = await aiResp.json();
        if (!aiResp.ok) return json({ error: aiData.error?.message || "Claude API error" }, 500);
        const content = aiData.content?.[0]?.text || "";

        // Convert content to Notion paragraph blocks (split on double newlines for paragraphs)
        const paragraphs = content.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
        const blocks = paragraphs.map(p => ({
          object: "block", type: "paragraph",
          paragraph: { rich_text: [{ type: "text", text: { content: p.slice(0, 2000) } }] },
        }));

        // Append blocks to the title page
        await fetch(`https://api.notion.com/v1/blocks/${dashedTitle}/children`, {
          method: "PATCH",
          headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ children: blocks }),
        });

        // Update status to Writing
        await fetch(`https://api.notion.com/v1/pages/${dashedTitle}`, {
          method: "PATCH",
          headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { Status: { select: { name: "Writing" } } } }),
        });

        return json({ success: true, chars: content.length });
      }

      // ── fixOrphanTitles: set product relation to campaignId for titles with no product ──
      if (body.action === "fixOrphanTitles") {
        const { campaignId } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" };
        // Find all titles for this campaign with no product relation
        let results = [], cursor;
        do {
          const r = await fetch(`https://api.notion.com/v1/databases/${CONTENT_STRATEGY_DB}/query`, {
            method: "POST", headers: hdr,
            body: JSON.stringify({
              page_size: 100,
              filter: { and: [
                { property: "Campaign", relation: { contains: dash(campaignId) } },
                { property: "product", relation: { is_empty: true } },
              ]},
              ...(cursor ? { start_cursor: cursor } : {}),
            }),
          }).then(r => r.json());
          results = results.concat(r.results || []);
          cursor = r.has_more ? r.next_cursor : undefined;
        } while (cursor);
        // Patch each one
        let fixed = 0;
        for (const page of results) {
          await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
            method: "PATCH", headers: hdr,
            body: JSON.stringify({ properties: { "product": { relation: [{ id: dash(campaignId) }] } } }),
          });
          fixed++;
        }
        return json({ fixed });
      }

      // ── deleteTitlesByProduct ──
      if (body.action === "deleteTitlesByProduct") {
        const { productId } = body;
        if (!productId) return json({ error: "productId required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        // Query all titles for this product
        let results = [], cursor;
        do {
          const r = await fetch(`https://api.notion.com/v1/databases/${CONTENT_STRATEGY_DB}/query`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
            body: JSON.stringify({ page_size: 100, filter: { property: "product", relation: { contains: dash(productId) } }, ...(cursor ? { start_cursor: cursor } : {}) }),
          });
          const page = await r.json();
          results = results.concat(page.results || []);
          cursor = page.has_more ? page.next_cursor : undefined;
        } while (cursor);
        // Archive all in parallel batches of 10
        let deleted = 0;
        for (let i = 0; i < results.length; i += 10) {
          await Promise.all(results.slice(i, i + 10).map(p =>
            fetch(`https://api.notion.com/v1/pages/${p.id}`, {
              method: "PATCH",
              headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
              body: JSON.stringify({ archived: true }),
            })
          ));
          deleted += Math.min(10, results.length - i);
        }
        return json({ deleted });
      }

      // ── getProduct ──
      if (body.action === "getProduct") {
        const { productId } = body;
        if (!productId) return json({ error: "productId required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const r = await fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }
        });
        const p = await r.json();
        if (!r.ok) return json({ error: p.message || "Not found" }, r.status);
        const props = p.properties;
        const txt = prop => (props[prop]?.rich_text || []).map(x => x.plain_text).join("") || "";
        return json({
          id: productId,
          name:           (props.Name?.title || []).map(x => x.plain_text).join("") || "",
          avatar:         txt("Avatar"),
          transformation: txt("Transformation"),
          offerStructure: txt("Offer Structure"),
          price:          txt("Price"),
          spots:          props.Spots?.number ?? null,
          proofPoints:    txt("Proof Points"),
          objections:     txt("Objections"),
          uniqueAngle:    txt("Unique Angle"),
          description:    txt("Description"),
          notes:          txt("Notes"),
        });
      }

      // ── generateProductStrategy ──
      if (body.action === "generateProductStrategy") {
        const { productId, campaignId } = body;
        if (!productId || !campaignId) return json({ error: "productId and campaignId required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const notionHdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };

        // Fetch product + campaign research in parallel
        const [prodResp, researchResults, campResp] = await Promise.all([
          fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, { headers: notionHdr }).then(r => r.json()),
          fetch(`https://api.notion.com/v1/databases/${RESEARCH_DB}/query`, {
            method: "POST", headers: { ...notionHdr, "Content-Type": "application/json" },
            body: JSON.stringify({ filter: { property: "Campaign", relation: { contains: dash(campaignId) } } }),
          }).then(r => r.json()),
          fetch(`https://api.notion.com/v1/pages/${dash(campaignId)}`, { headers: notionHdr }).then(r => r.json()),
        ]);

        const productName = (prodResp.properties?.Name?.title || []).map(x => x.plain_text).join("") || "Unknown Product";
        const rt = (results, key) => { for (const r of (results.results || [])) { const v = (r.properties[key]?.rich_text || []).map(t => t.plain_text).join(""); if (v) return v; } return ""; };
        const cp = campResp.properties || {};
        const research = {
          keywords:          rt(researchResults, "Keywords"),
          statement:         rt(researchResults, "Statement"),
          uniqueOpportunity: rt(researchResults, "Unique Opportunity"),
          productIdeas:      rt(researchResults, "Product Ideas"),
          thoughts:          rt(researchResults, "Thoughts"),
          keyMessage:        rt(researchResults, "Key Message"),
          campaignGoal:      (cp["Campaign Goal"]?.rich_text || []).map(t => t.plain_text).join(""),
          painPoints:        (cp["Pain Points"]?.rich_text || []).map(t => t.plain_text).join(""),
        };

        if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY secret not configured" }, 500);

        const prompt = `${researchGuidelinesBlock(body.researchGuidelines)}You are a direct-response copywriter and product strategist. Given campaign research and a product name, derive a complete product strategy profile.

CAMPAIGN RESEARCH:
Keywords: ${research.keywords}
Statement: ${research.statement}
Unique Opportunity: ${research.uniqueOpportunity}
Key Message: ${research.keyMessage}
Campaign Goal: ${research.campaignGoal}
Pain Points: ${research.painPoints}
Product Ideas context: ${research.productIdeas}
Thoughts: ${research.thoughts}

PRODUCT NAME: ${productName}

Derive the product strategy profile. Be specific, concrete, and grounded in the research — not generic.

Return ONLY a JSON object with these exact keys:
{
  "avatar": "Who this is for — specific situation, pain, identity (2-3 sentences)",
  "transformation": "Before state → After state. What changes and how life looks different (2-3 sentences)",
  "offerStructure": "What's included, format, duration, delivery method (2-4 sentences)",
  "price": "Suggested price with one-sentence rationale",
  "spots": <integer number of spots, or null>,
  "proofPoints": "3-5 bullet points of the kind of proof/results this product should build toward. Be specific.",
  "objections": "Top 3 objections and the honest answer to each. Format: Objection → Answer",
  "uniqueAngle": "One sentence that separates this from every other offer in this space"
}`;

        const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
        });
        const aiData = await aiResp.json();
        if (!aiResp.ok) return json({ error: aiData.error?.message || "Claude API error" }, 500);

        let strategy;
        try {
          const raw = aiData.content?.[0]?.text || "";
          strategy = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
        } catch(e) {
          return json({ error: "Failed to parse strategy JSON", raw: aiData.content?.[0]?.text }, 500);
        }

        // Write strategy fields back to the product page
        const asStr = v => Array.isArray(v) ? v.join("\n") : (typeof v === "string" ? v : String(v ?? ""));
        const rtBlock = text => { const s = asStr(text); return s ? [{ type: "text", text: { content: s, link: null }, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: "default" } }] : []; };
        const updateResp = await fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, {
          method: "PATCH",
          headers: { ...notionHdr, "Content-Type": "application/json" },
          body: JSON.stringify({
            properties: {
              "Avatar":         { rich_text: rtBlock(strategy.avatar) },
              "Transformation": { rich_text: rtBlock(strategy.transformation) },
              "Offer Structure":{ rich_text: rtBlock(strategy.offerStructure) },
              "Price":          { rich_text: rtBlock(strategy.price) },
              "Proof Points":   { rich_text: rtBlock(strategy.proofPoints) },
              "Objections":     { rich_text: rtBlock(strategy.objections) },
              "Unique Angle":   { rich_text: rtBlock(strategy.uniqueAngle) },
              ...(strategy.spots != null ? { "Spots": { number: strategy.spots } } : {}),
              "Status": { select: { name: "Active" } },
            }
          }),
        });
        if (!updateResp.ok) {
          const err = await updateResp.json();
          return json({ error: err.message || "Failed to update product" }, 500);
        }
        return json({ success: true, strategy });
      }

      // ── getContentTitles ──
      if (body.action === "getContentTitles") {
        const { campaignId } = body;
        const statusFilter = { or: [
          { property: "Status", select: { equals: "Development" } },
          { property: "Status", select: { equals: "Writing" } },
          { property: "Status", select: { equals: "Review" } },
          { property: "Status", select: { equals: "Approved" } },
        ]};
        const filter = campaignId
          ? { and: [{ property: "Campaign", relation: { contains: campaignId } }, statusFilter] }
          : statusFilter;
        const results = await notionQuery(CONTENT_STRATEGY_DB, {
          filter,
          sorts: [{ property: "Sequence Order", direction: "ascending" }],
        });
        // Collect unique product + method + platform IDs
        const productIds  = new Set();
        const methodIds   = new Set();
        const platformIds = new Set();
        results.forEach(page => {
          const props = page.properties;
          (props.product?.relation   || []).forEach(r => productIds.add(r.id));
          (props.method?.relation    || []).forEach(r => methodIds.add(r.id));
          (props.Platforms?.relation || []).forEach(r => platformIds.add(r.id));
        });
        const fetchName = async id => {
          try {
            const r = await fetch(`https://api.notion.com/v1/pages/${id}`, {
              headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }
            });
            const p = await r.json();
            const name = p.properties?.Name?.title?.map(t => t.plain_text).join("")
                      || p.properties?.Title?.title?.map(t => t.plain_text).join("")
                      || "Unknown";
            return { id: id.replace(/-/g,""), name };
          } catch { return { id: id.replace(/-/g,""), name: "Unknown" }; }
        };
        const [prodPages, methPages, platPages] = await Promise.all([
          Promise.all([...productIds].map(fetchName)),
          Promise.all([...methodIds].map(fetchName)),
          Promise.all([...platformIds].map(fetchName)),
        ]);
        const prodNames = {};
        prodPages.forEach(p => prodNames[p.id] = p.name);
        const methNames = {};
        methPages.forEach(m => methNames[m.id] = m.name);
        const platNames = {};
        platPages.forEach(p => platNames[p.id] = p.name);
        const titles = results.map(page => {
          const props     = page.properties;
          const productRel  = props.product?.relation   || [];
          const methodRel   = props.method?.relation    || [];
          const platformRel = props.Platforms?.relation || [];
          const productId  = productRel.length ? productRel[0].id.replace(/-/g,"") : "__none__";
          const methodId   = methodRel.length  ? methodRel[0].id.replace(/-/g,"")  : "__none__";
          return {
            id:          page.id.replace(/-/g,""),
            title:       props.Title?.title?.map(t => t.plain_text).join("") || "Untitled",
            status:      props.Status?.select?.name || "",
            grouping:    props.Grouping?.rich_text?.map(t => t.plain_text).join("") || "Ungrouped",
            platform:    platformRel.map(r => platNames[r.id.replace(/-/g,"")] || "Unknown").join(", "),
            format:      props.Format?.select?.name  || "",
            productId,
            productName: productRel.length ? (prodNames[productId] || "Unknown Product") : "No Product",
            methodId,
            methodName:  methodRel.length  ? (methNames[methodId]  || "Unknown Method")  : "No Method",
          };
        });
        return json({ titles });
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
        // Merge all matching records — first non-empty value wins per field
        const rt  = (p, key) => { for (const r of results) { const v = r.properties[key]?.rich_text?.map(t => t.plain_text).join("") || ""; if (v) return v; } return ""; };
        const sel = (p, key) => { for (const r of results) { const v = r.properties[key]?.select?.name || ""; if (v) return v; } return ""; };
        const url = (p, key) => { for (const r of results) { const v = r.properties[key]?.url || ""; if (v) return v; } return ""; };
        const cp = campResp?.properties || {};
        return json({
          research: {
            id: results[0].id.replace(/-/g, ""),
            name: results[0].properties.Name?.title?.map(t => t.plain_text).join("") || "",
            status: sel(null, "Status"),
            lastUpdated: (() => { for (const r of results) { const v = r.properties["date:Last Updated:start"]?.date?.start || ""; if (v) return v; } return ""; })(),
            keywords:          rt(null, "Keywords"),
            newsFeed:          rt(null, "News Feed"),
            notes:             rt(null, "Notes") || cp["Notes"]?.rich_text?.map(t => t.plain_text).join("") || "",
            thoughts:          rt(null, "Thoughts"),
            platforms:         rt(null, "Platforms & Methods"),
            productIdeas:      rt(null, "Product Ideas"),
            tikTokShopProducts:rt(null, "TikTok Shop Products"),
            kdpBestSellers:    rt(null, "KDP Best Sellers"),
            tiktokTrends:      rt(null, "TikTok Trends"),
            trendIntelligence: rt(null, "Trend Intelligence"),
            etsyProducts:      rt(null, "Etsy Products"),
            youtubeOutliers:   rt(null, "YouTube Outliers"),
            seedChannels:      rt(null, "Seed Channels"),
            keyMessage:        rt(null, "Key Message"),
            webPageUrl:        url(null, "Web Page URL"),
            statement:         rt(null, "Statement"),
            uniqueOpportunity: rt(null, "Unique Opportunity"),
            campaignGoal:      cp["Campaign Goal"]?.rich_text?.map(t => t.plain_text).join("") || "",
            painPoints:        cp["Pain Points"]?.rich_text?.map(t => t.plain_text).join("") || "",
            campaignKeyMessage:cp["Key Message"]?.rich_text?.map(t => t.plain_text).join("") || "",
          }
        });
      }

      // Bare Research record for a campaign that doesn't have one yet — only
      // campaigns that went through a full research-generation flow got one
      // automatically; older/manually-created campaigns never did, which is
      // why things like the Platforms-tab Notes cell silently did nothing
      // for them (no researchId to write to). Creates a minimal record so
      // that path always has something to attach to.
      if (body.action === "createResearchForCampaign") {
        const { campaignId, campaignName } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashed = campaignId.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({
            parent: { database_id: RESEARCH_DB },
            properties: {
              Name:     { title: [{ type: "text", text: { content: campaignName || "Untitled" } }] },
              Campaign: { relation: [{ id: dashed }] },
              Status:   { select: { name: "Draft" } },
            },
          }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Create failed" }, resp.status);
        return json({ success: true, research: { id: result.id.replace(/-/g,""), notes: "" } });
      }

      // ── getProductResearch ──
      if (body.action === "getProductResearch") {
        const { productId, researchId } = body;
        if (!productId) return json({ error: "productId required" }, 400);
        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const fetches = [
          fetch(`https://api.notion.com/v1/pages/${dash(productId)}`, { headers: hdr }).then(r => r.json()),
          researchId ? fetch(`https://api.notion.com/v1/pages/${dash(researchId)}`, { headers: hdr }).then(r => r.json()) : Promise.resolve(null),
        ];
        const [productPage, researchPage] = await Promise.all(fetches);
        const pp = productPage.properties || {};
        const rt = (p, key) => (p[key]?.rich_text || []).map(t => t.plain_text).join("") || "";
        const campRels = pp["Campaigns"]?.relation || [];
        const campaigns = await Promise.all(campRels.map(async c => {
          try {
            const r = await fetch(`https://api.notion.com/v1/pages/${c.id}`, { headers: hdr }).then(r => r.json());
            return { id: c.id.replace(/-/g,""), name: (r.properties?.Name?.title || []).map(t => t.plain_text).join("") || "?" };
          } catch { return null; }
        }));
        // Products DB has its own "Methods" relation — the delivery/marketing
        // method(s) attached to this product. Surfaced so the strategy-field
        // generator (esp. Offer Structure) can shape itself around how the
        // product is actually sold (e.g. Upwork-style contract scope vs a
        // packaged digital offer), not just generic keywords.
        const methodRels = pp["Methods"]?.relation || [];
        const methods = await Promise.all(methodRels.map(async m => {
          try {
            const r = await fetch(`https://api.notion.com/v1/pages/${m.id}`, { headers: hdr }).then(r => r.json());
            return { id: m.id.replace(/-/g,""), name: (r.properties?.Name?.title || []).map(t => t.plain_text).join("") || "?" };
          } catch { return null; }
        }));
        const product = {
          name:           (pp.Name?.title || []).map(t => t.plain_text).join("") || "Untitled",
          status:         pp.Status?.select?.name || "",
          site:           pp.Site?.select?.name || "",
          price:          rt(pp, "Price"),
          spots:          pp.Spots?.number || null,
          description:    rt(pp, "Description"),
          keywords:       rt(pp, "Keywords"),
          offerStructure: rt(pp, "Offer Structure"),
          uniqueAngle:    rt(pp, "Unique Angle"),
          avatar:         rt(pp, "Avatar"),
          transformation: rt(pp, "Transformation"),
          proofPoints:    rt(pp, "Proof Points"),
          objections:     rt(pp, "Objections"),
          campaigns:      campaigns.filter(Boolean),
          methods:        methods.filter(Boolean),
        };
        let research = null;
        if (researchPage) {
          const rp = researchPage.properties || {};
          research = {
            id:                 researchPage.id.replace(/-/g,""),
            keywords:           rt(rp, "Keywords"),
            statement:          rt(rp, "Statement"),
            uniqueOpportunity:  rt(rp, "Unique Opportunity"),
            newsFeed:           rt(rp, "News Feed"),
            notes:              rt(rp, "Notes"),
            thoughts:           rt(rp, "Thoughts"),
            productIdeas:       rt(rp, "Product Ideas"),
            tikTokShopProducts: rt(rp, "TikTok Shop Products"),
            kdpBestSellers:     rt(rp, "KDP Best Sellers"),
            tiktokTrends:       rt(rp, "TikTok Trends"),
            trendIntelligence:  rt(rp, "Trend Intelligence"),
            etsyProducts:       rt(rp, "Etsy Products"),
            youtubeOutliers:    rt(rp, "YouTube Outliers"),
            seedChannels:       rt(rp, "Seed Channels"),
            keyMessage:         rt(rp, "Key Message"),
          };
        }
        return json({ product, research });
      }

      // Î"Ã¶Ã‡Î"Ã¶Ã‡ CAMPAIGN ADMIN: condense via Claude Î"Ã¶Ã‡Î"Ã¶Ã‡
      // ── getSourceLinks ──
      if (body.action === "getSourceLinks") {
        const { query, keywords } = body;
        if (!query) return json({ error: "query required" }, 400);
        const searchQuery = keywords ? `${query} ${keywords}` : query;
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1000,
            tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }],
            messages: [{ role: 'user', content: `Find 6 real, current web sources about: "${searchQuery}". Return ONLY a plain list: TITLE | URL one per line.` }],
          }),
        });
        const data = await resp.json();
        if (!resp.ok) return json({ error: data.error?.message || 'Search failed' }, resp.status);
        const sources = [];
        for (const block of (data.content || [])) {
          if (block.type === 'text') {
            const lines = block.text.split('\n').filter(l => l.includes('|') || l.match(/https?:\/\//));
            for (const line of lines) {
              const pipeIdx = line.indexOf('|');
              if (pipeIdx !== -1) {
                const title = line.slice(0, pipeIdx).trim().replace(/^[-•*\d+\.\s]+/, '');
                const url = line.slice(pipeIdx + 1).trim();
                if (url.match(/^https?:\/\//)) sources.push({ title: title || url, url });
              } else {
                const urlMatch = line.match(/https?:\/\/[^\s)>]+/);
                if (urlMatch) sources.push({ title: urlMatch[0], url: urlMatch[0] });
              }
            }
          }
        }
        return json({ sources: sources.slice(0, 8) });
      }

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
            model: 'claude-haiku-4-5-20251001',
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
        let { prompt } = body;
        if (!prompt) return json({ error: "prompt required" }, 400);
        // operator research guidelines ride along on every front-end call —
        // prepend them here so prompt-editing modals (field research, SM
        // trends) get the same routing steer as the structured actions
        prompt = researchGuidelinesBlock(body.researchGuidelines) + prompt;
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
          keywords:          "Keywords",
          productIdeas:      "Product Ideas",
          notes:             "Notes",
          platforms:         "Platforms & Methods",
          tiktokTrends:      "TikTok Trends",
          trendIntelligence: "Trend Intelligence",
          newsFeed:          "News Feed",
          keyMessage:        "Key Message",
          thoughts:          "Thoughts",
          uniqueOpportunity: "Unique Opportunity",
          statement:         "Statement",
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

      // ── updateProductField ──
      // Writes one of a Product page's own strategy fields (as opposed to
      // updateResearch, which targets the Research page). Powers the product
      // site's per-field "▶ Generate" buttons for Unique Angle / Avatar /
      // Transformation / Offer Structure / Proof Points / Objections.
      if (body.action === "updateProductField") {
        const { productId, field, value } = body;
        if (!productId || !field) return json({ error: "productId and field required" }, 400);
        const fieldMap = {
          avatar:         "Avatar",
          transformation: "Transformation",
          offerStructure: "Offer Structure",
          proofPoints:    "Proof Points",
          objections:     "Objections",
          uniqueAngle:    "Unique Angle",
        };
        const notionField = fieldMap[field];
        if (!notionField) return json({ error: "Unknown field: " + field }, 400);
        const dashed = productId.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
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

      // ── createProductTodo ──
      // Creates a Main TD item and links it into a PRODUCT's own "TD Items"
      // relation. Distinct from createTodo, which links into a CAMPAIGN's
      // "Associated To Do" relation — Products DB has no such property, so the
      // product site was previously (mis-)calling createTodo with productId
      // passed as campaignId, which silently failed to link anything (no
      // resp.ok check on that write) while still reporting success.
      if (body.action === "createProductTodo") {
        const { name, productId } = body;
        if (!name || !productId) return json({ error: "name and productId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const createResp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({
            parent: { database_id: MAIN_TD_DB },
            properties: { Title: { title: [{ type: "text", text: { content: name } }] } }
          }),
        });
        const created = await createResp.json();
        if (!createResp.ok) return json({ error: created.message || "Create failed" }, createResp.status);
        const newTodoId = created.id.replace(/-/g,"");

        const prodResp = await fetch(`https://api.notion.com/v1/pages/${dashId(productId)}`, { headers: hdr });
        const prodPage = await prodResp.json();
        const existing = (prodPage.properties?.["TD Items"]?.relation || []).map(r => ({ id: r.id }));
        existing.push({ id: dashId(newTodoId) });
        const linkResp = await fetch(`https://api.notion.com/v1/pages/${dashId(productId)}`, {
          method: "PATCH",
          headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "TD Items": { relation: existing } } }),
        });
        if (!linkResp.ok) { const err = await linkResp.json(); return json({ error: "Todo created but link failed: " + (err.message || "unknown") }, 500); }

        return json({ success: true, id: newTodoId, name });
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
            model: 'claude-haiku-4-5-20251001',
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
        if (!claudeResp.ok) return json({ error: claudeData.error?.message || 'Claude error', type: claudeData.error?.type, status: claudeResp.status }, 502);
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

        const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1200,
            system: `You are a KDP publishing market researcher with deep knowledge of Amazon Kindle bestseller lists. Given campaign keywords, identify 15 top-selling and trending Kindle ebook opportunities in that niche. Draw on your knowledge of what actually sells well on Amazon KDP — proven sub-niches, high-review-count categories, and titles with consistent demand.

FORMAT — output exactly 15 lines, one per book opportunity:
TITLE CONCEPT (5 words max): realistic price · estimated stars★ · niche appeal — one-line insight about why it sells

Rules:
- TITLE CONCEPT is a realistic Kindle book title idea, title case, max 5 words
- Price range typical for the niche (e.g. $2.99–$9.99)
- Stars based on typical bestsellers in this category
- Insight is max 10 words — what makes books like this sell
- Mix sub-niches: how-to guides, workbooks, planners, inspirational, reference
- No bullets, no numbering, no markdown, no preamble
- Output only the 15 lines, nothing else`,
            messages: [{ role: "user", content: `Find top KDP Kindle ebook opportunities for these campaign keywords: ${keywords}` }]
          })
        });
        const claudeData = await claudeResp.json();
        if (!claudeResp.ok) return json({ error: claudeData.error?.message || "Claude error", type: claudeData.error?.type, status: claudeResp.status }, 502);
        const result = (claudeData.content?.[0]?.text || "").trim();
        if (!result) return json({ error: "No results — try again" }, 500);

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
            model: 'claude-haiku-4-5-20251001',
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
        if (!claudeResp.ok) return json({ error: claudeData.error?.message || 'Claude error', type: claudeData.error?.type, status: claudeResp.status }, 502);
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
            model: 'claude-haiku-4-5-20251001',
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
        if (!claudeResp.ok) return json({ error: claudeData.error?.message || 'Claude error', type: claudeData.error?.type, status: claudeResp.status }, 502);
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
            model: 'claude-haiku-4-5-20251001',
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
        if (!claudeResp.ok) return json({ error: claudeData.error?.message || 'Claude error', type: claudeData.error?.type, status: claudeResp.status }, 502);
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

      // ── getSeedChannels ──
      // Seed-channel list for the "Video Copy" method, built off the campaign
      // keywords: YouTube-searches the keywords for channels in the niche,
      // keeps the "modelable" range (5K–3M subs, real catalog), saves to the
      // Research "Seed Channels" field. The make-video-copy skill reads it.
      // Finds the channels BEHIND the top keyword-matching VIDEOS on YouTube
      // (video-type search — mirrors how a human searches; the old
      // type=channel search matched channel NAMES/descriptions and returned
      // junk that had nothing to do with what ranks for the keywords) and
      // the top creators on TikTok (via Apify, when APIFY_TOKEN is set).
      // Channels are ranked by how many keyword searches they appear in,
      // then size.
      if (body.action === "getSeedChannels") {
        if (!await verifyToken(body.token, HMAC_SECRET)) return json({ error: "Unauthorized" }, 401);
        const { researchId, kwOverride } = body;
        if (!researchId) return json({ error: "researchId required" }, 400);
        const dashId = i => { const s=i.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const YT_KEY = (env.YOUTUBE_API_KEY || "").trim();
        if (!YT_KEY) return json({ error: "YOUTUBE_API_KEY secret not set on worker" }, 500);

        let keywords = (kwOverride || "").trim();
        if (!keywords) {
          try {
            const rr = await fetch(`https://api.notion.com/v1/pages/${dashId(researchId)}`, {
              headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION }
            }).then(r => r.json());
            keywords = rr.properties?.Keywords?.rich_text?.map(t => t.plain_text).join("") || "";
          } catch {}
        }
        if (!keywords) return json({ error: "No keywords found — add keywords to the Research record or enter them manually" }, 400);

        const terms = keywords.split(/[,\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 5);
        const fmt = n => n >= 1e6 ? (n/1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n/1e3) + "k" : String(n);
        const age = iso => {
          if (!iso) return "";
          const days = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
          return days < 30 ? `${days}d ago` : days < 365 ? `${Math.round(days/30)}mo ago` : `${(days/365).toFixed(1)}y ago`;
        };

        // ── YouTube: top VIDEOS per keyword (individual videos, not channels)
        const vidHits = new Map(); // videoId -> search-appearance count
        await Promise.all(terms.map(async term => {
          try {
            const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15&q=${encodeURIComponent(term)}&key=${YT_KEY}`);
            if (!r.ok) return;
            const d = await r.json();
            (d.items || []).forEach(i => {
              const id = i.id?.videoId;
              if (!id) return;
              vidHits.set(id, (vidHits.get(id) || 0) + 1);
            });
          } catch {}
        }));
        if (!vidHits.size) return json({ error: "No videos found for these keywords" }, 404);

        const topIds = [...vidHits.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]).slice(0, 50);
        const vr = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${topIds.join(",")}&key=${YT_KEY}`);
        const vd = await vr.json();
        if (!vr.ok) return json({ error: vd.error?.message || "YouTube videos lookup failed" }, 502);
        const videos = (vd.items || []).map(v => ({
          title:   (v.snippet?.title || v.id).replace(/\s+/g, " ").trim(),
          channel: v.snippet?.channelTitle || "",
          views:   parseInt(v.statistics?.viewCount || 0),
          when:    age(v.snippet?.publishedAt),
          hits:    vidHits.get(v.id) || 0,
          url:     `https://youtube.com/watch?v=${v.id}`,
        }))
        .sort((a, b) => b.hits - a.hits || b.views - a.views)
        .slice(0, 12);
        if (!videos.length) return json({ error: "No videos found for these keywords — try broader/different keywords" }, 404);

        // ── TikTok: top keyword-matching videos (Apify)
        let tiktoks = [], tkNote = "";
        const AT = (env.APIFY_TOKEN || "").trim();
        if (AT) {
          try {
            const items = await callApifyActor(AT, "clockworks~tiktok-scraper", {
              searchQueries: terms.slice(0, 2),
              resultsPerPage: 15,
            }, 75);
            tiktoks = (items || []).map(it => {
              const a = it.authorMeta || it.author || {};
              const caption = String(it.text || it.desc || it.title || "").replace(/\s+/g, " ").trim();
              return {
                caption: caption.length > 80 ? caption.slice(0, 77) + "…" : (caption || "(no caption)"),
                handle:  a.name || a.uniqueId || a.username || "",
                plays:   parseInt(it.playCount || it.plays || it.stats?.playCount || 0),
                url:     it.webVideoUrl || it.url || (a.name && it.id ? `https://tiktok.com/@${a.name}/video/${it.id}` : ""),
              };
            })
            .filter(t => t.url)
            .sort((a, b) => b.plays - a.plays)
            .slice(0, 8);
            if (!tiktoks.length) tkNote = "no TikTok videos matched these keywords";
          } catch(e) { tkNote = "TikTok search failed — " + (e.message || "actor error"); }
        } else {
          tkNote = "APIFY_TOKEN not configured — YouTube only";
        }

        const ytLines = videos.map(v => `${v.title}: ${v.channel} · ${fmt(v.views)} views · ${v.when}${v.hits > 1 ? ` · in ${v.hits}/${terms.length} keyword searches` : ""} — ${v.url}`);
        const tkLines = tiktoks.map(t => `${t.caption}: @${t.handle} · ${fmt(t.plays)} plays — ${t.url}`);
        const text = [
          "YouTube:",
          ...ytLines,
          "",
          tiktoks.length ? "TikTok:" : `TikTok: ${tkNote}`,
          ...tkLines,
        ].filter(Boolean).join("\n");
        await fetch(`https://api.notion.com/v1/pages/${dashId(researchId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Seed Channels": { rich_text: [{ type: "text", text: { content: text.slice(0, 2000) } }] } } }),
        }).catch(() => {});
        return json({ success: true, text, videos, tiktoks, tiktokNote: tkNote || undefined });
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
            model: "claude-haiku-4-5-20251001",
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
        if (!claudeResp.ok) return json({ error: claudeData.error?.message || "Claude error", type: claudeData.error?.type, status: claudeResp.status }, 502);
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
        const prompt = `${researchGuidelinesBlock(body.researchGuidelines)}You are a keyword research specialist. Given these existing campaign keywords: "${currentKeywords || 'none provided'}"

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

      if (body.action === "linkResearchToCampaign") {
        const { researchId, campaignId } = body;
        const dashId = id => { const s=id.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashId(researchId)}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Campaign": { relation: [{ id: dashId(campaignId) }] } } }),
        });
        const result = await resp.json();
        if (!resp.ok) return json({ error: result.message || "Link failed" }, resp.status);
        return json({ success: true });
      }

      if (body.action === "updateScheduleDay") {
        const { campaignId, day } = body;
        if (!campaignId) return json({ error: "campaignId required" }, 400);
        const dashed = campaignId.replace(/-/g,"").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,"$1-$2-$3-$4-$5");
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Schedule Day": { multi_select: day ? [{ name: day }] : [] } } }),
        });
        if (!resp.ok) { const e = await resp.json(); return json({ error: e.message || "Update failed" }, resp.status); }
        return json({ success: true });
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
            { property: "Schedule Day", multi_select: { contains: day } },
            { property: "Status", select: { does_not_equal: "Delete" } },
          ]},
          sorts: [{ property: "Name", direction: "ascending" }],
        });
        const campaigns = rows.map(r => ({
          id: r.id.replace(/-/g, ""),
          name: r.properties?.Name?.title?.map(t => t.plain_text).join("") || "",
          status: r.properties?.Status?.select?.name || "",
          siteUrl: r.properties?.["microsite"]?.url || null,
        }));
        return json({ campaigns });
      }

      // -- removeFromPodcast --
      if (body.action === "removeFromPodcast") {
        const { tdId } = body;
        if (!tdId) return json({ error: "tdId required" }, 400);
        const dashId = s => { const r = s.replace(/-/g,""); return r.slice(0,8)+'-'+r.slice(8,12)+'-'+r.slice(12,16)+'-'+r.slice(16,20)+'-'+r.slice(20); };
        const dashed = dashId(tdId);
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" };
        const existing = await fetch(`https://api.notion.com/v1/pages/${dashed}`, { headers: hdr }).then(r => r.json());
        const currentTags = (existing.properties?.priority?.multi_select || []).filter(t => t.name !== "podcast").map(t => ({ name: t.name }));
        const patchResp = await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
          method: "PATCH", headers: hdr,
          body: JSON.stringify({ properties: { priority: { multi_select: currentTags } } }),
        });
        const patchData = await patchResp.json();
        if (!patchResp.ok) return json({ error: patchData.message || "Remove failed" }, patchResp.status);
        return json({ success: true });
      }

      // -- tagTdAsPodcast --      // ── tagTdAsPodcast ──
      if (body.action === "tagTdAsPodcast") {
        const { tdId } = body;
        if (!tdId) return json({ error: "tdId required" }, 400);
        const dashId = s => { const r = s.replace(/-/g,""); return r.slice(0,8)+'-'+r.slice(8,12)+'-'+r.slice(12,16)+'-'+r.slice(16,20)+'-'+r.slice(20); };
        const dashed = dashId(tdId);
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" };
        const existing = await fetch(`https://api.notion.com/v1/pages/${dashed}`, { headers: hdr }).then(r => r.json());
        const currentTags = (existing.properties?.priority?.multi_select || []).map(t => ({ name: t.name }));
        if (currentTags.some(t => t.name === "podcast")) return json({ success: true, alreadyTagged: true });
        const patchResp = await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
          method: "PATCH", headers: hdr,
          body: JSON.stringify({ properties: { priority: { multi_select: [...currentTags, { name: "podcast" }] } } }),
        });
        const patchData = await patchResp.json();
        if (!patchResp.ok) return json({ error: patchData.message || "Tag failed" }, patchResp.status);
        return json({ success: true });
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
        const [legacyRows, taggedRows] = await Promise.all([
          notionQuery(MAIN_TD_DB, {
            filter: { property: "Title", title: { starts_with: "[PODCAST" } },
            sorts: [{ timestamp: "created_time", direction: "descending" }],
          }),
          notionQuery(MAIN_TD_DB, {
            filter: { property: "priority", multi_select: { contains: "podcast" } },
            sorts: [{ timestamp: "created_time", direction: "descending" }],
          }),
        ]);
        const seen = new Set();
        const items = [];
        for (const r of [...legacyRows, ...taggedRows]) {
          const id = r.id.replace(/-/g,"");
          if (seen.has(id)) continue;
          seen.add(id);
          const raw = r.properties?.Title?.title?.map(t => t.plain_text).join("") || "";
          const match = raw.match(/^\[PODCAST · (.+?)\] (.+)$/s);
          const campRel = (r.properties?.campaign?.relation || [])[0]?.id?.replace(/-/g,"") || "";
          items.push({
            id,
            campaignName: match ? match[1] : (r.properties?.["campaign site"]?.rollup?.array?.[0]?.select?.name || ""),
            text: match ? match[2] : raw,
            createdTime: r.created_time || "",
            notionId: id,
          });
        }
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
            body: JSON.stringify({ properties: { "Schedule Day": { multi_select: [{ name: day }] } } }),
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
          }));
        return json({ sites });
      }

            // ── MICROSITE: getAllSiteTodos ──
      if (body.action === "getAllSiteTodos") {
        // 2-subrequest approach: batch-query campaigns + batch-query open todos, join in memory
        const [campRows, todoRows] = await Promise.all([
          notionQuery(CAMPAIGNS_DB, {
            filter: { property: "Status", select: { does_not_equal: "Delete" } },
            sorts: [{ property: "Name", direction: "ascending" }],
          }),
          notionQuery(MAIN_TD_DB, {
            filter: { and: [
              { property: "priority", multi_select: { does_not_contain: "got" } },
              { property: "priority", multi_select: { does_not_contain: "done" } },
            ]},
          }),
        ]);

        // Build todo lookup by id
        const todoById = {};
        todoRows.forEach(t => {
          const id = t.id.replace(/-/g,"");
          const name = t.properties?.Title?.title?.map(x => x.plain_text).join("") || "Untitled";
          const prio = (t.properties?.priority?.multi_select || []).map(s => s.name);
          const done = prio.includes("got") || prio.includes("done");
          todoById[id] = { id, name, done, prio };
        });

        // Build campaign todo entries from inline relation data (no extra fetches)
        const todos = [];
        const seen = new Set();
        campRows.forEach(c => {
          const campaignName = c.properties?.Name?.title?.map(t => t.plain_text).join("") || "Untitled";
          const campaignId   = c.id.replace(/-/g,"");
          const siteUrl      = c.properties?.["microsite"]?.url || null;
          const todoIds      = (c.properties?.["Associated To Do"]?.relation || []).map(r => r.id.replace(/-/g,""));
          todoIds.forEach(todoId => {
            if (seen.has(todoId)) return;
            seen.add(todoId);
            const td = todoById[todoId];
            if (td) todos.push({ ...td, campaignName, campaignId, siteUrl });
          });
        });

        return json({ todos });
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

      // ── PRODUCTSITE: getProductTodos ──
      if (body.action === "getProductTodos") {
        const { productId } = body;
        if (!productId) return json({ error: "productId required" }, 400);
        const dashId = raw => { const s = raw.replace(/-/g,""); return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20); };
        const prodResp = await fetch(`https://api.notion.com/v1/pages/${dashId(productId)}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        const prodPage = await prodResp.json();
        const todoIds = (prodPage.properties?.["TD Items"]?.relation || []).map(r => r.id.replace(/-/g,""));
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
            title:       p.Title?.rich_text?.map(t=>t.plain_text).join("") || "",
            profilePic:  p["Profile Pic"]?.rich_text?.map(t=>t.plain_text).join("") || "",
            banner:      p.Banner?.rich_text?.map(t=>t.plain_text).join("") || "",
            campaignIds: (p.Campaign?.relation || []).map(r=>r.id.replace(/-/g,"")),
            platformIds: (p.Platform?.relation || []).map(r=>r.id.replace(/-/g,"")),
            smAccountIds: (p["SM Account"]?.relation || []).map(r=>r.id.replace(/-/g,"")),
            smAccountId:  p["SM Account ID"]?.rich_text?.map(t=>t.plain_text).join("") || "",
            loginType:   (p.type?.multi_select || []).map(s=>s.name),
            picture:     (p.Picture?.files || []).map(f => ({ name: f.name, url: f.file?.url || f.external?.url || "" })),
            files:       (p.Files?.files || []).map(f => ({ name: f.name, url: f.file?.url || f.external?.url || "" })),
            assetIds:    (p.Assets?.relation || []).map(r=>r.id.replace(/-/g,"")),
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
        const { loginId, name, category, status, usr, accountUrl, headline, bio, title, profilePic, banner, loginType, platformId, smAccountIds, smAccountId } = body;
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
        if (title !== undefined)    props.Title    = { rich_text: title ? [{ type:"text", text:{ content: title } }] : [] };
        if (profilePic !== undefined) props["Profile Pic"] = { rich_text: profilePic ? [{ type:"text", text:{ content: profilePic } }] : [] };
        if (banner !== undefined)   props.Banner   = { rich_text: banner ? [{ type:"text", text:{ content: banner } }] : [] };
        if (loginType !== undefined) props.type    = { multi_select: (loginType || []).map(name => ({ name })) };
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

      // â"€â"€ uploadLoginFile  -  upload to Login's Picture (replace) or Files (append) property â"€â"€
      if (body.action === "uploadLoginFile") {
        const { loginId, fileName, contentType, fileData, target } = body;
        if (!loginId || !fileName || !contentType || !fileData) return json({ error: "loginId, fileName, contentType, fileData required" }, 400);
        const prop = target === "Picture" ? "Picture" : "Files";
        const dashId = s => { const r = s.replace(/-/g,""); return r.slice(0,8)+'-'+r.slice(8,12)+'-'+r.slice(12,16)+'-'+r.slice(16,20)+'-'+r.slice(20); };
        const dashed = dashId(loginId);
        const binary = atob(fileData);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const createResp = await fetch("https://api.notion.com/v1/file_uploads", {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ content_type: contentType, mode: "single_part" }),
        });
        const createData = await createResp.json();
        if (!createResp.ok) return json({ error: createData.message || "File upload init failed" }, createResp.status);
        const { id: uploadId, upload_url: uploadUrl } = createData;
        if (!uploadId) return json({ error: "File upload init returned no ID" }, 500);
        const formData = new FormData();
        formData.append("file", new Blob([bytes], { type: contentType }), fileName);
        const putResp = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
          body: formData,
        });
        if (!putResp.ok) return json({ error: "File upload failed: " + (await putResp.text()).slice(0, 200) }, putResp.status);
        let filesValue = [{ type: "file_upload", name: fileName, file_upload: { id: uploadId } }];
        if (prop === "Files") {
          // Append: fetch existing Files entries first
          const existingResp = await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
            headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
          });
          const existingData = await existingResp.json();
          const existingFiles = (existingData.properties?.["Files"]?.files || []).flatMap(f => {
            if (f.type === "file" && f.file?.url) return [{ type: "file", name: f.name, file: { url: f.file.url } }];
            if (f.type === "external" && f.external?.url) return [{ type: "external", name: f.name, external: { url: f.external.url } }];
            return [];
          });
          filesValue = [...existingFiles, ...filesValue];
        }
        const patchResp = await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { [prop]: { files: filesValue } } }),
        });
        const patchData = await patchResp.json();
        if (!patchResp.ok) return json({ error: patchData.message || "Failed to attach file to login" }, patchResp.status);
        const fileUrl = patchData.properties?.[prop]?.files?.slice(-1)[0]?.file?.url || null;
        return json({ success: true, fileName, fileUrl });
      }

      // â"€â"€ removeLoginFile  -  remove one file (by name) from Picture or Files â"€â"€
      if (body.action === "removeLoginFile") {
        const { loginId, target, fileName } = body;
        if (!loginId || !fileName) return json({ error: "loginId and fileName required" }, 400);
        const prop = target === "Picture" ? "Picture" : "Files";
        const dashId = s => { const r = s.replace(/-/g,""); return r.slice(0,8)+'-'+r.slice(8,12)+'-'+r.slice(12,16)+'-'+r.slice(16,20)+'-'+r.slice(20); };
        const dashed = dashId(loginId);
        const existingResp = await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        const existingData = await existingResp.json();
        const remaining = (existingData.properties?.[prop]?.files || [])
          .filter(f => f.name !== fileName)
          .flatMap(f => {
            if (f.type === "file" && f.file?.url) return [{ type: "file", name: f.name, file: { url: f.file.url } }];
            if (f.type === "external" && f.external?.url) return [{ type: "external", name: f.name, external: { url: f.external.url } }];
            return [];
          });
        const resp = await fetch(`https://api.notion.com/v1/pages/${dashed}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { [prop]: { files: remaining } } }),
        });
        if (!resp.ok) { const e = await resp.json(); return json({ error: e.message || "Failed" }, resp.status); }
        return json({ success: true });
      }

      // â"€â"€ getLoginAssets  -  Assets DB records linked to this login â"€â"€
      if (body.action === "getLoginAssets") {
        const { loginId } = body;
        if (!loginId) return json({ error: "loginId required" }, 400);
        const dashId = s => { const r = s.replace(/-/g,""); return r.slice(0,8)+'-'+r.slice(8,12)+'-'+r.slice(12,16)+'-'+r.slice(16,20)+'-'+r.slice(20); };
        const rows = await notionQuery(ASSETS_DB, {
          filter: { property: "Login", relation: { contains: dashId(loginId) } },
          sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
        });
        const assets = rows.map(pg => {
          const p = pg.properties || {};
          return {
            id:         pg.id.replace(/-/g,""),
            title:      p["Asset Title"]?.title?.map(t=>t.plain_text).join("") || "Untitled",
            platform:   p["Platform Name"]?.select?.name || "",
            type:       p["Asset Type"]?.select?.name || "",
            status:     p["Asset Status"]?.select?.name || "",
            designLink: p["Design Link"]?.url || "",
          };
        });
        return json({ assets });
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
        try {
          return json(await fetchYahooOptionsChain(ticker, date));
        } catch (e) {
          return json({ error: e.message || 'Failed to fetch options chain' }, 502);
        }
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
      // fetchChart, calcSignals, calcFullSignals, buildSectorRrgCache etc. are
      // defined at module scope (top of file) so both fetch() and the scheduled()
      // auto-trade scan can share them.

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

        const sectorRrgCache = await buildSectorRrgCache();
        const results = await Promise.allSettled(
          list.map(sym => calcFullSignals(sym, sectorRrgCache))
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

        // Step 2: fetch OHLCV for all in parallel (momentum + accumulation signals + EMA distances + sector RRG)
        const sectorRrgCache = await buildSectorRrgCache();
        const results = await Promise.allSettled(
          tickers.map(sym => calcFullSignals(sym, sectorRrgCache))
        );

        const all = results
          .map((r, i) => r.status === 'fulfilled' ? r.value : null)
          .filter(Boolean);

        // Step 3: sort by momentum/accumulation score, return top 15
        // (stochastic and EMA distance are informational columns only — not filtered on)
        const top = all
          .sort((a, b) => b.score - a.score)
          .slice(0, 15);

        return json({ screened: top, universe: tickers.length });
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

        const sectorRrgCache = await buildSectorRrgCache();
        const results = await Promise.allSettled(
          tickers.map(sym => calcFullSignals(sym, sectorRrgCache).then(s => {
            if (s && INSTITUTIONAL_UNIVERSE[sym]) {
              s.funds     = INSTITUTIONAL_UNIVERSE[sym].funds;
              s.fundCount = s.funds.length;
            }
            return s;
          }))
        );

        // Sorted by momentum/accumulation score — stochastic and EMA distance are
        // informational columns only — not filtered on
        const all = results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
        const top = all.sort((a, b) => b.score - a.score).slice(0, 15);

        return json({ screened: top, universe: tickers.length });
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

      // ── Saved Posts (Links tab) ──
      if (body.action === "getSavedPosts") {
        if (!await verifyToken(body.token, HMAC_SECRET)) return json({ error: "Unauthorized" }, 401);
        const rows = await notionQuery(SAVED_POSTS_DB, {
          sorts: [{ property: "Date Saved", direction: "descending" }],
        });
        const posts = rows.map(p => {
          const pr = p.properties || {};
          return {
            id: p.id,
            name: pr.Name?.title?.[0]?.plain_text || "Saved Post",
            url: pr.URL?.url || "",
            platform: pr.Platform?.select?.name || "",
            account: pr.Account?.rich_text?.[0]?.plain_text || "",
            status: pr.Status?.status?.name || "",
            dateSaved: pr["Date Saved"]?.date?.start || "",
            notes: pr.Notes?.rich_text?.[0]?.plain_text || "",
            error: pr["Summary Error"]?.rich_text?.[0]?.plain_text || "",
            notionUrl: p.url,
          };
        });
        return json({ posts });
      }

      if (body.action === "runSavedPostsPipeline") {
        if (!await verifyToken(body.token, HMAC_SECRET)) return json({ error: "Unauthorized" }, 401);
        const summary = await runSavedPostsPipeline(env, body.limit);
        return json(summary);
      }

      if (body.action === "retrySavedPost") {
        if (!await verifyToken(body.token, HMAC_SECRET)) return json({ error: "Unauthorized" }, 401);
        const { id } = body;
        if (!id) return json({ error: "id required" }, 400);
        const pageResp = await fetch(`https://api.notion.com/v1/pages/${id}`, {
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION },
        });
        const page = await pageResp.json();
        if (!pageResp.ok) return json({ error: page.message || "Page not found" }, 404);
        const result = await processSavedPost(env, page);
        return json(result);
      }

      if (body.action === "deleteSavedPost") {
        if (!await verifyToken(body.token, HMAC_SECRET)) return json({ error: "Unauthorized" }, 401);
        const { id } = body;
        if (!id) return json({ error: "id required" }, 400);
        const resp = await fetch(`https://api.notion.com/v1/pages/${id}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
        });
        const data = await resp.json();
        if (!resp.ok) return json({ error: data.message || "Failed to delete" }, 500);
        return json({ ok: true });
      }

      // ── generateCarouselPreview ──
      // The Worker-native carousel path: no Canva, no chat tab. Writes the
      // 7-slide script to the title (if it doesn't have one yet — same
      // prompt as generateTitleSlides), renders each slide as a real PNG via
      // Cloudflare's Browser Rendering REST API (plain HTTPS, no bundling —
      // this project runs no_bundle so the @cloudflare/puppeteer binding
      // isn't usable here), commits the PNGs + a gallery page to GitHub
      // Pages, and upserts an Assets DB record pointing at it. Re-running
      // this after editing the slide text on the title re-renders from
      // those edits — same "regenerate" contract as the make-carousel skill,
      // just without ever leaving the dashboard.
      //
      // Sets the title's Status to "Publish" (the value this dashboard
      // actually surfaces/tracks — "Review" isn't used anywhere) and the
      // Asset's Status to "Ready" once the preview is rendered. This is a
      // rendered-and-hosted preview, not an actual Instagram post — that's a
      // separate, not-yet-built step (see chat history — upload-post.com is
      // the planned integration, UPLOAD_POST_API_KEY is already provisioned
      // but unused).
      if (body.action === "generateCarouselPreview") {
        const { titleId, campaignId } = body;
        if (!titleId || !campaignId) return json({ error: "titleId and campaignId required" }, 400);
        if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
        const CF_ACCOUNT_ID = (env.CF_ACCOUNT_ID || '').trim();
        const CF_API_TOKEN = (env.CF_API_TOKEN || '').trim();
        if (!CF_ACCOUNT_ID || !CF_API_TOKEN) return json({ error: "CF_ACCOUNT_ID / CF_API_TOKEN not configured — run: wrangler secret put CF_ACCOUNT_ID, wrangler secret put CF_API_TOKEN (a Cloudflare API token with Browser Rendering permission — create one at dash.cloudflare.com/profile/api-tokens)" }, 400);
        const GT = (env.GITHUB_TOKEN || '').trim();
        if (!GT) return json({ error: "GITHUB_TOKEN not set — run: wrangler secret put GITHUB_TOKEN" }, 400);

        const dash = raw => { const s = raw.replace(/-/g,""); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`; };
        const hdr = { "Authorization": `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION };
        const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

        // ── Step 1: read the title, and its existing slide script if any ──
        const titlePage = await fetch(`https://api.notion.com/v1/pages/${dash(titleId)}`, { headers: hdr }).then(r => r.json());
        if (!titlePage.properties) return json({ error: titlePage.message || "Title not found" }, 404);
        const titleName = (titlePage.properties.Title?.title || []).map(t => t.plain_text).join("") || "Carousel";

        const parseSlides = async () => {
          const blocksResp = await fetch(`https://api.notion.com/v1/blocks/${dash(titleId)}/children?page_size=100`, { headers: hdr }).then(r => r.json());
          const blocks = blocksResp.results || [];
          const sections = [];
          let current = null;
          for (const b of blocks) {
            if (b.type === "heading_3") {
              current = { heading: (b.heading_3?.rich_text || []).map(t => t.plain_text).join(""), lines: [] };
              sections.push(current);
            } else if (current && (b.type === "paragraph" || b.type === "bulleted_list_item")) {
              const rt = b[b.type]?.rich_text || [];
              const text = rt.map(t => t.plain_text).join("");
              const bold = !!rt[0]?.annotations?.bold;
              if (text) current.lines.push({ text, bold });
            }
          }
          const findSection = name => sections.find(s => s.heading.toLowerCase() === name.toLowerCase());
          const slides = sections
            .filter(s => /^Slide \d+/i.test(s.heading))
            .map(s => ({
              headline: (s.lines.find(l => l.bold) || s.lines[0] || {}).text || "",
              body: (s.lines.find(l => !l.bold) || {}).text || "",
            }));
          const caption = findSection("Caption")?.lines?.[0]?.text || "";
          const hashtags = findSection("Hashtags")?.lines?.[0]?.text || "";
          return { slides, caption, hashtags };
        };

        let { slides, caption, hashtags } = await parseSlides();

        // ── Step 2: no slide script yet — write one (same prompt as generateTitleSlides) ──
        if (!slides.length) {
          let keywords = "";
          const researchRaw = await fetch(`https://api.notion.com/v1/databases/${RESEARCH_DB}/query`, {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ filter: { property: "Campaign", relation: { contains: dash(campaignId) } } }),
          }).then(r => r.json()).catch(() => ({ results: [] }));
          const rt = (results, key) => { for (const r of (results.results || [])) { const v = (r.properties[key]?.rich_text || []).map(t => t.plain_text).join(""); if (v) return v; } return ""; };
          keywords = rt(researchRaw, "Keywords");

          const slidePrompt = `${researchGuidelinesBlock(body.researchGuidelines)}Write a full 7-slide Instagram carousel script for this specific title.

TITLE: ${titleName}
${keywords ? `KEYWORDS: ${keywords}\n` : ''}
Write EXACTLY 7 slides, no more, no fewer:
- Slide 1 (hook): short punchy headline + one-line subtext as "body"
- Slides 2-6 (insights): 5 slides, each a short headline + 2-3 sentence body — real substance, not placeholders
- Slide 7 (CTA): short quote/summary line as headline + save/follow/next-step prompt as "body"
- Instagram caption (150-200 words) — required, never leave empty
- 3-5 hashtags (no # prefix needed) — required, never leave empty

Every slide must have both a non-empty "headline" and a non-empty "body". No em-dashes, no banned marketing filler ("unlock", "game-changer", "supercharge", "leverage").

Return ONLY this JSON object, no other text, no markdown fences:
{ "slides": [ { "headline": "...", "body": "..." }, ... exactly 7 total ... ], "caption": "...", "hashtags": ["...", "..."] }`;

          const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: slidePrompt }] }),
          });
          const aiData = await aiResp.json();
          if (!aiResp.ok) return json({ error: aiData.error?.message || "Claude API error" }, 500);
          let parsed;
          try {
            const raw = aiData.content?.[0]?.text || "";
            const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
            if (start === -1 || end === -1) throw new Error("No JSON object found");
            parsed = JSON.parse(sanitizeJsonControlChars(raw.slice(start, end + 1)));
          } catch(e) { return json({ error: "Failed to parse slides JSON: " + e.message }, 500); }

          const rtBlock = (text, opts = {}) => text ? [{ type: "text", text: { content: String(text) }, annotations: { bold: !!opts.bold, italic: false, strikethrough: false, underline: false, code: false, color: "default" } }] : [];
          const heading = text => ({ object: "block", type: "heading_3", heading_3: { rich_text: rtBlock(text) } });
          const para = (text, opts = {}) => ({ object: "block", type: "paragraph", paragraph: { rich_text: rtBlock(text, opts) } });
          const divider = () => ({ object: "block", type: "divider", divider: {} });
          const writtenSlides = (Array.isArray(parsed.slides) ? parsed.slides : []).filter(s => s && (s.headline || s.body));
          const n = writtenSlides.length;
          const children = [];
          writtenSlides.forEach((s, idx) => {
            children.push(heading(`Slide ${idx + 1} (${idx + 1}/${n})`));
            if (s.headline) children.push(para(s.headline, { bold: true }));
            if (s.body) children.push(para(s.body));
            children.push(divider());
          });
          if (parsed.caption) { children.push(heading('Caption')); children.push(para(parsed.caption)); }
          if (Array.isArray(parsed.hashtags) && parsed.hashtags.length) {
            children.push(heading('Hashtags'));
            children.push(para(parsed.hashtags.map(h => h.startsWith('#') ? h : '#' + h).join(' ')));
          }
          if (children.length) {
            const writeResp = await fetch(`https://api.notion.com/v1/blocks/${dash(titleId)}/children`, {
              method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" },
              body: JSON.stringify({ children }),
            });
            if (!writeResp.ok) { const r = await writeResp.json(); return json({ error: r.message || "Failed to write slides to title" }, writeResp.status); }
          }
          ({ slides, caption, hashtags } = await parseSlides());
          if (!slides.length) return json({ error: "Wrote a slide script but couldn't parse it back — try again" }, 500);
        }

        // ── Step 3: design spec + deploy path ──
        const campPage = await fetch(`https://api.notion.com/v1/pages/${dash(campaignId)}`, { headers: hdr }).then(r => r.json());
        const specRelId = campPage.properties?.["Design Spec"]?.relation?.[0]?.id || null;
        let spec = { ...DESIGN_SPEC_DEFAULTS };
        if (specRelId) {
          const specPage = await fetch(`https://api.notion.com/v1/pages/${specRelId}`, { headers: hdr }).then(r => r.json()).catch(() => null);
          if (specPage?.properties) {
            const s = dsFromPage(specPage);
            spec = { ...spec, ...Object.fromEntries(Object.entries(s).filter(([k, v]) => k !== "id" && k !== "name" && v)) };
          }
        }
        const liveUrl = campPage.properties?.["live site"]?.url || campPage.properties?.["microsite"]?.url || "";
        const deployMatch = liveUrl.match(/\/web\/([^\/?#]+)/) || liveUrl.match(/\/microsites\/([^\/?#]+)/);
        const slugify = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
        const deployPath = deployMatch ? deployMatch[1] : (slugify(campPage.properties?.Name?.title?.map(t=>t.plain_text).join("")) || 'campaign');
        const titleSlug = slugify(titleName) || 'carousel';

        // ── Step 4: render each slide to a real PNG via Browser Rendering ──
        const slideHtml = (slide, idx, total) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(spec.headlineFont)}:wght@600;700&family=${encodeURIComponent(spec.bodyFont)}:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1080px; height:1350px; background:${spec.bg}; font-family:'${spec.bodyFont}',serif; display:flex; flex-direction:column; justify-content:center; padding:100px 90px; position:relative; overflow:hidden; }
  .num { font-family:'IBM Plex Mono',monospace; font-size:22px; color:${spec.accent}; letter-spacing:0.14em; text-transform:uppercase; margin-bottom:32px; }
  h1 { font-family:'${spec.headlineFont}',serif; font-size:58px; line-height:1.18; color:${spec.ink}; margin-bottom:30px; font-weight:600; }
  p { font-family:'${spec.bodyFont}',serif; font-size:29px; line-height:1.55; color:${spec.ink}; opacity:0.82; }
  .counter { position:absolute; bottom:64px; right:74px; font-family:'IBM Plex Mono',monospace; font-size:19px; color:${spec.accent}; }
  .rule { position:absolute; left:90px; right:90px; top:70px; height:1px; background:${spec.accent}; opacity:0.35; }
</style></head><body>
  <div class="rule"></div>
  <div class="num">${String(idx + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</div>
  <h1>${esc(slide.headline)}</h1>
  <p>${esc(slide.body)}</p>
  <div class="counter">${idx + 1} / ${total}</div>
</body></html>`;

        const renderSlide = async (html) => {
          const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/browser-rendering/screenshot`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ html, viewport: { width: 1080, height: 1350, deviceScaleFactor: 1 }, screenshotOptions: { type: "png" } }),
          });
          if (!resp.ok) { const t = await resp.text(); throw new Error(`Browser Rendering failed (HTTP ${resp.status}): ${t.slice(0, 300)}`); }
          return await resp.arrayBuffer();
        };

        // Sequential, not Promise.all — Workers cap simultaneous outbound
        // connections, and 7 concurrent calls to a slow, headless-browser-
        // backed API can blow past that and crash the whole invocation
        // (a bare platform 502 with no application-level error body, rather
        // than a catchable rejection). One at a time is slower but reliable,
        // and a failure names exactly which slide broke.
        const pngBuffers = [];
        try {
          for (let i = 0; i < slides.length; i++) {
            pngBuffers.push(await renderSlide(slideHtml(slides[i], i, slides.length)));
          }
        } catch (e) {
          return json({ error: `Slide ${pngBuffers.length + 1}: ${e.message}` }, 502);
        }

        // ── Step 5: commit PNGs + a gallery page to GitHub Pages ──
        const REPO = "cabuzzard/dash", BRANCH = "main";
        const gh = { "Authorization": `Bearer ${GT}`, "Accept": "application/vnd.github+json", "User-Agent": "dash-worker" };
        const toB64Bin = buf => { const bytes = new Uint8Array(buf); let bin = ''; const chunk = 0x8000; for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)); return btoa(bin); };
        const toB64Text = str => { const bytes = new TextEncoder().encode(str); let bin = ''; const chunk = 0x8000; for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)); return btoa(bin); };
        const basePath = `web/${deployPath}/carousels/${titleSlug}`;

        const putFile = async (path, b64, message) => {
          const getResp = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`, { headers: gh });
          let sha = null;
          if (getResp.ok) { try { sha = (await getResp.json()).sha || null; } catch(e) {} }
          const putBody = { message, content: b64, branch: BRANCH };
          if (sha) putBody.sha = sha;
          const putResp = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
            method: "PUT", headers: { ...gh, "Content-Type": "application/json" }, body: JSON.stringify(putBody),
          });
          if (!putResp.ok) { const r = await putResp.json(); throw new Error(`GitHub commit failed for ${path} (HTTP ${putResp.status}): ${r.message || 'unknown'}`); }
        };

        try {
          for (let i = 0; i < pngBuffers.length; i++) {
            await putFile(`${basePath}/slide-${String(i + 1).padStart(2, '0')}.png`, toB64Bin(pngBuffers[i]), `Carousel preview: ${titleName} — slide ${i + 1}`);
          }
          const galleryHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(titleName)} — Carousel Preview</title>
<meta name="robots" content="noindex, nofollow">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#111; font-family:system-ui,sans-serif; padding:32px 20px; }
  h1 { color:#fff; font-size:20px; margin-bottom:6px; }
  .sub { color:#888; font-size:13px; margin-bottom:28px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:16px; max-width:1200px; margin:0 auto; }
  .grid img { width:100%; border-radius:6px; display:block; box-shadow:0 4px 20px rgba(0,0,0,.4); }
  .cap { max-width:640px; margin:36px auto 0; color:#ccc; font-size:14px; line-height:1.7; white-space:pre-wrap; }
  .tags { max-width:640px; margin:14px auto 0; color:#666; font-size:12px; }
</style></head><body>
  <h1>${esc(titleName)}</h1>
  <div class="sub">Carousel preview — ${slides.length} slides — for approval / layout review, not yet published</div>
  <div class="grid">${pngBuffers.map((_, i) => `<img src="slide-${String(i + 1).padStart(2, '0')}.png" alt="Slide ${i + 1}">`).join('')}</div>
  ${caption ? `<div class="cap">${esc(caption)}</div>` : ''}
  ${hashtags ? `<div class="tags">${esc(hashtags)}</div>` : ''}
</body></html>`;
          await putFile(`${basePath}/index.html`, toB64Text(galleryHtml), `Carousel preview: ${titleName} — gallery page`);
        } catch (e) {
          return json({ error: e.message }, 502);
        }

        const previewUrl = `https://cabuzzard.github.io/dash/${basePath}/`;

        // ── Step 6: upsert the Assets DB record + move the title to Review ──
        const assetQuery = await fetch(`https://api.notion.com/v1/databases/${ASSETS_DB}/query`, {
          method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ filter: { and: [
            { property: "Content Strategy", relation: { contains: dash(titleId) } },
            { property: "Asset Type", select: { equals: "carousel" } },
          ] } }),
        }).then(r => r.json()).catch(() => ({ results: [] }));
        const existingAsset = (assetQuery.results || []).find(a => !a.archived);

        const assetProps = {
          "Design Link": { url: previewUrl },
          "Status": { select: { name: "Ready" } },
          "Asset Status": { select: { name: "Development" } },
          "Body": { rich_text: [{ type: "text", text: { content: caption.slice(0, 1990) } }] },
          "Notes": { rich_text: [{ type: "text", text: { content: hashtags.slice(0, 1990) } }] },
          "Platform Name": { select: { name: "Instagram" } },
        };
        let assetId;
        if (existingAsset) {
          assetId = existingAsset.id.replace(/-/g, "");
          await fetch(`https://api.notion.com/v1/pages/${dash(assetId)}`, {
            method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" }, body: JSON.stringify({ properties: assetProps }),
          });
        } else {
          assetProps["Asset Title"] = { title: [{ type: "text", text: { content: `${titleName} — Carousel`.slice(0, 200) } }] };
          assetProps["Asset Type"] = { select: { name: "carousel" } };
          assetProps["Content Strategy"] = { relation: [{ id: dash(titleId) }] };
          assetProps["Campaign"] = { relation: [{ id: dash(campaignId) }] };
          const createResp = await fetch("https://api.notion.com/v1/pages", {
            method: "POST", headers: { ...hdr, "Content-Type": "application/json" },
            body: JSON.stringify({ parent: { database_id: ASSETS_DB }, properties: assetProps }),
          });
          const created = await createResp.json();
          if (!createResp.ok || !created.id) return json({ error: created.message || "Asset create failed" }, createResp.status || 500);
          assetId = created.id.replace(/-/g, "");
        }

        await fetch(`https://api.notion.com/v1/pages/${dash(titleId)}`, {
          method: "PATCH", headers: { ...hdr, "Content-Type": "application/json" },
          body: JSON.stringify({ properties: { "Status": { select: { name: "Publish" } } } }),
        });

        return json({ success: true, previewUrl, slideCount: slides.length, assetId, titleId });
      }

      return json({ error: "Unknown action" }, 400);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    if (event.cron === "*/30 * * * *") {
      ctx.waitUntil(runSavedPostsPipeline(env).catch(e => console.error('savedPostsPipeline failed:', e.message)));
      return;
    }
    ctx.waitUntil(deepScan(env).catch(e => console.error('deepScan failed:', e.message)));
    ctx.waitUntil(runAutoTradeScan(env).catch(e => console.error('runAutoTradeScan failed:', e.message)));
  },
};


