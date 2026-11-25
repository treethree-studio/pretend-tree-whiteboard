function alignSelection(mode){
  const objs=selectedObjs().filter(o=>o.type!=='connector'&&!o.locked);if(objs.length<2)return;
  const bounds=objs.map(o=>({o,b:objectBounds(o)}));
  const minX=Math.min(...bounds.map(x=>x.b.x)),maxX=Math.max(...bounds.map(x=>x.b.x+x.b.w));
  const minY=Math.min(...bounds.map(x=>x.b.y)),maxY=Math.max(...bounds.map(x=>x.b.y+x.b.h));
  const centerX=(minX+maxX)/2,centerY=(minY+maxY)/2;
  discrete(()=>{
    bounds.forEach(({o,b})=>{
      let dx=0,dy=0;
      if(mode==='left')dx=minX-b.x;
      else if(mode==='centerX')dx=centerX-(b.x+b.w/2);
      else if(mode==='right')dx=maxX-(b.x+b.w);
      else if(mode==='top')dy=minY-b.y;
      else if(mode==='middle')dy=centerY-(b.y+b.h/2);
      else if(mode==='bottom')dy=maxY-(b.y+b.h);
      translateObject(o,dx,dy);
    });
  });
  const labelMap={left:'已左对齐',centerX:'已水平居中对齐',right:'已右对齐',top:'已顶对齐',middle:'已垂直居中对齐',bottom:'已底对齐'};
  renderAll();showToast(labelMap[mode]||'已对齐');
}
function equalizeSelection(mode){
  const objs=selectedObjs().filter(o=>!o.locked&&['sticky','image','rect','circle'].includes(o.type));if(objs.length<2)return;
  const ref=objs[0],rw=ref.w,rh=ref.h;
  discrete(()=>{
    objs.slice(1).forEach(o=>{
      if(mode==='width'){
        if(o.type==='image'){const ratio=o.w/o.h;o.w=rw;o.h=rw/ratio}
        else if(o.type==='circle'){o.w=rw;o.h=rw}
        else o.w=rw;
      }else if(mode==='height'){
        if(o.type==='image'){const ratio=o.w/o.h;o.h=rh;o.w=rh*ratio}
        else if(o.type==='circle'){o.w=rh;o.h=rh}
        else o.h=rh;
      }else{
        o.w=rw;o.h=rh;
      }
    });
  });
  renderAll();
  showToast(mode==='width'?'已等宽':mode==='height'?'已等高':'已等尺寸');
}
function distributeSelection(axis){
  const objs=selectedObjs().filter(o=>o.type!=='connector'&&!o.locked);if(objs.length<3)return;
  discrete(()=>{
    const sorted=objs.slice().sort((a,b)=>{const A=objectBounds(a),B=objectBounds(b);return axis==='x'?A.x-B.x:A.y-B.y});
    const first=objectBounds(sorted[0]),last=objectBounds(sorted.at(-1));
    const total=sorted.reduce((s,o)=>{const b=objectBounds(o);return s+(axis==='x'?b.w:b.h)},0);
    const span=axis==='x'?(last.x+last.w-first.x):(last.y+last.h-first.y);
    const gap=(span-total)/(sorted.length-1);let cursor=axis==='x'?first.x:first.y;
    sorted.forEach(o=>{const b=objectBounds(o),cur=axis==='x'?b.x:b.y,delta=cursor-cur;translateObject(o,axis==='x'?delta:0,axis==='y'?delta:0);cursor+=(axis==='x'?b.w:b.h)+gap});
  });
  renderAll();showToast(axis==='x'?'已横向等间距':'已纵向等间距');
}
function bringSelection(which){
  discrete(()=>{
    const selected=new Set(state.selection);
    if(which==='front'){let z=zMax()+1;state.objects.forEach(o=>{if(selected.has(o.id))o.z=z++})}
    else{let z=Math.min(0,...state.objects.map(o=>o.z||1))-state.selection.length;state.objects.forEach(o=>{if(selected.has(o.id))o.z=z++})}
  });renderAll();
}
function rotateSelection(deg){discrete(()=>selectedObjs().forEach(o=>{if(isElement(o))o.rot=(o.rot||0)+deg}));renderElements();markDirty();updateSelectionUI()}

