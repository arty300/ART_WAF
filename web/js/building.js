import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

// ─── Constants ───────────────────────────────────────────────────────────────
const FLOORS       = 6;
const EDGES        = 6;
const FLOOR_H      = 0.38;
const FLOOR_GAP    = 0.04;
const R_OUTER      = 1.0;
const CHAMFER      = 0.18;   // fraction of side length to cut at each corner
const R_INNER      = 0.47;   // inner courtyard radius
const INNER_SEGS   = 24;

const COLOR_DEFAULT  = 0x2a2d3e;
const COLOR_HOVER    = 0x3d4060;
const COLOR_OK       = 0x22c55e;   // 2xx
const COLOR_REDIRECT = 0xeab308;   // 3xx
const COLOR_ERROR    = 0xef4444;   // 4xx/5xx
const COLOR_UNKNOWN  = 0x8b5cf6;   // no mapping

// ─── Geometry helpers ─────────────────────────────────────────────────────────

/**
 * Build 12-point outer hexagon with chamfered corners (flat-top orientation).
 * Returns array of {x, y} in CCW order.
 */
function buildChamferedHex(R, chamfer) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    // flat-top: vertex i at angle = i*60°
    const a0 = (i * Math.PI) / 3;
    const a1 = ((i + 1) % 6 * Math.PI) / 3;
    const aPrev = ((i + 5) % 6 * Math.PI) / 3;

    const vx = Math.cos(a0) * R;
    const vy = Math.sin(a0) * R;
    const nx = Math.cos(a1) * R;
    const ny = Math.sin(a1) * R;
    const px = Math.cos(aPrev) * R;
    const py = Math.sin(aPrev) * R;

    // point towards previous vertex (going into the corner from prev side)
    pts.push({ x: vx + (px - vx) * chamfer, y: vy + (py - vy) * chamfer });
    // point towards next vertex (leaving the corner towards next side)
    pts.push({ x: vx + (nx - vx) * chamfer, y: vy + (ny - vy) * chamfer });
  }
  return pts;
}

/**
 * Build inner courtyard polygon points (20-gon approximating circle).
 */
