// Pure digest record rules (operator spec 2026-10-28). No model calls, credentials, Notion or KV access.
// A Digest parent is one rolling document; its records (KV digest:items:<assetId>.items) accumulate across runs and each
// is Unused (offered), Used (generated into an issue/article), Retired (operator removed — never rolled forward, stays in
// research memory as known, recoverable) or Expired (unused for more than DIGEST_CARRY_RUNS runs — dropped, recoverable).
export const DIGEST_TARGET = 20;          // soft target — never padded to
export const DIGEST_THIN = 5;             // fewer than this after free widening = thin, not presented as a digest
export const DIGEST_CARRY_RUNS = 3;       // an unused record is offered for up to 3 further runs (guided regenerates count)
export const DIGEST_PERIOD_DAYS = 7;

// The digest period is the trailing 7 days ending today, matching the 7-day free news search. (The hub checklist's
// Saturday-start week made a Sunday-night run treat only Saturday + Sunday as "this period".)
export function digestPeriod(now = Date.now()) {
  const end = new Date(now); end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - (DIGEST_PERIOD_DAYS - 1) * 864e5);
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
}
export function recordInPeriod(date, { periodStart, periodEnd }) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(date || ''))) return false;
  const day = String(date).slice(0, 10);
  return Number.isFinite(Date.parse(day + 'T00:00:00Z')) && day >= periodStart && day <= periodEnd;
}
// Recompute every record's current-period flag against the CURRENT run (records are additive, so a flag set when an
// item was first saved goes stale). Never removes records.
export function refreshPeriodFlags(items, period) {
  return (items || []).map(x => ({ ...x, inPeriod: recordInPeriod(x.date, period) }));
}

// Item ids used by a generated (done) child, per level.
export function usedIds(children = {}) {
  const used = new Set();
  for (const c of [...(children.premium || []), ...(children.free || [])]) if (c && c.state === 'done') for (const id of c.items || []) used.add(id);
  for (const c of children.news || []) if (c && c.state === 'done' && c.itemId) used.add(c.itemId);
  return used;
}
export function recordState(item, used) {
  if (item.retired) return 'retired';
  if (used.has(item.id)) return 'used';
  if (item.expired) return 'expired';
  return 'unused';
}
// Once per run (idempotent by runId): every unused record that existed before this run is carried forward one run;
// past DIGEST_CARRY_RUNS it expires. Records added by this run are not advanced.
export function advanceCarry(d, runId, addedIds = new Set()) {
  const advanced = Array.isArray(d.advancedRuns) ? d.advancedRuns : [];
  if (advanced.includes(runId)) return { ...d, advancedRuns: advanced };
  const used = usedIds(d.children);
  const items = (d.items || []).map(x => {
    if (addedIds.has(x.id) || recordState(x, used) !== 'unused') return x;
    const carriedRuns = (x.carriedRuns || 0) + 1;
    return carriedRuns > DIGEST_CARRY_RUNS ? { ...x, carriedRuns, expired: true, expiredRun: runId } : { ...x, carriedRuns, lastCarriedRun: runId };
  });
  return { ...d, items, advancedRuns: [...advanced, runId].slice(-30) };
}

const STOP = new Set(['about', 'after', 'also', 'and', 'any', 'are', 'from', 'have', 'into', 'more', 'most', 'news', 'only', 'other', 'over', 'such', 'than', 'that', 'their', 'them', 'they', 'this', 'those', 'what', 'when', 'where', 'which', 'while', 'with', 'week', 'weekly', 'your', 'reader', 'readers', 'signals', 'sources', 'source', 'questions', 'focus', 'research', 'preferences', 'including', 'changes', 'change', 'new', 'latest']);
export function scopeTokens(text) {
  return new Set(String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !STOP.has(w)));
}
// Mechanical relevance (no model): the record's text must touch the title anchor (title, product, topic keywords) once,
// or the Research Focus at least twice.
export function relevantToScope(item, anchorTokens, focusTokens) {
  const t = scopeTokens([item.claim, item.title, item.summary, item.publisher].filter(Boolean).join(' '));
  let a = 0, f = 0; t.forEach(w => { if (anchorTokens.has(w)) a++; if (focusTokens.has(w)) f++; });
  return a >= 1 || f >= 2;
}

