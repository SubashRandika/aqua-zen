import { Vector3, type Vector3Like } from "three"
import { DAY_CYCLE } from "@/config/dayNight"
import { SPECIES, STARTER_ROSTER } from "@/config/species"
import { TANK_INTERIOR } from "@/config/tank"
import type { BehaviorContext } from "../behaviors/context"
import { AquariumClock, LightingController } from "../environment/dayNight"
import { createScapeLayout, type ScapeLayout } from "../environment/scapeLayout"
import { substrateHeight } from "../environment/substrate"
import {
	isTankLightScheduled,
	tankLightForMode,
	tankLightRampSeconds,
} from "../environment/tankLight"
import { FoodManager } from "../feeding/FoodManager"
import { FishManager } from "../fish/FishManager"
import { populationPlan, type Roster } from "../fish/population"
import type { FishSpeciesDefinition } from "../fish/types"
import { GlassStimuli } from "../interaction/GlassStimuli"
import type { Bounds } from "../steering/steering"
import { EventBus, type DayPhase, type LightMode } from "./events"
import { createNoise3D, type Noise3D } from "./noise"
import { createRandom, type RandomSource } from "./random"

export interface WorldOptions {
	seed?: number
	species?: readonly FishSpeciesDefinition[]
	/** The fish the owner keeps. Defaults to the starter tank. */
	roster?: Roster
	/** Most fish the quality level animates smoothly. Defaults to no limit. */
	fishCapacity?: number
	hour?: number
	cycleMinutes?: number
	lightMode?: LightMode
	/** Whether the tank light starts on. Defaults to what the light mode implies. */
	tankLight?: boolean
}

/** Longest step the simulation integrates at once; longer frames are split. */
const MAX_STEP = 1 / 30
/** Frames longer than this (e.g. a background tab) are not caught up. */
const MAX_FRAME = 0.25

/**
 * The living aquarium, independent of rendering and React. Owns the clock,
 * lighting, fish, food and glass stimuli; listens for environmental events
 * on its bus and advances everything in time-based steps.
 */
export class AquariumWorld {
	readonly events = new EventBus()
	readonly random: RandomSource
	readonly noise: Noise3D
	readonly scape: ScapeLayout
	readonly clock: AquariumClock
	readonly lighting: LightingController
	readonly food: FoodManager
	readonly fish: FishManager
	readonly stimuli = new GlassStimuli()
	readonly bounds: Bounds = {
		minX: TANK_INTERIOR.minX,
		maxX: TANK_INTERIOR.maxX,
		minY: TANK_INTERIOR.floorY,
		maxY: TANK_INTERIOR.surfaceY,
		minZ: TANK_INTERIOR.minZ,
		maxZ: TANK_INTERIOR.maxZ,
	}
	/** Seconds of simulated time since the world was created. */
	elapsed = 0
	private phase: DayPhase
	/** The tank light timer's last state, so Auto mode switches only when it changes. */
	private timerOn: boolean
	private roster: Roster
	private fishCapacity: number
	private readonly context: BehaviorContext
	private readonly cameraPosition = new Vector3()
	private hasCamera = false
	private readonly unsubscribers: Array<() => void> = []

	constructor(options: WorldOptions = {}) {
		const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31)
		this.random = createRandom(seed)
		this.noise = createNoise3D(seed ^ 0x5bd1e995)
		this.scape = createScapeLayout(seed)
		this.clock = new AquariumClock(
			options.hour ?? DAY_CYCLE.initialHour,
			options.cycleMinutes ?? DAY_CYCLE.defaultCycleMinutes,
		)
		const lightMode = options.lightMode ?? "auto"
		this.lighting = new LightingController(
			this.clock.hour,
			lightMode,
			options.tankLight ?? tankLightForMode(lightMode, this.clock.hour),
		)
		this.phase = this.clock.phase
		this.timerOn = isTankLightScheduled(this.clock.hour)
		this.food = new FoodManager(this.random)
		this.fish = new FishManager(this.random, options.species ?? SPECIES)
		this.roster = options.roster ?? STARTER_ROSTER
		this.fishCapacity = options.fishCapacity ?? Number.POSITIVE_INFINITY
		this.fish.setPopulation(this.populationPlan(), this.spawnOptions(), false)

