import { clamp, lerp } from "../core/math"
import type { FishAgent } from "../fish/FishAgent"
import type { FishSpeciesDefinition } from "../fish/types"

/**
 * How active a species is under the current light. Diurnal fish slow down
 * and rest as light fades; nocturnal fish (corydoras) do the opposite.
 */
export function speciesActivity(species: FishSpeciesDefinition, daylight: number): number {
	const nocturnal = species.behavior.nocturnal
	const dayActivity = lerp(1, 0.55, nocturnal)
	const nightActivity = lerp(0.22, 1.05, nocturnal)
	// Activity follows light with a slight lag at dusk: dim light already calms fish.
	const lightResponse = clamp(daylight * 1.15, 0, 1)
	return lerp(nightActivity, dayActivity, lightResponse)
}

/** Individual activity: species rhythm, personal energy and current stamina. */
export function agentActivity(agent: FishAgent, daylight: number): number {
	const base = speciesActivity(agent.species, daylight)
	const personal = lerp(0.75, 1.2, agent.personality.energy)
	const tiredness = lerp(0.6, 1, agent.stamina)
	return clamp(base * personal * tiredness, 0.05, 1.4)
}
