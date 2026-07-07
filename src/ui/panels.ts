import { el, btn, setText, setHTML, setVisible, setReserve, setDisabled, setClass, flashDenied } from './dom';
import { fmt, fmtInt, fmtTime, fmtMult, resTag, numTag } from './format';
import { t, setLang, getLang } from '../i18n';
import type { GameState, NebulaCell, StarClass, GalaxyType } from '../core/state';
import * as C from '../core/constants';
import * as F from '../core/formulas';
import * as A from '../core/actions';
import { emit } from '../events';
import type { Panel, Hud } from './hud';
import { achLabel } from './hud';
import { D, Decimal, MAX_COUNTER } from '../core/decimal';
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

/**
 * Welche Stufe als Nächstes ansteht (Karte zeigt IMMER genau das, kein manueller Toggle mehr):
 * null → nichts mehr zu tun (Hart schon geschafft, oder Hart noch nicht freigeschaltet).
 */
function chNextTier(s: GameState, c: number): 1 | 2 | null {
  const ctier = s.nova.completedTier[c];
  if (ctier >= 2) return null;
  if (ctier >= 1) return F.effectiveCoalescences(s) >= C.MS_GALAXY[3] ? 2 : null;
  return 1;
}
/** Für den Klapp-Indikator: nur freigeschaltete Challenges zählen — gesperrte Hart-Stufen
 *  sollen den Spieler nicht grundlos ins Gelb schicken (siehe todo.md-Entscheidung). */
function challengesOpenCount(s: GameState): number {
  let n = 0;
  for (let c = 0; c < C.CHALLENGE_COUNT; c++) {
    if (s.stats.supernovae < C.CH_UNLOCK_NOVAE(c)) continue;
    if (chNextTier(s, c) !== null) n++;
  }
  return n;
}
function challengesAllDone(s: GameState): boolean {
  return challengesOpenCount(s) === 0;
}

// Welche Währung der jeweilige Reset ausschüttet (bestimmt Icon/Farbe der Deckel-Zahl).
const CAP_TOTAL_RES: Record<'ignite' | 'nova' | 'coalesce' | 'collapse', 'plasma' | 'shards' | 'dm' | 'entropy'> = {
  ignite: 'plasma', nova: 'shards', coalesce: 'dm', collapse: 'entropy',
};

/** Zeile für Reset-Vorschauen: Gewinn/Anforderung links (visuell betont via `.reset-gain` —
 *  das ist die eigentlich wichtige Zahl), Deckel-Wert dauerhaft sichtbar rechts, "noch X bis
 *  zum Deckel" permanent als dritte Zeile darunter — kein Hover mehr nötig, um das zu sehen.
 *  Ganze `row` ist der Tooltip-Hover-Bereich (Erklärung, was der Deckel bedeutet). Cap-Spalte
 *  + Bedarfszeile verschwinden (zurück auf die reine Gewinn-Zeile), solange der Auto-Trickle
 *  der Ebene läuft — der resettet ohnehin laufend selbst, beides wäre dort nur Ballast. */
function resetRow(label: HTMLElement): { wrap: HTMLElement; row: HTMLElement; capEl: HTMLElement; needEl: HTMLElement } {
  label.classList.add('reset-gain');
  const capEl = el('span', 'sub reset-cap');
  const row = el('div', 'reset-row');
  row.append(label, capEl);
  const needEl = el('div', 'sub center reset-need');
  const wrap = el('div', 'reset-wrap');
  wrap.append(row, needEl);
  return { wrap, row, capEl, needEl };
}
/** Text „noch X bis zum Deckel" — geteilt zwischen der permanenten Zeile und (früher) dem Tooltip. */
function capNeedText(
  s: GameState, m: F.Mults, layer: 'ignite' | 'nova' | 'coalesce' | 'collapse',
  unitKey: string, resKind?: 'dust' | 'shards' | 'dm',
): string {
  const need = F.currencyForCap(s, m, layer);
  if (!need) return '';
  const sci = s.settings.sciNotation;
  const target = fmt(need.target, sci);
  const c = resKind ? resTag(resKind, target) : `${numTag(target)} ${t(unitKey)}`;
  return t('cap.need', { c, v: numTag(fmt(need.current, sci)) });
}
function setCapDisplay(
  capEl: HTMLElement, row: HTMLElement, needEl: HTMLElement, s: GameState, m: F.Mults,
  total: Decimal, mult: number, layer: 'ignite' | 'nova' | 'coalesce' | 'collapse',
  unitKey: string, resKind: 'dust' | 'shards' | 'dm' | undefined, isCapped: boolean, autoOn: boolean,
): void {
  const showCap = !autoOn;
  setHTML(capEl, t('cap.inline', { v: resTag(CAP_TOTAL_RES[layer], fmt(F.gainCapBound(total, mult), s.settings.sciNotation)) }));
  setVisible(capEl, showCap);
  setClass(row, 'has-cap', showCap);
  const needText = showCap && !isCapped ? capNeedText(s, m, layer, unitKey, resKind) : '';
  setReserve(needEl, needText !== '');
  if (needText) setHTML(needEl, needText);
}
/** Gemeinsamer Gain-Deckel-Tooltip: reine Erklärung — die Zahlen (Deckel, Bedarf) stehen jetzt
 *  permanent in der Zeile selbst, nicht mehr nur im Hover. `charge` (< 1) erklärt, warum die
 *  Gewinn-Vorschau auch ohne neue Ressourcen langsam steigt — reine Aufladezeit seit dem
 *  letzten Reset, kein Bug. */
