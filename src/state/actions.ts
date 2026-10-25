/**
 * All state changes go through these actions. UI and canvas call them; neither calls setState directly.
 */
import { INTRO_STEPS } from '../content/intro';
import type { SectorKey } from '../data/types';
import { toggleCityPart, toggleCountryPart } from './selection';
import type { Store } from './store';
import { NO_HOVER, type AppState, type Hover, type InfoSection, type SidebarPanel } from './types';

export type Actions = ReturnType<typeof createActions>;

export function createActions(store: Store<AppState>) {
  const set = store.setState;
  const lastStep = INTRO_STEPS.length - 1;

  return {
    startIntro() {
      set({ scene: 'intro', introStep: 0, hover: NO_HOVER });
    },
    goToExplore() {
      set({ scene: 'explore', selection: [], legendOpen: false, hover: NO_HOVER });
    },
    goToLanding() {
      set({ scene: 'landing', selection: [], hover: NO_HOVER });
    },
    introNext() {
      const { introStep } = store.getState();
      if (introStep >= lastStep) {
        set({ scene: 'explore', selection: [], legendOpen: false, hover: NO_HOVER });
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
      set((s) => ({
        selection: toggleCountryPart(s.selection, countryId, cityIds),
        hover: NO_HOVER,
      }));
    },
    toggleCity(cityId: string, countryId: string) {
      set((s) => ({
        selection: toggleCityPart(s.selection, cityId, countryId),
        hover: NO_HOVER,
      }));
    },
    selectCountries(countryIds: string[]) {
      set({
        selection: [...new Set(countryIds)].map((id) => ({ kind: 'country' as const, id })),
        hover: NO_HOVER,
      });
    },
    /** Focus view of one city, without the rest of its country. */
    selectCity(cityId: string) {
      set({
        selection: [{ kind: 'city' as const, id: cityId }],
        hover: NO_HOVER,
      });
    },
    /** Combined view: one whole country plus a city ripped out of another country. */
    selectCountryWithCity(countryId: string, cityId: string) {
      set({
        selection: [
          { kind: 'country' as const, id: countryId },
          { kind: 'city' as const, id: cityId },
        ],
        hover: NO_HOVER,
      });
    },
    clearSelection() {
      set({ selection: [], hover: NO_HOVER });
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
