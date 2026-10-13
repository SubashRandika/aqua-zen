import { Vector3, type Vector3Like } from "three"
import { decide, shouldDecide } from "../behaviors/decision"
import type { BehaviorContext, Perception } from "../behaviors/context"
import { bellyOffset, holdOnToSurface } from "../behaviors/forage"
import { steerAgent } from "../behaviors/steer"
import { agentActivity } from "../behaviors/activity"
import { clamp, damp, lerp } from "../core/math"
import { randomRange, type RandomSource } from "../core/random"
import { SpatialHash } from "../core/spatialHash"
import { obstacleDistance, type ScapeLayout } from "../environment/scapeLayout"
import { sampleFlow } from "../environment/flow"
import type { Bounds } from "../steering/steering"
import { GLASS_INTERACTION } from "../interaction/GlassStimuli"
import { FishAgent, type PendingReaction } from "./FishAgent"
import { generatePersonality } from "./personality"
import type { PopulationEntry } from "./population"
import type { FishSpeciesDefinition } from "./types"

const PERCEPTION_RADIUS = 0.25
/** Bottom dwellers are heavier than water: they settle when they stop swimming. */
const BOTTOM_DWELLER_SINK_RATE = 0.012
/** Near fish refresh neighbours every frame-ish; distant ones less often. */
const PERCEPTION_INTERVAL = { near: 1 / 30, far: 1 / 10 }
/** Seconds for a newcomer to fade in as it leaves cover. */
const ARRIVAL_FADE_SECONDS = 2.2
/** A fish taken out swims for cover at most this long before it fades away. */
const DEPARTURE_SWIM_SECONDS = 3
const DEPARTURE_FADE_SECONDS = 1.6

const desire = new Vector3()
const flow = new Vector3()
const WORLD_UP = new Vector3(0, 1, 0)
const normal = new Vector3()
const scratch = new Vector3()

interface SpeciesStats {
	center: Vector3
	heading: Vector3
	count: number
}

export interface SpawnOptions {
	bounds: Bounds
	scape: ScapeLayout
	floorAt: (x: number, z: number) => number
	surfaceY: number
}

/**
 * Owns every fish agent and runs the per-step pipeline:
 * perception → drives → scheduled reactions → decisions → steering →
 * integration → constraints. All state lives here, outside React.
 */
export class FishManager {
	readonly agents: FishAgent[] = []
	readonly byId = new Map<number, FishAgent>()
	private readonly spatial = new SpatialHash<FishAgent>(PERCEPTION_RADIUS)
	private readonly perceptions = new Map<number, Perception>()
	private readonly speciesStats = new Map<string, SpeciesStats>()
	private readonly queryBuffer: FishAgent[] = []
	private nextId = 1
	private compositionKey = ""

	constructor(
		private readonly random: RandomSource,
		/** Every species the tank can hold. */
		readonly species: readonly FishSpeciesDefinition[],
	) {}

	/**
	 * The species currently in the tank (including fish on their way out),
	 * as a comma-separated list of ids in catalogue order. Changes only when
	 * a species arrives or is gone.
	 */
	get composition(): string {
		return this.compositionKey
	}

	/**
	 * Adds and takes out fish so the tank matches the plan. With `gradual`,
	 * newcomers emerge from cover and fade in, and fish taken out swim into
	 * cover and fade away; otherwise changes are immediate.
	 */
	setPopulation(plan: readonly PopulationEntry[], options: SpawnOptions, gradual: boolean): void {
		const planned = new Set(plan.map((entry) => entry.species.id))
		const departing = this.agents.filter((a) => !a.leaving && !planned.has(a.species.id))
		for (const { species, count } of plan) {
			const staying = this.agents.filter((a) => a.species.id === species.id && !a.leaving)
			if (staying.length > count) {
				departing.push(...staying.slice(count))
				continue
			}
			let missing = count - staying.length
			// Fish already on their way out turn back before new ones are added.
			for (const agent of this.agents) {
				if (missing === 0) break
				if (agent.species.id !== species.id || !agent.leaving) continue
				agent.leaving = false
				agent.stateDuration = 0
				missing--
			}
			if (missing > 0) this.spawnGroup(species, missing, options, gradual)
		}
		for (const agent of departing) {
			if (gradual) agent.leaving = true
			else this.remove(agent.id)
		}
		this.refreshComposition()
	}

