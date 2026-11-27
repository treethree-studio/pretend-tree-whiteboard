const textMarkButton=$('#textMarkButton');
const textMarkHighlight=typeof Highlight==='function'?new Highlight():null;
if(textMarkHighlight)CSS.highlights.set('treeboard-mark',textMarkHighlight);
let paintedTextMarks=new WeakMap(),textMarkEdit=null,textMarkSelection=null;
let textMarkFramePending=false,textPointerSelection=null;

function clearPaintedTextMarks(){
  textMarkHighlight?.clear();
  paintedTextMarks=new WeakMap();
}
function editableTextValue(node){
  return node.innerText.replace(/\n+\s*$/,'');
}
function markTextSegments(node,value){
  const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
  const segments=[];
  let offset=0,child;
  while((child=walker.nextNode())){
    if(!child.length)continue;
    let data=child.data,start=value.indexOf(data,offset);
    if(start<0){
      data=data.replace(/\n+\s*$/,'');
      if(!data)continue;
      start=value.indexOf(data,offset);
    }
    if(start<0)continue;
    offset=start+data.length;
    segments.push({node:child,start,end:offset});
  }
  return segments;
}
function paintTextMarks(node,value,marks){
  if(!textMarkHighlight)return;
  for(const range of paintedTextMarks.get(node)||[])textMarkHighlight.delete(range);
  paintedTextMarks.delete(node);
  if(!marks?.length)return;
  const ranges=[];
  for(const segment of markTextSegments(node,value)){
    for(const [start,end] of marks){
      const left=Math.max(start,segment.start),right=Math.min(end,segment.end);
      if(left>=right)continue;
      const range=document.createRange();
      range.setStart(segment.node,left-segment.start);range.setEnd(segment.node,right-segment.start);
      textMarkHighlight.add(range);ranges.push(range);
    }
  }
  paintedTextMarks.set(node,ranges);
}
function rebaseTextMarks(marks,oldValue,newValue){
  if(!marks.length||oldValue===newValue)return marks;
  let start=0,oldEnd=oldValue.length,newEnd=newValue.length;
  while(start<oldEnd&&start<newEnd&&oldValue[start]===newValue[start])start++;
  while(oldEnd>start&&newEnd>start&&oldValue[oldEnd-1]===newValue[newEnd-1]){oldEnd--;newEnd--}
  const delta=newEnd-oldEnd;
  return normalizeTextMarks(marks.map(([left,right])=>[
    left<start?left:left>=oldEnd?left+delta:newEnd,
    right<=start?right:right>=oldEnd?right+delta:start
  ]),newValue.length);
}
function updateTextMarkEdit(edit){
  const value=editableTextValue(edit.node);
  edit.marks=rebaseTextMarks(edit.marks,edit.value,value);
  edit.value=value;
  paintTextMarks(edit.node,value,edit.marks);
}
function beginTextMarkEdit(object,node){
  const value=editableTextValue(node);
  const edit={object,node,value,marks:normalizeTextMarks(object.textMarks,value.length)};
  textMarkEdit=edit;
  return edit;
}
function endTextMarkEdit(edit){
  updateTextMarkEdit(edit);
  if(textMarkEdit===edit){
    textMarkEdit=null;textPointerSelection=null;
    hideTextMarkSelection();
  }
}
function saveTextMarkEdit(edit){
  const {object,value,marks,node}=edit;
  const previous=object.text??(object.type==='text'?'文字':'');
  if(previous===value&&JSON.stringify(normalizeTextMarks(object.textMarks,value.length))===JSON.stringify(marks))return;
  const before=modelSnapshot();
  object.text=value;
  if(marks.length)object.textMarks=marks;
  else delete object.textMarks;
  if(object.type==='text'){
    syncTextBoxHeight(object,node.parentElement);
    markDirty();
  }
  pushHistory(before);scheduleSave();refreshBoardSearch();
}
function selectedMarkOffsets(node,value,range){
  let start=null,end=null;
  for(const segment of markTextSegments(node,value)){
    const text=segment.node;
    if(!range.intersectsNode(text))continue;
    const left=range.startContainer===text?range.startOffset:0;
    const right=Math.min(range.endContainer===text?range.endOffset:text.length,segment.end-segment.start);
    if(right<=left)continue;
    if(start===null)start=segment.start+left;
    end=segment.start+right;
  }
  return start!==null&&end>start?[start,end]:null;
}
function positionTextMarkButton(){
  if(!textMarkSelection)return;
  const rect=textMarkSelection.range.getBoundingClientRect();
  if(rect.bottom<0||rect.top>innerHeight||rect.right<0||rect.left>innerWidth){textMarkButton.hidden=true;return}
  textMarkButton.hidden=false;
  const width=textMarkButton.offsetWidth,height=textMarkButton.offsetHeight;
  const left=Math.round(clamp(rect.left+(rect.width-width)/2,8,innerWidth-width-8))+'px';
  const top=Math.round(rect.top>height+14?rect.top-height-8:rect.bottom+8)+'px';
  if(textMarkButton.style.left!==left)textMarkButton.style.left=left;
  if(textMarkButton.style.top!==top)textMarkButton.style.top=top;
}
function hideTextMarkSelection(){
  textMarkSelection=null;
  textMarkButton.hidden=true;
}
function updateTextMarkSelection(){
  const edit=textMarkEdit,selection=getSelection();
  if(!textMarkHighlight||!edit||!selection.rangeCount||selection.isCollapsed)return hideTextMarkSelection();
  const range=selection.getRangeAt(0);
  if(!edit.node.contains(range.startContainer)||!edit.node.contains(range.endContainer))return hideTextMarkSelection();
  const offsets=selectedMarkOffsets(edit.node,edit.value,range);
  if(!offsets||!range.toString().trim())return hideTextMarkSelection();
  const [start,end]=offsets;
  const remove=edit.marks.some(([left,right])=>left<=start&&right>=end);
  textMarkSelection={edit,range:range.cloneRange(),start,end,remove};
  const label=remove?'取消高亮':'高亮';
  if(textMarkButton.textContent!==label)textMarkButton.textContent=label;
  positionTextMarkButton();
}
function queueTextMarkSelection(){
  if(textMarkFramePending||textPointerSelection)return;
  textMarkFramePending=true;
  requestAnimationFrame(()=>{
    textMarkFramePending=false;
    if(!textPointerSelection)updateTextMarkSelection();
  });
}
document.addEventListener('selectionchange',queueTextMarkSelection);
document.addEventListener('pointerdown',event=>{
  if(event.button!==0||!textMarkEdit?.node.contains(event.target))return;
  const {clientX:x,clientY:y,pointerId}=event;
  const node=textMarkEdit.node;
  const start=document.caretRangeFromPoint(x,y);
  textPointerSelection={node,start,x,y,pointerId};
  hideTextMarkSelection();
},true);
function finishTextPointerSelection(event){
  const drag=textPointerSelection;
  if(!drag||event.pointerId!==drag.pointerId)return;
  textPointerSelection=null;
  if(event.type!=='pointerup'||Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<4||!drag.start){
    queueTextMarkSelection();return;
  }
  const end=document.caretRangeFromPoint(event.clientX,event.clientY);
  requestAnimationFrame(()=>{
    if(textMarkEdit?.node!==drag.node||textPointerSelection)return;
    const selection=getSelection();
    // Keep native selections. Some Windows input paths only leave a caret after a drag.
    if(selection.isCollapsed&&end&&drag.node.contains(drag.start.startContainer)&&drag.node.contains(end.startContainer)){
      selection.setBaseAndExtent(drag.start.startContainer,drag.start.startOffset,end.startContainer,end.startOffset);
    }
    updateTextMarkSelection();
  });
}
document.addEventListener('pointerup',finishTextPointerSelection,true);
document.addEventListener('pointercancel',finishTextPointerSelection,true);
textMarkButton.addEventListener('mousedown',event=>event.preventDefault());
textMarkButton.onclick=()=>{
  const selected=textMarkSelection;
  if(!selected||selected.edit!==textMarkEdit)return;
  const {edit,start,end,remove}=selected;
  const ranges=remove?edit.marks.flatMap(([left,right])=>{
    if(right<=start||left>=end)return [[left,right]];
    return [[left,Math.min(right,start)],[Math.max(left,end),right]];
  }):[...edit.marks,[start,end]];
  edit.marks=normalizeTextMarks(ranges,edit.value.length);
  saveTextMarkEdit(edit);
  paintTextMarks(edit.node,edit.value,edit.marks);
  getSelection().collapseToEnd();
  updateTextMarkSelection();
};
