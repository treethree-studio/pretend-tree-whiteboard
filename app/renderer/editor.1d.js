/* Rendering */
const svgNamespace='http://www.w3.org/2000/svg';
const zoomLabel=$('#zoomLabel');
const renderedElements=new Map(),renderedVectors=new Map(),renderedLabels=new Map();
let objectLayerIndexes=new Map();
let layerOrder=[];
let renderedCameraScale;

function syncObjectLayers(){
  if(state.objects.length===layerOrder.length&&state.objects.every((o,i)=>o.id===layerOrder[i].id&&layerOf(o)===layerOrder[i].z))return;
  // Use the saved array order to break ties in older boards.
  layerOrder=state.objects.map(o=>({id:o.id,z:layerOf(o)}));
  objectLayerIndexes=new Map(objectsByLayer().map((o,i)=>[String(o.id),String(i+1)]));
  for(const root of [elementsRoot,vectorsRoot,labelsRoot]){
    for(const node of root.children){
      const index=objectLayerIndexes.get(node.dataset.id);
      if(index&&node.style.zIndex!==index)node.style.zIndex=index;
    }
  }
}
function markDirty(vectors=true,mini=true){
  if(vectors)dirtyVectors=true;if(mini)dirtyMini=true;
  if(!rafPending){rafPending=true;requestAnimationFrame(flushRender)}
}
function flushRender(){
  rafPending=false;
  if(dirtyVectors){dirtyVectors=false;renderVectors();renderLabels()}
  if(dirtyMini){dirtyMini=false;queueMiniRender()}
  positionFloatingBar();positionEndpointHandles();positionGroupBox();positionSearchMarker();positionTextMarkButton();
}
function renderAll(){
  renderElements();updateSelectionUI();renderMini();applyCamera();updateUndoRedo();
}
function applyCamera(){
  const c=state.camera;
  world.style.transform=`translate(${c.x}px,${c.y}px) scale(${c.scale})`;
  if(renderedCameraScale!==c.scale){
    renderedCameraScale=c.scale;
    world.style.setProperty('--anchor-scale',1/c.scale);
    canvas.style.backgroundSize=`${34*c.scale}px ${34*c.scale}px`;
    zoomLabel.textContent=Math.round(c.scale*100)+'%';
  }
  canvas.style.backgroundPosition=`${c.x}px ${c.y}px`;
  markDirty(false,true);
}
function renderElementColors(node,object){
  if(object.type==='sticky'){
    node.style.background=displayedPaletteColor(object,'fill',DEFAULTS.sticky);
  }else if(object.type==='text'){
    node.style.color=displayedPaletteColor(object,'color',DEFAULTS.text);
  }else if(object.type==='rect'||object.type==='circle'){
    node.style.background=displayedPaletteColor(object,'fill','transparent');
    node.style.borderColor=displayedPaletteColor(object,'stroke',DEFAULTS.shapeStroke);
  }
}
function syncTextBoxHeight(object,node){
  object.h=node.offsetHeight;
}
function renderElements(){
  const fragment=document.createDocumentFragment(),textBoxes=[];
  clearPaintedTextMarks();
  renderedElements.clear();
  state.objects.filter(isElement).forEach(o=>{
    const n=document.createElement('div');n.className='element';n.dataset.id=o.id;
    n.style.zIndex=objectLayerIndexes.get(n.dataset.id)||'';
    if(o.type==='text')o.w=textBoxWidth(o);
    else n.style.height=o.h+'px';
    n.style.left=o.x+'px';n.style.top=o.y+'px';n.style.width=o.w+'px';
    n.style.transform=`rotate(${o.rot||0}deg)`;
    renderElementColors(n,o);
    if(o.type==='sticky'){
      n.classList.add('sticky');
    }else if(o.type==='text'){
      applyTextBoxTypography(n,o);
      textBoxes.push([o,n]);
    }else if(o.type==='rect'||o.type==='circle'){
      n.classList.add('shape',o.type);n.style.borderWidth=(o.strokeWidth||2)+'px';
      n.style.setProperty('--anchor-border',n.style.borderWidth);
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
      if(o.textMarks?.length)paintTextMarks(text,text.textContent,normalizeTextMarks(o.textMarks,text.textContent.length));
    }
    if(state.selection.includes(o.id))n.classList.add('selected');
    if(o.locked)n.classList.add('locked');
    if(o.type==='text'){
      for(const side of ['w','e']){
        const handle=document.createElement('div');
        handle.className='resizeHandle '+side;
        handle.dataset.textResize=side;
        handle.title='拖动调整文本框宽度';
        n.appendChild(handle);
      }
    }else if(['sticky','image','rect','circle'].includes(o.type)){
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
    fragment.appendChild(n);
    renderedElements.set(o.id,n);
  });
  elementsRoot.replaceChildren(fragment);
  for(const [object,node] of textBoxes)syncTextBoxHeight(object,node);
  refreshBoardSearch();
}
function renderLabels(){
  if(!renderedLabels.size&&!state.objects.some(o=>o.type==='connector'&&o.label))return;
  const byId=new Map(state.objects.map(o=>[o.id,o])),findObject=id=>byId.get(id);
  const liveIds=new Set(),selected=new Set(state.selection);
  for(const o of state.objects){
    if(o.type!=='connector'||!o.label)continue;
    liveIds.add(o.id);
    const t=clamp(o.label.t??.5,0,1),g=boardConnectorGeometry(displayedConnector(o),findObject),pt=bezierPoint(g,t),tan=cubicTangent(g,t);
    const len=Math.hypot(tan.x,tan.y)||1,n={x:-tan.y/len,y:tan.x/len},off=o.label.offset??-14;
    let view=renderedLabels.get(o.id);
    if(!view){
      const node=document.createElement('div');node.className='connectorLabel';node.dataset.id=o.id;
      node.style.zIndex=objectLayerIndexes.get(node.dataset.id)||'';
      node.addEventListener('pointerdown',labelPointerDown);
      node.addEventListener('dblclick',e=>{e.stopPropagation();beginLabelEdit(o.id)});
      labelsRoot.appendChild(node);
      view={node};
      renderedLabels.set(o.id,view);
    }
    const {node}=view;
    const left=(pt.x+n.x*off)+'px',top=(pt.y+n.y*off)+'px',label=o.label.text||'关系';
    if(view.left!==left){view.left=left;node.style.left=left}
    if(view.top!==top){view.top=top;node.style.top=top}
    if(!node.isContentEditable&&node.textContent!==label)node.textContent=label;
    node.classList.toggle('selected',selected.has(o.id));
  }
  for(const [id,view] of renderedLabels){
    if(!liveIds.has(id)){view.node.remove();renderedLabels.delete(id)}
  }
}
function renderVector(o,geometry,path,color,width,selected){
  const layer=document.createElementNS(svgNamespace,'svg');
  layer.classList.add('vectorObject');layer.dataset.id=o.id;
  layer.setAttribute('aria-hidden','true');
  layer.style.zIndex=objectLayerIndexes.get(layer.dataset.id)||'';
  const stroke=document.createElementNS(svgNamespace,'path');
  stroke.setAttribute('d',path);stroke.setAttribute('fill','none');stroke.setAttribute('stroke',color);
  stroke.setAttribute('stroke-width',width);stroke.setAttribute('stroke-linecap','round');stroke.setAttribute('stroke-linejoin','round');
  if(selected){
    const highlight=stroke.cloneNode();
    highlight.setAttribute('stroke','#7267ff');
    highlight.setAttribute('stroke-opacity',geometry?'.18':'.20');
    highlight.setAttribute('stroke-width',width+10);
    layer.appendChild(highlight);
  }
  stroke.classList.add('vectorStroke');
  if(o.highlighter)stroke.setAttribute('stroke-opacity',HIGHLIGHT_OPACITY);
  layer.appendChild(stroke);
  if(geometry){
    if(o.arrow==='end'||o.arrow==='both')appendVectorArrow(layer,geometry.p2,geometry.c2,color,width);
    if(o.arrow==='both')appendVectorArrow(layer,geometry.p1,geometry.c1,color,width);
  }
  return layer;
}
function appendVectorArrow(layer,tip,from,color,width){
  const ang=Math.atan2(tip.y-from.y,tip.x-from.x),size=8.5+width*1.35,wing=size*.54;
  const back={x:tip.x-Math.cos(ang)*size,y:tip.y-Math.sin(ang)*size};
  const perp={x:-Math.sin(ang),y:Math.cos(ang)};
  const arrow=document.createElementNS(svgNamespace,'path');
  arrow.classList.add('vectorArrow');
  arrow.setAttribute('d',`M ${tip.x} ${tip.y} L ${back.x+perp.x*wing} ${back.y+perp.y*wing} L ${back.x-perp.x*wing} ${back.y-perp.y*wing} Z`);
  arrow.setAttribute('fill',color);
  layer.appendChild(arrow);
}
function renderVectors(){
  syncObjectLayers();
  const byId=new Map(state.objects.map(o=>[o.id,o])),findObject=id=>byId.get(id);
  const liveIds=new Set(),selectedIds=new Set(state.selection);
  for(const o of state.objects){
    if(!isVector(o))continue;
    liveIds.add(o.id);
    const previous=renderedVectors.get(o.id),connector=o.type==='connector';
    const geometry=connector?boardConnectorGeometry(displayedConnector(o),findObject):null;
    const points=o.points,pointCount=points?.length||0;
    const path=geometry?connectorPath(geometry):
      previous&&previous.points===points&&previous.pointCount===pointCount?previous.path:smoothPath(points);
    const color=displayedPaletteColor(o,'color',DEFAULTS.line),width=o.width||(connector?3:4);
    const selected=selectedIds.has(o.id),highlighter=Boolean(o.highlighter);
    if(previous&&previous.type===o.type&&previous.path===path&&previous.color===color&&previous.width===width&&
      previous.selected===selected&&previous.highlighter===highlighter&&previous.arrow===o.arrow){
      previous.points=points;previous.pointCount=pointCount;
      continue;
    }
    const node=renderVector(o,geometry,path,color,width,selected);
    if(previous)previous.node.replaceWith(node);else vectorsRoot.appendChild(node);
    renderedVectors.set(o.id,{node,type:o.type,points,pointCount,path,color,width,selected,highlighter,arrow:o.arrow});
  }
  for(const [id,vector] of renderedVectors){
    if(!liveIds.has(id)){vector.node.remove();renderedVectors.delete(id)}
  }
  const draft=connectorGesture?.source&&connectorGesture.preview;
  if(draft){
    draftConnector.setAttribute('d',connectorPath(connectorGeom(draft)));
    draftConnector.classList.toggle('snapped',Boolean(connectorGesture.target));
    draftConnector.style.display='';
  }else draftConnector.style.display='none';
}
function connectorPath(g){
  return `M ${g.p1.x} ${g.p1.y} C ${g.c1.x} ${g.c1.y}, ${g.c2.x} ${g.c2.y}, ${g.p2.x} ${g.p2.y}`;
}
function smoothPath(pts){
  if(!pts||pts.length<2)return'';
  let d=`M ${pts[0].x} ${pts[0].y}`;
  for(let i=1;i<pts.length-1;i++){const p=pts[i],n=pts[i+1];d+=` Q ${p.x} ${p.y} ${(p.x+n.x)/2} ${(p.y+n.y)/2}`}
  const last=pts.at(-1);return d+` L ${last.x} ${last.y}`;
}
function updateSelectionUI(){
  const single=state.selection.length===1;
  const selection=new Set(state.selection);
  $$('#exportMenu [data-selection-only]').forEach(button=>{button.disabled=!state.selection.length});
  $$('.element').forEach(n=>{
    const selected=selection.has(n.dataset.id);
    n.classList.toggle('selected',selected);
    n.classList.toggle('singleSelected',selected&&single);
  });
  buildFloatingBar();renderVectors();renderLabels();positionEndpointHandles();positionGroupBox();
}
function setSelection(ids){
  state.selection=[...new Set(ids)].filter(id=>getObj(id));updateSelectionUI();
}
function sameGroupSelection(objects){
  const groupId=objects[0]?.groupId;
  return objects.length>1&&groupId&&objects.every(o=>o.groupId===groupId);
}
function groupingTargets(objects){
  const ids=new Set(objects.map(o=>o.id));
  const groups=new Set(objects.map(o=>o.groupId).filter(Boolean));
  return state.objects.filter(o=>ids.has(o.id)||groups.has(o.groupId));
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
  const objects=selectedObjs();
  if(objects.length<2||sameGroupSelection(objects))return;
  const targets=groupingTargets(objects);
  if(targets.some(o=>o.locked)){showToast('请先解锁所选对象');return}
  discrete(()=>{
    const gid=uid('g_'),ids=new Set(targets.map(o=>o.id));
    state.objects.forEach(o=>{
      if(ids.has(o.id))o.groupId=gid;
      else if(o.type==='connector'&&!o.locked&&!o.groupId&&ids.has(o.from?.id)&&ids.has(o.to?.id))o.groupId=gid;
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
