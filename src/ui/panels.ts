import { el, btn, setText, setVisible, setDisabled, setClass } from './dom';
import { fmt, fmtInt, fmtTime, fmtMult } from './format';
import { t, setLang, getLang } from '../i18n';
import type { GameState, NebulaCell, StarClass, GalaxyType } from '../core/state';
import * as C from '../core/constants';
import * as F from '../core/formulas';
import * as A from '../core/actions';
import { emit } from '../events';
import type { Panel, Hud } from './hud';
import { achLabel } from './hud';
import { D, Decimal } from '../core/decimal';
import { exportSave, importSave, saveGame, hardReset } from '../storage';
import { attachTip } from './tooltip';
import { spawnFloaty } from './floaty';
import { ACH_COUNT } from '../core/achievements';

type St = () => GameState;
const M = (s: GameState) => F.computeMults(s);

function bar(cls = ''): { wrap: HTMLElement; fill: HTMLElement } {
  const wrap = el('div', `bar ${cls}`);
  const fill = el('div', 'bar-fill');
  wrap.append(fill);
  return { wrap, fill };
}
function setBar(b: { fill: HTMLElement }, frac: number): void {
  b.fill.style.width = `${Math.min(100, Math.max(0, frac * 100)).toFixed(1)}%`;
}
/** Fortschritt in log-Skala (fühlt sich bei e-Zahlen richtig an) */
function logFrac(cur: Decimal, req: Decimal | number): number {
  if (cur.lte(1)) return 0;
  const reqLog = req instanceof Decimal ? req.max(10).log10().toNumber() : Math.log10(req);
  return Math.min(1, cur.log10().toNumber() / reqLog);
}

// ═══════════════ Ebene 0: Dust ═══════════════
export class DustPanel implements Panel {
  root = el('div');
  private clickBtn: HTMLButtonElement;
  private clickVal = el('span', 'sub');
  private compRow: HTMLElement;
  private compCost = el('span', 'cost');
  private compEff = el('span', 'sub row-note');
  private compMax!: HTMLButtonElement;
  private genRows: { row: HTMLElement; owned: HTMLElement; rate: HTMLElement; b1: HTMLButtonElement; bm: HTMLButtonElement; c1: HTMLElement }[] = [];
  private igniteBox: HTMLElement;
  private igniteBar = bar('bar-hot');
  private igniteLabel = el('div', 'sub center');
  private igniteBtn: HTMLButtonElement;
  private classSeg: HTMLElement;
  private classBtns: HTMLButtonElement[] = [];
  private cometNote = el('div', 'comet-note');
  /** Nachleuchte je Reihe: bei schnellen Auto-Zündungen flackern Reihen sonst weg und wieder her */
  private rowSeen = new Float64Array(8);

  constructor(private st: St, private hud: Hud) {
    this.clickBtn = el('button', 'big-click') as HTMLButtonElement;
    this.clickBtn.textContent = t('dust.click');
    this.clickBtn.addEventListener('click', e => {
      e.stopPropagation();
      const s = this.st();
      const gain = A.click(s, M(s));
      emit('click');
      spawnFloaty(e.clientX, e.clientY, `+${fmt(gain, s.settings.sciNotation)}`);
    });
    this.clickBtn.append(this.clickVal);
    attachTip(this.clickBtn, () => ({ title: t('dust.click'), body: t('dust.clickTip') }));

    // Hovern (Desktop) bzw. Halten (Touch) = 4 Auto-Klicks/s; Sound gedrosselt auf 1/s
    let hoverTimer: ReturnType<typeof setInterval> | undefined;
    let hoverCount = 0;
    const startAuto = () => {
      if (hoverTimer) return;
      hoverTimer = setInterval(() => {
        const s = this.st();
        const gain = A.click(s, M(s));
        if (++hoverCount % 4 === 0) emit('click');
        const r = this.clickBtn.getBoundingClientRect();
        spawnFloaty(r.left + 20 + Math.random() * (r.width - 40), r.top + 6, `+${fmt(gain, s.settings.sciNotation)}`);
      }, 250);
    };
    const stopAuto = () => { clearInterval(hoverTimer); hoverTimer = undefined; };
    this.clickBtn.addEventListener('pointerenter', startAuto);
    this.clickBtn.addEventListener('pointerleave', stopAuto);
    this.clickBtn.addEventListener('pointercancel', stopAuto);
    window.addEventListener('blur', stopAuto);

    this.root.append(this.clickBtn, this.cometNote);

    // Compression
    this.compRow = el('div', 'row');
    const compBuy = btn('buy', t('dust.compression'), () => {
      const s = this.st();
      if (A.buyCompression(s)) emit('buy');
    });
    compBuy.append(this.compCost);
    this.compMax = btn('buy alt', t('btn.max'), () => {
      const s = this.st();
      if (A.buyCompressionMax(s)) emit('buy');
    });
    this.compRow.append(compBuy, this.compMax, this.compEff);
    this.root.append(this.compRow);

    // Generatoren
    for (let i = 0; i < C.GEN_COUNT; i++) {
      const row = el('div', 'row gen-row');
      const info = el('div', 'gen-info');
      const name = el('div', 'gen-name', t(`gen.${i}`));
      const owned = el('div', 'gen-owned');
      const rate = el('div', 'gen-rate sub');
      info.append(name, owned, rate);
      const c1 = el('span', 'cost');
      const buyGen = (max: boolean) => {
        const s = this.st();
        const first = s.dust.gens[i].bought === 0;
        const ok = max ? A.buyGeneratorMax(s, M(s), i) : A.buyGenerator(s, M(s), i, 1);
        if (ok) {
          emit('buy');
          emit('gen-bought', i);          // Planet pulst in der Szene
          if (first) emit('gen-first', i); // einmaliger Kamera-Puls beim Erstkauf
        }
      };
      const b1 = btn('buy', t('btn.buy1'), () => buyGen(false));
      b1.append(c1);
      const bm = btn('buy alt', t('btn.max'), () => buyGen(true));
      row.append(info, b1, bm);
      this.genRows.push({ row, owned, rate, b1, bm, c1 });
      this.root.append(row);
    }

    // Ignite-Box
    this.igniteBox = el('div', 'reset-box hot');
    this.igniteBox.append(this.igniteBar.wrap, this.igniteLabel);
    attachTip(this.igniteLabel, () => {
      const s = this.st();
      const m = M(s);
      const capped = F.isGainCapped(F.plasmaGain(s, m), s.star.totalPlasma, C.PLASMA_CLAMP_MULT);
      return capped
        ? { title: '⚠ ' + t('cap.title'), body: t('cap.body', { v: C.PLASMA_CLAMP_MULT + 1 }) }
        : { title: t('cap.title'), body: t('cap.hint', { v: C.PLASMA_CLAMP_MULT + 1 }) };
    });
    this.classSeg = el('div', 'seg');
    for (let c = 0; c < 3; c++) {
      const b = btn('seg-btn', t(`star.class${c}`), () => { this.st().ui.nextClass = c as StarClass; });
      attachTip(b, () => ({ title: t(`star.class${c}`), body: t(`star.class${c}d`) }));
      this.classBtns.push(b);
      this.classSeg.append(b);
    }
    this.igniteBtn = btn('reset-btn hot', t('star.ignite'), () => {
      const s = this.st();
      const doIt = () => {
        if (A.doIgnite(s, s.ui.nextClass)) {
          emit('ignite');
          if (s.settings.autoTab) this.hud.selectTab('star');
        }
      };
      if (s.stats.ignitions === 0) this.hud.confirm(t('star.ignite'), t('star.igniteConfirm'), doIt);
      else doIt();
    });
    this.igniteBox.append(this.classSeg, this.igniteBtn);
    this.root.append(this.igniteBox);

    this.ms = milestoneSection('ms.ign', C.MS_IGNITION, 'ms.u.ign', s => s.stats.ignitions);
    this.root.append(this.ms.root);
  }
  private ms!: ReturnType<typeof milestoneSection>;

