import type { DayPhase } from "@/simulation/core/events"

export type RGB = readonly [number, number, number]

/**
 * Everything about the aquarium's light at one moment. The keyframes below
 * describe natural light only (the room's daylight or moonlight); the tank
 * light is added on top by `withTankLight`.
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
	/** Brightness of the moonlight LEDs in the fixture. */
	moonGlow: number
	environmentIntensity: number
	/** Tone-mapping exposure; a little higher in the dark, as eyes adapt. */
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
	skyColor: [0.2, 0.3, 0.5],
	groundColor: [0.03, 0.04, 0.06],
	fillIntensity: 0.5,
	moonColor: [0.5, 0.66, 1.0],
	moonIntensity: 1.3,
	waterColor: [0.02, 0.045, 0.085],
	backdropTop: [0.06, 0.11, 0.21],
	backdropBottom: [0.008, 0.014, 0.03],
	causticIntensity: 0.18,
	shaftIntensity: 0.0,
	moonGlow: 1.0,
	environmentIntensity: 0.18,
	exposure: 1.3,
}

const SUNRISE: LightingProfile = {
	daylight: 0.38,
	keyColor: [1.0, 0.68, 0.45],
	keyIntensity: 1.5,
	skyColor: [0.62, 0.52, 0.46],
	groundColor: [0.13, 0.1, 0.07],
	fillIntensity: 0.6,
	moonColor: [0.5, 0.66, 1.0],
	moonIntensity: 0.15,
	waterColor: [0.08, 0.09, 0.1],
	backdropTop: [0.42, 0.34, 0.28],
	backdropBottom: [0.035, 0.04, 0.045],
	causticIntensity: 0.35,
	shaftIntensity: 0.4,
	moonGlow: 0.15,
	environmentIntensity: 0.35,
	exposure: 1.1,
}

const MORNING: LightingProfile = {
	daylight: 0.85,
	keyColor: [1.0, 0.93, 0.84],
	keyIntensity: 1.8,
	skyColor: [0.74, 0.85, 0.88],
	groundColor: [0.18, 0.16, 0.12],
	fillIntensity: 0.68,
	moonColor: [0.5, 0.66, 1.0],
	moonIntensity: 0.0,
	waterColor: [0.06, 0.12, 0.12],
	backdropTop: [0.36, 0.5, 0.48],
	backdropBottom: [0.025, 0.048, 0.05],
	causticIntensity: 0.35,
	shaftIntensity: 0.3,
	moonGlow: 0.0,
	environmentIntensity: 0.55,
	exposure: 1.1,
}

const MIDDAY: LightingProfile = {
	daylight: 1.0,
	keyColor: [0.97, 0.98, 1.0],
	keyIntensity: 2.0,
	skyColor: [0.8, 0.9, 0.95],
	groundColor: [0.2, 0.19, 0.15],
	fillIntensity: 0.72,
	moonColor: [0.5, 0.66, 1.0],
	moonIntensity: 0.0,
	waterColor: [0.06, 0.13, 0.135],
	backdropTop: [0.38, 0.53, 0.52],
	backdropBottom: [0.025, 0.052, 0.058],
	causticIntensity: 0.4,
	shaftIntensity: 0.3,
	moonGlow: 0.0,
	environmentIntensity: 0.6,
	exposure: 1.1,
}

const AFTERNOON: LightingProfile = {
	daylight: 0.9,
	keyColor: [1.0, 0.9, 0.74],
	keyIntensity: 1.8,
	skyColor: [0.78, 0.82, 0.76],
	groundColor: [0.19, 0.15, 0.11],
	fillIntensity: 0.68,
	moonColor: [0.5, 0.66, 1.0],
	moonIntensity: 0.0,
	waterColor: [0.07, 0.12, 0.11],
	backdropTop: [0.42, 0.48, 0.4],
	backdropBottom: [0.03, 0.048, 0.042],
	causticIntensity: 0.35,
	shaftIntensity: 0.3,
	moonGlow: 0.0,
	environmentIntensity: 0.55,
	exposure: 1.1,
}

const SUNSET: LightingProfile = {
	daylight: 0.45,
	keyColor: [1.0, 0.58, 0.36],
	keyIntensity: 1.7,
	skyColor: [0.66, 0.46, 0.42],
	groundColor: [0.13, 0.08, 0.06],
	fillIntensity: 0.6,
	moonColor: [0.5, 0.66, 1.0],
	moonIntensity: 0.08,
	waterColor: [0.1, 0.08, 0.08],
	backdropTop: [0.52, 0.34, 0.19],
	backdropBottom: [0.045, 0.034, 0.028],
	causticIntensity: 0.35,
	shaftIntensity: 0.45,
	moonGlow: 0.1,
	environmentIntensity: 0.35,
	exposure: 1.1,
}

const DUSK: LightingProfile = {
	daylight: 0.14,
	keyColor: [0.62, 0.5, 0.7],
	keyIntensity: 0.4,
	skyColor: [0.3, 0.28, 0.46],
	groundColor: [0.05, 0.04, 0.05],
	fillIntensity: 0.5,
	moonColor: [0.5, 0.66, 1.0],
	moonIntensity: 0.8,
	waterColor: [0.035, 0.045, 0.08],
	backdropTop: [0.14, 0.13, 0.24],
	backdropBottom: [0.012, 0.014, 0.025],
	causticIntensity: 0.2,
	shaftIntensity: 0.06,
	moonGlow: 0.7,
	environmentIntensity: 0.22,
	exposure: 1.15,
}

/** Keyframes of natural light across a simulated 24-hour day. Must be sorted by hour. */
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

/**
 * The LED fixture above the tank: what it adds to the natural light at full
 * output. It lights the water from directly above, so it brings strong
 * caustics and light shafts, and the water itself glows with scattered light.
 */
export const TANK_LIGHT = {
	color: [1.0, 0.97, 0.93] as RGB,
	keyIntensity: 3.0,
	fillColor: [0.8, 0.93, 0.9] as RGB,
	fillIntensity: 0.45,
	causticIntensity: 0.75,
	shaftIntensity: 0.6,
	/** Light scattered by the water, added to its colour. */
	waterColor: [0.035, 0.07, 0.07] as RGB,
	backdropTop: [0.12, 0.15, 0.14] as RGB,
	backdropBottom: [0.015, 0.03, 0.03] as RGB,
	/**
	 * How much fish treat the lamp as daylight. Switched on at night it wakes
	 * them, though not quite as fully as the sun.
	 */
	daylight: 0.7,
	/** In Auto mode the light runs on a timer, like a real aquarium's. Hours. */
	onHour: 7.5,
	offHour: 18.5,
	/** Simulated hours the timer takes to fade the light, like a controller's sunrise. */
	timerRampHours: 0.75,
	/** Upper limit on a timed fade in real seconds, so the local-time clock still fades visibly. */
	maxTimerRampSeconds: 90,
	/** Real seconds a switch by hand takes: an LED driver's soft start. */
	switchSeconds: 1.6,
	/** Real seconds the light takes to follow a change between Day and Night. */
	modeSeconds: 3,
} as const

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
