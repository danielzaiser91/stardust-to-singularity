/** Mini-Pub/Sub: UI/Core-Aktionen → Render-/Audio-Effekte. Kein State-Transport. */
export type GameEvent =
  | 'click' | 'buy' | 'comet-caught' | 'comet-spawn'
  | 'gen-bought' | 'gen-first'   // Generator-Kauf (data = Stufe); -first = allererster Kauf der Stufe
  | 'ignite' | 'supernova' | 'coalesce' | 'collapse' | 'universe'
  | 'achievement' | 'lore' | 'feed' | 'dilate' | 'nebula-placed' | 'node-bought';

type Handler = (data?: unknown) => void;
const handlers = new Map<GameEvent, Set<Handler>>();

export function on(ev: GameEvent, fn: Handler): void {
  if (!handlers.has(ev)) handlers.set(ev, new Set());
  handlers.get(ev)!.add(fn);
}
export function emit(ev: GameEvent, data?: unknown): void {
  handlers.get(ev)?.forEach(fn => fn(data));
}
