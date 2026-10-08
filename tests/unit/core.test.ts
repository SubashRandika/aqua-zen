import { Vector3 } from "three"
import { TANK } from "@/config/tank"
import { CAMERA, defaultCameraPose } from "@/lib/cameraFraming"
import { EventBus } from "@/simulation/core/events"
import { damp, wrapAngle } from "@/simulation/core/math"
import { createNoise3D } from "@/simulation/core/noise"
import { createRandom, weightedIndex } from "@/simulation/core/random"
import { SpatialHash } from "@/simulation/core/spatialHash"

describe("event bus", () => {
	it("delivers events to subscribers until they unsubscribe", () => {
		const bus = new EventBus()
		const received: string[] = []
		const off = bus.on("light:changed", (event) => received.push(event.mode))
		bus.emit({ type: "light:changed", mode: "night" })
		bus.emit({ type: "time:phase", phase: "day" })
		off()
		bus.emit({ type: "light:changed", mode: "day" })
		expect(received).toEqual(["night"])
	})
})

describe("spatial hash", () => {
	it("finds exactly the items a brute-force search finds", () => {
		const random = createRandom(11)
		const items = Array.from({ length: 300 }, (_, id) => ({
			id,
			position: new Vector3(random() - 0.5, random() * 0.5, random() - 0.5),
		}))
		const hash = new SpatialHash<(typeof items)[number]>(0.1)
		hash.rebuild(items)
		const out: Array<(typeof items)[number]> = []
		for (let q = 0; q < 20; q++) {
			const point = items[q * 7]!.position
			const found = hash
				.query(point, 0.13, out)
				.map((i) => i.id)
				.sort((a, b) => a - b)
			const expected = items.filter((i) => i.position.distanceTo(point) <= 0.13).map((i) => i.id)
			expect(found).toEqual(expected)
		}
	})
})

describe("math and randomness", () => {
	it("damps towards a target independently of frame rate", () => {
		let fast = 0
		for (let i = 0; i < 120; i++) fast = damp(fast, 1, 2, 1 / 120)
		let slow = 0
		for (let i = 0; i < 30; i++) slow = damp(slow, 1, 2, 1 / 30)
		expect(fast).toBeCloseTo(slow, 6)
	})

	it("wraps angles", () => {
		expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI)
		expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2)
	})

	it("seeded randomness and noise are reproducible", () => {
		const a = createRandom(42)
		const b = createRandom(42)
		expect([a(), a(), a()]).toEqual([b(), b(), b()])
		const noise = createNoise3D(5)
		expect(noise(0.3, 1.2, 4.5)).toBe(createNoise3D(5)(0.3, 1.2, 4.5))
		expect(Math.abs(noise(0.3, 1.2, 4.5))).toBeLessThanOrEqual(1)
	})

	it("weighted choices respect their weights", () => {
		const random = createRandom(8)
		const counts = [0, 0, 0]
		for (let i = 0; i < 3000; i++) counts[weightedIndex(random, [1, 0, 3])]!++
		expect(counts[1]).toBe(0)
		expect(counts[2]!).toBeGreaterThan(counts[0]! * 2)
	})
})

describe("camera framing", () => {
	it("fits the whole tank on a landscape screen", () => {
		const aspect = 16 / 9
		const { position } = defaultCameraPose(aspect)
		const distance = position[2] - TANK.depth / 2
		const halfWidth = distance * Math.tan((CAMERA.fov * Math.PI) / 360) * aspect
		expect(halfWidth).toBeGreaterThanOrEqual((TANK.width / 2) * 0.97)
	})

	it("keeps the full height on a portrait phone and crops the sides", () => {
		const { position } = defaultCameraPose(9 / 19.5)
		const distance = position[2] - TANK.depth / 2
		const halfHeight = distance * Math.tan((CAMERA.fov * Math.PI) / 360)
		expect(halfHeight).toBeGreaterThanOrEqual(TANK.height / 2)
		expect(halfHeight * (9 / 19.5)).toBeLessThan(TANK.width / 2)
	})
})
