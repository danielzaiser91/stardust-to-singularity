import { el, btn, setText, setVisible, setReserve, setDisabled, setClass } from './dom';
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

/** Gemeinsamer Gain-Deckel-Tooltip: Erklärung · aktueller Deckelwert · Währung bis zum Deckel. */
function capTipBody(
  s: GameState, m: F.Mults, total: Decimal, clampMult: number, isCapped: boolean,
  layer: 'ignite' | 'nova' | 'coalesce' | 'collapse', unitKey: string,
): { title: string; body: string } {
  const sci = s.settings.sciNotation;
  const max = t('cap.max', { v: fmt(F.gainCapBound(total, clampMult), sci) });
  let body = `${t(isCapped ? 'cap.body' : 'cap.hint', { v: clampMult + 1 })}\n${max}`;
  if (!isCapped) {
    const need = F.currencyForCap(s, m, layer);
    if (need) body += `\n${t('cap.need', { c: fmt(need.target, sci), u: t(unitKey), v: fmt(need.current, sci) })}`;
  }
  return { title: (isCapped ? '⚠ ' : '') + t('cap.title'), body };
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
  private rowHigh = -1;   // höchste je gezeigte Generator-Stufe: reserviert Höhe, damit das Panel nicht springt
  private igniteBox: HTMLElement;
  private igniteBar = bar('bar-hot');
  private igniteLabel = el('div', 'sub center');
  private igniteBtn: HTMLButtonElement;
  private autoBtn!: HTMLButtonElement;
  private classSeg: HTMLElement;
  private classBtns: HTMLButtonElement[] = [];
  private cometNote = el('div', 'comet-note');
  /** Nachleuchte je Reihe: bei schnellen Auto-Zündungen flackern Reihen sonst weg und wieder her */

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
      return capTipBody(s, m, s.star.totalPlasma, C.PLASMA_CLAMP_MULT, capped, 'ignite', 'dust.name');
    });
    this.classSeg = el('div', 'seg');
    for (let c = 0; c < 3; c++) {
      const b = btn('seg-btn', t(`star.class${c}`), () => { this.st().ui.nextClass = c as StarClass; });
      attachTip(b, () => {
        const s = this.st();
        const cls = C.STAR_CLASSES[c];
        const active = s.star.unlocked && s.star.cls === c;
        return {
          title: t(`star.class${c}`),
          body: `${t(`star.class${c}d`)}\n${t('star.classEff', { s: fmtMult(cls.speed), p: fmtMult(cls.plasmaGain) })}`
            + `${active ? `\n${t('star.classActive')}` : ''}`,
        };
      });
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
    // Auto-Zündung direkt neben dem Zünden-Button (Toggle; gesperrt bis Meilenstein)
    this.autoBtn = btn('seg-btn auto-btn', t('nova.autoIgnite'), () => {
      const s = this.st();
      if (!F.autoIgniteUnlocked(s)) return;
      s.nova.autoIgnite.on = !s.nova.autoIgnite.on;
      this.update(s, M(s));
    });
    attachTip(this.autoBtn, () => {
      const s = this.st();
      return {
        title: t('nova.autoIgnite'),
        body: F.autoIgniteUnlocked(s)
          ? t('nova.autoIgniteTip', { v: C.PLASMA_CLAMP_MULT + 1 })
          : t('nova.autoIgniteLock'),
      };
    });
    const ignRow = el('div', 'ignite-row');
    ignRow.append(this.igniteBtn, this.autoBtn);
    this.igniteBox.append(this.classSeg, ignRow);
    this.root.append(this.igniteBox);

    this.ms = milestoneSection(
      [t('ms.ign0'), t('ms.ign1'), t('ms.ign2')],
      C.MS_IGNITION, 'ms.u.ign', s => s.stats.ignMs);
    this.root.append(this.ms.root);

    // Spezial-Meilensteine (ab 3 Kollapsen): je 100 Käufe einer Generator-Stufe → Output ×3
    this.smsBox = el('div', 'ms-box');
    const smsHead = el('h3', '', t('sms.title'));
    attachTip(smsHead, () => ({ title: t('sms.title'), body: t('sms.dustDesc', { s: C.SPECIAL_GEN_STEP, m: C.SPECIAL_GEN_MULT }) }));
    this.smsBox.append(smsHead, el('div', 'sub', t('sms.dustDesc', { s: C.SPECIAL_GEN_STEP, m: C.SPECIAL_GEN_MULT })));
    this.smsLine = el('div', 'sub', '');
    this.smsBox.append(this.smsLine);
    this.root.append(this.smsBox);
  }
  private smsBox!: HTMLElement;
  private smsLine!: HTMLElement;
  private ms!: ReturnType<typeof milestoneSection>;

  update(s: GameState, m: F.Mults): void {
    const sci = s.settings.sciNotation;
    setText(this.clickVal, `+${fmt(F.clickAmount(s, m), sci)}`);
    setReserve(this.cometNote, s.dust.comet.active || s.dust.comet.boost > 0);
    setText(this.cometNote, s.dust.comet.active ? '☄ ' + t('dust.comet')
      : t('dust.cometBoost', { v: fmtMult(m.cometBoostMult), t: Math.ceil(s.dust.comet.boost) }));

    // Max-Buttons sind eine Belohnung der ersten Ignition (dieser Galaxie)
    const maxUnlocked = s.stats.ignMs >= C.MS_IGNITION[0];
    setReserve(this.compRow, s.nova.challenge !== 0);
    setReserve(this.compMax, maxUnlocked);
    setText(this.compCost, fmt(F.compressionCost(s), sci));
    setText(this.compEff, `${s.dust.compression} × | ${t('dust.compressionDesc', { v: m.compressionEffect.toFixed(2) })}`);
    setDisabled(this.compRow.querySelector('button')!, s.dust.amount.lt(F.compressionCost(s)));

    const top = F.maxTier(s);
    for (let i = 0; i < C.GEN_COUNT; i++) {
      const r = this.genRows[i];
      const g = s.dust.gens[i];
      // Direkt an den Zustand gekoppelt — die Auto-Zündung resettet seit dem Trickle
      // nichts mehr, die frühere 5-s-Nachleuchte machte das Panel nur träge
      const visible = i < top && (i === 0 || s.dust.gens[i - 1].bought > 0 || g.bought > 0);
      if (visible) this.rowHigh = Math.max(this.rowHigh, i);
      // Einmal gezeigte Zeilen behalten ihren Platz (visibility statt display) — so springt
      // das Panel bei Resets nicht in der Höhe und Buttons bleiben unter dem Cursor.
      const reserved = !visible && i < top && i <= this.rowHigh;
      r.row.style.display = (visible || reserved) ? '' : 'none';
      setClass(r.row, 'row-reserved', reserved);
      if (!visible) continue;
      setText(r.owned, `${fmtInt(g.amount)} (${g.bought})`);
      const prod = g.amount.mul(F.tierMult(s, m, i)).mul(i === 0 ? m.dustMult : D(1));
      setText(r.rate, `+${fmt(prod, sci)}${t('unit.perSec')} ${i === 0 ? t('dust.name') : t(`gen.${i - 1}`)}`);
      setText(r.c1, fmt(F.genCost(s, m, i, 1), sci));
      setDisabled(r.b1, s.dust.amount.lt(F.genCost(s, m, i, 1)));
      setReserve(r.bm, maxUnlocked);
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
        setDisabled(this.igniteBtn, gain.lte(0));
      } else {
        setText(this.igniteLabel, t('star.igniteReq', { v: fmt(req, true) }));
        setDisabled(this.igniteBtn, true);
      }
      setClass(this.igniteLabel, 'capped',
        F.canIgnite(s) && F.isGainCapped(gain, s.star.totalPlasma, C.PLASMA_CLAMP_MULT));
      setReserve(this.classSeg, s.stats.ignMs >= C.MS_IGNITION[1]);
      this.classBtns.forEach((b, c) => setClass(b, 'active', s.ui.nextClass === c));
      setReserve(this.autoBtn, s.nova.unlocked);
      const autoOk = F.autoIgniteUnlocked(s);
      setClass(this.autoBtn, 'dim', !autoOk);
      setClass(this.autoBtn, 'active', autoOk && s.nova.autoIgnite.on);
    }
    setVisible(this.smsBox, s.stats.collapses >= C.MS_COLLAPSE[2]);
    if (s.stats.collapses >= C.MS_COLLAPSE[2]) {
      const parts: string[] = [];
      for (let i = 0; i < C.GEN_COUNT; i++) {
        const steps = Math.floor(s.dust.gens[i].bought / C.SPECIAL_GEN_STEP);
        if (steps > 0) parts.push(`#${i + 1} ×${fmt(D(C.SPECIAL_GEN_MULT).pow(steps), sci)}`);
      }
      setText(this.smsLine, parts.length ? parts.join(' · ') : t('sms.dustNone'));
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
      const m = M(s);
      const capped = F.isGainCapped(F.shardGain(s, m), s.nova.totalShards);
      return capTipBody(s, m, s.nova.totalShards, C.GAIN_CLAMP_MULT, capped, 'nova', 'el.5');
    });
    this.remSeg = el('div', 'seg');
    for (let r = 0; r < 3; r++) {
      const b = btn('seg-btn', t(`nova.rem${r}`), () => { this.st().ui.nextRemnant = r as 0 | 1 | 2; });
      attachTip(b, () => {
        const s = this.st();
        const n = s.nova.remnants[r];
        const rp = F.remnantParams(s);
        const sci = s.settings.sciNotation;
        // aktueller Gesamteffekt bei n bzw. n+1 Stück (Remnants stapeln — Vorschau hilft der Wahl)
        const effAt = (k: number) => r === 0 ? fmt(D(rp.neutronBase).pow(k), sci)
          : r === 1 ? fmtMult(k > 0 ? C.REMNANT_PULSAR_MULT + rp.pulsarPer * (k - 1) : 1)
          : fmtMult(1 + rp.bhPer * k);
        const v = effAt(n);
        const tier = F.remnantTier(s, r as 0 | 1 | 2);
        const sms = s.stats.collapses >= C.MS_COLLAPSE[1]
          ? `\n${t('sms.tier', { t: tier, c: n, n: (tier + 1) * C.SPECIAL_REMNANT_STEP })}` : '';
        return {
          title: t(`nova.rem${r}`),
          body: `${t(`nova.rem${r}d`)}\n${t(`nova.rem${r}b`, { n, v, p: C.REMNANT_PULSAR_PERIOD, d: rp.pulsarDur })}`
            + `\n${t('nova.remNext', { v: effAt(n + 1) })}${sms}`,
        };
      });
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

    this.ms = milestoneSection(
      [t('ms.nova0'), t('ms.nova1'),
        ...C.MS_NOVA_KEEP.map(id => id === -1
          ? t('ms.novaKeepAll')
          : t('ms.novaKeep', { v: t(`up.${id}`) }))],
      C.MS_NOVA, 'ms.u.nova', s => s.stats.novaMs);
    this.root.append(this.ms.root);

    // Spezial-Meilensteine (ab 2 Kollapsen): je 10 Remnants eines Typs → Effekt-Stufe
    this.smsBox = el('div', 'ms-box');
    const smsHead = el('h3', '', t('sms.title'));
    attachTip(smsHead, () => ({ title: t('sms.title'), body: t('sms.tip', { n: C.SPECIAL_REMNANT_STEP }) }));
    this.smsBox.append(smsHead);
    for (let rt = 0; rt < 3; rt++) {
      const row = el('div', 'ms-row');
      const txt = el('span', '', '');
      row.append(el('span', 'ms-icon', '✦'), txt);
      this.smsBox.append(row);
      this.smsRows.push(txt);
    }
    this.root.append(this.smsBox);
  }
  private smsBox!: HTMLElement;
  private smsRows: HTMLElement[] = [];
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
        // Reaktor-Max ist eine Belohnung der ersten Supernova (dieser Galaxie) — Platz reservieren
        setReserve(rb.bm, s.stats.novaMs >= C.MS_NOVA[0]);
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
      setDisabled(this.novaBtn, gain.lte(0));
    } else {
      setText(this.novaLabel, t('nova.req', { v: fmt(nReq, true) }));
      setDisabled(this.novaBtn, true);
    }
    setClass(this.novaLabel, 'capped', F.canSupernova(s) && F.isGainCapped(gain, s.nova.totalShards));
    this.remBtns.forEach((b, r) => {
      setClass(b, 'active', s.ui.nextRemnant === r);
      setText(b, `${t(`nova.rem${r}`)} (${s.nova.remnants[r]})`);
    });
    setVisible(this.smsBox, s.stats.collapses >= C.MS_COLLAPSE[1]);
    if (s.stats.collapses >= C.MS_COLLAPSE[1]) {
      const rp = F.remnantParams(s);
      const eff = [
        t('sms.rem0e', { v: fmtMult(rp.neutronBase) }),
        t('sms.rem1e', { v: fmtMult(rp.pulsarPer), d: rp.pulsarDur }),
        t('sms.rem2e', { v: fmtMult(rp.bhPer * 100) }),
      ];
      for (let rt = 0; rt < 3; rt++) {
        const tier = F.remnantTier(s, rt as 0 | 1 | 2);
        setText(this.smsRows[rt], `${t(`nova.rem${rt}`)} — ${t('sms.tier', {
          t: tier, c: s.nova.remnants[rt], n: (tier + 1) * C.SPECIAL_REMNANT_STEP,
        })} · ${eff[rt]}`);
      }
    }
    this.ms.update(s);
  }
}

