import { LIGHTING_KEYFRAMES, TANK_LIGHT } from "@/config/dayNight"
import {
	AquariumClock,
	LightingController,
	phaseForHour,
	profileForHour,
	withTankLight,
} from "@/simulation/environment/dayNight"
import {
	isTankLightScheduled,
	TankLight,
	tankLightForMode,
	tankLightRampSeconds,
} from "@/simulation/environment/tankLight"

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

	it("eases natural light between modes instead of switching instantly", () => {
		const lighting = new LightingController(12, "auto")
		lighting.setMode("night")
		lighting.update(1 / 60, 12)
		// After one frame the light has barely moved…
		expect(lighting.natural.daylight).toBeGreaterThan(0.9)
		// …but it settles within a dozen seconds.
		for (let i = 0; i < 60 * 12; i++) lighting.update(1 / 60, 12)
		expect(lighting.natural.daylight).toBeLessThan(0.05)
	})

	it("manual day ignores the clock", () => {
		const lighting = new LightingController(2, "day")
		lighting.snap(2)
		expect(lighting.natural.daylight).toBeGreaterThan(0.95)
	})

	it("starts a local-time clock at the real time, not the saved hour", () => {
		const now = new Date()
		const clock = new AquariumClock(3, 0)
		expect(clock.hour).toBeCloseTo(now.getHours() + now.getMinutes() / 60, 1)
	})
})

describe("tank light", () => {
	it("adds its light on top of natural light", () => {
		const night = profileForHour(0)
		const lit = withTankLight(night, 1)
		expect(lit.keyIntensity).toBeCloseTo(night.keyIntensity + TANK_LIGHT.keyIntensity)
		expect(lit.fillIntensity).toBeGreaterThan(night.fillIntensity)
		expect(lit.causticIntensity).toBeGreaterThan(night.causticIntensity)
		expect(lit.waterColor[1]).toBeGreaterThan(night.waterColor[1])
		// The moonlight is untouched; the lamp only adds.
		expect(lit.moonIntensity).toBe(night.moonIntensity)
		expect(withTankLight(night, 0)).toBe(night)
	})

	it("counts as daylight for the fish, though not quite full daylight", () => {
		const lit = withTankLight(profileForHour(0), 1)
		expect(lit.daylight).toBeGreaterThan(0.6)
		expect(lit.daylight).toBeLessThan(0.9)
		expect(withTankLight(profileForHour(12), 1).daylight).toBeCloseTo(1)
	})

	it("fades on and off smoothly when switched", () => {
		const light = new TankLight(false)
		light.switch(true, TANK_LIGHT.switchSeconds)
		const levels: number[] = []
		for (let t = 0; t < TANK_LIGHT.switchSeconds + 0.5; t += 1 / 60) {
			light.update(1 / 60)
			levels.push(light.level)
		}
		expect(levels[0]).toBeLessThan(0.01)
		expect(levels.at(-1)).toBe(1)
		for (let i = 1; i < levels.length; i++) {
			expect(levels[i]!).toBeGreaterThanOrEqual(levels[i - 1]!)
			expect(levels[i]! - levels[i - 1]!).toBeLessThan(0.03)
		}
		// Switched back halfway through a fade, it turns around from where it was.
		light.switch(false, TANK_LIGHT.switchSeconds)
		light.update(0.5)
		const midway = light.level
		light.switch(true, TANK_LIGHT.switchSeconds)
		light.update(1 / 60)
		expect(Math.abs(light.level - midway)).toBeLessThan(0.03)
	})

	it("is on by day and off at night, and runs on a timer in Auto", () => {
		expect(tankLightForMode("day", 2)).toBe(true)
		expect(tankLightForMode("night", 12)).toBe(false)
		expect(isTankLightScheduled(12)).toBe(true)
		expect(isTankLightScheduled(TANK_LIGHT.onHour - 0.1)).toBe(false)
		expect(isTankLightScheduled(TANK_LIGHT.offHour)).toBe(false)
		expect(isTankLightScheduled(23)).toBe(false)
		expect(tankLightForMode("auto", 12)).toBe(true)
		expect(tankLightForMode("auto", 2)).toBe(false)
	})

	it("fades quickly by hand and slowly on its timer", () => {
		const hourPerMinute = 1 / 60
		expect(tankLightRampSeconds("manual", hourPerMinute)).toBe(TANK_LIGHT.switchSeconds)
		expect(tankLightRampSeconds("timer", hourPerMinute)).toBeCloseTo(TANK_LIGHT.timerRampHours * 60)
		// Following the local clock, the timer's fade is capped so it still reads as a fade.
		expect(tankLightRampSeconds("timer", 1 / 3600)).toBe(TANK_LIGHT.maxTimerRampSeconds)
	})

	it("is part of the lighting the scene and fish see", () => {
		const off = new LightingController(0, "night", false)
		const on = new LightingController(0, "night", true)
		expect(off.current.daylight).toBeLessThan(0.05)
		expect(on.current.daylight).toBeGreaterThan(0.6)
		expect(on.natural.daylight).toBe(off.natural.daylight)
	})
})
