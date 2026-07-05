import { en } from './en';
import { de } from './de';
import type { Lang } from '../core/state';

const dicts: Record<Lang, Record<string, string>> = { en, de };
let current: Lang = 'en';

export function setLang(l: Lang): void { current = l; }
export function getLang(): Lang { return current; }

/** t('key', {v: '42'}) — Platzhalter {v} etc. werden ersetzt; Fallback EN, dann Key */
export function t(key: string, params?: Record<string, string | number>): string {
  let str = dicts[current][key] ?? dicts.en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) str = str.split(`{${k}}`).join(String(v));
  return str;
}