// ═══════════════ Ebene 2: Supernova ═══════════════
export class NovaPanel implements Panel {
  root = el('div');
  private brush: NebulaCell = 1;
  private brushBtns: HTMLButtonElement[] = [];
  private hexBtns: HTMLButtonElement[] = [];
  private eraseBtn!: HTMLButtonElement;
  private tokenCost = el('div', 'sub token-cost');
  private tokenCostVal = el('span', 'token-cost-val', '');
  private gardenTotal = el('div', 'sub center');
  private chRows: {
    card: HTMLElement; statusIcon: HTMLElement; lockedLine: HTMLElement;
    toggle: HTMLElement; toggleBtns: [HTMLButtonElement, HTMLButtonElement];
    restrictLine: HTMLElement; goalLine: HTMLElement; rewardLine: HTMLElement;
    startBtn: HTMLButtonElement; viewTier: 1 | 2;
  }[] = [];
  private coalBar = bar('bar-gal');
  private coalLabel = el('div', 'sub center');
  private coalBtn!: HTMLButtonElement;
  private gtBtns: HTMLButtonElement[] = [];

  constructor(private st: St, private hud: Hud) {
    this.tokenCost.append(el('span', '', t('nova.nextToken') + ' '), this.tokenCostVal);
    attachTip(this.tokenCost, () => ({ title: t('nova.tokenTipT'), body: t('nova.tokenTip') }));
    this.root.append(el('h3', '', t('nova.nebula')), el('div', 'sub', t('nova.nebulaDesc')), this.tokenCost);
    const seg = el('div', 'seg');
    for (const b of [1, 2, 3] as NebulaCell[]) {
      const bb = btn('seg-btn', t(`nova.cell${b}`), () => { this.brush = b; this.syncBrush(); });
      attachTip(bb, () => ({
        title: t(`nova.cell${b}`),
        body: t(`nova.cell${b}d`) + (b === 2
          ? `\n${this.st().stats.coalescences >= C.MS_GALAXY[1]
            ? t('nova.reFeOn', { v: fmtMult(C.NEBULA_REFLECTION_MULT), n: C.MS_GALAXY[1] })
            : t('nova.reFeLocked', { v: fmtMult(C.NEBULA_REFLECTION_MULT), n: C.MS_GALAXY[1] })}`
          : ''),
      }));
      this.brushBtns.push(bb);
      seg.append(bb);
    }
    this.root.append(seg);

    // Hex-Grid als absolute Buttons — Abstände so gewählt, dass Bounding-Boxen
    // nicht überlappen (sonst schlucken Nachbarn die Klicks in den Eckbereichen)
    const grid = el('div', 'hexgrid');
    for (let i = 0; i < F.HEX_COORDS.length; i++) {
      const [q, r] = F.HEX_COORDS[i];
      const place = () => {
        const s = this.st();
        if (s.nova.cells[i] === this.brush) return;  // gleicher Typ / Radierer auf leer: nichts zu tun
        const ok = this.brush === 0 ? A.removeNebula(s, i) : A.placeNebula(s, i, this.brush);
        if (ok) {
          emit('nebula-placed');
        } else {
          // nie still scheitern: Kosten-Betrag schüttelt sich rot (zu teuer / kein Token)
          this.tokenCostVal.classList.remove('token-denied');
          void this.tokenCostVal.offsetWidth;
          this.tokenCostVal.classList.add('token-denied');
        }
        this.update(s, M(s));  // sofortiger Resync — 10-Hz-Loop ist zu langsam für Doppelklicks
      };
      // pointerdown statt click: click braucht mousedown+mouseup auf DEMSELBEN Element —
      // die :active-Animation verschiebt das Hex aber unterm Zeiger weg, mouseup landet
      // daneben und der Klick verpufft. pointerdown feuert sofort an der Druckposition.
      const b = el('button', 'hex', '') as HTMLButtonElement;
      b.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.stopPropagation();
        place();
      });
      b.addEventListener('click', e => {
        e.stopPropagation();
        if (e.detail === 0) place();  // Tastatur (Enter/Leertaste) feuert click ohne Pointer
      });
      b.style.left = `${50 + (q + r / 2) * 16.5}%`;
      b.style.top = `${50 + r * 17}%`;
      attachTip(b, () => {
        const s = this.st();
        const m = M(s);
        const type = s.nova.cells[i];
        if (type === 0) return { title: t('nova.hexEmpty'), body: t('nova.hexEmptyTip') };
        const bonus = fmtMult(C.NEBULA_DARK_BONUS);
        if (type === 3) {
          const boosted = F.HEX_NEIGHBORS[i].filter(n => s.nova.cells[n] === 1 || s.nova.cells[n] === 2).length;
          return { title: t('nova.cell3'), body: `${t('nova.cell3d')}\n${t('nova.hexDarkTip', { n: boosted, b: bonus })}` };
        }
        const darks = F.HEX_NEIGHBORS[i].filter(n => s.nova.cells[n] === 3).length;
        const v = fmtMult(F.nebulaCellMult(s, i, m.nebulaNodeMult));
        const feOn = s.stats.coalescences >= C.MS_GALAXY[1];
        return {
          title: t(`nova.cell${type}`),
          body: `${t(type === 1 ? 'nova.hexEmTip' : feOn ? 'nova.hexReTipFe' : 'nova.hexReTip', { v })}\n${t('nova.hexDarks', { n: darks, b: bonus })}`
            + (type === 2 && !feOn ? `\n${t('nova.reFeLocked', { n: C.MS_GALAXY[1] })}` : ''),
        };
      }, { marker: false });
      this.hexBtns.push(b);
      grid.append(b);
    }
    // Radierer: exklusiv wählbar mit den Nebel-Pinseln (brush 0 = entfernen)
    this.eraseBtn = btn('seg-btn icon-btn', '⌫', () => { this.brush = 0; this.syncBrush(); });
    attachTip(this.eraseBtn, () => ({ title: t('nova.erase'), body: t('nova.eraseTip') }));
    const respecBtn = btn('buy icon-btn', '↺', () => {
      const s = this.st();
      if (A.respecNebula(s)) this.update(s, M(s));
    });
    attachTip(respecBtn, () => ({ title: t('nova.respec'), body: t('nova.respecTip') }));
    const ctl = el('div', 'garden-ctl');
    ctl.append(this.eraseBtn, respecBtn);
    attachTip(this.gardenTotal, () => ({ title: t('nova.nebula'), body: t('nova.gardenTotalTip', { b: fmtMult(C.NEBULA_DARK_BONUS) }) }));
    this.root.append(ctl, grid, this.gardenTotal);

    this.root.append(el('h3', '', t('nova.challenges')), el('div', 'sub', t('nova.chHow')));
    for (let c = 0; c < C.CHALLENGE_COUNT; c++) {
      const card = el('div', 'ch-card');
      const head = el('div', 'ch-head');
      const statusIcon = el('div', 'ch-status-icon', '');
      head.append(el('div', 'ch-name', t(`ch.${c}`)), statusIcon);

      const lockedLine = el('div', 'ch-locked', '');

      const toggle = el('div', 'seg ch-toggle');
      const nBtn = btn('seg-btn', t('nova.chNormal'), () => { this.chRows[c].viewTier = 1; this.update(this.st(), M(this.st())); });
      const hBtn = btn('seg-btn', t('nova.chHard'), () => { this.chRows[c].viewTier = 2; this.update(this.st(), M(this.st())); });
      toggle.append(nBtn, hBtn);

      const restrictLine = el('div', 'ch-restrict', '');
      const goalLine = el('div', 'ch-goal', '');
      const rewardLine = el('div', 'ch-reward', '');

      const startBtn = btn('ch-start', '', () => {
        const s = this.st();
        if (s.nova.challenge === c) A.exitChallenge(s);
        else if (s.nova.challenge === -1) A.enterChallenge(s, c, this.chRows[c].viewTier);
      });

      card.append(head, lockedLine, toggle, restrictLine, goalLine, rewardLine, startBtn);
      this.chRows.push({ card, statusIcon, lockedLine, toggle, toggleBtns: [nBtn, hBtn], restrictLine, goalLine, rewardLine, startBtn, viewTier: 1 });
      this.root.append(card);
    }

    // Coalescence-Box lebt HIER (Ebene darunter) — der Galaxy-Tab existiert ja erst danach
    const coalesceBox = el('div', 'reset-box gal');
    coalesceBox.append(this.coalBar.wrap, this.coalLabel, el('div', 'sub center', t('galaxy.type')));
    attachTip(this.coalLabel, () => {
      const s = this.st();
      const m = M(s);
      const capped = F.isGainCapped(F.dmGain(s, m), s.galaxy.totalDM);
      return capTipBody(s, m, s.galaxy.totalDM, C.GAIN_CLAMP_MULT, capped, 'coalesce', 'nova.shards');
    });
    const gtSeg = el('div', 'seg');
    for (let g = 0; g < 3; g++) {
      const base = [C.GALAXY_TYPE_ALL, C.GALAXY_TYPE_OFFLINE, C.GALAXY_TYPE_ACTIVE][g];
      const effKey = ['galaxy.effAll', 'galaxy.effOffline', 'galaxy.effActive'][g];
      const b = btn('seg-btn', t(`galaxy.t${g}`), () => { this.st().ui.nextGtype = g as GalaxyType; });
      attachTip(b, () => {
        const s = this.st();
        const n = s.stats.gtypePicks[g];
        return {
          title: t(`galaxy.t${g}`),
          body: `${t(effKey, { v: fmtMult(base) })}\n${t('choice.pickedUni', { n })}`
            + `\n${t('galaxy.currentBonus', { v: fmtMult(Math.pow(base, n)) })}\n${t('nova.remNext', { v: fmtMult(Math.pow(base, n + 1)) })}`,
        };
      });
      this.gtBtns.push(b);
      gtSeg.append(b);
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
    coalesceBox.append(gtSeg, this.coalBtn);
    this.root.append(coalesceBox);

    this.ms = milestoneSection(
      [t('ms.gal0'), t('ms.gal1'), t('ms.gal2'), t('ms.galHard'), t('ms.gal3'), t('ms.gal4'), t('ms.gal5'), t('ms.gal6')],
      C.MS_GALAXY, 'ms.u.gal', s => s.stats.coalescences);
    this.root.append(this.ms.root);
    this.syncBrush();
  }
  private ms!: ReturnType<typeof milestoneSection>;

  private syncBrush(): void {
    this.brushBtns.forEach((b, i) => setClass(b, 'active', this.brush === ([1, 2, 3] as NebulaCell[])[i]));
    setClass(this.eraseBtn, 'active', this.brush === 0);
  }

  update(s: GameState, m: F.Mults): void {
    const sci = s.settings.sciNotation;
    const tokens = Math.min(s.nova.cellsBought, C.NEBULA_CELLS);
    const placed = s.nova.cells.filter(c => c !== 0).length;
    const freeToken = tokens - placed > 0;
    const nextCost = F.nebulaCellCost(s);
    const canBuyToken = tokens < C.NEBULA_CELLS && s.nova.shards.gte(nextCost);
    const maxed = tokens >= C.NEBULA_CELLS;
    setText(this.tokenCostVal, maxed ? t('nova.tokenMax') : `${fmt(nextCost, sci)} ✸`);
    setClass(this.tokenCostVal, 'affordable', !maxed && s.nova.shards.gte(nextCost));
    for (let i = 0; i < this.hexBtns.length; i++) {
      const b = this.hexBtns[i];
      const type = s.nova.cells[i];
      setClass(b, 'hex-1', type === 1);
      setClass(b, 'hex-2', type === 2);
      setClass(b, 'hex-3', type === 3);
      // leer: braucht freien/kaufbaren Token · belegt: Ersetzen ist gratis (nur gleicher Typ sinnlos)
      // Radierer (brush 0): nur belegte Zellen sind Ziele
      // .dim statt disabled: disabled Buttons feuern keine Hover-Events → keine Tooltips
      const usable = this.brush === 0 ? type !== 0
        : type === 0 ? (freeToken || canBuyToken) : type !== this.brush;
      setText(b, type === 0 && usable ? '+' : '');
      setClass(b, 'dim', !usable);
    }
    setText(this.gardenTotal, t(s.stats.coalescences >= C.MS_GALAXY[1] ? 'nova.gardenTotalFe' : 'nova.gardenTotal', {
      d: fmt(m.nebulaDustMult, sci), p: fmt(m.nebulaPlasmaMult, sci),
    }));
    for (let c = 0; c < C.CHALLENGE_COUNT; c++) {
      const r = this.chRows[c];
      const active = s.nova.challenge === c;
      const activeTier = active ? s.nova.challengeTier : 0;
      const otherActive = s.nova.challenge !== -1 && !active;
      const ctier = s.nova.completedTier[c];
      const locked = s.stats.supernovae < C.CH_UNLOCK_NOVAE(c);
      const hardUnlockable = !locked && ctier >= 1 && s.stats.coalescences >= C.MS_GALAXY[3];

      setClass(r.card, 'locked', locked);
      setClass(r.card, 'active', active);
      setClass(r.card, 'completed', ctier >= 1);
      setClass(r.card, 'completed-hard', ctier >= 2);
      setText(r.statusIcon, active ? t('misc.active') : ctier >= 2 ? '★' : ctier >= 1 ? '✓' : locked ? '🔒' : '');

      // Gesperrt: nur Name + Freischalt-Hinweis, sonst nichts (reduziert Info, bevor sie relevant ist)
      setReserve(r.lockedLine, locked);
      setText(r.lockedLine, locked ? `🔒 ${t('nova.chLockedInfo', { v: C.CH_UNLOCK_NOVAE(c), c: s.stats.supernovae })}` : '');
      setReserve(r.toggle, hardUnlockable);
      setReserve(r.restrictLine, !locked);
      setReserve(r.goalLine, !locked);
      setReserve(r.rewardLine, !locked);
      setReserve(r.startBtn, !locked);
      if (locked) continue;

      // Ansicht folgt dem laufenden Versuch, sonst der zuletzt gewählten Stufe (auf Normal
      // geklemmt, solange Hard nicht wählbar ist — z. B. nach einem Coalescence-Reset).
      if (!active && !hardUnlockable) r.viewTier = 1;
      const viewTier: 1 | 2 = active ? (activeTier as 1 | 2) : r.viewTier;
      setClass(r.toggleBtns[0], 'active', viewTier === 1);
      setClass(r.toggleBtns[1], 'active', viewTier === 2);
      setDisabled(r.toggleBtns[0], active);
      setDisabled(r.toggleBtns[1], active);

      const goalMult = viewTier === 2 ? C.CH_GOAL_MULT_TIER2[c] : C.CH_GOAL_MULT[c];
      setText(r.restrictLine, `⚠ ${t(`ch.${c}d`)}`);
      setText(r.goalLine, `🎯 ${fmt(D(C.IGNITION_REQ).mul(goalMult), true)} ${t('dust.name')}`);
      setText(r.rewardLine, t(viewTier === 2 ? `ch.${c}r2` : `ch.${c}r`));

      setText(r.startBtn, active ? t('nova.chExit') : t('nova.chEnter'));
      setClass(r.startBtn, 'danger', active);
      setDisabled(r.startBtn, otherActive);
    }

    // Coalescence
    const coalReq = F.coalesceReq(s);
    setBar(this.coalBar, logFrac(s.nova.totalShards, coalReq));
    const dmG = F.dmGain(s, m);
    if (F.canCoalesce(s)) {
      setText(this.coalLabel, t('galaxy.gain', { v: fmt(dmG, sci) }));
      setDisabled(this.coalBtn, s.nova.challenge !== -1 || dmG.lte(0));
    } else {
      setText(this.coalLabel, t('galaxy.req', { v: fmt(coalReq, true) }));
      setDisabled(this.coalBtn, true);
    }
    setClass(this.coalLabel, 'capped', F.canCoalesce(s) && F.isGainCapped(dmG, s.galaxy.totalDM));
    this.gtBtns.forEach((b, g) => {
      setClass(b, 'active', s.ui.nextGtype === g);
      setText(b, `${t(`galaxy.t${g}`)} (${s.stats.gtypePicks[g]})`);
    });

    this.ms.update(s);
  }
}

