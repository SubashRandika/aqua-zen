import { SUBSTRATE } from "@/config/scape"
import { TANK_INTERIOR } from "@/config/tank"
import { clamp01, lerp, smoothstep } from "../core/math"
import { createNoise3D, fbm3 } from "../core/noise"

const noise = createNoise3D(SUBSTRATE.noiseSeed)

function ellipticalFalloff(
	x: number,
	z: number,
	center: readonly [number, number],
	radius: readonly [number, number],
): number {
	const dx = (x - center[0]) / radius[0]
	const dz = (z - center[1]) / radius[1]
	const d = Math.sqrt(dx * dx + dz * dz)
	return 1 - smoothstep(0, 1, d)
}

/**
 * Height of the substrate surface at (x, z). Shared by the terrain mesh,
 * the placement of rocks and plants, food settling and fish depth keeping,
 * so everything agrees on where the ground is.
 */
export function substrateHeight(x: number, z: number): number {
	const depthT = clamp01((TANK_INTERIOR.maxZ - z) / (TANK_INTERIOR.maxZ - TANK_INTERIOR.minZ))
	// Ease the slope so the back rises more steeply, like a sculpted aquascape.
	let height = lerp(
		SUBSTRATE.frontHeight,
		SUBSTRATE.backHeight,
		depthT * depthT * 0.6 + depthT * 0.4,
	)

	for (const mound of SUBSTRATE.mounds) {
		height += ellipticalFalloff(x, z, mound.center, mound.radius) * mound.height
	}
	const valley = SUBSTRATE.valley
	height -= ellipticalFalloff(x, z, valley.center, valley.radius) * valley.depth

	height += fbm3(noise, x * 6, 0.5, z * 6, 3) * 0.006
	return Math.max(TANK_INTERIOR.floorY + 0.012, height)
}
