"use client"

import { useEffect } from "react"
import { TANK } from "@/config/tank"
import { AudioEngine } from "@/audio/AudioEngine"
import type { AquariumWorld } from "@/simulation/core/World"
import { useSessionStore } from "@/store/sessionStore"
import { useSettingsStore } from "@/store/settingsStore"

const GESTURES = ["pointerdown", "keydown", "touchend"] as const
const DAYLIGHT_SYNC_MS = 2000

const panFor = (x: number) => Math.max(-1, Math.min(1, (x / (TANK.width / 2)) * 0.8))

/**
 * Connects the audio engine to settings and to aquarium events. Audio only
 * starts from a user gesture (browser autoplay policy): if sound was left
 * on last time, the first tap or key press brings it back.
 */
export function useAudio(world: AquariumWorld | null): void {
	useEffect(() => {
		if (!world) return
		const engine = new AudioEngine()
		const settings = useSettingsStore
		const session = useSessionStore

		const wantsAudio = () => {
			const { sound, music } = settings.getState().audio
			return sound || music
		}

		const unlock = async () => {
			if (!wantsAudio() || engine.state === "running") return
			const state = await engine.unlock()
			session.getState().setAudioStatus(state)
			engine.configure(settings.getState().audio)
			engine.setDaylight(world.lighting.current.daylight)
		}

		const onGesture = () => void unlock()
		for (const gesture of GESTURES) window.addEventListener(gesture, onGesture, { passive: true })

		const unsubscribe = settings.subscribe((state, previous) => {
			if (state.audio === previous.audio) return
			// Settings change inside the click handler, so this still counts as a user gesture.
			if (wantsAudio()) void unlock()
			engine.configure(state.audio)
		})

		const offFood = world.events.on("food:released", (event) =>
			engine.playFoodDrop(panFor(event.position.x)),
		)
		const offTap = world.events.on("glass:tap", (event) =>
			engine.playGlassTap(panFor(event.point.x), event.strength),
		)

		const daylightTimer = window.setInterval(
			() => engine.setDaylight(world.lighting.current.daylight),
			DAYLIGHT_SYNC_MS,
		)
		const onVisibility = () => void engine.setPageVisible(document.visibilityState === "visible")
		document.addEventListener("visibilitychange", onVisibility)

		return () => {
			for (const gesture of GESTURES) window.removeEventListener(gesture, onGesture)
			unsubscribe()
			offFood()
			offTap()
			window.clearInterval(daylightTimer)
			document.removeEventListener("visibilitychange", onVisibility)
			engine.dispose()
		}
	}, [world])
}
