function buildFloatingBar(){
  closeTransientMenus();
  floatingBar.innerHTML='';floatingBar.classList.remove('show');
  const objs=selectedObjs();if(!objs.length)return;

  if(objs.length>1){
    floatingBar.appendChild(arrangeButton('multi'));

    const grouping=groupingAction(objs);
    const groupButton=actionButton(grouping.label,grouping.icon,grouping.run,grouping.disabled?'请先解锁所选对象':grouping.label);
    groupButton.disabled=grouping.disabled;
    floatingBar.appendChild(groupButton);

    floatingBar.appendChild(duplicateButton());
    floatingBar.appendChild(moreButton());
    floatingBar.classList.add('show');positionFloatingBar();return;
  }

  const o=objs[0];
  if(o.type==='sticky'){
    floatingBar.appendChild(colorButton(o.fill||DEFAULTS.sticky,'fill'));
    floatingBar.appendChild(arrangeButton('single'));
    floatingBar.appendChild(duplicateButton());
  }else if(o.type==='text'){
    floatingBar.appendChild(colorButton(o.color||DEFAULTS.text,'color'));

    const sizeWrap=document.createElement('div');
    sizeWrap.className='fontSizeControl';

    const minus=document.createElement('button');
    minus.title='减小字号（Shift 点击每次 -5）';
    minus.textContent='−';
    minus.onclick=ev=>setTextFontSize(o,(o.fontSize||28)-(ev.shiftKey?5:1));

    const input=document.createElement('input');
    input.className='fontSizeInput';
    input.type='number';
    input.min='8';input.max='144';input.step='1';
    input.value=String(o.fontSize||28);
    input.title='直接输入字号，支持 8–144';
    input.addEventListener('focus',()=>input.select());
    input.addEventListener('keydown',ev=>{
      ev.stopPropagation();
      if(ev.key==='Enter'){ev.preventDefault();setTextFontSize(o,input.value);input.blur()}
      if(ev.key==='Escape'){input.value=String(o.fontSize||28);input.blur()}
    });
    input.addEventListener('change',()=>setTextFontSize(o,input.value));
    input.addEventListener('blur',()=>input.value=String(o.fontSize||28));

    const plus=document.createElement('button');
    plus.title='增大字号（Shift 点击每次 +5）';
    plus.textContent='+';
    plus.onclick=ev=>setTextFontSize(o,(o.fontSize||28)+(ev.shiftKey?5:1));

    sizeWrap.append(minus,input,plus);
    floatingBar.appendChild(sizeWrap);

    const bold=document.createElement('button');
    bold.innerHTML='<b>B</b>';bold.title='加粗 / 常规';
    bold.onclick=()=>{discrete(()=>o.fontWeight=(o.fontWeight||600)>=700?520:760);renderElements();updateSelectionUI()};
    floatingBar.appendChild(bold);

    floatingBar.appendChild(textAlignButton(o));
    floatingBar.appendChild(arrangeButton('single'));
  }else if(o.type==='drawing'){
    floatingBar.appendChild(colorButton(o.color||DEFAULTS.line,'color'));
    const w=document.createElement('button');w.textContent=(o.width||4)+'px';w.title='线条粗细';
    w.onclick=()=>cycleWidth(o,o.highlighter?[8,16,24,36,48]:[2,4,8,14]);floatingBar.appendChild(w);
    floatingBar.appendChild(arrangeButton('single'));
  }else if(o.type==='connector'){
    floatingBar.appendChild(colorButton(o.color||DEFAULTS.line,'color'));
    const w=document.createElement('button');w.textContent=(o.width||3)+'px';w.title='线条粗细';w.onclick=()=>cycleWidth(o,[2,3,5,8]);floatingBar.appendChild(w);
    const ar=document.createElement('button');ar.title='箭头样式';ar.textContent=o.arrow==='both'?'↔':o.arrow==='none'?'—':'→';ar.onclick=()=>{discrete(()=>o.arrow=o.arrow==='end'?'both':o.arrow==='both'?'none':'end');renderVectors();buildFloatingBar()};floatingBar.appendChild(ar);
    const lb=document.createElement('button');lb.title=o.label?'编辑连接线文字':'添加连接线文字';lb.textContent='Aa';
    lb.onclick=()=>{if(!o.label){discrete(()=>o.label={text:'关系',t:.5,offset:-14});renderLabels();setTimeout(()=>beginLabelEdit(o.id),0)}else beginLabelEdit(o.id)};floatingBar.appendChild(lb);
    floatingBar.appendChild(arrangeButton('single'));
  }else if(o.type==='rect'||o.type==='circle'){
    floatingBar.appendChild(colorButton(o.fill||'transparent','fill',true,'填充颜色'));
    floatingBar.appendChild(colorButton(o.stroke||DEFAULTS.shapeStroke,'stroke',false,'边框颜色'));
    const w=document.createElement('button');w.textContent=(o.strokeWidth||2)+'px';w.title='边框粗细';w.onclick=()=>cycleStroke(o);floatingBar.appendChild(w);
    floatingBar.appendChild(arrangeButton('single'));
  }else if(o.type==='image'){
    floatingBar.appendChild(arrangeButton('single'));
    floatingBar.appendChild(duplicateButton());
  }

  addSep(floatingBar);
  floatingBar.appendChild(moreButton());
  floatingBar.classList.add('show');positionFloatingBar();
}
function setTextFontSize(o,value){
  const size=clamp(Math.round(Number(value)||28),8,144);
  if(size===(o.fontSize||28))return;
  discrete(()=>{o.fontSize=size});
  renderElements();updateSelectionUI();markDirty();
}
function cycleWidth(o,arr){
  discrete(()=>{const i=arr.indexOf(o.width||arr[0]);o.width=arr[(i+1)%arr.length]});renderVectors();buildFloatingBar();
}
function cycleStroke(o){
  discrete(()=>{const arr=[1,2,3,5],i=arr.indexOf(o.strokeWidth||2);o.strokeWidth=arr[(i+1)%arr.length]});renderElements();buildFloatingBar();
}
function positionFloatingBar(){
  if(!floatingBar.classList.contains('show')||!state.selection.length)return;
  const ub=unionBounds(selectedObjs());if(!ub)return;
  const topCenter=worldToScreen(ub.x+ub.w/2,ub.y),bottomCenter=worldToScreen(ub.x+ub.w/2,ub.y+ub.h);
  const r=floatingBar.getBoundingClientRect(),margin=10;
  let left=topCenter.x-r.width/2,top=topCenter.y-r.height-margin;
  if(top<8)top=bottomCenter.y+margin;
  left=clamp(left,8,innerWidth-r.width-8);top=clamp(top,8,innerHeight-r.height-8);
  floatingBar.style.left=left+'px';floatingBar.style.top=top+'px';
}
function openPalette(anchor,property,currentColor,allowTransparent=false){
  const [object]=selectedObjs();
  if(!object)return;
  closeTransientMenus();
  const swatch=anchor.querySelector('.currentColor');
  const session={object,property,swatch,originalSwatch:swatch.style.background,previewColor:null};
  paletteSession=session;
  colorPopover.innerHTML='';
  const section=(label,colors)=>{
    const row=document.createElement('div');row.className='paletteRow';
    const l=document.createElement('span');l.className='paletteLabel';l.textContent=label;row.appendChild(l);
    colors.forEach(c=>{const b=document.createElement('button');b.className='paletteChip';b.style.background=c;b.onclick=()=>choosePaletteColor(session,c);row.appendChild(b)});
    colorPopover.appendChild(row);
  };
  if(allowTransparent){
    const row=document.createElement('div');row.className='paletteRow';const l=document.createElement('span');l.className='paletteLabel';l.textContent='填充';row.appendChild(l);
    const t=document.createElement('button');t.className='paletteChip transparent';t.title='透明';t.onclick=()=>choosePaletteColor(session,'transparent');row.appendChild(t);colorPopover.appendChild(row);
  }
  section('柔和',PALETTES.soft);section('经典',PALETTES.classic);section('极简',PALETTES.mono);
  if(recentColors.length)section('最近',recentColors);
  const div=document.createElement('div');div.className='paletteDivider';colorPopover.appendChild(div);
  const custom=document.createElement('div');custom.className='customColor';
  custom.innerHTML='<input type="color" aria-label="自定义颜色"><input type="text" aria-label="HEX 颜色" placeholder="#7267FF" maxlength="7">';
  const ci=custom.querySelector('input[type=color]'),ti=custom.querySelector('input[type=text]');
  const currentHex=normalizeHex(currentColor);
  ci.value=currentHex||'#7267ff';
  ti.value=currentHex||'';
  const initialPickerValue=ci.value;
  ci.oninput=()=>{
    if(paletteSession!==session)return;
    const changed=ci.value!==initialPickerValue;
    ti.value=changed?ci.value.toUpperCase():(currentHex||'');
    session.previewColor=changed?ci.value:null;
    renderPalettePreview(session);
  };
  ci.onchange=()=>{
    if(ci.value===initialPickerValue){
      if(session.previewColor)ci.oninput();
      return;
    }
    choosePaletteColor(session,ci.value);
  };
  ti.onkeydown=e=>{if(e.key==='Enter'){const v=normalizeHex(ti.value);if(v)choosePaletteColor(session,v);else showToast('请输入有效 HEX 颜色')}};
  colorPopover.appendChild(custom);
  colorPopover.classList.add('show');placePopover(anchor,colorPopover);
}
function normalizeHex(v){v=(v||'').trim();if(/^#[0-9a-f]{6}$/i.test(v))return v.toUpperCase();if(/^[0-9a-f]{6}$/i.test(v))return('#'+v).toUpperCase();return null}
function displayedPaletteColor(object,property,fallback){
  if(paletteSession?.object===object&&paletteSession.property===property&&paletteSession.previewColor){
    return paletteSession.previewColor;
  }
  return object[property]||fallback;
}
function renderPalettePreview(session){
  const {object,swatch,originalSwatch}=session;
  swatch.style.background=(paletteSession===session&&session.previewColor)||originalSwatch;
  if(isVector(object)){
    renderVectors();
  }else{
    const node=elementsRoot.querySelector(`[data-id="${CSS.escape(object.id)}"]`);
    if(node)renderElementColors(node,object);
  }
}
function closeColorPalette(){
  const session=paletteSession;
  paletteSession=null;
  colorPopover.classList.remove('show');
  if(session?.previewColor)renderPalettePreview(session);
}
function choosePaletteColor(session,color){
  if(paletteSession!==session)return;
  const {object,property}=session;
  if(getObj(object.id)!==object){closeColorPalette();return}
  session.previewColor=null;
  closeColorPalette();
  discrete(()=>{object[property]=color});
  rememberColor(color);
  renderAll();
}

function arrangeSvg(name){
  const map={
    left:'<svg class="ico" viewBox="0 0 24 24"><path d="M5 4v16"></path><rect x="8" y="6" width="9" height="4" rx="1"></rect><rect x="8" y="14" width="6" height="4" rx="1"></rect></svg>',
    centerX:'<svg class="ico" viewBox="0 0 24 24"><path d="M12 4v16"></path><rect x="6" y="6" width="12" height="4" rx="1"></rect><rect x="8" y="14" width="8" height="4" rx="1"></rect></svg>',
    right:'<svg class="ico" viewBox="0 0 24 24"><path d="M19 4v16"></path><rect x="7" y="6" width="9" height="4" rx="1"></rect><rect x="10" y="14" width="6" height="4" rx="1"></rect></svg>',
    top:'<svg class="ico" viewBox="0 0 24 24"><path d="M4 5h16"></path><rect x="6" y="8" width="4" height="9" rx="1"></rect><rect x="14" y="8" width="4" height="6" rx="1"></rect></svg>',
    middle:'<svg class="ico" viewBox="0 0 24 24"><path d="M4 12h16"></path><rect x="6" y="6" width="4" height="12" rx="1"></rect><rect x="14" y="8" width="4" height="8" rx="1"></rect></svg>',
    bottom:'<svg class="ico" viewBox="0 0 24 24"><path d="M4 19h16"></path><rect x="6" y="7" width="4" height="9" rx="1"></rect><rect x="14" y="10" width="4" height="6" rx="1"></rect></svg>',
    distX:'<svg class="ico" viewBox="0 0 24 24"><rect x="3" y="8" width="4" height="8" rx="1"></rect><rect x="10" y="8" width="4" height="8" rx="1"></rect><rect x="17" y="8" width="4" height="8" rx="1"></rect></svg>',
    distY:'<svg class="ico" viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="4" rx="1"></rect><rect x="8" y="10" width="8" height="4" rx="1"></rect><rect x="8" y="17" width="8" height="4" rx="1"></rect></svg>',
    equalW:'<svg class="ico" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="5" rx="1"></rect><rect x="4" y="14" width="16" height="5" rx="1"></rect></svg>',
    equalH:'<svg class="ico" viewBox="0 0 24 24"><rect x="5" y="4" width="5" height="16" rx="1"></rect><rect x="14" y="4" width="5" height="16" rx="1"></rect></svg>',
    equalS:'<svg class="ico" viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1"></rect><rect x="13" y="13" width="7" height="7" rx="1"></rect><path d="M13 4h7v7M4 13h7v7"></path></svg>',
    front:'<svg class="ico" viewBox="0 0 24 24"><rect x="8" y="5" width="10" height="10" rx="1"></rect><rect x="5" y="9" width="10" height="10" rx="1"></rect></svg>',
    up:'<svg class="ico" viewBox="0 0 24 24"><rect x="7" y="8" width="10" height="10" rx="1"></rect><path d="M12 3v6M9 6l3-3 3 3"></path></svg>',
    down:'<svg class="ico" viewBox="0 0 24 24"><rect x="7" y="6" width="10" height="10" rx="1"></rect><path d="M12 21v-6M9 18l3 3 3-3"></path></svg>',
    back:'<svg class="ico" viewBox="0 0 24 24"><rect x="5" y="5" width="10" height="10" rx="1"></rect><rect x="9" y="9" width="10" height="10" rx="1"></rect></svg>'
  };
  return map[name]||'';
}
function addPopSection(parent,title,items,cols=3){
  const sec=document.createElement('div');sec.className='popSection';
  const h=document.createElement('div');h.className='popTitle';h.textContent=title;sec.appendChild(h);
  const grid=document.createElement('div');grid.className='popGrid'+(cols===2?' two':'');
  items.forEach(it=>{
    const b=document.createElement('button');b.title=it.label;b.innerHTML=(it.icon?arrangeSvg(it.icon):'')+`<span>${it.label}</span>`;
    b.onclick=()=>{it.fn();arrangePopover.classList.remove('show')};grid.appendChild(b);
  });
  sec.appendChild(grid);parent.appendChild(sec);
}
function openArrangePopover(anchor,mode='multi'){
  arrangePopover.innerHTML='';closeTransientMenus(false);
  const objs=selectedObjs(),movable=objs.filter(o=>o.type!=='connector'&&!o.locked);

  if(mode==='multi'){
    if(movable.length>=2){
      addPopSection(arrangePopover,'对象对齐',[
        {label:'左对齐',icon:'left',fn:()=>alignSelection('left')},
        {label:'水平居中',icon:'centerX',fn:()=>alignSelection('centerX')},
        {label:'右对齐',icon:'right',fn:()=>alignSelection('right')},
        {label:'顶对齐',icon:'top',fn:()=>alignSelection('top')},
        {label:'垂直居中',icon:'middle',fn:()=>alignSelection('middle')},
        {label:'底对齐',icon:'bottom',fn:()=>alignSelection('bottom')}
      ],3);
    }
    if(movable.length>=3){
      addPopSection(arrangePopover,'分布',[
        {label:'横向等间距',icon:'distX',fn:()=>distributeSelection('x')},
        {label:'纵向等间距',icon:'distY',fn:()=>distributeSelection('y')}
      ],2);
    }
    const sizeEligible=movable.length>=2&&movable.every(o=>['sticky','image','rect','circle'].includes(o.type));
    if(sizeEligible){
      addPopSection(arrangePopover,'尺寸',[
        {label:'等宽',icon:'equalW',fn:()=>equalizeSelection('width')},
        {label:'等高',icon:'equalH',fn:()=>equalizeSelection('height')},
        {label:'等尺寸',icon:'equalS',fn:()=>equalizeSelection('size')}
      ],3);
    }
  }

  const sec=document.createElement('div');sec.className='popSection';
  const h=document.createElement('div');h.className='popTitle';h.textContent='层级';sec.appendChild(h);
  const list=document.createElement('div');list.className='layerList';
  [
    ['置于顶层','front'],
    ['上移一层','up'],
    ['下移一层','down'],
    ['置于底层','back']
  ].forEach(([label,action])=>{
    const b=document.createElement('button');b.innerHTML=arrangeSvg(action)+`<span>${label}</span>`;
    b.onclick=()=>{moveSelectionLayer(action);arrangePopover.classList.remove('show')};list.appendChild(b);
  });
  sec.appendChild(list);arrangePopover.appendChild(sec);

  arrangePopover.classList.add('show');placePopover(anchor,arrangePopover);
}
function openTextAlignPopover(anchor,o){
  textAlignPopover.innerHTML='';closeTransientMenus(false);
  const sec=document.createElement('div');sec.className='popSection';
  const h=document.createElement('div');h.className='popTitle';h.textContent='文字对齐';sec.appendChild(h);
  const grid=document.createElement('div');grid.className='popGrid';
  [
    ['left','左对齐','textLeft'],
    ['center','居中','textCenter'],
    ['right','右对齐','textRight']
  ].forEach(([value,label,icon])=>{
    const b=document.createElement('button');if((o.align||'left')===value)b.classList.add('active');
    b.innerHTML=uiIcon(icon)+`<span>${label}</span>`;
    b.onclick=()=>{discrete(()=>o.align=value);renderElements();updateSelectionUI();textAlignPopover.classList.remove('show')};grid.appendChild(b);
  });
  sec.appendChild(grid);textAlignPopover.appendChild(sec);
  textAlignPopover.classList.add('show');placePopover(anchor,textAlignPopover);
}

function placePopover(anchor,pop){
  const a=anchor.getBoundingClientRect(),r=pop.getBoundingClientRect();
  let left=a.left,top=a.bottom+7;if(left+r.width>innerWidth-8)left=innerWidth-r.width-8;if(top+r.height>innerHeight-8)top=a.top-r.height-7;
  pop.style.left=Math.max(8,left)+'px';pop.style.top=Math.max(8,top)+'px';
}
function groupingAction(objects){
  if(objects.length<2)return null;
  if(sameGroupSelection(objects))return {label:'取消组合',icon:'ungroup',run:ungroupSelection,disabled:false};
  return {label:'组合',icon:'group',run:groupSelection,disabled:groupingTargets(objects).some(o=>o.locked)};
}
const lowerLayerMarker=$('#lowerLayerMarker');
function lowerObjectsAt(point){
  const ids=new Set();
  const objects=[];
  for(const node of document.elementsFromPoint(point.x,point.y)){
    const id=node.closest('.element,.vectorObject,.connectorLabel')?.dataset.id;
    if(!id||ids.has(id))continue;
    const object=getObj(id);
    if(object){ids.add(id);objects.push(object)}
  }
  return objects.slice(1);
}
function showLowerLayerMarker(object){
  const b=objectBounds(object),a=worldToScreen(b.x,b.y),scale=state.camera.scale;
  Object.assign(lowerLayerMarker.style,{left:(a.x-4)+'px',top:(a.y-4)+'px',width:(b.w*scale+8)+'px',height:(b.h*scale+8)+'px'});
  lowerLayerMarker.hidden=false;
}
function closeObjectMenu(){
  objectMenu.classList.remove('show');
  lowerLayerMarker.hidden=true;
}
function positionObjectMenu(anchor,point){
  objectMenu.classList.add('show');
  if(point){
    const {width,height}=objectMenu.getBoundingClientRect();
    objectMenu.style.left=clamp(point.x,8,Math.max(8,innerWidth-width-8))+'px';
    objectMenu.style.top=clamp(point.y,8,Math.max(8,innerHeight-height-8))+'px';
  }else placePopover(anchor,objectMenu);
}
function openLowerObjectMenu(point,objects){
  const typeLabels={sticky:'便签',text:'文本框',image:'图片',rect:'矩形',circle:'圆形',connector:'连接线',drawing:'笔迹'};
  objectMenu.innerHTML='';
  const back=document.createElement('button');
  back.type='button';back.textContent='‹ 返回对象菜单';back.setAttribute('role','menuitem');
  back.onclick=()=>openObjectMenu(null,point,objects);
  objectMenu.appendChild(back);
  objects.forEach((object,index)=>{
    const button=document.createElement('button'),label=document.createElement('span');
    const detail=String(object.text??object.label?.text??'').trim().replace(/\s+/g,' ');
    label.textContent=detail?typeLabels[object.type]+' · '+detail:typeLabels[object.type]+' · 下层 '+(index+1);
    button.className='lowerObjectRow';button.type='button';button.title=label.textContent;
    button.setAttribute('role','menuitem');
    if(object.type==='image'){
      const thumb=document.createElement('img');thumb.alt='';
      button.appendChild(thumb);
      getAssetUrl(object.assetId).then(url=>{if(url&&button.isConnected)thumb.src=url}).catch(()=>{});
    }
    button.appendChild(label);
    button.onpointerenter=button.onfocus=()=>showLowerLayerMarker(object);
    button.onpointerleave=button.onblur=()=>{lowerLayerMarker.hidden=true};
    button.onclick=()=>{closeObjectMenu();setSelection([object.id])};
    objectMenu.appendChild(button);
  });
  positionObjectMenu(null,point);
  objectMenu.querySelector('.lowerObjectRow')?.focus({preventScroll:true});
}
function openObjectMenu(anchor,point,lowerObjects=[]){
  const objects=selectedObjs();
  if(!objects.length)return;
  closeTransientMenus();
  hidePenMenu();hideExportMenu();
  objectMenu.innerHTML='';
  const addHeading=label=>{const h=document.createElement('div');h.className='menuHeading';h.textContent=label;objectMenu.appendChild(h)};
  const addDivider=()=>{const d=document.createElement('div');d.className='menuDivider';objectMenu.appendChild(d)};
  const add=(label,run,{danger=false,disabled=false}={})=>{
    const button=document.createElement('button');
    button.textContent=label;button.disabled=disabled;
    button.setAttribute('role','menuitem');
    if(danger)button.className='danger';
    if(disabled)button.title='请先解锁所选对象';
    button.onclick=()=>{closeObjectMenu();run()};
    objectMenu.appendChild(button);
  };

  const single=objects.length===1?objects[0]:null;
  const grouping=groupingAction(objects);
  addHeading('对象');
  if(lowerObjects.length)add('选择下层对象 ›',()=>openLowerObjectMenu(point,lowerObjects));
  if(grouping)add(grouping.label,grouping.run,{disabled:grouping.disabled});
  const lockedCount=objects.filter(o=>o.locked).length;
  if(lockedCount<objects.length)add(lockedCount?'锁定全部':'锁定',()=>setLocked(true));
  if(lockedCount)add(lockedCount===objects.length?'解锁':'解锁全部',()=>setLocked(false));
  add('复制',duplicateSelection);
  if(single&&!single.locked&&['sticky','image','rect','circle'].includes(single.type)){
    add('向左旋转 5°',()=>rotateSelection(-5));
    add('向右旋转 5°',()=>rotateSelection(5));
  }
  if(single&&single.type==='image'){
    addDivider();
    addHeading('图片');
    add(single.imageStyle==='card'?'使用透明原图':'使用白底卡片',()=>toggleImageStyle(single));
  }
  if(single?.type==='connector'&&single.label){
    addDivider();
    addHeading('连接线');
    add('删除文字标记',()=>{discrete(()=>delete single.label);renderAll()});
  }
  addDivider();
  add('删除',deleteSelection,{danger:true});

  positionObjectMenu(anchor,point);
  objectMenu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
}
function closeTransientMenus(clearPalette=true){
  closeObjectMenu();
  arrangePopover.classList.remove('show');
  textAlignPopover.classList.remove('show');
  if(clearPalette)closeColorPalette();
}
function setLocked(v){
  const changed=selectedObjs().filter(o=>Boolean(o.locked)!==v);
  if(!changed.length)return;
  discrete(()=>changed.forEach(o=>o.locked=v));renderAll();showToast(v?'已锁定':'已解锁');
}
function toggleImageStyle(o){discrete(()=>o.imageStyle=o.imageStyle==='card'?'raw':'card');renderAll()}
