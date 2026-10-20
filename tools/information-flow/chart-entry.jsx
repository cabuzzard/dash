import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ReactFlow, Background, Controls, Handle, Position, applyNodeChanges} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
const colors={topic:'#60a5fa',product:'#34d399',title:'#c084fc',pillar:'#facc15',parent:'#fb923c',child:'#22d3ee',research:'#94a3b8',interview:'#f472b6'};
function Card({data}) {return <div style={{border:`1.5px solid ${colors[data.role]}`,borderRadius:10,padding:'10px 14px',width:210,background:'#142034',color:'#f8fafc',fontFamily:'Arial',boxSizing:'border-box'}}><Handle type="target" position={Position.Left}/><div style={{color:colors[data.role],fontSize:10,textTransform:'uppercase',marginBottom:5}}>{data.role}</div><div style={{fontSize:13,fontWeight:600,lineHeight:1.4,overflowWrap:'anywhere'}}>{data.label}</div><div style={{fontSize:10,color:'#b8c8db',marginTop:7}}>Interview: {data.interview}</div><Handle type="source" position={Position.Right}/></div>}
const nodeTypes={card:Card};
window.InformationFlowChart={mount(el,api){let publish=null,instance=null,pending=null;
 function Chart(){const [nodes,setNodes]=useState([]),[edges,setEdges]=useState([]);useEffect(()=>{publish=(g,selected)=>{setNodes(g.nodes.map(n=>({id:n.id,type:'card',data:{label:n.label,role:n.role,interview:n.interview},position:{x:n.x,y:n.y},selected:n.id===selected})));setEdges(g.edges.map(e=>({id:e.id,source:e.source,target:e.target,label:e.kind,type:'smoothstep',selected:e.id===selected,markerEnd:{type:'arrowclosed',color:e.id===selected?'#facc15':'#8295ad'},style:{stroke:e.id===selected?'#facc15':e.kind==='inherits interview'?'#f472b6':'#8295ad',strokeWidth:2},labelStyle:{fill:'#dce7f4',fontSize:11},labelBgStyle:{fill:'#101c2c'},labelBgPadding:[7,4],labelBgBorderRadius:4})));};if(pending)publish(...pending);return()=>{publish=null};},[]);
 return <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={changes=>setNodes(ns=>applyNodeChanges(changes,ns))} onNodeDragStop={(e,n)=>api.move(n.id,n.position)} onNodeClick={(e,n)=>api.select(n.id)} onEdgeClick={(e,e2)=>api.select(e2.id)} onPaneClick={()=>api.select(null)} onConnect={c=>api.connect(c.source,c.target)} onInit={i=>{instance=i;requestAnimationFrame(()=>i.fitView({padding:.15}));}} fitView minZoom={.1} maxZoom={2.5} nodesConnectable connectOnClick deleteKeyCode={null} colorMode="dark" proOptions={{hideAttribution:false}}><Background color="#30425b" gap={24}/><Controls showInteractive={false}/></ReactFlow>;
 }
 const root=createRoot(el);root.render(<Chart/>);
 return {update(g,s){pending=[g,s];publish?.(g,s)},fit(){instance?.fitView({padding:.15,duration:200})},zoom(k){if(instance)instance.zoomTo(instance.getZoom()/k,{duration:150})},destroy(){root.unmount()}};
}};
