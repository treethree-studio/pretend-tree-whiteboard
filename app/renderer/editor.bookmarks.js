const bookmarkButton=$('#bookmarkBtn'),bookmarkPanel=$('#boardBookmarks');
const bookmarkForm=$('#bookmarkForm'),bookmarkName=$('#bookmarkName'),bookmarkList=$('#bookmarkList');
const bookmarkSave=$('#bookmarkSave'),bookmarkCancel=$('#bookmarkCancel'),bookmarkEmpty=$('#bookmarkEmpty');
let editingBookmarkId=null;

function normalizeBoardBookmarks(value){
  if(!Array.isArray(value))return [];
  const ids=new Set(),bookmarks=[];
  for(const entry of value){
    if(!entry||typeof entry.id!=='string'||ids.has(entry.id)||typeof entry.name!=='string')continue;
    const name=entry.name.trim().slice(0,60);
    if(!name||![entry.x,entry.y,entry.scale].every(Number.isFinite)||entry.scale<=0)continue;
    ids.add(entry.id);
    bookmarks.push({id:entry.id,name,x:entry.x,y:entry.y,scale:clamp(entry.scale,.1,4)});
  }
  return bookmarks;
}
function resetBookmarkForm(){
  editingBookmarkId=null;
  bookmarkForm.reset();
  bookmarkSave.textContent='添加';
  bookmarkName.placeholder='给当前位置命名';
  bookmarkCancel.hidden=true;
}
function hideBoardBookmarks(returnFocus=false){
  if(bookmarkPanel.hidden)return;
  bookmarkPanel.hidden=true;
  bookmarkButton.setAttribute('aria-expanded','false');
  resetBookmarkForm();
  if(returnFocus)bookmarkButton.focus({preventScroll:true});
}
function jumpToBookmark(bookmark){
  const {x,y,scale}=bookmark;
  state.camera={x:innerWidth/2-x*scale,y:innerHeight/2-y*scale,scale};
  applyCamera();
  scheduleSave();
  hideBoardBookmarks(true);
}
function editBookmark(bookmark){
  editingBookmarkId=bookmark.id;
  bookmarkName.value=bookmark.name;
  bookmarkSave.textContent='保存';
  bookmarkCancel.hidden=false;
  bookmarkName.focus();bookmarkName.select();
}
function bookmarkAction(label,onClick,className){
  const button=document.createElement('button');
  button.type='button';button.textContent=label;button.title=label;button.onclick=onClick;
  if(className)button.className=className;
  return button;
}
function refreshBoardBookmarks(){
  if(bookmarkPanel.hidden)return;
  const bookmarks=state.bookmarks;
  if(editingBookmarkId&&!bookmarks.some(item=>item.id===editingBookmarkId))resetBookmarkForm();
  bookmarkEmpty.hidden=bookmarks.length>0;
  const rows=document.createDocumentFragment();
  for(const bookmark of bookmarks){
    const row=document.createElement('li');
    row.append(
      bookmarkAction(bookmark.name,()=>jumpToBookmark(bookmark),'bookmarkJump'),
      bookmarkAction('重命名',()=>editBookmark(bookmark)),
      bookmarkAction('删除',()=>{
        discrete(()=>{state.bookmarks=state.bookmarks.filter(item=>item.id!==bookmark.id)});
        refreshBoardBookmarks();
      })
    );
    rows.appendChild(row);
  }
  bookmarkList.replaceChildren(rows);
}
bookmarkButton.onclick=()=>{
  if(!bookmarkPanel.hidden){hideBoardBookmarks(true);return}
  miniWrap.classList.remove('show');renderMini();
  bookmarkPanel.hidden=false;
  bookmarkButton.setAttribute('aria-expanded','true');
  refreshBoardBookmarks();
  bookmarkName.focus({preventScroll:true});
};
bookmarkForm.onsubmit=event=>{
  event.preventDefault();
  const name=bookmarkName.value.trim();
  if(!name)return;
  const current=state.bookmarks.find(item=>item.id===editingBookmarkId);
  if(current){
    if(current.name!==name)discrete(()=>{current.name=name});
  }else{
    const center=screenToWorld(innerWidth/2,innerHeight/2);
    discrete(()=>state.bookmarks.push({id:uid('b_'),name,x:center.x,y:center.y,scale:state.camera.scale}));
  }
  resetBookmarkForm();refreshBoardBookmarks();
  bookmarkName.focus({preventScroll:true});
};
bookmarkCancel.onclick=()=>{resetBookmarkForm();bookmarkName.focus({preventScroll:true})};
document.addEventListener('click',event=>{
  const path=event.composedPath();
  if(!path.includes(bookmarkButton)&&!path.includes(bookmarkPanel))hideBoardBookmarks();
});
