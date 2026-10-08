import { Vector3 } from "three"
import {
	DRIFTWOOD,
	PLANT_GROUPS,
	ROCKS,
	type PlantGroupDefinition,
	type RockDefinition,
} from "@/config/scape"
import { TANK_INTERIOR } from "@/config/tank"
import { clamp } from "../core/math"
import { createRandom, randomRange } from "../core/random"
import { substrateHeight } from "./substrate"

export interface EllipsoidObstacle {
	kind: "ellipsoid"
	center: Vector3
	radii: Vector3
	/** Hard obstacles are avoided firmly; soft ones (plants) only discourage passage. */
	soft: boolean
}

export interface CapsuleObstacle {
	kind: "capsule"
	a: Vector3
	b: Vector3
	radius: number
	soft: boolean
}

export interface CylinderObstacle {
	kind: "cylinder"
	center: Vector3
	radius: number
	top: number
	soft: boolean
}

export type Obstacle = EllipsoidObstacle | CapsuleObstacle | CylinderObstacle

export type RestSpotKind = "bottom" | "leaf" | "cover" | "midwater"

export interface RestSpot {
	position: Vector3
	kind: RestSpotKind
}

/** A surface a fish may approach to inspect or graze. */
export interface InterestPoint {
	position: Vector3
	normal: Vector3
}

export interface ScapeLayout {
	obstacles: Obstacle[]
	coverSpots: Vector3[]
	restSpots: RestSpot[]
	interestPoints: InterestPoint[]
}

/** Fraction of each rock's height buried in the substrate. */
export const ROCK_BURY_FRACTION = 0.14

export function rockCenter(rock: RockDefinition): Vector3 {
	const [x, z] = rock.position
	const baseY = substrateHeight(x, z)
	return new Vector3(x, baseY + rock.size[1] * (0.5 - ROCK_BURY_FRACTION), z)
}

function rockObstacle(rock: RockDefinition): EllipsoidObstacle {
	return {
		kind: "ellipsoid",
		center: rockCenter(rock),
		radii: new Vector3(rock.size[0] * 0.5, rock.size[1] * 0.5, rock.size[2] * 0.5),
		soft: false,
	}
}

function woodObstacles(): CapsuleObstacle[] {
	const capsules: CapsuleObstacle[] = []
	for (const wood of DRIFTWOOD) {
		for (const branch of wood.branches) {
			const segments = branch.points.length - 1
			for (let i = 0; i < segments; i++) {
				const t = (i + 0.5) / segments
				const a = branch.points[i]
				const b = branch.points[i + 1]
				if (!a || !b) continue
				capsules.push({
					kind: "capsule",
					a: new Vector3(...a),
					b: new Vector3(...b),
					radius: branch.radiusStart + (branch.radiusEnd - branch.radiusStart) * t,
					soft: false,
				})
			}
		}
	}
	return capsules
}

function plantObstacle(group: PlantGroupDefinition): CylinderObstacle | null {
	if (group.kind === "hairgrass") return null
	const [x, z] = group.center
	return {
		kind: "cylinder",
		center: new Vector3(x, substrateHeight(x, z), z),
		radius: Math.max(group.radius[0], group.radius[1]) * (group.kind === "rosette" ? 1.4 : 0.9),
		top: substrateHeight(x, z) + group.height[1] * (group.kind === "vallisneria" ? 0.75 : 0.9),
		soft: true,
	}
}

