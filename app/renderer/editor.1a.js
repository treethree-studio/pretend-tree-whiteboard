const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const app=$('#app'),canvas=$('#canvas'),world=$('#world'),elementsRoot=$('#elements'),labelsRoot=$('#labels');
const connectorGroup=$('#connectorGroup'),drawingGroup=$('#drawingGroup'),highlightLayer=$('#highlightLayer'),draftConnector=$('#draftConnector');
const boardTitle=$('#boardTitle'),floatingBar=$('#floatingBar'),colorPopover=$('#colorPopover'),arrangePopover=$('#arrangePopover'),textAlignPopover=$('#textAlignPopover'),objectMenu=$('#objectMenu');
const marquee=$('#marquee'),guideV=$('#guideV'),guideH=$('#guideH');
const endpointFrom=$('#endpointFrom'),endpointTo=$('#endpointTo'),eraserCursor=$('#eraserCursor');
const groupBox=$('#groupBox'),groupRotate=$('#groupRotate');
const minimap=$('#minimap'),mm=minimap.getContext('2d'),miniWrap=$('#miniWrap'),dropOverlay=$('#dropOverlay'),toast=$('#toast'),imageInput=$('#imageInput');

const PALETTES={
  soft:['#FFF2A7','#DFEEFF','#E3F2D3','#E9DDFF','#FFE3E9','#FFFFFF'],
  classic:['#FFD84D','#78B7FF','#67D58B','#FF8B9B','#B99AFF','#FFFFFF'],
  mono:['#FFFFFF','#F0F0EE','#D4D4D1','#8A8A86','#202020','#7267FF']
};
const LINE_COLORS=['#202020','#666666','#E85D5D','#4263EB','#7267FF','#3A8F65'];
const DEFAULTS={
  sticky:'#FFF2A7', text:'#202020', line:'#202020', shapeFill:'transparent', shapeStroke:'#202020'
};
const HIGHLIGHT_OPACITY=.38;

let state={
  title:'Untitled Board',
  camera:{x:0,y:0,scale:1},
  tool:'select',
  objects:[],
  selection:[],
  pen:{color:'#202020',width:4},
  highlighter:{color:'#FFDF38',width:24},
  eraserRadius:14
};
let history=[],future=[],gestureBefore=null;
let copiedPayload=null;
let spaceDown=false,panning=null,dragging=null,resizing=null,rotating=null,drawingGesture=null,erasing=null,marqueeStart=null;
let connectorDraft=null,endpointDrag=null,labelDrag=null,groupTransform=null;
let dirtyVectors=false,dirtyMini=false,rafPending=false;
let saveTimer=null,toastTimer=null;
let recentColors=[];
let paletteApply=null,paletteAllowTransparent=false;
let menuTargetIds=[];
let assetUrlCache=new Map(),assetBlobCache=new Map();

const uid=(p='o')=>p+Math.random().toString(36).slice(2,10);
const deep=o=>JSON.parse(JSON.stringify(o));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const getObj=id=>state.objects.find(o=>o.id===id);
const selectedObjs=()=>state.selection.map(getObj).filter(Boolean);
const isVector=o=>o&&['drawing','connector'].includes(o.type);
const isElement=o=>o&&!isVector(o);
const linkable=o=>o&&['sticky','text','rect','circle','image'].includes(o.type);
const zMax=()=>Math.max(1,...state.objects.map(o=>o.z||1));
const modelSnapshot=()=>JSON.stringify({objects:state.objects});
const sameSnapshot=(a,b)=>a===b;
const groupMembers=gid=>state.objects.filter(o=>o.groupId&&o.groupId===gid);
const unlockedSelected=()=>selectedObjs().filter(o=>!o.locked);
function selectionWithGroup(id,inner=false){
  const o=getObj(id);if(!o)return[];
  if(o.groupId&&!inner)return groupMembers(o.groupId).map(x=>x.id);
  return[id];
}
function translateObject(o,dx,dy){
  if(!o||o.locked)return;
  if(isElement(o)){o.x+=dx;o.y+=dy}
  else if(o.type==='drawing')o.points=o.points.map(p=>({x:p.x+dx,y:p.y+dy}));
  else if(o.type==='connector'){
    if(!o.from?.id){o.from.x+=dx;o.from.y+=dy}
    if(!o.to?.id){o.to.x+=dx;o.to.y+=dy}
  }
}
function cubicTangent(g,t){
  const u=1-t;return{
    x:3*u*u*(g.c1.x-g.p1.x)+6*u*t*(g.c2.x-g.c1.x)+3*t*t*(g.p2.x-g.c2.x),
    y:3*u*u*(g.c1.y-g.p1.y)+6*u*t*(g.c2.y-g.c1.y)+3*t*t*(g.p2.y-g.c2.y)
  };
}
function nearestTOnConnector(o,p){
  const g=connectorGeom(o);let bestT=.5,best=Infinity;
  for(let i=0;i<=100;i++){const t=i/100,q=bezierPoint(g,t),d=dist(q,p);if(d<best){best=d;bestT=t}}
  return bestT;
}

