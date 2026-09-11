/* Floating compact toolbar */
function colorButton(color,prop,allowTransparent=false,label='颜色'){
  const b=document.createElement('button');b.title=label;b.innerHTML=`<span class="currentColor" style="background:${color==='transparent'?'linear-gradient(135deg,#fff 0 45%,#e65c5c 46% 53%,#fff 54% 100%)':color}"></span>`;
  b.onclick=e=>{e.stopPropagation();openPalette(b,c=>applyColorToSelection(prop,c),allowTransparent)};return b;
}
function moreButton(){
  const b=document.createElement('button');b.innerHTML='<span class="moreDots">…</span>';b.title='更多';
  b.onclick=e=>{e.stopPropagation();openObjectMenu(b)};return b;
}
function uiIcon(name){
  const icons={
    arrange:'<svg class="ico" viewBox="0 0 24 24"><path d="M5 6h14M8 11h8M6 16h12"></path><path d="M4 4v4M4 14v4"></path></svg>',
    layer:'<svg class="ico" viewBox="0 0 24 24"><path d="M12 4l8 4-8 4-8-4 8-4z"></path><path d="M5 12l7 3.5 7-3.5M5 16l7 3.5 7-3.5"></path></svg>',
    textLeft:'<svg class="ico" viewBox="0 0 24 24"><path d="M5 6h12M5 10h8M5 14h12M5 18h9"></path></svg>',
    textCenter:'<svg class="ico" viewBox="0 0 24 24"><path d="M6 6h12M8 10h8M6 14h12M7.5 18h9"></path></svg>',
    textRight:'<svg class="ico" viewBox="0 0 24 24"><path d="M7 6h12M11 10h8M7 14h12M10 18h9"></path></svg>',
    group:'<svg class="ico" viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1"></rect><rect x="13" y="13" width="7" height="7" rx="1"></rect><path d="M11 7h4M7 11v4"></path></svg>',
    ungroup:'<svg class="ico" viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1"></rect><rect x="13" y="13" width="7" height="7" rx="1"></rect><path d="M13 7H9M7 13V9"></path></svg>',
    copy:'<svg class="ico" viewBox="0 0 24 24"><rect x="8" y="8" width="10" height="10" rx="1"></rect><path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'
  };
  return icons[name]||'';
}
function actionButton(label,icon,handler,title=label){
  const b=document.createElement('button');b.className='toolbarAction';b.title=title;
  b.innerHTML=(icon?uiIcon(icon):'')+`<span>${label}</span>`;
  b.onclick=e=>{e.stopPropagation();handler(b,e)};return b;
}
function arrangeButton(mode='multi'){
  const label=mode==='multi'?'排列':'层级';
  const b=actionButton(label,mode==='multi'?'arrange':'layer',(btn)=>openArrangePopover(btn,mode),label);
  b.innerHTML+= '<span class="chev">⌄</span>';
  return b;
}
function textAlignButton(o){
  const icon=o.align==='center'?'textCenter':o.align==='right'?'textRight':'textLeft';
  const b=document.createElement('button');b.title='文字对齐';b.innerHTML=uiIcon(icon);
  b.onclick=e=>{e.stopPropagation();openTextAlignPopover(b,o)};return b;
}
function duplicateButton(){
  const b=document.createElement('button');b.title='复制';b.innerHTML=uiIcon('copy');b.onclick=duplicateSelection;return b;
}
function addSep(parent){const s=document.createElement('span');s.className='miniSep';parent.appendChild(s)}