  update(s: GameState, m: F.Mults): void {
    const sci = s.settings.sciNotation;
    setText(this.clickVal, `+${fmt(F.clickAmount(s, m), sci)}`);
    setVisible(this.cometNote, s.dust.comet.active || s.dust.comet.boost > 0);
    setText(this.cometNote, s.dust.comet.active ? '☄ ' + t('dust.comet')
      : t('dust.cometBoost', { v: fmtMult(m.cometBoostMult), t: Math.ceil(s.dust.comet.boost) }));

    // Max-Buttons sind eine Belohnung der ersten Ignition
    const maxUnlocked = s.stats.ignitions > 0;
    setVisible(this.compRow, s.nova.challenge !== 0);
    setVisible(this.compMax, maxUnlocked);
    setText(this.compCost, fmt(F.compressionCost(s), sci));
    setText(this.compEff, `${s.dust.compression} × | ${t('dust.compressionDesc', { v: m.compressionEffect.toFixed(2) })}`);
    setDisabled(this.compRow.querySelector('button')!, s.dust.amount.lt(F.compressionCost(s)));

    const top = F.maxTier(s);
    const now = performance.now();
    for (let i = 0; i < C.GEN_COUNT; i++) {
      const r = this.genRows[i];
      const g = s.dust.gens[i];
      const cond = i < top && (i === 0 || s.dust.gens[i - 1].bought > 0 || g.bought > 0);
      if (cond) this.rowSeen[i] = now;
      // 5 s Nachleuchte: Panel-Höhe bleibt bei schnellen Reset-Zyklen stabil
      const visible = cond || now - this.rowSeen[i] < 5000;
      setVisible(r.row, visible);
      if (!visible) continue;
      setText(r.owned, `${fmtInt(g.amount)} (${g.bought})`);
      const prod = g.amount.mul(F.tierMult(s, m, i)).mul(i === 0 ? m.dustMult : D(1));
      setText(r.rate, `+${fmt(prod, sci)}${t('unit.perSec')} ${i === 0 ? t('dust.name') : t(`gen.${i - 1}`)}`);
      setText(r.c1, fmt(F.genCost(s, m, i, 1), sci));
      setDisabled(r.b1, s.dust.amount.lt(F.genCost(s, m, i, 1)));
      setVisible(r.bm, maxUnlocked);
      setDisabled(r.bm, F.genMaxAfford(s, m, i) < 1);
    }

    // Ignite
    const show = s.dust.total.gte(1e26) || s.star.unlocked;
    setVisible(this.igniteBox, show);
    if (show) {
      const req = F.igniteReq(s);
      setBar(this.igniteBar, s.dust.total.lte(1) ? 0
        : Math.min(1, s.dust.total.log10().toNumber() / req.log10().toNumber()));
      const gain = F.plasmaGain(s, m);
      if (F.canIgnite(s)) {
        setText(this.igniteLabel, t('star.igniteGain', { v: fmt(gain, s.settings.sciNotation) }));
        setDisabled(this.igniteBtn, false);
      } else {
        setText(this.igniteLabel, t('star.igniteReq', { v: fmt(req, true) }));
        setDisabled(this.igniteBtn, true);
      }
      setClass(this.igniteLabel, 'capped',
        F.canIgnite(s) && F.isGainCapped(gain, s.star.totalPlasma, C.PLASMA_CLAMP_MULT));
      setVisible(this.classSeg, s.stats.ignitions >= C.MS_IGNITION[1]);
      this.classBtns.forEach((b, c) => setClass(b, 'active', s.ui.nextClass === c));
    }
    this.ms.update(s);
  }
}

