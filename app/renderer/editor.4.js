function eraseAt(worldP){
  const radius=state.eraserRadius/state.camera.scale,newObjects=[];let changed=false;
  for(const o of state.objects){
    if(o.type!=='drawing'||o.locked){newObjects.push(o);continue}
    const pts=o.points;if(pts.length<2){newObjects.push(o);continue}
    const sampled=[];
    for(let i=0;i<pts.length-1;i++){
      const a=pts[i],b=pts[i+1],len=dist(a,b),steps=Math.max(1,Math.ceil(len/(radius*.45)));
      for(let s=0;s<steps;s++){const t=s/steps;sampled.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t})}
    }sampled.push(pts.at(-1));
    let current=[],parts=[],strokeChanged=false;
    const flush=()=>{if(current.length>=2)parts.push(current);current=[]};
    for(const p of sampled){
      if(dist(p,worldP)<=radius+(o.width||4)/2){flush();strokeChanged=true}else current.push(p)
    }flush();
    if(strokeChanged){
      changed=true;
      parts.forEach(part=>newObjects.push({...o,id:uid('d'),points:rdp(part,.55/state.camera.scale)}));
    }else newObjects.push(o);
  }
  if(changed){state.objects=newObjects;state.selection=state.selection.filter(id=>getObj(id));markDirty()}
  return changed;
}

/* Connectors */
function anchorAtScreen(x,y){
  const el=document.elementFromPoint(x,y)?.closest('.anchor');if(!el)return null;
  const parent=el.closest('.element');if(!parent)return null;return{id:parent.dataset.id,anchor:el.dataset.anchor}
}
function nearestAnchorOnObject(o,p){
  if(!o||!linkable(o))return null;
  const options=['n','e','s','w'].map(a=>({a,p:endpointPoint({id:o.id,anchor:a},p)}));
  options.sort((u,v)=>dist(u.p,p)-dist(v.p,p));return{id:o.id,anchor:options[0].a};
}
function completeConnectorDraft(x,y){
  if(!connectorDraft)return;
  if(Math.hypot(x-connectorDraft.startX,y-connectorDraft.startY)<7){
    connectorDraft=null;cancelGesture();markDirty();return;
  }
  const p=screenToWorld(x,y),targetAnchor=anchorAtScreen(x,y);
  let to=targetAnchor;
  if(!to){
    const targetNode=document.elementFromPoint(x,y)?.closest('.element');
    if(targetNode)to=nearestAnchorOnObject(getObj(targetNode.dataset.id),p);
  }
  if(!to)to={x:p.x,y:p.y};
  const from=connectorDraft.from;
  const valid=!(from.id&&to.id&&from.id===to.id&&from.anchor===to.anchor);
  if(valid){
    state.objects.push({id:uid('c'),type:'connector',from:deep(from),to:deep(to),color:DEFAULTS.line,width:3,arrow:'end',z:zMax()+1});
    commitGesture();
  }else cancelGesture();
  connectorDraft=null;markDirty();renderAll();
}
function startEndpointDrag(side,ev){
  const o=getObj(state.selection[0]);if(!o||o.type!=='connector')return;
  ev.preventDefault();ev.stopPropagation();beginGesture();
  endpointDrag={id:o.id,side,startX:ev.clientX,startY:ev.clientY,original:deep(o[side]),moved:false};
  app.classList.add('connectorMode');
}
function moveEndpointDrag(x,y){
  if(!endpointDrag)return;const o=getObj(endpointDrag.id);if(!o)return;
  if(Math.hypot(x-endpointDrag.startX,y-endpointDrag.startY)>2)endpointDrag.moved=true;
  if(endpointDrag.moved){o[endpointDrag.side]=screenToWorld(x,y);markDirty()}
}
function endEndpointDrag(x,y){
  if(!endpointDrag)return;const d=endpointDrag,o=getObj(d.id);if(!o)return;
  if(!d.moved){
    o[d.side]=deep(d.original);endpointDrag=null;cancelGesture();
    if(state.tool!=='connector')app.classList.remove('connectorMode');markDirty();return;
  }
  const p=screenToWorld(x,y),a=anchorAtScreen(x,y);let ep=a;
  if(!ep){const n=document.elementFromPoint(x,y)?.closest('.element');if(n)ep=nearestAnchorOnObject(getObj(n.dataset.id),p)}
  o[d.side]=ep||{x:p.x,y:p.y};endpointDrag=null;commitGesture();
  if(state.tool!=='connector')app.classList.remove('connectorMode');markDirty();renderAll();
}

