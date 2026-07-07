import { el, btn, setText, setVisible, setClass } from './dom';
import { fmt, fmtTime } from './format';
import { t } from '../i18n';
import type { GameState } from '../core/state';
import type { Mults } from '../core/formulas';
import { dustPerSecond, remnantParams } from '../core/formulas';
import type { OfflineSummary } from '../core/offline';
import { on } from '../events';
import { ACHIEVEMENT_META } from '../core/achievements';
import { hideTip, attachTip } from './tooltip';
import { REMNANT_PULSAR_MULT, STAR_CLASSES } from '../core/constants';
import { fmtMult, numTag, resTag } from './format';

export interface Panel { root: HTMLElement; update(s: GameState, m: Mults): void; }

/** UI-Shell: Ressourcen-Leiste, Tab-Navigation, Panel-Host, Toasts, Modals. */
export class Hud {
  root: HTMLElement;
  private pills: Record<string, { wrap: HTMLElement; val: HTMLElement; rate?: HTMLElement }> = {};
  private tabBar = el('nav', 'tabbar');
  private panelHost = el('div', 'panel-host');
  private toastHost = el('div', 'toast-host');
  private modalHost = el('div', 'modal-host');
  private tabs: { id: string; btn: HTMLButtonElement; panel: Panel; scene?: number; show: (s: GameState) => boolean }[] = [];
  activeTab = 'dust';
  private collapsed = false;
  private pulsarPill!: HTMLElement;
  private pulsarVal!: HTMLElement;
  private classPill!: HTMLElement;
  private classVal!: HTMLElement;
  private lastPulsarPeriod = 60;

  constructor(private stateRef: () => GameState) {
    this.root = document.getElementById('ui')!;
    const top = el('div', 'topbar');
    const resName = { dust: 'dust.name', plasma: 'star.plasma', shards: 'nova.shards', dm: 'galaxy.dm', entropy: 'sing.entropy' } as const;
    for (const [id, icon] of [['dust', '✦'], ['plasma', '☀'], ['shards', '✸'], ['dm', '◈'], ['entropy', '◉']] as const) {
      const wrap = el('div', `pill pill-${id}`);
      wrap.append(el('span', 'pill-icon', icon));
      const val = el('span', 'pill-val', '0');
      const rate = el('span', 'pill-rate', '');
      wrap.append(val, rate);
      attachTip(wrap, () => ({ title: `${icon} ${t(resName[id])}`, body: '' }), { marker: false });
      this.pills[id] = { wrap, val, rate };
      top.append(wrap);
    }
    // Sternklassen-Buff: permanent aktiv, gewählt bei der Zündung
    this.classPill = el('div', 'pill pill-class');
    this.classPill.append(el('span', 'pill-icon', '★'));
    this.classVal = el('span', 'pill-val', '');
    this.classPill.append(this.classVal);
    attachTip(this.classPill, () => {
      const s = this.stateRef();
      const cls = STAR_CLASSES[s.star.cls];
      return {
        title: `★ ${t(`star.class${s.star.cls}`)}`,
        body: `${t('star.classEff', { s: numTag(`×${fmtMult(cls.speed)}`), p: numTag(`×${fmtMult(cls.plasmaGain)}`) })}\n${t('hud.classTip')}`,
      };
    });
    top.append(this.classPill);

    // Pulsar-Burst-Status: aktiv = Restdauer, sonst Countdown bis zum nächsten Burst
    this.pulsarPill = el('div', 'pill pill-pulsar');
    this.pulsarPill.append(el('span', 'pill-icon', '⚡'));
    this.pulsarVal = el('span', 'pill-val', '');
    this.pulsarPill.append(this.pulsarVal);
    attachTip(this.pulsarPill, () => {
      const s = this.stateRef();
      const rp = remnantParams(s);
      const burst = REMNANT_PULSAR_MULT + rp.pulsarPer * Math.max(0, s.nova.remnants[1] - 1);
      const phase = s.nova.pulsarPhase;
      const v = numTag(`×${burst}`);
      if (rp.pulsarDur >= this.lastPulsarPeriod) {
        return { title: t('pulsar.title'), body: t('pulsar.perma', { v }) };
      }
      const active = phase < rp.pulsarDur;
      return {
        title: t('pulsar.title'),
        body: active
          ? t('pulsar.active', { v, t: Math.ceil(rp.pulsarDur - phase) })
          : t('pulsar.idle', { t: Math.ceil(this.lastPulsarPeriod - phase), v, d: rp.pulsarDur }),
      };
    });
    top.append(this.pulsarPill);

    const collapseBtn = btn('collapse-btn', '▾', () => {
      this.collapsed = !this.collapsed;
      document.body.classList.toggle('panels-collapsed', this.collapsed);
      collapseBtn.textContent = this.collapsed ? '▴' : '▾';
    });
    top.append(collapseBtn);
    this.root.append(top, this.panelHost, this.tabBar, this.toastHost, this.modalHost);

    on('achievement', d => this.toast('🏆 ' + t('ach.unlocked'), achLabel(d as number), 'ach'));
    on('lore', d => this.toast('✧', t(`lore.${d as number}`), 'lore'));
  }

