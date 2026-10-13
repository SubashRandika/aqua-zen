import {
	getSpecies,
	SPECIES,
	SPECIES_BY_ID,
	STARTER_ROSTER,
	STARTER_SPECIES,
} from "@/config/species"

const HEX = /^#[0-9a-f]{6}$/i

describe("species configuration", () => {
	it("has a catalogue of species with unique ids", () => {
		expect(SPECIES.length).toBeGreaterThanOrEqual(12)
		expect(SPECIES.length).toBeLessThanOrEqual(24)
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
		const population = species.population
		expect(population.minCount).toBeGreaterThanOrEqual(1)
		expect(population.minCount).toBeLessThanOrEqual(population.count)
		expect(population.count).toBeLessThanOrEqual(population.maxCount)

		const catalog = species.catalog
		expect(["shoaling", "openWater", "bottom"]).toContain(catalog.group)
		expect(catalog.plural.length).toBeGreaterThan(0)
		// One short line in the fish list.
		expect(catalog.note.length).toBeGreaterThan(0)
		expect(catalog.note.length).toBeLessThanOrEqual(31)
		expect(catalog.swatch.colors.length).toBeGreaterThanOrEqual(1)
		for (const color of catalog.swatch.colors) expect(color).toMatch(HEX)
		if (catalog.swatch.barColor) expect(catalog.swatch.barColor).toMatch(HEX)
		for (const bar of catalog.swatch.bars ?? []) {
			expect(bar).toBeGreaterThanOrEqual(0)
			expect(bar).toBeLessThanOrEqual(1)
		}
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

	it("starts with a tank of a dozen species, with more to choose from", () => {
		expect(STARTER_SPECIES.length).toBe(12)
		for (const id of STARTER_SPECIES)
			expect(STARTER_ROSTER[id]).toBe(getSpecies(id).population.count)
		const extra = SPECIES.filter((s) => !STARTER_SPECIES.includes(s.id))
		expect(extra.length).toBeGreaterThanOrEqual(6)
		expect(getSpecies("swordtail").visual.shape.caudal.kind).toBe("sword")
		expect(getSpecies("otocinclus").feeding.forage?.style).toBe("cling")
		// Male bettas fight, so the tank keeps one.
		expect(getSpecies("betta").population.maxCount).toBe(1)
	})

	it("throws for unknown species", () => {
		expect(() => getSpecies("goldfish-on-mars")).toThrow()
	})
})
