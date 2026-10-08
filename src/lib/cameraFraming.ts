import { TANK } from "@/config/tank"
import { lerp, smoothstep } from "@/simulation/core/math"

export const CAMERA = {
	fov: 32,
	/** Eye height: just below mid-tank, so the water surface is seen from beneath. */
	eyeHeight: 0.27,
	targetHeight: 0.265,
	/** Extra space around the tank as a fraction of its size. */
	margin: 0.04,
} as const

export interface CameraPose {
	position: [number, number, number]
	target: [number, number, number]
	/** How far the view may pan sideways and stay within the tank (narrow screens). */
	panRange: number
}

/**
 * The default "seated in front of the tank" composition for a viewport
 * aspect ratio. Landscape screens show the whole tank framed by its glass
 * edges; narrower screens keep the full height and crop progressively more
 * of the sides — a phone held upright looks at part of the aquarium rather
 * than a tiny one, and a slow pan reveals the rest.
 */
export function defaultCameraPose(aspect: number, fov: number = CAMERA.fov): CameraPose {
	const tanHalf = Math.tan((fov * Math.PI) / 360)
	const frontZ = TANK.depth / 2
	const fitHeight = (TANK.height / 2 + CAMERA.margin) / tanHalf
	const fitWidth = (TANK.width / 2 + CAMERA.margin) / (tanHalf * aspect)
	// From 0.97 (the whole tank) on landscape screens down to 0.4 (a generous crop) on tall phones.
	const widthFraction = lerp(0.4, 0.97, smoothstep(0.45, 1, aspect))
	const distance = Math.max(fitHeight * (aspect >= 1 ? 1 : 1.05), fitWidth * widthFraction)
	const visibleHalfWidth = distance * tanHalf * aspect
	return {
		position: [0, CAMERA.eyeHeight, frontZ + distance],
		target: [0, CAMERA.targetHeight, 0],
		panRange: Math.max(0, TANK.width / 2 - visibleHalfWidth - 0.02),
	}
}