	private refreshComposition(): void {
		const present = new Set(this.agents.map((a) => a.species.id))
		this.compositionKey = this.species
			.filter((s) => present.has(s.id))
			.map((s) => s.id)
			.join(",")
	}

	private remove(id: number): void {
		const index = this.agents.findIndex((a) => a.id === id)
		if (index >= 0) this.agents.splice(index, 1)
		this.byId.delete(id)
		this.perceptions.delete(id)
	}

	private spawnGroup(
		species: FishSpeciesDefinition,
		count: number,
		options: SpawnOptions,
		joining: boolean,
	): void {
		const r = this.random
		const b = options.bounds
		const schooling = species.behavior.schooling > 0.4
		// Schooling species start loosely together; others spread out.
		const groupCenter = new Vector3(
			randomRange(r, b.minX + 0.15, b.maxX - 0.15),
			0,
			randomRange(r, b.minZ + 0.08, b.maxZ - 0.08),
		)
		const groupYaw = r() * Math.PI * 2
		const cover = options.scape.coverSpots
		const pickCover = () => cover[Math.floor(r() * cover.length)]!
		// A school arrives together, from one patch of cover.
		const sharedCover = joining && schooling && cover.length > 0 ? pickCover() : null
		for (let i = 0; i < count; i++) {
			const agent = new FishAgent(this.nextId++, species, generatePersonality(species, r), r)
			let x: number
			let z: number
			if (joining && cover.length > 0) {
				// Newcomers emerge from cover rather than appearing in open water.
				const spot = sharedCover ?? pickCover()
				x = spot.x + (sharedCover ? randomRange(r, -0.05, 0.05) : 0)
				z = spot.z + (sharedCover ? randomRange(r, -0.03, 0.03) : 0)
				agent.presence = 0
			} else if (schooling) {
				x = groupCenter.x + randomRange(r, -0.12, 0.12)
				z = groupCenter.z + randomRange(r, -0.06, 0.06)
			} else {
				x = randomRange(r, b.minX + 0.1, b.maxX - 0.1)
				z = randomRange(r, b.minZ + 0.06, b.maxZ - 0.06)
			}
			x = clamp(x, b.minX + 0.05, b.maxX - 0.05)
			z = clamp(z, b.minZ + 0.05, b.maxZ - 0.05)
			const floor = options.floorAt(x, z)
			const y = lerp(
				floor + agent.radius * 2,
				options.surfaceY - agent.radius * 2,
				agent.personality.preferredDepth,
			)
			agent.position.set(x, y, z)
			this.pushOutOfObstacles(agent, options.scape)
			const yaw = schooling ? groupYaw + randomRange(r, -0.5, 0.5) : r() * Math.PI * 2
			agent.heading.set(Math.cos(yaw), 0, Math.sin(yaw))
			agent.speed = species.movement.cruiseSpeed * randomRange(r, 0.3, 0.8)
			agent.nextDecisionAt = randomRange(r, 0, 1.5)
			agent.stateDuration = randomRange(r, 2, 6)
			agent.perceptionCountdown = r() * PERCEPTION_INTERVAL.near
			this.assignTerritory(agent, options)
			this.agents.push(agent)
			this.byId.set(agent.id, agent)
		}
	}

	private assignTerritory(agent: FishAgent, options: SpawnOptions): void {
		if (agent.personality.territoriality < 0.3) return
		const spots = options.scape.restSpots.filter((s) => s.kind !== "bottom")
		const spot = spots[Math.floor(this.random() * spots.length)]
		agent.territory = spot ? spot.position.clone() : agent.position.clone()
		agent.territoryRadius = 0.1 + 0.12 * agent.personality.territoriality
	}

