import { Vector3 } from "three"
import {
	alignment,
	arriveSpeedFactor,
	avoidSurface,
	cohesion,
	containment,
	flee,
	seek,
	separation,
	wander,
	type Bounds,
} from "@/simulation/steering/steering"

const bounds: Bounds = { minX: -1, maxX: 1, minY: 0, maxY: 1, minZ: -1, maxZ: 1 }

describe("steering", () => {
	it("seek points at the target with unit urgency", () => {
		const out = seek(new Vector3(0, 0, 0), new Vector3(3, 0, 4), new Vector3())
		expect(out.length()).toBeCloseTo(1)
		expect(out.x).toBeCloseTo(0.6)
		expect(out.z).toBeCloseTo(0.8)
	})

	it("flee is zero outside its radius and stronger when closer", () => {
		const threat = new Vector3(0, 0, 0)
		expect(flee(new Vector3(2, 0, 0), threat, 1, new Vector3()).length()).toBe(0)
		const near = flee(new Vector3(0.2, 0, 0), threat, 1, new Vector3())
		const far = flee(new Vector3(0.8, 0, 0), threat, 1, new Vector3())
		expect(near.x).toBeGreaterThan(far.x)
		expect(near.x).toBeGreaterThan(0)
	})

	it("arrive slows smoothly and monotonically towards the target", () => {
		const samples = [0, 0.02, 0.05, 0.08, 0.1, 0.2].map((d) => arriveSpeedFactor(d, 0.1, 0.1))
		for (let i = 1; i < samples.length; i++)
			expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]!)
		expect(samples[0]).toBeCloseTo(0.1)
		expect(samples.at(-1)).toBe(1)
	})

	it("separation pushes away from close neighbours only", () => {
		const out = separation(
			new Vector3(0, 0, 0),
			[
				{ position: new Vector3(0.01, 0, 0), radius: 0 },
				{ position: new Vector3(5, 0, 0), radius: 0 },
			],
			0.05,
			new Vector3(),
		)
		expect(out.x).toBeLessThan(0)
		expect(out.y).toBe(0)
	})

	it("alignment steers towards the average neighbour heading", () => {
		const out = alignment(
			new Vector3(1, 0, 0),
			[new Vector3(0, 0, 1), new Vector3(0, 0, 1)],
			new Vector3(),
		)
		expect(out.z).toBeGreaterThan(0)
		expect(out.x).toBeLessThan(0)
	})

	it("cohesion ignores neighbours that are already comfortably close", () => {
		const close = cohesion(new Vector3(), [new Vector3(0.01, 0, 0)], 0.1, new Vector3())
		const far = cohesion(new Vector3(), [new Vector3(0.5, 0, 0)], 0.1, new Vector3())
		expect(close.length()).toBe(0)
		expect(far.x).toBeGreaterThan(0)
	})

	it("containment is zero in open water and pushes inward near walls", () => {
		const centre = containment(
			new Vector3(0, 0.5, 0),
			new Vector3(1, 0, 0),
			0.1,
			bounds,
			0.2,
			new Vector3(),
		)
		expect(centre.length()).toBe(0)
		const nearWall = containment(
			new Vector3(0.9, 0.5, 0),
			new Vector3(1, 0, 0),
			0.1,
			bounds,
			0.2,
			new Vector3(),
		)
		expect(nearWall.x).toBeLessThan(0)
	})

	it("surface avoidance pushes out along the normal and slides along the surface", () => {
		const normal = new Vector3(0, 0, 1)
		const out = avoidSurface(
			new Vector3(0.6, 0, -0.8).normalize(),
			0.01,
			normal,
			0.1,
			new Vector3(),
		)
		expect(out.z).toBeGreaterThan(0)
		expect(out.x).toBeGreaterThan(0)
		expect(avoidSurface(new Vector3(1, 0, 0), 0.5, normal, 0.1, new Vector3()).length()).toBe(0)
	})

	it("wander deflects the heading smoothly within the given amount", () => {
		const heading = new Vector3(1, 0, 0)
		const out = wander(heading, 1, 0, 0.3, new Vector3())
		expect(out.length()).toBeCloseTo(1)
		expect(heading.angleTo(out)).toBeCloseTo(0.3, 1)
	})
})