export function createScapeLayout(seed = 1): ScapeLayout {
	const random = createRandom(seed)
	const obstacles: Obstacle[] = []
	const coverSpots: Vector3[] = []
	const restSpots: RestSpot[] = []
	const interestPoints: InterestPoint[] = []

	for (const rock of ROCKS) {
		const obstacle = rockObstacle(rock)
		obstacles.push(obstacle)
		// Sample the visible, upper-front surface for grazing and inspection.
		for (let i = 0; i < 4; i++) {
			const theta = randomRange(random, -Math.PI * 0.45, Math.PI * 0.45)
			const phi = randomRange(random, 0.15, 1.1)
			const normal = new Vector3(
				Math.sin(theta) * Math.cos(phi),
				Math.sin(phi),
				Math.cos(theta) * Math.cos(phi),
			).normalize()
			const position = new Vector3(
				obstacle.center.x + normal.x * obstacle.radii.x,
				obstacle.center.y + normal.y * obstacle.radii.y,
				obstacle.center.z + normal.z * obstacle.radii.z,
			)
			interestPoints.push({ position, normal })
		}
		// Sheltered sand next to larger stones.
		if (rock.size[1] > 0.09) {
			const side = random() < 0.5 ? -1 : 1
			const x = obstacle.center.x + side * (obstacle.radii.x + 0.03)
			const z = obstacle.center.z + obstacle.radii.z * 0.6
			restSpots.push({ position: new Vector3(x, substrateHeight(x, z) + 0.012, z), kind: "bottom" })
		}
	}

	for (const capsule of woodObstacles()) {
		obstacles.push(capsule)
		const mid = capsule.a.clone().lerp(capsule.b, 0.5)
		interestPoints.push({
			position: mid.clone().add(new Vector3(0, capsule.radius, 0)),
			normal: new Vector3(0, 1, 0),
		})
		// Space beneath low branches makes good cover.
		const groundY = substrateHeight(mid.x, mid.z)
		if (mid.y - groundY > 0.05) {
			coverSpots.push(new Vector3(mid.x, (mid.y + groundY) / 2, mid.z + 0.02))
		}
	}

	for (const group of PLANT_GROUPS) {
		const obstacle = plantObstacle(group)
		if (obstacle) obstacles.push(obstacle)
		if (!group.cover) continue
		const [x, z] = group.center
		const ground = substrateHeight(x, z)
		for (let i = 0; i < 3; i++) {
			const px = x + randomRange(random, -group.radius[0], group.radius[0]) * 0.7
			const pz = clamp(
				z + randomRange(random, -group.radius[1], group.radius[1]),
				TANK_INTERIOR.minZ + 0.03,
				TANK_INTERIOR.maxZ - 0.03,
			)
			const py = ground + randomRange(random, 0.25, 0.6) * group.height[0]
			coverSpots.push(new Vector3(px, py, pz + 0.03))
		}
		if (group.kind === "rosette") {
			// The top of broad leaves is where bettas like to lounge.
			restSpots.push({
				position: new Vector3(x, ground + group.height[1] * 0.8, z + 0.02),
				kind: "leaf",
			})
			interestPoints.push({
				position: new Vector3(x, ground + group.height[1] * 0.6, z + 0.04),
				normal: new Vector3(0, 0.3, 1).normalize(),
			})
		} else {
			restSpots.push({
				position: new Vector3(x, ground + group.height[0] * 0.5, z + 0.04),
				kind: "cover",
			})
		}
	}

	// Open sand along the foreground for bottom dwellers.
	for (let i = 0; i < 6; i++) {
		const x = randomRange(random, TANK_INTERIOR.minX + 0.1, TANK_INTERIOR.maxX - 0.1)
		const z = randomRange(random, 0.05, TANK_INTERIOR.maxZ - 0.05)
		restSpots.push({ position: new Vector3(x, substrateHeight(x, z) + 0.01, z), kind: "bottom" })
	}
	// Quiet midwater hovering spots near the back.
	for (let i = 0; i < 6; i++) {
		const x = randomRange(random, TANK_INTERIOR.minX + 0.12, TANK_INTERIOR.maxX - 0.12)
		const z = randomRange(random, TANK_INTERIOR.minZ + 0.08, -0.05)
		restSpots.push({
			position: new Vector3(x, randomRange(random, 0.2, 0.38), z),
			kind: "midwater",
		})
	}

	return { obstacles, coverSpots, restSpots, interestPoints }
}

const scratch = new Vector3()
const scratchB = new Vector3()

/**
 * Approximate signed distance from `point` to the obstacle surface.
 * Writes the outward surface normal into `outNormal`.
 */
export function obstacleDistance(obstacle: Obstacle, point: Vector3, outNormal: Vector3): number {
	switch (obstacle.kind) {
		case "ellipsoid": {
			scratch.subVectors(point, obstacle.center)
			scratch.set(
				scratch.x / obstacle.radii.x,
				scratch.y / obstacle.radii.y,
				scratch.z / obstacle.radii.z,
			)
			const scaledLength = scratch.length()
			const minRadius = Math.min(obstacle.radii.x, obstacle.radii.y, obstacle.radii.z)
			// Gradient of the implicit ellipsoid gives the outward normal.
			outNormal.set(
				scratch.x / obstacle.radii.x,
				scratch.y / obstacle.radii.y,
				scratch.z / obstacle.radii.z,
			)
			if (outNormal.lengthSq() < 1e-10) outNormal.set(0, 1, 0)
			outNormal.normalize()
			return (scaledLength - 1) * minRadius
		}
		case "capsule": {
			scratch.subVectors(obstacle.b, obstacle.a)
			const lengthSq = scratch.lengthSq()
			const t =
				lengthSq > 0
					? clamp(scratchB.subVectors(point, obstacle.a).dot(scratch) / lengthSq, 0, 1)
					: 0
			scratchB.copy(obstacle.a).addScaledVector(scratch, t)
			outNormal.subVectors(point, scratchB)
			const distance = outNormal.length()
			if (distance < 1e-6) outNormal.set(0, 1, 0)
			else outNormal.divideScalar(distance)
			return distance - obstacle.radius
		}
		case "cylinder": {
			const dx = point.x - obstacle.center.x
			const dz = point.z - obstacle.center.z
			const radial = Math.sqrt(dx * dx + dz * dz)
			const above = point.y - obstacle.top
			if (above > 0 && radial < obstacle.radius) {
				outNormal.set(0, 1, 0)
				return above
			}
			if (radial < 1e-6) outNormal.set(1, 0, 0)
			else outNormal.set(dx / radial, 0, dz / radial)
			const side = radial - obstacle.radius
			return above > 0 ? Math.hypot(Math.max(side, 0), above) : side
		}
	}
}
