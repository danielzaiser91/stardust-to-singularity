# Discord-Server einrichten

Der Abspann (erstes "Werde ein neues Universum") verlinkt bereits auf einen Discord-Button —
er bleibt unsichtbar, bis hier eine echte Einladung eingetragen ist. Sobald du den Server hast,
ist nur noch **ein** Eintrag nötig, siehe ganz unten.

## 1. Server erstellen

1. Discord öffnen → "+" (Server hinzufügen) → "Erstelle den eigenen" → "Für einen Club oder eine
   Community".
2. Name: z. B. **Stardust to Singularity**.
3. Icon: ein Screenshot der Galaxie- oder Schwarzloch-Szene funktioniert gut als Platzhalter.

## 2. Empfohlene Kanäle

Minimal, wie bei den anderen Projekten (chrome-utilities, anime-adventure):

- **#welcome** — kurze Begrüßung + Link zum Spiel
  (`https://danielzaiser91.github.io/stardust-to-singularity/`)
- **#news** — Patchnotes/Updates. Für automatische Posts bei jedem Push gibt es bereits die
  Automation aus den anderen Projekten — einfach `/ai-implement-discord-news-automation`
  in einer neuen Claude-Code-Session in diesem Ordner ausführen, sobald der Webhook existiert
  (Schritt 4).
- **#general** — freie Unterhaltung
- **#feedback** — Bug-Reports & Balance-Feedback (das, was du mir bisher direkt geschickt hast)
- **#suggestions** — Ideen für neue Features/Perks/Konstellationen

Reihenfolge/Anzahl ist bei Discord jederzeit änderbar — nicht überdenken, einfach starten.

## 3. Rollen (optional, kann später)

Für den Start reicht die Standard-@everyone-Rolle. Falls gewünscht später:
- **Supporter/Patron** — falls mal Spenden/Ko-fi dazukommt
- **Tester** — für Leute, die Beta-Balance-Changes vorab testen sollen

## 4. Einladungslink erzeugen

1. Rechtsklick auf den Server-Namen → "Server bearbeiten" oder direkt einen Kanal → "Einladen".
2. Ablaufzeit: **Niemals** (permanenter Link, sonst bricht der Button im Spiel irgendwann).
3. Max. Nutzung: **Kein Limit**.
4. Link kopieren (Format: `https://discord.gg/XXXXXXX`).

## 5. Link ins Spiel eintragen

In [`src/social.ts`](src/social.ts) die Zeile

```ts
export const DISCORD_URL = '';
```

zu

```ts
export const DISCORD_URL = 'https://discord.gg/XXXXXXX';
```

ändern, committen, pushen — fertig. Der Discord-Button im Abspann-Dialog erscheint danach
automatisch (er ist im Code bereits an `DISCORD_URL` gekoppelt, kein weiterer Code nötig).

## 6. (Optional) News-Webhook automatisieren

Sobald der Server + `#news`-Kanal existieren: in Discord → Kanal-Einstellungen → Integrationen →
Webhook erstellen → URL kopieren → in `C:\code\ai\ai helper files\my_secrets.md` unter
"Discord Webhooks" ergänzen (gleiches Format wie die bestehenden Einträge) → danach
`/ai-implement-discord-news-automation` ausführen, um automatische Patchnotes-Posts bei jedem
Push einzurichten (GitHub Actions Workflow, wie bei den anderen Projekten).
