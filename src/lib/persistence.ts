import { DAY_CYCLE, type CycleMinutes } from "@/config/dayNight"
import type { QualitySetting } from "@/config/quality"
import { SPECIES, STARTER_ROSTER } from "@/config/species"
import type { LightMode } from "@/simulation/core/events"
import { tankLightForMode } from "@/simulation/environment/tankLight"
import { clampGroupSize, type Roster } from "@/simulation/fish/population"

export const SETTINGS_STORAGE_KEY = "aquazen:settings"
/** Bump when the persisted shape changes, and add a migration below. */
export const SETTINGS_VERSION = 3

export type CameraMode = "window" | "explore"
export type ReducedMotionPreference = "system" | "on" | "off"

export interface PersistedSettings {
	audio: { sound: boolean; music: boolean; volume: number }
	lightMode: LightMode
	/** The light above the tank, switched by hand or by its timer in Auto mode. */
	tankLight: boolean
	/** The fish kept in the tank: group size by species id. */
	roster: Roster
	cycleMinutes: CycleMinutes
	/** Last known simulated hour, so the aquarium resumes where it was. */
	aquariumHour: number
	quality: QualitySetting
	camera: { mode: CameraMode; cinematicMotion: boolean }
	accessibility: { reducedMotion: ReducedMotionPreference; reducedEffects: boolean }
}

export const DEFAULT_SETTINGS: PersistedSettings = {
	audio: { sound: false, music: false, volume: 0.6 },
	lightMode: "auto",
	tankLight: tankLightForMode("auto", DAY_CYCLE.initialHour),
	roster: STARTER_ROSTER,
	cycleMinutes: DAY_CYCLE.defaultCycleMinutes,
	aquariumHour: DAY_CYCLE.initialHour,
	quality: "auto",
	camera: { mode: "window", cinematicMotion: true },
	accessibility: { reducedMotion: "system", reducedEffects: false },
}

const LIGHT_MODES = ["auto", "day", "night"] as const

export type Migration = (state: Record<string, unknown>) => Record<string, unknown>

/**
 * Migrations keyed by the version they upgrade *from*. When the schema
 * changes, bump `SETTINGS_VERSION` and add an entry keyed by the old version.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
	// v2 added the tank light. Start it where the saved light mode would have it.
	1: (state) => {
		const mode = pickOption(state.lightMode, LIGHT_MODES, DEFAULT_SETTINGS.lightMode)
		const hour = pickNumber(state.aquariumHour, DEFAULT_SETTINGS.aquariumHour, 0, 24)
		return { ...state, tankLight: tankLightForMode(mode, hour) }
	},
	// v3 lets the owner choose the fish. Existing tanks keep the fish they had.
	2: (state) => ({ ...state, roster: STARTER_ROSTER }),
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback
}

function pickNumber(value: unknown, fallback: number, min: number, max: number): number {
	return typeof value === "number" && Number.isFinite(value)
		? Math.min(max, Math.max(min, value))
		: fallback
}

function pickOption<T extends string | number>(
	value: unknown,
	options: readonly T[],
	fallback: T,
): T {
	return options.includes(value as T) ? (value as T) : fallback
}

/**
 * Keeps known species at a group size the tank allows. Unknown species
 * (perhaps from a newer version) are dropped; an empty roster is an empty tank.
 */
function pickRoster(value: unknown, fallback: Roster): Roster {
	if (!isRecord(value)) return fallback
	const roster: Record<string, number> = {}
	for (const species of SPECIES) {
		const count = value[species.id]
		if (typeof count === "number" && Number.isFinite(count) && count > 0)
			roster[species.id] = clampGroupSize(species, count)
	}
	return roster
}

/** Validates arbitrary stored data, falling back to defaults field by field. */
export function sanitizeSettings(raw: unknown): PersistedSettings {
	const state = isRecord(raw) ? raw : {}
	const audio = isRecord(state.audio) ? state.audio : {}
	const camera = isRecord(state.camera) ? state.camera : {}
	const accessibility = isRecord(state.accessibility) ? state.accessibility : {}
	const d = DEFAULT_SETTINGS
	return {
		audio: {
			sound: pickBoolean(audio.sound, d.audio.sound),
			music: pickBoolean(audio.music, d.audio.music),
			volume: pickNumber(audio.volume, d.audio.volume, 0, 1),
		},
		lightMode: pickOption(state.lightMode, LIGHT_MODES, d.lightMode),
		tankLight: pickBoolean(state.tankLight, d.tankLight),
		roster: pickRoster(state.roster, d.roster),
		cycleMinutes: pickOption(state.cycleMinutes, DAY_CYCLE.cycleOptions, d.cycleMinutes),
		aquariumHour: pickNumber(state.aquariumHour, d.aquariumHour, 0, 23.999),
		quality: pickOption(
			state.quality,
			["auto", "ultra", "high", "medium", "low"] as const,
			d.quality,
		),
		camera: {
			mode: pickOption(camera.mode, ["window", "explore"] as const, d.camera.mode),
			cinematicMotion: pickBoolean(camera.cinematicMotion, d.camera.cinematicMotion),
		},
		accessibility: {
			reducedMotion: pickOption(
				accessibility.reducedMotion,
				["system", "on", "off"] as const,
				d.accessibility.reducedMotion,
			),
			reducedEffects: pickBoolean(accessibility.reducedEffects, d.accessibility.reducedEffects),
		},
	}
}

/** Upgrades stored settings from `fromVersion` to the current schema, then validates them. */
export function migrateSettings(
	raw: unknown,
	fromVersion: number,
	migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
	toVersion: number = SETTINGS_VERSION,
): PersistedSettings {
	let state: Record<string, unknown> = isRecord(raw) ? { ...raw } : {}
	for (let version = fromVersion; version < toVersion; version++) {
		const migration = migrations[version]
		if (migration) state = migration(state)
	}
	return sanitizeSettings(state)
}
