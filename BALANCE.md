# Balance-Modell

Wie „Stardust to Singularity" sein Pacing erzwingt — und warum. Alle Zahlen leben in
[src/core/constants.ts](src/core/constants.ts), validiert durch `npm run sim` und `tests/balance.test.ts`.

## Die vier Pacing-Mechanismen

Incremental-Engines mit Buy-Max-Autobuyern wachsen **super-exponentiell** — jede naive Formel
explodiert (das haben unsere Simulationen wiederholt bewiesen: Singularität nach 5 Stunden,
NaN-Overflows, 47.000 Zündungen/Tag). Vier Mechanismen halten die Progression in Form:

1. **Frequenzskalierte Gain-Clamps** (`GAIN_CLAMP_MULT`, `PLASMA_CLAMP_MULT`): Kein Reset kann
   die Gesamtsumme seiner Prestige-Währung um mehr als einen festen Faktor heben — ×20 für den
   30-Sekunden-Innenloop (Plasma), ×4 für die äußeren Ebenen (Shards/DM/Entropie). Damit ist
   Layer-Leapfrogging *mathematisch unmöglich*, egal wie sehr die Engine darunter explodiert.
   Wachstum = Reset-Kadenz × Clamp-Faktor. Der Faktor MUSS zur Schleifenfrequenz passen:
   ×4 auf dem Innenloop verhungert die Fe-Pipeline, kein Clamp auf dem Innenloop divergiert.

2. **Lokale, gecappte Anforderungs-Leitern**: Jede Supernova ×1,8 Fe, jede Galaxie ×3 Scherben —
   die Zähler (`nova.count`, `galaxy.count`) resetten mit dem Eltern-Layer, und die Leitern
   steigen nur bis zu einem Cap (`NOVA_LADDER_CAP` 60 / `GALAXY_LADDER_CAP` 25), danach bleibt
   die Anforderung konstant und die weiter wachsende Engine überholt sie wieder. Ohne Cap
   sättigt die Scherben-Ausbeute tief im Run und jede Ebene darüber verhungert (empirisch:
   Singularität Tag 16 statt Tag 11); lebenslange Zähler erzeugen permanente Walls
   (Fe-Anforderung e3548 nach 8908 Novae) und brechen NG+.

