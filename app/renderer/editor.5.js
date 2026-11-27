async function exportBoard(format,selectionOnly){
  const title=(state.title||'白板')+(selectionOnly?' - 选中内容':'');
  try{
    const out=await buildExportCanvas(selectionOnly);
    if(!out)return;
    const desktop=window.treeboardDesktop;
    if(desktop){
      const save=format==='PNG'?desktop.exportPNG:desktop.exportPDF;
      const result=await save({dataUrl:out.toDataURL('image/png'),title,width:out.width,height:out.height});
      if(result?.ok)showToast(format+' 已导出');
      else if(result?.error)showToast(result.error);
      return;
    }
    if(format==='PDF')return showToast('桌面版支持 PDF 导出');
    out.toBlob(blob=>{
      if(!blob)return showToast('PNG 导出失败');
      const download=document.createElement('a');
      download.href=URL.createObjectURL(blob);
      download.download=title+'.png';
      download.click();
      setTimeout(()=>URL.revokeObjectURL(download.href),1000);
    },'image/png');
  }catch(err){
    console.error(err);
    showToast('导出失败，请检查白板中的图片后重试');
  }
}

const shapePreview=document.createElement('div');
shapePreview.hidden=true;
world.appendChild(shapePreview);
let shapeDrag=null;

function startShapeDrag(ev,p){
  shapeDrag={type:state.tool,pointerId:ev.pointerId,start:p,clientX:ev.clientX,clientY:ev.clientY,moved:false};
  shapePreview.className=`shape shapePreview ${state.tool}`;
  canvas.setPointerCapture(ev.pointerId);
}

function updateShapeDrag(clientX,clientY,shiftKey){
  const drag=shapeDrag;
  if(!drag.moved&&Math.hypot(clientX-drag.clientX,clientY-drag.clientY)<4)return;
  drag.moved=true;
  const end=screenToWorld(clientX,clientY);
  const dx=end.x-drag.start.x,dy=end.y-drag.start.y;
  let w=Math.abs(dx),h=Math.abs(dy);
  if(shiftKey)w=h=Math.max(w,h);
  // Keep even a nearly horizontal or vertical drag visible.
  const minimum=4/state.camera.scale;
  w=Math.max(w,minimum);
  h=Math.max(h,minimum);
  drag.bounds={x:drag.start.x-(dx<0?w:0),y:drag.start.y-(dy<0?h:0),w,h};
  Object.assign(shapePreview.style,{left:`${drag.bounds.x}px`,top:`${drag.bounds.y}px`,width:`${w}px`,height:`${h}px`});
  shapePreview.hidden=false;
}

function cancelShapeDrag(){
  if(!shapeDrag)return;
  const {pointerId}=shapeDrag;
  shapeDrag=null;
  shapePreview.hidden=true;
  if(canvas.hasPointerCapture(pointerId))canvas.releasePointerCapture(pointerId);
}

/* Pointer flow: pan has highest priority in capture phase */
canvas.addEventListener('pointerdown',ev=>{
  if(!ev.isPrimary||shapeDrag||drawingGesture||connectorGesture)return;
  if((spaceDown&&ev.button===0)||ev.button===1){
    ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();
    panning={sx:ev.clientX,sy:ev.clientY,ox:state.camera.x,oy:state.camera.y};canvas.classList.add('cursorGrabbing');canvas.setPointerCapture(ev.pointerId);
  }
},true);

