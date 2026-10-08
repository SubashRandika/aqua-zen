import type { Vector3 } from "three"
import { clamp, lerp } from "../core/math"
import { pick, randomRange, weightedIndex } from "../core/random"
import type { RestSpotKind } from "../environment/scapeLayout"
import type { FoodParticle } from "../feeding/FoodManager"
import type { FishAgent } from "../fish/FishAgent"
import type { FishState } from "../fish/types"
import { GLASS_INTERACTION } from "../interaction/GlassStimuli"
import { agentActivity } from "./activity"
import type { BehaviorContext, Perception } from "./context"

/** States a fish can choose freely. Others (startled, avoiding, feeding) are entered by events. */
export const VOLUNTARY_STATES = [
	"wandering",
	"cruising",
	"schooling",
	"resting",
	"curious",
	"hiding",
	"seekingFood",
	"territorial",
] as const satisfies readonly FishState[]

export type VoluntaryState = (typeof VOLUNTARY_STATES)[number]

/** States that should not be interrupted by routine decisions. */
const COMMITTED_STATES: ReadonlySet<FishState> = new Set([
	"startled",
	"avoiding",
	"feeding",
	"territorial",
])

export interface Utility {
	state: VoluntaryState
	score: number
}

/** Finds the most appealing food particle for this fish, taking competition into account. */
export function bestFood(
	agent: FishAgent,
	ctx: BehaviorContext,
	perception: Perception,
): { food: FoodParticle; score: number } | null {
	const zones = agent.species.feeding.zones
	// Seeing other fish feed widens attention — feeding spreads through the tank.
	const socialBoost = perception.feedingNeighbors > 0 ? 1.5 : 1
	const radius =
		agent.species.feeding.attractionRadius *
		lerp(0.7, 1.25, agent.personality.curiosity) *
		socialBoost
	let best: FoodParticle | null = null
	let bestScore = 0
	for (const food of ctx.food.particles) {
		if (food.amount <= 0) continue
		const distance = agent.position.distanceTo(food.position)
		if (distance > radius) continue
		const zonePreference = zones[ctx.food.zoneOf(food)]
		if (zonePreference <= 0.01) continue
		const score = (zonePreference * (1 - distance / radius)) / (1 + food.claims * 0.7)
		if (score > bestScore) {
			bestScore = score
			best = food
		}
	}
	return best ? { food: best, score: bestScore } : null
}

/** Scores each voluntary state for this fish right now. */
export function evaluateUtilities(
	agent: FishAgent,
	ctx: BehaviorContext,
	perception: Perception,
): Utility[] {
	const p = agent.personality
	const species = agent.species
	const activity = agentActivity(agent, ctx.daylight)
	const restfulness = clamp(1 - activity, 0, 1)
	const utilities: Utility[] = []

	utilities.push({ state: "wandering", score: 0.3 + 0.15 * p.wanderlust })
	utilities.push({
		state: "cruising",
		score: 0.5 * lerp(0.4, 1, p.energy) * activity * agent.stamina * (0.5 + p.wanderlust),
	})

	if (species.behavior.schooling > 0.05) {
		const hasSchool = perception.schoolmates.length > 0 || perception.schoolCenter !== null
		if (hasSchool) {
			const nearby = perception.schoolmates.length > 0 ? 1 : 0.65
			utilities.push({
				state: "schooling",
				score:
					p.schoolingStrength *
					lerp(0.6, 1.1, p.sociability) *
					nearby *
					(0.85 + agent.fear * 0.8) *
					lerp(0.6, 1, activity),
			})
		}
	}

	// Even by day, calmer fish pause now and then.
	const daytimePause =
		0.14 * (1 - p.energy) * (agent.species.movement.swimStyle === "bottomHop" ? 2 : 1)
	utilities.push({
		state: "resting",
		score: restfulness * 1.25 + (1 - agent.stamina) * 0.7 + daytimePause,
	})

	let curiousScore = p.curiosity * 0.4 * Math.min(activity, 1)
	const stimulus = ctx.stimuli.strongestNear(agent.position, ctx.time)
	if (stimulus) curiousScore += stimulus.pull * (p.curiosity * 1.8 - p.shyness * 0.9)
	utilities.push({ state: "curious", score: Math.max(0, curiousScore) })

	utilities.push({ state: "hiding", score: agent.fear * (0.4 + p.shyness * 1.4) })

	if (ctx.time >= agent.foodNoticedAt) {
		const food = bestFood(agent, ctx, perception)
		if (food) {
			const appetite = Math.pow(clamp(agent.hunger, 0, 1), 0.7)
			const boldness = 1 - p.shyness * 0.35
			const feedingActivity = lerp(0.45, 1, clamp(activity, 0, 1))
			utilities.push({
				state: "seekingFood",
				score: appetite * lerp(0.6, 1.2, p.energy) * boldness * feedingActivity * food.score * 2.6,
			})
		}
	}

	if (
		agent.territory &&
		ctx.time >= agent.territorialCooldownUntil &&
		findIntruder(agent, perception)
	) {
		utilities.push({
			state: "territorial",
			score: p.territoriality * (0.4 + p.aggressiveness) * 1.6,
		})
	}

	return utilities
}

