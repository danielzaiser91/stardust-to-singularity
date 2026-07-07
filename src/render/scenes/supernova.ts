import * as THREE from 'three';
import type { GameState } from '../../core/state';
import type { Mults } from '../../core/formulas';
import { HEX_COORDS } from '../../core/formulas';
import type { LayerScene } from '../engine';
import { radialTexture } from './dust';
import { on } from '../../events';

/**
 * Ebene 2 — Supernova: Explosions-Schockwelle (Event-getriggert), Nebula-Hexgarten
 * als wachsende Volumen-Billboards, Remnants (Neutronenstern, Pulsar mit Lichtkegeln,
 * kleine Schwarze Löcher) orbitieren im Trümmerfeld.
 */
const CELL_COLORS = ['', '#ff4d8d', '#4dc3ff', '#5b2a86'];  // emission, reflection, dark
// Rendering deckeln statt jeden Remnant einzeln zu zeichnen: ab hier verschmelzen die additiv
// geblendeten Glows optisch ohnehin zu einem gesättigten Klumpen (siehe gemeldeter Screenshot) —
// mehr Objekte ändern das Bild nicht mehr, kosten aber linear mehr Speicher/CPU pro Frame.
const MAX_RENDERED_PER_TYPE = 24;

export class SupernovaScene implements LayerScene {
  group = new THREE.Group();
  camDist = 70;
  private cells: THREE.Sprite[] = [];
  private shock: THREE.Mesh;
  private shockT = 99;
  private remnantGroup = new THREE.Group();
  private pulsarCones: THREE.Group[] = [];
  private textures: Record<number, THREE.Texture> = {};
  // Geometrien/Materialien EINMAL gebaut und über alle Remnant-Instanzen geteilt — vorher baute
  // rebuildRemnants() pro Remnant (inkl. eigener CanvasTexture fürs Neutronenstern-Glow) komplett
  // neue Objekte, und `remnantGroup.clear()` gibt sie nie frei (kein dispose) → echter Leak bei
  // aktivem Auto-Supernova, das den Remnant-Count laufend ändert. Realer Bug, 2026-07-07.
  private neutronGeo = new THREE.SphereGeometry(1.1, 16, 16);
  private neutronMat = new THREE.MeshBasicMaterial({ color: 0xeef6ff });
  private neutronGlowMat!: THREE.SpriteMaterial;
  private pulsarGeo = new THREE.SphereGeometry(1.0, 16, 16);
  private pulsarMat = new THREE.MeshBasicMaterial({ color: 0xd8f3ff });
  private coneGeo = new THREE.ConeGeometry(2.2, 16, 16, 1, true);
  private coneMat = new THREE.MeshBasicMaterial({
    color: 0x66eaff, transparent: true, opacity: 0.28,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  private bhGeo = new THREE.SphereGeometry(1.3, 20, 20);
  private bhMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  private diskGeo = new THREE.TorusGeometry(2.4, 0.35, 8, 40);
  private diskMat = new THREE.MeshBasicMaterial({ color: 0xffa64d, blending: THREE.AdditiveBlending, depthWrite: false });

  constructor() {
    this.neutronGlowMat = new THREE.SpriteMaterial({
      map: radialTexture('#ffffff', '#aaccff', 'rgba(120,150,255,0)'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    for (const t of [1, 2, 3]) {
      this.textures[t] = radialTexture(
        t === 3 ? 'rgba(60,20,90,0.95)' : '#ffffff',
        CELL_COLORS[t],
        'rgba(0,0,0,0)',
      );
    }
    // — Hex-Garten —
    for (let i = 0; i < HEX_COORDS.length; i++) {
      const [q, r] = HEX_COORDS[i];
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.textures[1], transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const x = (q + r / 2) * 14;
      const z = r * 12.1;
      sp.position.set(x, Math.sin(i * 2.7) * 2, z);
      sp.scale.setScalar(0.1);
      this.cells.push(sp);
      this.group.add(sp);
    }

    // — Schockwellen-Sphäre —
    this.shock = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 48),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uT: { value: 99 } },
        vertexShader: `varying vec3 vN; void main(){ vN = normal; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: /* glsl */`
          uniform float uT;
          varying vec3 vN;
          void main() {
            float rim = pow(1.0 - abs(dot(normalize(vN), vec3(0.0,0.0,1.0))), 2.0);
            float fade = smoothstep(3.2, 0.0, uT);
            gl_FragColor = vec4(vec3(1.0, 0.55, 0.75) * rim * 2.2, rim * fade);
          }`,
      }),
    );
    this.shock.visible = false;
    this.group.add(this.shock);
    this.group.add(this.remnantGroup);

    on('supernova', () => { this.shockT = 0; this.shock.visible = true; });
  }

  update(s: GameState, _m: Mults, dt: number, time: number): void {
    // — Zellen: Typ-Textur + Wachstum —
    for (let i = 0; i < this.cells.length; i++) {
      const sp = this.cells[i];
      const t = s.nova.cells[i];
      const mat = sp.material as THREE.SpriteMaterial;
      if (t === 0) {
        mat.opacity += (0.06 - mat.opacity) * dt * 2;      // leere Zelle: schwacher Platzhalter
        mat.map = this.textures[1];
        sp.scale.setScalar(Math.max(2.5, sp.scale.x * (1 - dt)));
      } else {
        mat.map = this.textures[t];
        mat.opacity += ((t === 3 ? 0.9 : 0.75) - mat.opacity) * dt * 2;
        const target = 12 + Math.sin(time * 0.6 + i) * 1.2;
        sp.scale.setScalar(sp.scale.x + (target - sp.scale.x) * Math.min(1, dt * 0.8));
      }
    }

    // — Schockwelle expandiert —
    if (this.shockT < 4) {
      this.shockT += dt;
      const r = 2 + this.shockT * 55;
      this.shock.scale.setScalar(r);
      (this.shock.material as THREE.ShaderMaterial).uniforms.uT.value = this.shockT;
      if (this.shockT >= 4) this.shock.visible = false;
    }

    // — Remnants synchronisieren (pro Typ gedeckelt, s. MAX_RENDERED_PER_TYPE) —
    const capped = s.nova.remnants.map(c => Math.min(c, MAX_RENDERED_PER_TYPE));
    const want = capped[0] + capped[1] + capped[2];
    if (this.remnantGroup.children.length !== want) this.rebuildRemnants(capped);
    const n = this.remnantGroup.children.length;
    this.remnantGroup.children.forEach((o, i) => {
      const a = time * 0.12 + (i / Math.max(1, n)) * Math.PI * 2;
      o.position.set(Math.cos(a) * 42, Math.sin(i * 1.9) * 6, Math.sin(a) * 42);
    });
    for (const cone of this.pulsarCones) cone.rotation.y += dt * 2.4;
  }

  /** Baut nur leichte Mesh/Sprite/Group-Hüllen — Geometrien & Materialien sind geteilte
   *  Instanz-Felder (s. Konstruktor), hier NIE neu alloziert. `clear()` genügt beim Rebuild,
   *  weil dabei nichts Einzigartiges (keine eigene Textur/Geometrie) verloren geht. */
  private rebuildRemnants(counts: number[]): void {
    this.remnantGroup.clear();
    this.pulsarCones = [];
    const make = (type: number) => {
      const g = new THREE.Group();
      if (type === 0) {  // Neutronenstern
        g.add(new THREE.Mesh(this.neutronGeo, this.neutronMat));
        const glow = new THREE.Sprite(this.neutronGlowMat);
        glow.scale.setScalar(7);
        g.add(glow);
      } else if (type === 1) {  // Pulsar mit rotierenden Lichtkegeln
        g.add(new THREE.Mesh(this.pulsarGeo, this.pulsarMat));
        const cones = new THREE.Group();
        for (const dir of [1, -1]) {
          const cone = new THREE.Mesh(this.coneGeo, this.coneMat);
          cone.position.y = dir * 8;
          cone.rotation.z = dir > 0 ? Math.PI : 0;
          cones.add(cone);
        }
        cones.rotation.z = 0.5;
        this.pulsarCones.push(cones);
        g.add(cones);
      } else {  // kleines Schwarzes Loch
        g.add(new THREE.Mesh(this.bhGeo, this.bhMat));
        const disk = new THREE.Mesh(this.diskGeo, this.diskMat);
        disk.rotation.x = Math.PI / 2.4;
        g.add(disk);
      }
      this.remnantGroup.add(g);
    };
    for (let t = 0; t < 3; t++) for (let i = 0; i < counts[t]; i++) make(t);
  }
}
