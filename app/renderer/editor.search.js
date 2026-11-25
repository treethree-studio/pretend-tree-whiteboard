const searchPanel=$('#boardSearch');
const searchButton=$('#searchBtn');
const searchInput=$('#searchQuery');
const searchList=$('#searchResults');
const searchMarker=$('#searchMarker');
let searchMatchId=null;

function openBoardSearch(){
  searchPanel.hidden=false;
  searchButton.setAttribute('aria-expanded','true');
  searchInput.focus();
  searchInput.select();
  refreshBoardSearch();
}

function closeBoardSearch(){
  const returnFocus=searchPanel.contains(document.activeElement);
  searchPanel.hidden=true;
  searchButton.setAttribute('aria-expanded','false');
  searchMatchId=null;
  positionSearchMarker();
  if(returnFocus)searchButton.focus();
}

function positionSearchMarker(){
  const match=searchMatchId&&getObj(searchMatchId);
  searchMarker.hidden=!match;
  if(!match)return;
  const {x,y,w,h}=objectBounds(match);
  Object.assign(searchMarker.style,{left:(x-5)+'px',top:(y-5)+'px',width:(w+10)+'px',height:(h+10)+'px'});
}

function jumpToSearchMatch(result){
  const match=getObj(result.dataset.objectId);
  if(!match)return;
  searchMatchId=match.id;
  searchList.querySelector('[aria-current="true"]')?.removeAttribute('aria-current');
  result.setAttribute('aria-current','true');
  result.scrollIntoView({block:'nearest'});
  const {x,y,w,h}=objectBounds(match),camera=state.camera;
  const fit=Math.min((innerWidth-180)/Math.max(1,w),(innerHeight-150)/Math.max(1,h));
  camera.scale=clamp(Math.min(Math.max(camera.scale,.8),fit),.1,4);
  camera.x=innerWidth/2-(x+w/2)*camera.scale;
  camera.y=innerHeight/2-(y+h/2)*camera.scale;
  positionSearchMarker();
  applyCamera();
  scheduleSave();
}

function refreshBoardSearch(){
  if(searchPanel.hidden)return;
  const query=searchInput.value.trim().replace(/\s+/g,' ').toLowerCase();
  let count=0,activeFound=false;
  const results=document.createDocumentFragment();
  if(query){
    for(const object of state.objects){
      if(object.type!=='sticky'&&object.type!=='text')continue;
      const text=String(object.text??'').replace(/\s+/g,' ').trim();
      const offset=text.toLowerCase().indexOf(query);
      if(offset<0)continue;
      const row=document.createElement('li');
      const button=document.createElement('button');
      const type=document.createElement('span');
      const excerpt=document.createElement('span');
      button.type='button';
      button.dataset.objectId=object.id;
      button.title=text;
      if(object.id===searchMatchId){
        activeFound=true;
        button.setAttribute('aria-current','true');
      }
      type.className='searchResultType';
      type.textContent=object.type==='sticky'?'便签':'文字';
      excerpt.className='searchResultText';
      const start=Math.max(0,offset-12);
      excerpt.textContent=(start?'…':'')+text.slice(start);
      button.append(type,excerpt);
      row.append(button);
      results.append(row);
      count++;
    }
  }
  if(!activeFound)searchMatchId=null;
  searchList.replaceChildren(results);
  $('#searchStatus').textContent=query?(count?`找到 ${count} 项`:'没有匹配的内容'):'';
  positionSearchMarker();
}

searchButton.onclick=()=>searchPanel.hidden?openBoardSearch():closeBoardSearch();
$('#closeSearch').onclick=closeBoardSearch;
searchInput.addEventListener('input',()=>{
  searchMatchId=null;
  refreshBoardSearch();
});
searchList.addEventListener('click',event=>{
  const result=event.target.closest('button[data-object-id]');
  if(result)jumpToSearchMatch(result);
});
searchInput.addEventListener('keydown',event=>{
  if(event.key!=='Enter'||event.isComposing)return;
  event.preventDefault();
  const results=[...searchList.querySelectorAll('button')];
  if(!results.length)return;
  const active=results.findIndex(button=>button.dataset.objectId===searchMatchId);
  const next=event.shiftKey?(active>0?active-1:results.length-1):(active+1)%results.length;
  jumpToSearchMatch(results[next]);
});
