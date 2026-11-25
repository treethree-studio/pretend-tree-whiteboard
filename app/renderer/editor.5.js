async function exportPNG(){const out=await buildExportCanvas();if(!out)return;const dataUrl=out.toDataURL('image/png');if(window.treeboardDesktop){const r=await window.treeboardDesktop.exportPNG({dataUrl,title:state.title,width:out.width,height:out.height});if(r?.ok)showToast('PNG 已导出');else if(r?.error)showToast(r.error);return}out.toBlob(blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(state.title||'whiteboard')+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)},'image/png')}
async function exportPDF(){const out=await buildExportCanvas();if(!out)return;const dataUrl=out.toDataURL('image/png');if(window.treeboardDesktop){const r=await window.treeboardDesktop.exportPDF({dataUrl,title:state.title,width:out.width,height:out.height});if(r?.ok)showToast('PDF 已导出');else if(r?.error)showToast(r.error);return}showToast('桌面版支持 PDF 导出')}

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
  if(shapeDrag)return;
  if((spaceDown||ev.button===1)){
    ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();
    panning={sx:ev.clientX,sy:ev.clientY,ox:state.camera.x,oy:state.camera.y};canvas.classList.add('cursorGrabbing');canvas.setPointerCapture(ev.pointerId);
  }
},true);

