import {
	DAY_CYCLE,
	DAY_PHASES,
	LIGHTING_KEYFRAMES,
	MANUAL_DAY_HOUR,
	MANUAL_NIGHT_HOUR,
	TANK_LIGHT,
	type LightingProfile,
	type RGB,
} from "@/config/dayNight"
import type { DayPhase, LightMode } from "../core/events"
import { clamp, lerp, mod, smoothstep } from "../core/math"
import { TankLight } from "./tankLight"

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
		moonGlow: lerp(a.moonGlow, b.moonGlow, t),
		environmentIntensity: lerp(a.environmentIntensity, b.environmentIntensity, t),
		exposure: lerp(a.exposure, b.exposure, t),
	}
}

function addRGB(a: RGB, b: RGB, scale: number): RGB {
	return [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale]
}

/** Mixes two light colours in proportion to how strong each light is. */
function mixLight(a: RGB, aIntensity: number, b: RGB, bIntensity: number): RGB {
	const total = aIntensity + bIntensity
	return total > 1e-6 ? lerpRGB(a, b, bIntensity / total) : a
}

/**
 * Adds the tank light, at an output level from 0 to 1, to natural light.
 * The fixture's light adds to the key and fill, caustics and shafts, and
 * the glow of the water; to the fish it counts as daylight.
 */
export function withTankLight(natural: LightingProfile, level: number): LightingProfile {
	if (level <= 0) return natural
	const key = TANK_LIGHT.keyIntensity * level
	const fill = TANK_LIGHT.fillIntensity * level
	return {
		...natural,
		daylight: natural.daylight + (1 - natural.daylight) * TANK_LIGHT.daylight * level,
		keyColor: mixLight(natural.keyColor, natural.keyIntensity, TANK_LIGHT.color, key),
		keyIntensity: natural.keyIntensity + key,
		skyColor: mixLight(natural.skyColor, natural.fillIntensity, TANK_LIGHT.fillColor, fill),
		fillIntensity: natural.fillIntensity + fill,
		waterColor: addRGB(natural.waterColor, TANK_LIGHT.waterColor, level),
		backdropTop: addRGB(natural.backdropTop, TANK_LIGHT.backdropTop, level),
		backdropBottom: addRGB(natural.backdropBottom, TANK_LIGHT.backdropBottom, level),
		causticIntensity: clamp(natural.causticIntensity + TANK_LIGHT.causticIntensity * level, 0, 1.2),
		shaftIntensity: clamp(natural.shaftIntensity + TANK_LIGHT.shaftIntensity * level, 0, 1),
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
		// Following the local clock, start from the real time rather than the saved hour.
		if (this.followsLocalTime) this.update(0)
	}

	get followsLocalTime(): boolean {
		return this.cycleMinutes <= 0
	}

	/** Simulated hours that pass per real second. */
	get hoursPerSecond(): number {
		return this.followsLocalTime ? 1 / 3600 : HOURS_PER_DAY / (this.cycleMinutes * 60)
	}

	get phase(): DayPhase {
		return phaseForHour(this.hour)
	}

	update(dt: number, now: Date = new Date()): void {
		if (this.followsLocalTime) {
			this.hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600
			return
		}
		this.hour = mod(this.hour + dt * this.hoursPerSecond, HOURS_PER_DAY)
	}
}

/**
 * The aquarium's light: natural light for the time of day, eased towards
 * the target set by the light mode so switching never snaps, plus the tank
 * light on top.
 */
export class LightingController {
	mode: LightMode = "auto"
	/** Natural light from the room: daylight or moonlight. */
	natural: LightingProfile
	/** What the scene shows and the fish experience: natural light plus the tank light. */
	current: LightingProfile
	readonly tankLight: TankLight
	private target: LightingProfile

	constructor(initialHour: number, mode: LightMode = "auto", tankLightOn = true) {
		this.mode = mode
		this.tankLight = new TankLight(tankLightOn)
		this.target = this.targetFor(initialHour)
		this.natural = this.target
		this.current = withTankLight(this.natural, this.tankLight.level)
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
		this.natural = this.target
		this.tankLight.snap()
		this.current = withTankLight(this.natural, this.tankLight.level)
	}

	update(dt: number, hour: number, rate: number = DAY_CYCLE.transitionRate): void {
		this.target = this.targetFor(hour)
		const t = 1 - Math.exp(-rate * dt)
		this.natural = lerpProfile(this.natural, this.target, t)
		this.tankLight.update(dt)
		this.current = withTankLight(this.natural, this.tankLight.level)
	}
}
