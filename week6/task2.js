(() => {
'use strict';
const cv=document.querySelector('#cv'),gl=D.context(cv);if(!gl)return;

const VS=`#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
uniform mat4 uVP,uModel;
out vec3 vLocal,vP,vN;out vec2 vUV;
void main(){
 vec4 world=uModel*vec4(aPos,1.0);
 vLocal=aPos;
 vP=world.xyz;
 vN=mat3(transpose(inverse(uModel)))*aNormal;
 vUV=aUV;
 gl_Position=uVP*world;
}`;
const FS=`#version 300 es
precision highp float;
const float PI=3.14159265;
in vec3 vLocal,vP,vN;in vec2 vUV;out vec4 outColor;
uniform sampler2D uColor,uNormal,uARM;
uniform vec3 uEye,uLightPos;
uniform vec2 uResolution;
uniform float uSolarDistance,uImpactAmount,uSunIntensity,uAmbient,uNormalStrength;
uniform int uViewMode;

vec3 srgbToLinear(vec3 c){
 return mix(c/12.92,pow((c+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),c));
}
vec3 linearToSrgb(vec3 c){
 c=max(c,vec3(0.0));
 return mix(12.92*c,1.055*pow(c,vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));
}
float hash21(vec2 p){
 return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);
}

float climateMask(vec3 localPosition){
 float solarLevel=clamp((uSolarDistance-0.65)/0.85,0.0,1.0);
 float iceBoundary=mix(0.97,0.48,solarLevel);
 float latitude=abs(normalize(localPosition).y);
 return smoothstep(iceBoundary,iceBoundary+0.10,latitude);
}

float impactMask(vec2 uv,vec3 localPosition){
 const vec2 gridSize=vec2(24.0,12.0);
 vec2 grid=uv*gridSize;
 vec2 cell=floor(grid),f=fract(grid);
 float mask=0.0;
 float longitudeScale=max(0.15,sqrt(max(0.0,1.0-localPosition.y*localPosition.y)));
 for(int y=-1;y<=1;y++){
  for(int x=-1;x<=1;x++){
   vec2 offset=vec2(float(x),float(y));
   vec2 id=cell+offset;
   vec2 hashId=vec2(mod(id.x+gridSize.x,gridSize.x),id.y);
   float spawn=hash21(hashId);
   float activation=smoothstep(spawn-0.08,spawn+0.08,uImpactAmount);
   vec2 jitter=vec2(hash21(hashId+17.0),hash21(hashId+vec2(29.0,7.0)));
   vec2 center=0.5+(jitter-0.5)*0.42;
   vec2 delta=f-offset-center;
   delta.x*=longitudeScale;
   float dist=length(delta);
   float radius=0.055+0.075*uImpactAmount+0.035*hash21(hashId+vec2(3.0,11.0));
   float crater=1.0-smoothstep(radius-0.025,radius+0.025,dist);
   mask=max(mask,crater*activation);
  }
 }
 return mask;
}

vec3 directPBR(vec3 N,vec3 V,vec3 L,vec3 base,float rough,float metal){
 float nl=max(dot(N,L),0.0),nv=max(dot(N,V),0.0);
 vec3 H=normalize(V+L);
 float nh=max(dot(N,H),0.0),vh=max(dot(V,H),0.0);
 float a=rough*rough,a2=a*a;
 float den=nh*nh*(a2-1.0)+1.0;
 float D=a2/max(PI*den*den,1e-6);
 float k=(rough+1.0)*(rough+1.0)/8.0;
 float G=(nl/(nl*(1.0-k)+k))*(nv/(nv*(1.0-k)+k));
 vec3 F0=mix(vec3(0.04),base,metal);
 vec3 F=F0+(1.0-F0)*pow(1.0-vh,5.0);
 vec3 kd=(1.0-F)*(1.0-metal);
 return (kd*base/PI+D*G*F/max(4.0*nl*nv,1e-4))*nl*uSunIntensity;
}

void main(){
 vec3 N=normalize(vN);
 float climate=climateMask(vLocal);
 float impact=impactMask(vUV,vLocal);
 if(uViewMode==2){outColor=vec4(vec3(climate),1.0);return;}
 if(uViewMode==3){outColor=vec4(vec3(impact),1.0);return;}

 vec3 base=srgbToLinear(texture(uColor,vUV).rgb);
 vec3 arm=texture(uARM,vUV).rgb;
 float rough=max(arm.g,0.045);
 float metal=arm.b;
 float ao=arm.r;

 bool original=uViewMode==1&&gl_FragCoord.x<uResolution.x*0.5;
 if(!original){
  base=mix(base,vec3(0.42,0.72,0.86),climate);
  rough=mix(rough,0.88,climate);
  metal=mix(metal,0.02,climate);
  base=mix(base,vec3(0.16,0.105,0.075),impact*0.78);
  rough=mix(rough,0.94,impact*0.82);
  metal=mix(metal,0.01,impact);
 }

 if(uNormalStrength>0.0){
  vec3 dp1=dFdx(vP),dp2=dFdy(vP);
  vec2 du1=dFdx(vUV),du2=dFdy(vUV);
  vec3 T=cross(dp2,N)*du1.x+cross(N,dp1)*du2.x;
  vec3 B=cross(dp2,N)*du1.y+cross(N,dp1)*du2.y;
  float inv=inversesqrt(max(max(dot(T,T),dot(B,B)),1e-8));
  vec3 mapN=texture(uNormal,vUV).xyz*2.0-1.0;
  mapN.xy*=uNormalStrength;
  N=normalize(mat3(T*inv,B*inv,N)*normalize(mapN));
 }

 vec3 V=normalize(uEye-vP);
 vec3 L=normalize(uLightPos-vP);
 vec3 color=directPBR(N,V,L,base,rough,metal);
 vec3 F0=mix(vec3(0.04),base,metal);
 color+=uAmbient*ao*(base*(1.0-metal)*(1.0-F0)+F0);
 color=color/(1.0+color);
 outColor=vec4(linearToSrgb(color),1.0);
}`;
const sunVS=`#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uVP,uModel;
void main(){gl_Position=uVP*uModel*vec4(aPos,1.0);}`;
const sunFS=`#version 300 es
precision highp float;
out vec4 outColor;
void main(){outColor=vec4(1.0,0.58,0.16,1.0);}`;

const prog=D.program(gl,VS,FS);
const U=D.uniforms(gl,prog,[
 'uVP','uModel','uEye','uLightPos','uResolution','uSolarDistance','uImpactAmount',
 'uSunIntensity','uAmbient','uNormalStrength','uViewMode','uColor','uNormal','uARM'
]);
const sunProg=D.program(gl,sunVS,sunFS);
const SU=D.uniforms(gl,sunProg,['uVP','uModel']);
const sphere=D.upload(gl,D.revolution(D.profiles.sphere(1,48),64));
const textureJobs=[];
let textureFailed=false;
const material={color:loadTexture('rock_boulder_dry_Diffuse.jpg'),normal:loadTexture('rock_boulder_dry_nor_gl.jpg'),arm:loadTexture('rock_boulder_dry_arm.png')};
function loadTexture(file){
 const tex=gl.createTexture();
 gl.bindTexture(gl.TEXTURE_2D,tex);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([128,128,128,255]));
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 textureJobs.push(new Promise(resolve=>{
  const image=new Image();
  image.onload=()=>{
   gl.bindTexture(gl.TEXTURE_2D,tex);
   gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
   gl.generateMipmap(gl.TEXTURE_2D);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
   resolve();
  };
  image.onerror=()=>{textureFailed=true;resolve();};
  image.src='assets/week06/'+file;
 }));
 return tex;
}

document.querySelector('#ui').innerHTML='';
const S=D.UI('#ui',[
 {id:'solar',label:'태양 거리 조건 (AU)',min:0.65,max:1.5,step:0.01,value:1.0},
 {id:'impacts',label:'충돌 누적량',min:0,max:1,step:0.01,value:0.55},
 {id:'view',type:'select',label:'표면 보기',value:'surface',options:[
  {value:'surface',label:'변화 표면'},{value:'compare',label:'기본 / 변화 비교'},
  {value:'climate',label:'기후 얼음 마스크'},{value:'impact',label:'충돌 마스크'}]},
 {id:'normal',label:'Normal 강도',min:0,max:4,step:0.05,value:1.1},
 {id:'sun',label:'태양광 세기',min:0,max:8,step:0.1,value:4.5},
 {id:'ambient',label:'간접광',min:0,max:0.5,step:0.01,value:0.08},
]);

const cam=D.orbit(cv,{dist:19.5,pitch:0.28,min:8,max:60});
let overheadView=false,savedCamera=null;
const overheadButton=document.querySelector('#overhead-view');
function setOverheadView(enabled){
 if(enabled&&!overheadView)savedCamera={dist:cam.dist,yaw:cam.yaw,pitch:cam.pitch};
 overheadView=enabled;
 if(enabled){
  cam.dist=42;
  cam.yaw=0;
  cam.pitch=1.52;
 }else if(savedCamera){
  cam.dist=savedCamera.dist;
  cam.yaw=savedCamera.yaw;
  cam.pitch=savedCamera.pitch;
  savedCamera=null;
 }
 overheadButton.textContent=enabled?'기본 시점으로 돌아가기':'위에서 보기';
 overheadButton.setAttribute('aria-pressed',String(enabled));
}
overheadButton.onclick=()=>setOverheadView(!overheadView);
document.querySelector('#reset').onclick=()=>{
 setOverheadView(false);
 cam.dist=19.5;cam.yaw=0.6;cam.pitch=0.28;
};
const orbitButton=document.querySelector('#sun-orbit');
let sunOrbiting=false,sunAngle=Math.PI,previousTime=null;
orbitButton.setAttribute('aria-pressed','false');
orbitButton.onclick=()=>{
 sunOrbiting=!sunOrbiting;
 orbitButton.textContent=sunOrbiting?'태양 공전 멈추기':'태양 공전 시작';
 orbitButton.setAttribute('aria-pressed',String(sunOrbiting));
};
const view=D.M4.create(),proj=D.M4.create(),vp=D.M4.create();
const planetModel=D.M4.create(),sunModel=D.M4.create();
const sceneTarget=[-3.45,0,0];
const overheadTarget=[0,0,0];
const planetRadius=0.72;
const viewModes={surface:0,compare:1,climate:2,impact:3};
const status=document.querySelector('#status');
document.querySelector('#note').textContent='행성은 제자리에서 자전합니다. 오른쪽 버튼으로 태양 공전을 시작하거나 멈출 수 있습니다. 태양 거리 조건은 얼음 범위와 빛의 세기에 반영됩니다. 비교 모드의 왼쪽은 기본 표면, 오른쪽은 변화 표면입니다.';
document.querySelector('#status').textContent='Poly Haven rock_boulder_dry 텍스처 로딩 중…';
Promise.all(textureJobs).then(()=>{
 status.textContent=textureFailed?'텍스처 일부를 불러오지 못했습니다. HTTP 서버와 assets/week06 경로를 확인하세요.':'행성 재질 로딩 완료 · 마우스로 시점을 회전하세요.';
});
let visible=true;
new IntersectionObserver(entries=>visible=entries[0].isIntersecting).observe(cv);
D.loop((time)=>{
 if(!visible||document.hidden)return;
 if(previousTime!==null&&sunOrbiting)sunAngle+=Math.min(time-previousTime,0.1)*0.35;
 previousTime=time;
 D.fit(cv);
 gl.viewport(0,0,cv.width,cv.height);
 D.clearColor(gl);
 gl.enable(gl.DEPTH_TEST);
 gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 const target=overheadView?overheadTarget:sceneTarget;
 const eye=cam.eye(target);
 D.M4.lookAt(view,eye,target,overheadView?[0,0,-1]:[0,1,0]);
 D.M4.perspective(proj,Math.PI/4,cv.width/cv.height,0.1,100);
 D.M4.multiply(vp,proj,view);

 const sunPosition=[7.05*Math.cos(sunAngle),0,7.05*Math.sin(sunAngle)];
 D.M4.identity(sunModel);
 D.M4.translate(sunModel,sunModel,sunPosition);
 D.M4.scale(sunModel,sunModel,[0.41,0.41,0.41]);
 gl.useProgram(sunProg);
 gl.uniformMatrix4fv(SU.uVP,false,vp);
 gl.uniformMatrix4fv(SU.uModel,false,sunModel);
 gl.bindVertexArray(sphere.vao);
 gl.drawElements(gl.TRIANGLES,sphere.count,gl.UNSIGNED_SHORT,0);

 D.M4.identity(planetModel);
 D.M4.rotateZ(planetModel,planetModel,0.409);
 D.M4.rotateY(planetModel,planetModel,time*0.8);
 D.M4.scale(planetModel,planetModel,[planetRadius,planetRadius,planetRadius]);

 gl.useProgram(prog);
 gl.uniformMatrix4fv(U.uVP,false,vp);
 gl.uniformMatrix4fv(U.uModel,false,planetModel);
 gl.uniform3fv(U.uEye,eye);
 gl.uniform3fv(U.uLightPos,sunPosition);
 gl.uniform2f(U.uResolution,cv.width,cv.height);
 gl.uniform1f(U.uSolarDistance,S.solar);
 gl.uniform1f(U.uImpactAmount,S.impacts);
 gl.uniform1f(U.uSunIntensity,S.sun/(S.solar*S.solar));
 gl.uniform1f(U.uAmbient,S.ambient);
 gl.uniform1f(U.uNormalStrength,S.normal);
 gl.uniform1i(U.uViewMode,viewModes[S.view]);
 [material.color,material.normal,material.arm].forEach((tex,i)=>{
  gl.activeTexture(gl.TEXTURE0+i);
  gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.uniform1i(U[['uColor','uNormal','uARM'][i]],i);
 });
 gl.bindVertexArray(sphere.vao);
 gl.drawElements(gl.TRIANGLES,sphere.count,gl.UNSIGNED_SHORT,0);
 gl.bindVertexArray(null);
});
})();
