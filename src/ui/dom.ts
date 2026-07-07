/** Minimale DOM-Helfer + Dirty-Text-Updates (DOM-Write nur bei Änderung). */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className = '', text = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

export function btn(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, text);
  b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  return b;
}

const lastText = new WeakMap<Node, string>();
/** setzt textContent nur bei Änderung — vermeidet Layout-Thrash im RAF-Loop */
export function setText(node: Node, text: string): void {
  if (lastText.get(node) !== text) {
    lastText.set(node, text);
    node.textContent = text;
  }
}

const lastHTML = new WeakMap<Node, string>();
/** wie setText, aber innerHTML — für Labels mit <span class="tip-res">/<b class="tip-num">
 *  Hervorhebung. Sicher, weil ausschließlich intern generiert (nie Spieler-/Netzwerk-Eingabe). */
export function setHTML(elem: HTMLElement, html: string): void {
  if (lastHTML.get(elem) !== html) {
    lastHTML.set(elem, html);
    elem.innerHTML = html;
  }
}

export function setVisible(elem: HTMLElement, visible: boolean): void {
  const want = visible ? '' : 'none';
  if (elem.style.display !== want) elem.style.display = want;
}
/** wie setVisible, aber der Platz bleibt im Layout erhalten (visibility statt display) —
 *  für Elemente, die auftauchen/verschwinden, ohne den Rest zu verschieben. */
export function setReserve(elem: HTMLElement, visible: boolean): void {
  const want = visible ? '' : 'hidden';
  if (elem.style.visibility !== want) elem.style.visibility = want;
}

export function setDisabled(b: HTMLButtonElement, disabled: boolean): void {
  if (b.disabled !== disabled) b.disabled = disabled;
}

export function setClass(elem: HTMLElement, cls: string, onOff: boolean): void {
  if (elem.classList.contains(cls) !== onOff) elem.classList.toggle(cls, onOff);
}

/**
 * Kurzes Shake+Rot-Flash für einen Klick, der nichts bewirkt hat (z. B. Kauf-Button, der
 * zwischen dem letzten UI-Update (10 Hz) und dem Klick knapp unbezahlbar wurde — sonst sieht
 * das wie ein zufälliger Aussetzer aus, dabei war schlicht in diesem Sekundenbruchteil zu wenig
 * Ressource da). Reflow-Trick (`offsetWidth` lesen), damit die Animation auch bei schnell
 * wiederholten Fehlversuchen jedes Mal neu von vorne abspielt statt nur einmal zu greifen.
 */
export function flashDenied(elem: HTMLElement): void {
  elem.classList.remove('denied');
  void elem.offsetWidth;
  elem.classList.add('denied');
}
