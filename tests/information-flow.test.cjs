const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate,pack,unpack,seed,arrange}=require('../shared/information-flow.js');
test('Methods hierarchy becomes editable graph without changing source',()=>{
 const t={rows:[{id:'parent',cells:{cmuzq03ywty8b:'Blog',cname01:'Blog parent',civtier01:'From product'}},{id:'child',cells:{cmuzq03ywty8b:'Blog',cmuzq36hb77sq:'Sales',cname01:'Blog Offer Sales',civtier01:'Own interview'}}]};
 const before=JSON.stringify(t),g=seed(t);assert.equal(JSON.stringify(t),before);assert.equal(g.nodes.find(n=>n.id==='m-child').interview,'Own interview');assert(g.edges.some(e=>e.source==='m-parent'&&e.target==='m-child'&&e.kind==='requires written parent'));assert.deepEqual(validate(g),[]);
 assert.deepEqual(unpack(pack(g)),{...g,nodes:g.nodes.map(n=>({...n,notes:n.notes||'',method:n.method||''}))});
});
test('Reject cycles, duplicate edges, missing endpoints and invalid input',()=>{
 let g=seed();g.edges.push({id:'cycle',source:'pillar',target:'topic',kind:'feeds'});assert(validate(g).some(s=>/Circular/.test(s)));
 g=seed();g.edges.push({...g.edges[0],id:'duplicate'});assert(validate(g).some(s=>/Duplicate connection/.test(s)));
 g=seed();g.edges[0].target='missing';assert(validate(g).some(s=>/missing endpoint/.test(s)));
 g=seed();g.nodes[0].label='';assert(validate(g).some(s=>/name/.test(s)));
 g=seed();g.nodes[0].notes='x'.repeat(4001);assert(validate(g).some(s=>/4000/.test(s)));
});
test('Recognize empty server default as uninitialized, preserve valid empty graph',()=>{
 assert.equal(unpack({columns:[{id:'c1'}],rows:[]}),null);assert.deepEqual(unpack(pack({nodes:[],edges:[]})),{version:1,nodes:[],edges:[]});
});
test('Flowchart arrangement preserves definitions and pinned network positions',()=>{
 const g=seed();g.nodes[0].network={x:0,y:24,z:-35};const original=JSON.stringify(g),next=arrange(g);
 assert.equal(JSON.stringify(g),original);assert.deepEqual(next.nodes[0].network,g.nodes[0].network);
 for(const e of next.edges)assert(next.nodes.find(n=>n.id===e.source).x<next.nodes.find(n=>n.id===e.target).x);
 assert.deepEqual(validate(next),[]);assert.deepEqual(unpack(pack(next)).nodes[0].network,{x:0,y:24,z:-35});
 next.nodes[0].network.z=Infinity;assert(validate(next).some(s=>/network position/.test(s)));
});
test('Decisions and switches support multiple described, custom-labeled branches',()=>{
 const g=seed();g.nodes.push({id:'decision',label:'Interview complete?',role:'decision',interview:'None',x:100,y:500});g.nodes.push({id:'switch',label:'Choose format',role:'switch',interview:'None',x:100,y:700});
 g.edges.push({id:'yes',source:'decision',target:'switch',kind:'routes to',condition:'Yes',description:'Reuse completed answers.'},{id:'no',source:'decision',target:'switch',kind:'routes to',condition:'No',description:'Request missing answers first.'},{id:'custom',source:'switch',target:'pillar',kind:'writes an SEO draft',condition:'SEO',description:'Use the selected title research.'});
 assert.deepEqual(validate(g),[]);assert.deepEqual(unpack(pack(g)).edges,g.edges);
 g.edges.push({...g.edges.at(-2),id:'dupe'});assert(validate(g).length>0);
});
test('Connection validation rejects oversized descriptions and edge IDs as endpoints',()=>{
 const g=seed();g.edges[0].description='x'.repeat(4001);assert(validate(g).some(s=>/descriptions/.test(s)));delete g.edges[0].description;
 g.edges[1].target=g.edges[0].id;assert(validate(g).some(s=>/missing endpoint/.test(s)));
});
test('Custom role definitions persist even when unused and old drafts remain valid',()=>{
 const g=seed();g.roles=[{id:'role-approval',name:'Approval gate',description:'An operator reviews the draft.',color:'#38bdf8'}];g.nodes[0].role='Approval gate';
 assert.deepEqual(validate(g),[]);const restored=unpack(pack(g));assert.deepEqual(restored.roles,g.roles);assert.equal(restored.nodes[0].role,'Approval gate');
 g.nodes[0].role='topic';assert.deepEqual(unpack(pack(g)).roles,g.roles);
 assert.deepEqual(validate(seed()),[]);
 g.roles.push({id:'role-dupe',name:'APPROVAL GATE',description:'',color:'#ffffff'});assert(validate(g).some(s=>/unique/.test(s)));
 g.roles.pop();g.roles[0].name='parent';assert(validate(g).some(s=>/unique/.test(s)));
});
test('Sync links allow bidirectional feedback without weakening dependency validation',()=>{
 const g=seed();g.edges.push({id:'sync',source:'pillar',target:'topic',kind:'syncs with',description:'Refresh either side when the other changes.'});
 assert.deepEqual(validate(g),[]);assert.deepEqual(unpack(pack(g)).edges,g.edges);assert.deepEqual(validate(arrange(g)),[]);
 const arranged=arrange(g);assert(arranged.nodes.find(n=>n.id==='pillar').x>arranged.nodes.find(n=>n.id==='topic').x);
 g.edges.push({id:'reverse-sync',source:'topic',target:'pillar',kind:'Syncs with'});assert(validate(g).some(s=>/Duplicate/.test(s)));g.edges.pop();
 g.edges.push({id:'dependency-cycle',source:'pillar',target:'topic',kind:'feeds'});assert(validate(g).some(s=>/Circular dependency/.test(s)));
 g.edges.pop();g.edges.at(-1).target='pillar';assert(validate(g).some(s=>/itself/.test(s)));
});
test('Generic node and record roles support information holders and existing custom definitions',()=>{
 const g=seed();g.nodes[0].role='node';g.nodes[1].role='record';g.roles=[{id:'existing-node-role',name:'node',description:'Information holder',color:'#94a3b8'}];
 assert.deepEqual(validate(g),[]);assert.deepEqual(unpack(pack(g)).roles,g.roles);
 assert.equal(unpack(pack(g)).nodes[1].role,'record');
 g.roles.push({...g.roles[0],id:'another-node-role'});assert(validate(g).some(s=>/unique/.test(s)));
});
test('Layers persist independently of roles and remain reusable when unassigned',()=>{
 const g=seed();g.layers=[{id:'layer-foundation',name:'Foundation'},{id:'layer-output',name:'Output'}];g.nodes[0].layer='Foundation';g.nodes[1].layer='Output';
 assert.deepEqual(validate(g),[]);const restored=unpack(pack(g));assert.deepEqual(restored.layers,g.layers);assert.equal(restored.nodes[0].layer,'Foundation');assert.equal(restored.nodes[0].role,'topic');
 delete g.nodes[0].layer;delete g.nodes[1].layer;assert.deepEqual(unpack(pack(g)).layers,g.layers);
 g.layers.push({id:'layer-duplicate',name:'FOUNDATION'});assert(validate(g).some(s=>/Layer names must be unique/.test(s)));
});
