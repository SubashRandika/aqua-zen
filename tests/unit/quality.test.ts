import { applyReducedEffects, QUALITY_LEVELS, QUALITY_PRESETS, stepQuality } from "@/config/quality"
import { profileDevice, recommendQuality, type DeviceSignals } from "@/lib/device"

const desktop: DeviceSignals = {
	userAgent:
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
	maxTouchPoints: 0,
	deviceMemory: 16,
	hardwareConcurrency: 12,
	devicePixelRatio: 1,
	screenWidth: 1920,
	screenHeight: 1080,
	gpuRenderer: "ANGLE (NVIDIA GeForce RTX 4070)",
}

describe("quality levels", () => {
	it("are ordered from cheapest to richest", () => {
		const presets = QUALITY_LEVELS.map((level) => QUALITY_PRESETS[level])
		for (let i = 1; i < presets.length; i++) {
			expect(presets[i]!.fishDensity).toBeGreaterThanOrEqual(presets[i - 1]!.fishDensity)
			expect(presets[i]!.suspendedParticles).toBeGreaterThan(presets[i - 1]!.suspendedParticles)
			expect(presets[i]!.plantDensity).toBeGreaterThanOrEqual(presets[i - 1]!.plantDensity)
			expect(presets[i]!.dpr[1]).toBeGreaterThanOrEqual(presets[i - 1]!.dpr[1])
		}
		expect(QUALITY_PRESETS.low.shadows).toBe(false)
		expect(QUALITY_PRESETS.low.postProcessing.bloom).toBe(false)
	})

	it("steps within bounds", () => {
		expect(stepQuality("low", -1)).toBe("low")
		expect(stepQuality("low", 1)).toBe("medium")
		expect(stepQuality("ultra", 1)).toBe("ultra")
		expect(stepQuality("high", -1)).toBe("medium")
	})

	it("reduced effects removes costly extras but keeps the aquarium", () => {
		const reduced = applyReducedEffects(QUALITY_PRESETS.ultra)
		expect(reduced.lightShafts).toBe(false)
		expect(reduced.postProcessing.bloom).toBe(false)
		expect(reduced.suspendedParticles).toBeLessThan(QUALITY_PRESETS.ultra.suspendedParticles)
		expect(reduced.fishDensity).toBe(QUALITY_PRESETS.ultra.fishDensity)
	})
})

describe("device detection", () => {
	it("recommends high quality for a capable desktop", () => {
		expect(recommendQuality(profileDevice(desktop))).toBe("high")
	})

	it("recommends low quality for software rendering", () => {
		expect(recommendQuality(profileDevice({ ...desktop, gpuRenderer: "Google SwiftShader" }))).toBe(
			"low",
		)
	})

	it("is conservative on low-memory devices", () => {
		expect(recommendQuality(profileDevice({ ...desktop, deviceMemory: 2 }))).toBe("low")
	})

	it("recognises phones and tablets", () => {
		const phone = profileDevice({
			...desktop,
			userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148",
			maxTouchPoints: 5,
			deviceMemory: undefined,
			devicePixelRatio: 3,
			screenWidth: 390,
			screenHeight: 844,
			gpuRenderer: "Apple GPU",
		})
		expect(phone.isMobile).toBe(true)
		expect(recommendQuality(phone)).toBe("low")

		const ipad = profileDevice({
			...desktop,
			userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605",
			maxTouchPoints: 5,
		})
		expect(ipad.isTablet).toBe(true)
		expect(recommendQuality(ipad)).toBe("medium")
	})
})