		this.context = {
			time: 0,
			dt: 0,
			random: this.random,
			noise: this.noise,
			daylight: this.lighting.current.daylight,
			bounds: this.bounds,
			scape: this.scape,
			food: this.food,
			stimuli: this.stimuli,
			agents: this.fish.byId,
			floorAt: substrateHeight,
			surfaceY: TANK_INTERIOR.surfaceY,
			events: this.events,
		}
		this.subscribe()
	}

	private populationPlan() {
		return populationPlan(this.fish.species, this.roster, this.fishCapacity)
	}

	private spawnOptions() {
		return {
			bounds: this.bounds,
			scape: this.scape,
			floorAt: substrateHeight,
			surfaceY: TANK_INTERIOR.surfaceY,
		}
	}

	private subscribe(): void {
		const bus = this.events
		this.unsubscribers.push(
			bus.on("glass:tap", (event) => {
				const stimulus = this.stimuli.addTap(event.point, event.strength, this.elapsed)
				this.fish.reactToTap(stimulus.position, event.strength, stimulus.id, this.elapsed)
			}),
			bus.on("glass:hold", (event) => {
				if (event.phase === "start") {
					const stimulus = this.stimuli.startTouch(event.point, this.elapsed)
					// A finger arriving on the glass is a gentle tap.
					this.fish.reactToTap(stimulus.position, 0.45, stimulus.id, this.elapsed)
				} else if (event.phase === "move") {
					this.stimuli.moveTouch(event.point)
				} else {
					this.stimuli.endTouch()
				}
			}),
			bus.on("glass:hover", (event) => this.stimuli.setHover(event.point, this.elapsed)),
			bus.on("light:changed", (event) => {
				this.lighting.setMode(event.mode)
				// Day brings the tank light on and Night turns it off; Auto hands it back to its timer.
				const on = tankLightForMode(event.mode, this.clock.hour)
				if (on !== this.lighting.tankLight.on) {
					bus.emit({ type: "tank-light:changed", on, cause: "mode" })
				}
			}),
			bus.on("tank-light:changed", (event) =>
				this.lighting.tankLight.switch(
					event.on,
					tankLightRampSeconds(event.cause, this.clock.hoursPerSecond),
				),
			),
		)
	}

	/**
	 * Drops food at the water surface above a point. Returns the number of
	 * flakes released (0 while the feeding cooldown is active).
	 */
	feed(point: Vector3Like): number {
		const created = this.food.release(point.x, point.z, this.elapsed)
		if (created.length > 0) {
			const first = created[0]!
			this.events.emit({ type: "food:released", position: first.position, count: created.length })
		}
		return created.length
	}

	canFeed(): boolean {
		return this.food.canRelease(this.elapsed)
	}

	setLightMode(mode: LightMode): void {
		if (mode === this.lighting.mode) return
		this.events.emit({ type: "light:changed", mode })
	}

	/** Switches the tank light by hand. In Auto mode this holds until the timer next switches. */
	setTankLight(on: boolean): void {
		if (on === this.lighting.tankLight.on) return
		this.events.emit({ type: "tank-light:changed", on, cause: "manual" })
	}

	setCycleMinutes(minutes: number): void {
		this.clock.cycleMinutes = minutes
	}

	/** Changes the fish in the tank. Newcomers emerge from cover; fish taken out swim off and fade. */
	setRoster(roster: Roster): void {
		this.roster = roster
		this.repopulate()
	}

	/** Limits how many fish are animated, for the quality level in use. */
	setFishCapacity(capacity: number): void {
		if (capacity === this.fishCapacity) return
		this.fishCapacity = capacity
		this.repopulate()
	}

	private repopulate(): void {
		this.fish.setPopulation(this.populationPlan(), this.spawnOptions(), true)
		this.events.emit({ type: "population:changed" })
	}

	setCameraPosition(position: Vector3Like): void {
		this.cameraPosition.set(position.x, position.y, position.z)
		this.hasCamera = true
	}

	/** Advances the world by a real-time frame delta, in seconds. */
	update(frameDelta: number): void {
		let remaining = Math.min(Math.max(frameDelta, 0), MAX_FRAME)
		while (remaining > 1e-6) {
			const step = Math.min(remaining, MAX_STEP)
			this.step(step)
			remaining -= step
		}
	}

	private step(dt: number): void {
		this.elapsed += dt
		this.clock.update(dt)
		this.runTankLightTimer()
		this.lighting.update(dt, this.clock.hour)

		const phase = this.clock.phase
		if (phase !== this.phase) {
			this.phase = phase
			this.events.emit({ type: "time:phase", phase })
		}

		this.stimuli.update(this.elapsed)
		this.food.update(dt, this.elapsed)

		this.context.time = this.elapsed
		this.context.dt = dt
		this.context.daylight = this.lighting.current.daylight
		const departed = this.fish.update(this.context, this.hasCamera ? this.cameraPosition : null)
		if (departed) this.events.emit({ type: "population:changed" })
	}

	private runTankLightTimer(): void {
		const scheduled = isTankLightScheduled(this.clock.hour)
		if (scheduled === this.timerOn) return
		this.timerOn = scheduled
		if (this.lighting.mode === "auto" && scheduled !== this.lighting.tankLight.on) {
			this.events.emit({ type: "tank-light:changed", on: scheduled, cause: "timer" })
		}
	}

	dispose(): void {
		for (const unsubscribe of this.unsubscribers) unsubscribe()
		this.events.clear()
	}
}