function capTipBody(isCapped: boolean, autoOn: boolean, charge = 1): { title: string; body: string } {
  // "Jetzt resetten!" ist irreführend, solange der Auto-Trickle des Layers ohnehin laufend resettet.
  const bodyKey = isCapped ? (autoOn ? 'cap.bodyAuto' : 'cap.body') : 'cap.hint';
  let body = t(bodyKey);
  if (charge < 1) body += `\n${t('cap.charge', { v: numTag(String(Math.round(charge * 100))) })}`;
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
  private compCapBadge!: HTMLElement;
  private genRows: {
    row: HTMLElement; owned: HTMLElement; rate: HTMLElement;
    b1: HTMLButtonElement; bm: HTMLButtonElement; c1: HTMLElement; capBadge: HTMLElement;
  }[] = [];
  private rowHigh = -1;   // höchste je gezeigte Generator-Stufe: reserviert Höhe, damit das Panel nicht springt
  private igniteBox: HTMLElement;
  private igniteBar = bar('bar-hot');
  private igniteLabel = el('div', 'sub center');
  private igniteCap!: HTMLElement;
  private igniteRow!: HTMLElement;
  private igniteNeed!: HTMLElement;
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
    attachTip(this.clickBtn, () => ({ title: t('dust.click'), body: t('dust.clickTip', { v: numTag(`×${C.SOLAR_SAIL_CLICKS}`) }) }));

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
      else flashDenied(compBuy);
    });
    compBuy.append(this.compCost);
    this.compMax = btn('buy alt', t('btn.max'), () => {
      const s = this.st();
      if (A.buyCompressionMax(s)) emit('buy');
      else flashDenied(this.compMax);
    });
    this.compCapBadge = el('div', 'cap-badge', t('misc.capReached'));
    attachTip(this.compCapBadge, () => ({ title: t('misc.capReached'), body: t('misc.capReachedTip') }));
    const compBtnWrap = el('div', 'buy-wrap');
    compBtnWrap.append(compBuy, this.compMax, this.compCapBadge);
    this.compRow.append(compBtnWrap, this.compEff);
    this.root.append(this.compRow);

    // Generatoren
    for (let i = 0; i < C.GEN_COUNT; i++) {
      const row = el('div', 'row gen-row');
      const info = el('div', 'gen-info');
      const name = el('div', 'gen-name', t(`gen.${i}`));
      const owned = el('div', 'gen-owned');
      const rate = el('div', 'gen-rate sub');
      info.append(name, owned, rate);
      attachTip(owned, () => ({
        title: t(`gen.${i}`),
        body: t('gen.ownedTip', { v: numTag(fmtMult(C.GEN_MULT_PER_10)) }),
      }));
      const c1 = el('span', 'cost');
      const buyGen = (max: boolean, triggerBtn: HTMLButtonElement) => {
        const s = this.st();
        const first = s.dust.gens[i].bought === 0;
        const ok = max ? A.buyGeneratorMax(s, M(s), i) : A.buyGenerator(s, M(s), i, 1);
        if (ok) {
          emit('buy');
          emit('gen-bought', i);          // Planet pulst in der Szene
          if (first) emit('gen-first', i); // einmaliger Kamera-Puls beim Erstkauf
        } else {
          flashDenied(triggerBtn);
        }
      };
      const b1 = btn('buy', t('btn.buy1'), () => buyGen(false, b1));
      b1.append(c1);
      const bm = btn('buy alt', t('btn.max'), () => buyGen(true, bm));
      const capBadge = el('div', 'cap-badge', t('misc.capReached'));
      attachTip(capBadge, () => ({ title: t('misc.capReached'), body: t('misc.capReachedTip') }));
      const btnWrap = el('div', 'buy-wrap');
      btnWrap.append(b1, bm, capBadge);
      row.append(info, btnWrap);
      this.genRows.push({ row, owned, rate, b1, bm, c1, capBadge });
      this.root.append(row);
    }

    // Ignite-Box
    this.igniteBox = el('div', 'reset-box hot');
    const igniteRow = resetRow(this.igniteLabel);
    this.igniteRow = igniteRow.row;
    this.igniteCap = igniteRow.capEl;
    this.igniteNeed = igniteRow.needEl;
    this.igniteBox.append(this.igniteBar.wrap, igniteRow.wrap);
    attachTip(this.igniteRow, () => {
      const s = this.st();
      const m = M(s);
      const capped = F.isGainCapped(F.plasmaGain(s, m), s.star.totalPlasma, C.PLASMA_CLAMP_MULT);
      return capTipBody(capped, s.nova.autoIgnite.on);
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
          body: `${t(`star.class${c}d`)}\n${t('star.classEff', { s: numTag(`×${fmtMult(cls.speed)}`), p: numTag(`×${fmtMult(cls.plasmaGain)}`) })}`
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
          ? t('nova.autoIgniteTip', { v: numTag(`×${C.PLASMA_CLAMP_MULT + 1}/s`) })
          : t('nova.autoIgniteLock'),
      };
    });
    const ignRow = el('div', 'ignite-row');
    ignRow.append(this.igniteBtn, this.autoBtn);
    this.igniteBox.append(this.classSeg, ignRow);
    this.root.append(this.igniteBox);

    this.ms = milestoneSection(
      [t('ms.ign0'), t('ms.ign1'), t('ms.ign2')],
      C.MS_IGNITION, 'ms.u.ign', s => F.effectiveIgnMs(s),
      { st: this.st, text: s => t('ms.galBreakdown', {
        raw: s.stats.ignMs, mult: numTag(fmtMult(F.coalescenceBonusMult(s))), n: s.stats.collapses,
      }) });
    this.root.append(this.ms.root);

    // Spezial-Meilensteine (ab 3 Kollapsen): je 100 Käufe einer Generator-Stufe → Output ×3
    this.smsBox = el('div', 'ms-box');
    const smsHead = el('h3', '', t('sms.title'));
    this.smsBox.append(smsHead, el('div', 'sub', t('sms.dustDesc', { s: C.SPECIAL_GEN_STEP, m: C.SPECIAL_GEN_MULT })));
    this.smsRow = el('div', 'ms-row');
    this.smsIcon = el('span', 'ms-icon', '○');
    this.smsLine = el('span', '', '');
    this.smsRow.append(this.smsIcon, this.smsLine);
    this.smsBox.append(this.smsRow);
    this.root.append(this.smsBox);
  }
  private smsBox!: HTMLElement;
  private smsRow!: HTMLElement;
  private smsIcon!: HTMLElement;
  private smsLine!: HTMLElement;
  private ms!: ReturnType<typeof milestoneSection>;

  update(s: GameState, m: F.Mults): void {
    const sci = s.settings.sciNotation;
    setText(this.clickVal, `+${fmt(F.clickAmount(s, m), sci)}`);
    setReserve(this.cometNote, s.dust.comet.active || s.dust.comet.boost > 0);
    setText(this.cometNote, s.dust.comet.active ? '☄ ' + t('dust.comet')
      : t('dust.cometBoost', { v: fmtMult(m.cometBoostMult), t: Math.ceil(s.dust.comet.boost) }));

    // Max-Buttons sind eine Belohnung der ersten Ignition (dieser Galaxie)
    const maxUnlocked = F.effectiveIgnMs(s) >= C.MS_IGNITION[0];
    setReserve(this.compRow, s.nova.challenge !== 0);
    setReserve(this.compMax, maxUnlocked);
    setText(this.compCost, fmt(F.compressionCost(s), sci));
    setText(this.compEff, `${fmtInt(D(s.dust.compression))} × | ${t('dust.compressionDesc', { v: m.compressionEffect.toFixed(2) })}`);
    const compCapped = s.dust.compression >= MAX_COUNTER;
    setClass(this.compCapBadge, 'show', compCapped);
    setDisabled(this.compRow.querySelector('button')!, compCapped || s.dust.amount.lt(F.compressionCost(s)));
    setDisabled(this.compMax, compCapped || s.dust.amount.lt(F.compressionCost(s)));

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
      setText(r.owned, `${fmtInt(g.amount)} (${fmtInt(D(g.bought))})`);
      const prod = g.amount.mul(F.tierMult(s, m, i)).mul(i === 0 ? m.dustMult : D(1)).mul(m.speed);
      setText(r.rate, `+${fmt(prod, sci)}${t('unit.perSec')} ${i === 0 ? t('dust.name') : t(`gen.${i - 1}`)}`);
      setText(r.c1, fmt(F.genCost(s, m, i, 1), sci));
      const capped = g.bought >= MAX_COUNTER;
      setClass(r.capBadge, 'show', capped);
      setDisabled(r.b1, capped || s.dust.amount.lt(F.genCost(s, m, i, 1)));
      setReserve(r.bm, maxUnlocked);
      setDisabled(r.bm, capped || F.genMaxAfford(s, m, i) < 1);
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
        setHTML(this.igniteLabel, t('star.igniteGain', { v: resTag('plasma', fmt(gain, s.settings.sciNotation)) }));
        setDisabled(this.igniteBtn, gain.lte(0));
      } else {
        setHTML(this.igniteLabel, t('star.igniteReq', { v: fmt(req, true) }));
        setDisabled(this.igniteBtn, true);
      }
      const igniteCapped = F.canIgnite(s) && F.isGainCapped(gain, s.star.totalPlasma, C.PLASMA_CLAMP_MULT);
      setClass(this.igniteLabel, 'capped', igniteCapped);
      setCapDisplay(this.igniteCap, this.igniteRow, this.igniteNeed, s, m, s.star.totalPlasma,
        C.PLASMA_CLAMP_MULT, 'ignite', 'dust.name', 'dust', igniteCapped, s.nova.autoIgnite.on);
      setReserve(this.classSeg, F.effectiveIgnMs(s) >= C.MS_IGNITION[1]);
      this.classBtns.forEach((b, c) => setClass(b, 'active', s.ui.nextClass === c));
      setReserve(this.autoBtn, s.stats.autoIgniteSeen);
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
      const done = parts.length > 0;
      setText(this.smsLine, done ? parts.join(' · ') : t('sms.dustNone'));
      setClass(this.smsRow, 'done', done);
      setText(this.smsIcon, done ? '✓' : '○');
    }
    this.ms.update(s);
  }
}

