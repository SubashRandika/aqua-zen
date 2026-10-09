import { Vector3 } from "three"
import { clamp, lerp, smoothstep } from "../core/math"
import { randomRange } from "../core/random"
import { obstacleDistance } from "../environment/scapeLayout"
import type { FishAgent } from "../fish/FishAgent"
import { GLASS_INTERACTION } from "../interaction/GlassStimuli"
import {
	alignment,
	arriveSpeedFactor,
	avoidSurface,
	cohesion,
	containment,
	flee,
	seek,
	separation,
	wander,
	type Bounds,
} from "../steering/steering"
import { agentActivity } from "./activity"
import type { BehaviorContext, Perception } from "./context"
import { bestFood } from "./decision"
import { steerForaging } from "./forage"

/** Per-state tuning of the shared steering layers. */
interface SteeringWeights {
	wander: number
	wanderAmount: number
	depth: number
	flock: number
	softObstacles: number
	urgency: number
	speed: number
}

const tmp = new Vector3()
const tmp2 = new Vector3()
const normal = new Vector3()
const lookAhead = new Vector3()
const up = new Vector3(0, 1, 0)
const headings: Vector3[] = []
const positions: Vector3[] = []
const separationNeighbors: Array<{ position: Vector3; radius: number }> = []
const fishBounds: Bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 }

/** Mouth reach for eating, in metres. */
export function biteReach(agent: FishAgent): number {
	return agent.bodyLength * 0.45 + 0.008
}

function endState(agent: FishAgent, ctx: BehaviorContext): void {
	agent.setState("wandering", ctx.time, randomRange(ctx.random, 3, 8))
	agent.nextDecisionAt = ctx.time + randomRange(ctx.random, 0.4, 1.2)
}

/**
 * Builds the steering desire for one fish this step: the behaviour of its
 * current state layered with wandering, depth keeping, schooling,
 * separation, obstacle avoidance and containment. Sets `agent.targetSpeed`
 * and returns the turn urgency.
 */