const SERVICE = new Set(['near', 'me', 'my', 'consultant', 'consultants', 'consulting', 'consultation', 'advisor', 'advisors', 'adviser', 'advisers', 'agent', 'agents', 'service', 'services', 'company', 'companies', 'coach', 'coaching', 'coaches', 'expert', 'experts', 'help', 'hire', 'hiring', 'best', 'top', 'cheap', 'affordable', 'local', 'independent', 'professional', 'how', 'to', 'what', 'is', 'the', 'a', 'an', 'for', 'and', '&', 'of', 'in', 'on', 'with', 'your', 'get', 'find', 'vs']);
function phrase(raw, maxWords) {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9&\s-]/g, ' ').split(/\s+/).filter(w => w && w !== '-' && !SERVICE.has(w)).slice(0, maxWords).join(' ').trim();
}
// Core queries: EVERY title keyword searched on its own (service words stripped), exact duplicates removed.
export function coreQueries(keywords, max = 12) {
  const out = [];
  for (const k of keywords || []) { const q = phrase(k, 4); if (q.length > 2 && !out.includes(q)) out.push(q); if (out.length >= max) break; }
  return out;
}
// Widening queries from the newsletter's Research Focus (+ operator guidance on a guided regenerate): its listed signals,
// split into short phrases. Labels such as "Weekly signals:" are dropped. Nothing is invented — only the operator's words.
export function focusQueries(texts, exclude = [], max = 8) {
  const skip = new Set((exclude || []).map(x => String(x).toLowerCase())), out = [];
  for (const text of texts || []) {
    const parts = String(text || '').replace(/^[^\n:]{0,40}:/gm, '\n').split(/[\n;,•·]|\s-\s|\.\s/);
    for (const part of parts) {
      const q = phrase(part.replace(/\([^)]*\)/g, ' '), 5);
      if (q.split(' ').length < 1 || q.length < 4 || skip.has(q) || out.includes(q)) continue;
      out.push(q); if (out.length >= max) return out;
    }
  }
  return out;
}
// Free-search relevance: the query's words must appear TOGETHER (at most one other word between them) in the headline or
// summary — "house sitting" must not match "back in house for the legislature sitting". Light stemming for plurals.
const QSTOP = new Set(['the', 'a', 'an', 'of', 'and', 'for', 'in', 'on', 'to', 'at', 'by', 'or']);
const qwords = t => String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
const stem = w => w.length > 4 ? w.replace(/(ies|es|s|ing|ed)$/, '').slice(0, 7) : w;
export function phraseHit(query, text) {
  const q = [...new Set(qwords(query).filter(w => !QSTOP.has(w)).map(stem))]; if (!q.length) return false;
  const t = qwords(text).map(stem);
  if (q.length === 1) return t.includes(q[0]);
  for (let i = 0; i < t.length; i++) {
    if (!q.includes(t[i])) continue;
    const seen = new Set(); for (let j = i; j < Math.min(t.length, i + q.length + 1); j++) if (q.includes(t[j])) seen.add(t[j]);
    if (seen.size === q.length) return true;
  }
  return false;
}
// Source tier rank for curation ordering: primary first. Premium value = curation + sourcing first, analysis second.
export function tierRank(item) {
  const t = String(item.tier || '').toLowerCase();
  if (t === '1' || t === 'primary' || /^(federal-register|pubmed)$/.test(item.sourceMethod || '')) return 1;
  if (t === '2') return 2;
  if (t === '3') return 3;
  return 4;   // free-news headlines and unknown
}
export function byTier(items) {
  return [...(items || [])].sort((a, b) => tierRank(a) - tierRank(b) || String(b.date || '').localeCompare(String(a.date || '')));
}
