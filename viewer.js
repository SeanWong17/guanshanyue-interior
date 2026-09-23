import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createIcons, icons } from 'lucide';
import { createWalkthrough } from './walkthrough.js';
import './viewer.css';

document.querySelector('aside h1').insertAdjacentHTML('afterend', `<div class="modes" role="group" aria-label="查看模式"><button data-mode="orbit" class="active" aria-pressed="true"><i data-lucide="box"></i>整体</button><button data-mode="walk" aria-pressed="false"><i data-lucide="footprints"></i>漫游</button></div>
<div id="walk-controls" hidden><label for="eye-height">视线高度 <output id="eye-value">1.60 m</output></label><input id="eye-height" type="range" min="1.2" max="1.9" step="0.05" value="1.6"><label for="walk-speed">移动速度 <output id="speed-value">1.2 m/s</output></label><input id="walk-speed" type="range" min="0.4" max="2" step="0.2" value="1.2"></div>`);
document.querySelector('#viewport').innerHTML = `<div class="walk-actions"><button id="walk-lock" title="锁定鼠标转头，Esc 释放" aria-label="锁定鼠标转头"><i data-lucide="mouse-pointer-2"></i></button><button id="walk-reset" title="回到客厅" aria-label="回到客厅"><i data-lucide="locate-fixed"></i></button><button id="walk-exit" title="退出漫游" aria-label="退出漫游"><i data-lucide="log-out"></i></button></div><div class="walk-pad" role="group" aria-label="漫游方向"><button data-move="forward" title="前进 W / ↑" aria-label="前进"><i data-lucide="arrow-up"></i></button><button data-move="left" title="向左 A / ←" aria-label="向左"><i data-lucide="arrow-left"></i></button><button data-move="back" title="后退 S / ↓" aria-label="后退"><i data-lucide="arrow-down"></i></button><button data-move="right" title="向右 D / →" aria-label="向右"><i data-lucide="arrow-right"></i></button></div>`;
createIcons({icons});
const windowLabel=document.querySelector('[data-group="06"]').parentElement;
windowLabel.lastChild.textContent='门窗';
const curtainToggle=document.createElement('label');curtainToggle.innerHTML='<input type="checkbox" data-group="11">窗帘';windowLabel.after(curtainToggle);
const publicToggle=document.createElement('label');publicToggle.innerHTML='<input type="checkbox" data-group="10" checked>电梯厅与楼梯（示意）';document.querySelector('#plan-cut').parentElement.after(publicToggle);
const host=document.querySelector('#viewport');
const scene=new THREE.Scene();scene.background=new THREE.Color('#e9edef');
const camera=new THREE.PerspectiveCamera(45,1,.025,200);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
host.appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxDistance=40;controls.minDistance=.1;
scene.add(new THREE.HemisphereLight(0xffffff,0xb0aaa0,1.6));
for(const [x,y,z] of [[8,18,4],[-6,10,-10]]){const l=new THREE.DirectionalLight(0xffffff,1.7);l.position.set(x,y,z);scene.add(l);}
let model=null,stamp='',loading=false,boxHelper=null;
const status=document.querySelector('#status');
const visibleGroups=()=>new Map([...document.querySelectorAll('[data-group]')].map(e=>[e.dataset.group,e.checked]));
function applyVisibility(){const groups=visibleGroups();const cut=document.querySelector('#plan-cut').checked;model?.traverse(o=>{if(o.userData.preview_group)o.visible=groups.get(o.userData.preview_group)??false;if(o.userData.preview_hidden)o.visible=false;if(cut&&(/lintel|header_trim|architrave|lever/.test(o.name)||/^(Master_door|Flex_door|Bedroom2_door|Entry_door|Bath_north_door|Bath_west_door)$/.test(o.name)))o.visible=false;});}
function clearSelection(){document.querySelector('#selection').textContent='未选择';document.querySelector('#dimensions').textContent='';if(boxHelper){scene.remove(boxHelper);boxHelper.geometry.dispose();boxHelper.material.dispose();boxHelper=null;}}
async function load(){
 if(loading)return;loading=true;status.textContent='正在载入模型';
 try{
  const next=await new GLTFLoader().loadAsync(`./output/apartment_v1.glb?t=${Date.now()}`);
  clearSelection();if(model){scene.remove(model);model.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of(Array.isArray(o.material)?o.material:[o.material]))m.dispose();}});}
  model=next.scene;scene.add(model);applyVisibility();let count=0;model.traverse(o=>{if(o.isMesh)count++;});
  walk.rebuild();if(walk.enabled)walk.place('living');
  document.querySelector('#counts').textContent=`${count} 个网格 · 单位 mm`;
  document.querySelector('#updated').textContent=`已载入 ${new Date().toLocaleTimeString('zh-CN')}`;status.textContent='模型已同步';
 }catch(e){status.textContent=model?'更新失败，保留当前模型':'模型尚未就绪，等待生成';console.error(e);}finally{loading=false;}
}
const views={axo:[[17,19,16],[5.3,0,-5.7]],top:[[5.3,21,-5.7],[5.3,0,-5.7]],living:[[3.94,1.5,-4.55],[7.38,1.27,-2.8]],dining:[[6.72,1.5,-4.95],[5.25,1.28,-7.78]],master:[[3.05,1.55,-2.73],[1.1,1.05,-1.4]]};
Object.assign(views,{entry:[[8.42,1.62,-6.32],[8.30,1.22,-5.32]],north:[[2.99,1.58,-7.15],[1.32,1.25,-8.28]],south:[[9.87,1.58,-4.25],[8.53,1.1,-2.6]],bath:[[7.40,1.66,-9.22],[6.63,1.05,-11.22]]});
views.entry=[[7.05,1.55,-6.15],[8.30,1.2,-5.4]];
const walk=createWalkthrough({camera,renderer,controls,host,getModel:()=>model,clearSelection,applyVisibility,views});
document.querySelector('#walk-exit').onclick=()=>walk.setEnabled(false);
function view(name){if(walk.enabled&& !['axo','top'].includes(name)){walk.place(name);}else{if(walk.enabled)walk.setEnabled(false);const [p,t]=views[name];camera.position.set(...p);controls.target.set(...t);if(name==='axo'&&host.clientWidth>650)camera.position.sub(controls.target).multiplyScalar(.77).add(controls.target);controls.update();}document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));
document.querySelectorAll('[data-group]').forEach(b=>b.onchange=()=>{applyVisibility();clearSelection();walk.rebuild();});
document.querySelector('#refresh').onclick=load;
document.querySelector('#room-view').onchange=e=>view(e.target.value);
document.querySelector('#plan-cut').onchange=()=>{applyVisibility();walk.rebuild();};
const ray=new THREE.Raycaster();let down=null;
renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
renderer.domElement.addEventListener('pointerup',e=>{
 if(walk.enabled||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5||!model)return;
 const rect=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
 const hit=ray.intersectObject(model,true).find(h=>{let o=h.object;while(o){if(!o.visible)return false;o=o.parent;}return true;});clearSelection();if(!hit)return;
 const o=hit.object;document.querySelector('#selection').textContent=o.name;
 const size=new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());document.querySelector('#dimensions').textContent=`包围盒 ${Math.round(size.x*1000)} × ${Math.round(size.z*1000)} × ${Math.round(size.y*1000)} mm`;
 boxHelper=new THREE.BoxHelper(o,0x007d78);scene.add(boxHelper);
});
new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);}).observe(host);
let previousTime=0;
renderer.setAnimationLoop(time=>{const dt=previousTime?(time-previousTime)/1000:0;previousTime=time;if(walk.enabled)walk.update(dt);else controls.update();renderer.render(scene,camera);});
view('axo');load();
setInterval(async()=>{try{const r=await fetch('./output/apartment_v1.glb',{method:'HEAD',cache:'no-store'});if(!r.ok)return;const next=r.headers.get('last-modified')+'|'+r.headers.get('content-length');if(stamp&&stamp!==next)await load();stamp=next;}catch{}},5000);
window.__preview={scene,camera,controls,renderer,walk,get model(){return model;},view};
