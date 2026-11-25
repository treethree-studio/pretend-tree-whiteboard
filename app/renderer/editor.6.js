const exportMenu=document.getElementById('exportMenu');
$('#exportBtn').onclick=e=>{e.stopPropagation();exportMenu.classList.toggle('show')};
document.getElementById('exportPngItem').onclick=()=>{exportMenu.classList.remove('show');exportPNG()};document.getElementById('exportPdfItem').onclick=()=>{exportMenu.classList.remove('show');exportPDF()};
boardTitle.addEventListener('input',()=>{state.title=boardTitle.innerText.trim()||'未命名白板';scheduleSave()});boardTitle.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();boardTitle.blur()}});
let pendingBoardRename=Promise.resolve();
let titleBeforeEdit;
boardTitle.addEventListener('focus',()=>{titleBeforeEdit=state.title});
boardTitle.addEventListener('blur',()=>{
  const desktop=window.treeboardDesktop,title=state.title;
  if(!desktop||title===titleBeforeEdit)return;
  pendingBoardRename=pendingBoardRename.then(async()=>{
    const result=await desktop.renameCurrent(title);
    if(result?.ok&&result.title&&state.title===title){
      state.title=result.title;
      if(document.activeElement!==boardTitle)boardTitle.textContent=result.title;
      scheduleSave();
    }
  }).catch(err=>console.error(err));
});

const saveDialog=document.getElementById('saveRecovery');
const saveDialogError=document.getElementById('saveRecoveryError');
const saveDialogButtons=[...saveDialog.querySelectorAll('button')];
let leavingBoard=false;

function openSaveRecovery(){
  saveDialogError.textContent=saveError;
  saveDialog.returnValue='';
  saveDialog.showModal();
  return new Promise(resolve=>{
    saveDialog.addEventListener('close',()=>resolve(saveDialog.returnValue==='saved'),{once:true});
  });
}

async function recoverSave(saveAs){
  saveDialogButtons.forEach(button=>{button.disabled=true});
  saveDialogError.textContent='正在保存…';
  try{
    const saved=saveAs?(await saveState(true)&&await flushSave()):await flushSave();
    if(saved)saveDialog.close('saved');
    else saveDialogError.textContent=saveError;
  }finally{
    saveDialogButtons.forEach(button=>{button.disabled=false});
    if(saveDialog.open)document.getElementById('retrySave').focus();
  }
}
document.getElementById('retrySave').onclick=()=>recoverSave(false);
const saveAsButton=document.getElementById('saveBoardAs');
saveAsButton.hidden=!window.treeboardDesktop;
saveAsButton.onclick=()=>recoverSave(true);
document.getElementById('keepEditing').onclick=()=>saveDialog.close();
saveDialog.addEventListener('cancel',e=>{
  if(document.getElementById('retrySave').disabled)e.preventDefault();
});
document.getElementById('saveStatus').onclick=()=>{
  if(!leavingBoard&&!saveDialog.open)void openSaveRecovery();
};

async function leaveBoard(action){
  if(leavingBoard||saveDialog.open)return;
  leavingBoard=true;
  try{
    if(await flushSave()||await openSaveRecovery())await action();
  }catch(err){
    console.error(err);
    showToast('操作未完成，请重试');
  }finally{
    leavingBoard=false;
  }
}
document.getElementById('homeBtn').onclick=()=>leaveBoard(()=>window.treeboardDesktop?.goHome());
document.getElementById('minWin').onclick=()=>window.treeboardDesktop?.minimize();
document.getElementById('maxWin').onclick=()=>window.treeboardDesktop?.maximizeToggle();
document.getElementById('closeWin').onclick=()=>window.treeboardDesktop?.closeWindow();
document.addEventListener('click',e=>{if(!exportMenu.contains(e.target)&&!e.target.closest('#exportBtn'))exportMenu.classList.remove('show')});

imageInput.onchange=async()=>{
  const files=[...imageInput.files];imageInput.value='';setTool('select');if(!files.length)return;
  await importImageFiles(files,screenToWorld(innerWidth/2,innerHeight/2));
};
canvas.addEventListener('dragover',e=>{e.preventDefault();dropOverlay.classList.add('show')});
canvas.addEventListener('dragleave',()=>dropOverlay.classList.remove('show'));
canvas.addEventListener('drop',async e=>{
  e.preventDefault();dropOverlay.classList.remove('show');
  const files=[...e.dataTransfer.files].filter(f=>f.type&&f.type.startsWith('image/'));if(!files.length)return;
  await importImageFiles(files,screenToWorld(e.clientX,e.clientY));
});
minimap.addEventListener('click',e=>{
  const m=minimap._map;if(!m)return;const r=minimap.getBoundingClientRect(),x=(e.clientX-r.left)*156/r.width,y=(e.clientY-r.top)*92/r.height;
  const wx=(x-m.ox)/m.s,wy=(y-m.oy)/m.s;state.camera.x=innerWidth/2-wx*state.camera.scale;state.camera.y=innerHeight/2-wy*state.camera.scale;applyCamera();scheduleSave();
});
document.addEventListener('click',e=>{
  if(!floatingBar.contains(e.target)&&!colorPopover.contains(e.target)&&!arrangePopover.contains(e.target)&&!textAlignPopover.contains(e.target)&&!objectMenu.contains(e.target)){closeTransientMenus()}
});

