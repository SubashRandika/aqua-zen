import type { FishSpeciesDefinition } from "./types"

/**
 * The fish the owner keeps: how many of each species, by species id.
 * Species that aren't in the tank are simply absent.
 */
export type Roster = Readonly<Record<string, number>>

export interface PopulationEntry {
	species: FishSpeciesDefinition
	count: number
}

/** A species' group size kept within what the tank allows for it. */
export function clampGroupSize(species: FishSpeciesDefinition, count: number): number {
	const { minCount, maxCount } = species.population
	return Math.min(maxCount, Math.max(minCount, Math.round(count)))
}

/** A roster of the given species, each at its usual group size. */
export function rosterOf(species: readonly FishSpeciesDefinition[]): Roster {
	return Object.fromEntries(species.map((s) => [s.id, s.population.count]))
}

export function rosterTotal(roster: Roster): number {
	return Object.values(roster).reduce((sum, count) => sum + count, 0)
}

/**
 * How many of each species to keep in the tank. The roster is honoured as
 * chosen unless it holds more fish than the quality level can animate
 * smoothly; then every group shrinks in proportion, but schooling species
 * never drop below the smallest group in which they still school.
 */
export function populationPlan(
	species: readonly FishSpeciesDefinition[],
	roster: Roster,
	capacity: number,
): PopulationEntry[] {
	const wanted = species.filter((s) => (roster[s.id] ?? 0) > 0)
	const total = wanted.reduce((sum, s) => sum + clampGroupSize(s, roster[s.id]!), 0)
	const share = total > capacity ? capacity / total : 1
	return wanted.map((s) => {
		const count = clampGroupSize(s, roster[s.id]!)
		return { species: s, count: Math.max(s.population.minCount, Math.round(count * share)) }
	})
}

/** Total fish a plan puts in the tank. */
export function planTotal(plan: readonly PopulationEntry[]): number {
	return plan.reduce((sum, entry) => sum + entry.count, 0)
}
