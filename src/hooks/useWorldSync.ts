"use client"

import { useEffect } from "react"
import { QUALITY_PRESETS } from "@/config/quality"
import type { AquariumWorld } from "@/simulation/core/World"
import { useSessionStore } from "@/store/sessionStore"
import { useSettingsStore } from "@/store/settingsStore"

const SAVE_CLOCK_INTERVAL_MS = 15000

/**
 * Bridges React-side settings and the simulation. Settings flow into the
 * world through subscriptions (not renders); the world reports back only
 * rare, meaningful changes such as a new phase of the day.
 */
export function useWorldSync(world: AquariumWorld | null): void {
	useEffect(() => {
		if (!world) return
		const settings = useSettingsStore
		const session = useSessionStore

		world.setLightMode(settings.getState().lightMode)
		world.setCycleMinutes(settings.getState().cycleMinutes)
		session.getState().setPhase(world.clock.phase)

		const unsubscribeSettings = settings.subscribe((state, previous) => {
			if (state.lightMode !== previous.lightMode) world.setLightMode(state.lightMode)
			// Read the latest value: changing the light mode may have just switched the light.
			if (state.tankLight !== previous.tankLight) world.setTankLight(settings.getState().tankLight)
			if (state.cycleMinutes !== previous.cycleMinutes) world.setCycleMinutes(state.cycleMinutes)
		})
		const unsubscribeSession = session.subscribe((state, previous) => {
			if (state.activeQuality !== previous.activeQuality) {
				world.setPopulationDensity(QUALITY_PRESETS[state.activeQuality].fishDensity)
			}
		})
		const unsubscribePhase = world.events.on("time:phase", (event) =>
			session.getState().setPhase(event.phase),
		)
		// The light mode and the timer switch the tank light too; keep the setting in step.
		const unsubscribeTankLight = world.events.on("tank-light:changed", (event) => {
			if (settings.getState().tankLight !== event.on) settings.getState().setTankLight(event.on)
		})

		// Persist the aquarium's clock so it resumes where it was.
		const saveClock = () => settings.getState().setAquariumHour(world.clock.hour)
		const interval = window.setInterval(saveClock, SAVE_CLOCK_INTERVAL_MS)
		window.addEventListener("pagehide", saveClock)

		return () => {
			unsubscribeSettings()
			unsubscribeSession()
			unsubscribePhase()
			unsubscribeTankLight()
			window.clearInterval(interval)
			window.removeEventListener("pagehide", saveClock)
			saveClock()
		}
	}, [world])
}
