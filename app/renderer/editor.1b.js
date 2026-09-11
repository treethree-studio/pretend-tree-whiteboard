/* IndexedDB assets */
const DB_NAME='minimal_whiteboard_v5_db',STORE='assets';
function openDB(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB'in window))return reject(new Error('IndexedDB unavailable'));
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE)};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
async function putAsset(blob){
  const id=uid('asset_'),db=await openDB();
  await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(blob,id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});
  db.close();assetBlobCache.set(id,blob);return id;
}
async function getAssetBlob(id){
  if(assetBlobCache.has(id))return assetBlobCache.get(id);
  const db=await openDB();
  const blob=await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
  db.close();if(blob)assetBlobCache.set(id,blob);return blob;
}
async function getAssetUrl(id){
  if(assetUrlCache.has(id))return assetUrlCache.get(id);
  const blob=await getAssetBlob(id);if(!blob)return null;
  const url=URL.createObjectURL(blob);assetUrlCache.set(id,url);return url;
}
function imageDimensions(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{const out={width:img.naturalWidth||img.width,height:img.naturalHeight||img.height};URL.revokeObjectURL(url);resolve(out)};
    img.onerror=e=>{URL.revokeObjectURL(url);reject(e)};img.src=url;
  });
}

async function importImageFiles(fileList,origin){
  const files=[...fileList].filter(f=>f&&f.type&&f.type.startsWith('image/'));
  if(!files.length)return;
  showToast(files.length>1?`正在导入 ${files.length} 张图片…`:'正在导入图片…');
  try{
    const prepared=[];
    for(const file of files){
      const assetId=await putAsset(file),dim=await imageDimensions(file);
      const scale=Math.min(1,260/Math.max(1,dim.width),190/Math.max(1,dim.height));
      prepared.push({assetId,w:Math.max(80,dim.width*scale),h:Math.max(60,dim.height*scale)});
    }
    const cols=Math.min(3,Math.ceil(Math.sqrt(prepared.length))),rows=Math.ceil(prepared.length/cols);
    const cellW=300,cellH=225,startX=origin.x-((cols-1)*cellW)/2,startY=origin.y-((rows-1)*cellH)/2;
    const added=[];let z=zMax()+1;
    prepared.forEach((it,i)=>{
      const col=i%cols,row=Math.floor(i/cols),cx=startX+col*cellW,cy=startY+row*cellH;
      added.push({id:uid(),type:'image',assetId:it.assetId,x:cx-it.w/2,y:cy-it.h/2,w:it.w,h:it.h,rot:0,imageStyle:'raw',z:z++});
    });
    discrete(()=>state.objects.push(...added));
    renderElements();setSelection(added.map(o=>o.id));markDirty();
    showToast(`已导入 ${added.length} 张图片`);
  }catch(err){
    console.error(err);showToast('部分图片导入失败，请重试');
  }
}