// ═══════════════ Ebene 1: Star ═══════════════
export class StarPanel implements Panel {
  root = el('div');
  private elRows: { row: HTMLElement; stock: HTMLElement; boost: HTMLElement }[] = [];
  private reactorBtns: { b: HTMLButtonElement; bm: HTMLButtonElement; lvl: HTMLElement; cost: HTMLElement }[] = [];
  private upBtns: HTMLButtonElement[] = [];
  private novaBox: HTMLElement;
  private novaBar = bar('bar-nova');
  private novaLabel = el('div', 'sub center');
  private novaBtn: HTMLButtonElement;
  private remSeg: HTMLElement;
  private remBtns: HTMLButtonElement[] = [];
  private classNote = el('div', 'sub center');

  constructor(private st: St, private hud: Hud) {
    this.root.append(el('h3', '', t('star.fusion')), this.classNote);

    for (let e = 0; e < C.ELEMENT_COUNT; e++) {
      const row = el('div', 'row el-row');
      const info = el('div', 'gen-info');
      info.append(el('div', `el-name el-${e}`, t(`el.${e}`)));
      const stock = el('div', 'gen-owned');
      const boost = el('div', 'sub');
      info.append(stock, boost);
      row.append(info);
      if (e < C.FUSION_STEPS) {
        const lvl = el('span', 'lvl');
        const cost = el('span', 'cost');
        const b = btn('buy', `⚛ ${t('star.reactor')}`, () => {
          const s = this.st();
          if (A.buyReactor(s, e)) emit('buy');
        });
        b.append(lvl, cost);
        const bm = btn('buy alt', t('btn.max'), () => {
          const s = this.st();
          if (A.buyReactorsMax(s, e, 1)) emit('buy');
        });
        this.reactorBtns.push({ b, bm, lvl, cost });
        row.append(b, bm);
      }
      this.elRows.push({ row, stock, boost });
      this.root.append(row);
    }

    // Upgrades getrennt: normale Boosts vs. Automation (4, 8, 13, 14)
    const AUTOMATION_IDS = [4, 8, 13, 14];
    const gridNormal = el('div', 'up-grid');
    const gridAuto = el('div', 'up-grid');
    for (let u = 0; u < C.PLASMA_UPGRADE_COSTS.length; u++) {
      const b = btn('up-btn', '', () => {
        const s = this.st();
        if (A.buyPlasmaUpgrade(s, u)) emit('buy');
      });
      b.append(el('div', 'up-name', t(`up.${u}`)), el('div', 'sub', t(`up.${u}d`)),
        el('div', 'cost', `${C.PLASMA_UPGRADE_COSTS[u]} ${t('star.plasma')}`));
      this.upBtns.push(b);
      (AUTOMATION_IDS.includes(u) ? gridAuto : gridNormal).append(b);
    }
    this.root.append(el('h3', '', t('star.upgrades')), gridNormal);
    this.root.append(el('h3', '', t('star.autoUps')), gridAuto);

    // Supernova-Box
    this.novaBox = el('div', 'reset-box nova');
    this.novaBox.append(el('h3', '', t('nova.name')), this.novaBar.wrap, this.novaLabel,
      el('div', 'sub center', t('nova.remnant')));
    attachTip(this.novaLabel, () => {
      const s = this.st();
      const capped = F.isGainCapped(F.shardGain(s, M(s)), s.nova.totalShards);
      return capped
        ? { title: '⚠ ' + t('cap.title'), body: t('cap.body', { v: C.GAIN_CLAMP_MULT + 1 }) }
        : { title: t('cap.title'), body: t('cap.hint', { v: C.GAIN_CLAMP_MULT + 1 }) };
    });
    this.remSeg = el('div', 'seg');
    for (let r = 0; r < 3; r++) {
      const b = btn('seg-btn', t(`nova.rem${r}`), () => { this.st().ui.nextRemnant = r as 0 | 1 | 2; });
      attachTip(b, () => ({ title: t(`nova.rem${r}`), body: t(`nova.rem${r}d`) }));
      this.remBtns.push(b);
      this.remSeg.append(b);
    }
    this.novaBtn = btn('reset-btn nova', t('nova.go'), () => {
      const s = this.st();
      const doIt = () => {
        if (A.doSupernova(s, s.ui.nextRemnant)) {
          emit('supernova');
          if (s.settings.autoTab) this.hud.selectTab('nova');
        }
      };
      if (s.stats.supernovae === 0) this.hud.confirm(t('nova.go'), t('nova.confirm'), doIt);
      else doIt();
    });
    this.novaBox.append(this.remSeg, this.novaBtn);
    this.root.append(this.novaBox);

    this.ms = milestoneSection('ms.nova', C.MS_NOVA, 'ms.u.nova', s => s.stats.supernovae);
    this.root.append(this.ms.root);
  }
  private ms!: ReturnType<typeof milestoneSection>;