/** Another fish inside this fish's territory, if any. */
export function findIntruder(agent: FishAgent, perception: Perception): FishAgent | null {
	if (!agent.territory) return null
	for (const other of perception.neighbors) {
		if (other.species.id === agent.species.id && agent.species.id !== "betta") continue
		if (other.bodyLength > agent.bodyLength * 1.4) continue
		if (other.position.distanceTo(agent.territory) < agent.territoryRadius) return other
	}
	return null
}

/**
 * Picks the next state. Rather than always taking the best option, fish
 * choose among the strongest few with probability weighted by appeal, and
 * favour what they're already doing — so behaviour is varied but not fickle.
 */
export function chooseState(
	agent: FishAgent,
	utilities: readonly Utility[],
	ctx: BehaviorContext,
): VoluntaryState {
	const minimumCommitment = Math.min(agent.stateDuration, 4)
	const adjusted = utilities.map((u) => {
		let score = u.score
		if (u.state === agent.state && agent.stateTime < agent.stateDuration) {
			score *= agent.stateTime < minimumCommitment ? 1.6 : 1.2
		}
		return { state: u.state, score }
	})
	const max = Math.max(...adjusted.map((u) => u.score))
	const candidates = adjusted.filter((u) => u.score >= max * 0.5)
	const index = weightedIndex(
		ctx.random,
		candidates.map((u) => u.score * u.score),
	)
	return (candidates[index] ?? candidates[0] ?? { state: "wandering" as const }).state
}

function restSpotKinds(agent: FishAgent): RestSpotKind[] {
	if (agent.species.movement.swimStyle === "bottomHop") return ["bottom"]
	if (agent.species.id === "betta") return ["leaf", "cover"]
	if (agent.personality.shyness > 0.55) return ["cover", "midwater"]
	return ["midwater", "cover", "leaf"]
}

function nearestOf(
	agent: FishAgent,
	points: readonly Vector3[],
	ctx: BehaviorContext,
): Vector3 | null {
	if (points.length === 0) return null
	// Choose randomly among the three nearest, so fish don't all pick the same spot.
	const sorted = [...points].sort(
		(a, b) => a.distanceToSquared(agent.position) - b.distanceToSquared(agent.position),
	)
	return pick(ctx.random, sorted.slice(0, 3))
}

/** Picks a point in open water within the fish's preferred depth band. */
export function randomPatrolPoint(agent: FishAgent, ctx: BehaviorContext, out: Vector3): Vector3 {
	const b = ctx.bounds
	for (let attempt = 0; attempt < 6; attempt++) {
		const x = randomRange(ctx.random, b.minX + 0.08, b.maxX - 0.08)
		const z = randomRange(ctx.random, b.minZ + 0.06, b.maxZ - 0.06)
		const floor = ctx.floorAt(x, z)
		const depth = clamp(
			agent.personality.preferredDepth + randomRange(ctx.random, -0.15, 0.15),
			0,
			1,
		)
		const y = lerp(floor + agent.radius * 2, ctx.surfaceY - agent.radius * 2, depth)
		out.set(x, y, z)
		// Prefer destinations that make for a real journey across the tank.
		if (out.distanceTo(agent.position) > 0.25) return out
	}
	return out
}

