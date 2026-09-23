import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';

export function createWalkthrough({camera, renderer, controls, host, getModel, clearSelection, applyVisibility, views}) {
  const canvas = renderer.domElement;
  const pointer = new PointerLockControls(camera, canvas);
  pointer.minPolarAngle = .12;
  pointer.maxPolarAngle = Math.PI - .12;
  const keys = new Set(), held = new Map();
  const direction = new THREE.Vector3(), right = new THREE.Vector3();
  const floorRay = new THREE.Raycaster();
  const map = document.createElement('canvas');
  map.id = 'walk-map'; map.width = 360; map.height = 420;
  map.setAttribute('aria-label', '漫游小地图：当前位置与朝向');
  host.appendChild(map);
  const mapContext = map.getContext('2d');
  const mapBase = document.createElement('canvas'); mapBase.width = 360; mapBase.height = 420;
  const mapScale = 29, mapX = 29, mapY = 32;
  let enabled = false, saved = null, tree = new Octree(), floors = [], drag = null;
  const panel = document.querySelector('#walk-controls');
  const lock = document.querySelector('#walk-lock');
  const height = document.querySelector('#eye-height');
  const speed = document.querySelector('#walk-speed');
  const eyeHeight = () => Number(height.value);
  const capsule = p => new Capsule(new THREE.Vector3(p.x, .24, p.z), new THREE.Vector3(p.x, eyeHeight() - .18, p.z), .18);

  function rebuild() {
    const root = new THREE.Group();
    floors = [];
    getModel()?.updateMatrixWorld(true);
    getModel()?.traverse(o => {
      if (!o.isMesh) return;
      if (/Continuous.finished.floor/.test(o.name)) floors.push(o);
      let visible = true;
      for (let parent = o; parent; parent = parent.parent) visible &&= parent.visible;
      if (!visible) return;
      const bounds = new THREE.Box3().setFromObject(o);
      if (bounds.max.y < .15 || bounds.min.y > 1.9 || /Continuous.finished.floor/.test(o.name)) return;
      const size = bounds.getSize(new THREE.Vector3());
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z));
      mesh.position.copy(bounds.getCenter(new THREE.Vector3()));
      root.add(mesh);
    });
    tree = new Octree().fromGraphNode(root);
    const ctx = mapBase.getContext('2d');
    ctx.fillStyle = '#f1f5f4'; ctx.fillRect(0, 0, 360, 420);
    ctx.fillStyle = '#fff';
    for (const floor of floors) {
      const positions = floor.geometry.attributes.position, indices = floor.geometry.index;
      for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
        ctx.beginPath();
        for (let j = 0; j < 3; j++) {
          const p = new THREE.Vector3().fromBufferAttribute(positions, indices ? indices.getX(i+j) : i+j).applyMatrix4(floor.matrixWorld);
          ctx[j ? 'lineTo' : 'moveTo'](mapX+p.x*mapScale, mapY+(12.051+p.z)*mapScale);
        }
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.fillStyle = '#81938d';
    root.children.forEach(mesh => {
      const b = new THREE.Box3().setFromObject(mesh);
      if(b.min.x<0||b.max.x>10.5||b.min.z < -12.1||b.max.z>0.1)return;
      ctx.globalAlpha = b.max.y > 2 ? .9 : .35;
      ctx.fillRect(mapX+b.min.x*mapScale,mapY+(12.051+b.min.z)*mapScale,(b.max.x-b.min.x)*mapScale,(b.max.z-b.min.z)*mapScale);
    });
    ctx.globalAlpha = 1;
    root.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  }

  function drawMap() {
    mapContext.drawImage(mapBase, 0, 0);
    const x=mapX+camera.position.x*mapScale, y=mapY+(12.051+camera.position.z)*mapScale;
    camera.getWorldDirection(direction);
    const angle=Math.atan2(direction.z,direction.x);
    mapContext.save();mapContext.translate(x,y);mapContext.rotate(angle);
    mapContext.fillStyle='#15796b';mapContext.beginPath();mapContext.moveTo(23,0);mapContext.lineTo(4,-9);mapContext.lineTo(4,9);mapContext.closePath();mapContext.fill();
    mapContext.fillStyle='#e45748';mapContext.strokeStyle='#fff';mapContext.lineWidth=3;mapContext.beginPath();mapContext.arc(0,0,7,0,Math.PI*2);mapContext.fill();mapContext.stroke();mapContext.restore();
  }

  function supported(p) {
    floorRay.set(new THREE.Vector3(p.x, .4, p.z), new THREE.Vector3(0, -1, 0));
    floorRay.far = .8;
    return floorRay.intersectObjects(floors, false).length > 0;
  }

  function free(p) {
    return supported(p) && !tree.capsuleIntersect(capsule(p));
  }

  function place(name) {
    const [position, target] = views[name] || views.living;
    const start = new THREE.Vector3(position[0], eyeHeight(), position[2]);
    const spawnFree = p => free(p) && !tree.capsuleIntersect(new Capsule(new THREE.Vector3(p.x, .36, p.z), new THREE.Vector3(p.x, eyeHeight() - .3, p.z), .3));
    let candidate = spawnFree(start) ? start : null;
    // Preset review cameras may be too close to furniture for a standing body.
    for (let radius = .2; !candidate && radius <= 2; radius += .2) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        const p = start.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
        if (spawnFree(p)) { candidate = p; break; }
      }
    }
    if (!candidate) return false;
    camera.position.copy(candidate);
    camera.lookAt(target[0], eyeHeight(), target[2]);
    return true;
  }

  function resetInput() { keys.clear(); held.clear(); drag = null; }

  function setEnabled(next) {
    if (next === enabled || (next && !getModel())) return;
    resetInput();
    if (next) {
      clearSelection();
      controls.enabled = false;
      saved = {position: camera.position.clone(), target: controls.target.clone(), fov: camera.fov,
        ceiling: document.querySelector('[data-group="02"]').checked, cut: document.querySelector('#plan-cut').checked};
      document.querySelector('[data-group="02"]').checked = true;
      document.querySelector('#plan-cut').checked = false;
      applyVisibility();
      rebuild();
      camera.fov = 65;
      place('living');
    } else {
      if (pointer.isLocked) pointer.unlock();
      document.querySelector('[data-group="02"]').checked = saved.ceiling;
      document.querySelector('#plan-cut').checked = saved.cut;
      applyVisibility();
      camera.position.copy(saved.position);
      controls.target.copy(saved.target);
      camera.fov = saved.fov;
      controls.enabled = true;
      // Flush any orbit damping left from the previous mode before restoring.
      controls.enableDamping = false;
      controls.update();
      camera.position.copy(saved.position);
      controls.target.copy(saved.target);
      controls.update();
      controls.enableDamping = true;
    }
    enabled = next;
    camera.updateProjectionMatrix();
    host.classList.toggle('walking', enabled);
    panel.hidden = !enabled;
    document.querySelectorAll('[data-mode]').forEach(b => {
      const active = (b.dataset.mode === 'walk') === enabled;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  }

  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setEnabled(b.dataset.mode === 'walk'));
  lock.onclick = async () => {
    if (pointer.isLocked) { pointer.unlock(); return; }
    try { await canvas.requestPointerLock(); } catch { lock.title = '当前浏览器不支持锁定鼠标，可拖动转头'; }
  };
  pointer.addEventListener('lock', () => { resetInput(); lock.classList.add('active'); });
  pointer.addEventListener('unlock', () => { resetInput(); lock.classList.remove('active'); });
  document.addEventListener('pointerlockerror', () => { lock.title = '鼠标锁定不可用，可拖动转头'; });
  document.querySelector('#walk-reset').onclick = () => { resetInput(); place('living'); };
  height.oninput = () => { camera.position.y = eyeHeight(); document.querySelector('#eye-value').textContent = `${eyeHeight().toFixed(2)} m`; };
  speed.oninput = () => { document.querySelector('#speed-value').textContent = `${Number(speed.value).toFixed(1)} m/s`; };
  const movementKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', e => {
    if (!enabled || /INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)) return;
    if (movementKeys.includes(e.code)) { e.preventDefault(); keys.add(e.code); }
    if (e.code === 'Escape') { resetInput(); if (pointer.isLocked) pointer.unlock(); }
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', resetInput);
  document.addEventListener('visibilitychange', resetInput);
  canvas.addEventListener('pointerdown', e => {
    if (!enabled || pointer.isLocked || e.button !== 0) return;
    canvas.focus();
    drag = {id: e.pointerId, x: e.clientX, y: e.clientY};
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!enabled || pointer.isLocked || drag?.id !== e.pointerId) return;
    const rotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    rotation.y -= (e.clientX - drag.x) * .004;
    rotation.x = THREE.MathUtils.clamp(rotation.x - (e.clientY - drag.y) * .004, -Math.PI / 2 + .12, Math.PI / 2 - .12);
    camera.quaternion.setFromEuler(rotation);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => { drag = null; });
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', '三维模型');
  document.querySelectorAll('[data-move]').forEach(b => {
    b.onpointerdown = e => {
      if (!enabled) return;
      e.preventDefault(); held.set(e.pointerId, b.dataset.move); b.setPointerCapture(e.pointerId);
    };
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(event, e => held.delete(e.pointerId));
  });

  function update(dt) {
    if (!enabled) return;
    drawMap();
    const pressed = (code, arrow, action) => keys.has(code) || keys.has(arrow) || [...held.values()].includes(action);
    const forward = Number(pressed('KeyW', 'ArrowUp', 'forward')) - Number(pressed('KeyS', 'ArrowDown', 'back'));
    const sideways = Number(pressed('KeyD', 'ArrowRight', 'right')) - Number(pressed('KeyA', 'ArrowLeft', 'left'));
    if (!forward && !sideways) return;
    camera.getWorldDirection(direction); direction.y = 0; direction.normalize();
    right.crossVectors(direction, camera.up).normalize();
    const delta = direction.multiplyScalar(forward).addScaledVector(right, sideways).normalize().multiplyScalar(Number(speed.value) * Math.min(dt, .05));
    const steps = Math.max(1, Math.ceil(delta.length() / .04));
    delta.divideScalar(steps);
    for (let i = 0; i < steps; i++) {
      // Separate axes allow sliding along walls while preserving body clearance.
      for (const axis of ['x', 'z']) {
        const candidate = camera.position.clone(); candidate[axis] += delta[axis];
        if (free(candidate)) camera.position.copy(candidate);
      }
    }
  }
  return {get enabled() { return enabled; }, setEnabled, place, rebuild, update};
}
