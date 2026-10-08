/**
 * Aquascape layout. The composition follows a classic nature-aquarium
 * arrangement: the main stone sits near the golden section, driftwood rises
 * towards the opposite corner, tall plants frame the back, and an open sand
 * path in the foreground gives the eye (and the corydoras) somewhere to rest.
 *
 * Positions are in metres; y is resolved from the substrate height at runtime.
 */

export type Vec2Tuple = readonly [number, number]
export type Vec3Tuple = readonly [number, number, number]

export interface SubstrateMound {
	center: Vec2Tuple
	radius: Vec2Tuple
	height: number
}

export interface RockDefinition {
	id: string
	/** x, z position of the rock's base centre. */
	position: Vec2Tuple
	/** Approximate bounding size (x, y, z). */
	size: Vec3Tuple
	rotationY: number
	/** Lean in radians, giving the stones a sense of shared direction. */
	tilt: number
	seed: number
}

export interface DriftwoodBranch {
	/** Control points of the branch spine. */
	points: readonly Vec3Tuple[]
	radiusStart: number
	radiusEnd: number
}

export interface DriftwoodDefinition {
	id: string
	seed: number
	branches: readonly DriftwoodBranch[]
}

export type PlantKind = "vallisneria" | "rosette" | "hairgrass" | "stem"

export interface PlantGroupDefinition {
	id: string
	kind: PlantKind
	center: Vec2Tuple
	/** Spread of the group along x and z. */
	radius: Vec2Tuple
	/** Number of plants (or blades/tufts for grasses) at full density. */
	count: number
	height: Vec2Tuple
	seed: number
	/** Whether fish treat the group as cover to hide or rest in. */
	cover: boolean
}

export const SUBSTRATE = {
	/** Height of the substrate at the front glass. */
	frontHeight: 0.034,
	/** Height of the substrate at the back glass — the slope adds depth. */
	backHeight: 0.105,
	mounds: [
		{ center: [0.15, -0.06], radius: [0.22, 0.16], height: 0.035 },
		{ center: [-0.33, -0.12], radius: [0.2, 0.12], height: 0.022 },
		{ center: [0.42, 0.04], radius: [0.12, 0.1], height: 0.012 },
	] satisfies SubstrateMound[],
	/** A shallow sandy path in the foreground. */
	valley: { center: [-0.05, 0.12], radius: [0.22, 0.08], depth: 0.012 },
	noiseSeed: 7,
} as const

export const ROCKS: readonly RockDefinition[] = [
	// Main stone, near the right golden section, leaning with the others.
	{
		id: "main",
		position: [0.15, -0.06],
		size: [0.19, 0.28, 0.15],
		rotationY: 0.4,
		tilt: -0.14,
		seed: 11,
	},
	{
		id: "second",
		position: [0.31, 0.0],
		size: [0.12, 0.17, 0.1],
		rotationY: 1.3,
		tilt: -0.18,
		seed: 23,
	},
	{
		id: "third",
		position: [0.01, -0.03],
		size: [0.09, 0.12, 0.08],
		rotationY: 2.1,
		tilt: -0.12,
		seed: 37,
	},
	{
		id: "satellite-a",
		position: [0.41, 0.1],
		size: [0.06, 0.05, 0.05],
		rotationY: 0.7,
		tilt: -0.08,
		seed: 41,
	},
	{
		id: "satellite-b",
		position: [-0.12, 0.09],
		size: [0.05, 0.035, 0.045],
		rotationY: 2.8,
		tilt: 0.04,
		seed: 53,
	},
	{
		id: "left",
		position: [-0.39, -0.09],
		size: [0.1, 0.13, 0.085],
		rotationY: 4.2,
		tilt: 0.12,
		seed: 67,
	},
	{
		id: "left-small",
		position: [-0.27, 0.03],
		size: [0.055, 0.045, 0.05],
		rotationY: 5.0,
		tilt: 0.06,
		seed: 71,
	},
]

/**
 * Spider-wood style driftwood: a thick root bedded in the substrate behind
 * the left stones, sweeping up and left with twisting side branches.
 */
