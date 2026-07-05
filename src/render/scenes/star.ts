import * as THREE from 'three';
import type { GameState } from '../../core/state';
import { novaReq, type Mults } from '../../core/formulas';
import type { LayerScene } from '../engine';
import { radialTexture } from './dust';

/**
 * Ebene 1 — Stern: prozeduraler Plasma-Shader (FBM), Farbtemperatur je Sternklasse,
 * Korona, animierte Protuberanzen, 6 Fusions-Ringe (je Element), Fe verdunkelt den Kern.
 */
const CLASS_COLORS: [THREE.Color, THREE.Color][] = [
  [new THREE.Color(0xff5533), new THREE.Color(0xff9966)],   // Roter Zwerg
  [new THREE.Color(0xffaa22), new THREE.Color(0xfff2bb)],   // Gelber Stern
  [new THREE.Color(0x66aaff), new THREE.Color(0xddeeff)],   // Blauer Riese
];
const ELEMENT_COLORS = [0xa8dadc, 0xffd166, 0x9b5de5, 0x00f5d4, 0xf15bb5, 0xff2211];

export class StarScene implements LayerScene {
  group = new THREE.Group();
  camDist = 42;
  private surface: THREE.Mesh;
  private surfMat: THREE.ShaderMaterial;
  private corona: THREE.Sprite;
  private rings: THREE.Mesh[] = [];
  private prominences: THREE.Mesh[] = [];

  constructor() {
    this.surfMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColA: { value: CLASS_COLORS[1][0].clone() },
        uColB: { value: CLASS_COLORS[1][1].clone() },
        uIron: { value: 0 },
      },
      vertexShader: /* glsl */`
        varying vec3 vPos;
        varying vec3 vNormal;
        void main() {
          vPos = position;
          vNormal = normal;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uIron;
        uniform vec3 uColA, uColB;
        varying vec3 vPos;
        varying vec3 vNormal;
        // kompaktes 3D-Value-Noise + FBM
        float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float noise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
            f.z);
        }
        float fbm(vec3 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.1; a *= 0.5; }
          return v;
        }
        void main() {
          vec3 p = normalize(vPos);
          float n = fbm(p * 3.5 + vec3(uTime * 0.09, uTime * 0.05, 0.0));
          float cells = fbm(p * 9.0 - vec3(0.0, uTime * 0.12, 0.0));
          vec3 col = mix(uColA, uColB, smoothstep(0.25, 0.75, n));
          col += vec3(1.0, 0.9, 0.6) * pow(cells, 3.0) * 0.9;          // Granulation-Hotspots
          col = mix(col, vec3(0.12, 0.08, 0.10), uIron * 0.75);        // Eisen verdunkelt
          float rim = 1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)));
          col += uColB * pow(rim, 2.5) * 0.6;                          // Limb-Glow
          gl_FragColor = vec4(col * 1.35, 1.0);
        }`,
    });
    this.surface = new THREE.Mesh(new THREE.SphereGeometry(8, 48, 48), this.surfMat);
    this.group.add(this.surface);

    this.corona = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture('rgba(255,220,150,0.9)', 'rgba(255,150,60,0.35)', 'rgba(255,100,30,0)'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.corona.scale.setScalar(34);
    this.group.add(this.corona);

    // — Fusions-Ringe: einer je Element, leuchten mit Bestand —
    for (let e = 0; e < 6; e++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(11.5 + e * 2.2, 0.12, 8, 90),
        new THREE.MeshBasicMaterial({
          color: ELEMENT_COLORS[e], transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      ring.rotation.x = Math.PI / 2 + (e - 2.5) * 0.09;
      this.rings.push(ring);
      this.group.add(ring);
    }

    // — Protuberanzen: Torus-Bögen, die aus der Oberfläche wachsen —
    for (let i = 0; i < 5; i++) {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(2.2 + i * 0.4, 0.16, 6, 40, Math.PI),
        new THREE.MeshBasicMaterial({
          color: 0xff7733, transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      const a = (i / 5) * Math.PI * 2;
      arc.position.setFromSphericalCoords(8, Math.PI / 2 - 0.3 + i * 0.14, a);
      arc.lookAt(0, 0, 0);
      arc.rotateX(Math.PI / 2);
      this.prominences.push(arc);
      this.group.add(arc);
    }
  }

  update(s: GameState, _m: Mults, dt: number, time: number): void {
    this.surfMat.uniforms.uTime.value = time;
    const [a, b] = CLASS_COLORS[s.star.cls];
    (this.surfMat.uniforms.uColA.value as THREE.Color).lerp(a, dt * 2);
    (this.surfMat.uniforms.uColB.value as THREE.Color).lerp(b, dt * 2);
    // Eisenanteil → bedrohliche Verdunkelung (0..1 bei aktueller Supernova-Schwelle)
    const iron = Math.min(1, s.star.elements[5].div(novaReq(s)).toNumber());
    this.surfMat.uniforms.uIron.value = iron;

    // Puls kurz vor Supernova
    const pulse = iron > 0.85 ? 1 + Math.sin(time * 8) * 0.04 : 1 + Math.sin(time * 1.2) * 0.012;
    this.surface.scale.setScalar(pulse);
    this.corona.scale.setScalar(34 * pulse * (1 - iron * 0.35));

    for (let e = 0; e < 6; e++) {
      const stock = s.star.elements[e];
      const target = stock.gt(0) ? Math.min(0.85, 0.15 + stock.max(1).log10().toNumber() * 0.06) : 0;
      const mat = this.rings[e].material as THREE.MeshBasicMaterial;
      mat.opacity += (target - mat.opacity) * Math.min(1, dt * 3);
      this.rings[e].rotation.z += dt * (0.3 - e * 0.04);
    }
    for (let i = 0; i < this.prominences.length; i++) {
      const p = this.prominences[i];
      const ph = Math.sin(time * 0.7 + i * 2.3);
      p.scale.setScalar(0.7 + ph * 0.35);
      (p.material as THREE.MeshBasicMaterial).opacity = 0.4 + ph * 0.35;
    }
  }
}