export function steerAgent(
	agent: FishAgent,
	ctx: BehaviorContext,
	perception: Perception,
	desire: Vector3,
): number {
	desire.set(0, 0, 0)
	const species = agent.species
	const movement = species.movement
	const p = agent.personality
	const activity = agentActivity(agent, ctx.daylight)
	const isBottomDweller = movement.swimStyle === "bottomHop"
	// Fish picking over the substrate are allowed right down to it, nose first.
	const pecking = agent.state === "foraging" && species.feeding.forage?.style === "peck"

	// Smooth per-fish noise channels — the source of unpredictability.
	const noiseTime = ctx.time * (0.1 + 0.12 * p.wanderlust)
	const noiseYaw = ctx.noise(agent.seed, noiseTime, 0.5) * 1.5
	const noisePitch = ctx.noise(agent.seed + 50, noiseTime * 0.7, 3.5) * 1.5
	const noiseSpeed = ctx.noise(agent.seed + 100, noiseTime * 0.5, 7.5) * 1.5
	const noiseFlock = ctx.noise(agent.seed + 200, ctx.time * 0.05, 11.5) * 1.5

	const w: SteeringWeights = {
		wander: 0.85,
		wanderAmount: 0.55 + 0.5 * p.wanderlust,
		depth: 0.7,
		flock: species.behavior.schooling > 0 ? 0.3 * p.schoolingStrength : 0,
		softObstacles: 0.5,
		urgency: 0.3,
		speed: p.preferredSpeed * activity * clamp(0.8 + 0.3 * noiseSpeed, 0.45, 1.2),
	}

	switch (agent.state) {
		case "wandering": {
			if (agent.territory) {
				const away = agent.position.distanceTo(agent.territory)
				const pull = smoothstep(agent.territoryRadius * 0.7, agent.territoryRadius * 1.6, away)
				desire.addScaledVector(seek(agent.position, agent.territory, tmp), pull * 0.9)
			}
			break
		}
		case "cruising": {
			const distance = agent.position.distanceTo(agent.target)
			desire.addScaledVector(seek(agent.position, agent.target, tmp), 1.1)
			w.wander = 0.55
			w.wanderAmount *= 0.6
			w.speed = p.preferredSpeed * 1.25 * Math.max(activity, 0.5)
			if (agent.target.y > ctx.surfaceY - 0.03) {
				// Corydoras air gulp: purposeful vertical dash.
				w.depth = 0
				w.speed = movement.maxSpeed * 0.8
			}
			if (distance < 0.05) agent.stateTime = agent.stateDuration
			break
		}
		case "schooling": {
			w.flock = 1.35 * p.schoolingStrength * lerp(0.7, 1.3, p.sociability)
			w.wander = 0.5
			w.wanderAmount *= 0.7
			if (perception.schoolmates.length === 0 && perception.schoolCenter) {
				desire.addScaledVector(seek(agent.position, perception.schoolCenter, tmp), 1.2)
				w.speed = p.preferredSpeed * 1.4 * Math.max(activity, 0.6)
			} else if (perception.schoolmates.length > 0) {
				let avgSpeed = 0
				for (const mate of perception.schoolmates) avgSpeed += mate.speed
				avgSpeed /= perception.schoolmates.length
				w.speed = lerp(w.speed, Math.max(avgSpeed, movement.minSpeed), 0.55)
			}
			break
		}
		case "resting": {
			const distance = agent.position.distanceTo(agent.target)
			w.depth = 0
			w.flock *= 0.3
			w.softObstacles = 0
			if (!agent.arrived) {
				desire.addScaledVector(seek(agent.position, agent.target, tmp), 1.5)
				w.speed = movement.cruiseSpeed * 0.6 * arriveSpeedFactor(distance, 0.08, 0.08)
				w.wanderAmount *= 0.4
				if (distance < 0.03) agent.arrived = true
			} else {
				// Hold position with slow fin sculling; drift a little with the current.
				desire.addScaledVector(
					seek(agent.position, agent.target, tmp),
					clamp(distance / 0.05, 0, 1) * 0.6,
				)
				w.wander = 0.25
				w.wanderAmount = 0.15
				w.speed = isBottomDweller ? 0 : movement.minSpeed * 0.35 + distance * 0.2
				if (isBottomDweller) desire.y -= 0.15
			}
			break
		}
		case "curious": {
			if (agent.focusStimulusId >= 0) {
				const stimulus = ctx.stimuli.stimuli.find((s) => s.id === agent.focusStimulusId && s.active)
				if (!stimulus) {
					endState(agent, ctx)
					break
				}
				agent.focusPoint.copy(stimulus.position)
				agent.target.copy(stimulus.position)
				agent.target.z -= GLASS_INTERACTION.standoffDistance + agent.bodyLength * 0.6
			}
			const distance = agent.position.distanceTo(agent.target)
			w.depth = 0.15
			w.flock *= 0.4
			if (distance > 0.025) {
				desire.addScaledVector(seek(agent.position, agent.target, tmp), 1.4)
				// Shy-but-curious fish approach hesitantly.
				w.speed =
					movement.cruiseSpeed * lerp(0.9, 0.5, p.shyness) * arriveSpeedFactor(distance, 0.1, 0.1)
				w.wanderAmount *= 0.5
			} else {
				agent.arrived = true
				// Face whatever caught its attention.
				desire.addScaledVector(seek(agent.position, agent.focusPoint, tmp), 0.9)
				w.wander = 0.2
				w.wanderAmount = 0.2
				w.speed = movement.minSpeed * 0.5
			}
			break
		}
		case "hiding": {
			const distance = agent.position.distanceTo(agent.target)
			w.softObstacles = 0
			w.depth = 0
			if (distance > 0.03) {
				desire.addScaledVector(seek(agent.position, agent.target, tmp), 1.6)
				w.speed = movement.cruiseSpeed * 1.2 * arriveSpeedFactor(distance, 0.06, 0.15)
				w.urgency = 0.6
			} else {
				agent.arrived = true
				w.wander = 0.25
				w.wanderAmount = 0.2
				w.speed = movement.minSpeed * 0.4
			}
			break
		}
		case "seekingFood": {
			let food = ctx.food.get(agent.targetFoodId)
			if (!food || food.amount <= 0) {
				const next = agent.hunger > 0.15 ? bestFood(agent, ctx, perception) : null
				if (!next) {
					endState(agent, ctx)
					break
				}
				food = next.food
				agent.targetFoodId = food.id
			}
			food.claims++
			const distance = agent.position.distanceTo(food.position)
			// Approach from a personal angle so fish converge from different directions.
			tmp2.subVectors(food.position, agent.position)
			tmp.crossVectors(tmp2, up)
			if (tmp.lengthSq() > 1e-10) tmp.normalize()
			tmp2
				.copy(food.position)
				.addScaledVector(tmp, agent.approachSide * Math.min(distance * 0.35, 0.05))
			desire.addScaledVector(seek(agent.position, tmp2, tmp), 2.2)
			w.speed =
				lerp(movement.cruiseSpeed, movement.maxSpeed, clamp(agent.hunger, 0, 1)) *
				lerp(0.8, 1.15, p.energy) *
				arriveSpeedFactor(distance, 0.08 + agent.bodyLength, 0.25)
			w.depth = 0
			w.wander = 0.25
			w.wanderAmount = 0.3
			w.flock *= 0.3
			w.softObstacles = 0.2
			w.urgency = 0.8
			if (distance < biteReach(agent) * 1.6) agent.setState("feeding", ctx.time, 6)
			break
		}
		case "feeding": {
			const food = ctx.food.get(agent.targetFoodId)
			if (!food || food.amount <= 0 || agent.hunger < 0.12) {
				if (agent.hunger >= 0.12 && bestFood(agent, ctx, perception)) {
					agent.setState("seekingFood", ctx.time, 12)
				} else {
					endState(agent, ctx)
				}
				break
			}
			food.claims++
			const distance = agent.position.distanceTo(food.position)
			desire.addScaledVector(seek(agent.position, food.position, tmp), 2.5)
			w.speed = Math.max(movement.minSpeed, Math.min(distance * 1.6, movement.cruiseSpeed))
			w.depth = 0
			w.wander = 0.15
			w.wanderAmount = 0.2
			w.flock = 0
			w.softObstacles = 0.1
			w.urgency = 1
			const reach = biteReach(agent)
			const biteInterval = 1 / species.feeding.feedingSpeed
			if (
				distance < reach &&
				ctx.time - agent.lastBiteAt > biteInterval * randomRange(ctx.random, 0.7, 1.5)
			) {
				const eaten = ctx.food.consume(food.id)
				agent.lastBiteAt = ctx.time
				agent.hunger = Math.max(0, agent.hunger - eaten * 0.3)
				agent.snap(ctx.random)
				if (food.amount <= 0)
					ctx.events.emit({ type: "food:consumed", foodId: food.id, fishId: agent.id })
			} else if (distance > reach * 3.5) {
				agent.setState("seekingFood", ctx.time, 12)
			}
			break
		}
		case "startled": {
			flee(agent.position, agent.threat, 0.8, tmp)
			if (tmp.lengthSq() < 1e-8) tmp.copy(agent.heading)
			tmp.normalize()
			// Escape away from the glass and slightly downwards, towards cover.
			tmp.z -= 0.45
			tmp.y -= 0.15
			desire.addScaledVector(tmp.normalize(), 3)
			const progress = clamp(agent.stateTime / Math.max(agent.stateDuration, 0.1), 0, 1)
			w.speed = lerp(movement.maxSpeed, movement.cruiseSpeed, progress)
			w.depth = 0.2
			w.wander = 0.15
			w.flock = 1.2 * p.schoolingStrength
			w.softObstacles = 0.1
			w.urgency = 1.4
			break
		}
		case "avoiding": {
			const aggressor = ctx.agents.get(agent.targetFishId)
			if (aggressor) agent.threat.copy(aggressor.position)
			desire.addScaledVector(flee(agent.position, agent.threat, 0.3, tmp), 2.2)
			w.speed = movement.maxSpeed * 0.8
			w.depth = 0.3
			w.urgency = 1
			break
		}
		case "foraging": {
			w.speed = steerForaging(agent, ctx, desire)
			w.depth = 0
			w.flock *= 0.3
			w.softObstacles = 0
			w.wander = agent.cling ? 0 : 0.3
			w.wanderAmount *= 0.5
			if (agent.cling) {
				// Holding on: nothing else steers a grazer off its surface.
				agent.targetSpeed = clamp(w.speed, 0, movement.cruiseSpeed)
				return 0.2
			}
			break
		}
		case "territorial": {
			const intruder = ctx.agents.get(agent.targetFishId)
			if (!intruder) {
				endState(agent, ctx)
				break
			}
			const distance = agent.position.distanceTo(intruder.position)
			desire.addScaledVector(seek(agent.position, intruder.position, tmp), 2)
			w.speed = movement.maxSpeed * 0.85
			w.depth = 0.2
			w.flock = 0
			w.urgency = 0.9
			if (distance < agent.radius + intruder.radius + 0.012) endState(agent, ctx)
			break
		}
	}

	// Wandering — smooth stochastic deflection of the current heading.
	desire.addScaledVector(wander(agent.heading, noiseYaw, noisePitch, w.wanderAmount, tmp), w.wander)

	// Depth keeping, relative to the local water column.
	const floor = ctx.floorAt(agent.position.x, agent.position.z)
	if (w.depth > 0) {
		const column = ctx.surfaceY - floor
		const targetY = isBottomDweller
			? floor + agent.radius * 0.9
			: lerp(floor + agent.radius * 2, ctx.surfaceY - agent.radius * 2, p.preferredDepth)
		const band = isBottomDweller ? 0.006 : column * 0.1
		const dy = targetY - agent.position.y
		if (Math.abs(dy) > band) {
			const strength = clamp((Math.abs(dy) - band) / 0.08, 0, 1) * (isBottomDweller ? 1.6 : 1)
			desire.y += Math.sign(dy) * strength * w.depth
		}
	}

	// Bottom dwellers level out along the substrate instead of nosing into it.
	if (
		isBottomDweller &&
		!pecking &&
		agent.heading.y < -0.1 &&
		agent.position.y - floor < agent.radius * 1.5
	) {
		desire.y += -agent.heading.y * 1.2
	}

	// Separation from everyone, schooling with schoolmates.
	separationNeighbors.length = 0
	for (const neighbor of perception.neighbors) separationNeighbors.push(neighbor)
	desire.addScaledVector(
		separation(
			agent.position,
			separationNeighbors,
			species.schooling.separationDistance + agent.radius,
			tmp,
		),
		1.6,
	)
	if (w.flock > 0 && perception.schoolmates.length > 0) {
		// Individual, slowly varying commitment keeps the school from moving in lockstep.
		const commitment = clamp(0.75 + 0.35 * noiseFlock, 0.3, 1.2) * w.flock
		headings.length = 0
		positions.length = 0
		for (const mate of perception.schoolmates) {
			headings.push(mate.heading)
			positions.push(mate.position)
		}
		desire.addScaledVector(
			alignment(agent.heading, headings, tmp),
			species.schooling.alignment * commitment,
		)
		desire.addScaledVector(
			cohesion(agent.position, positions, species.schooling.separationDistance * 2.5, tmp),
			species.schooling.cohesion * commitment * 1.4,
		)
	}

	// Keep clear of much larger fish heading this way.
	for (const other of perception.neighbors) {
		if (other.bodyLength < agent.bodyLength * 1.8) continue
		const distance = agent.position.distanceTo(other.position)
		const range = other.bodyLength * 0.9 + agent.bodyLength * 2
		if (distance > range) continue
		tmp.subVectors(agent.position, other.position)
		if (other.heading.dot(tmp) <= 0) continue
		desire.addScaledVector(flee(agent.position, other.position, range, tmp), 0.5 + p.shyness)
	}

	// Shy fish keep their distance from a finger resting on the glass.
	const touch = ctx.stimuli.current("touch")
	if (touch && agent.state !== "curious") {
		const keepAway = 0.12 + 0.12 * p.shyness
		desire.addScaledVector(flee(agent.position, touch.position, keepAway, tmp), p.shyness * 1.5)
	}

	// Obstacles: slide around stone and wood; brush through plants.
	lookAhead
		.copy(agent.position)
		.addScaledVector(agent.heading, agent.speed * 0.5 + agent.bodyLength * 0.5)
	const approaching = agent.state === "foraging" ? agent.forageSurface : null
	for (let i = 0; i < ctx.scape.obstacles.length; i++) {
		const obstacle = ctx.scape.obstacles[i]!
		if (obstacle.soft && w.softObstacles <= 0) continue
		// A grazer heading for a stone or branch shouldn't shy away from it.
		if (approaching?.kind === "obstacle" && approaching.obstacle === i) continue
		const distance = obstacleDistance(obstacle, lookAhead, normal)
		const range = obstacle.soft ? 0.03 : agent.bodyLength * 1.2 + 0.03
		if (distance > range) continue
		desire.addScaledVector(
			avoidSurface(agent.heading, distance - agent.radius, normal, range, tmp),
			obstacle.soft ? w.softObstacles : 2.6,
		)
	}

	// Containment within the glass, water surface and substrate.
	const margin = 0.05 + agent.bodyLength * 0.8
	fishBounds.minX = ctx.bounds.minX + agent.radius
	fishBounds.maxX = ctx.bounds.maxX - agent.radius
	fishBounds.minZ = ctx.bounds.minZ + agent.radius
	fishBounds.maxZ = ctx.bounds.maxZ - agent.radius
	fishBounds.minY = isBottomDweller || pecking ? floor - margin * 2 : floor + agent.radius
	fishBounds.maxY = ctx.surfaceY - agent.radius
	containment(
		agent.position,
		agent.heading,
		agent.speed * 1.2 + agent.bodyLength,
		fishBounds,
		margin,
		tmp,
	)
	// A grazer heading for the glass lets it come close.
	const toGlass = approaching?.kind === "glass" ? agent.position.distanceTo(agent.target) : Infinity
	desire.addScaledVector(tmp, 2.8 * clamp(toGlass / 0.15, 0, 1))

	agent.targetSpeed = clamp(w.speed, 0, movement.burstSpeed)
	return w.urgency + clamp(tmp.length(), 0, 1)
}
