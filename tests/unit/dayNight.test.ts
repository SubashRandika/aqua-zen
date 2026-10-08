import { LIGHTING_KEYFRAMES } from "@/config/dayNight"
import {
	AquariumClock,
	LightingController,
	phaseForHour,
	profileForHour,
} from "@/simulation/environment/dayNight"

describe("day/night", () => {
	it("names the phases of the day in order", () => {
		expect(phaseForHour(2)).toBe("night")
		expect(phaseForHour(6)).toBe("sunrise")
		expect(phaseForHour(9)).toBe("morning")
		expect(phaseForHour(13)).toBe("day")
		expect(phaseForHour(16)).toBe("afternoon")
		expect(phaseForHour(18.5)).toBe("sunset")
		expect(phaseForHour(20)).toBe("evening")
		expect(phaseForHour(23)).toBe("night")
		expect(phaseForHour(25)).toBe("night")
	})

	it("has sorted keyframes that wrap seamlessly at midnight", () => {
		for (let i = 1; i < LIGHTING_KEYFRAMES.length; i++) {
			expect(LIGHTING_KEYFRAMES[i]!.hour).toBeGreaterThan(LIGHTING_KEYFRAMES[i - 1]!.hour)
		}
		expect(profileForHour(0).daylight).toBeCloseTo(profileForHour(24).daylight)
	})

	it("changes lighting continuously through the day", () => {
		let previous = profileForHour(0)
		for (let h = 0.05; h <= 24; h += 0.05) {
			const current = profileForHour(h)
			expect(Math.abs(current.daylight - previous.daylight)).toBeLessThan(0.06)
			expect(Math.abs(current.keyIntensity - previous.keyIntensity)).toBeLessThan(0.2)
			previous = current
		}
		expect(profileForHour(12).daylight).toBeGreaterThan(0.95)
		expect(profileForHour(2).daylight).toBeLessThan(0.05)
	})

	it("runs an accelerated clock that wraps around", () => {
		const clock = new AquariumClock(23.5, 24)
		// 24 real minutes per day → one simulated hour every minute.
		clock.update(60)
		expect(clock.hour).toBeCloseTo(0.5, 5)
	})

	it("can follow the local time", () => {
		const clock = new AquariumClock(3, 0)
		clock.update(1, new Date(2026, 0, 1, 14, 30, 0))
		expect(clock.followsLocalTime).toBe(true)
		expect(clock.hour).toBeCloseTo(14.5)
	})

	it("eases between modes instead of switching instantly", () => {
		const lighting = new LightingController(12, "auto")
		lighting.setMode("night")
		lighting.update(1 / 60, 12)
		// After one frame the light has barely moved…
		expect(lighting.current.daylight).toBeGreaterThan(0.9)
		// …but it settles within a dozen seconds.
		for (let i = 0; i < 60 * 12; i++) lighting.update(1 / 60, 12)
		expect(lighting.current.daylight).toBeLessThan(0.05)
	})

	it("manual day ignores the clock", () => {
		const lighting = new LightingController(2, "day")
		lighting.snap(2)
		expect(lighting.current.daylight).toBeGreaterThan(0.95)
	})
})