// ═══════════════ Ebene 1: Star ═══════════════
export class StarPanel implements Panel {
  root = el('div');
  private elRows: { row: HTMLElement; stock: HTMLElement; boost: HTMLElement }[] = [];
  private reactorBtns: {
    b: HTMLButtonElement; bm: HTMLButtonElement; lvl: HTMLElement; cost: HTMLElement; capBadge: HTMLElement;
  }[] = [];
  private upBtns: HTMLButtonElement[] = [];
  private autoUpBtn!: HTMLButtonElement;
  private upIndicator = el('span', 'collapse-indicator');
  private upChevron = el('span', 'collapse-chevron', '▾');
  private upContainer = el('div', 'up-container');
  private novaBox: HTMLElement;
  private novaBar = bar('bar-nova');
  private novaLabel = el('div', 'sub center');
  private novaCap!: HTMLElement;
  private novaRow!: HTMLElement;
  private novaNeed!: HTMLElement;
  private novaBtn: HTMLButtonElement;
  private autoNovaBtn!: HTMLButtonElement;
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
          else flashDenied(b);
        });
        b.append(lvl, cost);
        const bm = btn('buy alt', t('btn.max'), () => {
          const s = this.st();
          if (A.buyReactorsMax(s, e, 1)) emit('buy');
          else flashDenied(bm);
        });
        const capBadge = el('div', 'cap-badge', t('misc.capReached'));
        attachTip(capBadge, () => ({ title: t('misc.capReached'), body: t('misc.capReachedTip') }));
        const btnWrap = el('div', 'buy-wrap');
        btnWrap.append(b, bm, capBadge);
        this.reactorBtns.push({ b, bm, lvl, cost, capBadge });
        row.append(btnWrap);
      }
      this.elRows.push({ row, stock, boost });
      this.root.append(row);
    }

    // Upgrades getrennt: normale Boosts vs. Automation (4, 8, 13, 14)
    const AUTOMATION_IDS = [4, 8, 13, 14];
    const gridNormal = el('div', 'up-grid');
    const gridAuto = el('div', 'up-grid');
    const autoBudgetPct = numTag(`${Math.round(C.AUTOBUY_BUDGET_FRAC * 100)}%`);
    for (let u = 0; u < C.PLASMA_UPGRADE_COSTS.length; u++) {
      const b = btn('up-btn', '', () => {
        const s = this.st();
        if (A.buyPlasmaUpgrade(s, u)) emit('buy');
      });
      const isAuto = AUTOMATION_IDS.includes(u);
      const sub = el('div', 'sub');
      // Automation-Beschreibungen heben den Budget-Anteil hervor (innerHTML statt textContent —
      // sicher, weil intern generiert); normale Upgrades bleiben reiner Text.
      if (isAuto) sub.innerHTML = t(`up.${u}d`, { v: autoBudgetPct });
      else sub.textContent = t(`up.${u}d`);
      b.append(el('div', 'up-name', t(`up.${u}`)), sub,
        el('div', 'cost', `${C.PLASMA_UPGRADE_COSTS[u]} ${t('star.plasma')}`));
      this.upBtns.push(b);
      (isAuto ? gridAuto : gridNormal).append(b);
    }
    this.autoUpBtn = btn('seg-btn auto-btn sm', t('star.autoUpgrades'), () => {
      const s = this.st();
      if (s.stats.collapses < C.MS_COLLAPSE[1]) return;
      s.star.autoUpgrades = !s.star.autoUpgrades;
      this.update(s, M(s));
    });
    attachTip(this.autoUpBtn, () => ({ title: t('star.autoUpgrades'), body: t('star.autoUpgradesTip') }));
    const upHead = el('h3', 'collapse-head');
    upHead.append(el('span', '', t('star.upgrades')), this.autoUpBtn, this.upIndicator, this.upChevron);
    upHead.addEventListener('click', () => {
      const s = this.st();
      s.ui.upgradesCollapsed = !s.ui.upgradesCollapsed;
      this.update(s, M(s));
    });
    attachTip(this.upIndicator, () => {
      const s = this.st();
      const bought = s.star.upgrades.filter(Boolean).length;
      const total = C.PLASMA_UPGRADE_COSTS.length;
      return {
        title: t('star.upgrades'),
        body: bought >= total ? t('star.upIndicatorDone') : t('star.upIndicatorOpen', { n: bought, total }),
      };
    });
    this.root.append(upHead, this.upContainer);
    this.upContainer.append(gridNormal, el('h3', '', t('star.autoUps')), gridAuto);

    // Supernova-Box
    this.novaBox = el('div', 'reset-box nova');
    const novaRow = resetRow(this.novaLabel);
    this.novaRow = novaRow.row;
    this.novaCap = novaRow.capEl;
    this.novaNeed = novaRow.needEl;
    this.novaBox.append(el('h3', '', t('nova.name')), this.novaBar.wrap, novaRow.wrap,
      el('div', 'sub center', t('nova.remnant')));
    attachTip(this.novaRow, () => {
      const s = this.st();
      const m = M(s);
      const clampMult = F.shardClampMult(s);
      const capped = F.isGainCapped(F.shardGain(s, m), s.nova.totalShards, clampMult);
      return capTipBody(capped, s.galaxy.autoNova.on, F.chargeFrac(s, 'nova'));
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
          : fmtMult(C.GAIN_CLAMP_MULT + rp.bhPer * k);
        const tier = F.remnantTier(s, r as 0 | 1 | 2);
        const sms = s.stats.collapses >= C.MS_COLLAPSE[1]
          ? `\n${t('sms.tier', { t: numTag(String(tier)), c: n, n: (tier + 1) * C.SPECIAL_REMNANT_STEP })}` : '';
        return {
          title: t(`nova.rem${r}`),
          body: `${t(`nova.rem${r}d`)}\n${t(`nova.rem${r}b`, { n, v: numTag(`×${effAt(n)}`), p: C.REMNANT_PULSAR_PERIOD, d: rp.pulsarDur })}`
            + `\n${t('nova.remNext', { v: numTag(`×${effAt(n + 1)}`) })}${sms}`,
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
    // Auto-Supernova direkt neben dem Auslösen-Button (Toggle; gesperrt bis Meilenstein) —
    // gleiches Muster wie Auto-Zündung neben ZÜNDEN in DustPanel.
    this.autoNovaBtn = btn('seg-btn auto-btn', t('galaxy.autoNova'), () => {
      const s = this.st();
      if (!M(s).autoNovaUnlocked) return;
      s.galaxy.autoNova.on = !s.galaxy.autoNova.on;
      this.update(s, M(s));
    });
    attachTip(this.autoNovaBtn, () => {
      const s = this.st();
      return {
        title: t('galaxy.autoNova'),
        body: M(s).autoNovaUnlocked
          ? t('galaxy.autoNovaTip', { r: numTag(`${C.AUTO_NOVA_RATE * 100}%`) })
          : t('galaxy.autoNovaLock'),
      };
    });
    const novaRow2 = el('div', 'ignite-row');
    novaRow2.append(this.novaBtn, this.autoNovaBtn);
    this.novaBox.append(this.remSeg, novaRow2);
    this.root.append(this.novaBox);

    this.ms = milestoneSection(
      [t('ms.nova0'), t('ms.nova1'),
        ...C.MS_NOVA_KEEP.map(id => id === -1
          ? t('ms.novaKeepAll')
          : t('ms.novaKeep', { v: t(`up.${id}`) }))],
      C.MS_NOVA, 'ms.u.nova', s => F.effectiveNovaMs(s),
      { st: this.st, text: s => t('ms.galBreakdown', {
        raw: s.stats.novaMs, mult: numTag(fmtMult(F.coalescenceBonusMult(s))), n: s.stats.collapses,
      }) });
    this.root.append(this.ms.root);

    // Spezial-Meilensteine (ab 2 Kollapsen): je 10 Remnants eines Typs → Effekt-Stufe
    this.smsBox = el('div', 'ms-box');
    const smsHead = el('h3', '', t('sms.title'));
    attachTip(smsHead, () => ({ title: t('sms.title'), body: t('sms.tip', { n: numTag(String(C.SPECIAL_REMNANT_STEP)) }) }));
    this.smsBox.append(smsHead);
    for (let rt = 0; rt < 3; rt++) {
      const row = el('div', 'ms-row');
      const icon = el('span', 'ms-icon', '○');
      const txt = el('span', '', '');
      row.append(icon, txt);
      this.smsBox.append(row);
      this.smsRows.push({ row, icon, txt });
    }
    this.root.append(this.smsBox);
  }
  private smsBox!: HTMLElement;
  private smsRows: { row: HTMLElement; icon: HTMLElement; txt: HTMLElement }[] = [];
  private ms!: ReturnType<typeof milestoneSection>;

  update(s: GameState, m: F.Mults): void {
    const sci = s.settings.sciNotation;
    setText(this.classNote, `${t('star.class')}: ${t(`star.class${s.star.cls}`)} · H: +${fmt(m.hRate.mul(m.speed), sci)}${t('unit.perSec')}`);
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
        setText(rb.lvl, ` ${t('misc.level')}${fmtInt(D(s.star.reactors[e]))} `);
        setText(rb.cost, fmt(F.reactorCost(s, e), sci));
        const locked = e > 0 && s.star.reactors[e - 1] === 0;
        const cantAfford = s.star.plasma.lt(F.reactorCost(s, e));
        const capped = s.star.reactors[e] >= MAX_COUNTER;
        setClass(rb.capBadge, 'show', capped);
        setDisabled(rb.b, capped || locked || cantAfford);
        // Reaktor-Max ist eine Belohnung der ersten Supernova (dieser Galaxie) — Platz reservieren
        setReserve(rb.bm, F.effectiveNovaMs(s) >= C.MS_NOVA[0]);
        setDisabled(rb.bm, capped || locked || cantAfford);
      }
    }
    for (let u = 0; u < this.upBtns.length; u++) {
      setClass(this.upBtns[u], 'bought', s.star.upgrades[u]);
      setDisabled(this.upBtns[u], s.star.upgrades[u] || s.star.plasma.lt(C.PLASMA_UPGRADE_COSTS[u]));
    }
    setVisible(this.upContainer, !s.ui.upgradesCollapsed);
    setClass(this.upChevron, 'collapsed', s.ui.upgradesCollapsed);
    setClass(this.upIndicator, 'done', s.star.upgrades.every(Boolean));
    const autoUpOk = s.stats.collapses >= C.MS_COLLAPSE[1];
    setReserve(this.autoUpBtn, autoUpOk);
    setClass(this.autoUpBtn, 'active', autoUpOk && s.star.autoUpgrades);
    const fe = s.star.elements[5];
    setVisible(this.novaBox, fe.gt(0) || s.nova.unlocked);
    const nReq = F.novaReq(s);
    setBar(this.novaBar, logFrac(fe, nReq));
    const gain = F.shardGain(s, m);
    if (F.canSupernova(s)) {
      setHTML(this.novaLabel, t('nova.gain', { v: resTag('shards', fmt(gain, sci)) }));
      setDisabled(this.novaBtn, gain.lte(0));
    } else {
      setHTML(this.novaLabel, t('nova.req', { v: fmt(nReq, true) }));
      setDisabled(this.novaBtn, true);
    }
    const novaClampMult = F.shardClampMult(s);
    const novaCapped = F.canSupernova(s) && F.isGainCapped(gain, s.nova.totalShards, novaClampMult);
    setClass(this.novaLabel, 'capped', novaCapped);
    setCapDisplay(this.novaCap, this.novaRow, this.novaNeed, s, m, s.nova.totalShards,
      novaClampMult, 'nova', 'el.5', undefined, novaCapped, s.galaxy.autoNova.on);
    const autoNovaOk = m.autoNovaUnlocked;
    setReserve(this.autoNovaBtn, s.stats.autoNovaSeen);
    setClass(this.autoNovaBtn, 'dim', !autoNovaOk);
    setClass(this.autoNovaBtn, 'active', autoNovaOk && s.galaxy.autoNova.on);
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
        const done = tier >= 1;
        const { row, icon, txt } = this.smsRows[rt];
        setText(txt, `${t(`nova.rem${rt}`)} — ${t('sms.tier', {
          t: tier, c: s.nova.remnants[rt], n: (tier + 1) * C.SPECIAL_REMNANT_STEP,
        })} · ${eff[rt]}`);
        setClass(row, 'done', done);
        setText(icon, done ? '✓' : '○');
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
  private nebIndicator = el('span', 'collapse-indicator');
  private nebChevron = el('span', 'collapse-chevron', '▾');
  private nebContainer = el('div', 'neb-container');
  private chRows: {
    card: HTMLElement; statusIcon: HTMLElement; lockedLine: HTMLElement;
    activeLine: HTMLElement; activeValue: HTMLElement;
    restrictLine: HTMLElement; goalLine: HTMLElement; rewardLine: HTMLElement; rewardValue: HTMLElement;
    startBtn: HTMLButtonElement;
  }[] = [];
  private chIndicator = el('span', 'collapse-indicator');
  private chChevron = el('span', 'collapse-chevron', '▾');
  private chContainer = el('div', 'ch-container');
  private coalBar = bar('bar-gal');
  private coalLabel = el('div', 'sub center');
  private coalCap!: HTMLElement;
  private coalRow!: HTMLElement;
  private coalNeed!: HTMLElement;
  private coalBtn!: HTMLButtonElement;
  private autoCoalBtn!: HTMLButtonElement;
  private gtBtns: HTMLButtonElement[] = [];

  constructor(private st: St, private hud: Hud) {
    const nebHead = el('h3', 'collapse-head');
    nebHead.append(el('span', '', t('nova.nebula')), this.nebIndicator, this.nebChevron);
    nebHead.addEventListener('click', () => {
      const s = this.st();
      s.ui.nebulaCollapsed = !s.ui.nebulaCollapsed;
      this.update(s, M(s));
    });
    attachTip(this.nebIndicator, () => {
      const s = this.st();
      const bought = s.nova.cellsBought;
      const total = C.NEBULA_CELLS;
      return {
        title: t('nova.nebula'),
        body: bought >= total ? t('nova.nebIndicatorDone') : t('nova.nebIndicatorOpen', { n: bought, total }),
      };
    });
    this.root.append(nebHead, this.nebContainer);

    this.tokenCost.append(el('span', '', t('nova.nextToken') + ' '), this.tokenCostVal);
    attachTip(this.tokenCost, () => ({ title: t('nova.tokenTipT'), body: t('nova.tokenTip') }));
    this.nebContainer.append(el('div', 'sub', t('nova.nebulaDesc')), this.tokenCost);
    const seg = el('div', 'seg');
    for (const b of [1, 2, 3] as NebulaCell[]) {
      const bb = btn('seg-btn', t(`nova.cell${b}`), () => { this.brush = b; this.syncBrush(); });
      attachTip(bb, () => ({
        title: t(`nova.cell${b}`),
        body: (b === 1 ? resTag('dust', t('nova.cell1d')) : b === 2 ? resTag('plasma', t('nova.cell2d'))
          : t('nova.cell3d', { v: numTag(`×${fmtMult(C.NEBULA_DARK_BONUS)}`) }))
          + (b === 2
            ? `\n${F.effectiveCoalescences(this.st()) >= C.MS_GALAXY[1]
              ? t('nova.reFeOn', { v: numTag(`×${fmtMult(C.NEBULA_REFLECTION_MULT)}`), n: C.MS_GALAXY[1] })
              : t('nova.reFeLocked', { v: numTag(`×${fmtMult(C.NEBULA_REFLECTION_MULT)}`), n: C.MS_GALAXY[1] })}`
            : ''),
      }));
      this.brushBtns.push(bb);
      seg.append(bb);
    }
    this.nebContainer.append(seg);

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
        const bonus = numTag(`×${fmtMult(C.NEBULA_DARK_BONUS)}`);
        if (type === 3) {
          const boosted = F.HEX_NEIGHBORS[i].filter(n => s.nova.cells[n] === 1 || s.nova.cells[n] === 2).length;
          return { title: t('nova.cell3'), body: `${t('nova.cell3d', { v: bonus })}\n${t('nova.hexDarkTip', { n: boosted })}` };
        }
        const darks = F.HEX_NEIGHBORS[i].filter(n => s.nova.cells[n] === 3).length;
        const v = numTag(`×${fmtMult(F.nebulaCellMult(s, i, m.nebulaNodeMult))}`);
        const feOn = F.effectiveCoalescences(s) >= C.MS_GALAXY[1];
        return {
          title: t(`nova.cell${type}`),
          body: `${t(type === 1 ? 'nova.hexEmTip' : feOn ? 'nova.hexReTipFe' : 'nova.hexReTip', { v })}\n${t('nova.hexDarks', { n: darks })}`
            + (type === 2 && !feOn ? `\n${t('nova.reFeLocked', { v: numTag(`×${fmtMult(C.NEBULA_REFLECTION_MULT)}`), n: C.MS_GALAXY[1] })}` : ''),
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
    attachTip(this.gardenTotal, () => ({ title: t('nova.nebula'), body: t('nova.gardenTotalTip', { b: numTag(`×${fmtMult(C.NEBULA_DARK_BONUS)}`) }) }));
    this.nebContainer.append(ctl, grid, this.gardenTotal);

    const chHead = el('h3', 'collapse-head');
    chHead.append(el('span', '', t('nova.challenges')), this.chIndicator, this.chChevron);
    chHead.addEventListener('click', () => {
      const s = this.st();
      s.ui.challengesCollapsed = !s.ui.challengesCollapsed;
      this.update(s, M(s));
    });
    attachTip(this.chIndicator, () => {
      const s = this.st();
      const allDone = challengesAllDone(s);
      return {
        title: t('nova.challenges'),
        body: allDone ? t('nova.chIndicatorDone') : t('nova.chIndicatorOpen', { n: challengesOpenCount(s) }),
      };
    });
    this.root.append(chHead, this.chContainer);
    this.chContainer.append(el('div', 'sub', t('nova.chHow')));
    for (let c = 0; c < C.CHALLENGE_COUNT; c++) {
      const card = el('div', 'ch-card');
      const head = el('div', 'ch-head');
      const statusIcon = el('div', 'ch-status-icon', '');
      head.append(el('div', 'ch-name', t(`ch.${c}`)), statusIcon);

      const lockedLine = el('div', 'ch-locked', '');

      const activeLine = el('div', 'ch-active');
      const activeLabel = el('span', 'ch-active-label', `✓ ${t('misc.activeEffect')}:`);
      const activeValue = el('span', 'ch-active-value', '');
      activeLine.append(activeLabel, activeValue);

      const restrictLine = el('div', 'ch-restrict', '');
      const goalLine = el('div', 'ch-goal', '');
      const rewardLine = el('div', 'ch-reward');
      const rewardLabel = el('span', 'ch-reward-label', `🏆 ${t('misc.reward')}:`);
      const rewardValue = el('span', 'ch-reward-value', '');
      rewardLine.append(rewardLabel, rewardValue);

      const startBtn = btn('ch-start', '', () => {
        const s = this.st();
        if (s.nova.challenge === c) A.exitChallenge(s);
        else if (s.nova.challenge === -1) {
          const tier = chNextTier(s, c);
          if (tier) A.enterChallenge(s, c, tier);
        }
      });

      card.append(head, lockedLine, activeLine, restrictLine, goalLine, rewardLine, startBtn);
      this.chRows.push({ card, statusIcon, lockedLine, activeLine, activeValue, restrictLine, goalLine, rewardLine, rewardValue, startBtn });
      this.chContainer.append(card);
    }

    // Coalescence-Box lebt HIER (Ebene darunter) — der Galaxy-Tab existiert ja erst danach
    const coalesceBox = el('div', 'reset-box gal');
    const coalRow = resetRow(this.coalLabel);
    this.coalRow = coalRow.row;
    this.coalCap = coalRow.capEl;
    this.coalNeed = coalRow.needEl;
    coalesceBox.append(this.coalBar.wrap, coalRow.wrap, el('div', 'sub center', t('galaxy.type')));
    attachTip(this.coalRow, () => {
      const s = this.st();
      const m = M(s);
      const capped = F.isGainCapped(F.dmGain(s, m), s.galaxy.totalDM);
      return capTipBody(capped, false, F.chargeFrac(s, 'coalesce'));
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
          body: `${t(effKey, { v: numTag(fmtMult(base)) })}\n${t('choice.pickedUni', { n })}`
            + `\n${t('galaxy.currentBonus', { v: numTag(fmtMult(Math.pow(base, n))) })}`
            + `\n${t('nova.remNext', { v: numTag(`×${fmtMult(Math.pow(base, n + 1))}`) })}`,
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
      // stats.coalescences resettet bei jedem Collapse (Runde 6) — für "schon mal gemacht" braucht
      // es einen ECHTEN Lifetime-Wert; lifetimeDM resettet nie und ist nur > 0 nach mind. 1 Coalesce.
      if (s.stats.lifetimeDM.lte(0)) this.hud.confirm(t('galaxy.go'), t('galaxy.confirm'), doIt);
      else doIt();
    });
    this.autoCoalBtn = btn('seg-btn auto-btn', t('galaxy.autoCoalesce'), () => {
      const s = this.st();
      if (!F.autoCoalesceUnlocked(s)) return;
      s.galaxy.autoCoalesce.on = !s.galaxy.autoCoalesce.on;
      this.update(s, M(s));
    });
    attachTip(this.autoCoalBtn, () => ({
      title: t('galaxy.autoCoalesce'),
      body: t('galaxy.autoCoalesceTip', { r: numTag(`${C.AUTO_COALESCE_RATE * 100}%`) }),
    }));
    const coalRow2 = el('div', 'ignite-row');
    coalRow2.append(this.coalBtn, this.autoCoalBtn);
    coalesceBox.append(gtSeg, coalRow2);
    this.root.append(coalesceBox);

    this.ms = milestoneSection(
      [t('ms.gal0'), t('ms.gal1'), t('ms.gal2'), t('ms.galHard'), t('ms.gal3'), t('ms.gal4'), t('ms.gal5'), t('ms.gal6'), t('ms.gal7')],
      C.MS_GALAXY, 'ms.u.gal', s => F.effectiveCoalescences(s),
      { st: this.st, text: s => t('ms.galBreakdown', {
        raw: s.stats.coalescences, mult: numTag(fmtMult(F.coalescenceBonusMult(s))), n: s.stats.collapses,
      }) });
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
    setHTML(this.gardenTotal, t(F.effectiveCoalescences(s) >= C.MS_GALAXY[1] ? 'nova.gardenTotalFe' : 'nova.gardenTotal', {
      d: resTag('dust', `×${fmt(m.nebulaDustMult, sci)}`), p: resTag('plasma', `×${fmt(m.nebulaPlasmaMult, sci)}`),
    }));
    setVisible(this.nebContainer, !s.ui.nebulaCollapsed);
    setClass(this.nebChevron, 'collapsed', s.ui.nebulaCollapsed);
    setClass(this.nebIndicator, 'done', maxed);

    setVisible(this.chContainer, !s.ui.challengesCollapsed);
    setClass(this.chChevron, 'collapsed', s.ui.challengesCollapsed);
    setClass(this.chIndicator, 'done', challengesAllDone(s));

    for (let c = 0; c < C.CHALLENGE_COUNT; c++) {
      const r = this.chRows[c];
      const active = s.nova.challenge === c;
      const otherActive = s.nova.challenge !== -1 && !active;
      const ctier = s.nova.completedTier[c];
      const locked = s.stats.supernovae < C.CH_UNLOCK_NOVAE(c);

      setClass(r.card, 'locked', locked);
      setClass(r.card, 'active', active);

      // Gesperrt: nur Name + Freischalt-Hinweis, sonst nichts (reduziert Info, bevor sie relevant ist)
      setReserve(r.lockedLine, locked);
      setText(r.lockedLine, locked ? `🔒 ${t('nova.chLockedInfo', { v: C.CH_UNLOCK_NOVAE(c), c: s.stats.supernovae })}` : '');
      if (locked) {
        setReserve(r.activeLine, false);
        setReserve(r.restrictLine, false);
        setReserve(r.goalLine, false);
        setReserve(r.rewardLine, false);
        setReserve(r.startBtn, false);
        setClass(r.card, 'completed', false);
        setClass(r.card, 'completed-hard', false);
        setText(r.statusIcon, '🔒');
        continue;
      }

      // Kein manueller Normal/Hart-Umschalter mehr — die Karte zeigt automatisch, was als
      // Nächstes ansteht (aktiver Versuch, sonst chNextTier). null = nichts mehr zu tun:
      // entweder Hart schon geschafft, oder Hart noch nicht freigeschaltet.
      const target = active ? (s.nova.challengeTier as 1 | 2) : chNextTier(s, c);
      setClass(r.card, 'completed', ctier === 1);
      setClass(r.card, 'completed-hard', ctier >= 2);
      setText(r.statusIcon, active ? t('misc.active') : ctier >= 2 ? '★' : ctier >= 1 ? '✓' : '');

      // "Aktiver Effekt": der tatsächlich wirkende Bonus (höchste geschaffte Stufe) — getrennt
      // von "Belohnung" unten (Vorschau der NÄCHSTEN Stufe), damit beides nie verwechselt wird.
      setReserve(r.activeLine, ctier >= 1);
      if (ctier >= 1) setText(r.activeValue, t(ctier >= 2 ? `ch.${c}r2` : `ch.${c}r`));

      const showTarget = target !== null;
      setReserve(r.restrictLine, showTarget);
      setReserve(r.goalLine, showTarget);
      setReserve(r.rewardLine, showTarget);
      setReserve(r.startBtn, showTarget);
      if (showTarget) {
        const goalMult = target === 2 ? C.CH_GOAL_MULT_TIER2[c] : C.CH_GOAL_MULT[c];
        setText(r.restrictLine, `⚠ ${t(`ch.${c}d`)}`);
        setText(r.goalLine, `🎯 ${fmt(D(C.IGNITION_REQ).mul(goalMult), true)} ${t('dust.name')}`);
        setText(r.rewardValue, t(target === 2 ? `ch.${c}r2` : `ch.${c}r`));
        setText(r.startBtn, active ? t('nova.chExit') : t(target === 2 ? 'nova.chStartHard' : 'nova.chStartNormal'));
        setClass(r.startBtn, 'danger', active);
        setDisabled(r.startBtn, otherActive);
      }
    }

    // Coalescence
    const coalReq = F.coalesceReq(s);
    setBar(this.coalBar, logFrac(s.nova.totalShards, coalReq));
    const dmG = F.dmGain(s, m);
    if (F.canCoalesce(s)) {
      setHTML(this.coalLabel, t('galaxy.gain', { v: resTag('dm', fmt(dmG, sci)) }));
      setDisabled(this.coalBtn, s.nova.challenge !== -1 || dmG.lte(0));
    } else {
      setHTML(this.coalLabel, t('galaxy.req', { v: fmt(coalReq, true) }));
      setDisabled(this.coalBtn, true);
    }
    const coalCapped = F.canCoalesce(s) && F.isGainCapped(dmG, s.galaxy.totalDM);
    setClass(this.coalLabel, 'capped', coalCapped);
    setCapDisplay(this.coalCap, this.coalRow, this.coalNeed, s, m, s.galaxy.totalDM,
      C.GAIN_CLAMP_MULT, 'coalesce', 'nova.shards', 'shards', coalCapped, false);
    this.gtBtns.forEach((b, g) => {
      setClass(b, 'active', s.ui.nextGtype === g);
      setText(b, `${t(`galaxy.t${g}`)} (${s.stats.gtypePicks[g]})`);
    });
    const autoCoalOk = F.autoCoalesceUnlocked(s);
    setReserve(this.autoCoalBtn, autoCoalOk);
    setClass(this.autoCoalBtn, 'active', autoCoalOk && s.galaxy.autoCoalesce.on);

    this.ms.update(s);
  }
}

// ═══════════════ Ebene 3: Galaxy ═══════════════
export class GalaxyPanel implements Panel {
  root = el('div');
  private nodeBtns: { b: HTMLButtonElement; cost: HTMLElement }[] = [];
  private treeIndicator = el('span', 'collapse-indicator');
  private treeChevron = el('span', 'collapse-chevron', '▾');
  private treeContainer = el('div', 'tree');
  private colBar = bar('bar-sing');
  private colLabel = el('div', 'sub center');
  private colCap!: HTMLElement;
  private colRow!: HTMLElement;
  private colNeed!: HTMLElement;
  private colBtn!: HTMLButtonElement;

  constructor(private st: St, private hud: Hud) {
    const treeHead = el('h3', 'collapse-head');
    treeHead.append(el('span', '', t('galaxy.tree')), this.treeIndicator, this.treeChevron);
    treeHead.addEventListener('click', () => {
      const s = this.st();
      s.ui.constellationsCollapsed = !s.ui.constellationsCollapsed;
      this.update(s, M(s));
    });
    attachTip(this.treeIndicator, () => {
      const s = this.st();
      const bought = s.galaxy.nodes.filter(Boolean).length;
      const total = C.CONSTELLATION_NODES;
      return {
        title: t('galaxy.tree'),
        body: bought >= total ? t('galaxy.treeIndicatorDone') : t('galaxy.treeIndicatorOpen', { n: bought, total }),
      };
    });
    this.root.append(treeHead, this.treeContainer);
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
          body: `${nodeLabelBody(idx)}\n${t('misc.cost')}: ${resTag('dm', fmtInt(F.nodeCost(idx)))}`,
        }));
        this.nodeBtns.push({ b: nb, cost });
        col.append(nb);
      }
      this.treeContainer.append(col);
    }

    // Collapse-Box lebt HIER (Ebene darunter) — der Singularity-Tab existiert erst danach
    const collapseBox = el('div', 'reset-box sing');
    const colRow = resetRow(this.colLabel);
    this.colRow = colRow.row;
    this.colCap = colRow.capEl;
    this.colNeed = colRow.needEl;
    collapseBox.append(this.colBar.wrap, colRow.wrap);
    attachTip(this.colRow, () => {
      const s = this.st();
      const m = M(s);
      const capped = F.isGainCapped(F.entropyGain(s, m), s.sing.totalEntropy);
      return capTipBody(capped, false, F.chargeFrac(s, 'collapse'));
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
      [t('ms.col0'), t('ms.col1'), t('ms.col2'), t('ms.col3'), t('ms.col4')],
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
    setVisible(this.treeContainer, !s.ui.constellationsCollapsed);
    setClass(this.treeChevron, 'collapsed', s.ui.constellationsCollapsed);
    setClass(this.treeIndicator, 'done', s.galaxy.nodes.every(Boolean));
    // Collapse
    const colReq = F.collapseReq(s);
    setBar(this.colBar, logFrac(s.galaxy.totalDM, colReq));
    const entG = F.entropyGain(s, m);
    if (F.canCollapse(s)) {
      setHTML(this.colLabel, t('sing.gain', { v: resTag('entropy', fmt(entG, sci)) }));
      setDisabled(this.colBtn, s.nova.challenge !== -1 || entG.lte(0));
    } else {
      setHTML(this.colLabel, t('sing.req', { v: fmt(colReq, true) }));
      setDisabled(this.colBtn, true);
    }
    const colCapped = F.canCollapse(s) && F.isGainCapped(entG, s.sing.totalEntropy);
    setClass(this.colLabel, 'capped', colCapped);
    setCapDisplay(this.colCap, this.colRow, this.colNeed, s, m, s.sing.totalEntropy,
      C.GAIN_CLAMP_MULT, 'collapse', 'galaxy.dm', 'dm', colCapped, false);

    this.ms.update(s);
  }
}

