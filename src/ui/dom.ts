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

export function setVisible(elem: HTMLElement, visible: boolean): void {
  const want = visible ? '' : 'none';
  if (elem.style.display !== want) elem.style.display = want;
}

export function setDisabled(b: HTMLButtonElement, disabled: boolean): void {
  if (b.disabled !== disabled) b.disabled = disabled;
}

export function setClass(elem: HTMLElement, cls: string, onOff: boolean): void {
  if (elem.classList.contains(cls) !== onOff) elem.classList.toggle(cls, onOff);
}
