import { getSpecies, SPECIES, STARTER_ROSTER } from "@/config/species"
import {
	clampGroupSize,
	planTotal,
	populationPlan,
	rosterTotal,
} from "@/simulation/fish/population"

const countOf = (plan: ReturnType<typeof populationPlan>, id: string) =>
	plan.find((entry) => entry.species.id === id)?.count ?? 0

describe("population plan", () => {
	it("keeps the chosen fish exactly while they fit", () => {
		const plan = populationPlan(SPECIES, STARTER_ROSTER, 100)
		expect(planTotal(plan)).toBe(rosterTotal(STARTER_ROSTER))
		expect(countOf(plan, "neon-tetra")).toBe(STARTER_ROSTER["neon-tetra"])
		// Species that aren't chosen stay out of the tank.
		expect(countOf(plan, "discus")).toBe(0)
		expect(plan.every((entry) => entry.count > 0)).toBe(true)
	})

	it("shrinks every group in proportion when the quality level can't animate them all", () => {
		const plan = populationPlan(SPECIES, STARTER_ROSTER, 36)
		const total = planTotal(plan)
		expect(total).toBeLessThan(rosterTotal(STARTER_ROSTER))
		expect(total).toBeLessThanOrEqual(36 + plan.length / 2)
		expect(countOf(plan, "neon-tetra")).toBeLessThan(STARTER_ROSTER["neon-tetra"]!)
		// Schools stay schools.
		for (const entry of plan)
			expect(entry.count).toBeGreaterThanOrEqual(entry.species.population.minCount)
	})

	it("handles an empty tank", () => {
		expect(populationPlan(SPECIES, {}, 72)).toEqual([])
	})

	it("keeps group sizes within what the tank allows", () => {
		const neon = getSpecies("neon-tetra")
		expect(clampGroupSize(neon, 2)).toBe(neon.population.minCount)
		expect(clampGroupSize(neon, 500)).toBe(neon.population.maxCount)
		expect(clampGroupSize(neon, 11.6)).toBe(12)
		const plan = populationPlan(SPECIES, { betta: 4 }, 72)
		expect(countOf(plan, "betta")).toBe(1)
	})
})
