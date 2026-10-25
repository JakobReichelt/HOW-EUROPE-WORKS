# AGENTS.md - HOW EUROPE WORKS

Guide for AI agents (and humans) working in this repo. Read this first.

## What this is

An exploratory p5.js web app about work in European cities, rebuilt from a Figma prototype
(file `YyCrxpHa9VACRwwsFevHWm`). Vite + TypeScript (strict). Current state: **wireframe base,
no animations**. Structure and data are final-ish; visuals and motion are to be refined.

## Commands

| Command               | What it does                                                          |
| --------------------- | --------------------------------------------------------------------- |
| `npm run dev`         | Dev server on http://localhost:5173                                   |
| `npm run data`        | CSV -> `public/data/europe.json` (+ coverage table). Commit the JSON. |
| `npm run check`       | typecheck + eslint + prettier --check + tests. Run before finishing.  |
| `npm run build`       | typecheck + production build into `dist/`                             |
| `npm run format`      | Prettier write                                                        |
| `npm run build:watch` | Rebuild `dist/` on save (for static servers like Live Server)         |

Never open `index.html` through a static server: it loads `src/main.ts`, which only Vite can
serve (otherwise the browser blocks it as `video/mp2t`).

Node is installed portable at `%LOCALAPPDATA%\Programs\nodejs` (on the user PATH).

## Architecture in one paragraph

`main.ts` loads the dataset, creates **one store** (`src/state`), connects the hash router,
then mounts the **DOM UI** (`src/ui`) and the **p5 canvas** (`src/canvas`). UI and canvas both
read `store.getState()` and change state only through `actions`. They never import each other
(enforced by ESLint). The canvas redraws on demand (`noLoop` + `requestRedraw`). Details:
`docs/architecture.md`.

## Where to change what

| Task                                          | File(s)                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| Which CSV column feeds a metric               | `scripts/lib/buildDataset.ts` (`METRICS`), then `npm run data`                        |
| City -> country mapping, display names        | `data/config/cities.json`                                                             |
| Thresholds, commute scale, sector labels      | `src/config/encoding.ts`                                                              |
| Colours, sizes, donut proportions             | `src/config/theme.ts` (+ `src/styles/tokens.css`)                                     |
| Donut geometry (angles, radii)                | `src/canvas/layout/donutLayout.ts`                                                    |
| Where donuts sit on the explore canvas        | `src/canvas/layout/worldLayout.ts` (sizes / spacing in `theme.world`)                 |
| Legend callouts                               | `src/canvas/draw/legend.ts`, copy in `src/content/about.ts`                           |
| How a donut / bar looks                       | `src/canvas/draw/*.ts`                                                                |
| Explore interactions (pan, zoom, drag)        | `src/canvas/scenes/ExploreScene.ts`                                                   |
| Intro copy and which channels each step shows | `src/content/intro.ts`                                                                |
| Sidebar, landing, intro buttons               | `src/ui/*.ts`, `src/styles/*.css`                                                     |
| New state field / action                      | `src/state/types.ts`, `src/state/actions.ts` (+ `router.ts` if it belongs in the URL) |

## Visual encoding (do not get this wrong)

Each city is one arc segment of its country's donut.

- Arc angle = share of the country's working people.
- Fill = biggest sector. Hatched part = commuter rate. Dotted radial tick = male share.
- Grey band outside the segment = unemployment level (low / medium / high = 1 / 2 / 3 steps).
- **Commute time = radial offset of the segment from the baseline.** Longer commute -> segment
  sits further out. Continuous linear scale shared by all donuts (`COMMUTE.domain`).
- **Red rings at 30 / 40 / 50 min are fixed guides**, always drawn, solid / dashed / dotted. They
  do not encode data; they only show how far segments have moved.

## Rules

- **Encoding: keep every source file ASCII.** The file-writing tool on this machine has written
  Windows-1252 before. Use `\u` escapes in TS/JSON strings (e.g. `'\u2192'` for an arrow),
  HTML entities in HTML, and plain ASCII in Markdown.
- Only `src/canvas/` imports p5. `config`, `data`, `state`, `content` stay framework-free.
- Layout functions are pure (numbers in, numbers out) and covered by tests in `tests/`.
- Don't hand-edit `public/data/europe.json`; change the script or config and rerun `npm run data`.
- Purely visual state (camera, drag in progress) may live inside a scene. Everything that
  should be linkable or shared between UI and canvas belongs in the store.
- `docs/SPEC.md` is the original design spec. Where it disagrees with the code, the code and this file win.

## Debugging in the browser

`window.__HEW__` (see `src/debug/devApi.ts`):

```js
__HEW__.state(); // current AppState
__HEW__.actions.selectCountries(['FR', 'ES']);
__HEW__.actions.setIntroStep(4);
__HEW__.canvas.inspect(); // scene, camera, viewport, node positions
__HEW__.canvas.hitAt(800, 400); // what is under a canvas pixel
__HEW__.city('zurich');
```

Every view has a URL: `#/`, `#/intro/3`, `#/explore?sel=FR,ES&sector=trade&legend=1`.
DOM controls carry `data-testid` attributes.
