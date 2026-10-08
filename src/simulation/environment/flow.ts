import type { Vector3 } from "three"
import { TANK_INTERIOR } from "@/config/tank"
import { inverseLerp } from "../core/math"
import { createNoise3D } from "../core/noise"

const turbulence = createNoise3D(97)

export const FLOW = {
	/** Peak speed of the filter current near the surface, m/s. */
	surfaceCurrent: 0.012,
	/** Return current along the bottom, m/s. */
	returnCurrent: 0.004,
	turbulence: 0.004,
	turbulenceScale: 3.5,
	turbulenceSpeed: 0.05,
} as const

/**
 * Gentle circulation produced by a filter outlet at the back right: water
 * flows leftwards along the surface and returns along the bottom, with slow
 * turbulence on top. Food, particles and resting fish drift in it.
 */
export function sampleFlow(position: Vector3, time: number, out: Vector3): Vector3 {
	const heightT = inverseLerp(TANK_INTERIOR.floorY, TANK_INTERIOR.surfaceY, position.y)
	// Surface flows towards -x, bottom returns towards +x, with a soft blend between.
	const circulation = heightT > 0.55 ? (heightT - 0.55) / 0.45 : -(0.55 - heightT) / 0.55
	const horizontal =
		circulation > 0 ? -circulation * FLOW.surfaceCurrent : -circulation * FLOW.returnCurrent

	const s = FLOW.turbulenceScale
	const t = time * FLOW.turbulenceSpeed
	out.set(
		horizontal + turbulence(position.x * s, position.y * s, t) * FLOW.turbulence,
		turbulence(position.x * s + 31.7, position.y * s, t + 11.3) * FLOW.turbulence * 0.6,
		turbulence(position.x * s, position.y * s + 17.1, t + 23.9) * FLOW.turbulence * 0.8,
	)
	return out
}