function beginLabelEdit(id){
  const o=getObj(id);if(!o||o.type!=='connector'||!o.label)return;
  setSelection(selectionWithGroup(id,true));
  const n=$(`.connectorLabel[data-id="${id}"]`);if(!n)return;
  const before=modelSnapshot();n.contentEditable='true';n.classList.add('editing');n.focus();
  const range=document.createRange();range.selectNodeContents(n);range.collapse(false);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);
  const finish=()=>{
    o.label.text=n.innerText.trim()||'关系';n.contentEditable='false';n.classList.remove('editing');n.removeEventListener('blur',finish);
    pushHistory(before);scheduleSave();renderLabels();
  };
  n.addEventListener('blur',finish);
}
function labelPointerDown(ev){
  const id=ev.currentTarget.dataset.id,o=getObj(id);if(!o||o.locked)return;
  ev.preventDefault();ev.stopPropagation();setSelection(selectionWithGroup(id,ev.altKey));beginGesture();
  labelDrag={id,startX:ev.clientX,startY:ev.clientY,moved:false};try{ev.currentTarget.setPointerCapture(ev.pointerId)}catch(e){}
}

/* Connector endpoint handles */
function positionEndpointHandles(){
  endpointFrom.classList.remove('show');endpointTo.classList.remove('show');
  if(state.selection.length!==1)return;
  const o=getObj(state.selection[0]);if(!o||o.type!=='connector')return;
  const g=connectorGeom(o),a=worldToScreen(g.p1.x,g.p1.y),b=worldToScreen(g.p2.x,g.p2.y);
  endpointFrom.style.left=a.x+'px';endpointFrom.style.top=a.y+'px';endpointTo.style.left=b.x+'px';endpointTo.style.top=b.y+'px';
  endpointFrom.classList.add('show');endpointTo.classList.add('show');
}

