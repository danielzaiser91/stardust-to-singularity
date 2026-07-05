import * as THREE from 'three';
import type { GameState } from '../../core/state';
import type { Mults } from '../../core/formulas';
import type { LayerScene } from '../engine';
import { radialTexture } from './dust';
import { on } from '../../events';

/**
 * Ebene 4 — Singularität: Schwarzes Loch mit Doppler-gefärbter Akkretionsscheibe,
 * Photonenring, einspiralenden Opfer-Partikeln (Feed-Event) und Endgame-Puls.
 */
export class BlackHoleScene implements LayerScene {
  group = new THREE.Group();
  camDist = 55;
  private disk: THREE.Mesh;
  private diskMat: THREE.ShaderMaterial;
  private photonRing: THREE.Mesh;
  private feedParticles: THREE.Points;
  private feedData: Float32Array;
  private feedLife: Float32Array;
  private glow: THREE.Sprite;

  constructor() {
    // — Ereignishorizont —
    const horizon = new THREE.Mesh(
      new THREE.SphereGeometry(6, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    this.group.add(horizon);

    // — Photonenring —
    this.photonRing = new THREE.Mesh(
      new THREE.TorusGeometry(6.6, 0.18, 16, 120),
      new THREE.MeshBasicMaterial({
        color: 0xfff2cc, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.group.add(this.photonRing);

    // — Akkretionsscheibe mit Doppler-Shader —
    this.diskMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uHeat: { value: 0.4 } },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vWorld;
        void main() {
          vUv = uv;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uHeat;
        varying vec2 vUv;
        varying vec3 vWorld;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
        void main() {
          vec2 c = vUv - 0.5;
          float r = length(c) * 2.0;
          if (r > 1.0 || r < 0.36) discard;
          float ang = atan(c.y, c.x);
          // Orbital-Streifen + Rotation
          float stripes = sin(ang * 3.0 - uTime * 2.2 + r * 22.0) * 0.5 + 0.5;
          float noise = hash(floor(vec2(ang * 40.0, r * 60.0)));
          // Doppler: eine Seite blau-hell, andere rot-dunkel
          float doppler = 0.5 + 0.5 * sin(ang - uTime * 2.2);
          vec3 hot = mix(vec3(1.0, 0.45, 0.15), vec3(0.65, 0.85, 1.0), doppler);
          float edge = smoothstep(1.0, 0.85, r) * smoothstep(0.36, 0.5, r);
          float bright = (0.55 + stripes * 0.4 + noise * 0.25) * edge * (0.7 + uHeat);
          bright *= 1.0 + (1.0 - doppler) * -0.35 + doppler * 0.55;
          gl_FragColor = vec4(hot * bright, bright * 0.8);
        }`,
    });
    this.disk = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), this.diskMat);
    this.disk.rotation.x = -Math.PI / 2 + 0.32;
    this.group.add(this.disk);

    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture('rgba(255,240,220,0.28)', 'rgba(255,120,60,0.10)', 'rgba(120,40,150,0)'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5,
    }));
    this.glow.scale.setScalar(36);
    this.group.add(this.glow);

    // — Feed-Partikel: spiralen sichtbar hinein —
    const N = 600;
    this.feedData = new Float32Array(N * 3).fill(1e9);
    this.feedLife = new Float32Array(N).fill(-1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.feedData, 3));
    this.feedParticles = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xbfe6ff, size: 0.8, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.feedParticles.frustumCulled = false;
    this.group.add(this.feedParticles);

    on('feed', () => this.spawnFeed());
    on('collapse', () => this.spawnFeed());
  }

  private spawnFeed(): void {
    for (let i = 0; i < this.feedLife.length; i++) {
      if (this.feedLife[i] > 0) continue;
      this.feedLife[i] = 2.5 + Math.random() * 2.5;
      const a = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 25;
      this.feedData[i * 3] = Math.cos(a) * r;
      this.feedData[i * 3 + 1] = (Math.random() - 0.5) * 14;
      this.feedData[i * 3 + 2] = Math.sin(a) * r;
    }
    this.feedParticles.geometry.attributes.position.needsUpdate = true;
  }

  update(s: GameState, _m: Mults, dt: number, time: number): void {
    this.diskMat.uniforms.uTime.value = time;
    const fed = Math.min(1, s.sing.fed.max(1).log10().toNumber() / 6);
    this.diskMat.uniforms.uHeat.value = 0.3 + fed * 0.9;
    this.photonRing.rotation.x = Math.PI / 2 - 0.32 + Math.sin(time * 0.2) * 0.04;

    // Endgame-Nähe: alles pulsiert weiß
    const near = s.sing.totalEntropy.div(1e9).min(1).toNumber();
    if (near > 0.8) this.glow.scale.setScalar(36 + Math.sin(time * 5) * 8 * near);

    // Feed-Partikel spiralen einwärts
    let any = false;
    for (let i = 0; i < this.feedLife.length; i++) {
      if (this.feedLife[i] <= 0) continue;
      any = true;
      this.feedLife[i] -= dt;
      const x = this.feedData[i * 3], y = this.feedData[i * 3 + 1], z = this.feedData[i * 3 + 2];
      const r = Math.hypot(x, z);
      if (r < 6.5 || this.feedLife[i] <= 0) {
        this.feedData[i * 3] = 1e9;
        this.feedLife[i] = -1;
        continue;
      }
      const ang = Math.atan2(z, x) + dt * (26 / r);
      const nr = r - dt * (6 + (34 - r) * 0.25);
      this.feedData[i * 3] = Math.cos(ang) * nr;
      this.feedData[i * 3 + 1] = y * (1 - dt * 0.9);
      this.feedData[i * 3 + 2] = Math.sin(ang) * nr;
    }
    if (any) this.feedParticles.geometry.attributes.position.needsUpdate = true;
  }
}
