"use client"

import { useEffect } from "react"
import { feedNow, stopWatching, watchAFish } from "@/lib/aquariumActions"
import type { AquariumWorld } from "@/simulation/core/World"
import { useSessionStore } from "@/store/sessionStore"
import { useSettingsStore } from "@/store/settingsStore"

function isTyping(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false
	return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
}

/** Single-key shortcuts for the main actions, so the aquarium is fully usable without a pointer. */
export function useKeyboardShortcuts(world: AquariumWorld, toggleHidden: () => void): void {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return
			const settings = useSettingsStore.getState()
			const session = useSessionStore.getState()
			switch (event.key.toLowerCase()) {
				case "f":
					if (feedNow(world)) session.armFeeding()
					break
				case "a":
					settings.setLightMode("auto")
					session.announce("Lighting follows the aquarium’s day.")
					break
				case "d":
					settings.setLightMode("day")
					session.announce("Lights on.")
					break
				case "n":
					settings.setLightMode("night")
					session.announce("Moonlight.")
					break
				case "m":
					settings.setSound(!settings.audio.sound)
					session.announce(settings.audio.sound ? "Water sounds off." : "Water sounds on.")
					break
				case "c": {
					const next = settings.camera.mode === "window" ? "explore" : "window"
					settings.setCameraMode(next)
					session.announce(
						next === "explore" ? "Explore view. Drag to look around." : "Seated view.",
					)
					break
				}
				case "w":
					watchAFish(world, session.follow?.fishId)
					break
				case "r":
					stopWatching()
					session.announce("View reset.")
					break
				case "h":
					toggleHidden()
					break
				case "escape":
					if (session.openPanel) session.setOpenPanel(null)
					else if (session.feedArmed) session.setFeedArmed(false)
					else if (session.follow) stopWatching()
					break
				default:
					return
			}
		}
		window.addEventListener("keydown", onKeyDown)
		return () => window.removeEventListener("keydown", onKeyDown)
	}, [world, toggleHidden])
}
