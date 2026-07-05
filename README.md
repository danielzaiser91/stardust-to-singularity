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

Architecture, game design and balancing strategy: see [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) (German).

## License

[MIT](LICENSE)
