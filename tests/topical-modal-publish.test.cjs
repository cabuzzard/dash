const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const source = fs.readFileSync('worker/worker.js', 'utf8');
const block = source.slice(source.indexOf('// Explicit individual Publish-modal writes only.'), source.indexOf('// ⏱ queue'));
const aid = 'a'.repeat(32), tid = 'b'.repeat(32), cid = 'c'.repeat(32), pid = 'd'.repeat(32);
const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function fixture(type = 'Topical Post') {
  let interviews = [], prompts = [], created = 0, patches = [], published = 0, publishError = '', aiError = false, youtubeCalls = [];
  const page = { id: aid, properties: { 'Asset Type': { select: { name: type } }, 'Asset Title': { title: [{ plain_text: 'Example topic' }] },
    'Content Strategy': { relation: [{ id: tid }] }, Campaign: { relation: [{ id: cid }] }, Product: { relation: [{ id: pid }] } } };
  const table = { rows: [
    { cells: { cname01: 'Topical - SEO Post', cmatch01: 'Topical Post; Blog Article' } },
    { cells: { cname01: 'Topical - YouTube', cmatch01: 'Youtube Long Form QA; YouTube Longform' } },
    { cells: { cname01: 'Sales - Offer', cmatch01: 'Offer – Content Hub' } }
  ] };
  const context = vm.createContext({ console, Symbol, Date, JSON, ASSETS_DB: 'assets', LF_DEFAULT_VOICE: 'voice',
    hubRichText:r=>(r||[]).map(x=>x.plain_text??x.text?.content??'').join(''),offerBlogBlocks:async()=>[], NOTION_TOKEN: '', ivNorm: norm, ivHdr: () => ({ Authorization: 'Bearer ' + context.NOTION_TOKEN }), ivDash: value => value, ivRid: (p, k) => p[k]?.relation?.[0]?.id || '',
    ivRt: text => [{ text: { content: String(text) } }], lfReadRich: p => (p?.rich_text || []).map(t => t.plain_text ?? t.text.content).join(''),
    ivPage: async () => { assert.equal(context.NOTION_TOKEN, 'test-notion-token', 'cold scheduled writes initialize credentials before any Notion read'); return structuredClone(page); }, ivForTitle: async () => structuredClone(interviews),
    ivFormatAnswers: (qs, answers) => qs.map((q, i) => `Q: ${q}\nA: ${answers[i]}`).join('\n'),
    ivCreateForAsset: async () => { created++; return { interviews: [{ id: 'interview' }] }; },
    voiceBlock: async () => 'VOICE_SENTINEL', hubAudienceBlock: async () => 'AUDIENCE_SENTINEL', ivProdResearch: async () => 'PRODUCT_SENTINEL',
    titleResearchBlock: async () => 'TITLE_RESEARCH_SENTINEL', extractPillarContent: async () => 'PILLAR_SENTINEL',
    topicalMdBlocks: text => [{ type: 'paragraph', paragraph: { rich_text: [{ text: { content: text } }] } }],
    publishSeoPostToLiveSite: async () => { published++; if (publishError) return { published: false, error: publishError }; return { published: true, liveUrl: 'https://example.test/blog/article/' }; },
    governingFlow: async () => ({ graph: {}, digest: {} }),
    stampPublishingDate: async () => {}, selfAction: async (env, action, fields) => { youtubeCalls.push(fields); published++; return { error: 'Render the episode first' }; },
    fetch: async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : {};
      if (url.includes('anthropic.com')) {
        prompts.push(body.messages[0].content);
        if (aiError) return { ok: false, json: async () => ({ error: { message: 'AI failed' } }) };
        const content = type.includes('YouTube') || type.includes('Youtube')
          ? [{ type: 'tool_use', input: { title: 'Example', description: 'Description', segments: [{ kind: 'hook', text: 'Hook' }, { kind: 'item', name: 'Section', text: 'Useful content' }, { kind: 'outro', text: 'Next step' }] } }]
          : [{ type: 'text', text: '# Example\n\nUseful opening.\n\n## Details\n\n'+('Useful researched detail. '.repeat(110))+'\n\n## Practice\n\n'+('Specific grounded example. '.repeat(110)) }];
        return { ok: true, json: async () => ({ content }) };
      }
      if (options.method === 'PATCH' && url.includes('/pages/')) {
        patches.push(body.properties); Object.assign(page.properties, body.properties);
        return { ok: true, json: async () => ({ id: aid }) };
      }
      return { ok: true, json: async () => ({ results: [], id: aid }) };
    }
  });
  // Test the real Current Methods exact-match resolver as well as the writers.
  const resolver = source.slice(source.indexOf('async function ivCreationTopicalMethod('), source.indexOf('\nconst ivTypeMatch'));
  vm.runInContext(resolver + '\n' + block, context);
  const env = { NOTION_TOKEN: ' test-notion-token\n', ANTHROPIC_API_KEY: 'test', TRADES: { get: async key => key.includes('currentmethods') ? table : null, put: async () => {} } };
  return { context, env, page, prompts, patches, youtubeCalls, setInterviews: values => { interviews = values; }, setPublishError: value => { publishError = value; },
    setAiError: () => { aiError = true; }, counts: () => ({ created, published }) };
}
const finished = (assetId = aid) => ({ id: 'interview', scope: 'Asset', assetIds: [assetId], forType: 'Topical Post', status: 'Finished', qs: ['Question?'], answers: ['OWN_ANSWER_SENTINEL'] });
(async () => {
  for (const type of ['Offer – Content Hub', 'Blog - SEO - News', 'Sales - SEO Post', 'Carousel']) {
    const f = fixture(type);
    assert.equal((await f.context.topicalPublishState(f.env, aid)).eligible, false);
    assert.match((await f.context.writePublishTopicalFromModal(f.env, aid, true)).error, /Only topical/);
    assert.equal(f.patches.length, 0);
  }
  const gate = fixture();
  gate.page.properties['Written Without Interview'] = { checkbox: true };
  assert.equal((await gate.context.writeTopicalPost(gate.env, aid, { skipInterview: true })).needsInterview, true, 'JSON-like options alone cannot bypass');
  assert.equal(gate.prompts.length, 0);
  assert.equal(gate.counts().created, 1);
  gate.setInterviews([finished('e'.repeat(32))]);
  assert.equal((await gate.context.topicalPublishState(gate.env, aid)).hasFinishedInterview, false, 'another asset interview is not this asset interview');

  const f = fixture();
  const result = await f.context.writePublishTopicalFromModal(f.env, aid, true);
  assert.equal(result.written.ok, true); assert.equal(result.published.published, true);
  assert.equal(f.page.properties['Content URL'].url,result.published.liveUrl,'a deployed blog must record its nonempty Content URL');
  assert.equal(f.page.properties['Written Without Interview'].checkbox, true);
  assert.equal(f.counts().created, 0, 'skip write does not create/finish/cancel an interview');
  for (const sentinel of ['VOICE', 'AUDIENCE', 'PRODUCT', 'TITLE_RESEARCH', 'PILLAR']) assert.ok(f.prompts[0].includes(sentinel + '_SENTINEL'));
  assert.ok(!f.prompts[0].includes('THE OPERATOR\'S FINISHED INTERVIEW ANSWERS'));
  assert.equal((await f.context.writeTopicalPost(f.env, aid)).needsInterview, true, 'normal/queued writes still wait after an explicit bypass');
  assert.equal(f.prompts.length, 1);
  f.setInterviews([finished()]);
  const rewrite = await f.context.writeTopicalPost(f.env, aid);
  assert.equal(rewrite.ok, true); assert.ok(f.prompts[1].includes('OWN_ANSWER_SENTINEL'));
  assert.equal(f.page.properties['Written Without Interview'].checkbox, false, 'finished-interview rewrite clears persistent marker');

  const failedPublish = fixture(); failedPublish.setPublishError('Blog unavailable');
  const failed = await failedPublish.context.writePublishTopicalFromModal(failedPublish.env, aid, true);
  assert.equal(failed.written.ok, true); assert.equal(failed.published.error, 'Blog unavailable');
  assert.equal(failedPublish.page.properties['Written Without Interview'].checkbox, true);
  failedPublish.setPublishError(''); await failedPublish.context.publishTopicalAsset(failedPublish.env, aid);
  assert.equal(failedPublish.prompts.length, 1, 'retry publishes saved writing without another generation');
  const aiFailure = fixture(); aiFailure.setAiError();
  const noWrite = await aiFailure.context.writePublishTopicalFromModal(aiFailure.env, aid, true);
  assert.equal(noWrite.published.skipped, true); assert.equal(aiFailure.counts().published, 0);

  const yt = fixture('Youtube Long Form QA'); yt.page.properties['Video URL'] = { url: 'https://example.test/old.mp4' };
  const video = await yt.context.writePublishTopicalFromModal(yt.env, aid, true);
  assert.equal(video.written.ok, true); assert.match(video.published.error, /Render/);
  assert.equal(yt.page.properties['Video URL'].url, null, 'never publish an old render after writing a new script');
  assert.equal(yt.page.properties['Written Without Interview'].checkbox, true);
  assert.equal(JSON.parse(yt.page.properties['Video Spec'].rich_text[0].text.content).interview.length, 0);
  assert.equal(yt.youtubeCalls[0].privacy, 'private');
  await yt.context.publishTopicalAsset(yt.env, aid, { privacy: 'unlisted', publishAt: '2026-10-25T12:00:00Z' });
  assert.equal(yt.youtubeCalls[1].privacy, 'unlisted');
  assert.equal(yt.youtubeCalls[1].publishAt, '2026-10-25T12:00:00Z');

  // Exercise the actual cron loop against a previously bypassed but still unanswered asset.
  const queueCode = source.slice(source.indexOf('async function topicalCronTick('), source.indexOf('async function hubAudienceBlock('));
  vm.runInContext(queueCode, gate.context);
  let queue = [aid]; const cronEnv = { ...gate.env, TRADES: { ...gate.env.TRADES, get: async (key, format) => key === 'topical:queue' ? queue : gate.env.TRADES.get(key, format), put: async (key, value) => { if (key === 'topical:queue') queue = JSON.parse(value); } } };
  gate.context.NOTION_TOKEN = ''; // scheduled isolates may never have served an authenticated HTTP request
  const cron = await gate.context.topicalCronTick(cronEnv);
  assert.equal(cron.wrote, 0); assert.equal(queue.length, 1); assert.equal(gate.prompts.length, 0);
  assert.equal(gate.context.NOTION_TOKEN, 'test-notion-token');
  assert.doesNotMatch(source, /!body\.skipInterview/, 'bulk generation cannot consume a modal bypass flag');

  // Finished asset interviews continue to drive the existing regenerate/review machinery, not title pillar changes.
  const downstream = source.slice(source.indexOf('async function ivMarkDownstream('), source.indexOf('async function ivSyncFlags('));
  const updates = [], dc = vm.createContext({ ivHdr: () => ({}), ivDash: x => x, ASSETS_DB: 'assets', CONTENT_STRATEGY_DB: 'titles',
    ivRid: (p, k) => p[k]?.relation?.[0]?.id || '', ivTypeMatch: (a, b) => norm(a) === norm(b),
    ivTierFn: async () => () => 'short',
    notionQuery: async (db, query) => query?.filter?.property === 'Parent Asset' ? [] : db === 'titles' ? [{ id: tid }] : [{ id: aid, properties: { 'Asset Type': { select: { name: 'Topical Post' } } } }],
    fetch: async (url, options) => { updates.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ id: aid }) }; }, extractPillarContent: async () => 'pillar' });
  vm.runInContext(downstream, dc); await dc.ivMarkDownstream({}, { ...finished(), titleId: tid });
  assert.ok(updates.some(p => p.properties?.['Interview Sync']?.select?.name === 'Out of Sync · Regenerate'));
  assert.ok(updates.every(p => !p.properties?.['Pillar Status'] && !p.properties?.['Written Without Interview']));
  console.log('PASS: explicit-only modal bypass, grounding, durable rewrite lifecycle, publish retry, queue gates, YouTube and downstream surfacing');
})().catch(error => { console.error(error); process.exitCode = 1; });
