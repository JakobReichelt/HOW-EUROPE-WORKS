# HOW EUROPE WORKS

Aspects of work in European cities - an exploratory interface built with p5.js, Vite and
TypeScript. Data: Eurostat Urban Audit (49 cities, 18 countries).

## Getting started

```sh
npm install
npm run dev        # http://localhost:5173
```

## Scripts

- `npm run data` - rebuild `public/data/europe.json` from `data/raw/` and `data/config/`
- `npm run check` - typecheck, lint, format check, tests
- `npm run build` - production build into `dist/`

## Project layout

```
data/raw/            source CSV (Eurostat)
data/config/         city -> country mapping
scripts/             data build (Node, run with tsx)
public/data/         generated dataset loaded by the app (committed)
src/config/          encoding rules and theme tokens
src/data/            types, loader, selectors, formatting
src/state/           store, actions, hash router
src/canvas/          p5 sketch, scenes, layout, drawing, hit testing
src/ui/              DOM sidebar, landing, intro controls
src/content/         copy (intro steps, about texts)
tests/               vitest unit tests
docs/                architecture, data dictionary, Figma map
```

See `AGENTS.md` for conventions and `docs/architecture.md` for how the parts fit together.
