import { TANK_INTERIOR } from "@/config/tank"
import { createRandom } from "@/simulation/core/random"
import { substrateHeight } from "@/simulation/environment/substrate"
import { FEEDING, FoodManager } from "@/simulation/feeding/FoodManager"

function run(food: FoodManager, seconds: number, start = 0, dt = 1 / 30): number {
	let t = start
	for (let i = 0; i < Math.round(seconds / dt); i++) {
		t += dt
		food.update(dt, t)
	}
	return t
}

describe("FoodManager", () => {
	it("releases a pinch of flakes at the surface", () => {
		const food = new FoodManager(createRandom(1))
		const flakes = food.release(0, 0, 0)
		expect(flakes.length).toBeGreaterThanOrEqual(FEEDING.flakesPerFeeding.min)
		expect(flakes.length).toBeLessThanOrEqual(FEEDING.flakesPerFeeding.max)
		for (const flake of flakes) {
			expect(flake.position.y).toBeCloseTo(TANK_INTERIOR.surfaceY, 2)
			expect(flake.phase).toBe("floating")
		}
	})

	it("enforces a cooldown between feedings", () => {
		const food = new FoodManager(createRandom(1))
		expect(food.release(0, 0, 0).length).toBeGreaterThan(0)
		expect(food.canRelease(0.5)).toBe(false)
		expect(food.release(0, 0, 0.5)).toHaveLength(0)
		expect(food.release(0, 0, FEEDING.cooldown + 0.01).length).toBeGreaterThan(0)
	})

	it("never exceeds the particle limit", () => {
		const food = new FoodManager(createRandom(2))
		for (let i = 0; i < 40; i++) food.release(0, 0, i * (FEEDING.cooldown + 0.1))
		expect(food.particles.length).toBeLessThanOrEqual(FEEDING.maxParticles)
	})

	it("floats, then sinks slowly and settles on the substrate", () => {
		const food = new FoodManager(createRandom(3))
		food.release(0.1, 0, 0)
		const t = run(food, 6)
		expect(food.particles.some((p) => p.phase === "sinking" || p.phase === "settled")).toBe(true)
		run(food, 60, t)
		for (const particle of food.particles) {
			expect(particle.phase).toBe("settled")
			expect(particle.position.y).toBeCloseTo(
				substrateHeight(particle.position.x, particle.position.z) + 0.002,
				3,
			)
		}
	})

	it("sinks at a gentle, realistic rate", () => {
		const food = new FoodManager(createRandom(4))
		food.release(0, 0, 0)
		const t = run(food, 6)
		const before = food.particles.map((p) => p.position.y)
		run(food, 1, t)
		food.particles.forEach((p, i) => {
			if (p.phase === "sinking") {
				const drop = before[i]! - p.position.y
				expect(drop).toBeGreaterThan(0)
				expect(drop).toBeLessThan(0.03)
			}
		})
	})

	it("is eaten in bites and removed when finished", () => {
		const food = new FoodManager(createRandom(5))
		const [flake] = food.release(0, 0, 0)
		const id = flake!.id
		expect(food.consume(id)).toBeCloseTo(FEEDING.biteSize)
		while (food.get(id) && food.get(id)!.amount > 0) food.consume(id)
		food.update(1 / 30, 0.1)
		expect(food.get(id)).toBeUndefined()
		expect(food.consume(id)).toBe(0)
	})

	it("expires uneaten food after it has lain on the bottom", () => {
		const food = new FoodManager(createRandom(6))
		food.release(0, 0, 0)
		run(food, FEEDING.maxLifetime + 1, 0, 1 / 10)
		expect(food.particles).toHaveLength(0)
	})

	it("classifies food by layer of the water column", () => {
		const food = new FoodManager(createRandom(7))
		const [flake] = food.release(0, 0, 0)
		expect(food.zoneOf(flake!)).toBe("surface")
		flake!.position.y = 0.25
		expect(food.zoneOf(flake!)).toBe("midwater")
		flake!.phase = "settled"
		expect(food.zoneOf(flake!)).toBe("bottom")
	})
})