	/**
	 * Advances every fish by one step. Returns true when fish have left the
	 * tank during the step.
	 */
	update(ctx: BehaviorContext, cameraPosition: Vector3Like | null): boolean {
		this.spatial.rebuild(this.agents)
		this.computeSpeciesStats()

		for (const agent of this.agents) {
			if (cameraPosition) {
				const dx = agent.position.x - cameraPosition.x
				const dy = agent.position.y - cameraPosition.y
				const dz = agent.position.z - cameraPosition.z
				agent.cameraDistance = Math.sqrt(dx * dx + dy * dy + dz * dz)
			}
			agent.stateTime += ctx.dt
			if (agent.leaving) this.depart(agent, ctx)
			else if (agent.presence < 1)
				agent.presence = Math.min(1, agent.presence + ctx.dt / ARRIVAL_FADE_SECONDS)

			const perception = this.perceive(agent, ctx.dt)
			this.updateDrives(agent, ctx, perception)
			this.processReactions(agent, ctx)

			if (shouldDecide(agent, ctx)) decide(agent, ctx, perception)

			const urgency = steerAgent(agent, ctx, perception, desire)
			agent.integrate(desire, urgency, ctx.dt, this.random)

			if (agent.cling) {
				// Holding on: no drift, and the body lies against the surface.
				agent.position.addScaledVector(agent.velocity, ctx.dt)
				holdOnToSurface(agent, ctx)
				agent.wallMargin = bellyOffset(agent)
			} else {
				// Gentle drift with the water, stronger when the fish is holding still.
				sampleFlow(agent.position, ctx.time, flow)
				const drift = agent.state === "resting" ? 0.6 : 0.25
				agent.position.addScaledVector(agent.velocity, ctx.dt).addScaledVector(flow, ctx.dt * drift)
				if (agent.species.movement.swimStyle === "bottomHop")
					agent.position.y -= BOTTOM_DWELLER_SINK_RATE * (1 - agent.thrust) * ctx.dt
				agent.wallMargin = damp(agent.wallMargin, agent.radius, 1.5, ctx.dt)
				this.separateOverlaps(agent, perception)
				this.applyConstraints(agent, ctx)
			}
			// The back turns to face away from whatever the fish is clinging to.
			agent.up.lerp(agent.cling ? agent.cling.normal : WORLD_UP, 1 - Math.exp(-5 * ctx.dt))
			agent.up.normalize()
		}
		return this.removeDeparted()
	}

	/** A fish taken out of the tank swims into the nearest cover and fades away there. */
	private depart(agent: FishAgent, ctx: BehaviorContext): void {
		if (agent.state !== "hiding") {
			let nearest: Vector3 | null = null
			for (const spot of ctx.scape.coverSpots) {
				const closer =
					!nearest ||
					spot.distanceToSquared(agent.position) < nearest.distanceToSquared(agent.position)
				if (closer) nearest = spot
			}
			agent.target.copy(nearest ?? agent.position)
			agent.setState("hiding", ctx.time, Number.POSITIVE_INFINITY)
		}
		if (agent.arrived || agent.stateTime > DEPARTURE_SWIM_SECONDS)
			agent.presence = Math.max(0, agent.presence - ctx.dt / DEPARTURE_FADE_SECONDS)
	}

	private removeDeparted(): boolean {
		let removed = false
		for (let i = this.agents.length - 1; i >= 0; i--) {
			const agent = this.agents[i]!
			if (!agent.leaving || agent.presence > 0) continue
			this.remove(agent.id)
			removed = true
		}
		if (removed) this.refreshComposition()
		return removed
	}

