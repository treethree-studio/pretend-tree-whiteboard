/* Rendering */
function markDirty(vectors=true,mini=true){
  if(vectors)dirtyVectors=true;if(mini)dirtyMini=true;
  if(!rafPending){rafPending=true;requestAnimationFrame(flushRender)}
}
function flushRender(){
  rafPending=false;
  if(dirtyVectors){dirtyVectors=false;renderVectors();renderLabels()}
  if(dirtyMini){dirtyMini=false;renderMini()}
  positionFloatingBar();positionEndpointHandles();positionGroupBox();
}
function renderAll(){
  renderElements();renderVectors();renderLabels();renderMini();updateSelectionUI();applyCamera();updateUndoRedo();
}
function applyCamera(){
  const c=state.camera;
  world.style.transform=`translate(${c.x}px,${c.y}px) scale(${c.scale})`;
  canvas.style.backgroundSize=`${34*c.scale}px ${34*c.scale}px`;
  canvas.style.backgroundPosition=`${c.x}px ${c.y}px`;
  $('#zoomLabel').textContent=Math.round(c.scale*100)+'%';
  markDirty(false,true);positionFloatingBar();positionEndpointHandles();positionGroupBox();
}
function renderElements(){
  elementsRoot.innerHTML='';
  state.objects.filter(isElement).sort((a,b)=>(a.z||1)-(b.z||1)).forEach(o=>{
    const n=document.createElement('div');n.className='element';n.dataset.id=o.id;
    n.style.left=o.x+'px';n.style.top=o.y+'px';n.style.width=o.w+'px';n.style.height=o.h+'px';n.style.zIndex=o.z||1;
    n.style.transform=`rotate(${o.rot||0}deg)`;
    if(o.type==='sticky'){
      n.classList.add('sticky');n.style.background=o.fill||DEFAULTS.sticky;
    }else if(o.type==='text'){
      n.classList.add('textEl');n.style.fontSize=(o.fontSize||28)+'px';n.style.fontWeight=o.fontWeight||600;n.style.color=o.color||DEFAULTS.text;n.style.textAlign=o.align||'left';
    }else if(o.type==='rect'||o.type==='circle'){
      n.classList.add('shape',o.type);n.style.background=o.fill==='transparent'?'transparent':(o.fill||'transparent');
      n.style.borderColor=o.stroke||DEFAULTS.shapeStroke;n.style.borderWidth=(o.strokeWidth||2)+'px';
    }else if(o.type==='image'){
      n.classList.add('imageEl');
      if(o.imageStyle==='card')n.classList.add('cardStyle');
      const placeholder=document.createElement('div');placeholder.className='imageMissing';placeholder.textContent='加载图片…';n.appendChild(placeholder);
      getAssetUrl(o.assetId).then(url=>{
        if(!url||!n.isConnected){placeholder.textContent='图片资源不可用';return}
        const img=document.createElement('img');img.src=url;placeholder.replaceWith(img);
      }).catch(()=>placeholder.textContent='图片资源不可用');
    }
    if(o.type==='sticky'||o.type==='text'){
      const text=document.createElement('div');
      text.className='editableText';
      text.textContent=o.text??(o.type==='text'?'文字':'');
      n.appendChild(text);
    }
    if(state.selection.includes(o.id))n.classList.add('selected');
    if(o.locked)n.classList.add('locked');
    if(['sticky','image','rect','circle'].includes(o.type)){
      ['nw','ne','se','sw'].forEach(corner=>{
        const rh=document.createElement('div');rh.className='resizeHandle '+corner;rh.dataset.handle='resize';rh.dataset.corner=corner;n.appendChild(rh);
      });
      const rot=document.createElement('div');rot.className='rotationHandle';rot.dataset.handle='rotate';n.appendChild(rot);
    }
    if(linkable(o)){
      ['n','e','s','w'].forEach(a=>{const d=document.createElement('div');d.className='anchor '+a;d.dataset.anchor=a;n.appendChild(d)});
    }
    n.addEventListener('pointerdown',elementPointerDown);
    n.addEventListener('dblclick',e=>{e.stopPropagation();beginEdit(o.id,e)});
    elementsRoot.appendChild(n);
  });
}
function renderLabels(){
  labelsRoot.innerHTML='';
  state.objects.filter(o=>o.type==='connector'&&o.label).forEach(o=>{
    const t=clamp(o.label.t??.5,0,1),g=connectorGeom(o),pt=bezierPoint(g,t),tan=cubicTangent(g,t);
    const len=Math.hypot(tan.x,tan.y)||1,n={x:-tan.y/len,y:tan.x/len},off=o.label.offset??-14;
    const d=document.createElement('div');d.className='connectorLabel';d.dataset.id=o.id;
    d.style.left=(pt.x+n.x*off)+'px';d.style.top=(pt.y+n.y*off)+'px';d.textContent=o.label.text||'关系';
    if(state.selection.includes(o.id))d.classList.add('selected');
    d.addEventListener('pointerdown',labelPointerDown);
    d.addEventListener('dblclick',e=>{e.stopPropagation();beginLabelEdit(o.id)});
    labelsRoot.appendChild(d);
  });
}
function renderVectors(){
  connectorGroup.innerHTML='';drawingGroup.innerHTML='';
  state.objects.filter(o=>o.type==='connector').sort((a,b)=>(a.z||1)-(b.z||1)).forEach(o=>{
    const g=connectorGeom(o),d=`M ${g.p1.x} ${g.p1.y} C ${g.c1.x} ${g.c1.y}, ${g.c2.x} ${g.c2.y}, ${g.p2.x} ${g.p2.y}`;
    if(state.selection.includes(o.id)){
      const hi=document.createElementNS('http://www.w3.org/2000/svg','path');
      hi.setAttribute('d',d);hi.setAttribute('fill','none');hi.setAttribute('stroke','#7267ff');hi.setAttribute('stroke-opacity','.18');
      hi.setAttribute('stroke-width',(o.width||3)+10);hi.setAttribute('stroke-linecap','round');connectorGroup.appendChild(hi);
    }
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',d);p.setAttribute('fill','none');p.setAttribute('stroke',o.color||DEFAULTS.line);
    p.setAttribute('stroke-width',o.width||3);p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');
    connectorGroup.appendChild(p);
    const appendHead=(tip,from)=>{
      const ang=Math.atan2(tip.y-from.y,tip.x-from.x),size=8.5+(o.width||3)*1.35,wing=size*.54;
      const back={x:tip.x-Math.cos(ang)*size,y:tip.y-Math.sin(ang)*size};
      const perp={x:-Math.sin(ang),y:Math.cos(ang)};
      const poly=document.createElementNS('http://www.w3.org/2000/svg','path');
      poly.setAttribute('d',`M ${tip.x} ${tip.y} L ${back.x+perp.x*wing} ${back.y+perp.y*wing} L ${back.x-perp.x*wing} ${back.y-perp.y*wing} Z`);
      poly.setAttribute('fill',o.color||DEFAULTS.line);
      connectorGroup.appendChild(poly);
    };
    if(o.arrow==='end'||o.arrow==='both')appendHead(g.p2,g.c2);
    if(o.arrow==='both')appendHead(g.p1,g.c1);
  });
  state.objects.filter(o=>o.type==='drawing').sort((a,b)=>(a.z||1)-(b.z||1)).forEach(o=>{
    const d=smoothPath(o.points||[]);
    if(state.selection.includes(o.id)){
      const hi=document.createElementNS('http://www.w3.org/2000/svg','path');
      hi.setAttribute('d',d);hi.setAttribute('fill','none');hi.setAttribute('stroke','#7267ff');hi.setAttribute('stroke-opacity','.20');
      hi.setAttribute('stroke-width',(o.width||4)+10);hi.setAttribute('stroke-linecap','round');hi.setAttribute('stroke-linejoin','round');drawingGroup.appendChild(hi);
    }
    const p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',d);p.setAttribute('fill','none');p.setAttribute('stroke',o.color||DEFAULTS.line);p.setAttribute('stroke-width',o.width||4);
    p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');drawingGroup.appendChild(p);
  });
  if(connectorDraft){
    const from=endpointPoint(connectorDraft.from,connectorDraft.current),p2=connectorDraft.current,dx=p2.x-from.x,dy=p2.y-from.y;
    const bend=Math.max(30,Math.min(100,Math.hypot(dx,dy)*.22));
    const c1=Math.abs(dx)>=Math.abs(dy)?{x:from.x+Math.sign(dx||1)*bend,y:from.y}:{x:from.x,y:from.y+Math.sign(dy||1)*bend};
    const c2=Math.abs(dx)>=Math.abs(dy)?{x:p2.x-Math.sign(dx||1)*bend,y:p2.y}:{x:p2.x,y:p2.y-Math.sign(dy||1)*bend};
    draftConnector.setAttribute('d',`M ${from.x} ${from.y} C ${c1.x} ${c1.y},${c2.x} ${c2.y},${p2.x} ${p2.y}`);draftConnector.style.display='';
  }else draftConnector.style.display='none';
}
function smoothPath(pts){
  if(!pts||pts.length<2)return'';
  let d=`M ${pts[0].x} ${pts[0].y}`;
  for(let i=1;i<pts.length-1;i++){const p=pts[i],n=pts[i+1];d+=` Q ${p.x} ${p.y} ${(p.x+n.x)/2} ${(p.y+n.y)/2}`}
  const last=pts.at(-1);return d+` L ${last.x} ${last.y}`;
}
function updateSelectionUI(){
  const single=state.selection.length===1;
  $$('.element').forEach(n=>{
    const selected=state.selection.includes(n.dataset.id);
    n.classList.toggle('selected',selected);
    n.classList.toggle('singleSelected',selected&&single);
  });
  buildFloatingBar();renderVectors();renderLabels();positionEndpointHandles();positionGroupBox();
}
function setSelection(ids){
  state.selection=[...new Set(ids)].filter(id=>getObj(id));updateSelectionUI();
}
function sameGroupSelection(){
  if(state.selection.length<2)return null;
  const objs=selectedObjs(),gid=objs[0]?.groupId;
  return gid&&objs.every(o=>o.groupId===gid)?gid:null;
}
function positionGroupBox(){
  groupBox.classList.remove('show');
  if(state.selection.length<2)return;
  const objs=selectedObjs().filter(o=>o.type!=='connector');if(objs.length<2)return;
  const b=unionBounds(objs),p1=worldToScreen(b.x,b.y),p2=worldToScreen(b.x+b.w,b.y+b.h);
  groupBox.style.left=p1.x+'px';groupBox.style.top=p1.y+'px';
  groupBox.style.width=Math.max(1,p2.x-p1.x)+'px';groupBox.style.height=Math.max(1,p2.y-p1.y)+'px';groupBox.classList.add('show');
}
function groupSelection(){
  if(state.selection.length<2)return;
  discrete(()=>{
    const gid=uid('g_'),ids=new Set(state.selection);
    state.objects.forEach(o=>{
      if(ids.has(o.id))o.groupId=gid;
      else if(o.type==='connector'&&o.from?.id&&o.to?.id&&ids.has(o.from.id)&&ids.has(o.to.id))o.groupId=gid;
    });
    state.selection=groupMembers(gid).map(o=>o.id);
  });
  renderAll();showToast('已组合');
}
function ungroupSelection(){
  const gs=[...new Set(selectedObjs().map(o=>o.groupId).filter(Boolean))];if(!gs.length)return;
  discrete(()=>state.objects.forEach(o=>{if(gs.includes(o.groupId))delete o.groupId}));
  renderAll();showToast('已取消组合');
}
function toggleSelection(id){
  setSelection(state.selection.includes(id)?state.selection.filter(x=>x!==id):[...state.selection,id]);
}