canvas.addEventListener('pointerdown',ev=>{
  closeTransientMenus();
  hidePenMenu();
  if(!ev.isPrimary||ev.button!==0||panning||shapeDrag||drawingGesture||connectorGesture)return;
  if(state.tool==='connector'){startConnectorDraft(ev);return}
  const p=screenToWorld(ev.clientX,ev.clientY);
  if(state.tool==='rect'||state.tool==='circle'){startShapeDrag(ev,p);return}
  if(state.tool==='sticky'||state.tool==='text'){createObject(state.tool,p);return}
  if(state.tool==='pen'||state.tool==='highlighter'){
    beginGesture();
    setSelection([]);
    const highlighter=state.tool==='highlighter';
    const {color,width}=highlighter?state.highlighter:state.pen;
    drawingGesture={id:uid('d'),type:'drawing',points:[p],color,width,z:zMax()+1};
    if(highlighter)drawingGesture.highlighter=true;
    state.objects.push(drawingGesture);
    canvas.setPointerCapture(ev.pointerId);
    markDirty();
    return;
  }
  if(state.tool==='eraser'){beginGesture();erasing={changed:false};eraseAt(p);return}
  if(state.tool==='select'){
    const hit=getObj(ev.target.closest('.vectorObject')?.dataset.id)||hitVector(p);
    if(hit){
      if(hit.locked){setSelection(selectionWithGroup(hit.id,ev.altKey));return}
      const ids=selectionWithGroup(hit.id,ev.altKey);
      if(ev.shiftKey){
        const all=ids.every(x=>state.selection.includes(x));setSelection(all?state.selection.filter(x=>!ids.includes(x)):[...state.selection,...ids]);
      }else if(!state.selection.includes(hit.id))setSelection(ids);
      startSelectionDrag(ev);return;
    }
    if(!ev.shiftKey)setSelection([]);startMarquee(ev);
  }
});
function updateDrawingPoint(event){
  const point=screenToWorld(event.clientX,event.clientY),minimum=2/state.camera.scale;
  const points=drawingGesture.points,first=points[0];
  if(drawingGesture.highlighter&&event.shiftKey){
    const line=dist(point,first)>=minimum?[first,point]:[first];
    drawingGesture.points=line;markDirty();return;
  }
  if(dist(point,points.at(-1))>=minimum){points.push(point);markDirty()}
}
canvas.addEventListener('pointermove',ev=>{
  if(connectorGesture){updateConnectorGesture(ev);return}
  if(shapeDrag){
    if(ev.pointerId===shapeDrag.pointerId){
      shapeDrag.lastPointer=ev;
      updateShapeDrag(ev.clientX,ev.clientY,ev.shiftKey);
    }
    return;
  }
  if(state.tool==='eraser'){eraserCursor.style.left=ev.clientX+'px';eraserCursor.style.top=ev.clientY+'px';eraserCursor.classList.add('show')}
  if(panning){state.camera.x=panning.ox+ev.clientX-panning.sx;state.camera.y=panning.oy+ev.clientY-panning.sy;applyCamera();return}
  if(state.tool==='connector'){previewConnectorHover(ev);return}
  if(groupTransform){applyGroupTransform(ev);return}
  if(labelDrag){
    const o=getObj(labelDrag.id);if(o?.label){
      if(Math.hypot(ev.clientX-labelDrag.startX,ev.clientY-labelDrag.startY)>2)labelDrag.moved=true;
      const p=screenToWorld(ev.clientX,ev.clientY),t=nearestTOnConnector(o,p),g=connectorGeom(o),pt=bezierPoint(g,t),tan=cubicTangent(g,t),len=Math.hypot(tan.x,tan.y)||1,n={x:-tan.y/len,y:tan.x/len};
      o.label.t=t;o.label.offset=(p.x-pt.x)*n.x+(p.y-pt.y)*n.y;markDirty();
    }return;
  }
  if(drawingGesture){
    if(!ev.isPrimary)return;
    updateDrawingPoint(ev);return;
  }
  if(erasing){if(eraseAt(screenToWorld(ev.clientX,ev.clientY)))erasing.changed=true;return}
  if(marqueeStart){updateMarquee(ev.clientX,ev.clientY);return}
  if(dragging){applyDrag(ev.clientX,ev.clientY);return}
  if(resizing?.type==='text'){
    if(ev.pointerId===resizing.pointerId)updateTextBoxResize(ev);
    return;
  }
  if(resizing){
    const o=getObj(resizing.id);if(!o)return;
    const p=screenToWorld(ev.clientX,ev.clientY),rad=-resizing.rot*Math.PI/180;
    const rotateGlobal=(q,r)=>({x:q.x*Math.cos(r)-q.y*Math.sin(r),y:q.x*Math.sin(r)+q.y*Math.cos(r)});
    const lp=rotateGlobal(p,rad),lo=rotateGlobal(resizing.oppWorld,rad);
    const shape=resizing.type==='rect'||resizing.type==='circle';
    const shapeMinimum=Math.min(4/state.camera.scale,o.w,o.h);
    let w=Math.max(shape?shapeMinimum:60,Math.abs(lp.x-lo.x));
    let h=Math.max(shape?shapeMinimum:50,Math.abs(lp.y-lo.y));
    const sx=Math.sign(lp.x-lo.x)||1,sy=Math.sign(lp.y-lo.y)||1;
    if(resizing.type==='image'||(shape&&ev.shiftKey)){
      if(w/h>resizing.ratio)h=w/resizing.ratio;else w=h*resizing.ratio;
    }
    const dragged={x:lo.x+sx*w,y:lo.y+sy*h},lc={x:(dragged.x+lo.x)/2,y:(dragged.y+lo.y)/2};
    const center=rotateGlobal(lc,-rad);
    o.w=w;o.h=h;o.x=center.x-w/2;o.y=center.y-h/2;
    const n=renderedElements.get(o.id);if(n){n.style.left=o.x+'px';n.style.top=o.y+'px';n.style.width=o.w+'px';n.style.height=o.h+'px'}
    markDirty();return;
  }
  if(rotating){
    const o=getObj(rotating.id);if(!o)return;
    const p=screenToWorld(ev.clientX,ev.clientY),a=Math.atan2(p.y-rotating.center.y,p.x-rotating.center.x);
    let deg=rotating.startRot+(a-rotating.startAngle)*180/Math.PI;
    if(ev.shiftKey)deg=Math.round(deg/15)*15;
    if(Math.abs(deg)<1.5)deg=0;
    o.rot=deg;
    const n=renderedElements.get(o.id);if(n)n.style.transform=`rotate(${deg}deg)`;
    markDirty();return;
  }
});
canvas.addEventListener('pointerup',ev=>{
  if(connectorGesture){finishConnectorGesture(ev);return}
  if(shapeDrag){
    if(ev.pointerId===shapeDrag.pointerId){
      updateShapeDrag(ev.clientX,ev.clientY,ev.shiftKey);
      const {type,start,bounds}=shapeDrag;
      cancelShapeDrag();
      createObject(type,start,bounds);
    }
    return;
  }
  if(panning){panning=null;canvas.classList.remove('cursorGrabbing');scheduleSave();return}
  if(groupTransform){groupTransform=null;commitGesture();markDirty();return}
  if(labelDrag){labelDrag=null;commitGesture();renderLabels();return}
  if(drawingGesture){
    if(!ev.isPrimary)return;
    updateDrawingPoint(ev);
    if(drawingGesture.points.length>1){
      drawingGesture.points=rdp(drawingGesture.points,.75/state.camera.scale);
      commitGesture();
    }else{
      state.objects=state.objects.filter(o=>o!==drawingGesture);
      cancelGesture();
    }
    drawingGesture=null;
    markDirty();
    return;
  }
  if(erasing){erasing=null;commitGesture();markDirty();return}
  if(marqueeStart){endMarquee();return}
  if(dragging){dragging=null;hideGuides();commitGesture();markDirty();return}
  if(resizing?.type==='text'){
    if(ev.pointerId===resizing.pointerId){
      updateTextBoxResize(ev);
      resizing=null;
      commitGesture();
      renderAll();
    }
    return;
  }
  if(resizing){resizing=null;commitGesture();renderElements();markDirty();updateSelectionUI();return}
  if(rotating){rotating=null;commitGesture();renderElements();markDirty();updateSelectionUI();return}
});
canvas.addEventListener('pointercancel',ev=>{
  if(connectorGesture){
    if(ev.pointerId===connectorGesture.pointerId)cancelConnectorGesture();
    return;
  }
  if(shapeDrag){
    if(ev.pointerId===shapeDrag.pointerId)cancelShapeDrag();
    return;
  }
  if(resizing?.type==='text'){
    if(ev.pointerId===resizing.pointerId)cancelTextBoxResize();
    return;
  }
  if(drawingGesture){
    if(!ev.isPrimary)return;
    state.objects=state.objects.filter(o=>o!==drawingGesture);
    markDirty();
  }
  panning=null;dragging=null;resizing=null;rotating=null;groupTransform=null;labelDrag=null;drawingGesture=null;erasing=null;
  marqueeStart=null;marquee.hidden=true;canvas.classList.remove('cursorGrabbing');hideGuides();cancelGesture();
});
canvas.addEventListener('lostpointercapture',ev=>{
  if(connectorGesture?.pointerId===ev.pointerId)cancelConnectorGesture();
  if(ev.pointerId===shapeDrag?.pointerId)cancelShapeDrag();
  if(resizing?.type==='text'&&ev.pointerId===resizing.pointerId)cancelTextBoxResize();
});
function shapeDragKey(ev){
  if(!shapeDrag)return false;
  if(ev.key==='Escape'&&ev.type==='keydown')cancelShapeDrag();
  if(ev.key==='Shift'&&shapeDrag?.lastPointer){
    const {clientX,clientY}=shapeDrag.lastPointer;
    updateShapeDrag(clientX,clientY,ev.shiftKey);
  }
  return true;
}
canvas.addEventListener('dblclick',ev=>{if(ev.target===canvas&&state.tool==='select')createObject('text',screenToWorld(ev.clientX,ev.clientY))});
canvas.addEventListener('wheel',ev=>{
  ev.preventDefault();const c=state.camera,old=c.scale,next=clamp(old*Math.exp(-ev.deltaY*.00115),.1,4),wx=(ev.clientX-c.x)/old,wy=(ev.clientY-c.y)/old;
  c.scale=next;c.x=ev.clientX-wx*next;c.y=ev.clientY-wy*next;applyCamera();scheduleSave();
  if(connectorGesture?.lastPointer)updateConnectorGesture(connectorGesture.lastPointer);
},{passive:false});
canvas.addEventListener('pointerenter',()=>{if(state.tool==='eraser'){updateEraserCursorSize();eraserCursor.classList.add('show')}});
canvas.addEventListener('pointerleave',()=>{
  if(state.tool==='eraser'&&!erasing)eraserCursor.classList.remove('show');
  if(state.tool==='connector'&&!connectorGesture)showConnectorAnchors();
});

