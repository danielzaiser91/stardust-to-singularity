import * as THREE from 'three';
import type { GameState } from '../../core/state';
import type { Mults } from '../../core/formulas';
import type { LayerScene } from '../engine';
import type { QualityTier } from '../quality';
import { radialTexture } from './dust';

/**
 * Ebene 3 — Galaxie: log-Spirale aus GPU-Partikeln mit differentieller Rotation,
 * darüber der Konstellations-Skilltree: 45 Stern-Nodes in 3 Ästen mit Linien.
 * Gekaufte Nodes leuchten, verfügbare pulsieren.
 */
export class GalaxyScene implements LayerScene {
  group = new THREE.Group();
  camDist = 110;
  private points!: THREE.Points;
  private mat!: THREE.ShaderMaterial;
  nodeSprites: THREE.Sprite[] = [];
  private lines: THREE.LineSegments;
  private core: THREE.Sprite;

  constructor(tier: QualityTier) {
    this.buildSpiral(tier.galaxyParticles);

    this.core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture('#fff8e8', '#ffd9a0', 'rgba(255,180,80,0)'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.core.scale.setScalar(26);
    this.group.add(this.core);

    // — Skilltree: 3 Äste als Bögen über der Scheibe —
    const nodeTex = radialTexture('#ffffff', '#cfe8ff', 'rgba(150,190,255,0)');
    const linePos: number[] = [];
    for (let b = 0; b < 3; b++) {
      for (let i = 0; i < 15; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: nodeTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        sp.position.copy(nodePosition(b, i));
        sp.scale.setScalar(3);
        this.nodeSprites.push(sp);
        this.group.add(sp);
        if (i > 0) {
          const a = nodePosition(b, i - 1), c = nodePosition(b, i);
          linePos.push(a.x, a.y, a.z, c.x, c.y, c.z);
        }
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    this.lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
      color: 0x8fb8ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending,
    }));
    this.group.add(this.lines);
  }

  rebuild(tier: QualityTier): void {
    this.group.remove(this.points);
    this.points.geometry.dispose();
    this.mat.dispose();
    this.buildSpiral(tier.galaxyParticles);
  }

  private buildSpiral(count: number): void {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const c = new THREE.Color();
    const ARMS = 4;
    for (let i = 0; i < count; i++) {
      const r = Math.pow(Math.random(), 0.5) * 70;
      const arm = i % ARMS;
      const spiral = (arm / ARMS) * Math.PI * 2 + r * 0.055;
      const spread = (Math.random() - 0.5) * (0.35 + r * 0.012);
      const a = spiral + spread;
      const y = (Math.random() - 0.5) * Math.max(1.2, 7 - r * 0.09);
      pos.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
      const t = r / 70;
      c.setHSL(0.08 + t * 0.55, 0.75, 0.55 + Math.random() * 0.25);
      col.set([c.r, c.g, c.b], i * 3);
      seed[i] = r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aR', new THREE.BufferAttribute(seed, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */`
        attribute float aR;
        uniform float uTime;
        varying vec3 vColor;
        void main() {
          vColor = color;
          // differentielle Rotation: innen schneller
          float ang = uTime * (0.5 / (1.0 + aR * 0.09));
          float c = cos(ang), s = sin(ang);
          vec3 p = vec3(c * position.x - s * position.z, position.y, s * position.x + c * position.z);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp((0.9 + fract(aR * 13.7) * 1.8) * (90.0 / -mv.z), 0.0, 10.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vColor;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(vColor * a * 0.6, a * 0.3);
        }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  update(s: GameState, _m: Mults, _dt: number, time: number): void {
    this.mat.uniforms.uTime.value = time;
    this.core.scale.setScalar(26 + Math.sin(time * 1.4) * 2);
    for (let i = 0; i < 45; i++) {
      const sp = this.nodeSprites[i];
      const mat = sp.material as THREE.SpriteMaterial;
      const bought = s.galaxy.nodes[i];
      const available = !bought && (i % 15 === 0 || s.galaxy.nodes[i - 1]);
      if (bought) {
        mat.opacity = 1;
        sp.scale.setScalar(4.2);
        mat.color.setHex([0xffd166, 0x64dfdf, 0xff9ff3][Math.floor(i / 15)]);
      } else if (available) {
        mat.opacity = 0.55 + Math.sin(time * 3 + i) * 0.3;
        sp.scale.setScalar(3.2);
        mat.color.setHex(0xffffff);
      } else {
        mat.opacity = 0.18;
        sp.scale.setScalar(2.2);
        mat.color.setHex(0x8899bb);
      }
    }
  }
}

/** Position von Node i im Ast b: drei Bögen über der Galaxienscheibe */
export function nodePosition(b: number, i: number): THREE.Vector3 {
  const baseA = (b / 3) * Math.PI * 2;
  const t = i / 14;
  const a = baseA + t * 1.9;
  const r = 30 + t * 48;
  return new THREE.Vector3(Math.cos(a) * r, 16 + Math.sin(t * Math.PI) * 14, Math.sin(a) * r);
}
