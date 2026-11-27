/* Shared board rendering for exports and recent-board thumbnails. */
const DEFAULTS={
  sticky:'#FFF2A7', text:'#202020', line:'#202020', shapeFill:'transparent', shapeStroke:'#202020'
};
const HIGHLIGHT_OPACITY=.38;
const TEXT_BOX_MIN_WIDTH=80,TEXT_BOX_DEFAULT_WIDTH=190;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const isVector=o=>o&&['drawing','connector'].includes(o.type);
const isElement=o=>o&&!isVector(o);
const layerOf=o=>Number.isFinite(o.z)?o.z:1;
const sortBoardObjects=(objects)=>objects.slice().sort((a,b)=>layerOf(a)-layerOf(b));

function rotatePoint(p,c,deg){
  const r=deg*Math.PI/180,cs=Math.cos(r),sn=Math.sin(r),dx=p.x-c.x,dy=p.y-c.y;
  return{x:c.x+dx*cs-dy*sn,y:c.y+dx*sn+dy*cs}
}
function elementCorners(o){
  const c={x:o.x+o.w/2,y:o.y+o.h/2},pts=[
    {x:o.x,y:o.y},{x:o.x+o.w,y:o.y},{x:o.x+o.w,y:o.y+o.h},{x:o.x,y:o.y+o.h}
  ];
  return (o.rot||0)?pts.map(p=>rotatePoint(p,c,o.rot||0)):pts;
}
function boundsFromPoints(pts){
  if(!pts.length)return{x:0,y:0,w:0,h:0};
  const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  return{x:minX,y:minY,w:maxX-minX,h:maxY-minY};
}
function resolveBoardEndpoint(ep,other,findObject){
  if(!ep)return{x:0,y:0};
  if(!ep.id)return{x:ep.x,y:ep.y};
  const o=findObject(ep.id);if(!o)return{x:0,y:0};
  const c={x:o.x+o.w/2,y:o.y+o.h/2};
  let p;
  const a=ep.anchor||'auto';
  if(a==='n')p={x:c.x,y:o.y};
  else if(a==='e')p={x:o.x+o.w,y:c.y};
  else if(a==='s')p={x:c.x,y:o.y+o.h};
  else if(a==='w')p={x:o.x,y:c.y};
  else{
    const q=other||c,dx=q.x-c.x,dy=q.y-c.y;
    if(Math.abs(dx/o.w)>Math.abs(dy/o.h))p=dx>=0?{x:o.x+o.w,y:c.y}:{x:o.x,y:c.y};
    else p=dy>=0?{x:c.x,y:o.y+o.h}:{x:c.x,y:o.y};
  }
  return (o.rot||0)?rotatePoint(p,c,o.rot||0):p;
}
function boardConnectorGeometry(o,findObject){
  let roughA=o.from?.id?{x:findObject(o.from.id)?.x||0,y:findObject(o.from.id)?.y||0}:{x:o.from?.x||0,y:o.from?.y||0};
  let roughB=o.to?.id?{x:findObject(o.to.id)?.x||0,y:findObject(o.to.id)?.y||0}:{x:o.to?.x||0,y:o.to?.y||0};
  const p1=resolveBoardEndpoint(o.from,roughB,findObject),p2=resolveBoardEndpoint(o.to,p1,findObject),dx=p2.x-p1.x,dy=p2.y-p1.y;
  const seed=[...o.id].reduce((s,ch)=>s+ch.charCodeAt(0),0),j=((seed%9)-4)*1.5;
  const bend=Math.max(34,Math.min(115,Math.hypot(dx,dy)*.22));
  let c1,c2;
  if(Math.abs(dx)>=Math.abs(dy)){
    c1={x:p1.x+Math.sign(dx||1)*bend,y:p1.y+j};c2={x:p2.x-Math.sign(dx||1)*bend,y:p2.y-j};
  }else{
    c1={x:p1.x+j,y:p1.y+Math.sign(dy||1)*bend};c2={x:p2.x-j,y:p2.y-Math.sign(dy||1)*bend};
  }
  return{p1,p2,c1,c2};
}
function bezierPoint(g,t){
  const u=1-t;
  return{
    x:u*u*u*g.p1.x+3*u*u*t*g.c1.x+3*u*t*t*g.c2.x+t*t*t*g.p2.x,
    y:u*u*u*g.p1.y+3*u*u*t*g.c1.y+3*u*t*t*g.c2.y+t*t*t*g.p2.y
  };
}
function boardConnectorPolyline(o,n,findObject){
  const g=boardConnectorGeometry(o,findObject),pts=[];for(let i=0;i<=n;i++)pts.push(bezierPoint(g,i/n));return pts;
}
function boardObjectBounds(o,findObject){
  if(!o)return{x:0,y:0,w:0,h:0};
  if(isElement(o))return boundsFromPoints(elementCorners(o));
  if(o.type==='drawing')return boundsFromPoints(o.points||[]);
  if(o.type==='connector')return boundsFromPoints(boardConnectorPolyline(o,24,findObject));
  return{x:0,y:0,w:0,h:0};
}
function getBoardBounds(objs,findObject){
  if(!objs.length)return null;
  const bs=objs.map(o=>boardObjectBounds(o,findObject)),minX=Math.min(...bs.map(b=>b.x)),minY=Math.min(...bs.map(b=>b.y));
  const maxX=Math.max(...bs.map(b=>b.x+b.w)),maxY=Math.max(...bs.map(b=>b.y+b.h));
  return{x:minX,y:minY,w:maxX-minX,h:maxY-minY};
}
function cubicTangent(g,t){
  const u=1-t;return{
    x:3*u*u*(g.c1.x-g.p1.x)+6*u*t*(g.c2.x-g.c1.x)+3*t*t*(g.p2.x-g.c2.x),
    y:3*u*u*(g.c1.y-g.p1.y)+6*u*t*(g.c2.y-g.c1.y)+3*t*t*(g.p2.y-g.c2.y)
  };
}
function applyTextBoxTypography(node,object){
  node.classList.add('textEl');
  node.style.fontSize=(object.fontSize||28)+'px';
  node.style.fontWeight=object.fontWeight||600;
  node.style.textAlign=object.align||'left';
}
function textBoxWidth(object){
  return Math.max(TEXT_BOX_MIN_WIDTH,Number(object.w)||TEXT_BOX_DEFAULT_WIDTH);
}