/** Enters the chosen state and sets up its target and duration. */
export function enterState(
	agent: FishAgent,
	state: VoluntaryState,
	ctx: BehaviorContext,
	perception: Perception,
): void {
	const r = ctx.random
	const p = agent.personality
	switch (state) {
		case "wandering":
			agent.setState(state, ctx.time, randomRange(r, 4, 12))
			return
		case "cruising": {
			randomPatrolPoint(agent, ctx, agent.target)
			// Corydoras occasionally dart to the surface for a gulp of air.
			if (agent.species.movement.swimStyle === "bottomHop" && r() < 0.12) {
				agent.target.y = ctx.surfaceY - 0.01
			}
			agent.setState(state, ctx.time, randomRange(r, 6, 15))
			return
		}
		case "schooling":
			agent.setState(state, ctx.time, randomRange(r, 6, 20) * lerp(0.7, 1.4, p.sociability))
			return
		case "resting": {
			const kinds = restSpotKinds(agent)
			const spots = ctx.scape.restSpots.filter((s) => kinds.includes(s.kind)).map((s) => s.position)
			const spot = nearestOf(agent, spots, ctx)
			if (spot) {
				agent.target.copy(spot)
				agent.target.x += randomRange(r, -0.04, 0.04)
				agent.target.z += randomRange(r, -0.03, 0.03)
			} else {
				agent.target.copy(agent.position)
			}
			const nightLength = lerp(1, 2.5, 1 - ctx.daylight)
			agent.setState(state, ctx.time, randomRange(r, 10, 30) * nightLength)
			return
		}
		case "curious": {
			const stimulus = ctx.stimuli.strongestNear(agent.position, ctx.time)
			if (stimulus) {
				agent.focusStimulusId = stimulus.stimulus.id
				agent.focusPoint.copy(stimulus.stimulus.position)
				agent.target.copy(stimulus.stimulus.position)
				agent.target.z -= GLASS_INTERACTION.standoffDistance + agent.bodyLength * 0.6
				agent.target.x += randomRange(r, -0.03, 0.03)
				agent.target.y += randomRange(r, -0.02, 0.02)
			} else {
				const point = pick(r, ctx.scape.interestPoints)
				agent.focusPoint.copy(point.position)
				agent.target
					.copy(point.position)
					.addScaledVector(point.normal, agent.bodyLength * 0.6 + 0.01)
			}
			const focus = agent.focusStimulusId
			agent.setState(state, ctx.time, randomRange(r, 3, 9))
			agent.focusStimulusId = focus
			return
		}
		case "hiding": {
			const spot = nearestOf(agent, ctx.scape.coverSpots, ctx)
			agent.target.copy(spot ?? agent.position)
			agent.setState(state, ctx.time, randomRange(r, 4, 12) * lerp(0.6, 1.6, p.shyness))
			return
		}
		case "seekingFood": {
			const food = bestFood(agent, ctx, perception)
			if (!food) {
				agent.setState("wandering", ctx.time, 3)
				return
			}
			agent.targetFoodId = food.food.id
			agent.setState(state, ctx.time, 12)
			return
		}
		case "territorial": {
			const intruder = findIntruder(agent, perception)
			if (!intruder) {
				agent.setState("wandering", ctx.time, 3)
				return
			}
			agent.targetFishId = intruder.id
			agent.territorialCooldownUntil =
				ctx.time + randomRange(r, 10, 30) * lerp(1.5, 0.6, p.aggressiveness)
			agent.setState(state, ctx.time, randomRange(r, 1, 2.2))
			// The intruder notices and moves away.
			intruder.pendingReactions.push({
				at: ctx.time + intruder.personality.reactionTime * 0.5,
				kind: "avoid",
				point: agent.position.clone(),
				stimulusId: -agent.id,
				strength: 0.6,
				sourceFishId: agent.id,
			})
			return
		}
	}
}

/** Whether the fish should make a fresh decision now. */
export function shouldDecide(agent: FishAgent, ctx: BehaviorContext): boolean {
	if (COMMITTED_STATES.has(agent.state) && agent.stateTime < agent.stateDuration) return false
	if (agent.stateTime >= agent.stateDuration) return true
	return ctx.time >= agent.nextDecisionAt
}

export function scheduleNextDecision(agent: FishAgent, ctx: BehaviorContext): void {
	// Far-away fish think less often; their behaviour is less noticeable.
	const distanceFactor = clamp(agent.cameraDistance / 1.4, 0.8, 2)
	agent.nextDecisionAt = ctx.time + randomRange(ctx.random, 0.7, 1.9) * distanceFactor
}

/** Runs one decision for the fish. Returns the state it chose (possibly the same). */
export function decide(agent: FishAgent, ctx: BehaviorContext, perception: Perception): FishState {
	const utilities = evaluateUtilities(agent, ctx, perception)
	const next = chooseState(agent, utilities, ctx)
	const continuing = next === agent.state && agent.stateTime < agent.stateDuration
	if (!continuing) enterState(agent, next, ctx, perception)
	scheduleNextDecision(agent, ctx)
	return agent.state
}
