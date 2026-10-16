/* Parametric lampshade plus modeled pedestal, all dimensions in millimeters. */
(function(root){'use strict';
function buildGeometry(p,quality='full'){
 const N=quality==='fallback'?80:128,M=quality==='fallback'?40:72;
 const pos=[],uv=[],idx=[],h=p.height,d=p.diameter,tw=p.twist*Math.PI/180;
 const shape=p.shape||'rounded',relief=p.relief||'flutes',freq=Number(p.reliefScale||1),strength=Number(p.reliefStrength??.5);
 function profile(t){const taper=1-p.taper*.0045+p.taper*.009*t;
  if(shape==='mushroom')return taper*(.58+.42*Math.min(1,t*2.4))*(t>.58?1+.23*Math.sin(Math.PI*(t-.58)/.42):1);
  if(shape==='square'||shape==='faceted')return taper*(.94+.06*Math.sin(Math.PI*t));
  if(shape==='bell')return taper*(.55+.45*t)*(1+.15*Math.sin(Math.PI*t));
  if(shape==='bulb')return taper*(.58+.42*Math.sin(Math.PI*t));
  if(shape==='hourglass')return taper*(.72+.22*Math.cos((t-.5)*Math.PI*2));

  if(shape==='cone')return taper*(.52+.48*t);
  if(shape==='cylinder')return taper;
  return taper*(.70+.30*Math.sin(Math.PI*t));
 }
 function displacement(a,t){if(relief==='smooth')return 0;const s=strength*freq;
  if(relief==='flutes')return Math.cos(a*p.ribs+tw*t*1.6)*p.depth*.5;
  if(relief==='spiral')return Math.cos(a*7*freq-t*16*freq+tw*t)*p.depth*.8*s;
  if(relief==='diamond')return Math.cos(a*11*freq)*Math.cos(t*h*.10*freq)*p.depth*.8*s;
  if(relief==='scales')return Math.cos(a*15*freq+Math.sin(t*h*.07*freq)*1.5)*Math.cos(t*h*.09*freq)*p.depth*.7*s;
  if(relief==='waves')return Math.sin(a*5*freq+Math.sin(t*11*freq)*2.2)*p.depth*.8*s;
  if(relief==='organic')return (Math.sin(a*8*freq+Math.sin(t*17*freq)*1.5)+.5*Math.sin(a*13*freq-t*23*freq))*p.depth*.48*s;
  if(relief==='knurl')return Math.sin(a*18*freq)*Math.sin(t*h*.14*freq)*p.depth*.75*s;
  if(relief==='pebbles')return Math.cos(a*13*freq+Math.sin(t*19*freq)*.8)*Math.cos(t*h*.12*freq)*p.depth*.6*s;
  if(relief==='contours')return Math.sin(t*h*.16*freq+Math.sin(a*4*freq)*1.4)*p.depth*.8*s;
  if(relief==='checker')return Math.tanh(5*Math.sin(a*12*freq)*Math.sin(t*h*.13*freq))*p.depth*.42*s;
  return 0;
 }
 function addRingSurface(rings,segments,cap=true){const start=pos.length/3,stride=segments+1;
  rings.forEach((ring,j)=>{for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2;let r=ring.r;
   if(baseShape==='square'||baseShape==='faceted'){const co=Math.cos(a),si=Math.sin(a),e=baseShape==='faceted'?.18:.55;r*=Math.pow(Math.pow(Math.abs(co),2/e)+Math.pow(Math.abs(si),2/e),-e/2);}
   if(baseRelief!=='smooth'&&j>0&&j<rings.length-1){let q=0;
    if(baseRelief==='flutes')q=Math.cos(a*Number(p.baseRibs||24));
    else if(baseRelief==='spiral')q=Math.cos(a*7-(j/(rings.length-1))*8);
    else if(baseRelief==='diamond')q=Math.cos(a*12)*Math.cos(j*2.2);
    else if(baseRelief==='waves')q=Math.sin(a*5+Math.sin(j*1.3)*1.5);
    else if(baseRelief==='beads')q=Math.pow(Math.max(0,Math.cos(a*16)),4);
    r+=q*baseReliefDepth;
   }
   pos.push(Math.cos(a)*r,ring.y,Math.sin(a)*r);uv.push(i/segments,j/Math.max(1,rings.length-1));}});
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<segments;i++){const a=start+j*stride+i,b=a+stride;idx.push(a,b,a+1,b,b+1,a+1);}
  if(cap){const bottom=pos.length/3;pos.push(0,rings[0].y,0);uv.push(.5,0);const top=pos.length/3;pos.push(0,rings[rings.length-1].y,0);uv.push(.5,1);
   for(let i=0;i<segments;i++){idx.push(bottom,start+i,start+i+1);const a=start+(rings.length-1)*stride+i;idx.push(top,a+1,a);}}
 }
 const start=0,stride=N+1,layerSize=stride*(M+1);
 for(let layer=0;layer<2;layer++)for(let j=0;j<=M;j++){const t=j/M,baseR=d*.5*profile(t);for(let i=0;i<=N;i++){
  const a=i/N*Math.PI*2;let r=baseR+displacement(a,t);
  if(shape==='square'||shape==='faceted'){const c=Math.cos(a),s=Math.sin(a),e=shape==='faceted'?.18:.55;r*=Math.pow(Math.pow(Math.abs(c),2/e)+Math.pow(Math.abs(s),2/e),-e/2);}
  if(layer)r-=p.wall; r=Math.max(2,r);
  pos.push(Math.cos(a+tw*t)*r,(t-.5)*h,Math.sin(a+tw*t)*r);uv.push(i/N,t);
 }}
 for(let layer=0;layer<2;layer++)for(let j=0;j<M;j++)for(let i=0;i<N;i++){const a=start+layer*layerSize+j*stride+i,b=a+stride;
  if(layer)idx.push(a,a+1,b,b,a+1,b+1);else idx.push(a,b,a+1,b,b+1,a+1);}
 for(const j of [0,M])for(let i=0;i<N;i++){const a=start+j*stride+i,b=a+1,c=start+layerSize+j*stride+i,e=c+1;if(j===0)idx.push(a,c,b,b,c,e);else idx.push(a,b,c,b,e,c);}
 const bh=Number(p.baseHeight||28),bd=Number(p.baseDiameter||90),style=p.baseStyle||'disc',baseShape=p.baseShape||'round',baseRelief=p.baseRelief||'smooth',baseReliefDepth=Number(p.baseReliefDepth||0),y0=-h/2-bh,y1=-h/2-1,inner=Math.max(p.base*.5,bd*.27);
 let rings;
 if(style==='cone')rings=[{y:y0,r:bd*.31},{y:y0+bh*.18,r:bd*.5},{y:y1-bh*.12,r:bd*.4},{y:y1,r:inner}];
 else if(style==='hourglass')rings=[{y:y0,r:bd*.42},{y:y0+bh*.25,r:bd*.5},{y:y0+bh*.62,r:bd*.31},{y:y1-bh*.12,r:bd*.36},{y:y1,r:inner}];
 else if(style==='cylinder')rings=[{y:y0,r:bd*.5},{y:y1,r:inner}];
 else if(style==='bell')rings=[{y:y0,r:bd*.32},{y:y0+bh*.2,r:bd*.42},{y:y0+bh*.68,r:bd*.5},{y:y1-bh*.1,r:bd*.44},{y:y1,r:inner}];
 else if(style==='bulb')rings=[{y:y0,r:bd*.32},{y:y0+bh*.25,r:bd*.48},{y:y0+bh*.55,r:bd*.5},{y:y1-bh*.1,r:bd*.35},{y:y1,r:inner}];
 else if(style==='faceted')rings=[{y:y0,r:bd*.4},{y:y0+bh*.25,r:bd*.5},{y:y1-bh*.12,r:bd*.48},{y:y1,r:inner}];
 else rings=[{y:y0,r:bd*.42},{y:y0+bh*.12,r:bd*.5},{y:y1-bh*.12,r:bd*.5},{y:y1,r:inner}];
 addRingSurface(rings,N,true);
 const positions=new Float32Array(pos),uvs=new Float32Array(uv),indices=new Uint16Array(idx),normals=new Float32Array(positions.length);
 for(let i=0;i<indices.length;i+=3){const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3,ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2],vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2],nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  for(const o of [a,b,c]){normals[o]+=nx;normals[o+1]+=ny;normals[o+2]+=nz;}}
 for(let i=0;i<normals.length;i+=3){const l=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;normals[i]/=l;normals[i+1]/=l;normals[i+2]/=l;}
 // The first and last angular samples occupy the same point. Match their normals
 // explicitly so smooth shading cannot reveal a vertical seam.
 for(let layer=0;layer<2;layer++)for(let j=0;j<=M;j++){
  const a=(layer*layerSize+j*stride)*3,b=(layer*layerSize+j*stride+N)*3;
  normals[b]=normals[a];normals[b+1]=normals[a+1];normals[b+2]=normals[a+2];
 }
 return {positions,normals,uvs,indices,radial:N,rows:M};
}
function encodeSTL({positions,indices}){const count=indices.length/3,buffer=new ArrayBuffer(84+count*50),view=new DataView(buffer),title='Curve Lab parametric lamp - mm';for(let i=0;i<title.length;i++)view.setUint8(i,title.charCodeAt(i));view.setUint32(80,count,true);let o=84;const write=n=>{view.setFloat32(o,n,true);o+=4;};
 for(let i=0;i<indices.length;i+=3){const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3,ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2],vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2],nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,l=Math.hypot(nx,ny,nz)||1;write(nx/l);write(ny/l);write(nz/l);for(const k of [a,b,c]){write(positions[k]);write(positions[k+1]);write(positions[k+2]);}view.setUint16(o,0,true);o+=2;}return buffer;}
const api={buildGeometry,encodeSTL};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LampGeometry=api;
})(typeof window!=='undefined'?window:this);