/* Marquee and vector drag */
function startMarquee(ev){
  marqueeStart={x:ev.clientX,y:ev.clientY,shift:ev.shiftKey};marquee.hidden=false;
  Object.assign(marquee.style,{left:ev.clientX+'px',top:ev.clientY+'px',width:'0',height:'0'});
}
function updateMarquee(x,y){
  if(!marqueeStart)return;
  const l=Math.min(marqueeStart.x,x),t=Math.min(marqueeStart.y,y),w=Math.abs(x-marqueeStart.x),h=Math.abs(y-marqueeStart.y);
  Object.assign(marquee.style,{left:l+'px',top:t+'px',width:w+'px',height:h+'px'});
}
function endMarquee(){
  if(!marqueeStart)return;
  const r=marquee.getBoundingClientRect(),a=screenToWorld(r.left,r.top),b=screenToWorld(r.right,r.bottom),wr={x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y};
  const hits=state.objects.filter(o=>rectIntersects(wr,objectBounds(o))).map(o=>o.id);
  setSelection(marqueeStart.shift?[...state.selection,...hits]:hits);marquee.hidden=true;marqueeStart=null;
}

/* Copy / paste graph-aware */
function buildCopyPayload(ids){
  const set=new Set(ids),objs=[];
  state.objects.forEach(o=>{
    if(set.has(o.id))objs.push(deep(o));
    else if(o.type==='connector'&&o.from?.id&&o.to?.id&&set.has(o.from.id)&&set.has(o.to.id))objs.push(deep(o));
  });
  return{objects:objs};
}
function pastePayload(payload,dx=28,dy=28){
  if(!payload?.objects?.length)return;
  discrete(()=>{
    const map=new Map(),groupMap=new Map(),newObjs=[];
    const remapGroup=n=>{if(n.groupId){if(!groupMap.has(n.groupId))groupMap.set(n.groupId,uid('g_'));n.groupId=groupMap.get(n.groupId)}};
    payload.objects.filter(o=>o.type!=='connector').forEach(o=>{const n=deep(o),old=n.id;n.id=uid(n.type==='drawing'?'d':'o');map.set(old,n.id);remapGroup(n);
      if(isElement(n)){n.x+=dx;n.y+=dy}else if(n.type==='drawing')n.points=n.points.map(p=>({x:p.x+dx,y:p.y+dy}));n.z=zMax()+1;newObjs.push(n)});
    payload.objects.filter(o=>o.type==='connector').forEach(o=>{const n=deep(o);n.id=uid('c');remapGroup(n);if(n.from?.id&&map.has(n.from.id))n.from.id=map.get(n.from.id);else if(!n.from?.id){n.from.x+=dx;n.from.y+=dy}
      if(n.to?.id&&map.has(n.to.id))n.to.id=map.get(n.to.id);else if(!n.to?.id){n.to.x+=dx;n.to.y+=dy}n.z=zMax()+1;newObjs.push(n)});
    state.objects.push(...newObjs);state.selection=newObjs.map(o=>o.id);
  });renderAll();
}
function duplicateSelection(){if(!state.selection.length)return;pastePayload(buildCopyPayload(state.selection),28,28)}
function deleteSelection(){
  if(!state.selection.length)return;
  const deletable=new Set(selectedObjs().filter(o=>!o.locked).map(o=>o.id));if(!deletable.size){showToast('对象已锁定');return}
  discrete(()=>{state.objects=state.objects.filter(o=>{
    if(deletable.has(o.id))return false;
    if(o.type==='connector'&&!o.locked&&(deletable.has(o.from?.id)||deletable.has(o.to?.id)))return false;
    return true;
  });state.selection=state.selection.filter(id=>!deletable.has(id))});
  renderAll();
}

