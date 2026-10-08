import {
	DAY_CYCLE,
	DAY_PHASES,
	LIGHTING_KEYFRAMES,
	MANUAL_DAY_HOUR,
	MANUAL_NIGHT_HOUR,
	type LightingProfile,
	type RGB,
} from "@/config/dayNight"
import type { DayPhase, LightMode } from "../core/events"
import { lerp, mod, smoothstep } from "../core/math"

export const HOURS_PER_DAY = 24

export function phaseForHour(hour: number): DayPhase {
	const h = mod(hour, HOURS_PER_DAY)
	let phase: DayPhase = "night"
	for (const entry of DAY_PHASES) {
		if (h >= entry.start) phase = entry.phase
	}
	return phase
}

function lerpRGB(a: RGB, b: RGB, t: number): RGB {
	return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

export function lerpProfile(a: LightingProfile, b: LightingProfile, t: number): LightingProfile {
	return {
		daylight: lerp(a.daylight, b.daylight, t),
		keyColor: lerpRGB(a.keyColor, b.keyColor, t),
		keyIntensity: lerp(a.keyIntensity, b.keyIntensity, t),
		skyColor: lerpRGB(a.skyColor, b.skyColor, t),
		groundColor: lerpRGB(a.groundColor, b.groundColor, t),
		fillIntensity: lerp(a.fillIntensity, b.fillIntensity, t),
		moonColor: lerpRGB(a.moonColor, b.moonColor, t),
		moonIntensity: lerp(a.moonIntensity, b.moonIntensity, t),
		waterColor: lerpRGB(a.waterColor, b.waterColor, t),
		backdropTop: lerpRGB(a.backdropTop, b.backdropTop, t),
		backdropBottom: lerpRGB(a.backdropBottom, b.backdropBottom, t),
		causticIntensity: lerp(a.causticIntensity, b.causticIntensity, t),
		shaftIntensity: lerp(a.shaftIntensity, b.shaftIntensity, t),
		fixtureGlow: lerp(a.fixtureGlow, b.fixtureGlow, t),
		moonGlow: lerp(a.moonGlow, b.moonGlow, t),
		environmentIntensity: lerp(a.environmentIntensity, b.environmentIntensity, t),
		exposure: lerp(a.exposure, b.exposure, t),
	}
}

/** Lighting for an hour of the simulated day, smoothly interpolated between keyframes. */
export function profileForHour(hour: number): LightingProfile {
	const h = mod(hour, HOURS_PER_DAY)
	for (let i = 0; i < LIGHTING_KEYFRAMES.length - 1; i++) {
		const from = LIGHTING_KEYFRAMES[i]!
		const to = LIGHTING_KEYFRAMES[i + 1]!
		if (h >= from.hour && h <= to.hour) {
			const t = smoothstep(from.hour, to.hour, h)
			return lerpProfile(from.profile, to.profile, t)
		}
	}
	return LIGHTING_KEYFRAMES[0]!.profile
}

/** Simulated aquarium clock. Either runs on an accelerated cycle or follows the local time. */
export class AquariumClock {
	/** Hours in [0, 24). */
	hour: number
	/** Real minutes per simulated day; `0` follows the device's local clock. */
	cycleMinutes: number

	constructor(
		hour: number = DAY_CYCLE.initialHour,
		cycleMinutes: number = DAY_CYCLE.defaultCycleMinutes,
	) {
		this.hour = mod(hour, HOURS_PER_DAY)
		this.cycleMinutes = cycleMinutes
	}

	get followsLocalTime(): boolean {
		return this.cycleMinutes <= 0
	}

	get phase(): DayPhase {
		return phaseForHour(this.hour)
	}

	update(dt: number, now: Date = new Date()): void {
		if (this.followsLocalTime) {
			this.hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600
			return
		}
		const hoursPerSecond = HOURS_PER_DAY / (this.cycleMinutes * 60)
		this.hour = mod(this.hour + dt * hoursPerSecond, HOURS_PER_DAY)
	}
}

/**
 * Eases the live lighting towards the target dictated by the light mode, so
 * switching between Day, Night and Auto never snaps.
 */
export class LightingController {
	mode: LightMode = "auto"
	current: LightingProfile
	private target: LightingProfile

	constructor(initialHour: number, mode: LightMode = "auto") {
		this.mode = mode
		this.target = this.targetFor(initialHour)
		this.current = this.target
	}

	private targetFor(hour: number): LightingProfile {
		if (this.mode === "day") return profileForHour(MANUAL_DAY_HOUR)
		if (this.mode === "night") return profileForHour(MANUAL_NIGHT_HOUR)
		return profileForHour(hour)
	}

	setMode(mode: LightMode): void {
		this.mode = mode
	}

	/** Jumps straight to the target lighting (used on first load). */
	snap(hour: number): void {
		this.target = this.targetFor(hour)
		this.current = this.target
	}

	update(dt: number, hour: number, rate: number = DAY_CYCLE.transitionRate): void {
		this.target = this.targetFor(hour)
		const t = 1 - Math.exp(-rate * dt)
		this.current = lerpProfile(this.current, this.target, t)
	}

	/** Night factor in [0, 1] used by behaviour (1 = fully night). */
	get nightFactor(): number {
		return 1 - this.current.daylight
	}

	/** Exposed for tests: how far the current lighting is from its target. */
	get daylightError(): number {
		return Math.abs(this.current.daylight - this.target.daylight)
	}
}
