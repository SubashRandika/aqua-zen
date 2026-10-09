// @vitest-environment jsdom
import { SETTINGS_STORAGE_KEY, SETTINGS_VERSION } from "@/lib/persistence"

describe("settings persistence", () => {
	beforeEach(() => {
		localStorage.clear()
		vi.resetModules()
	})

	it("saves settings under a versioned key and restores them after a reload", async () => {
		const { useSettingsStore } = await import("@/store/settingsStore")
		const store = useSettingsStore.getState()
		store.setLightMode("night")
		store.setTankLight(true)
		store.setSound(true)
		store.setVolume(0.35)
		store.setQuality("medium")
		store.setCycleMinutes(60)
		store.setCameraMode("explore")
		store.setReducedEffects(true)
		store.setAquariumHour(21.25)
		store.setSpeciesCount("discus", 3)
		store.setSpeciesCount("neon-tetra", 0)

		const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!)
		expect(saved.version).toBe(SETTINGS_VERSION)
		expect(saved.state.lightMode).toBe("night")
		// Actions are never persisted.
		expect(saved.state.setSound).toBeUndefined()

		// Simulate closing and reopening the app.
		vi.resetModules()
		const { useSettingsStore: reopened } = await import("@/store/settingsStore")
		const restored = reopened.getState()
		expect(restored.lightMode).toBe("night")
		expect(restored.tankLight).toBe(true)
		expect(restored.audio).toEqual({ sound: true, music: false, volume: 0.35 })
		expect(restored.quality).toBe("medium")
		expect(restored.cycleMinutes).toBe(60)
		expect(restored.camera.mode).toBe("explore")
		expect(restored.accessibility.reducedEffects).toBe(true)
		expect(restored.aquariumHour).toBeCloseTo(21.25)
		expect(restored.roster.discus).toBe(3)
		expect(restored.roster["neon-tetra"]).toBeUndefined()
		expect(restored.roster.koi).toBe(2)
	})

	it("recovers gracefully from corrupted storage", async () => {
		localStorage.setItem(
			SETTINGS_STORAGE_KEY,
			JSON.stringify({ version: SETTINGS_VERSION, state: { lightMode: "disco", audio: "loud" } }),
		)
		const { useSettingsStore } = await import("@/store/settingsStore")
		const state = useSettingsStore.getState()
		expect(state.lightMode).toBe("auto")
		expect(state.audio.volume).toBeGreaterThan(0)
		expect(typeof state.setLightMode).toBe("function")
	})
})
