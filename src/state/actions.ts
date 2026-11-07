/**
 * All state changes go through these actions. UI and canvas call them; neither calls setState directly.
 */
import { INTRO_STEPS } from '../content/intro';
import type { SectorKey } from '../data/types';
import { toggleCityPart, toggleCountryPart } from './selection';
import type { Store } from './store';
import {
  NO_HOVER,
  type AppState,
  type Hover,
  type InfoSection,
  type SelectionPart,
  type SidebarPanel,
} from './types';

export type Actions = ReturnType<typeof createActions>;

/**
 * Entering selection view (overview -> focus / compare) opens the Interaction
 * accordion. Leaving the introduction does not: the sidebar stays on Info
 * until a country or city is selected.
 */
function selectionChange(state: AppState, selection: SelectionPart[]): Partial<AppState> {
  const entered = state.selection.length === 0 && selection.length > 0;
  const showInteraction = entered && state.sidebar.panel !== 'interaction';
  return {
    selection,
    hover: NO_HOVER,
    ...(selection.length === 0 ? { legendOpen: false } : {}),
    ...(showInteraction ? { sidebar: { ...state.sidebar, panel: 'interaction' as const } } : {}),
  };
}

export function createActions(store: Store<AppState>) {
  const set = store.setState;
  const lastStep = INTRO_STEPS.length - 1;

  return {
    startIntro() {
      set((s) => ({
        scene: 'intro',
        introStep: 0,
        hover: NO_HOVER,
        sidebar: { ...s.sidebar, panel: 'info' },
      }));
    },
    goToExplore() {
      set({ scene: 'explore', selection: [], legendOpen: false, hover: NO_HOVER });
    },
    goToLanding() {
      set({ scene: 'landing', selection: [], hover: NO_HOVER });
    },
    introNext() {
      const { introStep, sidebar } = store.getState();
      if (introStep >= lastStep) {
        // The explore sidebar appears on Info. Interaction opens with the first selection.
        set({
          scene: 'explore',
          selection: [],
          legendOpen: false,
          hover: NO_HOVER,
          sidebar: { ...sidebar, panel: 'info' },
        });
      } else set({ introStep: introStep + 1 });
    },
    introBack() {
      const { introStep } = store.getState();
      if (introStep <= 0) set({ scene: 'landing' });
      else set({ introStep: introStep - 1 });
    },
    setIntroStep(step: number) {
      set({ scene: 'intro', introStep: Math.max(0, Math.min(lastStep, step)) });
    },
    setSidebarPanel(panel: SidebarPanel) {
      set((s) => ({ sidebar: { ...s.sidebar, panel } }));
    },
    toggleInfoSection(section: InfoSection) {
      set((s) => ({
        sidebar: { ...s.sidebar, openInfo: s.sidebar.openInfo === section ? null : section },
      }));
    },
    toggleLegend(open?: boolean) {
      set((s) => {
        // Canvas legend only exists in selection view.
        if (s.selection.length === 0) return { legendOpen: false };
        const legendOpen = open ?? !s.legendOpen;
        return legendOpen ? { legendOpen, hover: NO_HOVER } : { legendOpen };
      });
    },
    /** Pin one sector. Every other sector turns off. */
    setSectorFilter(sector: SectorKey) {
      set({ sectorFilter: sector });
    },
    /**
     * Heading control. Every sector is on -> none.
     * One sector, or none, -> every sector.
     */
    toggleAllSectors() {
      set((s) => ({ sectorFilter: s.sectorFilter === null ? 'none' : null }));
    },
    toggleCountry(countryId: string, cityIds: readonly string[] = []) {
      set((s) => selectionChange(s, toggleCountryPart(s.selection, countryId, cityIds)));
    },
    toggleCity(cityId: string, countryId: string) {
      set((s) => selectionChange(s, toggleCityPart(s.selection, cityId, countryId)));
    },
    selectCountries(countryIds: string[]) {
      const selection = [...new Set(countryIds)].map((id) => ({
        kind: 'country' as const,
        id,
      }));
      set((s) => selectionChange(s, selection));
    },
    /** Focus view of one city, without the rest of its country. */
    selectCity(cityId: string) {
      set((s) => selectionChange(s, [{ kind: 'city' as const, id: cityId }]));
    },
    /** Combined view: one whole country plus a city ripped out of another country. */
    selectCountryWithCity(countryId: string, cityId: string) {
      set((s) =>
        selectionChange(s, [
          { kind: 'country' as const, id: countryId },
          { kind: 'city' as const, id: cityId },
        ]),
      );
    },
    clearSelection() {
      set({ selection: [], hover: NO_HOVER, legendOpen: false });
    },
    setCitySearch(query: string) {
      set((s) => ({ sidebar: { ...s.sidebar, citySearch: query } }));
    },
    focusCity(cityId: string, countryId: string) {
      set((s) => ({
        hover: { countryId, cityId },
        viewFocus: { kind: 'city', id: cityId, nonce: (s.viewFocus?.nonce ?? 0) + 1 },
      }));
    },
    focusCountry(countryId: string) {
      set((s) => ({
        hover: { countryId, cityId: null },
        viewFocus: { kind: 'country', id: countryId, nonce: (s.viewFocus?.nonce ?? 0) + 1 },
      }));
    },
    setHover(hover: Hover) {
      const current = store.getState().hover;
      if (current.countryId === hover.countryId && current.cityId === hover.cityId) return;
      set({ hover });
    },
  };
}
