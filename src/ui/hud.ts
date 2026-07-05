import { el, btn, setText, setVisible, setClass } from './dom';
import { fmt, fmtTime } from './format';
import { t } from '../i18n';
import type { GameState } from '../core/state';
import type { Mults } from '../core/formulas';
import { dustPerSecond } from '../core/formulas';
import type { OfflineSummary } from '../core/offline';
import { on } from '../events';
import { ACHIEVEMENT_META } from '../core/achievements';
import { hideTip } from './tooltip';

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

  constructor(private stateRef: () => GameState) {
    this.root = document.getElementById('ui')!;
    const top = el('div', 'topbar');
    for (const [id, icon] of [['dust', '✦'], ['plasma', '☀'], ['shards', '✸'], ['dm', '◈'], ['entropy', '◉']] as const) {
      const wrap = el('div', `pill pill-${id}`);
      wrap.append(el('span', 'pill-icon', icon));
      const val = el('span', 'pill-val', '0');
      const rate = el('span', 'pill-rate', '');
      wrap.append(val, rate);
      this.pills[id] = { wrap, val, rate };
      top.append(wrap);
    }
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

    for (const tab of this.tabs) {
      setVisible(tab.btn, tab.show(s));
      if (tab.id === this.activeTab) tab.panel.update(s, m);
    }
    // Pending-Queues → Toasts (Events feuern via emit in main)
  }

  toast(title: string, body: string, kind = ''): void {
    const tst = el('div', `toast ${kind}`);
    tst.append(el('div', 'toast-title', title), el('div', 'toast-body', body));
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

  /** Sprache gewechselt → statische Texte neu setzen */
  relabel(): void {
    for (const tab of this.tabs) tab.btn.textContent = t(`tab.${tab.id}`);
  }
}

export function achLabel(i: number): string {
  const meta = ACHIEVEMENT_META[i];
  const v = meta.k === 'gen' ? t(`gen.${meta.v}`) : meta.k === 'el' ? t(`el.${meta.v}`) : meta.v;
  return t(`achd.${meta.k}`, { v });
}