  update(s: GameState, m: F.Mults): void {
    const sci = s.settings.sciNotation;
    setText(this.classNote, `${t('star.class')}: ${t(`star.class${s.star.cls}`)} · H: +${fmt(m.hRate, sci)}${t('unit.perSec')}`);
    for (let e = 0; e < C.ELEMENT_COUNT; e++) {
      const r = this.elRows[e];
      setText(r.stock, fmt(s.star.elements[e], sci));
      if (e > 0) {
        const exp = C.ELEMENT_BOOST_EXP[e];
        if (exp > 0) {
          const boost = s.star.elements[e].max(0).add(1).log10().add(1).pow(exp);
          setText(r.boost, `×${fmt(boost, sci)} ${t(`el.boost.${e}`)}`);
        } else {
          setText(r.boost, t(`el.boost.${e}`));
        }
      }
      if (e < C.FUSION_STEPS) {
        const rb = this.reactorBtns[e];
        setText(rb.lvl, ` ${t('misc.level')}${s.star.reactors[e]} `);
        setText(rb.cost, fmt(F.reactorCost(s, e), sci));
        const locked = e > 0 && s.star.reactors[e - 1] === 0;
        const cantAfford = s.star.plasma.lt(F.reactorCost(s, e));
        setDisabled(rb.b, locked || cantAfford);
        // Reaktor-Max ist eine Belohnung der ersten Supernova
        setVisible(rb.bm, s.stats.supernovae > 0);
        setDisabled(rb.bm, locked || cantAfford);
      }
    }
    for (let u = 0; u < this.upBtns.length; u++) {
      setClass(this.upBtns[u], 'bought', s.star.upgrades[u]);
      setDisabled(this.upBtns[u], s.star.upgrades[u] || s.star.plasma.lt(C.PLASMA_UPGRADE_COSTS[u]));
    }
    const fe = s.star.elements[5];
    setVisible(this.novaBox, fe.gt(0) || s.nova.unlocked);
    const nReq = F.novaReq(s);
    setBar(this.novaBar, logFrac(fe, nReq));
    const gain = F.shardGain(s, m);
    if (F.canSupernova(s)) {
      setText(this.novaLabel, t('nova.gain', { v: fmt(gain, sci) }));
      setDisabled(this.novaBtn, false);
    } else {
      setText(this.novaLabel, t('nova.req', { v: fmt(nReq, true) }));
      setDisabled(this.novaBtn, true);
    }
    setClass(this.novaLabel, 'capped', F.canSupernova(s) && F.isGainCapped(gain, s.nova.totalShards));
    this.remBtns.forEach((b, r) => setClass(b, 'active', s.ui.nextRemnant === r));
    this.ms.update(s);
  }
}

// ═══════════════ Ebene 2: Supernova ═══════════════
export class NovaPanel implements Panel {
  root = el('div');
  private brush: NebulaCell = 1;
  private brushBtns: HTMLButtonElement[] = [];
  private hexBtns: HTMLButtonElement[] = [];
  private cellCost = el('div', 'sub center');
  private remCounts = el('div', 'sub center');
  private chRows: { row: HTMLElement; enter: HTMLButtonElement; status: HTMLElement }[] = [];
  private autoRow: HTMLElement;
  private autoChk: HTMLInputElement;
  private autoLock = el('div', 'sub center');

  constructor(private st: St, _hud: Hud) {
    this.root.append(el('h3', '', t('nova.nebula')), el('div', 'sub', t('nova.nebulaDesc')));
    const seg = el('div', 'seg');
    for (const b of [1, 2, 3] as NebulaCell[]) {
      const bb = btn('seg-btn', t(`nova.cell${b}`), () => { this.brush = b; this.syncBrush(); });
      attachTip(bb, () => ({ title: t(`nova.cell${b}`), body: t(`nova.cell${b}d`) }));
      this.brushBtns.push(bb);
      seg.append(bb);
    }
    this.root.append(seg);

    // Hex-Grid als absolute Buttons — Abstände so gewählt, dass Bounding-Boxen
    // nicht überlappen (sonst schlucken Nachbarn die Klicks in den Eckbereichen)
    const grid = el('div', 'hexgrid');
    for (let i = 0; i < F.HEX_COORDS.length; i++) {
      const [q, r] = F.HEX_COORDS[i];
      const b = btn('hex', '', () => {
        const s = this.st();
        if (A.placeNebula(s, i, this.brush)) {
          emit('nebula-placed');
        } else {
          // nie still scheitern: Kostenzeile blitzt rot (zu teuer / gleicher Typ)
          this.cellCost.classList.remove('flash-error');
          void this.cellCost.offsetWidth;
          this.cellCost.classList.add('flash-error');
        }
        this.update(s, M(s));  // sofortiger Resync — 10-Hz-Loop ist zu langsam für Doppelklicks
      });
      b.style.left = `${50 + (q + r / 2) * 16.5}%`;
      b.style.top = `${50 + r * 17}%`;
      this.hexBtns.push(b);
      grid.append(b);
    }
    this.root.append(grid, this.cellCost, this.remCounts);

    this.root.append(el('h3', '', t('nova.challenges')), el('div', 'sub', t('nova.chHow')));
    for (let c = 0; c < C.CHALLENGE_COUNT; c++) {
      const row = el('div', 'row ch-row');
      const info = el('div', 'gen-info');
      info.append(el('div', 'gen-name', t(`ch.${c}`)), el('div', 'sub', t(`ch.${c}d`)),
        el('div', 'sub', `${t('misc.goal')}: ${fmt(D(C.IGNITION_REQ).mul(C.CH_GOAL_MULT[c]), true)} ${t('dust.name')}`),
        el('div', 'sub reward', `${t('misc.reward')}: ${t(`ch.${c}r`)}`));
      const status = el('div', 'ch-status');
      const enter = btn('buy', t('nova.chEnter'), () => {
        const s = this.st();
        if (s.nova.challenge === c) A.exitChallenge(s);
        else if (s.nova.challenge === -1) A.enterChallenge(s, c);
      });
      attachTip(enter, () => {
        const s = this.st();
        if (s.nova.completed[c]) return { title: '✓ ' + t(`ch.${c}`), body: t('nova.chDone') };
        return s.stats.supernovae < C.CH_UNLOCK_NOVAE(c)
          ? { title: '🔒 ' + t(`ch.${c}`), body: t('nova.chLockedInfo', { v: C.CH_UNLOCK_NOVAE(c), c: s.stats.supernovae }) }
          : { title: t(`ch.${c}`), body: t('nova.chGoal') };
      });
      row.append(info, status, enter);
      this.chRows.push({ row, enter, status });
      this.root.append(row);
    }

    // Auto-Ignite: kein Schwellwert-Feld — zündet immer am goldenen Cap-Punkt
    this.autoRow = el('div', 'row auto-row');
    this.autoChk = el('input') as HTMLInputElement;
    this.autoChk.type = 'checkbox';
    this.autoChk.addEventListener('change', () => { this.st().nova.autoIgnite.on = this.autoChk.checked; });
    const label = el('label', '', t('nova.autoIgnite'));
    label.prepend(this.autoChk);
    attachTip(label, () => ({
      title: t('nova.autoIgnite'),
      body: t('nova.autoIgniteTip', { v: C.PLASMA_CLAMP_MULT + 1 }),
    }));
    this.autoRow.append(label);
    this.root.append(this.autoRow, this.autoLock);

    this.ms = milestoneSection('ms.gal', C.MS_GALAXY, 'ms.u.gal', s => s.stats.coalescences);
    this.root.append(this.ms.root);
    this.syncBrush();
  }
  private ms!: ReturnType<typeof milestoneSection>;

