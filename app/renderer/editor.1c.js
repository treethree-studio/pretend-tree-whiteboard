/* Geometry */
function screenToWorld(x,y){
  const c=state.camera;return{x:(x-c.x)/c.scale,y:(y-c.y)/c.scale}
}
function worldToScreen(x,y){
  const c=state.camera;return{x:c.x+x*c.scale,y:c.y+y*c.scale}
}
function endpointPoint(ep,other){return resolveBoardEndpoint(ep,other,getObj)}
function connectorGeom(o){return boardConnectorGeometry(o,getObj)}
function connectorPolyline(o,n=24){return boardConnectorPolyline(o,n,getObj)}
function objectBounds(o){return boardObjectBounds(o,getObj)}
function unionBounds(objects){return getBoardBounds(objects,getObj)}
function rectIntersects(a,b){return a.x<=b.x+b.w&&a.x+a.w>=b.x&&a.y<=b.y+b.h&&a.y+a.h>=b.y}
function pointSegDistance(p,a,b){
  const vx=b.x-a.x,vy=b.y-a.y,wx=p.x-a.x,wy=p.y-a.y,len=vx*vx+vy*vy;
  if(!len)return dist(p,a);let t=(wx*vx+wy*vy)/len;t=clamp(t,0,1);
  return Math.hypot(p.x-(a.x+t*vx),p.y-(a.y+t*vy));
}
function hitVector(p){
  const tol=16/state.camera.scale;
  const vectors=objectsByLayer(state.objects.filter(isVector)).reverse();
  for(const o of vectors){
    const pts=o.type==='drawing'?o.points:connectorPolyline(o);
    for(let i=1;i<pts.length;i++)if(pointSegDistance(p,pts[i-1],pts[i])<=tol+(o.width||3)/2)return o;
  }
  return null;
}
