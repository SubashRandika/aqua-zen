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
	it("releases a pinch of flakes, with a few sinking pellets, at the surface", () => {
		const food = new FoodManager(createRandom(1))
		const pinch = food.release(0, 0, 0)
		const flakes = pinch.filter((p) => p.kind === "flake")
		const pellets = pinch.filter((p) => p.kind === "pellet")
		expect(flakes.length).toBeGreaterThanOrEqual(FEEDING.flakesPerFeeding.min)
		expect(flakes.length).toBeLessThanOrEqual(FEEDING.flakesPerFeeding.max)
		expect(pellets.length).toBeGreaterThanOrEqual(FEEDING.pelletsPerFeeding.min)
		expect(pellets.length).toBeLessThanOrEqual(FEEDING.pelletsPerFeeding.max)
		for (const particle of pinch) {
			expect(particle.position.y).toBeCloseTo(TANK_INTERIOR.surfaceY, 2)
			expect(particle.phase).toBe("floating")
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

	it("sinks flakes gently and pellets faster", () => {
		const food = new FoodManager(createRandom(4))
		food.release(0, 0, 0)
		const t = run(food, 6.5)
		const before = food.particles.map((p) => p.position.y)
		run(food, 2, t)
		const rate = (kind: string) => {
			const drops = food.particles
				.map((p, i) => ({ p, drop: (before[i]! - p.position.y) / 2 }))
				.filter(({ p }) => p.kind === kind && p.phase === "sinking")
				.map(({ drop }) => drop)
			return drops.reduce((sum, d) => sum + d, 0) / Math.max(drops.length, 1)
		}
		expect(rate("flake")).toBeGreaterThan(0.004)
		expect(rate("flake")).toBeLessThan(0.025)
		// Pellets reach the bottom quickly, so they are usually there already.
		const pellets = food.particles.filter((p) => p.kind === "pellet")
		expect(pellets.every((p) => p.phase !== "floating")).toBe(true)
	})

	it("flutters flakes down like falling leaves", () => {
		const food = new FoodManager(createRandom(8))
		food.release(0, 0, 0)
		const flake = food.particles.find((p) => p.kind === "flake")!
		flake.floatTime = 0
		let t = 0
		const tilts: number[] = []
		for (let i = 0; i < 120; i++) {
			t += 1 / 30
			food.update(1 / 30, t)
			if (flake.phase !== "sinking") break
			tilts.push(flake.tilt)
		}
		// The flake tips one way, then the other, as it swings from side to side.
		expect(Math.max(...tilts)).toBeGreaterThan(0.3)
		expect(Math.min(...tilts)).toBeLessThan(-0.3)
	})

	it("draws floating flakes together on the surface", () => {
		const food = new FoodManager(createRandom(9))
		const pinch = food.release(0, 0, 0)
		const flakes = pinch.filter((p) => p.kind === "flake")
		for (const flake of flakes) {
			flake.floatTime = 60
			flake.velocity.set(0, 0, 0)
		}
		const spread = () => {
			const cx = flakes.reduce((s, f) => s + f.position.x, 0) / flakes.length
			const cz = flakes.reduce((s, f) => s + f.position.z, 0) / flakes.length
			return flakes.reduce((s, f) => s + Math.hypot(f.position.x - cx, f.position.z - cz), 0)
		}
		const before = spread()
		// Hold the current still to isolate surface tension.
		for (let i = 0; i < 150; i++) {
			food.update(1 / 30, 0)
			for (const flake of flakes) flake.velocity.set(0, 0, 0)
		}
		expect(spread()).toBeLessThan(before)
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

	it("tears crumbs from flakes that are bitten, which drift down", () => {
		const food = new FoodManager(createRandom(10))
		food.release(0, 0, 0)
		for (const flake of food.particles.filter((p) => p.kind === "flake")) food.consume(flake.id)
		const crumbs = food.particles.filter((p) => p.kind === "crumb")
		expect(crumbs.length).toBeGreaterThan(0)
		for (const crumb of crumbs) {
			expect(crumb.phase).toBe("sinking")
			expect(crumb.amount).toBeLessThan(1)
		}
	})

	it("never tears crumbs beyond the particle limit", () => {
		const food = new FoodManager(createRandom(11))
		for (let i = 0; i < 40; i++) food.release(0, 0, i * (FEEDING.cooldown + 0.1))
		for (let round = 0; round < 3; round++)
			for (const particle of [...food.particles]) food.consume(particle.id, 0.1)
		expect(food.particles.length).toBeLessThanOrEqual(FEEDING.maxParticles)
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
