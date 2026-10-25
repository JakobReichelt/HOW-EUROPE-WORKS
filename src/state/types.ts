import type { SectorKey } from '../data/types';

/** null = every sector in colour. 'none' = no sector colour. A key = only that sector. */
export type SectorFilter = SectorKey | 'none' | null;

export type SceneId = 'landing' | 'intro' | 'explore';
export type SidebarPanel = 'info' | 'interaction';
export type InfoSection = 'about' | 'legend' | 'data';

export interface Hover {
  countryId: string | null;
  cityId: string | null;
}

export const NO_HOVER: Hover = { countryId: null, cityId: null };

/** One piece of a combined donut: a whole country, or a single city. */
export type SelectionPart = { kind: 'country'; id: string } | { kind: 'city'; id: string };

/** The whole app state. UI and canvas only read this and change it through actions. */
export interface AppState {
  scene: SceneId;
  /** 0-based intro step, see src/content/intro.ts. */
  introStep: number;
  /** Selected countries and cities, in selection order. 0 = overview, 1 = focus, 2+ = combined. */
  selection: SelectionPart[];
  /** Which sector colours are drawn. See SectorFilter. */
  sectorFilter: SectorFilter;
  sidebar: {
    panel: SidebarPanel;
    openInfo: InfoSection | null;
    citySearch: string;
  };
  /** ExploreScene pans the overview when `nonce` changes. */
  viewFocus: { kind: 'city' | 'country'; id: string; nonce: number } | null;
  legendOpen: boolean;
  hover: Hover;
}

export const initialState: AppState = {
  scene: 'landing',
  introStep: 0,
  selection: [],
  sectorFilter: null,
  sidebar: { panel: 'interaction', openInfo: null, citySearch: '' },
  viewFocus: null,
  legendOpen: false,
  hover: NO_HOVER,
};