	/** Gently resolves bodies that still overlap after steering (e.g. in a tight school). */
	private separateOverlaps(agent: FishAgent, perception: Perception): void {
		for (const other of perception.neighbors) {
			scratch.subVectors(agent.position, other.position)
			const distance = scratch.length()
			const minimum = (agent.radius + other.radius) * 0.85
			if (distance >= minimum || distance < 1e-6) continue
			// The smaller fish yields more.
			const share = other.radius / (agent.radius + other.radius)
			agent.position.addScaledVector(scratch, ((minimum - distance) * share * 0.5) / distance)
		}
	}

	private computeSpeciesStats(): void {
		for (const stats of this.speciesStats.values()) {
			stats.center.set(0, 0, 0)
			stats.heading.set(0, 0, 0)
			stats.count = 0
		}
		for (const agent of this.agents) {
			let stats = this.speciesStats.get(agent.species.id)
			if (!stats) {
				stats = { center: new Vector3(), heading: new Vector3(), count: 0 }
				this.speciesStats.set(agent.species.id, stats)
			}
			stats.center.add(agent.position)
			stats.heading.add(agent.heading)
			stats.count++
		}
		for (const stats of this.speciesStats.values()) {
			if (stats.count > 0) stats.center.divideScalar(stats.count)
		}
	}

	private perceive(agent: FishAgent, dt: number): Perception {
		let perception = this.perceptions.get(agent.id)
		agent.perceptionCountdown -= dt
		if (perception && agent.perceptionCountdown > 0) return perception

		const interval = agent.cameraDistance > 1.6 ? PERCEPTION_INTERVAL.far : PERCEPTION_INTERVAL.near
		agent.perceptionCountdown = interval
		if (!perception) {
			perception = {
				neighbors: [],
				schoolmates: [],
				schoolCenter: null,
				schoolHeading: null,
				feedingNeighbors: 0,
			}
			this.perceptions.set(agent.id, perception)
		}

		const radius = Math.max(PERCEPTION_RADIUS, agent.species.schooling.neighborRadius)
		const found = this.spatial.query(agent.position, radius, this.queryBuffer)
		perception.neighbors.length = 0
		perception.schoolmates.length = 0
		perception.feedingNeighbors = 0
		for (const other of found) {
			if (other.id === agent.id) continue
			perception.neighbors.push(other)
			if (other.state === "seekingFood" || other.state === "feeding") perception.feedingNeighbors++
		}

		// Track only the nearest few schoolmates (topological neighbourhood).
		const maxMates = agent.species.schooling.maxNeighbors
		if (maxMates > 0) {
			const sameSpecies = perception.neighbors.filter(
				(o) =>
					o.species.id === agent.species.id &&
					o.position.distanceTo(agent.position) <= agent.species.schooling.neighborRadius,
			)
			sameSpecies.sort(
				(a, b) =>
					a.position.distanceToSquared(agent.position) -
					b.position.distanceToSquared(agent.position),
			)
			for (let i = 0; i < Math.min(maxMates, sameSpecies.length); i++)
				perception.schoolmates.push(sameSpecies[i]!)
		}

		const stats = this.speciesStats.get(agent.species.id)
		if (stats && stats.count > 1 && perception.schoolmates.length === 0) {
			// Regroup towards the rest of the species when isolated.
			perception.schoolCenter = (perception.schoolCenter ?? new Vector3())
				.copy(stats.center)
				.multiplyScalar(stats.count)
				.sub(agent.position)
				.divideScalar(stats.count - 1)
			perception.schoolHeading = (perception.schoolHeading ?? new Vector3())
				.copy(stats.heading)
				.normalize()
		} else {
			perception.schoolCenter = null
			perception.schoolHeading = null
		}
		return perception
	}

