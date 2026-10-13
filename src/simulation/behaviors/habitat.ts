import type { FishSpeciesDefinition } from "../fish/types"

/** Species whose depth band tops out below this live in the lowest water (loaches). */
const LOW_WATER_DEPTH = 0.35

/**
 * Whether a species keeps close to the bottom: hopping bottom dwellers, and
 * free swimmers such as loaches that stay in the lowest water and rest on
 * the sand. Steering lets these come right down to the substrate.
 */
export function livesNearBottom(species: FishSpeciesDefinition): boolean {
	return species.movement.swimStyle === "bottomHop" || species.preferredDepth.max <= LOW_WATER_DEPTH
}