3. **Quadratische Kollaps-Leiter** (`collapsesU`, Exponent n(n+1)/2): Die oberste Ebene braucht
   eine Leiter, die der beschleunigende DM-Motor nicht einholen kann — geometrisch reicht nicht
   (empirisch: 4 Kollapse/Tag bei ×8). Der Zähler resettet bei NG+ („New Universe").

4. **Aufladezeiten + Softcap** (`*_MIN_TIME`, `GAIN_SOFTCAP`): Voller Gain erst 10 min /
   40 min / 2 h nach dem letzten Reset der Ebene (Kadenz-Boden; thematisch: der Kern muss
   sich anreichern). Der Plasma-Softcap (Tail ^0,2 ab ratio 1e3) glättet zusätzlich
   Overkill-Spitzen im Frühspiel.

## Meilenstein-Persistenz (Roguelite-Prinzip)

Die Meilenstein-Leitern der Dust-/Star-Ebene laufen auf Run-Zählern: `stats.ignMs`
(Zündungs-Meilensteine, resettet bei **jeder Supernova** mitsamt Klassen-Picks und damit auch
der Kompressions-Persistenz) und `stats.novaMs` (Supernova-Meilensteine, resettet bei der
Coalescence). Die Galaxie-Meilensteine (`MS_GALAXY`) machen sie dauerhaft:
Typ-Wahl (1) · Reflexionsnebel boosten auch Fe (2) · Challenges bleiben (3) ·
Zündungs-Meilensteine (6) · Supernova-Meilensteine (9) · Nebelgarten (12). Wichtig: eigene Zähler, NICHT `nova.count`/`galaxy.count` wiederverwenden —
die treiben die Anforderungs-Leitern (Mechanismus 2) und dürfen niemals persistieren.
Sim-validiert: erste Singularität weiterhin ~4,5 d (aktiv, Seed 42), die Re-Earn-Schleife
pro Galaxie kostet den Bot nur Minuten.

## Auto-Trickle (Auto-Zündung & Auto-Supernova)

Automation zahlt **kontinuierlich einen Anteil des aktuellen Prestige-Gewinns pro Tick** aus;
bei 100 % Akkumulation zählt ein echtes Reset-Event (Meilenstein-Zähler bzw. volle Supernova
mit Remnant, Fe-Leiter und Charge-Neustart).

**Die Rate MUSS zur Clamp-Wachstumsrate der Ebene passen**, sonst fühlt sich Auto zwingend
schwächer an als manuelles Spammen und der Spieler wird zum Klicken genötigt (empirischer
Fehler: 1 %/s bei ×19-Clamp = Wachstum ×1,19/s statt der ×20/s des Spams — Faktor-Trilliarden
Rückstand pro Minute). Ein voller manueller Reset am Clamp multipliziert die Gesamtwährung um
`(mult+1)`; das kontinuierliche Äquivalent EINES solchen Resets pro Sekunde ist
`ln(mult+1)/mult`. Daher:
- **Auto-Zündung** (`AUTO_IGNITE_RATE = ln(20)/19 ≈ 15,8 %/s`): so stark wie perfekter
  1×/s-Zünd-Spam am ×19-Plasma-Clamp. Aktiver Hyper-Spam behält durch Diskretisierung nur
  einen hauchdünnen Vorsprung.
- **Auto-Supernova** (`AUTO_NOVA_RATE = 1 %/s`): bewusst niedriger — die 10-min-Aufladezeit
  (`NOVA_MIN_TIME`) limitiert die Supernova ohnehin, das Reset-Event bei 100 % startet die
  Ladung neu, sodass patientes manuelles Novaen stärker bleibt.

Sim-validiert (Seed 42): aktiv Singularität ~2,5 d (unverändert), idle erste Galaxie ~8,8 h
(vorher ~20 h) — Auto-Zündung schließt im ignitionsdominierten Frühspiel fast zum aktiven
Spiel auf, der aktive Vorsprung verlagert sich in die tieferen Ebenen.

## Kaskade ohne Whiplash

Jede Prestige-Währung boostet die Ebenen darunter — aber auf Basis von **Lifetime-Summen**
(`stats.lifetimeShards`, `stats.lifetimeDM`, `sing.totalEntropy`), die nie zurückgesetzt werden.
Ein Prestige fühlt sich dadurch nie wie ein Rückschritt an (früher Fehler: nach dem ersten
Kollaps war das Spiel *langsamer* als davor, weil die Passiveffekte am Run-Total hingen).

## Gelernte Anti-Patterns (nicht wieder einführen!)

- **Effekte in Exponenten stapeln**: Dunkelnebel verdoppelten ursprünglich den *Exponenten*
  der Nachbarzellen → 3^64 ≈ 1e30 Boost aus einem Hexfeld. Effekte immer multiplikativ
  und linear stapeln. (Heute: Dunkelnebel verdoppeln den *linearen Multiplikator* des
  Nachbarn — sicher, weil die Hex-Geometrie das auf ×64 je Zelle deckelt.)
- **`Math.pow` für unbeschränkte Zähler**: `Math.pow(1.25, compression)` überläuft bei
  ~5000 Stufen zu `Infinity` und vergiftet den State mit NaN. Für alles Unbeschränkte
  `Decimal.pow` nutzen.
- **Challenge = voller Layer-Reset**: Der Bot (und echte Spieler) verlieren sonst beim
  Betreten alles und stecken in einer Frust-Schleife. Challenges resetten nur die Dust-Ebene
  und haben eigene, eskalierende Ziele (`CH_GOAL_MULT`) plus Freischaltung über
  Supernova-Zähler (`CH_UNLOCK_NOVAE`).
- **Autobuyer-Budget als `dust.mul(frac)` deckeln**: Bricht sobald `dust` Layer-2-Skala
  erreicht (break_eternity-Notation `ee16...`, siehe `fmt()`). Ein Decimal mit `mul(0.3)`
  oder sogar `mul(1e-100)` ist dort **bit-identisch** zum Original — die Rundung
  verschluckt jeden endlichen Faktor, weil die Mantisse an dieser Größenordnung keine
  Präzision mehr für den Unterschied hat. Ein Autobuyer, der so "gedeckelt" wird, kauft
  in Wahrheit weiterhin mit 100 % Budget und frisst den sichtbaren Staub auf 0 (führte
  zu genau diesem Bug in Produktion). Fix: die Kauf**menge** `n` (eine normale JS-Zahl)
  auf einen Anteil reduzieren, nicht das Decimal-Budget — `capAffordCount()` in
  `decimal.ts`. `n * frac` bleibt exakt, und weniger Einheiten senken die Kosten dank
  exponentiellem Wachstum drastisch (nicht nur um denselben Faktor).
- **`affordGeometric` kann bei extremen Skalen NaN liefern → permanente Save-Korruption**:
  `inner.log(growth).toNumber()` gab bei sehr hohem `bought` (mehrere hundert Ignitionen
  Autobuy-Wachstum) NaN zurück (break_eternity-Grenzfall). Das Ergebnis landet direkt in
  `dust.compression`/`gens[].bought` — **normale JS-Zahlen, keine Decimals** — und
  `compression` überlebt Ignitionen ab `MS_IGNITION[2]`, vergiftet also ab da JEDEN
  folgenden Tick (`Decimal.pow(x, NaN)`), bis Staub komplett `NaN` ist. Zusätzlich ließ
  `fmt()`s rekursiver Extrem-Skalen-Zweig (`` `e${fmt(new Decimal(e))}` ``) bei NaN-Input
  den Browser-Tab mit "Maximum call stack size exceeded" abstürzen (e bleibt NaN, Abbruch
  greift nie). Fix dreiteilig: (1) `affordGeometric` gibt bei nicht-finitem Ergebnis 0
  zurück statt NaN durchzureichen: (2) `fmt()` prüft `d.isNan() || !d.isFinite()` als
  allererstes und rendert `'0'`; (3) `save.ts` hat jetzt eine `sanitize()`-Pass nach dem
  Laden, die jedes NaN/Infinity (Decimal wie normale Zahl) im gesamten State auf 0
  zurücksetzt — heilt bereits korrumpierte Saves beim nächsten Laden, statt sie für immer
  zu bricken. Lehre: **jede `.toNumber()`-Konvertierung eines Decimals, deren Ergebnis in
  ein normales `number`-Feld des States fließt, braucht einen `Number.isFinite()`-Guard**
  — die Decimal-Bibliothek selbst ist an ihren eigenen Grenzen nicht narrensicher.

## Gemessene Timeline (aktives Optimalspiel, Sim-Bot, Seed 42)

| Meilenstein | gemessen |
|---|---|
| Erste Ignition | ~28 min (idle: ~37 min) |
| Erste Supernova | ~2,9 h (idle: ~4,8 h) |
| Alle 8 Challenges | ~1,5 d |
| Erste Galaxie | ~8,7 h |
| Erste Singularität | ~Tag 2,6 |
| Endgame (Neues Universum) | siehe unten — in Nachjustierung |

Alle 5 Ebenen sind damit binnen ~3 Tagen erlebbar; der NG+-Abschluss ist bewusst
Langzeit-Territorium. Ein menschlicher Spieler ohne Optimal-Strategie liegt über diesen
Werten.
Prüfen mit: `npx tsx src/sim/run.ts --until endgame --profile active --maxDays 40`

### Endgame-Kalibrierung (Kollaps-Kadenz vs. Hawking-Motor) — OFFEN, kein Constants-Fix bisher wirksam

40-Tage-Endgame-Lauf (Seed 42, aktiv): nur **2 Kollapse in 40 Tagen**, Endgame (2500 Entropie)
nicht erreicht. Ursache: Die quadratische Kollaps-Leiter (`COLLAPSE_REQ_GROWTH^(n(n+1)/2)`,
Mechanismus 3) wächst pro Stufe ×8^n — der Hawking-finanzierte Motor (H-Rate ×`PERK_HAWKING_H`
je Level) hält damit nicht mit, weil Hawking-Level durch Entropie finanziert werden, die nur bei
einem Kollaps anfällt (gedeckelt auf ×4 des bisherigen Totals, Mechanismus 1) — ein
selbstverstärkender Engpass zwischen Kollaps #2 und #3.

**Zwei Konstanten-Fixes geprüft und beide verworfen** (per schnellem 6-Tage-Diagnose-Sim, dann
Determinismus-Kontrolle gegen einen zweiten identischen Lauf — kein RNG-Bug, die Unterschiede
sind reale Folgen der geänderten Kaufentscheidung):

1. **`PERK_COST_GROWTH[1]` 4→3** (Hawking-Level billiger bei höheren Stufen): **wirkungslos**.
   Nach 2 Kollapsen liegt das gesamte je verdiente Entropie-Budget bei ~9 — viel zu wenig, um
   überhaupt die Stufe zu erreichen, ab der Wachstumsrate 3 vs. 4 einen Unterschied macht
   (Kosten bei Stufe 0 sind in beiden Fällen identisch: `base × growth^0 = base`). Der Bot kaufte
   in beiden Fällen exakt 1 Hawking-Level + 2 Level des Event-Horizon-Perks — bit-identische
   Ignitions-/Supernova-/Kollaps-Zahlen bei Tag 6.
2. **`PERK_BASE_COST[1]` 3→1** (Hawking von Grund auf billiger): **schädlich**. Der Bot kauft
   Perks in fester Priorität (Hawking zuerst, dann Event Horizon `perks[0]`, dann Rest) —
   ein billigeres Hawking saugt das knappe frühe Entropie-Budget stärker auf und lässt weniger
   für Event Horizon (`perkDust = 10^Level`, ein direkter, sehr starker früher Dust-Hebel) übrig.
   Ergebnis nach 6 Tagen: nur 1 statt 2 Kollapse, ~106K statt ~242K Ignitions — die Umverteilung
   verlangsamt die frühe Kaskade stärker, als der stärkere Hawking-Level sie beschleunigt.

**Fazit:** Beide Konstanten wurden auf ihre Originalwerte zurückgesetzt (kein unbewiesener Fix im
Code). Das Problem ist strukturell, kein einzelner Zahlendreher: Die Kollaps-Leiter (×8 pro
Dreieckszahl) wächst schneller, als das Entropie-gefinanzierte Perk-System in vernünftiger Zeit
mithalten kann, UND die Perks konkurrieren um dasselbe knappe Frühspiel-Budget. Ein echter Fix
braucht eine Design-Entscheidung, keinen Constants-Tweak — Kandidaten:
- Eigener, höherer Gain-Clamp-Multiplikator nur für Entropie (löst das „nur ×4 Budget pro
  Kollaps"-Problem, hat aber Rückwirkung auf NG+-Pacing)
- Hawking aus der gemeinsamen Perk-Kosten-Konkurrenz lösen (eigene Währung? Auto-finanziert?)
- Kollaps-Leiter entschärfen (`COLLAPSE_REQ_GROWTH` senken oder Exponent-Formel ändern)
- Akzeptieren, dass Endgame > Tag 40 liegt und `maxDays` für die Zielsetzung anheben

Offen in [todo.md](todo.md); braucht Nutzer-Entscheidung, welcher Hebel gezogen wird, bevor
weiter am Constants-Sheet gedreht wird.