  addTab(id: string, panel: Panel, show: (s: GameState) => boolean, scene?: number): void {
    const b = btn('tab', t(`tab.${id}`), () => this.selectTab(id));
    b.dataset.tab = id;
    this.tabBar.append(b);
    panel.root.classList.add('panel');
    setVisible(panel.root, false);
    this.panelHost.append(panel.root);
    this.tabs.push({ id, btn: b, panel, scene, show });
  }

  /** Alle Tabs+Panels entfernen (Sprachwechsel: UI wird ohne Reload neu aufgebaut) */
  clearTabs(): void {
    for (const tab of this.tabs) {
      tab.btn.remove();
      tab.panel.root.remove();
    }
    this.tabs = [];
  }

  selectTab(id: string): void {
    hideTip();   // Panelwechsel kann das gehoverte Element verstecken — nie hängen lassen
    this.activeTab = id;
    const s = this.stateRef();
    for (const tab of this.tabs) {
      setClass(tab.btn, 'active', tab.id === id);
      setVisible(tab.panel.root, tab.id === id);
      if (tab.id === id && tab.scene !== undefined) s.ui.scene = tab.scene;
    }
  }

  update(s: GameState, m: Mults): void {
    setText(this.pills.dust.val, fmt(s.dust.amount, s.settings.sciNotation));
    setText(this.pills.dust.rate!, `+${fmt(dustPerSecond(s, m), s.settings.sciNotation)}${t('unit.perSec')}`);
    setVisible(this.pills.plasma.wrap, s.star.unlocked);
    setText(this.pills.plasma.val, fmt(s.star.plasma, s.settings.sciNotation));
    setVisible(this.pills.shards.wrap, s.nova.unlocked);
    setText(this.pills.shards.val, fmt(s.nova.shards, s.settings.sciNotation));
    setVisible(this.pills.dm.wrap, s.galaxy.unlocked);
    setText(this.pills.dm.val, fmt(s.galaxy.dm, s.settings.sciNotation));
    setVisible(this.pills.entropy.wrap, s.sing.unlocked);
    setText(this.pills.entropy.val, fmt(s.sing.entropy, s.settings.sciNotation));

    // Sternklassen-Pill: sichtbar sobald ein Stern brennt; Farbe je Klasse
    setVisible(this.classPill, s.star.unlocked);
    if (s.star.unlocked) {
      setText(this.classVal, t(`star.class${s.star.cls}`));
      for (let c = 0; c < 3; c++) setClass(this.classPill, `cls${c}`, s.star.cls === c);
    }

    // Pulsar-Burst-Pill
    const pulsars = s.nova.remnants[1];
    setVisible(this.pulsarPill, pulsars > 0);
    if (pulsars > 0) {
      this.lastPulsarPeriod = m.pulsarPeriod;
      const rp = remnantParams(s);
      const phase = s.nova.pulsarPhase;
      const perma = rp.pulsarDur >= m.pulsarPeriod;
      const active = perma || phase < rp.pulsarDur;
      setClass(this.pulsarPill, 'burst', active);
      setText(this.pulsarVal, perma
        ? `×${REMNANT_PULSAR_MULT + rp.pulsarPer * (pulsars - 1)} · ∞`
        : active
          ? `×${REMNANT_PULSAR_MULT + rp.pulsarPer * (pulsars - 1)} · ${Math.ceil(rp.pulsarDur - phase)}s`
          : `${Math.ceil(m.pulsarPeriod - phase)}s`);
    }

    for (const tab of this.tabs) {
      setVisible(tab.btn, tab.show(s));
      if (tab.id === this.activeTab) tab.panel.update(s, m);
    }
    // Pending-Queues → Toasts (Events feuern via emit in main)
  }

