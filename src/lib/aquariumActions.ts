import { TANK_INTERIOR } from "@/config/tank"
import type { AquariumWorld } from "@/simulation/core/World"
import type { FishAgent } from "@/simulation/fish/FishAgent"
import { useSessionStore } from "@/store/sessionStore"

/** Seconds that feeding stays armed after the Feed button, so further taps can place more food. */
export const FEED_ARMED_SECONDS = 8

/**
 * Drops a pinch of food near the front-centre of the tank, where it's easy
 * to watch. Returns false while the feeding cooldown is active.
 */
export function feedNow(world: AquariumWorld): boolean {
	const x = (Math.random() - 0.5) * 0.4
	const z = TANK_INTERIOR.maxZ - 0.1 - Math.random() * 0.08
	const released = world.feed({ x, y: TANK_INTERIOR.surfaceY, z })
	if (released > 0) useSessionStore.getState().announce("Food released. The fish will find it.")
	return released > 0
}

/** Prefers fish whose character is easy to follow: larger, curious, unhurried. */
function watchability(agent: FishAgent): number {
	return (
		agent.bodyLength * 10 +
		agent.personality.curiosity +
		(1 - agent.personality.energy) * 0.5 +
		Math.random() * 0.8
	)
}

/** Starts the camera following a fish chosen for being pleasant to watch. */
export function watchAFish(world: AquariumWorld, excludeId?: number): void {
	const candidates = world.fish.agents.filter((a) => a.id !== excludeId)
	if (candidates.length === 0) return
	const chosen = candidates.reduce((best, agent) =>
		watchability(agent) > watchability(best) ? agent : best,
	)
	const name = chosen.species.name.toLowerCase()
	useSessionStore.getState().setFollow({ fishId: chosen.id, label: name })
	useSessionStore.getState().announce(`Watching a ${name}.`)
}

export function stopWatching(): void {
	useSessionStore.getState().requestCameraReset()
}