  private syncBrush(): void {
    this.brushBtns.forEach((b, i) => setClass(b, 'active', this.brush === ([1, 2, 3] as NebulaCell[])[i]));
  }

  update(s: GameState, _m: F.Mults): void {
    const sci = s.settings.sciNotation;
    const cellCost = F.nebulaCellCost(s);
    const affordable = s.nova.shards.gte(cellCost);
    setText(this.cellCost, `${t('misc.cost')}: ${fmt(cellCost, sci)} ${t('nova.shards')}`);
    for (let i = 0; i < this.hexBtns.length; i++) {
      const b = this.hexBtns[i];
      const type = s.nova.cells[i];
      setClass(b, 'hex-1', type === 1);
      setClass(b, 'hex-2', type === 2);
      setClass(b, 'hex-3', type === 3);
      // leere Zellen zeigen '+', wenn platzierbar; tote Klicks gibt es nicht mehr:
      // nicht leistbar oder schon gleicher Typ → sichtbar disabled
      setText(b, type === 0 && affordable ? '+' : '');
      setDisabled(b, !affordable || type === this.brush);
    }
    setText(this.remCounts,
      `${t('nova.rem0')}: ${s.nova.remnants[0]} · ${t('nova.rem1')}: ${s.nova.remnants[1]} · ${t('nova.rem2')}: ${s.nova.remnants[2]}`);

    for (let c = 0; c < C.CHALLENGE_COUNT; c++) {
      const r = this.chRows[c];
      const active = s.nova.challenge === c;
      const locked = s.stats.supernovae < C.CH_UNLOCK_NOVAE(c);
      setClass(r.row, 'active', active);
      setClass(r.row, 'locked', locked && !s.nova.completed[c]);
      setClass(r.row, 'completed', s.nova.completed[c]);
      setText(r.status, s.nova.completed[c] ? '✓' : active ? t('misc.active')
        : locked ? `🔒 ${s.stats.supernovae}/${C.CH_UNLOCK_NOVAE(c)}` : '');
      setText(r.enter, active ? t('nova.chExit') : t('nova.chEnter'));
      setDisabled(r.enter, locked || (!active && s.nova.challenge !== -1));
    }

    const autoOk = F.autoIgniteUnlocked(s);
    setVisible(this.autoRow, autoOk);
    setVisible(this.autoLock, !autoOk);
    setText(this.autoLock, t('nova.autoIgniteLock'));
    if (this.autoChk.checked !== s.nova.autoIgnite.on) this.autoChk.checked = s.nova.autoIgnite.on;
    this.ms.update(s);
  }
}

// ═══════════════ Ebene 3: Galaxy ═══════════════
export class GalaxyPanel implements Panel {
  root = el('div');
  private coalesceBox: HTMLElement;
  private coalBar = bar('bar-gal');
  private coalLabel = el('div', 'sub center');
  private coalBtn: HTMLButtonElement;
  private gtSeg: HTMLElement;
  private gtBtns: HTMLButtonElement[] = [];
  private nodeBtns: { b: HTMLButtonElement; cost: HTMLElement }[] = [];
  private autoRow: HTMLElement;
  private autoChk: HTMLInputElement;
  private autoLockNote = el('div', 'sub center');

  constructor(private st: St, private hud: Hud) {
    this.coalesceBox = el('div', 'reset-box gal');
    this.coalesceBox.append(this.coalBar.wrap, this.coalLabel, el('div', 'sub center', t('galaxy.type')));
    attachTip(this.coalLabel, () => {
      const s = this.st();
      const capped = F.isGainCapped(F.dmGain(s, M(s)), s.galaxy.totalDM);
      return capped
        ? { title: '⚠ ' + t('cap.title'), body: t('cap.body', { v: C.GAIN_CLAMP_MULT + 1 }) }
        : { title: t('cap.title'), body: t('cap.hint', { v: C.GAIN_CLAMP_MULT + 1 }) };
    });
    this.gtSeg = el('div', 'seg');
    for (let g = 0; g < 3; g++) {
      const b = btn('seg-btn', t(`galaxy.t${g}`), () => { this.st().ui.nextGtype = g as GalaxyType; });
      attachTip(b, () => ({ title: t(`galaxy.t${g}`), body: t(`galaxy.t${g}d`) }));
      this.gtBtns.push(b);
      this.gtSeg.append(b);
    }
    this.coalBtn = btn('reset-btn gal', t('galaxy.go'), () => {
      const s = this.st();
      const doIt = () => {
        if (A.doCoalesce(s, s.ui.nextGtype)) {
          emit('coalesce');
          if (s.settings.autoTab) this.hud.selectTab('galaxy');
        }
      };
      if (s.stats.coalescences === 0) this.hud.confirm(t('galaxy.go'), t('galaxy.confirm'), doIt);
      else doIt();
    });
    this.coalesceBox.append(this.gtSeg, this.coalBtn);
    this.root.append(this.coalesceBox);

    this.root.append(el('h3', '', t('galaxy.tree')));
    const tree = el('div', 'tree');
    for (let b = 0; b < 3; b++) {
      const col = el('div', 'tree-col');
      col.append(el('div', `branch-name branch-${b}`, t(`galaxy.branch${b}`)));
      for (let i = 0; i < 15; i++) {
        const idx = b * 15 + i;
        const cost = el('span', 'cost');
        const nb = btn('node-btn', '', () => {
          const s = this.st();
          if (A.buyNode(s, idx)) emit('node-bought');
        });
        nb.append(el('div', 'sub', nodeLabel(idx)), cost);
        attachTip(nb, () => ({
          title: `${t(`galaxy.branch${b}`)} ${i + 1}/15`,
          body: `${nodeLabel(idx)} · ${t('misc.cost')}: ${fmtInt(F.nodeCost(idx))} ◈`,
        }));
        this.nodeBtns.push({ b: nb, cost });
        col.append(nb);
      }
      tree.append(col);
    }
    this.root.append(tree);

    this.autoRow = el('div', 'row auto-row');
    this.autoChk = el('input') as HTMLInputElement;
    this.autoChk.type = 'checkbox';
    this.autoChk.addEventListener('change', () => { this.st().galaxy.autoNova.on = this.autoChk.checked; });
    const label = el('label', '', t('galaxy.autoNova'));
    label.prepend(this.autoChk);
    this.autoRow.append(label);
    this.root.append(this.autoRow, this.autoLockNote);

    this.ms = milestoneSection('ms.col', C.MS_COLLAPSE, 'ms.u.col', s => s.stats.collapses);
    this.root.append(this.ms.root);
  }
  private ms!: ReturnType<typeof milestoneSection>;

