import type { DayPhase } from "@/simulation/core/events"

export type RGB = readonly [number, number, number]

/**
 * Everything about the aquarium's light at one moment. Interpolated between
 * keyframes in automatic mode and eased towards in manual mode.
 */
export interface LightingProfile {
	/** 0 at deep night, 1 at full daylight. Drives fish behaviour. */
	daylight: number
	keyColor: RGB
	keyIntensity: number
	skyColor: RGB
	groundColor: RGB
	fillIntensity: number
	moonColor: RGB
	moonIntensity: number
	/** Colour light fades to as it travels through water. */
	waterColor: RGB
	backdropTop: RGB
	backdropBottom: RGB
	causticIntensity: number
	shaftIntensity: number
	/** Emission of the light fixture above the tank. */
	fixtureGlow: number
	/** Brightness of the moonlight LEDs in the fixture. */
	moonGlow: number
	environmentIntensity: number
	exposure: number
}

export interface LightingKeyframe {
	hour: number
	profile: LightingProfile
}

const NIGHT: LightingProfile = {
	daylight: 0.02,
	keyColor: [0.5, 0.6, 0.9],
	keyIntensity: 0.0,
	skyColor: [0.16, 0.24, 0.42],
	groundColor: [0.02, 0.03, 0.04],
	fillIntensity: 0.32,
	moonColor: [0.48, 0.64, 1.0],
	moonIntensity: 0.75,
	waterColor: [0.012, 0.03, 0.06],
	backdropTop: [0.035, 0.07, 0.14],
	backdropBottom: [0.004, 0.008, 0.016],
	causticIntensity: 0.12,
	shaftIntensity: 0.0,
	fixtureGlow: 0.0,
	moonGlow: 1.0,
	environmentIntensity: 0.12,
	exposure: 1.0,
}

const SUNRISE: LightingProfile = {
	daylight: 0.38,
	keyColor: [1.0, 0.66, 0.42],
	keyIntensity: 1.5,
	skyColor: [0.6, 0.5, 0.42],
	groundColor: [0.12, 0.09, 0.06],
	fillIntensity: 0.45,
	moonColor: [0.48, 0.64, 1.0],
	moonIntensity: 0.12,
	waterColor: [0.08, 0.1, 0.1],
	backdropTop: [0.34, 0.3, 0.26],
	backdropBottom: [0.03, 0.04, 0.045],
	causticIntensity: 0.45,
	shaftIntensity: 0.35,
	fixtureGlow: 0.45,
	moonGlow: 0.15,
	environmentIntensity: 0.3,
	exposure: 1.0,
}

const MORNING: LightingProfile = {
	daylight: 0.85,
	keyColor: [1.0, 0.92, 0.8],
	keyIntensity: 3.0,
	skyColor: [0.72, 0.84, 0.86],
	groundColor: [0.16, 0.15, 0.11],
	fillIntensity: 0.42,
	moonColor: [0.48, 0.64, 1.0],
	moonIntensity: 0.0,
	waterColor: [0.05, 0.12, 0.12],
	backdropTop: [0.36, 0.5, 0.48],
	backdropBottom: [0.02, 0.045, 0.05],
	causticIntensity: 0.9,
	shaftIntensity: 0.75,
	fixtureGlow: 0.9,
	moonGlow: 0.0,
	environmentIntensity: 0.45,
	exposure: 1.0,
}

const MIDDAY: LightingProfile = {
	daylight: 1.0,
	keyColor: [1.0, 0.98, 0.94],
	keyIntensity: 3.4,
	skyColor: [0.78, 0.9, 0.92],
	groundColor: [0.17, 0.16, 0.12],
	fillIntensity: 0.46,
	moonColor: [0.48, 0.64, 1.0],
	moonIntensity: 0.0,
	waterColor: [0.05, 0.13, 0.13],
	backdropTop: [0.4, 0.56, 0.53],
	backdropBottom: [0.02, 0.05, 0.055],
	causticIntensity: 1.0,
	shaftIntensity: 0.85,
	fixtureGlow: 1.0,
	moonGlow: 0.0,
	environmentIntensity: 0.5,
	exposure: 1.0,
}

