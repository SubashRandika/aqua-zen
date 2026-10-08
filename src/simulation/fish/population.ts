import type { FishSpeciesDefinition } from "./types"

/**
 * Number of fish of a species for a given population density (1 = "high"
 * quality). Schooling species never drop below their minimum, because a
 * school of two tetras isn't a school.
 */
export function speciesCount(species: FishSpeciesDefinition, density: number): number {
	return Math.max(species.population.minCount, Math.round(species.population.count * density))
}

export function populationPlan(
	species: readonly FishSpeciesDefinition[],
	density: number,
): Array<{ species: FishSpeciesDefinition; count: number }> {
	return species.map((s) => ({ species: s, count: speciesCount(s, density) }))
}