  update(s: GameState, m: F.Mults): void {
    const sci = s.settings.sciNotation;
    const coalReq = F.coalesceReq(s);
    setBar(this.coalBar, logFrac(s.nova.totalShards, coalReq));
    const gain = F.dmGain(s, m);
    if (F.canCoalesce(s)) {
      setText(this.coalLabel, t('galaxy.gain', { v: fmt(gain, sci) }));
      setDisabled(this.coalBtn, s.nova.challenge !== -1);
    } else {
      setText(this.coalLabel, t('galaxy.req', { v: fmt(coalReq, true) }));
      setDisabled(this.coalBtn, true);
    }
    setClass(this.coalLabel, 'capped', F.canCoalesce(s) && F.isGainCapped(gain, s.galaxy.totalDM));
    this.gtBtns.forEach((b, g) => setClass(b, 'active', s.ui.nextGtype === g));

    for (let i = 0; i < C.CONSTELLATION_NODES; i++) {
      const nb = this.nodeBtns[i];
      const bought = s.galaxy.nodes[i];
      const avail = F.nodeAvailable(s, i);
      setClass(nb.b, 'bought', bought);
      setText(nb.cost, bought ? '✓' : `${fmt(F.nodeCost(i), sci)} ◈`);
      setDisabled(nb.b, bought || !avail || s.galaxy.dm.lt(F.nodeCost(i)));
    }
    const unlocked = m.autoNovaUnlocked;
    setVisible(this.autoRow, unlocked);
    setVisible(this.autoLockNote, !unlocked);
    setText(this.autoLockNote, t('galaxy.autoNovaLock'));
    if (this.autoChk.checked !== s.galaxy.autoNova.on) this.autoChk.checked = s.galaxy.autoNova.on;
    this.ms.update(s);
  }
}

/** Meilenstein-Liste einer Ebene: ○/✓ je Schwelle, grau bis erreicht */
function milestoneSection(prefix: string, thresholds: number[], unitKey: string, count: (s: GameState) => number) {
  const root = el('div', 'ms-box');
  root.append(el('h3', '', t('ms.title')));
  const rows = thresholds.map((at, i) => {
    const row = el('div', 'ms-row');
    const icon = el('span', 'ms-icon', '○');
    row.append(icon, el('span', '', `${at}× ${t(unitKey)} — ${t(`${prefix}${i}`)}`));
    root.append(row);
    return { row, icon, at };
  });
  return {
    root,
    update(s: GameState): void {
      const c = count(s);
      for (const r of rows) {
        setClass(r.row, 'done', c >= r.at);
        setText(r.icon, c >= r.at ? '✓' : '○');
      }
    },
  };
}

function nodeLabel(i: number): string {
  const e = F.NODE_EFFECTS[i];
  const v = 'v' in e ? fmtMult(e.v as number) : '';
  return t(`node.${e.t}`, { v });
}

// ═══════════════ Ebene 4: Singularity ═══════════════
export class SingPanel implements Panel {
  root = el('div');
  private collapseBox: HTMLElement;
  private colBar = bar('bar-sing');
  private colLabel = el('div', 'sub center');
  private colBtn: HTMLButtonElement;
  private feedBtn: HTMLButtonElement;
  private feedInfo = el('div', 'sub center');
  private dilateBtn: HTMLButtonElement;
  private dilateInfo = el('div', 'sub center');
  private perkBtns: { b: HTMLButtonElement; lvl: HTMLElement; cost: HTMLElement }[] = [];
  private endBox: HTMLElement;
  private endBar = bar('bar-end');
  private endBtn: HTMLButtonElement;
  private uniLabel = el('div', 'sub center');

