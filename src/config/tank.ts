/**
 * Physical dimensions of the aquarium in metres. One world unit is one metre,
 * so swimming speeds and fish sizes can use real-world values.
 */
export const TANK = {
	/** Outer glass width (x). */
	width: 1.2,
	/** Outer glass height (y). The bottom glass sits at y = 0. */
	height: 0.55,
	/** Outer glass depth (z). The front pane faces +z, towards the viewer. */
	depth: 0.5,
	glassThickness: 0.008,
	/** Water surface height. */
	waterLevel: 0.512,
} as const

export const TANK_INTERIOR = {
	minX: -TANK.width / 2 + TANK.glassThickness,
	maxX: TANK.width / 2 - TANK.glassThickness,
	minZ: -TANK.depth / 2 + TANK.glassThickness,
	maxZ: TANK.depth / 2 - TANK.glassThickness,
	floorY: TANK.glassThickness,
	surfaceY: TANK.waterLevel,
} as const

/** World-space z of the inner surface of the front glass. */
export const FRONT_GLASS_Z = TANK_INTERIOR.maxZ
