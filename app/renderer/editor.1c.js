/* Geometry */
function screenToWorld(x,y){
  const c=state.camera;return{x:(x-c.x)/c.scale,y:(y-c.y)/c.scale}
}
function worldToScreen(x,y){
  const c=state.camera;return{x:c.x+x*c.scale,y:c.y+y*c.scale}
}
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
function endpointPoint(ep,other){
  if(!ep)return{x:0,y:0};
  if(!ep.id)return{x:ep.x,y:ep.y};
  const o=getObj(ep.id);if(!o)return{x:0,y:0};
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
function connectorGeom(o){
  let roughA=o.from?.id?{x:getObj(o.from.id)?.x||0,y:getObj(o.from.id)?.y||0}:{x:o.from?.x||0,y:o.from?.y||0};
  let roughB=o.to?.id?{x:getObj(o.to.id)?.x||0,y:getObj(o.to.id)?.y||0}:{x:o.to?.x||0,y:o.to?.y||0};
  const p1=endpointPoint(o.from,roughB),p2=endpointPoint(o.to,p1),dx=p2.x-p1.x,dy=p2.y-p1.y;
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
function connectorPolyline(o,n=24){
  const g=connectorGeom(o),pts=[];for(let i=0;i<=n;i++)pts.push(bezierPoint(g,i/n));return pts;
}
function objectBounds(o){
  if(!o)return{x:0,y:0,w:0,h:0};
  if(isElement(o))return boundsFromPoints(elementCorners(o));
  if(o.type==='drawing')return boundsFromPoints(o.points||[]);
  if(o.type==='connector')return boundsFromPoints(connectorPolyline(o));
  return{x:0,y:0,w:0,h:0};
}
function unionBounds(objs){
  if(!objs.length)return null;
  const bs=objs.map(objectBounds),minX=Math.min(...bs.map(b=>b.x)),minY=Math.min(...bs.map(b=>b.y));
  const maxX=Math.max(...bs.map(b=>b.x+b.w)),maxY=Math.max(...bs.map(b=>b.y+b.h));
  return{x:minX,y:minY,w:maxX-minX,h:maxY-minY};
}
function rectIntersects(a,b){return a.x<=b.x+b.w&&a.x+a.w>=b.x&&a.y<=b.y+b.h&&a.y+a.h>=b.y}
function pointSegDistance(p,a,b){
  const vx=b.x-a.x,vy=b.y-a.y,wx=p.x-a.x,wy=p.y-a.y,len=vx*vx+vy*vy;
  if(!len)return dist(p,a);let t=(wx*vx+wy*vy)/len;t=clamp(t,0,1);
  return Math.hypot(p.x-(a.x+t*vx),p.y-(a.y+t*vy));
}
function hitVector(p){
  const tol=16/state.camera.scale;
  const vectors=state.objects.filter(isVector).slice().reverse();
  for(const o of vectors){
    const pts=o.type==='drawing'?o.points:connectorPolyline(o);
    for(let i=1;i<pts.length;i++)if(pointSegDistance(p,pts[i-1],pts[i])<=tol+(o.width||3)/2)return o;
  }
  return null;
}
