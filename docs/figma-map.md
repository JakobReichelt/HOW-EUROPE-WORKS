# Figma map

File key `YyCrxpHa9VACRwwsFevHWm`. URL pattern:
`https://www.figma.com/design/YyCrxpHa9VACRwwsFevHWm/?node-id=<id with - instead of :>`

| Node        | Screen                                    | Code                                                                       |
| ----------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| `393:13621` | Landing                                   | `ui/Landing.ts`, `canvas/scenes/LandingScene.ts`                           |
| `415:1295`  | Intro 1 - working people                  | `content/intro.ts`, `canvas/scenes/IntroScene.ts`                          |
| `415:2517`  | Intro 2 - commuters                       | same                                                                       |
| `417:2603`  | Intro 3 - gender                          | same                                                                       |
| `419:2683`  | Intro 4 - unemployment                    | same                                                                       |
| `419:2712`  | Intro 5 - commute time                    | same                                                                       |
| `419:2744`  | Intro 6 - all channels                    | same                                                                       |
| `419:2812`  | Intro 7 - Switzerland donut               | same                                                                       |
| `347:6230`  | Explore overview + interaction sidebar    | `canvas/scenes/ExploreScene.ts`, `ui/Sidebar.ts`, `ui/InteractionPanel.ts` |
| `288:10567` | Explore with info sidebar                 | `ui/InfoPanel.ts`                                                          |
| `393:8528`  | Sector filter                             | `ui/SectorFilter.ts`, `draw/donut.ts` (`sectorFilter`)                     |
| `360:2397`  | Focus on one country                      | `ExploreScene` focus mode, `ui/CountryList.ts`                             |
| `360:5355`  | Combined countries + legend               | `ExploreScene` combined mode, `draw/legend.ts`                             |
| `230:10924` | Donut anatomy                             | `layout/donutLayout.ts`, `draw/donut.ts`                                   |
| `236:5438`  | Hover states                              | `draw/donut.ts` (`hoverCityId`, `hoverCountry`, fading)                    |
| `393:16582` | Hover with arc text                       | `draw/donut.ts` (`drawHoverInfo`), `draw/shapes.ts` (`arcText`)            |
| `332:836`   | Component sheet (sidebar, swatches, type) | `config/theme.ts`, `styles/tokens.css`, `styles/sidebar.css`               |

## Measured proportions

All donut values are fractions of the donut radius `R` (`theme.donut`), sampled from the frames
above with R = 400 for the largest donut.

| What                                 | Value                                                   |
| ------------------------------------ | ------------------------------------------------------- |
| Segment inner edge at 20 min         | 0.487 R (`baseline`)                                    |
| Inner edge 20 -> 55 min              | + 0.315 R (`commuteSpan`), i.e. 0.009 R per minute      |
| Guide rings 30 / 40 / 50 min         | 0.577 / 0.667 / 0.757 R, drawn behind the segments      |
| Segment thickness                    | 0.175 R (`band`)                                        |
| Unemployment band per level          | 0.027 R (`shadowStep`)                                  |
| Gap between segments                 | 0.022 rad (`gap`)                                       |
| Donut radius, smallest -> largest    | 256 -> 400 world px, by sqrt(working people)            |
| Distance between neighbouring donuts | 24 world px (`world.padding`)                           |
| First view                           | France centred at design scale (1536 x 960 artboard)    |
| Focus / combined donut               | R = 0.42 / 0.355 x min(viewport width, viewport height) |
