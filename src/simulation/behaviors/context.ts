import type { Vector3 } from "three"
import type { EventBus } from "../core/events"
import type { Noise3D } from "../core/noise"
import type { RandomSource } from "../core/random"
import type { ScapeLayout } from "../environment/scapeLayout"
import type { FoodManager } from "../feeding/FoodManager"
import type { FishAgent } from "../fish/FishAgent"
import type { GlassStimuli } from "../interaction/GlassStimuli"
import type { Bounds } from "../steering/steering"

/** Neighbour information gathered during perception. */
export interface Perception {
	/** All nearby fish, any species. */
	neighbors: FishAgent[]
	/** Nearest same-species fish, limited to the species' `maxNeighbors`. */
	schoolmates: FishAgent[]
	/** Same-species fish further away — used to regroup with a distant school. */
	schoolCenter: Vector3 | null
	schoolHeading: Vector3 | null
	/** Number of nearby fish currently going for food — feeding is contagious. */
	feedingNeighbors: number
}

/** Everything a fish's behaviour may look at, assembled once per step. */
export interface BehaviorContext {
	time: number
	dt: number
	random: RandomSource
	noise: Noise3D
	/** 0 = deep night, 1 = full daylight (from the live lighting, not the clock). */
	daylight: number
	bounds: Bounds
	scape: ScapeLayout
	food: FoodManager
	stimuli: GlassStimuli
	agents: ReadonlyMap<number, FishAgent>
	/** Height of the water column floor at a point. */
	floorAt: (x: number, z: number) => number
	surfaceY: number
	events: EventBus
}
