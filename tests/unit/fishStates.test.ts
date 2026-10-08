import { Vector3 } from "three"
import { getSpecies } from "@/config/species"
import { TANK_INTERIOR } from "@/config/tank"
import type { BehaviorContext, Perception } from "@/simulation/behaviors/context"
import { chooseState, evaluateUtilities, shouldDecide } from "@/simulation/behaviors/decision"
import { EventBus } from "@/simulation/core/events"
import { createNoise3D } from "@/simulation/core/noise"
import { createRandom } from "@/simulation/core/random"
import { createScapeLayout } from "@/simulation/environment/scapeLayout"
import { substrateHeight } from "@/simulation/environment/substrate"
import { FoodManager } from "@/simulation/feeding/FoodManager"
import { FishAgent } from "@/simulation/fish/FishAgent"
import { generatePersonality } from "@/simulation/fish/personality"
import { GlassStimuli } from "@/simulation/interaction/GlassStimuli"

function context(overrides: Partial<BehaviorContext> = {}): BehaviorContext {
	const random = createRandom(1)
	return {
		time: 10,
		dt: 1 / 60,
		random,
		noise: createNoise3D(1),
		daylight: 1,
		bounds: {
			minX: TANK_INTERIOR.minX,
			maxX: TANK_INTERIOR.maxX,
			minY: TANK_INTERIOR.floorY,
			maxY: TANK_INTERIOR.surfaceY,
			minZ: TANK_INTERIOR.minZ,
			maxZ: TANK_INTERIOR.maxZ,
		},
		scape: createScapeLayout(1),
		food: new FoodManager(random),
		stimuli: new GlassStimuli(),
		agents: new Map(),
		floorAt: substrateHeight,
		surfaceY: TANK_INTERIOR.surfaceY,
		events: new EventBus(),
		...overrides,
	}
}

const noPerception: Perception = {
	neighbors: [],
	schoolmates: [],
	schoolCenter: null,
	schoolHeading: null,
	feedingNeighbors: 0,
}

function fish(speciesId: string, seed = 1): FishAgent {
	const species = getSpecies(speciesId)
	const random = createRandom(seed)
	const agent = new FishAgent(seed, species, generatePersonality(species, random), random)
	agent.position.set(0, 0.3, 0)
	return agent
}

const score = (utilities: ReturnType<typeof evaluateUtilities>, state: string) =>
	utilities.find((u) => u.state === state)?.score ?? 0

describe("fish state transitions", () => {
	it("prefers resting at night for diurnal fish, but not for nocturnal corydoras", () => {
		const neon = fish("neon-tetra")
		const cory = fish("panda-corydoras")
		const day = context({ daylight: 1 })
		const night = context({ daylight: 0 })
		expect(score(evaluateUtilities(neon, night, noPerception), "resting")).toBeGreaterThan(
			score(evaluateUtilities(neon, day, noPerception), "resting") + 0.5,
		)
		expect(score(evaluateUtilities(cory, night, noPerception), "resting")).toBeLessThan(
			score(evaluateUtilities(cory, day, noPerception), "resting"),
		)
	})

	it("only seeks food after noticing it, and more strongly when hungry", () => {
		const ctx = context()
		ctx.food.release(0, 0, 0)
		const agent = fish("zebra-danio")
		agent.position.set(0, 0.45, 0)
		agent.hunger = 0.9
		expect(score(evaluateUtilities(agent, ctx, noPerception), "seekingFood")).toBe(0)
		agent.foodNoticedAt = ctx.time - 1
		const hungry = score(evaluateUtilities(agent, ctx, noPerception), "seekingFood")
		agent.hunger = 0.1
		const sated = score(evaluateUtilities(agent, ctx, noPerception), "seekingFood")
		expect(hungry).toBeGreaterThan(sated)
		expect(hungry).toBeGreaterThan(0.5)
	})

	it("ignores food in water layers the species doesn't feed in", () => {
		const ctx = context()
		ctx.food.release(0, 0, 0)
		const cory = fish("panda-corydoras")
		cory.position.set(0, 0.45, 0)
		cory.hunger = 1
		cory.foodNoticedAt = 0
		expect(score(evaluateUtilities(cory, ctx, noPerception), "seekingFood")).toBe(0)
	})

	it("becomes curious about a finger on the glass in proportion to its curiosity", () => {
		const ctx = context()
		const curious = fish("dwarf-gourami", 3)
		const shy = fish("neon-tetra", 4)
		for (const agent of [curious, shy]) agent.position.set(0, 0.3, TANK_INTERIOR.maxZ - 0.1)
		ctx.stimuli.startTouch(new Vector3(0, 0.3, TANK_INTERIOR.maxZ), ctx.time)
		const curiousScore = score(evaluateUtilities(curious, ctx, noPerception), "curious")
		const shyScore = score(evaluateUtilities(shy, ctx, noPerception), "curious")
		expect(curiousScore).toBeGreaterThan(shyScore)
	})

	it("hides when frightened, especially if shy", () => {
		const agent = fish("neon-tetra")
		agent.fear = 0.9
		const utilities = evaluateUtilities(agent, context(), noPerception)
		expect(score(utilities, "hiding")).toBeGreaterThan(score(utilities, "wandering"))
	})

	it("favours its current state, but does not always pick the top option", () => {
		const agent = fish("guppy")
		agent.state = "cruising"
		agent.stateTime = 1
		agent.stateDuration = 10
		const choices = new Set<string>()
		const ctx = context()
		for (let i = 0; i < 200; i++) {
			choices.add(
				chooseState(
					agent,
					[
						{ state: "wandering", score: 0.5 },
						{ state: "cruising", score: 0.45 },
						{ state: "curious", score: 0.42 },
					],
					ctx,
				),
			)
		}
		expect(choices.has("cruising")).toBe(true)
		expect(choices.size).toBeGreaterThan(1)
	})

	it("doesn't interrupt a startled escape with routine decisions", () => {
		const agent = fish("neon-tetra")
		const ctx = context()
		agent.setState("startled", ctx.time, 1.5)
		agent.nextDecisionAt = 0
		expect(shouldDecide(agent, ctx)).toBe(false)
		agent.stateTime = 2
		expect(shouldDecide(agent, ctx)).toBe(true)
	})

	it("turns at a limited rate and never exceeds its pitch limit", () => {
		const agent = fish("angelfish")
		agent.heading.set(1, 0, 0)
		agent.speed = agent.species.movement.cruiseSpeed
		agent.targetSpeed = agent.speed
		const random = createRandom(2)
		agent.integrate(new Vector3(-1, 0, 0), 0.3, 1 / 60, random)
		expect(agent.heading.angleTo(new Vector3(1, 0, 0))).toBeLessThan(
			agent.species.movement.turnRate / 60 + 1e-6,
		)
		for (let i = 0; i < 300; i++) agent.integrate(new Vector3(0, 1, 0), 1, 1 / 60, random)
		expect(Math.asin(agent.heading.y)).toBeLessThanOrEqual(agent.species.movement.maxPitch + 1e-6)
	})
})
