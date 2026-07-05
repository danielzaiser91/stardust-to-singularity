import * as THREE from 'three';
import type { GameState } from '../../core/state';
import type { Mults } from '../../core/formulas';
import type { LayerScene } from '../engine';
import type { QualityTier } from '../quality';
import { on } from '../../events';

/**
 * Ebene 0 — Staubwolke: wirbelnde GPU-Partikel (Noise-Flow im Vertex-Shader),
 * Akkretionsscheibe, orbitierende Körper je Generator-Stufe, klickbarer Komet,
 * glühender Protostern-Kern, der mit dem Fortschritt wächst.
 */
export class DustScene implements LayerScene {
  group = new THREE.Group();
  camDist = 60;
  private points!: THREE.Points;
  private mat!: THREE.ShaderMaterial;
  private core: THREE.Sprite;
  private bodies: THREE.Mesh[] = [];
  private comet: THREE.Group;
  private cometT = 0;
  private pulses = new Float32Array(8);   // Kauf-Puls je Stufe (Planet hüpft statt Screen-Shake)

  constructor(tier: QualityTier, engineCometRef: (o: THREE.Object3D) => void) {
    this.buildParticles(tier.dustParticles);

    // — Protostern-Kern —
    this.core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture('#fff7e0', '#ffb347', 'rgba(255,120,40,0)'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.core.scale.setScalar(4);
    this.group.add(this.core);

    // — Orbitkörper je Stufe (Planetesimal → Protostern), erscheinen mit Käufen —
    const bodyColors = [0x8ecae6, 0x74c69d, 0xf4a261, 0xe76f51, 0xb388eb, 0xffd166, 0xef476f, 0xfffcf2];
    for (let t = 0; t < 8; t++) {
      const size = 0.4 + t * 0.28;
      const mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(size, 1),
        new THREE.MeshBasicMaterial({ color: bodyColors[t], transparent: true, opacity: 0.0 }),
      );
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: radialTexture('#ffffff', '#88ccff', 'rgba(80,120,255,0)'),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5,
      }));
      glow.scale.setScalar(size * 4);
      mesh.add(glow);
      this.bodies.push(mesh);
      this.group.add(mesh);
    }

    // — Komet: leuchtender Kopf + Schweif —
    this.comet = new THREE.Group();
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xcfffff }),
    );
    const headGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture('#ffffff', '#9fe8ff', 'rgba(60,180,255,0)'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    headGlow.scale.setScalar(8);
    const tailGeo = new THREE.BufferGeometry();
    const TAIL = 60;
    const tailPos = new Float32Array(TAIL * 3);
    for (let i = 0; i < TAIL; i++) tailPos.set([i * 0.7, Math.sin(i) * 0.08, 0], i * 3);
    tailGeo.setAttribute('position', new THREE.BufferAttribute(tailPos, 3));
    const tail = new THREE.Points(tailGeo, new THREE.PointsMaterial({
      color: 0x9fe8ff, size: 1.6, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.comet.add(head, headGlow, tail);
    this.comet.visible = false;
    this.group.add(this.comet);
    engineCometRef(this.comet);

    on('gen-bought', tier => { this.pulses[tier as number] = 1; });
  }

  rebuild(tier: QualityTier): void {
    this.group.remove(this.points);
    this.points.geometry.dispose();
    this.mat.dispose();
    this.buildParticles(tier.dustParticles);
  }

  private buildParticles(count: number): void {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      // Scheiben-verteilte Wolke mit vertikaler Streuung
      const r = 6 + Math.pow(Math.random(), 0.6) * 38;
      const a = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * (10 - r * 0.12);
      pos.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
      seed.set([Math.random(), Math.random(), Math.random(), r], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },   // 0..1 → log-Fortschritt zur Zündung
        uBoost: { value: 0 },      // Kometen-Boost aktiv → Funkeln
      },
      vertexShader: /* glsl */`
        attribute vec4 aSeed;
        uniform float uTime, uProgress;
        varying float vGlow;
        void main() {
          vec3 p = position;
          float r = aSeed.w;
          // differentielle Rotation + Verdichtung mit Fortschritt
          float shrink = 1.0 - uProgress * 0.45;
          float ang = uTime * (0.05 + 2.2 / (r * shrink)) + aSeed.x * 6.2831;
          float c = cos(ang), s = sin(ang);
          p = vec3(c * p.x - s * p.z, p.y * (1.0 - uProgress * 0.55), s * p.x + c * p.z) * shrink;
          // Noise-Wobble
          p += vec3(
            sin(uTime * 0.7 + aSeed.x * 40.0),
            cos(uTime * 0.5 + aSeed.y * 40.0) * 0.6,
            sin(uTime * 0.6 + aSeed.z * 40.0)
          ) * 0.5;
          vGlow = 0.35 + 0.65 * aSeed.y + uProgress * 0.4;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp((1.0 + aSeed.z * 2.2 + uProgress * 1.6) * (80.0 / -mv.z), 0.0, 14.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uBoost;
        varying float vGlow;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * vGlow;
          vec3 col = mix(vec3(0.35, 0.75, 1.0), vec3(1.0, 0.85, 0.55), vGlow * 0.45);
          col += uBoost * vec3(0.3, 0.2, 0.0);
          gl_FragColor = vec4(col * a * 0.55, a * 0.22);
        }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  update(s: GameState, _m: Mults, dt: number, time: number): void {
    // Fortschritt: log10(totalDust) / log10(1e30)
    const logDust = Math.max(0, s.dust.total.max(1).log10().toNumber());
    const progress = Math.min(1, logDust / 30);
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uProgress.value = progress;
    this.mat.uniforms.uBoost.value = s.dust.comet.boost > 0 ? 1 : 0;

    // Kern wächst & pulsiert kurz vor Zündung
    const coreScale = 2.5 + progress * 9 + (progress > 0.9 ? Math.sin(time * 6) * 0.8 : 0);
    this.core.scale.setScalar(coreScale);

    // Orbitkörper: sichtbar ab Kauf, Größe mit bought
    for (let t = 0; t < 8; t++) {
      const b = this.bodies[t];
      const bought = s.dust.gens[t].bought;
      const mat = b.material as THREE.MeshBasicMaterial;
      const target = bought > 0 ? 0.95 : 0;
      mat.opacity += (target - mat.opacity) * Math.min(1, dt * 2);
      b.visible = mat.opacity > 0.02;
      if (b.visible) {
        const rad = 12 + t * 4.5;
        const speed = 0.5 - t * 0.045;
        const a = time * speed + t * 1.7;
        b.position.set(Math.cos(a) * rad, Math.sin(t * 2.1) * 2.5, Math.sin(a) * rad);
        b.rotation.y += dt * 0.8;
        // Kauf-Puls: der Planet selbst hüpft kurz auf und leuchtet
        if (this.pulses[t] > 0) this.pulses[t] = Math.max(0, this.pulses[t] - dt * 3);
        const pulse = 1 + Math.sin(this.pulses[t] * Math.PI) * 0.55;
        const grow = 1 + Math.min(2, Math.log10(1 + bought) * 0.7);
        b.scale.setScalar(grow * pulse);
        const glow = b.children[0] as THREE.Sprite | undefined;
        if (glow) (glow.material as THREE.SpriteMaterial).opacity = 0.5 + this.pulses[t] * 0.5;
      }
    }

    // Komet fliegt auf Bahn quer durch die Szene
    if (s.dust.comet.active) {
      if (!this.comet.visible) { this.comet.visible = true; this.cometT = 0; }
      this.cometT += dt / 12;
      const x = THREE.MathUtils.lerp(-70, 70, this.cometT);
      this.comet.position.set(x, 18 - this.cometT * 10, Math.sin(this.cometT * Math.PI) * -25);
      this.comet.lookAt(this.comet.position.clone().add(new THREE.Vector3(1, -0.12, 0)));
    } else {
      this.comet.visible = false;
    }
  }
}

/** Radialer Glow als CanvasTexture (kein Asset nötig) */
export function radialTexture(inner: string, mid: string, outer: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, mid);
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