/* Keyboard: modifiers never leak into single-key tools */
document.addEventListener('keydown',e=>{
  if(saveDialog.open)return;
  if(shapeDragKey(e)){if(e.key==='Escape')e.preventDefault();return}
  const editing=document.activeElement?.isContentEditable||['INPUT','TEXTAREA'].includes(document.activeElement?.tagName);
  if(e.code==='Space'&&!editing){spaceDown=true;canvas.classList.add('cursorGrab');e.preventDefault();return}
  if(editing)return;
  const mod=e.ctrlKey||e.metaKey;
  if(mod){
    const k=e.key.toLowerCase();
    if(k==='a'&&!e.altKey&&!e.shiftKey){
      e.preventDefault();
      if(state.tool!=='select')setTool('select');
      setSelection(state.objects.map(o=>o.id));
      return;
    }
    if(k==='z'){e.preventDefault();e.shiftKey?redo():undo();return}
    if(k==='y'){e.preventDefault();redo();return}
    if(k==='c'){e.preventDefault();if(state.selection.length)copiedPayload=buildCopyPayload(state.selection);return}
    if(k==='v'){e.preventDefault();if(copiedPayload)pastePayload(copiedPayload,28,28);return}
    if(k==='g'){e.preventDefault();e.shiftKey?ungroupSelection():groupSelection();return}
    if(e.shiftKey&&(e.key==='>'||e.key==='<')){
      const textObjs=selectedObjs().filter(o=>o.type==='text'&&!o.locked);
      if(textObjs.length){
        e.preventDefault();
        const delta=e.key==='>'?1:-1;
        const before=modelSnapshot();
        textObjs.forEach(o=>o.fontSize=clamp((o.fontSize||28)+delta,8,144));
        pushHistory(before);renderAll();scheduleSave();return;
      }
    }
    return;
  }
  if(e.altKey)return;
  if((e.key==='Delete'||e.key==='Backspace')&&state.selection.length){e.preventDefault();deleteSelection();return}
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&state.selection.length){
    e.preventDefault();const step=e.shiftKey?10:1,dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,dy=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;
    discrete(()=>unlockedSelected().forEach(o=>translateObject(o,dx,dy)));renderAll();return;
  }
  const map={v:'select',n:'sticky',t:'text',p:'pen',e:'eraser',c:'connector',o:'circle',r:'rect',i:'image'};
  const t=map[e.key.toLowerCase()];if(t){e.preventDefault();setTool(t)}
});
document.addEventListener('keyup',e=>{shapeDragKey(e);if(e.code==='Space'){spaceDown=false;canvas.classList.remove('cursorGrab')}});

/* Initial content */
function initialExample(){
  const cx=innerWidth/2,cy=innerHeight/2;
  const a={id:uid(),type:'sticky',x:cx-240,y:cy-125,w:210,h:210,rot:0,fill:'#FFF2A7',text:'先把想法写下来',z:3};
  const b={id:uid(),type:'sticky',x:cx+60,y:cy-45,w:190,h:190,rot:0,fill:'#DFEEFF',text:'再慢慢整理关系',z:4};
  const c={id:uid('c'),type:'connector',from:{id:a.id,anchor:'e'},to:{id:b.id,anchor:'w'},color:'#202020',width:3,arrow:'end',z:2};
  const d={id:uid('d'),type:'drawing',points:[{x:cx-305,y:cy+150},{x:cx-265,y:cy+128},{x:cx-220,y:cy+135},{x:cx-185,y:cy+160}],color:'#7267FF',width:4,z:2};
  state.objects=[a,b,c,d];
}
async function bootstrap(){loadRecentColors();let loaded=false;if(window.treeboardDesktop){try{const payload=await window.treeboardDesktop.getCurrentBoard();if(payload?.board){await hydrateTreeboard(payload.board);loaded=true}}catch(e){console.error(e)}}else loaded=loadState();if(!loaded){state.title='未命名白板';state.objects=[];state.camera={x:0,y:0,scale:1}}renderAll();if(localStorage.getItem('pretend_tree_editor_hint_seen')!=='1'){$('#hint').classList.add('show');setTimeout(()=>{$('#hint').classList.remove('show');localStorage.setItem('pretend_tree_editor_hint_seen','1')},4500)}}
bootstrap();
window.treeboardDesktop?.onBeforeClose(()=>leaveBoard(()=>window.treeboardDesktop.confirmClose()));
window.treeboardDesktop?.onOpenBoard(filePath=>leaveBoard(async()=>{
  const result=await window.treeboardDesktop.openBoardPath(filePath);
  if(!result?.ok)showToast(result?.error||'无法打开白板');
}));
window.addEventListener('resize',()=>{applyCamera();positionFloatingBar()});
