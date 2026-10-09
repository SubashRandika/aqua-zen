import { getSpecies, SPECIES, SPECIES_BY_ID } from "@/config/species"
import { speciesCount } from "@/simulation/fish/population"

const HEX = /^#[0-9a-f]{6}$/i

describe("species configuration", () => {
	it("has a dozen or so species with unique ids", () => {
		expect(SPECIES.length).toBeGreaterThanOrEqual(8)
		expect(SPECIES.length).toBeLessThanOrEqual(16)
		expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length)
		expect(SPECIES_BY_ID.size).toBe(SPECIES.length)
	})

	it.each(SPECIES.map((s) => [s.id, s] as const))("%s is internally consistent", (_, species) => {
		const m = species.movement
		expect(m.minSpeed).toBeLessThanOrEqual(m.cruiseSpeed)
		expect(m.cruiseSpeed).toBeLessThan(m.maxSpeed)
		expect(m.maxSpeed).toBeLessThan(m.burstSpeed)
		expect(m.turnRate).toBeGreaterThan(0)
		expect(m.maxPitch).toBeGreaterThan(0)
		expect(m.maxPitch).toBeLessThan(Math.PI / 2)
		if (m.swimStyle !== "continuous") expect(m.kickInterval).toBeDefined()

		expect(species.preferredDepth.min).toBeGreaterThanOrEqual(0)
		expect(species.preferredDepth.max).toBeLessThanOrEqual(1)
		expect(species.preferredDepth.min).toBeLessThan(species.preferredDepth.max)

		for (const value of Object.values(species.behavior)) {
			expect(value).toBeGreaterThanOrEqual(0)
			expect(value).toBeLessThanOrEqual(1)
		}
		expect(species.population.minCount).toBeLessThanOrEqual(species.population.count)
		expect(species.scale).toBeGreaterThan(0.01)
		expect(species.scale).toBeLessThan(0.2)

		const lod = species.visual.lodDistances
		for (let i = 1; i < lod.length; i++) expect(lod[i]!).toBeGreaterThan(lod[i - 1]!)

		const profile = species.visual.shape.profile
		expect(profile[0]!.t).toBe(0)
		expect(profile.at(-1)!.t).toBe(1)
		for (let i = 1; i < profile.length; i++)
			expect(profile[i]!.t).toBeGreaterThan(profile[i - 1]!.t)

		const pattern = species.visual.pattern
		for (const color of [
			pattern.back,
			pattern.belly,
			pattern.fin,
			pattern.accent,
			pattern.accent2,
			pattern.iris,
		])
			expect(color).toMatch(HEX)
		expect(pattern.scales.size).toBeGreaterThan(0.01)
		expect(pattern.scales.size).toBeLessThan(0.1)
		expect(pattern.scales.contrast).toBeGreaterThanOrEqual(0)
		expect(pattern.scales.contrast).toBeLessThanOrEqual(1)
		if (pattern.varieties !== undefined) expect(pattern.varieties).toBeGreaterThanOrEqual(1)

		const forage = species.feeding.forage
		if (forage) {
			expect(forage.tendency).toBeGreaterThan(0)
			expect(forage.tendency).toBeLessThanOrEqual(1)
		}
	})

	it("includes a goldfish, koi and a tank-cleaning pleco", () => {
		expect(getSpecies("goldfish").visual.shape.caudal.kind).toBe("twin")
		expect(getSpecies("koi").visual.pattern.varieties).toBeGreaterThan(1)
		const pleco = getSpecies("bristlenose-pleco")
		expect(pleco.feeding.forage?.style).toBe("cling")
		expect(pleco.population.count).toBe(1)
	})

	it("gives species distinct speeds and depth preferences", () => {
		expect(new Set(SPECIES.map((s) => s.movement.cruiseSpeed)).size).toBeGreaterThan(5)
		expect(SPECIES.some((s) => s.preferredDepth.max <= 0.15)).toBe(true)
		expect(SPECIES.some((s) => s.preferredDepth.min >= 0.55)).toBe(true)
	})

	it("scales populations but never below a species' minimum", () => {
		const neon = getSpecies("neon-tetra")
		expect(speciesCount(neon, 1)).toBe(neon.population.count)
		expect(speciesCount(neon, 0.1)).toBe(neon.population.minCount)
		expect(speciesCount(neon, 1.25)).toBeGreaterThan(neon.population.count)
	})

	it("throws for unknown species", () => {
		expect(() => getSpecies("goldfish-on-mars")).toThrow()
	})
})
