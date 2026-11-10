import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// NEXUS-9: 두 독립 마스크를 계산해 base color / roughness / metallic에 연결한다.
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030713);
const camera = new THREE.PerspectiveCamera(48, (innerWidth - 214) / innerHeight, 0.1, 200);
camera.position.set(0, 6.0, 15.5);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth - 214, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('view').appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0,0,0);
controls.minDistance = 5;
controls.maxDistance = 28;

// 참고 화면처럼 표면 무늬나 후광 없는 단색 주황색 태양
const sun = new THREE.Mesh(new THREE.SphereGeometry(1.25, 48, 32),new THREE.MeshBasicMaterial({color:0xff9228}));
sun.position.set(0,0,0);scene.add(sun);
const starsGeo=new THREE.BufferGeometry();const stars=[];for(let i=0;i<1100;i++){let r=35+Math.random()*55,a=Math.random()*Math.PI*2,z=Math.random()*2-1;stars.push(r*Math.sqrt(1-z*z)*Math.cos(a),r*z,r*Math.sqrt(1-z*z)*Math.sin(a));}starsGeo.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));scene.add(new THREE.Points(starsGeo,new THREE.PointsMaterial({color:0x7bafdc,size:.12,sizeAttenuation:true})));

// 실습 1 방식: 실제 RGB tangent-space normal map 텍스처를 생성하여 GPU에서 샘플링한다.
// 외부 파일 의존성 없이 재현 가능하도록 Canvas에서 한 번 생성한다 (OpenGL +Y 규약).
const normalCanvas=document.createElement('canvas');normalCanvas.width=512;normalCanvas.height=256;
const normalCtx=normalCanvas.getContext('2d');
const normalImage=normalCtx.createImageData(512,256);
function heightAt(u,v){
  const seamX=Math.pow(Math.abs(Math.sin(u*Math.PI*36)),22);
  const seamY=Math.pow(Math.abs(Math.sin(v*Math.PI*20)),22);
  const fine=Math.sin(u*147.0+Math.sin(v*31)*2)*Math.sin(v*113.0)*0.018;
  return .15*Math.max(seamX,seamY)+fine;
}
for(let y=0;y<256;y++)for(let x=0;x<512;x++){
  const u=(x+.5)/512,v=(y+.5)/256,du=1/512,dv=1/256;
  const dx=(heightAt(u+du,v)-heightAt(u-du,v))*1.3;
  const dy=(heightAt(u,v+dv)-heightAt(u,v-dv))*1.3;
  const len=Math.hypot(dx,dy,1),i=(y*512+x)*4;
  normalImage.data[i]=Math.round(255*(1-dx/len)/2);
  normalImage.data[i+1]=Math.round(255*(1-dy/len)/2);
  normalImage.data[i+2]=Math.round(255*(1+1/len)/2);
  normalImage.data[i+3]=255;
}
normalCtx.putImageData(normalImage,0,0);
const normalTexture=new THREE.CanvasTexture(normalCanvas);
normalTexture.wrapS=THREE.RepeatWrapping;normalTexture.wrapT=THREE.RepeatWrapping;
normalTexture.colorSpace=THREE.NoColorSpace;
normalTexture.minFilter=THREE.LinearMipmapLinearFilter;
normalTexture.magFilter=THREE.LinearFilter;

