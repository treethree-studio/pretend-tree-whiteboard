async function exportPNG(){const out=await buildExportCanvas();if(!out)return;const dataUrl=out.toDataURL('image/png');if(window.treeboardDesktop){const r=await window.treeboardDesktop.exportPNG({dataUrl,title:state.title,width:out.width,height:out.height});if(r?.ok)showToast('PNG 已导出');else if(r?.error)showToast(r.error);return}out.toBlob(blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(state.title||'whiteboard')+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)},'image/png')}
async function exportPDF(){const out=await buildExportCanvas();if(!out)return;const dataUrl=out.toDataURL('image/png');if(window.treeboardDesktop){const r=await window.treeboardDesktop.exportPDF({dataUrl,title:state.title,width:out.width,height:out.height});if(r?.ok)showToast('PDF 已导出');else if(r?.error)showToast(r.error);return}showToast('桌面版支持 PDF 导出')}

/* Pointer flow: pan has highest priority in capture phase */
canvas.addEventListener('pointerdown',ev=>{
  if((spaceDown||ev.button===1)){
    ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();
    panning={sx:ev.clientX,sy:ev.clientY,ox:state.camera.x,oy:state.camera.y};canvas.classList.add('cursorGrabbing');canvas.setPointerCapture(ev.pointerId);
  }
},true);

canvas.addEventListener('pointerdown',ev=>{
  closeTransientMenus();
  if(ev.button!==0||panning)return;
  const p=screenToWorld(ev.clientX,ev.clientY);
  if(['sticky','text','rect','circle'].includes(state.tool)){createObject(state.tool,p);return}
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
    let w=Math.max(60,Math.abs(lp.x-lo.x)),h=Math.max(50,Math.abs(lp.y-lo.y));
    const sx=Math.sign(lp.x-lo.x)||1,sy=Math.sign(lp.y-lo.y)||1;
    if(resizing.type==='image'){
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
canvas.addEventListener('pointercancel',()=>{panning=null;dragging=null;resizing=null;rotating=null;groupTransform=null;labelDrag=null;drawingGesture=null;erasing=null;marqueeStart=null;hideGuides();cancelGesture()});
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