	private updateDrives(agent: FishAgent, ctx: BehaviorContext, perception: Perception): void {
		const dt = ctx.dt
		const activity = agentActivity(agent, ctx.daylight)
		agent.hunger = clamp(
			agent.hunger + (agent.species.feeding.appetite / 60) * dt * (0.4 + activity * 0.6),
			0,
			1,
		)

		const exertion = (agent.speed / Math.max(agent.species.movement.burstSpeed, 1e-3)) ** 2
		const resting = agent.state === "resting" && agent.arrived
		agent.stamina = clamp(
			agent.stamina - exertion * 0.03 * dt + (resting ? 0.045 : 0.006) * dt,
			0,
			1,
		)

		const calming = agent.state === "hiding" && agent.arrived ? 0.3 : 0.12
		agent.fear *= Math.exp(-calming * dt)

		// Food is noticed after a personal reaction delay, quicker when others are already eating.
		if (ctx.food.particles.length > 0) {
			if (!Number.isFinite(agent.foodNoticedAt)) {
				const hesitation = (1 - agent.hunger) * randomRange(this.random, 0.3, 2.2)
				const social = perception.feedingNeighbors > 0 ? 0.4 : 1
				agent.foodNoticedAt = ctx.time + (agent.personality.reactionTime + hesitation) * social
			}
		} else {
			agent.foodNoticedAt = Number.POSITIVE_INFINITY
		}

		const nightFactor = 1 - ctx.daylight
		const pattern = agent.species.visual.pattern
		const restingFade = agent.state === "resting" ? 1 : 0.4
		const colorTarget = 1 - pattern.nightFade * nightFactor * restingFade
		agent.colorIntensity = damp(agent.colorIntensity, colorTarget, 0.4, dt)
	}

	private processReactions(agent: FishAgent, ctx: BehaviorContext): void {
		if (agent.pendingReactions.length === 0) return
		// A fish on its way out keeps going.
		if (agent.leaving) {
			agent.pendingReactions.length = 0
			return
		}
		const due: PendingReaction[] = []
		for (let i = agent.pendingReactions.length - 1; i >= 0; i--) {
			const reaction = agent.pendingReactions[i]!
			if (reaction.at <= ctx.time) {
				due.push(reaction)
				agent.pendingReactions.splice(i, 1)
			}
		}
		for (const reaction of due) this.applyReaction(agent, reaction, ctx)
	}

	private applyReaction(agent: FishAgent, reaction: PendingReaction, ctx: BehaviorContext): void {
		switch (reaction.kind) {
			case "startle": {
				agent.threat.copy(reaction.point)
				agent.fear = clamp(
					agent.fear + 0.5 * reaction.strength + agent.personality.shyness * 0.3,
					0,
					1,
				)
				agent.setState("startled", ctx.time, randomRange(this.random, 0.8, 1.8))
				ctx.events.emit({ type: "fish:startled", fishId: agent.id, position: agent.position })
				this.propagateAlarm(agent, reaction, ctx)
				return
			}
			case "flinch":
				agent.fear = clamp(agent.fear + 0.2 * reaction.strength, 0, 1)
				return
			case "avoid": {
				if (agent.state === "startled") return
				agent.threat.copy(reaction.point)
				agent.targetFishId = reaction.sourceFishId ?? -1
				agent.setState("avoiding", ctx.time, randomRange(this.random, 0.8, 1.8))
				if (reaction.sourceFishId !== undefined) agent.targetFishId = reaction.sourceFishId
				return
			}
			case "curious": {
				if (agent.state === "startled" || agent.state === "feeding") return
				// Re-evaluate on the next decision; the tap will now attract this fish.
				agent.nextDecisionAt = ctx.time
				agent.stateTime = Math.max(agent.stateTime, agent.stateDuration * 0.8)
				return
			}
		}
	}

	/** Schoolmates pick up on a startled fish a moment later — a ripple through the school. */
	private propagateAlarm(source: FishAgent, reaction: PendingReaction, ctx: BehaviorContext): void {
		if (source.species.behavior.schooling < 0.3) return
		const found = this.spatial.query(source.position, 0.2, this.queryBuffer)
		for (const other of found) {
			if (other.id === source.id || other.species.id !== source.species.id) continue
			if (other.handledStimuli.has(reaction.stimulusId)) continue
			other.handledStimuli.add(reaction.stimulusId)
			const distance = other.position.distanceTo(source.position)
			other.pendingReactions.push({
				at: ctx.time + 0.08 + distance * 1.5 + other.personality.reactionTime * 0.3,
				kind: "startle",
				point: reaction.point.clone(),
				stimulusId: reaction.stimulusId,
				strength: reaction.strength * 0.7,
			})
		}
	}

