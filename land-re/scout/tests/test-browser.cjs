const assert=require('node:assert/strict'),S=require('../../scout-core.js'),f=require('./browser-fixture.json');S.schema=require('../../controls.json');
let count=0;function test(n,fn){fn();console.log('PASS',n);count++}
test('Browser and Python residual formulas agree',()=>{const v=S.value(3,100000,f.profile,75000);for(const k of ['gross','development','holding','selling','required_profit','max_acquisition','total_cost','profit','roc','annualized','break_even_lot'])assert.ok(Math.abs(v[k]-f.valuation[k])<1e-8,k)});
test('Browser and Python staged qualification agree',()=>{const r=S.search([f.market],f.records,f.profile);assert.equal(r.opportunities.length,f.search.opportunities.length);assert.equal(r.opportunities.length,1);assert.equal(r.markets[0].homes.count,15);assert.equal(r.markets[0].lots.count,5)});
test('No property evidence never becomes a deal ranking',()=>assert.equal(S.search([f.market],[],f.profile).opportunities.length,0));
test('Unknown utility status blocks investment score',()=>{const rows=structuredClone(f.records);rows.at(-1).utilities=null;const r=S.search([f.market],rows,f.profile);assert.equal(r.opportunities.length,0);assert.equal(r.markets[0].candidates[0].investment_score,null)});
test('Listings and raw land cannot become finished-lot comps',()=>{const r={...f.records.find(r=>r.kind==='lots'),finished:false};assert.equal(S.normalize([r],'lots').valid.length,0);r.finished=true;r.status='active';assert.equal(S.normalize([r],'lots').valid.length,0)});
test('Calendar cutoff handles month-end and leap year',()=>assert.equal(S.cutoff('2024-03-31',1),'2024-02-29'));
test('Fractional acre slider values remain valid',()=>assert.equal(S.validate({...f.profile,min_acres:5.5}).min_acres,5.5));
test('Invalid profile cost, unknown fields and zero sample rejected',()=>{assert.throws(()=>S.validate({...f.profile,min_home_comps:0}));assert.throws(()=>S.validate({...f.profile,cost_per_lot:-1}));assert.throws(()=>S.validate({...f.profile,unknown:true}))});
test('Per-source duplicates do not inflate sample',()=>{const rows=structuredClone(f.records);rows.push({...rows[0],id:'duplicate-provider',source_url:'https://other.example.test'});assert.equal(S.comps(rows,f.market,f.profile,'homes').count,15)});
test('Same-date conflicting prices are excluded',()=>{const rows=structuredClone(f.records);rows.push({...rows[0],id:'conflict',sale_price:999999});assert.equal(S.comps(rows,f.market,f.profile,'homes').count,14)});
console.log(count+' browser-engine tests passed; all property records above are explicitly synthetic fixtures.');