/* Mini map */
function renderMini(){
  const W=156,H=92,D=2;mm.clearRect(0,0,minimap.width,minimap.height);mm.save();mm.scale(D,D);mm.fillStyle='#fdfdfc';mm.fillRect(0,0,W,H);
  if(!state.objects.length){mm.restore();return}
  const viewA=screenToWorld(0,0),viewB=screenToWorld(innerWidth,innerHeight);
  const all=[...state.objects.map(objectBounds),{x:viewA.x,y:viewA.y,w:viewB.x-viewA.x,h:viewB.y-viewA.y}];
  const minX=Math.min(...all.map(b=>b.x)),minY=Math.min(...all.map(b=>b.y)),maxX=Math.max(...all.map(b=>b.x+b.w)),maxY=Math.max(...all.map(b=>b.y+b.h));
  const pad=12,bw=maxX-minX||1,bh=maxY-minY||1,s=Math.min((W-pad*2)/bw,(H-pad*2)/bh),ox=(W-bw*s)/2-minX*s,oy=(H-bh*s)/2-minY*s;
  state.objects.filter(o=>o.type==='connector').forEach(o=>{const pts=connectorPolyline(o,16);mm.strokeStyle=o.color||'#777';mm.lineWidth=1;mm.beginPath();mm.moveTo(ox+pts[0].x*s,oy+pts[0].y*s);pts.slice(1).forEach(p=>mm.lineTo(ox+p.x*s,oy+p.y*s));mm.stroke()});
  state.objects.filter(o=>o.type==='drawing').forEach(o=>{if(o.points.length<2)return;mm.strokeStyle=o.color||'#777';mm.lineWidth=1;mm.beginPath();mm.moveTo(ox+o.points[0].x*s,oy+o.points[0].y*s);o.points.slice(1).forEach(p=>mm.lineTo(ox+p.x*s,oy+p.y*s));mm.stroke()});
  state.objects.filter(isElement).forEach(o=>{const b=objectBounds(o);mm.fillStyle=o.type==='sticky'?(o.fill||'#fff2a7'):o.type==='image'?'#dfe2ff':'#e9e9e7';mm.fillRect(ox+b.x*s,oy+b.y*s,Math.max(3,b.w*s),Math.max(3,b.h*s))});
  mm.strokeStyle='rgba(114,103,255,.8)';mm.lineWidth=1;mm.strokeRect(ox+viewA.x*s,oy+viewA.y*s,(viewB.x-viewA.x)*s,(viewB.y-viewA.y)*s);
  minimap._map={s,ox,oy};mm.restore();
}

/* Fit / zoom */
function zoomCenter(f){
  const cx=innerWidth/2,cy=innerHeight/2,c=state.camera,old=c.scale,next=clamp(old*f,.1,4),wx=(cx-c.x)/old,wy=(cy-c.y)/old;
  c.scale=next;c.x=cx-wx*next;c.y=cy-wy*next;applyCamera();scheduleSave();
}
function fitContent(){
  if(!state.objects.length)return;const b=unionBounds(state.objects),pad=140,s=clamp(Math.min((innerWidth-pad*2)/Math.max(1,b.w),(innerHeight-pad*2)/Math.max(1,b.h)),.1,1.5);
  state.camera.scale=s;state.camera.x=innerWidth/2-(b.x+b.w/2)*s;state.camera.y=innerHeight/2-(b.y+b.h/2)*s;applyCamera();scheduleSave();
}

