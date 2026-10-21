// Hub keyword reorganizer — the ONE set of rules for re-shaping a hub's keyword groups, used by BOTH the dash
// Keywords tab (instant draft preview) and the worker (kwHubApply, the real write), so the preview can never
// disagree with what gets saved. Pure data, no DOM / network. Loaded as a classic <script> in the browser
// (window.KwHubOps, served by GitHub Pages) and uploaded with the worker as an extra module (worker.js:
// import "./kw-hub-ops.mjs" → globalThis.KwHubOps; wrangler.toml find_additional_modules). Keep it dependency-free.
//
// model = {
//   main:     ["kw", …],                                    // the hub's Main Keywords (Research "Keywords")
//   topics:   [{ id, name, keywords: ["kw", …], committed, cluster }],   // id NEVER changes; cluster = a cluster name or ""
//   clusters: ["name", …],                                  // a cluster groups topics (KV seotopicclusters)
//   products: [{ id, name, topicId }],                      // the topic each product is attached to ("" = Master)
// }
// Keywords are compared normalised (lower case, single spaces).
//
// ops (applied in order):
// Main Keywords act as one more topic, id "__main" (shown as the ★ Main cluster/topic): a target for assign,
// a source for unassign, and "move" / "from all" include it.
//   { op: "assign",   keywords, to: topicId, move }          add to a topic; move = also take them out of every other topic (and Main)
//   { op: "newTopics", keywords, mode: "one"|"each", ids: [..], name?, cluster?, move }
//                                                            one new topic for all of them, or one per keyword (ids are
//                                                            made by the caller so preview and save agree)
//   { op: "unassign", keywords, from: topicId | "*" }        take out of one topic, or every topic
//   { op: "main",     keywords, add }                        add to / remove from Main Keywords
//   { op: "rename",   id, name }                             rename a topic (same id — attachments stay)
//   { op: "merge",    from, into }                           move every keyword of `from` into `into`; products follow;
//                                                            `from` is left empty and is removed as an orphan
//   { op: "setCluster", ids: [topicId…], cluster }           file topics under a cluster ("" = none; new name = new cluster)
//   { op: "renameCluster", from, to }
//   { op: "removeCluster", name }                            drop a cluster; its topics become unclustered
//
// After the ops: topics with no keywords, and clusters the ops left with no topics, are ORPHANS and are removed.
// apply() returns { model, fx } — fx describes what changed (for the preview text and for the worker's writes).
(function (root) {
  const norm = s => String(s || "").toLowerCase().split(/\s+/).filter(Boolean).join(" ");
  const MAIN = "__main";
  const uniq = a => [...new Set(a)];
  const clone = m => ({
    main: [...(m.main || [])],
    topics: (m.topics || []).map(t => ({ ...t, keywords: [...(t.keywords || [])] })),
    clusters: [...(m.clusters || [])],
    products: (m.products || []).map(p => ({ ...p })),
  });

  function apply(model, ops) {
    const before = clone(model), m = clone(model);
    const byId = id => m.topics.find(t => t.id === id);
    const merged = [], repoint = {}, clusterRenamed = {}, dropped = [];
    for (const o of ops || []) {
      const kws = uniq((o.keywords || []).map(norm).filter(Boolean)), set = new Set(kws);
      const strip = (except) => { m.topics.forEach(t => { if (t.id !== except) t.keywords = t.keywords.filter(k => !set.has(k)); });
        if (except !== MAIN) m.main = m.main.filter(k => !set.has(k)); };
      if (o.op === "assign" && o.to === MAIN) { if (o.move) strip(MAIN); m.main = uniq([...m.main, ...kws]); }
      else if (o.op === "assign") {
        const t = byId(o.to); if (!t) continue;
        if (o.move) strip(t.id);
        t.keywords = uniq([...t.keywords, ...kws]);
      } else if (o.op === "newTopics") {
        const ids = o.ids || [];
        const made = o.mode === "each"
          ? kws.map((k, i) => ({ id: ids[i], name: k, keywords: [k] }))
          : [{ id: ids[0], name: String(o.name || kws[0] || "").trim(), keywords: kws }];
        if (o.move) strip(null);
        for (const t of made) {
          if (!t.id || byId(t.id) || !t.name) continue;
          // explode never duplicates a topic that already exists under that name — the keyword joins it instead
          const same = o.mode === "each" && m.topics.find(x => norm(x.name) === norm(t.name));
          if (same) { same.keywords = uniq([...same.keywords, ...t.keywords]); continue; }
          m.topics.push({ id: t.id, name: t.name, keywords: t.keywords, committed: false, cluster: String(o.cluster || "") });
        }
        if (o.cluster && !m.clusters.includes(o.cluster)) m.clusters.push(o.cluster);
      } else if (o.op === "unassign") {
        if (o.from === "*") strip(null);
        else if (o.from === MAIN) m.main = m.main.filter(k => !set.has(k));
        else { const t = byId(o.from); if (t) t.keywords = t.keywords.filter(k => !set.has(k)); }
      } else if (o.op === "main") {
        m.main = o.add ? uniq([...m.main, ...kws]) : m.main.filter(k => !set.has(k));
      } else if (o.op === "rename") {
        const t = byId(o.id), name = String(o.name || "").trim(); if (t && name) t.name = name;
      } else if (o.op === "merge") {
        const a = byId(o.from), b = byId(o.into); if (!a || !b || a === b) continue;
        b.keywords = uniq([...b.keywords, ...a.keywords]); a.keywords = [];
        merged.push({ from: a.id, into: b.id });
        m.products.forEach(p => { if (p.topicId === a.id) { p.topicId = b.id; repoint[p.id] = b.id; } });
        Object.keys(repoint).forEach(pid => { if (repoint[pid] === a.id) repoint[pid] = b.id; });   // chained merges
      } else if (o.op === "setCluster") {
        const c = String(o.cluster || "").trim();
        (o.ids || []).forEach(id => { const t = byId(id); if (t) t.cluster = c; });
        if (c && !m.clusters.includes(c)) m.clusters.push(c);
      } else if (o.op === "renameCluster") {
        const to = String(o.to || "").trim(); if (!to || !m.clusters.includes(o.from)) continue;
        if (m.clusters.includes(to)) m.clusters = m.clusters.filter(c => c !== o.from);    // renaming onto an existing cluster = merge
        else m.clusters = m.clusters.map(c => c === o.from ? to : c);
        m.topics.forEach(t => { if (t.cluster === o.from) t.cluster = to; });
        clusterRenamed[o.from] = to;
      } else if (o.op === "removeCluster") {   // drop a cluster outright — its topics become unclustered (nothing else changes)
        if (!m.clusters.includes(o.name)) continue;
        m.clusters = m.clusters.filter(c => c !== o.name); dropped.push(o.name);
        m.topics.forEach(t => { if (t.cluster === o.name) t.cluster = ""; });
      }
    }
    // orphans: empty topics, then clusters no topic uses
    const removed = m.topics.filter(t => !t.keywords.length).map(t => t.id);
    m.topics = m.topics.filter(t => t.keywords.length);
    // only a cluster THESE ops emptied is an orphan — a cluster that was already empty (just added, waiting for topics) stays
    const used = new Set(m.topics.map(t => t.cluster).filter(Boolean));
    const usedBefore = new Set(before.topics.map(t => t.cluster).filter(Boolean).map(c => clusterRenamed[c] || c));
    const clustersRemoved = [...dropped, ...m.clusters.filter(c => !used.has(c) && usedBefore.has(c))];
    m.clusters = m.clusters.filter(c => used.has(c) || !usedBefore.has(c));
    m.topics.forEach(t => { if (t.cluster && !m.clusters.includes(t.cluster)) t.cluster = ""; });

    // diff before → after (by id) — this, not the op list, is what gets written
    const was = Object.fromEntries(before.topics.map(t => [t.id, t]));
    const created = [], changed = [], renamed = {}, reclustered = [];
    for (const t of m.topics) {
      const o = was[t.id];
      if (!o) { created.push(t.id); continue; }
      const a = [...o.keywords].sort().join("\n"), b = [...t.keywords].sort().join("\n");
      if (a !== b || o.name !== t.name) changed.push(t.id);
      if (o.name !== t.name) renamed[t.id] = { from: o.name, to: t.name };
      if ((o.cluster || "") !== (t.cluster || "")) reclustered.push(t.id);
    }
    const mainChanged = [...before.main].sort().join("\n") !== [...m.main].sort().join("\n");
    // products whose keyword group changed (or vanished) → out of sync; they keep their own research until re-run
    const hit = new Set([...changed, ...removed, ...merged.map(x => x.from), ...merged.map(x => x.into)]);
    const outOfSync = m.products.filter(p => (p.topicId && hit.has(p.topicId)) || (!p.topicId && mainChanged) || repoint[p.id]).map(p => p.id);
    const fx = { created, changed, removed, renamed, reclustered, merged, repoint, clusterRenamed, clustersRemoved,
      clustersAdded: m.clusters.filter(c => !before.clusters.includes(c)), mainChanged,
      mainAdded: m.main.filter(k => !before.main.includes(k)), mainRemoved: before.main.filter(k => !m.main.includes(k)), outOfSync };
    fx.empty = !created.length && !changed.length && !removed.length && !reclustered.length && !mainChanged
      && !fx.clustersAdded.length && !clustersRemoved.length && !Object.keys(clusterRenamed).length;
    return { model: m, fx };
  }

  // One line per effect, for the draft bar / Apply confirmation.
  function describe(before, after, fx) {
    const nm = id => ((after.topics.find(t => t.id === id) || before.topics.find(t => t.id === id) || {}).name || id);
    const L = [];
    fx.created.forEach(id => L.push(`＋ new topic "${nm(id)}" (${(after.topics.find(t => t.id === id) || {}).keywords.length} kw)`));
    fx.changed.forEach(id => { const r = fx.renamed[id]; const a = before.topics.find(t => t.id === id), b = after.topics.find(t => t.id === id);
      const add = b.keywords.filter(k => !a.keywords.includes(k)).length, rem = a.keywords.filter(k => !b.keywords.includes(k)).length;
      L.push(`✎ "${r ? r.from + '" → "' + r.to : nm(id)}"${add || rem ? ` (+${add} −${rem} kw)` : ""}`); });
    fx.merged.forEach(x => L.push(`⇢ merge "${nm(x.from)}" into "${nm(x.into)}"`));
    fx.removed.filter(id => !fx.merged.some(x => x.from === id)).forEach(id => L.push(`🗑 empty topic removed: "${nm(id)}"`));
    fx.reclustered.forEach(id => L.push(`🧩 "${nm(id)}" → ${(after.topics.find(t => t.id === id) || {}).cluster || "no cluster"}`));
    Object.entries(fx.clusterRenamed).forEach(([a, b]) => L.push(`🧩 cluster "${a}" → "${b}"`));
    fx.clustersRemoved.forEach(c => L.push(`🗑 empty cluster removed: "${c}"`));
    if (fx.mainChanged) L.push(`★ Main Keywords +${fx.mainAdded.length} −${fx.mainRemoved.length}`);
    if (fx.outOfSync.length) L.push(`⚠ ${fx.outOfSync.length} product${fx.outOfSync.length === 1 ? "" : "s"} will be marked out of sync (re-run their research)`);
    return L;
  }

  root.KwHubOps = { apply, describe, norm, MAIN };
})(typeof globalThis !== "undefined" ? globalThis : this);
