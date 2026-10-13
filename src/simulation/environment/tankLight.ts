import { TANK_LIGHT } from "@/config/dayNight"
import type { LightMode, TankLightCause } from "../core/events"
import { mod, moveTowards, smoothstep } from "../core/math"

/** Whether the fixture's timer has the light on at this hour (used in Auto mode). */
export function isTankLightScheduled(hour: number): boolean {
	const h = mod(hour, 24)
	return h >= TANK_LIGHT.onHour && h < TANK_LIGHT.offHour
}

/** Where the tank light belongs for a light mode: on by day, off at night, on its timer in Auto. */
export function tankLightForMode(mode: LightMode, hour: number): boolean {
	if (mode === "day") return true
	if (mode === "night") return false
	return isTankLightScheduled(hour)
}

/**
 * The LED fixture above the tank. A switch takes effect at once, but the
 * output fades like a real LED driver: briefly when switched by hand,
 * slowly when the timer brings the morning on.
 */
export class TankLight {
	on: boolean
	/** Light output, 0 (off) to 1 (full), eased. */
	level: number
	/** Linear position of the fade; `level` is its smoothed form. */
	private progress: number
	private rampSeconds: number = TANK_LIGHT.switchSeconds

	constructor(on: boolean) {
		this.on = on
		this.progress = on ? 1 : 0
		this.level = this.progress
	}

	switch(on: boolean, rampSeconds: number): void {
		this.on = on
		this.rampSeconds = Math.max(rampSeconds, 1e-3)
	}

	/** Jumps straight to full output or darkness (used on first load). */
	snap(): void {
		this.progress = this.on ? 1 : 0
		this.level = this.progress
	}

	update(dt: number): void {
		this.progress = moveTowards(this.progress, this.on ? 1 : 0, dt / this.rampSeconds)
		this.level = smoothstep(0, 1, this.progress)
	}
}

/** Real seconds a fade takes for each kind of switch. */
export function tankLightRampSeconds(cause: TankLightCause, hoursPerSecond: number): number {
	if (cause === "manual") return TANK_LIGHT.switchSeconds
	if (cause === "mode") return TANK_LIGHT.modeSeconds
	return Math.min(TANK_LIGHT.timerRampHours / hoursPerSecond, TANK_LIGHT.maxTimerRampSeconds)
}
