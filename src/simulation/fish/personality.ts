import { clamp01, lerp } from "../core/math"
import { gaussian, randomRange, truncatedGaussian, type RandomSource } from "../core/random"
import type { FishPersonality, FishSpeciesDefinition } from "./types"

/**
 * Generates an individual's personality from its species' tendencies.
 *
 * Traits are not independent: fish behaviour research describes a
 * bold–shy continuum, so a latent "boldness" sample nudges curiosity up and
 * shyness down together, and a latent "activity" sample couples energy and
 * speed. Two neon tetras therefore differ in coherent ways — one bold and
 * restless, another timid and slow — rather than in random noise.
 */
export function generatePersonality(
	species: FishSpeciesDefinition,
	random: RandomSource,
): FishPersonality {
	const variance = species.behavior.personalityVariance
	const boldness = gaussian(random)
	const activity = gaussian(random)
	const independence = gaussian(random)

	const trait = (mean: number, latent: number, coupling: number) =>
		truncatedGaussian(random, mean + latent * coupling * variance, variance, 0, 1)

	const energy = trait(species.behavior.energy, activity, 0.8)
	const depthRange = species.preferredDepth
	const depthCenter = (depthRange.min + depthRange.max) / 2
	const depthSpread = (depthRange.max - depthRange.min) / 2

	return {
		curiosity: trait(species.behavior.curiosity, boldness, 0.9),
		shyness: trait(species.behavior.shyness, -boldness, 0.9),
		energy,
		sociability: trait(species.behavior.sociability, -independence, 0.7),
		territoriality: trait(species.behavior.territoriality, independence, 0.4),
		aggressiveness: trait(species.behavior.aggressiveness, boldness, 0.4),
		schoolingStrength: clamp01(
			species.behavior.schooling *
				(1 + truncatedGaussian(random, -independence * 0.25, 0.15, -0.5, 0.4)),
		),
		preferredDepth: clamp01(depthCenter + truncatedGaussian(random, 0, 0.45, -1, 1) * depthSpread),
		preferredSpeed:
			species.movement.cruiseSpeed *
			lerp(0.75, 1.25, clamp01(0.5 + activity * 0.25 + (energy - 0.5) * 0.3)),
		reactionTime: lerp(0.12, 0.9, clamp01(0.5 - boldness * 0.2 + randomRange(random, -0.2, 0.2))),
		wanderlust: clamp01(0.5 + activity * 0.18 + randomRange(random, -0.2, 0.2)),
	}
}

/** A short human-readable description of a personality, e.g. "curious and energetic". */
export function describePersonality(personality: FishPersonality): string {
	const traits: Array<[string, number]> = [
		["curious", personality.curiosity],
		["shy", personality.shyness],
		["energetic", personality.energy],
		["sociable", personality.sociability],
		["territorial", personality.territoriality],
	]
	traits.sort((a, b) => b[1] - a[1])
	const [first, second] = traits
	if (!first || !second) return "calm"
	return `${first[0]} and ${second[0]}`
}
