import { Vector3 } from "three"
import { FRONT_GLASS_Z, TANK_INTERIOR } from "@/config/tank"
import { AquariumWorld } from "@/simulation/core/World"
import { substrateHeight } from "@/simulation/environment/substrate"
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

describe("natural movement", () => {
	it("turns smoothly: the heading never jumps, even at the glass or the bottom", () => {
		const world = createWorld()
		const previous = new Map<number, Vector3>()
		let largestStep = 0
		let glideTurns = 0
		let turns = 0
		simulate(world, 90, () => {
			for (const agent of world.fish.agents) {
				const before = previous.get(agent.id)
				if (before && agent.state !== "startled" && !agent.cling) {
					const step = before.angleTo(agent.heading)
					largestStep = Math.max(largestStep, step)
					if (agent.species.movement.swimStyle === "burstGlide" && step / DT > 1) {
						turns++
						if (agent.thrust < 0.2) glideTurns++
					}
				}
				previous.set(agent.id, (before ?? new Vector3()).copy(agent.heading))
			}
		})
		// Under ~25° per 1/30 s step: fast turns build up rather than snapping.
		expect(largestStep).toBeLessThan(0.45)
		// Burst-and-glide swimmers turn with a kick of the tail, not while coasting.
		expect(glideTurns / Math.max(turns, 1)).toBeLessThan(0.3)
	})

	it("goldfish and koi pick over the substrate nose-down", () => {
		const world = createWorld()
		let pecking = 0
		simulate(world, 240, () => {
			for (const agent of world.fish.agents) {
				if (agent.species.id !== "goldfish" && agent.species.id !== "koi") continue
				if (agent.state !== "foraging" || !agent.arrived) continue
				const floor = substrateHeight(agent.position.x, agent.position.z)
				if (agent.heading.y < -0.25 && agent.position.y - floor < agent.bodyLength) pecking++
			}
		})
		expect(pecking).toBeGreaterThan(0)
	})

	it("the pleco grazes while holding on to surfaces, and moves between patches", () => {
		const world = createWorld({ lightMode: "night" })
		const pleco = world.fish.agents.find((a) => a.species.id === "bristlenose-pleco")!
		let attachedSeconds = 0
		let attachments = 0
		let wasAttached = false
		let heldFor = 0
		let backAgainstSurface = 1
		simulate(world, 300, () => {
			if (pleco.cling) {
				attachedSeconds += DT
				if (!wasAttached) {
					attachments++
					heldFor = 0
				}
				heldFor += DT
				// Once settled, its back faces away from the surface it holds.
				if (heldFor > 2 && pleco.cling.kind === "glass")
					backAgainstSurface = Math.min(backAgainstSurface, pleco.up.dot(pleco.cling.normal))
			}
			wasAttached = pleco.cling !== null
			const b = world.bounds
			expect(pleco.position.x).toBeGreaterThanOrEqual(b.minX)
			expect(pleco.position.x).toBeLessThanOrEqual(b.maxX)
			expect(pleco.position.z).toBeGreaterThanOrEqual(b.minZ)
			expect(pleco.position.z).toBeLessThanOrEqual(b.maxZ)
		})
		expect(attachedSeconds).toBeGreaterThan(60)
		expect(attachments).toBeGreaterThan(1)
		expect(backAgainstSurface).toBeGreaterThan(0.9)
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

	it("Day turns the tank light on and Night turns it off", () => {
		const world = createWorld({ lightMode: "auto", hour: 2 })
		expect(world.lighting.tankLight.on).toBe(false)
		world.setLightMode("day")
		expect(world.lighting.tankLight.on).toBe(true)
		world.setLightMode("night")
		expect(world.lighting.tankLight.on).toBe(false)
		// It can still be switched on by hand at night, and fades up rather than snapping.
		world.setTankLight(true)
		world.update(1 / 60)
		expect(world.lighting.tankLight.level).toBeLessThan(0.05)
		simulate(world, 3)
		expect(world.lighting.tankLight.level).toBe(1)
	})

	it("in Auto the timer switches the light, and a switch by hand holds until its next change", () => {
		// 12 real minutes per day: one simulated hour every 30 seconds.
		const world = createWorld({ hour: 7, cycleMinutes: 12, lightMode: "auto" })
		const changes: Array<{ on: boolean; cause: string }> = []
		world.events.on("tank-light:changed", ({ on, cause }) => changes.push({ on, cause }))
		expect(world.lighting.tankLight.on).toBe(false)
		simulate(world, 30) // 08:00, past the timer's morning switch
		expect(world.lighting.tankLight.on).toBe(true)
		expect(changes).toEqual([{ on: true, cause: "timer" }])

		world.setTankLight(false)
		simulate(world, 60) // 10:00, still off as the user left it
		expect(world.lighting.tankLight.on).toBe(false)

		simulate(world, 30 * 13) // 23:00, after the timer's evening switch
		expect(world.lighting.tankLight.on).toBe(false)
		// Already off by hand, so the evening switch had nothing to do.
		expect(changes.map((c) => c.cause)).toEqual(["timer", "manual"])
	})

	it("switching the tank light on at night wakes the fish", () => {
		const dark = createWorld({ lightMode: "night", tankLight: false })
		const lit = createWorld({ lightMode: "night", tankLight: true })
		simulate(dark, 60)
		simulate(lit, 60)
		let darkResting = 0
		let litResting = 0
		for (let i = 0; i < 30; i++) {
			simulate(dark, 1)
			simulate(lit, 1)
			darkResting += countStates(dark, ["resting"])
			litResting += countStates(lit, ["resting"])
		}
		expect(litResting).toBeLessThan(darkResting * 0.7)
	})
})