/* Tool and creation */
function setTool(t){
  if(t==='image'){imageInput.click();return}
  state.tool=t;state.selection=[];updateSelectionUI();
  $$('.tool[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===(t==='highlighter'?'pen':t)));
  app.classList.toggle('connectorMode',t==='connector');
  app.classList.toggle('selectMode',t==='select');
  canvas.classList.remove('cursorCross','cursorText','cursorEraser');
  eraserCursor.classList.remove('show');
  if(['sticky','pen','highlighter','connector','rect','circle'].includes(t))canvas.classList.add('cursorCross');
  if(t==='text')canvas.classList.add('cursorText');
  if(t==='eraser'){canvas.classList.add('cursorEraser');updateEraserCursorSize()}
}
function createObject(type,p,bounds){
  const z=zMax()+1;let o;
  if(type==='sticky')o={id:uid(),type:'sticky',x:p.x-105,y:p.y-105,w:210,h:210,rot:0,fill:DEFAULTS.sticky,text:'输入想法…',z};
  if(type==='text')o={id:uid(),type:'text',x:p.x,y:p.y,w:190,h:56,rot:0,text:'输入文字',fontSize:28,fontWeight:600,color:DEFAULTS.text,align:'left',z};
  if(type==='rect')o={id:uid(),type:'rect',x:p.x-90,y:p.y-60,w:180,h:120,rot:0,fill:'transparent',stroke:DEFAULTS.shapeStroke,strokeWidth:2,z};
  if(type==='circle')o={id:uid(),type:'circle',x:p.x-70,y:p.y-70,w:140,h:140,rot:0,fill:'transparent',stroke:DEFAULTS.shapeStroke,strokeWidth:2,z};
  if(!o)return;
  if(bounds)Object.assign(o,bounds);
  discrete(()=>state.objects.push(o));renderElements();setTool('select');setSelection([o.id]);
  if(type==='sticky'||type==='text')setTimeout(()=>beginEdit(o.id),0);
}
function beginEdit(id,pointer){
  const o=getObj(id);
  if(!o||o.locked||state.tool!=='select'||!['sticky','text'].includes(o.type))return;
  const n=$(`.element[data-id="${id}"]`);
  const text=n?.querySelector('.editableText');
  if(!text||text.isContentEditable)return;

  text.contentEditable='plaintext-only';
  n.classList.add('editing');
  text.focus({preventScroll:true});
  let range=pointer&&document.caretRangeFromPoint(pointer.clientX,pointer.clientY);
  if(!range||!text.contains(range.startContainer)){
    range=document.createRange();
    range.selectNodeContents(text);
    range.collapse(false);
  }
  const selection=getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  text.addEventListener('blur',()=>{
    const value=text.innerText.replace(/\n+\s*$/,'');
    text.contentEditable='false';
    text.textContent=value;
    n.classList.remove('editing');
    if(value===(o.text??(o.type==='text'?'文字':'')))return;
    const before=modelSnapshot();
    o.text=value;
    pushHistory(before);
    scheduleSave();
    refreshBoardSearch();
  },{once:true});
}

/* Selection drag, snap and resize */
function startSelectionDrag(ev){
  if(ev.altKey&&state.selection.length){const payload=buildCopyPayload(state.selection);pastePayload(payload,0,0)}
  const movable=unlockedSelected();if(!movable.length)return;
  beginGesture();dragging={start:{x:ev.clientX,y:ev.clientY},moved:false,bases:new Map()};
  movable.forEach(o=>{
    if(isElement(o))dragging.bases.set(o.id,{x:o.x,y:o.y});
    else if(o.type==='drawing')dragging.bases.set(o.id,{points:deep(o.points)});
    else if(o.type==='connector')dragging.bases.set(o.id,{from:deep(o.from),to:deep(o.to)});
  });
}
function selectedMovableBoundsWithDelta(dx,dy){
  const objs=selectedObjs().filter(o=>o.type!=='connector');if(!objs.length)return null;
  const copies=objs.map(o=>{
    const c=deep(o);
    if(isElement(c)){c.x+=dx;c.y+=dy}
    else if(c.type==='drawing')c.points=c.points.map(p=>({x:p.x+dx,y:p.y+dy}));
    return c;
  });
  return unionBounds(copies);
}
function snapDelta(dx,dy){
  const sb=selectedMovableBoundsWithDelta(dx,dy);if(!sb)return{dx,dy,snapX:false,snapY:false};
  const threshold=7/state.camera.scale,cands=state.objects.filter(o=>!state.selection.includes(o.id)&&isElement(o));
  let bestX=null,bestY=null,bx=Infinity,by=Infinity,targetX=null,targetY=null;
  const sx=[sb.x,sb.x+sb.w/2,sb.x+sb.w],sy=[sb.y,sb.y+sb.h/2,sb.y+sb.h];
  for(const o of cands){
    const b=objectBounds(o),tx=[b.x,b.x+b.w/2,b.x+b.w],ty=[b.y,b.y+b.h/2,b.y+b.h];
    for(const a of sx)for(const t of tx){
      const d=t-a;if(Math.abs(d)<Math.abs(bx)&&Math.abs(d)<=threshold){bx=d;bestX=t;targetX=o}
    }
    for(const a of sy)for(const t of ty){
      const d=t-a;if(Math.abs(d)<Math.abs(by)&&Math.abs(d)<=threshold){by=d;bestY=t;targetY=o}
    }
  }
  if(bestX!==null){dx+=bx;showGuide('v',bestX)}else guideV.style.display='none';
  if(bestY!==null){dy+=by;showGuide('h',bestY)}else guideH.style.display='none';
  return{dx,dy,snapX:bestX!==null,snapY:bestY!==null,targetX,targetY};
}
function showGuide(axis,worldPos){
  const s=axis==='v'?worldToScreen(worldPos,0).x:worldToScreen(0,worldPos).y,g=axis==='v'?guideV:guideH;
  g.style.display='block';if(axis==='v')g.style.left=s+'px';else g.style.top=s+'px';
}
function hideGuides(){guideV.style.display=guideH.style.display='none'}
function applyDrag(clientX,clientY){
  if(!dragging)return;
  let dx=(clientX-dragging.start.x)/state.camera.scale,dy=(clientY-dragging.start.y)/state.camera.scale;
  let snapped=snapDelta(dx,dy);
  // 当用户主动整理并发生吸附时，小角度便签/图片自动回正，保证真正平行。
  if((snapped.snapX||snapped.snapY)){
    let changedRotation=false;
    selectedObjs().forEach(o=>{
      if(isElement(o)&&Math.abs(o.rot||0)<=5&&Math.abs(o.rot||0)>.05){o.rot=0;changedRotation=true}
    });
    if(changedRotation){
      state.selection.forEach(id=>{
        const o=getObj(id),n=$(`.element[data-id="${id}"]`);
        if(o&&n)n.style.transform=`rotate(${o.rot||0}deg)`;
      });
      snapped=snapDelta(dx,dy);
    }
  }
  dx=snapped.dx;dy=snapped.dy;
  if(Math.hypot(clientX-dragging.start.x,clientY-dragging.start.y)>2)dragging.moved=true;
  for(const [id,b] of dragging.bases){
    const o=getObj(id);if(!o)continue;
    if(isElement(o)){o.x=b.x+dx;o.y=b.y+dy;const n=$(`.element[data-id="${id}"]`);if(n){n.style.left=o.x+'px';n.style.top=o.y+'px'}}
    else if(o.type==='drawing')o.points=b.points.map(p=>({x:p.x+dx,y:p.y+dy}));
    else if(o.type==='connector'){
      if(!b.from.id)o.from={x:b.from.x+dx,y:b.from.y+dy};if(!b.to.id)o.to={x:b.to.x+dx,y:b.to.y+dy};
    }
  }
  markDirty();positionFloatingBar();
}
function elementPointerDown(ev){
  if(spaceDown||ev.button===1)return;
  const n=ev.currentTarget,id=n.dataset.id,o=getObj(id);
  const anchor=ev.target.closest('.anchor');
  if(anchor&&state.tool==='connector'){
    ev.preventDefault();ev.stopPropagation();beginGesture();
    connectorDraft={from:{id,anchor:anchor.dataset.anchor},current:screenToWorld(ev.clientX,ev.clientY),startX:ev.clientX,startY:ev.clientY};
    markDirty();return;
  }
  if(state.tool!=='select')return;
  if(ev.target.closest('.editableText[contenteditable="plaintext-only"]')){
    ev.stopPropagation();
    return;
  }
  if(document.activeElement?.matches('.editableText[contenteditable="plaintext-only"]')){
    document.activeElement.blur();
  }
  ev.preventDefault();ev.stopPropagation();
  if(o.locked){setSelection(selectionWithGroup(id,ev.altKey));return}
  if(!ev.shiftKey&&!state.selection.includes(id))setSelection(selectionWithGroup(id,ev.altKey));
  if(ev.target.classList.contains('resizeHandle')){
    if(state.selection.length!==1)setSelection([id]);beginGesture();
    const corner=ev.target.dataset.corner||'se',rot=o.rot||0,center={x:o.x+o.w/2,y:o.y+o.h/2};
    const localCorners={
      nw:{x:-o.w/2,y:-o.h/2},ne:{x:o.w/2,y:-o.h/2},se:{x:o.w/2,y:o.h/2},sw:{x:-o.w/2,y:o.h/2}
    };
    const opposite={nw:'se',ne:'sw',se:'nw',sw:'ne'}[corner];
    const ov=localCorners[opposite],or=rot*Math.PI/180;
    const oppWorld={x:center.x+ov.x*Math.cos(or)-ov.y*Math.sin(or),y:center.y+ov.x*Math.sin(or)+ov.y*Math.cos(or)};
    resizing={id,corner,rot,oppWorld,ratio:o.w/o.h,type:o.type};
    try{n.setPointerCapture(ev.pointerId)}catch(e){}
    return;
  }
  if(ev.target.classList.contains('rotationHandle')){
    if(state.selection.length!==1)setSelection([id]);beginGesture();
    const center={x:o.x+o.w/2,y:o.y+o.h/2},p=screenToWorld(ev.clientX,ev.clientY);
    rotating={id,center,startAngle:Math.atan2(p.y-center.y,p.x-center.x),startRot:o.rot||0};
    try{n.setPointerCapture(ev.pointerId)}catch(e){}
    return;
  }
  if(ev.shiftKey){
    const ids=selectionWithGroup(id,ev.altKey),all=ids.every(x=>state.selection.includes(x));
    setSelection(all?state.selection.filter(x=>!ids.includes(x)):[...state.selection,...ids]);
    if(!ids.some(x=>state.selection.includes(x)))return;
  }
  try{n.setPointerCapture(ev.pointerId)}catch(e){}
  startSelectionDrag(ev);
}

function startGroupTransform(kind,ev,corner=null){
  const objs=unlockedSelected().filter(o=>o.type!=='connector');if(objs.length<2)return;
  ev.preventDefault();ev.stopPropagation();beginGesture();
  const b=unionBounds(objs),center={x:b.x+b.w/2,y:b.y+b.h/2},bases=new Map(),p=screenToWorld(ev.clientX,ev.clientY);
  objs.forEach(o=>bases.set(o.id,deep(o)));
  groupTransform={kind,corner,b,center,bases,startAngle:Math.atan2(p.y-center.y,p.x-center.x)};
}
function applyGroupTransform(ev){
  if(!groupTransform)return;const g=groupTransform,p=screenToWorld(ev.clientX,ev.clientY);
  if(g.kind==='rotate'){
    let delta=(Math.atan2(p.y-g.center.y,p.x-g.center.x)-g.startAngle)*180/Math.PI;if(ev.shiftKey)delta=Math.round(delta/15)*15;
    for(const [id,base] of g.bases){
      const o=getObj(id);if(!o)continue;
      if(isElement(o)){const c={x:base.x+base.w/2,y:base.y+base.h/2},nc=rotatePoint(c,g.center,delta);o.x=nc.x-base.w/2;o.y=nc.y-base.h/2;o.rot=(base.rot||0)+delta}
      else if(o.type==='drawing')o.points=base.points.map(pt=>rotatePoint(pt,g.center,delta));
    }
  }else{
    const opposite={nw:{x:g.b.x+g.b.w,y:g.b.y+g.b.h},ne:{x:g.b.x,y:g.b.y+g.b.h},se:{x:g.b.x,y:g.b.y},sw:{x:g.b.x+g.b.w,y:g.b.y}}[g.corner];
    const start={nw:{x:g.b.x,y:g.b.y},ne:{x:g.b.x+g.b.w,y:g.b.y},se:{x:g.b.x+g.b.w,y:g.b.y+g.b.h},sw:{x:g.b.x,y:g.b.y+g.b.h}}[g.corner];
    let sx=(p.x-opposite.x)/((start.x-opposite.x)||1),sy=(p.y-opposite.y)/((start.y-opposite.y)||1);
    if(ev.shiftKey){const s=Math.abs(sx)>Math.abs(sy)?sx:sy;sx=sy=s}
    sx=Math.abs(sx)<.1?Math.sign(sx||1)*.1:sx;sy=Math.abs(sy)<.1?Math.sign(sy||1)*.1:sy;
    for(const [id,base] of g.bases){
      const o=getObj(id);if(!o)continue;
      if(isElement(o)){const c={x:base.x+base.w/2,y:base.y+base.h/2},nc={x:opposite.x+(c.x-opposite.x)*sx,y:opposite.y+(c.y-opposite.y)*sy};o.w=Math.max(30,base.w*Math.abs(sx));o.h=Math.max(30,base.h*Math.abs(sy));o.x=nc.x-o.w/2;o.y=nc.y-o.h/2}
      else if(o.type==='drawing')o.points=base.points.map(pt=>({x:opposite.x+(pt.x-opposite.x)*sx,y:opposite.y+(pt.y-opposite.y)*sy}));
    }
  }
  renderElements();markDirty();updateSelectionUI();
}
$$('.groupHandle').forEach(h=>h.addEventListener('pointerdown',e=>startGroupTransform('scale',e,h.dataset.corner)));
groupRotate.addEventListener('pointerdown',e=>startGroupTransform('rotate',e));

/* Pen and eraser */
function rdp(points,eps){
  if(points.length<3)return points;
  let max=0,index=0;for(let i=1;i<points.length-1;i++){const d=pointSegDistance(points[i],points[0],points.at(-1));if(d>max){max=d;index=i}}
  if(max>eps){const a=rdp(points.slice(0,index+1),eps),b=rdp(points.slice(index),eps);return a.slice(0,-1).concat(b)}
  return[points[0],points.at(-1)];
}
function updateEraserCursorSize(){
  const d=state.eraserRadius*2;eraserCursor.style.width=d+'px';eraserCursor.style.height=d+'px';
}