const uniforms={uNormalMap:{value:normalTexture},uHeat:{value:.5},uEnergy:{value:.5},uMode:{value:0},uLight:{value:1},uSunPos:{value:new THREE.Vector3(0,0,0)},uCameraPos:{value:new THREE.Vector3()},uTime:{value:0},uNormalStrength:{value:1.1},uAmbient:{value:.11},uCyber:{value:1}};
const planetMat=new THREE.ShaderMaterial({uniforms,vertexShader:`
varying vec3 vLocal; varying vec3 vWorld; varying vec3 vN; varying vec2 vUV;
void main(){vLocal=position;vUV=uv;vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;vN=normalize(mat3(transpose(inverse(modelMatrix)))*normal);gl_Position=projectionMatrix*viewMatrix*world;}
`,fragmentShader:`
precision highp float;
uniform float uHeat,uEnergy,uLight,uTime,uNormalStrength,uAmbient,uCyber; uniform int uMode;
uniform vec3 uSunPos,uCameraPos; uniform sampler2D uNormalMap;
varying vec3 vLocal,vWorld,vN; varying vec2 vUV;
const float PI=3.14159265359;
float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float pattern(vec3 p){return .57*noise3(p*3.2)+.29*noise3(p*9.3)+.14*noise3(p*24.);}
// MASK 1: 태양에 가까워질수록 열 영향 영역이 넓어짐. 태양을 향한 쪽이 우선 가열된다.
float heatMask(vec3 p,vec3 sunDir){float facing=max(dot(normalize(p),sunDir),0.);float field=.63*pattern(p+vec3(2.1,0.,0.))+.37*facing;return smoothstep(.78-uHeat*.69,.91-uHeat*.49,field);}
// MASK 2: 내부 회로의 격자 + 노드. 과부하가 커질수록 켜지는 회로가 증가한다.
float energyMask(vec3 p){vec3 q=normalize(p)*12.;vec3 cell=abs(fract(q)-.5);float wires=1.-smoothstep(.035,.095,min(min(cell.x,cell.y),cell.z));float nodes=1.-smoothstep(.09,.2,length(cell.xy));float circuit=max(wires,nodes*.7);float gate=noise3(floor(q)+vec3(4.));return circuit*smoothstep(.95-uEnergy*.92,1.02-uEnergy*.70,gate);}
vec3 directPBR(vec3 N,vec3 V,vec3 L,vec3 base,float rough,float metal){
 vec3 H=normalize(V+L);float nl=max(dot(N,L),0.),nv=max(dot(N,V),0.);float nh=max(dot(N,H),0.),vh=max(dot(V,H),0.);
 float a=rough*rough,a2=a*a;float den=nh*nh*(a2-1.)+1.;float D=a2/max(PI*den*den,1e-6); // D: GGX
 float k=(rough+1.)*(rough+1.)/8.;float G=(nl/(nl*(1.-k)+k))*(nv/(nv*(1.-k)+k)); // G: Smith
 vec3 F0=mix(vec3(.04),base,metal);vec3 F=F0+(1.-F0)*pow(1.-vh,5.); // F: Schlick
 vec3 kd=(1.-F)*(1.-metal);return (kd*base/PI+D*G*F/max(4.*nl*nv,1e-4))*nl*uLight*3.5;
}
void main(){
 vec3 p=normalize(vLocal);vec3 L=normalize(uSunPos-vWorld);vec3 V=normalize(uCameraPos-vWorld);
 float h=heatMask(p,normalize(uSunPos-vWorld));float e=energyMask(p);
 if(uMode==2){gl_FragColor=vec4(vec3(h),1.);return;}
 if(uMode==3){gl_FragColor=vec4(vec3(e),1.);return;}
 // 장갑판 사이의 이음새 및 미세한 금속 결
 vec3 tiles=abs(fract(p*8.)-.5);float seam=1.-smoothstep(.025,.07,min(min(tiles.x,tiles.y),tiles.z));
 float n=pattern(p);vec3 base=mix(vec3(.045,.11,.17),vec3(.19,.29,.36),n);base*=1.-seam*.65*uCyber;
 float rough=mix(.25,.48,n);float metal=.86;
 if(uMode!=1){
  base=mix(base,vec3(.72,.105,.018),h*.9);rough=mix(rough,.85,h);metal=mix(metal,.28,h);
  base=mix(base,vec3(.015,.65,.95),e*.85);rough=mix(rough,.12,e);metal=mix(metal,.97,e);
 }
 // 실제 normal map RGB -> [-1,1], 화면 미분으로 월드공간 TBN 구성 (실습 1 TODO 4)
 vec3 N=normalize(vN);
 if(uNormalStrength>0.0){
   vec3 dp1=dFdx(vWorld),dp2=dFdy(vWorld);
   vec2 du1=dFdx(vUV),du2=dFdy(vUV);
   vec3 T=cross(dp2,N)*du1.x+cross(N,dp1)*du2.x;
   vec3 B=cross(dp2,N)*du1.y+cross(N,dp1)*du2.y;
   float inv=inversesqrt(max(max(dot(T,T),dot(B,B)),1e-8));
   vec3 mapN=texture2D(uNormalMap,vUV).xyz*2.0-1.0;
   mapN.xy*=uNormalStrength;
   N=normalize(mat3(T*inv,B*inv,N)*normalize(mapN));
 }
 vec3 col=directPBR(N,V,L,base,rough,metal);
 vec3 F0=mix(vec3(.04),base,metal);col+=uAmbient*(base*(1.-metal)*(1.-F0)+F0);
 // 단순화한 환경 반사: 방향별 푸른 공간광 (IBL 근사)
 vec3 R=reflect(-V,N);vec3 env=mix(vec3(.009,.018,.045),vec3(.07,.16,.28),smoothstep(-.6,.9,R.y));
 col+=env*F0*(1.-rough)*.85;
 // 회로 발광은 PBR 반사와 별개인 전자 장치의 자체 발광
 if(uMode!=1)col+=vec3(.0,.09,.2)*e*1.8;
 col=col/(col+vec3(1.));col=pow(col,vec3(1./2.2));gl_FragColor=vec4(col,1.);
}
`});
const planet=new THREE.Mesh(new THREE.SphereGeometry(1.65,128,96),planetMat);scene.add(planet);
// 얇은 타원형 공전 궤도 선 (참고 화면의 선 스타일)
const orbitPoints=[];for(let i=0;i<=256;i++){const a=i/256*Math.PI*2;orbitPoints.push(new THREE.Vector3(Math.cos(a)*5.2,0,Math.sin(a)*5.2));}
const orbit=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(orbitPoints),new THREE.LineBasicMaterial({color:0x658db7,transparent:true,opacity:.85}));scene.add(orbit);
const ui={distance:document.getElementById('distance'),overload:document.getElementById('overload'),light:document.getElementById('light'),normal:document.getElementById('normal'),ambient:document.getElementById('ambient')};
let orbiting=false,orbitAngle=2.6,spinning=true;
function sync(){const d=+ui.distance.value,o=+ui.overload.value,l=+ui.light.value;document.getElementById('distanceVal').textContent=d;document.getElementById('overloadVal').textContent=o;document.getElementById('lightVal').textContent=l+'%';document.getElementById('normalVal').textContent=ui.normal.value;document.getElementById('ambientVal').textContent=(+ui.ambient.value).toFixed(2);uniforms.uHeat.value=1-d/100;uniforms.uEnergy.value=o/100;uniforms.uLight.value=l/100;uniforms.uNormalStrength.value=+ui.normal.value;uniforms.uAmbient.value=+ui.ambient.value;const radius=3.5+d*.034;planet.position.set(Math.cos(orbitAngle)*radius,0,Math.sin(orbitAngle)*radius);orbit.scale.setScalar(radius/5.2);}
Object.values(ui).forEach(el=>el.addEventListener('input',sync));sync();
document.getElementById('cyber').onchange=e=>uniforms.uCyber.value=e.target.checked?1:0;
document.getElementById('surfaceView').onchange=e=>uniforms.uMode.value={final:0,base:1,heat:2,energy:3}[e.target.value];
document.getElementById('spin').onclick=e=>{spinning=!spinning;e.currentTarget.textContent=spinning?'자전 정지':'자전 시작';};
document.getElementById('orbitToggle').onclick=e=>{orbiting=!orbiting;e.currentTarget.textContent=orbiting?'공전 정지':'공전 시작';};
document.getElementById('reset').onclick=()=>{camera.position.set(0,6,15.5);controls.target.set(0,0,0);controls.update();};
document.getElementById('top').onclick=()=>{camera.position.set(0,17,0.01);controls.target.set(0,0,0);controls.update();};
const clock=new THREE.Clock();function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);uniforms.uTime.value+=dt;if(spinning)planet.rotation.y+=dt*.22;if(orbiting){orbitAngle+=dt*.22;sync();}sun.rotation.y+=dt*.12;uniforms.uCameraPos.value.copy(camera.position);controls.update();renderer.render(scene,camera);}animate();
addEventListener('resize',()=>{camera.aspect=(innerWidth-(innerWidth<=650?185:214))/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth-(innerWidth<=650?185:214),innerHeight);});