  constructor(private st: St, private hud: Hud) {
    this.collapseBox = el('div', 'reset-box sing');
    this.collapseBox.append(this.colBar.wrap, this.colLabel);
    attachTip(this.colLabel, () => {
      const s = this.st();
      const capped = F.isGainCapped(F.entropyGain(s, M(s)), s.sing.totalEntropy);
      return capped
        ? { title: '⚠ ' + t('cap.title'), body: t('cap.body', { v: C.GAIN_CLAMP_MULT + 1 }) }
        : { title: t('cap.title'), body: t('cap.hint', { v: C.GAIN_CLAMP_MULT + 1 }) };
    });
    this.colBtn = btn('reset-btn sing', t('sing.go'), () => {
      const s = this.st();
      const doIt = () => {
        if (A.doCollapse(s)) {
          emit('collapse');
          if (s.settings.autoTab) this.hud.selectTab('sing');
        }
      };
      if (s.stats.collapses === 0) this.hud.confirm(t('sing.go'), t('sing.confirm'), doIt);
      else doIt();
    });
    this.collapseBox.append(this.colBtn);
    this.root.append(this.collapseBox, this.uniLabel);

    this.feedBtn = btn('reset-btn feed', t('sing.feed'), () => {
      const s = this.st();
      if (A.feedBlackHole(s)) emit('feed');
    });
    this.root.append(el('div', 'sub', t('sing.feedDesc')), this.feedBtn, this.feedInfo);

    this.dilateBtn = btn('reset-btn dilate', t('sing.dilate'), () => {
      const s = this.st();
      if (A.activateDilation(s)) emit('dilate');
    });
    this.root.append(this.dilateBtn, this.dilateInfo);

    this.root.append(el('h3', '', t('sing.perks')));
    for (let p = 0; p < C.PERK_COUNT; p++) {
      const row = el('div', 'row');
      const info = el('div', 'gen-info');
      info.append(el('div', 'gen-name', t(`perk.${p}`)), el('div', 'sub', t(`perk.${p}d`)));
      const lvl = el('span', 'lvl');
      const cost = el('span', 'cost');
      const b = btn('buy', '↑', () => {
        const s = this.st();
        if (A.buyPerk(s, p)) emit('buy');
      });
      b.append(lvl, cost);
      row.append(info, b);
      this.perkBtns.push({ b, lvl, cost });
      this.root.append(row);
    }

    this.endBox = el('div', 'reset-box end');
    this.endBox.append(el('h3', '', t('sing.endgame')), this.endBar.wrap);
    this.endBtn = btn('reset-btn end', t('sing.endgame'), () => {
      const s = this.st();
      this.hud.confirm(t('sing.endgame'), t('sing.endgameConfirm'), () => {
        if (A.newUniverse(s)) {
          emit('universe');
          if (s.settings.autoTab) this.hud.selectTab('dust');
        }
      });
    });
    this.endBox.append(el('div', 'sub center', t('sing.endgameReq', { v: fmt(D(C.ENDGAME_ENTROPY), true) })), this.endBtn);
    this.root.append(this.endBox);
  }

  update(s: GameState, m: F.Mults): void {
    const sci = s.settings.sciNotation;
    const colReq = F.collapseReq(s);
    setBar(this.colBar, logFrac(s.galaxy.totalDM, colReq));
    const gain = F.entropyGain(s, m);
    if (F.canCollapse(s)) {
      setText(this.colLabel, t('sing.gain', { v: fmt(gain, sci) }));
      setDisabled(this.colBtn, s.nova.challenge !== -1);
    } else {
      setText(this.colLabel, t('sing.req', { v: fmt(colReq, true) }));
      setDisabled(this.colBtn, true);
    }
    setClass(this.colLabel, 'capped', F.canCollapse(s) && F.isGainCapped(gain, s.sing.totalEntropy));
    setText(this.uniLabel, s.sing.universes > 0 ? t('sing.universes', { v: String(s.sing.universes + 1) }) : '');

    const mass = F.feedMass(s);
    setDisabled(this.feedBtn, mass.lte(0) || !s.sing.unlocked);
    const acc = s.sing.fed.gt(0) ? s.sing.fed.add(1).log10().add(1).pow(C.FEED_ACCRETION_EXP) : D(1);
    setText(this.feedInfo, `${t('sing.fed', { v: fmt(s.sing.fed, sci) })} · ${t('sing.accretion', { v: fmt(acc, sci) })} · +${fmt(mass, sci)}`);

    const d = s.sing.dilation;
    setDisabled(this.dilateBtn, d.active || d.cd > 0 || !s.sing.unlocked);
    setText(this.dilateInfo, d.active ? `×${C.DILATION_MULT} — ${fmtTime(d.left)}`
      : d.cd > 0 ? t('sing.dilateCd', { v: fmtTime(d.cd) }) : t('sing.dilateDesc'));

    for (let p = 0; p < C.PERK_COUNT; p++) {
      const pb = this.perkBtns[p];
      const atMax = p === 8 && s.sing.perks[8] >= C.STELLAR_MEMORY_MAX;
      setText(pb.lvl, ` ${t('misc.level')}${s.sing.perks[p]} `);
      setText(pb.cost, atMax ? 'MAX' : fmt(F.perkCost(s, p), sci));
      setDisabled(pb.b, atMax || s.sing.entropy.lt(F.perkCost(s, p)));
    }

    setVisible(this.endBox, s.sing.totalEntropy.gte(C.ENDGAME_ENTROPY / 5) || s.sing.endgame);
    setBar(this.endBar, logFrac(s.sing.totalEntropy, C.ENDGAME_ENTROPY));
    setDisabled(this.endBtn, s.sing.totalEntropy.lt(C.ENDGAME_ENTROPY));
  }
}

// ═══════════════ Achievements ═══════════════
export class AchPanel implements Panel {
  root = el('div');
  private cells: HTMLElement[] = [];
  private bonus = el('div', 'sub center');

  constructor() {
    this.root.append(el('h3', '', t('ach.title')), this.bonus);
    const grid = el('div', 'ach-grid');
    for (let i = 0; i < ACH_COUNT; i++) {
      const c = el('div', 'ach-cell', '?');
      // Achievement-Zellen zeigen selbst schon '?' — kein zusätzliches Eck-Icon
      attachTip(c, () => ({
        title: `${this.cells[i].classList.contains('got') ? '★' : '·'} #${i + 1}`,
        body: achLabel(i),
      }), { marker: false });
      this.cells.push(c);
      grid.append(c);
    }
    this.root.append(grid);
  }

  update(s: GameState, _m: F.Mults): void {
    let n = 0;
    for (let i = 0; i < ACH_COUNT; i++) {
      const got = s.achievements[i];
      if (got) n++;
      setClass(this.cells[i], 'got', got);
      setText(this.cells[i], got ? '★' : '?');
    }
    setText(this.bonus, t('ach.bonus', { v: Math.pow(C.ACH_MULT, n).toFixed(2) }));
  }
}

