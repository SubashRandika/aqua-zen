import { FRONT_GLASS_Z, TANK_INTERIOR } from "@/config/tank"
import { AquariumWorld } from "@/simulation/core/World"
import type { FishState } from "@/simulation/fish/types"

const DT = 1 / 30

function simulate(world: AquariumWorld, seconds: number, each?: (time: number) => void): void {
	for (let i = 0; i < Math.round(seconds / DT); i++) {
		world.update(DT)
		each?.(world.elapsed)
	}
}

function countStates(world: AquariumWorld, states: FishState[]): number {
	return world.fish.agents.filter((a) => states.includes(a.state)).length
}

function createWorld(options: ConstructorParameters<typeof AquariumWorld>[0] = {}): AquariumWorld {
	const world = new AquariumWorld({ seed: 1234, hour: 10, ...options })
	world.setCameraPosition({ x: 0, y: 0.27, z: 1.5 })
	return world
}

describe("aquarium simulation", () => {
	it("stays stable and inside the tank over several minutes", () => {
		const world = createWorld()
		let frame = 0
		simulate(world, 300, () => {
			if (frame++ % 15 !== 0) return
			for (const agent of world.fish.agents) {
				const p = agent.position
				expect(Number.isFinite(p.x + p.y + p.z + agent.speed)).toBe(true)
				expect(p.x).toBeGreaterThanOrEqual(TANK_INTERIOR.minX)
				expect(p.x).toBeLessThanOrEqual(TANK_INTERIOR.maxX)
				expect(p.z).toBeGreaterThanOrEqual(TANK_INTERIOR.minZ)
				expect(p.z).toBeLessThanOrEqual(TANK_INTERIOR.maxZ)
				expect(p.y).toBeLessThanOrEqual(TANK_INTERIOR.surfaceY)
			}
		})
	})

	it("produces varied, non-deterministic behaviour across fish of a species", () => {
		const world = createWorld()
		const neons = world.fish.agents.filter((a) => a.species.id === "neon-tetra")
		const states = new Set<FishState>()
		simulate(world, 120, () => neons.forEach((n) => states.add(n.state)))
		expect(states.size).toBeGreaterThanOrEqual(3)
		const speeds = neons.map((n) => n.personality.preferredSpeed)
		expect(Math.max(...speeds) - Math.min(...speeds)).toBeGreaterThan(0.005)
	})

	it("keeps schooling fish loosely together", () => {
		const world = createWorld()
		simulate(world, 90)
		const neons = world.fish.agents.filter((a) => a.species.id === "neon-tetra")
		const near = neons.filter((n) =>
			neons.some((m) => m !== n && m.position.distanceTo(n.position) < 0.15),
		)
		expect(near.length / neons.length).toBeGreaterThan(0.6)
	})
})

describe("feeding interaction", () => {
	it("draws fish to food gradually, has them eat it, then return to normal", () => {
		const world = createWorld()
		simulate(world, 20)
		for (const agent of world.fish.agents) agent.hunger = 0.8
		const consumed: number[] = []
		world.events.on("food:consumed", (event) => consumed.push(event.fishId))
		const released: number[] = []
		world.events.on("food:released", (event) => released.push(event.count))

		expect(world.feed({ x: 0, y: TANK_INTERIOR.surfaceY, z: 0.05 })).toBeGreaterThan(0)
		expect(released).toHaveLength(1)
		// Cooldown: a second feed straight away does nothing.
		expect(world.feed({ x: 0, y: TANK_INTERIOR.surfaceY, z: 0.05 })).toBe(0)

		const seekersOverTime: number[] = []
		simulate(world, 30, (t) => {
			if (Math.abs((t % 1) - 0) < DT)
				seekersOverTime.push(countStates(world, ["seekingFood", "feeding"]))
		})
		// The response builds over time rather than every fish rushing at once.
		expect(seekersOverTime[0]!).toBeLessThan(Math.max(...seekersOverTime))
		expect(Math.max(...seekersOverTime)).toBeLessThan(world.fish.agents.length)
		expect(consumed.length).toBeGreaterThan(0)
		expect(new Set(consumed).size).toBeGreaterThan(1)

		simulate(world, 150)
		expect(world.food.particles.length).toBe(0)
		expect(countStates(world, ["seekingFood", "feeding"])).toBe(0)
	})
})

