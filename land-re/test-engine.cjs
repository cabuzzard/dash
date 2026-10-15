const assert=require('node:assert/strict'),e=require('./engine.js');
let tests=0;function test(name,f){f();tests++;console.log('PASS',name)}
const x={acres:20,purchase:200000,lots:10,lotAcres:1.5,exit:70000,roads:80000,water:50000,electric:20000,engineering:20000,permits:10000,site:20000,holding:18000,finance:25000,years:2,saleRate:.06,contingency:.15,profitRate:.2,reserve:25000};
test('Residual reconciles all costs and required margin',()=>{const v=e.valueLand(x);assert.equal(v.max,220000);assert.equal(v.net,160000);assert.equal(v.target,198000);assert.equal(v.gross,700000);assert.equal(v.total,540000)});
test('Break-even sale price nets exactly zero',()=>{const v=e.valueLand(x);assert.ok(Math.abs(e.valueLand({...x,exit:v.breakeven}).net)<1e-8)});
test('Invalid density rejected',()=>assert.throws(()=>e.valueLand({...x,lots:20})));
test('Zero hold and invalid rate rejected',()=>{assert.throws(()=>e.valueLand({...x,years:0}));assert.throws(()=>e.valueLand({...x,saleRate:1}));assert.throws(()=>e.valueLand({...x,purchase:NaN}))});
test('Quoted CSV and escaped quotes',()=>assert.equal(e.parseCSV('a,b\r\n"x,y","z""q"')[0].b,'z"q'));
test('Duplicate transactions removed and impossible dates rejected',()=>{const r={property_id:'p1',geoid:'48423',lot_acres:'1.5',sale_price:'350000',closed_date:'2024-06-01',property_type:'single_family',source:'test fixture'};const n=e.normalizeSales([r,r,{...r,closed_date:'2024-02-31'}]);assert.equal(n.valid.length,1);assert.equal(n.errors.length,1)});
test('Matching excludes other property types and future sales',()=>{const r={geoid:'48423',lot_acres:1.5,sale_price:350000,closed_date:'2024-06-01',property_type:'single_family'};const a=e.matchSales([r,{...r,property_type:'raw_land'},{...r,closed_date:'2026-01-01'}],{geoid:'48423',type:'single_family',asof:'2024-12-31'});assert.equal(a.rows.length,1);assert.equal(a.sufficient,false)});
test('Narrow matching expands only when sample inadequate',()=>{const r={geoid:'48423',lot_acres:1.5,sale_price:300000,closed_date:'2024-06-01',property_type:'single_family'};const a=e.matchSales(Array.from({length:8},()=>r).concat([{...r,lot_acres:1.9}]),{geoid:'48423',type:'single_family',asof:'2024-12-31'});assert.equal(a.tolerance,.15);assert.equal(a.rows.length,8)});
test('Missing indicators reduce coverage, no invented score',()=>{const s=e.score({population:[],zhvi:[],net_migration:[]});assert.equal(s.score,null);assert.equal(s.coverage,0)});
test('Median ignores missing values',()=>assert.equal(e.median([null,NaN,2,4]),3));
test('Acreage segmentation boundaries never overlap',()=>{const a=e.segments([.5,1,2,5,10].map(lot_acres=>({lot_acres,sale_price:100})));assert.deepEqual(a.map(s=>s.count),[0,1,1,1,1,1])});
test('Conservative scenario compounding',()=>assert.equal(e.scenarios(100,{base:10})[1].base,100*Math.pow(1.1,3)));
console.log(tests+' tests passed. All transactions used above are synthetic test fixtures.');