canvas.addEventListener('pointerdown',ev=>{
  closeTransientMenus();
  if(ev.button!==0||panning||shapeDrag)return;
  const p=screenToWorld(ev.clientX,ev.clientY);
  if(state.tool==='rect'||state.tool==='circle'){startShapeDrag(ev,p);return}
  if(state.tool==='sticky'||state.tool==='text'){createObject(state.tool,p);return}
  if(state.tool==='pen'){
    beginGesture();state.selection=[];drawingGesture={id:uid('d'),type:'drawing',points:[p],color:state.pen.color,width:state.pen.width,z:zMax()+1};
    state.objects.push(drawingGesture);markDirty();return;
  }
  if(state.tool==='eraser'){beginGesture();erasing={changed:false};eraseAt(p);return}
  if(state.tool==='select'){
    const hit=hitVector(p);
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
canvas.addEventListener('pointermove',ev=>{
  if(shapeDrag){
    if(ev.pointerId===shapeDrag.pointerId){
      shapeDrag.lastPointer=ev;
      updateShapeDrag(ev.clientX,ev.clientY,ev.shiftKey);
    }
    return;
  }
  if(state.tool==='eraser'){eraserCursor.style.left=ev.clientX+'px';eraserCursor.style.top=ev.clientY+'px';eraserCursor.classList.add('show')}
  if(panning){state.camera.x=panning.ox+ev.clientX-panning.sx;state.camera.y=panning.oy+ev.clientY-panning.sy;applyCamera();return}
  if(groupTransform){applyGroupTransform(ev);return}
  if(labelDrag){
    const o=getObj(labelDrag.id);if(o?.label){
      if(Math.hypot(ev.clientX-labelDrag.startX,ev.clientY-labelDrag.startY)>2)labelDrag.moved=true;
      const p=screenToWorld(ev.clientX,ev.clientY),t=nearestTOnConnector(o,p),g=connectorGeom(o),pt=bezierPoint(g,t),tan=cubicTangent(g,t),len=Math.hypot(tan.x,tan.y)||1,n={x:-tan.y/len,y:tan.x/len};
      o.label.t=t;o.label.offset=(p.x-pt.x)*n.x+(p.y-pt.y)*n.y;renderLabels();markDirty(false,true);
    }return;
  }
  if(drawingGesture){
    const p=screenToWorld(ev.clientX,ev.clientY),last=drawingGesture.points.at(-1),min=2/state.camera.scale;
    if(dist(p,last)>=min){drawingGesture.points.push(p);markDirty()}return;
  }
  if(erasing){if(eraseAt(screenToWorld(ev.clientX,ev.clientY)))erasing.changed=true;return}
  if(marqueeStart){updateMarquee(ev.clientX,ev.clientY);return}
  if(dragging){applyDrag(ev.clientX,ev.clientY);return}
  if(connectorDraft){connectorDraft.current=screenToWorld(ev.clientX,ev.clientY);markDirty();return}
  if(endpointDrag){moveEndpointDrag(ev.clientX,ev.clientY);return}
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
    const n=$(`.element[data-id="${o.id}"]`);if(n){n.style.left=o.x+'px';n.style.top=o.y+'px';n.style.width=o.w+'px';n.style.height=o.h+'px'}
    markDirty();positionFloatingBar();return;
  }
  if(rotating){
    const o=getObj(rotating.id);if(!o)return;
    const p=screenToWorld(ev.clientX,ev.clientY),a=Math.atan2(p.y-rotating.center.y,p.x-rotating.center.x);
    let deg=rotating.startRot+(a-rotating.startAngle)*180/Math.PI;
    if(ev.shiftKey)deg=Math.round(deg/15)*15;
    if(Math.abs(deg)<1.5)deg=0;
    o.rot=deg;
    const n=$(`.element[data-id="${o.id}"]`);if(n)n.style.transform=`rotate(${deg}deg)`;
    markDirty();positionFloatingBar();return;
  }
});
canvas.addEventListener('pointerup',ev=>{
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
  if(groupTransform){groupTransform=null;commitGesture();renderAll();return}
  if(labelDrag){labelDrag=null;commitGesture();renderLabels();return}
  if(drawingGesture){
    drawingGesture.points=rdp(drawingGesture.points,.75/state.camera.scale);drawingGesture=null;commitGesture();markDirty();return;
  }
  if(erasing){erasing=null;commitGesture();markDirty();return}
  if(marqueeStart){endMarquee();return}
  if(dragging){dragging=null;hideGuides();commitGesture();markDirty();return}
  if(connectorDraft){completeConnectorDraft(ev.clientX,ev.clientY);return}
  if(endpointDrag){endEndpointDrag(ev.clientX,ev.clientY);return}
  if(resizing){resizing=null;commitGesture();renderElements();markDirty();updateSelectionUI();return}
  if(rotating){rotating=null;commitGesture();renderElements();markDirty();updateSelectionUI();return}
});
canvas.addEventListener('pointercancel',ev=>{
  if(shapeDrag){
    if(ev.pointerId===shapeDrag.pointerId)cancelShapeDrag();
    return;
  }
  panning=null;dragging=null;resizing=null;rotating=null;groupTransform=null;labelDrag=null;drawingGesture=null;erasing=null;
  marqueeStart=null;marquee.hidden=true;canvas.classList.remove('cursorGrabbing');hideGuides();cancelGesture();
});
canvas.addEventListener('lostpointercapture',ev=>{
  if(ev.pointerId===shapeDrag?.pointerId)cancelShapeDrag();
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
},{passive:false});
canvas.addEventListener('pointerenter',()=>{if(state.tool==='eraser'){updateEraserCursorSize();eraserCursor.classList.add('show')}});
canvas.addEventListener('pointerleave',()=>{if(state.tool==='eraser'&&!erasing)eraserCursor.classList.remove('show')});

/* Endpoint handle drag */
endpointFrom.addEventListener('pointerdown',e=>startEndpointDrag('from',e));
endpointTo.addEventListener('pointerdown',e=>startEndpointDrag('to',e));
document.addEventListener('pointermove',e=>{if(endpointDrag)moveEndpointDrag(e.clientX,e.clientY);if(connectorDraft){connectorDraft.current=screenToWorld(e.clientX,e.clientY);markDirty()}});
document.addEventListener('pointerup',e=>{if(endpointDrag)endEndpointDrag(e.clientX,e.clientY);else if(connectorDraft)completeConnectorDraft(e.clientX,e.clientY)});

/* UI events */
$$('.tool[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
$('#undoBtn').onclick=undo;$('#redoBtn').onclick=redo;$('#zoomOut').onclick=()=>zoomCenter(.86);$('#zoomIn').onclick=()=>zoomCenter(1.16);$('#fitBtn').onclick=fitContent;
$('#miniBtn').onclick=()=>miniWrap.classList.toggle('show');
