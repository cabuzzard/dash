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