// ═══════════════ Journal ═══════════════
export class JournalPanel implements Panel {
  root = el('div');
  private entries: HTMLElement[] = [];

  constructor() {
    this.root.append(el('h3', '', t('journal.title')));
    for (let i = 0; i < 32; i++) {
      const e = el('div', 'journal-entry locked', t('journal.locked'));
      this.entries.push(e);
      this.root.append(e);
    }
  }

  update(s: GameState, _m: F.Mults): void {
    for (let i = 0; i < 32; i++) {
      const seen = s.loreSeen[i];
      setClass(this.entries[i], 'locked', !seen);
      setText(this.entries[i], seen ? t(`lore.${i}`) : t('journal.locked'));
    }
  }
}

// ═══════════════ Settings ═══════════════
export class SettingsPanel implements Panel {
  root = el('div');
  private statEls: Record<string, HTMLElement> = {};
  onLangChange: (() => void) | null = null;

  constructor(private st: St, private hud: Hud) { this.build(); }

  private build(): void {
    this.root.innerHTML = '';
    const s = this.st();
    const selRow = (label: string, options: [string, string][], value: string, onChange: (v: string) => void) => {
      const row = el('div', 'row set-row');
      row.append(el('label', '', label));
      const sel = el('select') as HTMLSelectElement;
      for (const [v, txt] of options) {
        const o = el('option', '', txt) as HTMLOptionElement;
        o.value = v;
        sel.append(o);
      }
      sel.value = value;
      sel.addEventListener('change', () => onChange(sel.value));
      row.append(sel);
      this.root.append(row);
    };
    const chkRow = (label: string, value: boolean, onChange: (v: boolean) => void) => {
      const row = el('div', 'row set-row');
      const chk = el('input') as HTMLInputElement;
      chk.type = 'checkbox';
      chk.checked = value;
      chk.addEventListener('change', () => onChange(chk.checked));
      const lb = el('label', '', label);
      lb.prepend(chk);
      row.append(lb);
      this.root.append(row);
    };
    const sldRow = (label: string, value: number, onChange: (v: number) => void) => {
      const row = el('div', 'row set-row');
      row.append(el('label', '', label));
      const sl = el('input') as HTMLInputElement;
      sl.type = 'range';
      sl.min = '0'; sl.max = '1'; sl.step = '0.05';
      sl.value = String(value);
      sl.addEventListener('input', () => onChange(Number(sl.value)));
      row.append(sl);
      this.root.append(row);
    };

    selRow(t('set.language'), [['en', 'English'], ['de', 'Deutsch']], getLang(), v => {
      const st = this.st();
      st.lang = v as 'en' | 'de';
      setLang(st.lang);
      this.build();
      this.hud.relabel();
      this.onLangChange?.();
    });
    sldRow(t('set.sound'), s.settings.sfx, v => { this.st().settings.sfx = v; });
    sldRow(t('set.music'), s.settings.music, v => { this.st().settings.music = v; });
    selRow(t('set.quality'), [['0', t('set.q0')], ['1', t('set.q1')], ['2', t('set.q2')], ['3', t('set.q3')]],
      String(s.settings.quality), v => { this.st().settings.quality = Number(v) as 0 | 1 | 2 | 3; });
    chkRow(t('set.notation'), s.settings.sciNotation, v => { this.st().settings.sciNotation = v; });
    chkRow(t('set.confirmResets'), s.settings.confirmResets, v => { this.st().settings.confirmResets = v; });
    chkRow(t('set.autoTab'), s.settings.autoTab, v => { this.st().settings.autoTab = v; });

    const saveRow = el('div', 'row set-row');
    saveRow.append(
      btn('buy', t('set.save'), () => { saveGame(this.st()); this.hud.toast('💾', t('set.saved')); }),
      btn('buy', t('set.export'), async () => {
        try {
          await navigator.clipboard.writeText(exportSave(this.st()));
          this.hud.toast('📋', t('set.exported'));
        } catch {
          prompt('Copy:', exportSave(this.st()));
        }
      }),
      btn('buy', t('set.import'), () => {
        const str = prompt(t('set.importPrompt'));
        if (!str) return;
        const imported = importSave(str);
        if (imported) { this.hud.toast('✓', t('set.importOk')); this.onImport?.(imported); }
        else this.hud.toast('✗', t('set.importErr'));
      }),
    );
    this.root.append(saveRow);
    this.root.append(btn('danger', t('set.reset'), () => {
      if (prompt(t('set.resetConfirm')) === 'YES') hardReset();
    }));

    this.root.append(el('h3', '', t('set.stats')));
    for (const k of ['played', 'clicks', 'comets', 'ignitions', 'supernovae', 'coalescences', 'collapses', 'dustEver']) {
      const row = el('div', 'row stat-row');
      row.append(el('span', 'sub', t(`stat.${k}`)));
      const v = el('span', '');
      this.statEls[k] = v;
      row.append(v);
      this.root.append(row);
    }
    this.root.append(el('div', 'sub center version', `v${__APP_VERSION__}`));
    this.root.append(el('div', 'sub center credits', 'Music: Kevin MacLeod (incompetech.com) · CC BY 4.0'));
  }

  onImport: ((s: GameState) => void) | null = null;

  update(s: GameState, _m: F.Mults): void {
    const st = s.stats;
    setText(this.statEls.played, fmtTime(st.played));
    setText(this.statEls.clicks, String(st.clicks));
    setText(this.statEls.comets, String(st.comets));
    setText(this.statEls.ignitions, String(st.ignitions));
    setText(this.statEls.supernovae, String(st.supernovae));
    setText(this.statEls.coalescences, String(st.coalescences));
    setText(this.statEls.collapses, String(st.collapses));
    setText(this.statEls.dustEver, fmt(st.totalDustEver, s.settings.sciNotation));
  }
}
