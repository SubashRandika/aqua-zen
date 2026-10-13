import { STARTER_ROSTER } from "@/config/species"
import {
	DEFAULT_SETTINGS,
	migrateSettings,
	sanitizeSettings,
	SETTINGS_VERSION,
} from "@/lib/persistence"

describe("settings persistence", () => {
	it("falls back to defaults for missing or corrupt data", () => {
		expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
		expect(sanitizeSettings("garbage")).toEqual(DEFAULT_SETTINGS)
		expect(sanitizeSettings([1, 2, 3])).toEqual(DEFAULT_SETTINGS)
	})

	it("validates each field independently", () => {
		const result = sanitizeSettings({
			audio: { sound: true, music: "yes", volume: 7 },
			lightMode: "night",
			tankLight: "bright",
			cycleMinutes: 13,
			aquariumHour: -4,
			quality: "potato",
			camera: { mode: "explore", cinematicMotion: false },
			accessibility: { reducedMotion: "on", reducedEffects: true },
		})
		expect(result.audio).toEqual({ sound: true, music: DEFAULT_SETTINGS.audio.music, volume: 1 })
		expect(result.lightMode).toBe("night")
		expect(result.tankLight).toBe(DEFAULT_SETTINGS.tankLight)
		expect(result.cycleMinutes).toBe(DEFAULT_SETTINGS.cycleMinutes)
		expect(result.aquariumHour).toBe(0)
		expect(result.quality).toBe("auto")
		expect(result.camera).toEqual({ mode: "explore", cinematicMotion: false })
		expect(result.accessibility).toEqual({ reducedMotion: "on", reducedEffects: true })
	})

	it("applies migrations in order from the stored version", () => {
		// A hypothetical future schema change: v1 → v2 moves `muted` into `audio.sound`.
		const migrations = {
			1: (state: Record<string, unknown>) => {
				const { muted, ...rest } = state
				return { ...rest, audio: { sound: !muted, music: false, volume: 0.4 } }
			},
		}
		const result = migrateSettings({ muted: false, lightMode: "day" }, 1, migrations, 2)
		expect(result.audio).toEqual({ sound: true, music: false, volume: 0.4 })
		expect(result.lightMode).toBe("day")
	})

	it("starts the tank light where a version 1 user's light mode would have it", () => {
		expect(migrateSettings({ lightMode: "night", aquariumHour: 12 }, 1).tankLight).toBe(false)
		expect(migrateSettings({ lightMode: "day", aquariumHour: 2 }, 1).tankLight).toBe(true)
		expect(migrateSettings({ lightMode: "auto", aquariumHour: 23 }, 1).tankLight).toBe(false)
		expect(migrateSettings({ lightMode: "auto", aquariumHour: 10 }, 1).tankLight).toBe(true)
		expect(migrateSettings({ lightMode: "disco" }, 1).tankLight).toBe(DEFAULT_SETTINGS.tankLight)
	})

	it("keeps the fish a version 2 user already had", () => {
		expect(migrateSettings({ lightMode: "day" }, 2).roster).toEqual(STARTER_ROSTER)
	})

	it("keeps only known species, at group sizes the tank allows", () => {
		const roster = sanitizeSettings({
			roster: { "neon-tetra": 400, discus: 2, betta: 0, guppy: -3, "sea-dragon": 2, koi: "many" },
		}).roster
		expect(roster).toEqual({ "neon-tetra": 24, discus: 2 })
		expect(sanitizeSettings({ roster: [1, 2] }).roster).toEqual(DEFAULT_SETTINGS.roster)
		// An empty tank is a valid choice.
		expect(sanitizeSettings({ roster: {} }).roster).toEqual({})
	})

	it("leaves current-version data unchanged apart from validation", () => {
		const stored = { ...DEFAULT_SETTINGS, lightMode: "night" as const, aquariumHour: 21.5 }
		expect(migrateSettings(stored, SETTINGS_VERSION)).toEqual(stored)
	})
})