function showToast(msg){
  toast.textContent=msg;toast.classList.add('show');clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove('show'),1300);
}
function updateUndoRedo(){
  $('#undoBtn').disabled=!history.length;$('#redoBtn').disabled=!future.length;
}
function pushHistory(before){
  if(!before||sameSnapshot(before,modelSnapshot()))return false;
  history.push(before);if(history.length>80)history.shift();future=[];updateUndoRedo();return true;
}
function beginGesture(){gestureBefore=modelSnapshot()}
function commitGesture(){
  if(gestureBefore){pushHistory(gestureBefore);gestureBefore=null}
  scheduleSave();
}
function cancelGesture(){gestureBefore=null}
function discrete(fn){
  const before=modelSnapshot();fn();pushHistory(before);scheduleSave();
}
function undo(){
  if(!history.length)return;
  future.push(modelSnapshot());
  const snap=JSON.parse(history.pop());state.objects=snap.objects;state.selection=[];
  renderAll();scheduleSave();updateUndoRedo();
}
function redo(){
  if(!future.length)return;
  history.push(modelSnapshot());
  const snap=JSON.parse(future.pop());state.objects=snap.objects;state.selection=[];
  renderAll();scheduleSave();updateUndoRedo();
}

let saveRevision=0,savedRevision=0,saveInFlight=null,saveError='';
function scheduleSave(){
  saveRevision++;
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{saveTimer=null;void saveState()},650);
}
function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob)})}
function dataUrlToBlob(dataUrl){const [meta,b64]=String(dataUrl).split(',');const mime=(meta.match(/data:([^;]+)/)||[])[1]||'application/octet-stream';const bin=atob(b64||''),arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type:mime})}
async function serializeTreeboard(){
  const {title,camera,objects}=deep({title:state.title,camera:state.camera,objects:state.objects});
  const assets={};
  const assetIds=new Set(objects.filter(o=>o.type==='image'&&o.assetId).map(o=>o.assetId));
  for(const id of assetIds){
    const blob=await getAssetBlob(id);
    if(!blob)throw new Error('有图片资源无法读取，请重试或移除无法加载的图片。');
    assets[id]=await blobToDataUrl(blob);
  }
  let preview=null;
  try{preview=minimap.toDataURL('image/png')}catch{}
  return{format:'treeboard',version:1,title,camera,objects,assets,preview,updatedAt:new Date().toISOString()};
}
async function hydrateTreeboard(board){state.title=board?.title||'未命名白板';state.camera=board?.camera||{x:0,y:0,scale:1};state.objects=deep(board?.objects||[]);state.selection=[];const remap=new Map();for(const [oldId,dataUrl] of Object.entries(board?.assets||{})){try{const newId=await putAsset(dataUrlToBlob(dataUrl));remap.set(oldId,newId)}catch(e){}}state.objects.forEach(o=>{if(o.type==='image'&&o.assetId&&remap.has(o.assetId))o.assetId=remap.get(o.assetId)});boardTitle.textContent=state.title}
function showSaveStatus(text,failed=false){
  const el=document.getElementById('saveStatus');
  el.textContent=text;
  el.disabled=!failed;
  el.classList.add('show');
  clearTimeout(showSaveStatus.timer);
  if(text==='已保存')showSaveStatus.timer=setTimeout(()=>el.classList.remove('show'),900);
}
async function writeState(saveAs){
  const revision=saveRevision;
  showSaveStatus('正在保存…');
  let result;
  try{
    const desktop=window.treeboardDesktop;
    if(desktop){
      const board=await serializeTreeboard();
      result=saveAs?await desktop.saveAs(board):await desktop.saveCurrent(board);
    }else{
      const {title,camera,objects}=state;
      localStorage.setItem('minimal_whiteboard_desktop_fallback',JSON.stringify({title,camera,objects}));
      result={ok:true};
    }
  }catch(err){
    result={ok:false,error:err.message};
  }
  if(result?.ok){
    savedRevision=revision;
    saveError='';
    showSaveStatus('已保存');
    return true;
  }
  if(!result?.canceled)saveError=result?.error||'保存失败，请检查保存位置。';
  showSaveStatus('保存失败 · 查看选项',true);
  return false;
}
async function saveState(saveAs=false){
  while(saveInFlight)await saveInFlight;
  if(!saveAs&&savedRevision===saveRevision)return true;
  saveInFlight=writeState(saveAs);
  try{return await saveInFlight}finally{saveInFlight=null}
}
function loadState(){try{const raw=localStorage.getItem('minimal_whiteboard_desktop_fallback');if(!raw)return false;const d=JSON.parse(raw);state.title=d.title||'未命名白板';state.camera=d.camera||state.camera;state.objects=d.objects||[];boardTitle.textContent=state.title;return true}catch(e){return false}}
async function flushSave(){
  if(document.activeElement?.isContentEditable)document.activeElement.blur();
  await pendingBoardRename;
  do{
    clearTimeout(saveTimer);
    saveTimer=null;
    if(!await saveState())return false;
  }while(savedRevision!==saveRevision);
  return true;
}
function loadRecentColors(){
  try{recentColors=JSON.parse(localStorage.getItem('minimal_whiteboard_v5_recent_colors')||'[]')}catch(e){recentColors=[]}
}
function rememberColor(c){
  if(!c||c==='transparent')return;
  recentColors=[c,...recentColors.filter(x=>x.toLowerCase()!==c.toLowerCase())].slice(0,6);
  localStorage.setItem('minimal_whiteboard_v5_recent_colors',JSON.stringify(recentColors));
}