/** Meilenstein-Liste einer Ebene: ○/✓ je Schwelle, grau bis erreicht */
function milestoneSection(
  labels: string[], thresholds: number[], unitKey: string, count: (s: GameState) => number,
  breakdown?: { st: St; text: (s: GameState) => string },
) {
  const root = el('div', 'ms-box');
  const head = el('h3', '', t('ms.title'));
  const countEl = el('span', 'ms-count', '');
  head.append(countEl);
  root.append(head);
  if (breakdown) {
    attachTip(countEl, () => ({ title: t('ms.title'), body: breakdown.text(breakdown.st()) }));
  }
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
/** Wie nodeLabel, aber mit hervorgehobenem Multiplikator — fürs Tooltip (innerHTML). */
function nodeLabelBody(i: number): string {
  const e = F.NODE_EFFECTS[i];
  const v = 'v' in e ? numTag(fmtMult(e.v as number)) : '';
  return t(`node.${e.t}`, { v });
}

// ═══════════════ Ebene 4: Singularity ═══════════════
export class SingPanel implements Panel {
  root = el('div');
  private feedBox: HTMLElement;
  private feedInfo = el('div', 'sub center');
  private dilationBox!: HTMLElement;
  private dilateInfo = el('div', 'sub center');
  private perkBtns: { b: HTMLButtonElement; lvl: HTMLElement; cost: HTMLElement }[] = [];
  private endBox: HTMLElement;
  private endBar = bar('bar-end');
  private endBtn: HTMLButtonElement;
  private uniLabel = el('div', 'sub center');
  private coalBonusBox: HTMLElement;
  private coalBonusInfo = el('div', 'sub center');

  constructor(private st: St, private hud: Hud) {
    this.coalBonusBox = el('div', 'reset-box sing');
    this.coalBonusBox.append(el('h3', '', t('sing.coalBonusTitle')), this.coalBonusInfo);
    attachTip(this.coalBonusBox, () => ({ title: t('sing.coalBonusTitle'), body: t('sing.coalBonusTip') }));
    this.root.append(this.coalBonusBox);

    this.root.append(this.uniLabel);

    this.feedBox = el('div', 'reset-box sing');
    const feedDesc = el('div', 'sub');
    feedDesc.innerHTML = t('sing.feedDesc', {
      d: resTag('dust', t('dust.name')), p: resTag('plasma', t('star.plasma')),
      s: resTag('shards', t('nova.shards')), m: resTag('dm', t('galaxy.dm')),
    });
    this.feedBox.append(el('h3', '', t('sing.feedTitle')), feedDesc, this.feedInfo);
    attachTip(this.feedBox, () => ({ title: t('sing.feedTitle'), body: t('sing.feedTip') }));
    this.root.append(this.feedBox);

    this.dilationBox = el('div', 'reset-box sing');
    this.dilationBox.append(el('h3', '', t('sing.dilate')), this.dilateInfo);
    attachTip(this.dilationBox, () => ({ title: t('sing.dilate'), body: t('sing.dilateTip') }));
    this.root.append(this.dilationBox);

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
    setHTML(this.coalBonusInfo, t('sing.coalBonusInfo', { v: numTag(fmtMult(F.coalescenceBonusMult(s))) }));

    const acc = F.accretionMult(s);
    setHTML(this.feedInfo, `${t('sing.fed', { v: numTag(fmt(s.sing.fed, sci)) })} · ${t('sing.accretion', { v: numTag(fmt(acc, sci)) })}`);

    setHTML(this.dilateInfo, t('sing.dilateInfo', { v: numTag(fmtMult(F.dilationMult(s))) }));

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
    setHTML(this.bonus, t('ach.bonus', { v: numTag(Math.pow(C.ACH_MULT, n).toFixed(2)) }));
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
