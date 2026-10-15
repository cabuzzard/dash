const assert=require('node:assert/strict'),e=require('./engine.js');let total=0;function test(name,f){f();console.log('PASS',name);total++}
function series(v,n=73){return Array.from({length:n},(_,i)=>{const d=new Date(Date.UTC(2020,i,28));return {date:d.toISOString().slice(0,10),value:typeof v==='function'?v(i):v}})}
function market(z){return {zhvi:z,population:[],net_migration:[],inventory:series(100),sales:series(100),pending:series(40)}}
test('Calendar alignment does not bridge missing months',()=>{const a=series(i=>100+i);assert.ok(e.calendarGrowth(a,a.at(-1).date)>0);const missing=a.filter((_,i)=>i!==60);assert.equal(e.calendarGrowth(missing,a.at(-1).date),null)});
test('Sales compare rolling same-season periods',()=>{const a=series(i=>i>=58?120:100);assert.equal(e.volumeGrowth(a,a.at(-1).date),0);const b=series(i=>i>=70?150:100);assert.equal(e.volumeGrowth(b,b.at(-1).date),50)});
test('Falling prices identify correction',()=>{const m=market(series(i=>300-i*2));assert.equal(e.cycleSignals(m).stage,'Correction')});
test('Appreciation alone does not identify emerging cycle',()=>{const m=market(series(i=>100*Math.pow(1.01,i)));assert.equal(e.cycleSignals(m).stage,'Expansion')});
test('Recovery requires positive acceleration after a drawdown',()=>{const m=market(series(i=>i<60?200-i:i<67?140-(i-60)*3:122+(i-67)*1.5));assert.equal(e.cycleSignals(m).stage,'Recovery')});
test('Emerging upswing requires corroboration',()=>{const z=series(i=>i<70?100:100+(i-69)*.4),m=market(z);m.inventory=series(i=>i>=70?90:100);assert.equal(e.cycleSignals(m).stage,'Emerging upswing');m.inventory=[];m.sales=[];m.pending=[];assert.equal(e.cycleSignals(m).stage,'Stabilizing / mixed')});
test('Missing demand/supply lowers evidence coverage',()=>{const m=market(series(i=>100+i*.2));m.sales=[];m.inventory=[];assert.equal(e.cycleSignals(m).coverage,.5)});
test('Historical classification excludes future price spike',()=>{const a=market(series(i=>100+i*.2)),b=market(series(i=>i>60?1000:100+i*.2));const date=a.zhvi[60].date;assert.equal(e.cycleSignals(a,date).annual,e.cycleSignals(b,date).annual);assert.equal(e.cycleSignals(a,date).drawdown,e.cycleSignals(b,date).drawdown)});
test('Stale supply is not silently aligned with new price month',()=>{const m=market(series(i=>100+i*.2));m.inventory=m.inventory.slice(0,-1);assert.equal(e.cycleSignals(m).inventoryGrowth,null)});
test('Historical peak remains consistent with compact scan',()=>{const m=market(series(i=>100+i*.2));m.price_peak=200;assert.equal(e.cycleSignals(m).drawdown,(m.zhvi.at(-1).value/200-1)*100)});
test('Dataset has US, 50 states/DC and broad metro coverage',()=>{const d=require('./markets.json');assert.equal(d.markets.filter(m=>m.level==='national').length,1);assert.equal(d.markets.filter(m=>m.level==='state').length,51);assert.ok(d.markets.filter(m=>m.level==='metro').length>800);assert.ok(new Set(d.markets.filter(m=>m.level==='metro').map(m=>m.state)).size>=50);assert.ok(d.sources.every(s=>s.status==='ok'));assert.equal(new Set(d.markets.map(m=>m.geoid)).size,d.markets.length)});
console.log(total+' nationwide cycle tests passed. All constructed time series are synthetic test fixtures.');

