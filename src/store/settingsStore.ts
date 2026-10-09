import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import type { CycleMinutes } from "@/config/dayNight"
import type { QualitySetting } from "@/config/quality"
import { SPECIES_BY_ID, STARTER_ROSTER } from "@/config/species"
import {
	DEFAULT_SETTINGS,
	migrateSettings,
	sanitizeSettings,
	SETTINGS_STORAGE_KEY,
	SETTINGS_VERSION,
	type CameraMode,
	type PersistedSettings,
	type ReducedMotionPreference,
} from "@/lib/persistence"
import type { LightMode } from "@/simulation/core/events"
import { clampGroupSize } from "@/simulation/fish/population"

export interface SettingsActions {
	setSound: (enabled: boolean) => void
	setMusic: (enabled: boolean) => void
	setVolume: (volume: number) => void
	setLightMode: (mode: LightMode) => void
	setTankLight: (on: boolean) => void
	/** Sets how many of a species live in the tank; 0 takes the species out. */
	setSpeciesCount: (speciesId: string, count: number) => void
	restoreStarterTank: () => void
	setCycleMinutes: (minutes: CycleMinutes) => void
	setAquariumHour: (hour: number) => void
	setQuality: (quality: QualitySetting) => void
	setCameraMode: (mode: CameraMode) => void
	setCinematicMotion: (enabled: boolean) => void
	setReducedMotion: (preference: ReducedMotionPreference) => void
	setReducedEffects: (enabled: boolean) => void
	reset: () => void
}

export type SettingsState = PersistedSettings & SettingsActions

/**
 * User preferences, persisted to localStorage under a versioned schema.
 * Holds only settings — never per-frame simulation state.
 */
export const useSettingsStore = create<SettingsState>()(
	persist(
		(set) => ({
			...DEFAULT_SETTINGS,
			setSound: (sound) => set((s) => ({ audio: { ...s.audio, sound } })),
			setMusic: (music) => set((s) => ({ audio: { ...s.audio, music } })),
			setVolume: (volume) =>
				set((s) => ({ audio: { ...s.audio, volume: Math.min(1, Math.max(0, volume)) } })),
			setLightMode: (lightMode) => set({ lightMode }),
			setTankLight: (tankLight) => set({ tankLight }),
			setSpeciesCount: (speciesId, count) =>
				set((s) => {
					const species = SPECIES_BY_ID.get(speciesId)
					if (!species) return {}
					const roster = { ...s.roster }
					if (count > 0) roster[speciesId] = clampGroupSize(species, count)
					else delete roster[speciesId]
					return { roster }
				}),
			restoreStarterTank: () => set({ roster: STARTER_ROSTER }),
			setCycleMinutes: (cycleMinutes) => set({ cycleMinutes }),
			setAquariumHour: (aquariumHour) => set({ aquariumHour }),
			setQuality: (quality) => set({ quality }),
			setCameraMode: (mode) => set((s) => ({ camera: { ...s.camera, mode } })),
			setCinematicMotion: (cinematicMotion) =>
				set((s) => ({ camera: { ...s.camera, cinematicMotion } })),
			setReducedMotion: (reducedMotion) =>
				set((s) => ({ accessibility: { ...s.accessibility, reducedMotion } })),
			setReducedEffects: (reducedEffects) =>
				set((s) => ({ accessibility: { ...s.accessibility, reducedEffects } })),
			reset: () => set({ ...DEFAULT_SETTINGS }),
		}),
		{
			name: SETTINGS_STORAGE_KEY,
			version: SETTINGS_VERSION,
			storage: createJSONStorage(() => localStorage),
			partialize: (state): PersistedSettings => ({
				audio: state.audio,
				lightMode: state.lightMode,
				tankLight: state.tankLight,
				roster: state.roster,
				cycleMinutes: state.cycleMinutes,
				aquariumHour: state.aquariumHour,
				quality: state.quality,
				camera: state.camera,
				accessibility: state.accessibility,
			}),
			migrate: (persisted, version) => migrateSettings(persisted, version),
			// Validate even same-version data, in case storage was edited or corrupted.
			merge: (persisted, current) => ({ ...current, ...sanitizeSettings(persisted) }),
		},
	),
)
