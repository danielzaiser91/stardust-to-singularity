import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { GameState } from '../core/state';
import type { Mults } from '../core/formulas';
import { activeTier, sniffSoftwareGL, type QualityTier } from './quality';
import { on } from '../events';

export interface LayerScene {
  group: THREE.Group;
  /** Kamera-Wunschdistanz dieser Ebene */
  camDist: number;
  update(s: GameState, m: Mults, dt: number, time: number): void;
  rebuild?(tier: QualityTier): void;
}

/** Zentrale Render-Engine: Composer, Kamera, Szenenwechsel, Klick-Raycasts, Effekt-Partikel. */
export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  tier: QualityTier;
  private layers = new Map<number, LayerScene>();
  private activeLayer = -1;
  private targetDist = 60;
  private time = 0;
  private fovPulse = 0;
  private burstPool: THREE.Points;
  private burstData: Float32Array;
  private burstLife: Float32Array;
  private starfield: THREE.Points;
  onCanvasClick: ((hitComet: boolean) => void) | null = null;
  private raycaster = new THREE.Raycaster();
  cometMesh: THREE.Object3D | null = null;

  private forceLow = false;
  private frameEMA = 0.016;

  constructor(canvas: HTMLCanvasElement, s: GameState) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.forceLow = sniffSoftwareGL(this.renderer.getContext());
    this.tier = activeTier(s, this.forceLow);
    this.renderer.setClearColor(0x050510);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
    this.camera.position.set(0, 22, 60);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 300;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.65, 0.5, 0.6);
    this.bloom.enabled = this.tier.bloom;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // — Sternenhimmel-Hintergrund (alle Ebenen) —
    this.starfield = makeStarfield();
    this.scene.add(this.starfield);

    // — Klick-Burst-Partikel-Pool —
    const N = 256;
    this.burstData = new Float32Array(N * 3);
    this.burstLife = new Float32Array(N).fill(-1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.burstData, 3));
    this.burstPool = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0x9fe8ff, size: 0.9, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.burstPool.frustumCulled = false;
    this.scene.add(this.burstPool);

    this.resize();
    window.addEventListener('resize', () => this.resize());

    canvas.addEventListener('pointerdown', e => this.pointerDown(e));
    on('buy', () => { this.fovPulse = 1; });
  }

  addLayer(id: number, layer: LayerScene): void {
    this.layers.set(id, layer);
    layer.group.visible = false;
    this.scene.add(layer.group);
  }

  setLayer(id: number): void {
    if (this.activeLayer === id) return;
    const prev = this.layers.get(this.activeLayer);
    if (prev) prev.group.visible = false;
    const next = this.layers.get(id);
    if (next) {
      next.group.visible = true;
      this.targetDist = next.camDist;
    }
    this.activeLayer = id;
  }

  applyQuality(s: GameState): void {
    const t = activeTier(s, this.forceLow);
    if (t.name === this.tier.name) return;
    this.tier = t;
    this.bloom.enabled = t.bloom;
    this.resize();
    this.layers.forEach(l => l.rebuild?.(t));
  }

  /** Partikel-Burst an Weltposition (Klick-Feedback, Käufe) */
  burst(pos: THREE.Vector3, count = 24): void {
    let placed = 0;
    for (let i = 0; i < this.burstLife.length && placed < count; i++) {
      if (this.burstLife[i] > 0) continue;
      this.burstLife[i] = 0.8 + Math.random() * 0.4;
      this.burstData[i * 3] = pos.x + (Math.random() - 0.5) * 2;
      this.burstData[i * 3 + 1] = pos.y + (Math.random() - 0.5) * 2;
      this.burstData[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 2;
      placed++;
    }
  }

  update(s: GameState, m: Mults, dt: number): void {
    this.time += dt;
    // Auto-Degrade: dauerhaft zähe Frames → auf Low fallen (nur im Auto-Modus)
    this.frameEMA = this.frameEMA * 0.95 + Math.min(dt, 1) * 0.05;
    if (!this.forceLow && this.frameEMA > 0.09 && s.settings.quality === 0) {
      this.forceLow = true;
      this.applyQuality(s);
    }
    this.setLayer(s.ui.scene);
    const layer = this.layers.get(this.activeLayer);
    layer?.update(s, m, dt, this.time);

    // Kamera sanft zur Ziel-Distanz ziehen (Ebenen-Übergang)
    const dist = this.camera.position.length();
    if (Math.abs(dist - this.targetDist) > 0.5) {
      const k = 1 - Math.exp(-dt * 1.6);
      this.camera.position.multiplyScalar(1 + ((this.targetDist - dist) / dist) * k);
    }
    // FOV-Puls bei Käufen
    if (this.fovPulse > 0) {
      this.fovPulse = Math.max(0, this.fovPulse - dt * 4);
      this.camera.fov = 60 + Math.sin(this.fovPulse * Math.PI) * 1.5;
      this.camera.updateProjectionMatrix();
    }
    // Burst-Partikel
    let anyAlive = false;
    for (let i = 0; i < this.burstLife.length; i++) {
      if (this.burstLife[i] <= 0) continue;
      anyAlive = true;
      this.burstLife[i] -= dt;
      this.burstData[i * 3 + 1] += dt * 6;
      if (this.burstLife[i] <= 0) { this.burstData[i * 3] = 1e9; }
    }
    if (anyAlive) this.burstPool.geometry.attributes.position.needsUpdate = true;

    this.starfield.rotation.y += dt * 0.004;
    this.controls.update();
    this.composer.render();
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    // DPR zusätzlich über Pixelbudget gedeckelt (~2,3 MP) — Bloom skaliert quadratisch
    const areaCap = Math.sqrt(2_300_000 / Math.max(1, w * h));
    const dpr = Math.max(0.75, Math.min(window.devicePixelRatio, this.tier.dpr, areaCap));
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h);
    this.composer.setSize(w * dpr, h * dpr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private pointerDown(e: PointerEvent): void {
    const ndc = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    let hitComet = false;
    if (this.cometMesh && this.cometMesh.visible) {
      const hits = this.raycaster.intersectObject(this.cometMesh, true);
      // großzügige Touch-Toleranz: auch „nah dran" zählt
      if (hits.length > 0) hitComet = true;
      else {
        const p = new THREE.Vector3();
        this.cometMesh.getWorldPosition(p);
        const sp = p.clone().project(this.camera);
        if (Math.hypot(sp.x - ndc.x, sp.y - ndc.y) < 0.09) hitComet = true;
      }
    }
    this.onCanvasClick?.(hitComet);
    // Burst an Klickstelle (auf Kugel um Ursprung projiziert)
    const dir = this.raycaster.ray.direction.clone();
    this.burst(this.camera.position.clone().add(dir.multiplyScalar(40)), 12);
  }
}

function makeStarfield(): THREE.Points {
  const N = 2200;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(1200 + Math.random() * 1600);
    pos.set([v.x, v.y, v.z], i * 3);
    c.setHSL(0.55 + Math.random() * 0.25, 0.6, 0.65 + Math.random() * 0.3);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({
    size: 2.2, vertexColors: true, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false,
  }));
}