/* Endpoint handle drag */
endpointFrom.addEventListener('pointerdown',e=>startEndpointDrag('from',e));
endpointTo.addEventListener('pointerdown',e=>startEndpointDrag('to',e));
window.addEventListener('blur',cancelConnectorGesture);

/* UI events */
const penButton=$('[data-tool="pen"]'),penMenu=$('#penMenu'),penChoices=$$('[data-pen-mode]');
function updatePenMenu(){
  penChoices.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.penMode===state.tool)));
  $('#highlighterWidthControl').hidden=state.tool!=='highlighter';
}
function hidePenMenu(){
  penMenu.hidden=true;
  penButton.setAttribute('aria-expanded','false');
}
penButton.onclick=()=>{
  if(!penMenu.hidden)return hidePenMenu();
  if(state.tool!=='pen'&&state.tool!=='highlighter')setTool('pen');
  updatePenMenu();
  penMenu.hidden=false;
  penButton.setAttribute('aria-expanded','true');
  const anchor=penButton.getBoundingClientRect(),panel=penMenu.getBoundingClientRect();
  penMenu.style.left=(anchor.right+10)+'px';
  penMenu.style.top=clamp(anchor.top,8,innerHeight-panel.height-8)+'px';
};
penChoices.forEach(button=>button.onclick=()=>{
  setTool(button.dataset.penMode);
  updatePenMenu();
});
$('#highlighterWidth').oninput=event=>{
  state.highlighter.width=Number(event.target.value);
  $('#highlighterWidthValue').value=event.target.value;
};
document.addEventListener('click',event=>{
  if(!penMenu.contains(event.target)&&!penButton.contains(event.target))hidePenMenu();
});
$$('.tool[data-tool]:not([data-tool="pen"])').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
$('#undoBtn').onclick=undo;$('#redoBtn').onclick=redo;$('#zoomOut').onclick=()=>zoomCenter(.86);$('#zoomIn').onclick=()=>zoomCenter(1.16);$('#fitBtn').onclick=fitContent;
$('#miniBtn').onclick=()=>{hideBoardBookmarks();miniWrap.classList.toggle('show');renderMini()};
