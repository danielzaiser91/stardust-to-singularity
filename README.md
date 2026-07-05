# Stardust to Singularity

**A 3D incremental game — from a single mote of dust to the singularity.**

🎮 **Play now:** https://danielzaiser91.github.io/stardust-to-singularity/

Begin as a speck of cosmic dust. Attract matter, ignite a star, fuse elements to iron, go supernova, seed nebulae, coalesce a galaxy, and finally collapse into a singularity — five prestige layers, each with its own mechanics and its own fully animated 3D scene.

## Features

- 🌌 **5 cosmic scales**, each a unique reset layer with a brand-new core mechanic
- ✨ **Real-time 3D** — GPU particles, procedural shaders, bloom, a gravitationally-lensed black hole (Three.js)
- 📈 **Explosive numbers** via break_eternity.js (e-notation, genre-style)
- 🏆 Achievements, challenges, lore journal, autobuyers
- 📱 Playable in any browser, installable as a PWA, full offline progress
- 🔊 Procedural ambient audio (Web Audio API, zero audio assets)
- 🌐 English & German UI

## Development

```bash
npm install
npm run dev        # dev server
npm test           # unit + balance tests (vitest)
npm run sim        # headless full-progression balance simulation
npm run build      # production build → dist/
```

Architecture & game design: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) · Pacing model: [BALANCE.md](BALANCE.md) (both German).

The entire game logic is a pure, headless-testable core — the balance bot in `src/sim` plays
the whole game from dust to endgame, and CI rejects any change that breaks the progression bands.

## Credits

Music: ["Floating Cities", "Deep Haze", "Frozen Star"](https://incompetech.com) by Kevin MacLeod (incompetech.com),
licensed under [Creative Commons: By Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).

## License

Code: [MIT](LICENSE) · Music: CC BY 4.0 (see Credits)