// ═══════════════ Ebene 3: Galaxy ═══════════════
export class GalaxyPanel implements Panel {
  root = el('div');
  private nodeBtns: { b: HTMLButtonElement; cost: HTMLElement }[] = [];
  private autoRow: HTMLElement;
  private autoChk: HTMLInputElement;
  private autoLockNote = el('div', 'sub center');
  private colBar = bar('bar-sing');
  private colLabel = el('div', 'sub center');
  private colBtn!: HTMLButtonElement;

  constructor(private st: St, private hud: Hud) {
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
    attachTip(label, () => ({
      title: t('galaxy.autoNova'),
      body: t('galaxy.autoNovaTip', { r: C.AUTO_NOVA_RATE * 100 }),
    }));
    this.autoRow.append(label);
    this.root.append(this.autoRow, this.autoLockNote);

    // Collapse-Box lebt HIER (Ebene darunter) — der Singularity-Tab existiert erst danach
    const collapseBox = el('div', 'reset-box sing');
    collapseBox.append(this.colBar.wrap, this.colLabel);
    attachTip(this.colLabel, () => {
      const s = this.st();
      const m = M(s);
      const capped = F.isGainCapped(F.entropyGain(s, m), s.sing.totalEntropy);
      return capTipBody(s, m, s.sing.totalEntropy, C.GAIN_CLAMP_MULT, capped, 'collapse', 'galaxy.dm');
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
    collapseBox.append(this.colBtn);
    this.root.append(collapseBox);

    this.ms = milestoneSection(
      [t('ms.col0'), t('ms.col1'), t('ms.col2'), t('ms.col3')],
      C.MS_COLLAPSE, 'ms.u.col', s => s.stats.collapses);
    this.root.append(this.ms.root);
  }
  private ms!: ReturnType<typeof milestoneSection>;

  update(s: GameState, m: F.Mults): void {
    const sci = s.settings.sciNotation;
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

    // Collapse
    const colReq = F.collapseReq(s);
    setBar(this.colBar, logFrac(s.galaxy.totalDM, colReq));
    const entG = F.entropyGain(s, m);
    if (F.canCollapse(s)) {
      setText(this.colLabel, t('sing.gain', { v: fmt(entG, sci) }));
      setDisabled(this.colBtn, s.nova.challenge !== -1 || entG.lte(0));
    } else {
      setText(this.colLabel, t('sing.req', { v: fmt(colReq, true) }));
      setDisabled(this.colBtn, true);
    }
    setClass(this.colLabel, 'capped', F.canCollapse(s) && F.isGainCapped(entG, s.sing.totalEntropy));

    this.ms.update(s);
  }
}

/** Meilenstein-Liste einer Ebene: ○/✓ je Schwelle, grau bis erreicht */
function milestoneSection(labels: string[], thresholds: number[], unitKey: string, count: (s: GameState) => number) {
  const root = el('div', 'ms-box');
  const head = el('h3', '', t('ms.title'));
  const countEl = el('span', 'ms-count', '');
  head.append(countEl);
  root.append(head);
  const rows = thresholds.map((at, i) => {
    const row = el('div', 'ms-row');
    const icon = el('span', 'ms-icon', '○');
    row.append(icon, el('span', '', `${at}× ${t(unitKey)} — ${labels[i]}`));
    root.append(row);
    return { row, icon, at };
  });
  return {
    root,
    update(s: GameState): void {
      const c = count(s);
      setText(countEl, ` · ${c}× ${t(unitKey)}`);
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
    this.root.append(this.uniLabel);

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
    void m;
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