describe("glass interaction", () => {
	it("startles nearby fish, spreads through a school, and later draws curious fish closer", () => {
		const world = createWorld()
		simulate(world, 30)
		const tap = { x: 0, y: 0.28, z: FRONT_GLASS_Z }
		const nearby = world.fish.agents.filter(
			(a) => Math.hypot(a.position.x - tap.x, a.position.y - tap.y, a.position.z - tap.z) < 0.3,
		)
		expect(nearby.length).toBeGreaterThan(0)

		const startled = new Set<number>()
		world.events.on("fish:startled", (event) => startled.add(event.fishId))
		world.events.emit({ type: "glass:tap", point: tap, strength: 1 })
		let curiousSeen = 0
		simulate(world, 10, () => {
			curiousSeen = Math.max(curiousSeen, countStates(world, ["curious"]))
		})
		expect(startled.size).toBeGreaterThan(0)
		// Fish react individually, not all at once.
		expect(startled.size).toBeLessThan(world.fish.agents.length)
		expect(curiousSeen).toBeGreaterThan(0)
	})

	it("holding a finger on the glass attracts curious fish towards it", () => {
		const world = createWorld()
		simulate(world, 20)
		const point = { x: 0.1, y: 0.3, z: FRONT_GLASS_Z }
		world.events.emit({ type: "glass:hold", phase: "start", point })
		let closest = Infinity
		simulate(world, 25, () => {
			for (const agent of world.fish.agents) {
				if (agent.state === "curious" && agent.focusStimulusId >= 0) {
					closest = Math.min(
						closest,
						Math.hypot(
							agent.position.x - point.x,
							agent.position.y - point.y,
							agent.position.z - point.z,
						),
					)
				}
			}
		})
		world.events.emit({ type: "glass:hold", phase: "end", point })
		expect(closest).toBeLessThan(0.15)
	})
})

describe("day/night behaviour", () => {
	it("fish slow down and rest at night, while corydoras become more active", () => {
		const day = createWorld({ lightMode: "day" })
		const night = createWorld({ lightMode: "night" })
		simulate(day, 60)
		simulate(night, 60)
		let dayResting = 0
		let nightResting = 0
		let daySpeed = 0
		let nightSpeed = 0
		let dayCory = 0
		let nightCory = 0
		const samples = 60
		for (let i = 0; i < samples; i++) {
			simulate(day, 1)
			simulate(night, 1)
			dayResting += countStates(day, ["resting"])
			nightResting += countStates(night, ["resting"])
			const diurnal = (w: AquariumWorld) =>
				w.fish.agents.filter((a) => a.species.behavior.nocturnal < 0.3)
			daySpeed += diurnal(day).reduce((s, a) => s + a.speed, 0)
			nightSpeed += diurnal(night).reduce((s, a) => s + a.speed, 0)
			const cory = (w: AquariumWorld) =>
				w.fish.agents
					.filter((a) => a.species.id === "panda-corydoras")
					.reduce((s, a) => s + a.speed, 0)
			dayCory += cory(day)
			nightCory += cory(night)
		}
		expect(nightResting).toBeGreaterThan(dayResting * 1.5)
		expect(nightSpeed).toBeLessThan(daySpeed * 0.8)
		expect(nightCory).toBeGreaterThan(dayCory)
	})

	it("switching light mode eases the lighting rather than snapping", () => {
		const world = createWorld({ lightMode: "day" })
		world.setLightMode("night")
		world.update(1 / 60)
		expect(world.lighting.current.daylight).toBeGreaterThan(0.9)
		simulate(world, 15)
		expect(world.lighting.current.daylight).toBeLessThan(0.1)
	})
})