function buildCourtyard(r, segs) {
  const pts = [];
  for (let i = 0; i < segs; i++) {
    const a = (i * 2 * Math.PI) / segs;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}

/**
 * Build a THREE.Shape for wall panel (edge index 0-5).
 * Outer boundary: chamferedHex[edge*2+1] → chamferedHex[(edge*2+2)%12]
 * Inner boundary: arc of courtyard polygon opposing this edge.
 */
function buildWallShape(edge, chamferedHex, courtyard) {
  const i0 = edge * 2 + 1;
  const i1 = (edge * 2 + 2) % 12;
  const oL = chamferedHex[i0];
  const oR = chamferedHex[i1];

  // Inner arc: courtyard points that fall within ±90° of the outward normal
  // Edge midpoint direction gives the normal
  const mx = (oL.x + oR.x) / 2;
  const my = (oL.y + oR.y) / 2;
  const normalAngle = Math.atan2(my, mx);

  // Collect courtyard indices closest to this edge (within 60° cone)
  const segAngles = courtyard.map((p, idx) => ({ idx, a: Math.atan2(p.y, p.x) }));
  const inCone = segAngles.filter(({ a }) => {
    let diff = a - normalAngle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return Math.abs(diff) <= Math.PI / 3;
  });

  inCone.sort((a, b) => {
    let da = a.a - normalAngle;
    let db = b.a - normalAngle;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    while (db > Math.PI) db -= 2 * Math.PI;
    while (db < -Math.PI) db += 2 * Math.PI;
    return da - db;
  });

  const shape = new THREE.Shape();
  shape.moveTo(oL.x, oL.y);
  shape.lineTo(oR.x, oR.y);

  // trace inner arc from oR-side to oL-side
  const arcPts = inCone.map(({ idx }) => courtyard[idx]);
  for (let i = arcPts.length - 1; i >= 0; i--) {
    shape.lineTo(arcPts[i].x, arcPts[i].y);
  }
  shape.closePath();

  return shape;
}

/**
 * Build corner turret shape (small diamond at chamfer cut).
 */
function buildTurretShape(edge, chamferedHex) {
  const i0 = edge * 2;           // end of prev edge chamfer
  const i1 = (edge * 2 + 1) % 12; // start of this edge chamfer
  const p0 = chamferedHex[i0];
  const p1 = chamferedHex[i1];
  const midX = (p0.x + p1.x) / 2;
  const midY = (p0.y + p1.y) / 2;
  const dirX = p1.x - p0.x;
  const dirY = p1.y - p0.y;
  const len = Math.hypot(dirX, dirY);
  const nx = (dirY / len) * 0.06;
  const ny = -(dirX / len) * 0.06;

  const shape = new THREE.Shape();
  shape.moveTo(p0.x, p0.y);
  shape.lineTo(midX + nx, midY + ny);
  shape.lineTo(p1.x, p1.y);
  shape.lineTo(midX - nx * 0.5, midY - ny * 0.5);
  shape.closePath();
  return shape;
}

// ─── Building class ──────────────────────────────────────────────────────────

export class Building {
  constructor(canvas, onPanelClick) {
    this.canvas = canvas;
    this.onPanelClick = onPanelClick;
    this.panels = {};   // key: `${floor}_${edge}` → THREE.Mesh
    this.hoveredPanel = null;

    this._initScene();
    this._buildGeometry();
    this._initEvents();
    this._animate();
  }

  _initScene() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0f1a);
    this.scene.fog = new THREE.Fog(0x0d0f1a, 8, 20);

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    this.camera.position.set(0, 4.5, 5.5);
    this.camera.lookAt(0, (FLOORS * (FLOOR_H + FLOOR_GAP)) / 2, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 14;
    this.controls.maxPolarAngle = Math.PI / 2.1;

    // Lights
    const ambient = new THREE.AmbientLight(0x8090b0, 0.6);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(3, 8, 4);
    sun.castShadow = true;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x4466aa, 0.4);
    fill.position.set(-4, 2, -3);
    this.scene.add(fill);

    // Ground
    const groundGeo = new THREE.CircleGeometry(3.5, 36);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x111420, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Courtyard floor
    const cyardGeo = new THREE.CircleGeometry(R_INNER * 0.95, INNER_SEGS);
    const cyardMat = new THREE.MeshStandardMaterial({ color: 0x14221a, roughness: 0.8 });
    this.cyardFloor = [];
    for (let f = 0; f < FLOORS; f++) {
      const mesh = new THREE.Mesh(cyardGeo, cyardMat.clone());
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = f * (FLOOR_H + FLOOR_GAP) + FLOOR_H + 0.001;
      this.scene.add(mesh);
      this.cyardFloor.push(mesh);
    }

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
  }

  _buildGeometry() {
    const chamferedHex = buildChamferedHex(R_OUTER, CHAMFER);
    const courtyard = buildCourtyard(R_INNER, INNER_SEGS);

    const extrudeOpts = { depth: FLOOR_H, bevelEnabled: false };
    const turretOpts  = { depth: FLOOR_H + 0.06, bevelEnabled: false };

    for (let f = 0; f < FLOORS; f++) {
      const yBase = f * (FLOOR_H + FLOOR_GAP);

      for (let e = 0; e < EDGES; e++) {
        // Wall panel
        const shape = buildWallShape(e, chamferedHex, courtyard);
        const geo   = new THREE.ExtrudeGeometry(shape, extrudeOpts);
        geo.rotateX(Math.PI / 2);

        const mat = new THREE.MeshStandardMaterial({
          color:            COLOR_DEFAULT,
          emissive:         0x000000,
          emissiveIntensity: 0,
          roughness:        0.6,
          metalness:        0.25,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = yBase;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { floor: f + 1, edge: e };

        this.scene.add(mesh);
        this.panels[`${f + 1}_${e}`] = mesh;
      }

      // Corner turrets (decorative)
      for (let e = 0; e < EDGES; e++) {
        const tShape = buildTurretShape(e, chamferedHex);
        const tGeo   = new THREE.ExtrudeGeometry(tShape, turretOpts);
        tGeo.rotateX(Math.PI / 2);
        const tMat = new THREE.MeshStandardMaterial({
          color:     0x373a50,
          roughness: 0.5,
          metalness: 0.3,
        });
        const tMesh = new THREE.Mesh(tGeo, tMat);
        tMesh.position.y = yBase;
        tMesh.castShadow = true;
        this.scene.add(tMesh);
      }

      // Floor slab (thin strip between floors)
      if (f < FLOORS - 1) {
        const slabShape = new THREE.Shape();
        const outerPts = chamferedHex;
        slabShape.moveTo(outerPts[0].x, outerPts[0].y);
        for (let i = 1; i < outerPts.length; i++) slabShape.lineTo(outerPts[i].x, outerPts[i].y);
        slabShape.closePath();
        const hole = new THREE.Path();
        for (let i = 0; i < INNER_SEGS; i++) {
          const a = (i * 2 * Math.PI) / INNER_SEGS;
          if (i === 0) hole.moveTo(Math.cos(a) * R_INNER, Math.sin(a) * R_INNER);
          else hole.lineTo(Math.cos(a) * R_INNER, Math.sin(a) * R_INNER);
        }
        hole.closePath();
        slabShape.holes.push(hole);
        const slabGeo = new THREE.ExtrudeGeometry(slabShape, { depth: FLOOR_GAP, bevelEnabled: false });
        slabGeo.rotateX(Math.PI / 2);
        const slabMat = new THREE.MeshStandardMaterial({ color: 0x1e2030, roughness: 0.7 });
        const slab = new THREE.Mesh(slabGeo, slabMat);
        slab.position.y = yBase + FLOOR_H;
        this.scene.add(slab);
      }
    }

    // Roof cap
    const roofShape = new THREE.Shape();
    roofShape.moveTo(chamferedHex[0].x, chamferedHex[0].y);
    for (let i = 1; i < chamferedHex.length; i++) roofShape.lineTo(chamferedHex[i].x, chamferedHex[i].y);
    roofShape.closePath();
    const roofHole = new THREE.Path();
    for (let i = 0; i < INNER_SEGS; i++) {
      const a = (i * 2 * Math.PI) / INNER_SEGS;
      if (i === 0) roofHole.moveTo(Math.cos(a) * R_INNER, Math.sin(a) * R_INNER);
      else roofHole.lineTo(Math.cos(a) * R_INNER, Math.sin(a) * R_INNER);
    }
    roofHole.closePath();
    roofShape.holes.push(roofHole);
    const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 0.04, bevelEnabled: false });
    roofGeo.rotateX(Math.PI / 2);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x252838, roughness: 0.5 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = FLOORS * (FLOOR_H + FLOOR_GAP);
    this.scene.add(roof);
  }

  _initEvents() {
    const onMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onClick = () => {
      if (this.hoveredPanel) {
        const { floor, edge } = this.hoveredPanel.userData;
        this.onPanelClick(floor, edge);
      }
    };

    this.canvas.addEventListener('mousemove', onMove);
    this.canvas.addEventListener('touchmove', onMove, { passive: true });
    this.canvas.addEventListener('click', onClick);

    window.addEventListener('resize', () => {
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }

  _animate() {
    const loop = () => {
      requestAnimationFrame(loop);
      this.controls.update();
      this._updateHover();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  _updateHover() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const meshes = Object.values(this.panels);
    const hits = this.raycaster.intersectObjects(meshes);

    const prev = this.hoveredPanel;
    if (hits.length > 0) {
      const hit = hits[0].object;
      if (hit !== prev) {
        if (prev && prev.userData._baseEmissiveColor !== undefined) {
          prev.material.emissive.setHex(prev.userData._baseEmissiveColor);
          prev.material.emissiveIntensity = prev.userData._baseEmissiveIntensity || 0;
        }
        this.hoveredPanel = hit;
        hit.userData._baseEmissiveColor = hit.material.emissive.getHex();
        hit.userData._baseEmissiveIntensity = hit.material.emissiveIntensity;
        hit.material.emissive.setHex(COLOR_HOVER);
        hit.material.emissiveIntensity = 0.5;
        this.canvas.style.cursor = 'pointer';
      }
    } else {
      if (prev) {
        prev.material.emissive.setHex(prev.userData._baseEmissiveColor ?? 0x000000);
        prev.material.emissiveIntensity = prev.userData._baseEmissiveIntensity || 0;
        this.hoveredPanel = null;
        this.canvas.style.cursor = 'default';
      }
    }
  }

  /**
   * Flash a panel with a status colour.
   * floor: 1-based, edge: 0-based
   */
  flash(floor, edge, status) {
    const key = `${floor}_${edge}`;
    const mesh = this.panels[key];
    if (!mesh) return;

    let color = COLOR_UNKNOWN;
    if (status >= 200 && status < 300) color = COLOR_OK;
    else if (status >= 300 && status < 400) color = COLOR_REDIRECT;
    else if (status >= 400) color = COLOR_ERROR;

    const mat = mesh.material;
    const origColor = mat.color.getHex();

    mat.emissive.setHex(color);
    mat.emissiveIntensity = 1.0;
    mat.color.setHex(color);

    // Fade back
    let t = 0;
    const dur = 1500;
    const start = performance.now();
    const fade = (now) => {
      t = (now - start) / dur;
      if (t >= 1) {
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
        mat.color.setHex(origColor);
        return;
      }
      const ease = 1 - t;
      mat.emissiveIntensity = ease;
      requestAnimationFrame(fade);
    };
    requestAnimationFrame(fade);
  }

  /** Returns panel mesh for given floor (1-based) and edge (0-based) */
  getPanel(floor, edge) {
    return this.panels[`${floor}_${edge}`] ?? null;
  }
}