export const DRIFTWOOD: readonly DriftwoodDefinition[] = [
	{
		id: "main-wood",
		seed: 101,
		branches: [
			{
				points: [
					[-0.03, 0.035, 0.02],
					[-0.14, 0.07, -0.03],
					[-0.22, 0.12, -0.07],
					[-0.27, 0.19, -0.1],
					[-0.33, 0.27, -0.12],
					[-0.4, 0.34, -0.15],
					[-0.47, 0.41, -0.16],
				],
				radiusStart: 0.03,
				radiusEnd: 0.007,
			},
			{
				points: [
					[-0.25, 0.16, -0.09],
					[-0.21, 0.22, -0.13],
					[-0.19, 0.29, -0.15],
					[-0.13, 0.35, -0.17],
					[-0.1, 0.42, -0.19],
				],
				radiusStart: 0.013,
				radiusEnd: 0.004,
			},
			{
				points: [
					[-0.35, 0.29, -0.13],
					[-0.43, 0.3, -0.09],
					[-0.5, 0.33, -0.05],
					[-0.55, 0.37, -0.03],
				],
				radiusStart: 0.01,
				radiusEnd: 0.003,
			},
			{
				points: [
					[-0.31, 0.24, -0.11],
					[-0.32, 0.31, -0.07],
					[-0.29, 0.38, -0.04],
					[-0.3, 0.44, -0.03],
				],
				radiusStart: 0.008,
				radiusEnd: 0.0025,
			},
			{
				points: [
					[-0.12, 0.07, -0.02],
					[-0.06, 0.1, 0.03],
					[0.0, 0.11, 0.06],
					[0.04, 0.13, 0.07],
				],
				radiusStart: 0.012,
				radiusEnd: 0.004,
			},
			{
				points: [
					[-0.19, 0.1, -0.05],
					[-0.23, 0.085, 0.01],
					[-0.27, 0.075, 0.05],
				],
				radiusStart: 0.011,
				radiusEnd: 0.004,
			},
			{
				points: [
					[-0.42, 0.36, -0.15],
					[-0.44, 0.43, -0.18],
					[-0.4, 0.47, -0.2],
				],
				radiusStart: 0.006,
				radiusEnd: 0.002,
			},
		],
	},
]

export const PLANT_GROUPS: readonly PlantGroupDefinition[] = [
	// Tall background grass framing both sides, thinner in the middle.
	{
		id: "val-left",
		kind: "vallisneria",
		center: [-0.4, -0.2],
		radius: [0.17, 0.035],
		count: 70,
		height: [0.3, 0.5],
		seed: 201,
		cover: true,
	},
	{
		id: "val-mid",
		kind: "vallisneria",
		center: [-0.05, -0.215],
		radius: [0.17, 0.025],
		count: 34,
		height: [0.22, 0.4],
		seed: 202,
		cover: false,
	},
	{
		id: "val-right",
		kind: "vallisneria",
		center: [0.4, -0.2],
		radius: [0.18, 0.035],
		count: 80,
		height: [0.32, 0.5],
		seed: 203,
		cover: true,
	},
	// Broad-leaf rosettes in the midground.
	{
		id: "sword-right",
		kind: "rosette",
		center: [0.47, -0.1],
		radius: [0.05, 0.05],
		count: 2,
		height: [0.16, 0.24],
		seed: 301,
		cover: true,
	},
	{
		id: "sword-left",
		kind: "rosette",
		center: [-0.5, -0.04],
		radius: [0.04, 0.05],
		count: 2,
		height: [0.13, 0.2],
		seed: 302,
		cover: true,
	},
	{
		id: "crypt-mid",
		kind: "rosette",
		center: [0.05, -0.12],
		radius: [0.08, 0.03],
		count: 3,
		height: [0.07, 0.11],
		seed: 303,
		cover: true,
	},
	// Red-tipped stem plants add a single warm accent in the back right.
	{
		id: "stem-right",
		kind: "stem",
		center: [0.27, -0.17],
		radius: [0.07, 0.03],
		count: 16,
		height: [0.24, 0.4],
		seed: 401,
		cover: true,
	},
	// Foreground carpet of dwarf hairgrass, leaving the sandy path open.
	{
		id: "carpet-left",
		kind: "hairgrass",
		center: [-0.34, 0.1],
		radius: [0.22, 0.11],
		count: 2200,
		height: [0.012, 0.04],
		seed: 501,
		cover: false,
	},
	{
		id: "carpet-right",
		kind: "hairgrass",
		center: [0.33, 0.12],
		radius: [0.24, 0.1],
		count: 2400,
		height: [0.012, 0.038],
		seed: 502,
		cover: false,
	},
	{
		id: "carpet-back",
		kind: "hairgrass",
		center: [0.05, -0.1],
		radius: [0.3, 0.07],
		count: 1300,
		height: [0.015, 0.04],
		seed: 503,
		cover: false,
	},
]

/** Where the air stone sits; bubbles rise from here. */
export const AIR_STONE: Vec3Tuple = [-0.53, 0.0, -0.2]