/* Export using the same object model */
function wrapLines(ctx,text,maxWidth){
  const lines=[];for(const raw of String(text||'').split('\n')){
    if(raw===''){lines.push('');continue}
    let line='';for(const ch of raw){const test=line+ch;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=ch}else line=test}lines.push(line)
  }return lines;
}
function drawArrow(ctx,from,to,color,width){
  const ang=Math.atan2(to.y-from.y,to.x-from.x),len=9+width*1.5;ctx.save();ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(to.x,to.y);
  ctx.lineTo(to.x-len*Math.cos(ang-.42),to.y-len*Math.sin(ang-.42));ctx.lineTo(to.x-len*Math.cos(ang+.42),to.y-len*Math.sin(ang+.42));ctx.closePath();ctx.fill();ctx.restore();
}
function strokeSmoothCanvas(ctx,pts){
  if(!pts||pts.length<2)return;
  ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
  for(let i=1;i<pts.length-1;i++){
    const p=pts[i],n=pts[i+1];
    ctx.quadraticCurveTo(p.x,p.y,(p.x+n.x)/2,(p.y+n.y)/2);
  }
  const last=pts.at(-1);ctx.lineTo(last.x,last.y);ctx.stroke();
}
function paintExportDrawing(ctx,o){
  ctx.strokeStyle=o.color||DEFAULTS.line;
  ctx.lineWidth=o.width||4;
  ctx.lineCap='round';
  ctx.lineJoin='round';
  strokeSmoothCanvas(ctx,o.points);
}
async function buildExportCanvas(selectionOnly=false){
  const selected=new Set(state.selection);
  const objects=deep(selectionOnly?state.objects.filter(o=>selected.has(o.id)):state.objects);
  if(!objects.length)return showToast(selectionOnly?'请先选中要导出的内容':'画布还没有内容');
  const b=unionBounds(objects),pad=selectionOnly?36:80,minX=b.x-pad,minY=b.y-pad;
  const W=Math.max(selectionOnly?1:420,b.w+pad*2),H=Math.max(selectionOnly?1:320,b.h+pad*2);
  const scale=Math.min(2,3600/Math.max(W,H)),out=document.createElement('canvas');out.width=Math.ceil(W*scale);out.height=Math.ceil(H*scale);
  const ctx=out.getContext('2d');ctx.scale(scale,scale);ctx.translate(-minX,-minY);ctx.fillStyle='#fbfbfa';ctx.fillRect(minX,minY,W,H);
  const byLayer=(a,b)=>(a.z||1)-(b.z||1);
  for(const o of objects.filter(x=>x.type==='connector').sort(byLayer)){
    const g=connectorGeom(o);ctx.strokeStyle=o.color||DEFAULTS.line;ctx.lineWidth=o.width||3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(g.p1.x,g.p1.y);ctx.bezierCurveTo(g.c1.x,g.c1.y,g.c2.x,g.c2.y,g.p2.x,g.p2.y);ctx.stroke();
    if(o.arrow==='end'||o.arrow==='both')drawArrow(ctx,g.c2,g.p2,o.color||DEFAULTS.line,o.width||3);
    if(o.arrow==='both')drawArrow(ctx,g.c1,g.p1,o.color||DEFAULTS.line,o.width||3);
    if(o.label){
      const t=clamp(o.label.t??.5,0,1),pt=bezierPoint(g,t),tan=cubicTangent(g,t),len=Math.hypot(tan.x,tan.y)||1,n={x:-tan.y/len,y:tan.x/len},off=o.label.offset??-14;
      const x=pt.x+n.x*off,y=pt.y+n.y*off;
      ctx.font='600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';ctx.textBaseline='middle';ctx.textAlign='center';
      const tw=ctx.measureText(o.label.text||'关系').width+14;ctx.fillStyle='rgba(251,251,250,.96)';ctx.fillRect(x-tw/2,y-10,tw,20);
      ctx.fillStyle='#171717';ctx.fillText(o.label.text||'关系',x,y);
    }
  }
  const drawings=objects.filter(o=>o.type==='drawing').sort(byLayer);
  for(const o of drawings){
    if(!o.highlighter)paintExportDrawing(ctx,o);
  }
  const imgs=new Map();
  for(const o of objects.filter(x=>x.type==='image')){
    if(imgs.has(o.assetId))continue;
    const url=await getAssetUrl(o.assetId);
    if(!url)throw new Error('图片资源不可用');
    const img=new Image();
    img.src=url;
    await img.decode();
    imgs.set(o.assetId,img);
  }
  for(const o of objects.filter(isElement).sort(byLayer)){
    const cx=o.x+o.w/2,cy=o.y+o.h/2;ctx.save();ctx.translate(cx,cy);ctx.rotate((o.rot||0)*Math.PI/180);ctx.translate(-cx,-cy);
    if(o.type==='sticky'){
      ctx.shadowColor='rgba(35,35,35,.13)';ctx.shadowBlur=24;ctx.shadowOffsetY=10;ctx.fillStyle=o.fill||DEFAULTS.sticky;ctx.fillRect(o.x,o.y,o.w,o.h);ctx.shadowColor='transparent';
      ctx.fillStyle='#171717';ctx.font='560 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';ctx.textBaseline='top';
      const lines=wrapLines(ctx,o.text,o.w-46);lines.forEach((line,i)=>ctx.fillText(line,o.x+23,o.y+24+i*31));
    }else if(o.type==='text'){
      ctx.fillStyle=o.color||DEFAULTS.text;ctx.font=`${o.fontWeight||600} ${o.fontSize||28}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;ctx.textBaseline='top';
      wrapLines(ctx,o.text,o.w).forEach((line,i)=>ctx.fillText(line,o.x+4,o.y+4+i*(o.fontSize||28)*1.35));
    }else if(o.type==='rect'||o.type==='circle'){
      ctx.lineWidth=o.strokeWidth||2;ctx.strokeStyle=o.stroke||DEFAULTS.shapeStroke;if(o.fill&&o.fill!=='transparent'){ctx.fillStyle=o.fill}
      ctx.beginPath();if(o.type==='rect')ctx.rect(o.x,o.y,o.w,o.h);else ctx.ellipse(cx,cy,o.w/2,o.h/2,0,0,Math.PI*2);
      if(o.fill&&o.fill!=='transparent')ctx.fill();ctx.stroke();
    }else if(o.type==='image'){
      const img=imgs.get(o.assetId);
      if(o.imageStyle==='card'){
        ctx.shadowColor='rgba(30,30,30,.13)';ctx.shadowBlur=22;ctx.shadowOffsetY=9;ctx.fillStyle='#fff';ctx.fillRect(o.x,o.y,o.w,o.h);ctx.shadowColor='transparent';
        ctx.drawImage(img,o.x+6,o.y+6,o.w-12,o.h-12);
      }else{
        ctx.drawImage(img,o.x,o.y,o.w,o.h);
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha=HIGHLIGHT_OPACITY;
  for(const o of drawings){
    if(o.highlighter)paintExportDrawing(ctx,o);
  }
  ctx.globalAlpha=1;
  return out;
}
