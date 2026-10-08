import { getSpecies, SPECIES } from "@/config/species"
import { createRandom } from "@/simulation/core/random"
import { describePersonality, generatePersonality } from "@/simulation/fish/personality"

const TRAITS = [
	"curiosity",
	"energy",
	"sociability",
	"shyness",
	"territoriality",
	"aggressiveness",
	"schoolingStrength",
] as const

describe("personality generation", () => {
	it("keeps every trait in range and depth within the species band", () => {
		const random = createRandom(1)
		for (const species of SPECIES) {
			for (let i = 0; i < 50; i++) {
				const p = generatePersonality(species, random)
				for (const key of TRAITS) {
					expect(p[key]).toBeGreaterThanOrEqual(0)
					expect(p[key]).toBeLessThanOrEqual(1)
				}
				expect(p.preferredDepth).toBeGreaterThanOrEqual(species.preferredDepth.min - 1e-9)
				expect(p.preferredDepth).toBeLessThanOrEqual(species.preferredDepth.max + 1e-9)
				expect(p.preferredSpeed).toBeGreaterThan(0)
				expect(p.preferredSpeed).toBeLessThan(species.movement.maxSpeed)
			}
		}
	})

	it("is deterministic for a seed, yet individuals of a species differ", () => {
		const species = getSpecies("neon-tetra")
		expect(generatePersonality(species, createRandom(7))).toEqual(
			generatePersonality(species, createRandom(7)),
		)
		const random = createRandom(9)
		expect(generatePersonality(species, random)).not.toEqual(generatePersonality(species, random))
	})

	it("couples curiosity and shyness along a bold-shy axis", () => {
		const species = getSpecies("dwarf-gourami")
		const random = createRandom(3)
		const samples = Array.from({ length: 2000 }, () => generatePersonality(species, random))
		const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length
		const curiosity = samples.map((s) => s.curiosity)
		const shyness = samples.map((s) => s.shyness)
		const mc = mean(curiosity)
		const ms = mean(shyness)
		const covariance = mean(curiosity.map((c, i) => (c - mc) * (shyness[i]! - ms)))
		expect(covariance).toBeLessThan(0)
	})

	it("follows species tendencies on average", () => {
		const random = createRandom(4)
		const average = (id: string) => {
			const species = getSpecies(id)
			const values = Array.from(
				{ length: 500 },
				() => generatePersonality(species, random).schoolingStrength,
			)
			return values.reduce((s, v) => s + v, 0) / values.length
		}
		expect(average("neon-tetra")).toBeGreaterThan(average("betta") + 0.5)
	})

	it("describes a personality by its strongest traits", () => {
		const base = generatePersonality(getSpecies("guppy"), createRandom(2))
		const text = describePersonality({
			...base,
			curiosity: 1,
			energy: 0.99,
			shyness: 0,
			sociability: 0,
			territoriality: 0,
		})
		expect(text).toBe("curious and energetic")
	})
})