	/**
	 * Each fish judges a tap on the glass by its own temperament: shy fish
	 * bolt, curious ones flinch and then come to look, territorial ones
	 * investigate, and those far away barely notice.
	 */
	reactToTap(point: Vector3Like, strength: number, stimulusId: number, time: number): void {
		const tapPoint = scratch.set(point.x, point.y, point.z)
		const radius = GLASS_INTERACTION.tapRadius * (0.6 + 0.4 * strength)
		for (const agent of this.agents) {
			const distance = agent.position.distanceTo(tapPoint)
			if (distance > radius) continue
			if (agent.handledStimuli.has(stimulusId)) continue
			agent.handledStimuli.add(stimulusId)
			const p = agent.personality
			const proximity = 1 - distance / radius
			const resting = agent.state === "resting" ? 0.25 : 0
			const jitter = () => randomRange(this.random, -0.15, 0.15)
			const fearScore =
				p.shyness * proximity * 1.4 +
				proximity * 0.3 +
				resting -
				p.curiosity * 0.3 +
				p.schoolingStrength * 0.15 +
				jitter()
			const curiousScore =
				p.curiosity * (0.4 + proximity * 0.6) - p.shyness * 0.4 + p.territoriality * 0.5 + jitter()
			const delay = p.reactionTime * 0.3 + distance * 0.6
			if (fearScore > 0.35 && fearScore >= curiousScore) {
				agent.pendingReactions.push({
					at: time + delay,
					kind: "startle",
					point: tapPoint.clone(),
					stimulusId,
					strength,
				})
			} else if (curiousScore > 0.3) {
				agent.pendingReactions.push({
					at: time + delay,
					kind: "flinch",
					point: tapPoint.clone(),
					stimulusId,
					strength: strength * 0.5,
				})
				// Curious fish first hold back, then come to investigate.
				agent.pendingReactions.push({
					at: time + delay + p.reactionTime + randomRange(this.random, 0.6, 2.2),
					kind: "curious",
					point: tapPoint.clone(),
					stimulusId,
					strength,
				})
			} else {
				agent.pendingReactions.push({
					at: time + delay,
					kind: "flinch",
					point: tapPoint.clone(),
					stimulusId,
					strength,
				})
			}
		}
	}

	/**
	 * Keeps the body inside the glass, above the substrate and below the
	 * surface. Only the position is held: the fish slides along the glass
	 * and steering turns it away, so the heading never snaps.
	 */
	private applyConstraints(agent: FishAgent, ctx: BehaviorContext): void {
		const b = ctx.bounds
		const r = Math.min(agent.radius, agent.wallMargin)
		const pos = agent.position
		pos.x = clamp(pos.x, b.minX + r, b.maxX - r)
		pos.z = clamp(pos.z, b.minZ + r, b.maxZ - r)
		const floor = ctx.floorAt(pos.x, pos.z) + r * 0.6
		pos.y = clamp(pos.y, floor, ctx.surfaceY - r * 0.8)
		this.pushOutOfObstacles(agent, ctx.scape, r)
	}

	private pushOutOfObstacles(
		agent: FishAgent,
		scape: ScapeLayout,
		radius: number = agent.radius,
	): void {
		for (const obstacle of scape.obstacles) {
			if (obstacle.soft) continue
			const distance = obstacleDistance(obstacle, agent.position, normal)
			const penetration = radius * 0.8 - distance
			if (penetration > 0) agent.position.addScaledVector(normal, penetration)
		}
	}

	countBySpecies(): Map<string, number> {
		const counts = new Map<string, number>()
		for (const agent of this.agents)
			counts.set(agent.species.id, (counts.get(agent.species.id) ?? 0) + 1)
		return counts
	}
}