  toast(title: string, body: string, kind = ''): void {
    const tst = el('div', `toast ${kind}`);
    const bodyEl = el('div', 'toast-body');
    bodyEl.innerHTML = body;  // achLabel() liefert gezielt <b class="tip-num">/<span class="tip-res"> — rein intern generiert
    tst.append(el('div', 'toast-title', title), bodyEl);
    this.toastHost.append(tst);
    requestAnimationFrame(() => tst.classList.add('show'));
    setTimeout(() => {
      tst.classList.remove('show');
      setTimeout(() => tst.remove(), 500);
    }, kind === 'lore' ? 9000 : 4500);
  }

  confirm(title: string, body: string, onYes: () => void): void {
    const s = this.stateRef();
    if (!s.settings.confirmResets) { onYes(); return; }
    const back = el('div', 'modal-back');
    const box = el('div', 'modal');
    box.append(el('h3', '', title), el('p', '', body));
    const rowEl = el('div', 'modal-row');
    rowEl.append(
      btn('primary', t('btn.confirm'), () => { back.remove(); onYes(); }),
      btn('', t('btn.cancel'), () => back.remove()),
    );
    box.append(rowEl);
    back.append(box);
    this.modalHost.append(back);
  }

  offlineDialog(sum: OfflineSummary, sci: boolean): void {
    const back = el('div', 'modal-back');
    const box = el('div', 'modal');
    box.append(el('h3', '', t('offline.title')), el('p', '', t('offline.desc', { t: fmtTime(sum.realSeconds) })));
    const list = el('div', 'offline-list');
    if (sum.dust.gt(0)) list.append(el('div', '', t('offline.dust', { v: fmt(sum.dust, sci) })));
    if (sum.plasma.gt(0)) list.append(el('div', '', t('offline.plasma', { v: fmt(sum.plasma, sci) })));
    if (sum.shards.gt(0)) list.append(el('div', '', t('offline.shards', { v: fmt(sum.shards, sci) })));
    if (sum.dm.gt(0)) list.append(el('div', '', t('offline.dm', { v: fmt(sum.dm, sci) })));
    if (sum.ignitions > 0) list.append(el('div', '', t('offline.ignitions', { v: String(sum.ignitions) })));
    if (sum.supernovae > 0) list.append(el('div', '', t('offline.supernovae', { v: String(sum.supernovae) })));
    box.append(list, btn('primary', t('btn.close'), () => back.remove()));
    back.append(box);
    this.modalHost.append(back);
  }

  private offlineProgBack: HTMLElement | null = null;
  private offlineProgFill: HTMLElement | null = null;
  /** Zeigt einen Fortschrittsdialog über der (bereits laufenden) Spielszene, solange
   *  `simulateOfflineGen()` in Chunks durchläuft — sonst starrt der Spieler bei langer
   *  Abwesenheit auf einen eingefrorenen Bildschirm ohne jede Rückmeldung. */
  showOfflineProgress(): void {
    const back = el('div', 'modal-back');
    const box = el('div', 'modal offline-progress');
    box.append(el('h3', '', t('offline.progressTitle')), el('p', '', t('offline.progressDesc')));
    const barWrap = el('div', 'bar bar-offline');
    this.offlineProgFill = el('div', 'bar-fill');
    barWrap.append(this.offlineProgFill);
    box.append(barWrap);
    back.append(box);
    this.modalHost.append(back);
    this.offlineProgBack = back;
  }
  updateOfflineProgress(frac: number): void {
    if (this.offlineProgFill) this.offlineProgFill.style.width = `${Math.min(100, Math.max(0, frac * 100)).toFixed(1)}%`;
  }
  hideOfflineProgress(): void {
    this.offlineProgBack?.remove();
    this.offlineProgBack = null;
    this.offlineProgFill = null;
  }

  /** Sprache gewechselt → statische Texte neu setzen */
  relabel(): void {
    for (const tab of this.tabs) tab.btn.textContent = t(`tab.${tab.id}`);
  }
}

const ACH_RES_KEYS = new Set(['dust', 'plasma', 'shards']);
export function achLabel(i: number): string {
  const meta = ACHIEVEMENT_META[i];
  if (meta.k === 'gen') return t('achd.gen', { v: t(`gen.${meta.v}`) });
  if (meta.k === 'el') return t('achd.el', { v: t(`el.${meta.v}`) });
  if (!meta.v) return t(`achd.${meta.k}`);
  const v = ACH_RES_KEYS.has(meta.k) ? resTag(meta.k as 'dust' | 'plasma' | 'shards', meta.v) : numTag(meta.v);
  return t(`achd.${meta.k}`, { v });
}