function wrapLines(ctx,text,maxWidth){
  const lines=[];for(const raw of String(text||'').split('\n')){
    if(raw===''){lines.push('');continue}
    let line='';for(const ch of raw){const test=line+ch;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=ch}else line=test}lines.push(line)
  }return lines;
}
function drawArrow(ctx,from,to,color,width){
  const ang=Math.atan2(to.y-from.y,to.x-from.x),len=9+width*1.5;ctx.save();ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(to.x,to.y);
  ctx.lineTo(to.x-len*Math.cos(ang-.42),to.y-len*Math.sin(ang-.42));ctx.lineTo(to.x-len*Math.cos(ang+.42),to.y-len*Math.sin(ang+.42));ctx.closePath();ctx.fill();ctx.restore();
}
function strokeSmoothCanvas(ctx,pts){
  if(!pts||pts.length<2)return;
  ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
  for(let i=1;i<pts.length-1;i++){
    const p=pts[i],n=pts[i+1];
    ctx.quadraticCurveTo(p.x,p.y,(p.x+n.x)/2,(p.y+n.y)/2);
  }
  const last=pts.at(-1);ctx.lineTo(last.x,last.y);ctx.stroke();
}
function paintExportDrawing(ctx,o){
  ctx.save();
  if(o.highlighter)ctx.globalAlpha=HIGHLIGHT_OPACITY;
  ctx.strokeStyle=o.color||DEFAULTS.line;
  ctx.lineWidth=o.width||4;
  ctx.lineCap='round';
  ctx.lineJoin='round';
  strokeSmoothCanvas(ctx,o.points);
  ctx.restore();
}
function paintExportConnector(ctx,o,findObject){
  ctx.save();
  const g=boardConnectorGeometry(o,findObject),color=o.color||DEFAULTS.line,width=o.width||3;
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();
  ctx.moveTo(g.p1.x,g.p1.y);ctx.bezierCurveTo(g.c1.x,g.c1.y,g.c2.x,g.c2.y,g.p2.x,g.p2.y);ctx.stroke();
  if(o.arrow==='end'||o.arrow==='both')drawArrow(ctx,g.c2,g.p2,color,width);
  if(o.arrow==='both')drawArrow(ctx,g.c1,g.p1,color,width);
  if(o.label){
    const t=clamp(o.label.t??.5,0,1),pt=bezierPoint(g,t),tan=cubicTangent(g,t),len=Math.hypot(tan.x,tan.y)||1,n={x:-tan.y/len,y:tan.x/len},off=o.label.offset??-14;
    const x=pt.x+n.x*off,y=pt.y+n.y*off;
    ctx.font='600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';ctx.textBaseline='middle';ctx.textAlign='center';
    const tw=ctx.measureText(o.label.text||'关系').width+14;ctx.fillStyle='rgba(251,251,250,.96)';ctx.fillRect(x-tw/2,y-10,tw,20);
    ctx.fillStyle='#171717';ctx.fillText(o.label.text||'关系',x,y);
  }
  ctx.restore();
}
function normalizeTextMarks(marks,length){
  if(!Array.isArray(marks))return [];
  const sorted=[];
  for(const mark of marks){
    if(!Array.isArray(mark)||!Number.isInteger(mark[0])||!Number.isInteger(mark[1]))continue;
    const start=clamp(mark[0],0,length),end=clamp(mark[1],0,length);
    if(start<end)sorted.push([start,end]);
  }
  sorted.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const result=[];
  for(const mark of sorted){
    const last=result.at(-1);
    if(last&&mark[0]<=last[1])last[1]=Math.max(last[1],mark[1]);
    else result.push(mark);
  }
  return result;
}
function withTextBoxLayout(object,useLayout){
  const box=document.createElement('div');
  applyTextBoxTypography(box,object);
  if(object.type==='sticky')Object.assign(box.style,{fontSize:'20px',fontWeight:'560',textAlign:'left',padding:'24px 23px',lineHeight:'1.55'});
  Object.assign(box.style,{position:'fixed',left:'0',top:'0',width:object.w+'px',visibility:'hidden'});
  const content=document.createElement('div');
  content.className='editableText';
  const text=document.createTextNode(String(object.text??(object.type==='sticky'?'':'文字')).replace(/\r\n?/g,'\n'));
  content.appendChild(text);
  box.appendChild(content);
  document.body.appendChild(box);
  try{
    return useLayout(box,text);
  }finally{
    box.remove();
  }
}
const textGraphemes=new Intl.Segmenter(undefined,{granularity:'grapheme'});
function paintExportTextBox(ctx,object){
  // Let the renderer do the wrapping so mixed scripts and long words match the board.
  withTextBoxLayout(object,(box,text)=>{
    const style=getComputedStyle(box),lineHeight=parseFloat(style.lineHeight);
    const marks=normalizeTextMarks(object.textMarks,text.length);
    if(marks.length){
      const range=document.createRange(),origin=box.getBoundingClientRect();
      ctx.fillStyle='rgba(255,222,38,.58)';
      for(const [start,end] of marks){
        range.setStart(text,start);range.setEnd(text,end);
        for(const rect of range.getClientRects()){
          ctx.fillRect(object.x+rect.left-origin.left,object.y+rect.top-origin.top,rect.width,rect.height);
        }
      }
    }
    ctx.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.fillStyle=object.type==='sticky'?'#171717':object.color||DEFAULTS.text;
    ctx.textBaseline='top';
    ctx.textAlign=style.textAlign;
    let x=object.x+parseFloat(style.paddingLeft),y=object.y+parseFloat(style.paddingTop);
    if(ctx.textAlign==='center')x=object.x+object.w/2;
    if(ctx.textAlign==='right')x=object.x+object.w-parseFloat(style.paddingRight);

    const range=document.createRange();
    let line='',lineTop=null;
    for(const {index,segment} of textGraphemes.segment(text.data)){
      if(segment==='\n'){
        ctx.fillText(line,x,y);
        y+=lineHeight;line='';lineTop=null;
        continue;
      }
      range.setStart(text,index);range.setEnd(text,index+segment.length);
      const top=range.getBoundingClientRect().top;
      if(lineTop!==null&&top-lineTop>lineHeight/2){
        ctx.fillText(line,x,y);
        y+=lineHeight;line='';lineTop=null;
      }
      if(lineTop===null)lineTop=top;
      line+=segment;
    }
    if(line)ctx.fillText(line,x,y);
  });
}
function boardCanvasLayout(bounds,objects,mode){
  if(mode==='thumbnail'){
    const width=640,height=360;
    const padding=objects.reduce((size,o)=>Math.max(size,(o.width||o.strokeWidth||0)/2+8),18);
    const scale=Math.min((width-36)/(bounds.w+2*padding),(height-36)/(bounds.h+2*padding));
    return {width,height,scale,x:(width-bounds.w*scale)/2-bounds.x*scale,y:(height-bounds.h*scale)/2-bounds.y*scale};
  }
  const selectionOnly=mode==='selection',padding=selectionOnly?36:80;
  const width=Math.max(selectionOnly?1:420,bounds.w+padding*2),height=Math.max(selectionOnly?1:320,bounds.h+padding*2);
  const scale=Math.min(2,3600/Math.max(width,height));
  return {width:Math.ceil(width*scale),height:Math.ceil(height*scale),scale,x:(padding-bounds.x)*scale,y:(padding-bounds.y)*scale};
}
function paintBoardImage(ctx,object,image,contain){
  if(!image){
    ctx.fillStyle='#e9e9e7';
    ctx.fillRect(object.x,object.y,object.w,object.h);
    return;
  }
  const padding=object.imageStyle==='card'?6:0;
  if(padding){
    ctx.shadowColor='rgba(30,30,30,.13)';ctx.shadowBlur=22;ctx.shadowOffsetY=9;
    ctx.fillStyle='#fff';ctx.fillRect(object.x,object.y,object.w,object.h);ctx.shadowColor='transparent';
  }
  const width=Math.max(0,object.w-2*padding),height=Math.max(0,object.h-2*padding);
  if(!contain){
    ctx.drawImage(image,object.x+padding,object.y+padding,width,height);
    return;
  }
  const scale=Math.min(width/image.naturalWidth,height/image.naturalHeight);
  const imageWidth=image.naturalWidth*scale,imageHeight=image.naturalHeight*scale;
  ctx.drawImage(image,object.x+(object.w-imageWidth)/2,object.y+(object.h-imageHeight)/2,imageWidth,imageHeight);
}
async function renderBoardCanvas(objects,getImageSource,mode='board',allObjects=objects){
  if(!objects.length)return null;
  const thumbnail=mode==='thumbnail';
  if(thumbnail){
    // Older files stored a fixed text-box height, even when the text wrapped.
    objects=objects.map(o=>{
      if(o.type!=='text')return o;
      const textBox={...o,w:textBoxWidth(o)};
      textBox.h=withTextBoxLayout(textBox,box=>box.offsetHeight);
      return textBox;
    });
    allObjects=objects;
  }
  const objectsById=new Map(allObjects.map(o=>[o.id,o]));
  const findObject=id=>objectsById.get(id);
  const layout=boardCanvasLayout(getBoardBounds(objects,findObject),objects,mode);
  const out=document.createElement('canvas');
  out.width=layout.width;out.height=layout.height;
  const ctx=out.getContext('2d');
  ctx.fillStyle='#fbfbfa';ctx.fillRect(0,0,out.width,out.height);
  ctx.setTransform(layout.scale,0,0,layout.scale,layout.x,layout.y);

  const images=new Map();
  for(const o of objects){
    if(o.type!=='image'||images.has(o.assetId))continue;
    try{
      const source=await getImageSource(o.assetId);
      if(!source)throw new Error('图片资源不可用');
      const image=new Image();image.src=source;await image.decode();
      images.set(o.assetId,image);
    }catch(error){
      if(!thumbnail)throw error;
      images.set(o.assetId,null);
    }
  }
  for(const o of sortBoardObjects(objects)){
    if(o.type==='connector'){paintExportConnector(ctx,o,findObject);continue}
    if(o.type==='drawing'){paintExportDrawing(ctx,o);continue}
    const cx=o.x+o.w/2,cy=o.y+o.h/2;ctx.save();ctx.translate(cx,cy);ctx.rotate((o.rot||0)*Math.PI/180);ctx.translate(-cx,-cy);
    if(o.type==='sticky'){
      ctx.shadowColor='rgba(35,35,35,.13)';ctx.shadowBlur=24;ctx.shadowOffsetY=10;ctx.fillStyle=o.fill||DEFAULTS.sticky;ctx.fillRect(o.x,o.y,o.w,o.h);ctx.shadowColor='transparent';
      if(o.textMarks?.length){
        paintExportTextBox(ctx,o);ctx.restore();continue;
      }
      ctx.fillStyle='#171717';ctx.font='560 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';ctx.textBaseline='top';
      const lines=wrapLines(ctx,o.text,o.w-46);lines.forEach((line,i)=>ctx.fillText(line,o.x+23,o.y+24+i*31));
    }else if(o.type==='text'){
      paintExportTextBox(ctx,o);
    }else if(o.type==='rect'||o.type==='circle'){
      ctx.lineWidth=o.strokeWidth||2;ctx.strokeStyle=o.stroke||DEFAULTS.shapeStroke;if(o.fill&&o.fill!=='transparent'){ctx.fillStyle=o.fill}
      ctx.beginPath();if(o.type==='rect')ctx.rect(o.x,o.y,o.w,o.h);else ctx.ellipse(cx,cy,o.w/2,o.h/2,0,0,Math.PI*2);
      if(o.fill&&o.fill!=='transparent')ctx.fill();ctx.stroke();
    }else if(o.type==='image'){
      paintBoardImage(ctx,o,images.get(o.assetId),thumbnail);
    }
    ctx.restore();
  }
  return out;
}
async function createBoardThumbnail(objects,getImageSource){
  const thumbnail=await renderBoardCanvas(objects,getImageSource,'thumbnail');
  return thumbnail?.toDataURL('image/webp',.86)||null;
}
