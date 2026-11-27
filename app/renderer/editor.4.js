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
const CONNECTOR_SNAP_RADIUS=20;
const CONNECTOR_RELEASE_RADIUS=26;
const CONNECTOR_DRAG_THRESHOLD=6;
const CONNECTOR_ANCHORS=['n','e','s','w'];
function connectorCenter(object){
  return {x:object.x+object.w/2,y:object.y+object.h/2};
}
function connectorFacingAnchor(object,point){
  const center=connectorCenter(object);
  const local=object.rot?rotatePoint(point,center,-object.rot):point;
  const dx=(local.x-center.x)/Math.max(object.w,1),dy=(local.y-center.y)/Math.max(object.h,1);
  if(Math.abs(dx)>Math.abs(dy))return dx>=0?'e':'w';
  return dy>=0?'s':'n';
}
function connectorAnchorNear(object,point){
  const scale=state.camera.scale;
  let closest=clamp(Math.min(object.w,object.h)*scale*.3,5,12);
  let anchor=null;
  for(const side of CONNECTOR_ANCHORS){
    const distance=dist(point,endpointPoint({id:object.id,anchor:side}))*scale;
    if(distance<=closest){anchor=side;closest=distance}
  }
  return anchor;
}
function connectorObjectDistance(object,point){
  const center=connectorCenter(object);
  const p=object.rot?rotatePoint(point,center,-object.rot):point;
  const dx=Math.abs(p.x-center.x),dy=Math.abs(p.y-center.y);
  const halfWidth=object.w/2,halfHeight=object.h/2;
  if(object.type==='circle'){
    const radius=Math.hypot(dx/Math.max(halfWidth,.5),dy/Math.max(halfHeight,.5));
    return radius<=1?0:Math.hypot(dx,dy)*(1-1/radius);
  }
  return Math.hypot(Math.max(0,dx-halfWidth),Math.max(0,dy-halfHeight));
}
function connectorObjectAt(x,y,point,previousId){
  const hit=document.elementFromPoint(x,y);
  if(!canvas.contains(hit))return null;
  const direct=getObj(hit.closest('.element')?.dataset.id);
  if(linkable(direct))return direct;
  const scale=state.camera.scale,previous=previousId&&getObj(previousId);
  if(linkable(previous)&&connectorObjectDistance(previous,point)*scale<=CONNECTOR_RELEASE_RADIUS)return previous;
  let best=null,bestDistance=CONNECTOR_SNAP_RADIUS;
  for(let i=state.objects.length-1;i>=0;i--){
    const object=state.objects[i];
    if(!linkable(object))continue;
    const distance=connectorObjectDistance(object,point)*scale;
    if(distance<bestDistance||(distance===bestDistance&&(!best||layerOf(object)>layerOf(best)))){
      best=object;bestDistance=distance;
    }
  }
  return best;
}
function showConnectorAnchors(object,anchor){
  const node=object&&elementsRoot.querySelector(`.element[data-id="${CSS.escape(object.id)}"]`);
  if(connectorIndicator?.node===node&&connectorIndicator?.anchor===anchor)return;
  if(connectorIndicator){
    connectorIndicator.node.classList.remove('showAnchors','connectorTarget');
    connectorIndicator.node.querySelector('.connectorTargetAnchor')?.classList.remove('connectorTargetAnchor');
  }
  connectorIndicator=node?{node,anchor}:null;
  if(!node)return;
  node.classList.add('showAnchors');
  if(anchor){
    node.classList.add('connectorTarget');
    node.querySelector(`[data-anchor="${anchor}"]`)?.classList.add('connectorTargetAnchor');
  }
}
function previewConnectorHover(event){
  const point=screenToWorld(event.clientX,event.clientY);
  showConnectorAnchors(connectorObjectAt(event.clientX,event.clientY,point));
}
function beginConnectorGesture(event,details){
  event.preventDefault();event.stopPropagation();
  canvas.setPointerCapture(event.pointerId);
  beginGesture();
  connectorGesture={...details,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,preview:null,target:null};
  app.classList.add('connectorMode','connectorDragging');
}
function startConnectorDraft(event){
  const point=screenToWorld(event.clientX,event.clientY);
  const source=connectorObjectAt(event.clientX,event.clientY,point);
  if(!source)return;
  const sourceAnchor=connectorAnchorNear(source,point);
  beginConnectorGesture(event,{source,id:uid('c'),side:'to',opposite:{id:source.id,anchor:sourceAnchor}});
  showConnectorAnchors(source);
}
function startEndpointDrag(side,event){
  if(!event.isPrimary||event.button!==0||connectorGesture||spaceDown)return;
  const object=getObj(state.selection[0]);
  if(!object||object.type!=='connector'||object.locked)return;
  beginConnectorGesture(event,{connector:object,id:object.id,side,opposite:object[side==='from'?'to':'from']});
}
function updateConnectorGesture(event){
  const drag=connectorGesture;
  if(!drag||event.pointerId!==drag.pointerId)return;
  const distance=Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY);
  if(!drag.preview&&distance<CONNECTOR_DRAG_THRESHOLD)return;
  drag.lastPointer={pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,altKey:event.altKey};
  const point=screenToWorld(event.clientX,event.clientY);
  const candidate=event.altKey?null:connectorObjectAt(event.clientX,event.clientY,point,drag.target?.id);
  const explicit=candidate&&connectorAnchorNear(candidate,point);
  const otherObject=drag.opposite?.id&&getObj(drag.opposite.id);
  const reference=otherObject?connectorCenter(otherObject):endpointPoint(drag.opposite,point);
  // Connecting an object to itself requires an explicit second anchor.
  const invalidSelf=candidate&&candidate.id===drag.opposite?.id&&(!explicit||!drag.opposite.anchor||explicit===drag.opposite.anchor);
  drag.target=candidate&&!invalidSelf?{id:candidate.id,anchor:explicit||connectorFacingAnchor(candidate,reference)}:null;
  const endpoint=drag.target||point;
  if(drag.source){
    const direction=drag.target?connectorCenter(candidate):point;
    const from={id:drag.source.id,anchor:drag.opposite.anchor||connectorFacingAnchor(drag.source,direction)};
    drag.preview={id:drag.id,type:'connector',from,to:endpoint,color:DEFAULTS.line,width:3,arrow:'end'};
  }else{
    drag.preview={...drag.connector,[drag.side]:endpoint};
  }
  showConnectorAnchors(drag.target&&candidate,drag.target?.anchor);
  markDirty(true,false);
}
function displayedConnector(object){
  return connectorGesture?.connector===object&&connectorGesture.preview||object;
}
function clearConnectorGesture(){
  const pointerId=connectorGesture.pointerId;
  connectorGesture=null;
  showConnectorAnchors();
  app.classList.remove('connectorDragging');
  app.classList.toggle('connectorMode',state.tool==='connector');
  if(canvas.hasPointerCapture(pointerId))canvas.releasePointerCapture(pointerId);
}
function cancelConnectorGesture(){
  if(!connectorGesture)return;
  clearConnectorGesture();
  cancelGesture();
  markDirty(true,false);
}
function finishConnectorGesture(event){
  const drag=connectorGesture;
  if(!drag||event.pointerId!==drag.pointerId)return;
  updateConnectorGesture(event);
  const freeEndpoint=event.altKey&&canvas.contains(document.elementFromPoint(event.clientX,event.clientY));
  if(!drag.preview||(!drag.target&&!freeEndpoint)){
    cancelConnectorGesture();
    return;
  }
  clearConnectorGesture();
  if(drag.source){
    state.objects.push({...drag.preview,z:zMax()+1});
  }else{
    drag.connector[drag.side]=drag.preview[drag.side];
  }
  commitGesture();
  renderAll();
}
function updateConnectorModifier(event){
  if(event.key==='Alt'&&connectorGesture?.lastPointer){
    updateConnectorGesture({...connectorGesture.lastPointer,altKey:event.altKey});
  }
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
  const hits=state.objects.filter(o=>rectIntersects(wr,objectBounds(o)));
  const ids=groupingTargets(hits).map(o=>o.id);
  setSelection(marqueeStart.shift?[...state.selection,...ids]:ids);marquee.hidden=true;marqueeStart=null;
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
    const firstLayer=zMax()+1;
    const layers=new Map(objectsByLayer(payload.objects).map((o,i)=>[o.id,firstLayer+i]));
    const remapGroup=n=>{if(n.groupId){if(!groupMap.has(n.groupId))groupMap.set(n.groupId,uid('g_'));n.groupId=groupMap.get(n.groupId)}};
    payload.objects.filter(o=>o.type!=='connector').forEach(o=>{const n=deep(o),old=n.id;n.id=uid(n.type==='drawing'?'d':'o');map.set(old,n.id);remapGroup(n);
      if(isElement(n)){n.x+=dx;n.y+=dy}else if(n.type==='drawing')n.points=n.points.map(p=>({x:p.x+dx,y:p.y+dy}));n.z=layers.get(old);newObjs.push(n)});
    payload.objects.filter(o=>o.type==='connector').forEach(o=>{const n=deep(o);n.id=uid('c');remapGroup(n);if(n.from?.id&&map.has(n.from.id))n.from.id=map.get(n.from.id);else if(!n.from?.id){n.from.x+=dx;n.from.y+=dy}
      if(n.to?.id&&map.has(n.to.id))n.to.id=map.get(n.to.id);else if(!n.to?.id){n.to.x+=dx;n.to.y+=dy}n.z=layers.get(o.id);newObjs.push(n)});
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
const MINI_REFRESH_INTERVAL=1000/15;
let miniLastRender=-Infinity,miniRenderTimer=null;
function queueMiniRender(){
  if(!miniWrap.classList.contains('show')||miniRenderTimer!==null)return;
  const delay=MINI_REFRESH_INTERVAL-(performance.now()-miniLastRender);
  if(delay<=0)renderMini();
  else miniRenderTimer=setTimeout(renderMini,delay);
}
function renderMini(){
  if(miniRenderTimer!==null){clearTimeout(miniRenderTimer);miniRenderTimer=null}
  if(!miniWrap.classList.contains('show'))return;
  miniLastRender=performance.now();
  const W=156,H=92,D=2;mm.clearRect(0,0,minimap.width,minimap.height);mm.save();mm.scale(D,D);mm.fillStyle='#fdfdfc';mm.fillRect(0,0,W,H);
  if(!state.objects.length){minimap._map=null;mm.restore();return}
  const viewA=screenToWorld(0,0),viewB=screenToWorld(innerWidth,innerHeight);
  const items=objectsByLayer().map(object=>{
    const points=object.type==='connector'?connectorPolyline(object):object.type==='drawing'?object.points:null;
    return {object,points,bounds:points?boundsFromPoints(points):objectBounds(object)};
  });
  let minX=viewA.x,minY=viewA.y,maxX=viewB.x,maxY=viewB.y;
  for(const {bounds:b} of items){
    minX=Math.min(minX,b.x);minY=Math.min(minY,b.y);maxX=Math.max(maxX,b.x+b.w);maxY=Math.max(maxY,b.y+b.h);
  }
  const pad=12,bw=maxX-minX||1,bh=maxY-minY||1,s=Math.min((W-pad*2)/bw,(H-pad*2)/bh),ox=(W-bw*s)/2-minX*s,oy=(H-bh*s)/2-minY*s;
  for(const {object:o,points:pts,bounds:b} of items){
    if(pts){
      if(pts.length<2)continue;
      mm.strokeStyle=o.color||'#777';mm.lineWidth=1;mm.beginPath();
      mm.moveTo(ox+pts[0].x*s,oy+pts[0].y*s);
      for(let i=1;i<pts.length;i++)mm.lineTo(ox+pts[i].x*s,oy+pts[i].y*s);
      mm.stroke();
    }else{
      mm.fillStyle=o.type==='sticky'?(o.fill||'#fff2a7'):o.type==='image'?'#dfe2ff':'#e9e9e7';
      mm.fillRect(ox+b.x*s,oy+b.y*s,Math.max(3,b.w*s),Math.max(3,b.h*s));
    }
  }
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
async function buildExportCanvas(selectionOnly=false){
  const objects=deep(state.objects);
  const selected=new Set(state.selection);
  const toDraw=selectionOnly?objects.filter(o=>selected.has(o.id)):objects;
  if(!toDraw.length)return showToast(selectionOnly?'请先选中要导出的内容':'画布还没有内容');
  return renderBoardCanvas(toDraw,getAssetUrl,selectionOnly?'selection':'board',objects);
}