const AFTERNOON: LightingProfile = {
	daylight: 0.9,
	keyColor: [1.0, 0.88, 0.7],
	keyIntensity: 3.0,
	skyColor: [0.76, 0.8, 0.74],
	groundColor: [0.17, 0.14, 0.1],
	fillIntensity: 0.44,
	moonColor: [0.48, 0.64, 1.0],
	moonIntensity: 0.0,
	waterColor: [0.06, 0.12, 0.1],
	backdropTop: [0.42, 0.48, 0.4],
	backdropBottom: [0.025, 0.045, 0.04],
	causticIntensity: 0.9,
	shaftIntensity: 0.8,
	fixtureGlow: 0.95,
	moonGlow: 0.0,
	environmentIntensity: 0.45,
	exposure: 1.0,
}

const SUNSET: LightingProfile = {
	daylight: 0.45,
	keyColor: [1.0, 0.56, 0.34],
	keyIntensity: 1.7,
	skyColor: [0.62, 0.42, 0.4],
	groundColor: [0.12, 0.07, 0.05],
	fillIntensity: 0.45,
	moonColor: [0.48, 0.64, 1.0],
	moonIntensity: 0.05,
	waterColor: [0.1, 0.08, 0.08],
	backdropTop: [0.48, 0.31, 0.17],
	backdropBottom: [0.04, 0.03, 0.025],
	causticIntensity: 0.5,
	shaftIntensity: 0.5,
	fixtureGlow: 0.5,
	moonGlow: 0.1,
	environmentIntensity: 0.3,
	exposure: 1.0,
}

const DUSK: LightingProfile = {
	daylight: 0.14,
	keyColor: [0.62, 0.48, 0.66],
	keyIntensity: 0.35,
	skyColor: [0.26, 0.24, 0.4],
	groundColor: [0.04, 0.03, 0.04],
	fillIntensity: 0.36,
	moonColor: [0.48, 0.64, 1.0],
	moonIntensity: 0.45,
	waterColor: [0.03, 0.04, 0.07],
	backdropTop: [0.12, 0.11, 0.2],
	backdropBottom: [0.01, 0.012, 0.02],
	causticIntensity: 0.2,
	shaftIntensity: 0.08,
	fixtureGlow: 0.1,
	moonGlow: 0.7,
	environmentIntensity: 0.18,
	exposure: 1.0,
}

/** Keyframes across a simulated 24-hour day. Must be sorted by hour. */
export const LIGHTING_KEYFRAMES: readonly LightingKeyframe[] = [
	{ hour: 0, profile: NIGHT },
	{ hour: 5.5, profile: NIGHT },
	{ hour: 6.75, profile: SUNRISE },
	{ hour: 8.5, profile: MORNING },
	{ hour: 12, profile: MIDDAY },
	{ hour: 16, profile: AFTERNOON },
	{ hour: 18.5, profile: SUNSET },
	{ hour: 19.75, profile: DUSK },
	{ hour: 21, profile: NIGHT },
	{ hour: 24, profile: NIGHT },
]

/** The hour whose lighting is used for the manual "Day" and "Night" modes. */
export const MANUAL_DAY_HOUR = 12
export const MANUAL_NIGHT_HOUR = 0

/** Start (inclusive) hour of each phase, in order through the day. */
export const DAY_PHASES: ReadonlyArray<{ phase: DayPhase; start: number }> = [
	{ phase: "night", start: 0 },
	{ phase: "sunrise", start: 5.5 },
	{ phase: "morning", start: 7.5 },
	{ phase: "day", start: 11 },
	{ phase: "afternoon", start: 15 },
	{ phase: "sunset", start: 18 },
	{ phase: "evening", start: 19.5 },
	{ phase: "night", start: 21 },
]

export const DAY_CYCLE = {
	/** Hour shown on a first visit — the aquarium wakes up in the morning. */
	initialHour: 9,
	/** Rate at which lighting eases towards its target, per second. */
	transitionRate: 0.55,
	/** Selectable cycle lengths, in real minutes per simulated day. `0` follows the local clock. */
	cycleOptions: [12, 24, 60, 0] as const,
	defaultCycleMinutes: 24,
} as const

export type CycleMinutes = (typeof DAY_CYCLE.cycleOptions)[number]
