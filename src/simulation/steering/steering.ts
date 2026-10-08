import { Vector3 } from "three"
import { clamp, smoothstep } from "../core/math"

/**
 * Steering primitives. Each returns a *desired direction* (not necessarily
 * normalised) whose length expresses urgency. The fish agent sums weighted
 * desires and turns its heading towards the result at a limited rate — fish
 * cannot strafe, so steering always acts through the heading.
 *
 * All functions write into `out` and return it to avoid allocations in the
 * per-frame simulation loop.
 */

const temp = new Vector3()

/** Direction towards a target, with unit urgency. */
export function seek(position: Vector3, target: Vector3, out: Vector3): Vector3 {
	out.subVectors(target, position)
	const length = out.length()
	if (length > 1e-6) out.divideScalar(length)
	else out.set(0, 0, 0)
	return out
}

/** Direction away from a threat, with urgency fading to zero at `radius`. */
export function flee(position: Vector3, threat: Vector3, radius: number, out: Vector3): Vector3 {
	out.subVectors(position, threat)
	const distance = out.length()
	if (distance >= radius || distance < 1e-6) return out.set(0, 0, 0)
	const urgency = 1 - distance / radius
	return out.multiplyScalar(urgency / distance)
}

/**
 * Speed multiplier for arriving at a target: 1 outside `slowingRadius`,
 * easing towards `minFactor` at the target.
 */
export function arriveSpeedFactor(
	distance: number,
	slowingRadius: number,
	minFactor = 0.1,
): number {
	if (distance >= slowingRadius) return 1
	return clamp(minFactor + (1 - minFactor) * smoothstep(0, slowingRadius, distance), minFactor, 1)
}

/**
 * Smooth stochastic wander: the heading drifts according to slowly varying
 * noise rather than per-frame jitter, giving lazy, unpredictable curves.
 *
 * @param noiseYaw value in [-1, 1] sampled from smooth noise
 * @param noisePitch value in [-1, 1] sampled from smooth noise
 * @param amount maximum deflection from the current heading in radians
 */
export function wander(
	heading: Vector3,
	noiseYaw: number,
	noisePitch: number,
	amount: number,
	out: Vector3,
): Vector3 {
	const yaw = Math.atan2(heading.z, heading.x) + noiseYaw * amount
	const pitch = Math.asin(clamp(heading.y, -1, 1)) * 0.6 + noisePitch * amount * 0.35
	const cosPitch = Math.cos(pitch)
	return out.set(Math.cos(yaw) * cosPitch, Math.sin(pitch), Math.sin(yaw) * cosPitch)
}

/** Neighbour-aware separation; urgency grows as neighbours get closer than `distance`. */
export function separation(
	position: Vector3,
	neighbors: ReadonlyArray<{ position: Vector3; radius: number }>,
	distance: number,
	out: Vector3,
): Vector3 {
	out.set(0, 0, 0)
	for (const neighbor of neighbors) {
		temp.subVectors(position, neighbor.position)
		const d = temp.length()
		const limit = distance + neighbor.radius
		if (d < 1e-6 || d >= limit) continue
		const strength = 1 - d / limit
		out.addScaledVector(temp, (strength * strength) / d)
	}
	return out
}

/** Match the average heading of neighbours. */
export function alignment(
	heading: Vector3,
	neighborHeadings: readonly Vector3[],
	out: Vector3,
): Vector3 {
	out.set(0, 0, 0)
	if (neighborHeadings.length === 0) return out
	for (const h of neighborHeadings) out.add(h)
	out.divideScalar(neighborHeadings.length)
	return out.sub(heading)
}

/** Move towards the centre of neighbours, ignoring those already close enough. */
export function cohesion(
	position: Vector3,
	neighborPositions: readonly Vector3[],
	comfortableDistance: number,
	out: Vector3,
): Vector3 {
	out.set(0, 0, 0)
	if (neighborPositions.length === 0) return out
	for (const p of neighborPositions) out.add(p)
	out.divideScalar(neighborPositions.length).sub(position)
	const distance = out.length()
	if (distance < 1e-6) return out.set(0, 0, 0)
	const urgency = smoothstep(comfortableDistance * 0.5, comfortableDistance * 2, distance)
	return out.multiplyScalar(urgency / distance)
}

export interface Bounds {
	minX: number
	maxX: number
	minY: number
	maxY: number
	minZ: number
	maxZ: number
}

/**
 * Keeps a fish inside the tank by steering before it reaches a wall. Looks
 * ahead along the heading so the fish turns gracefully along walls rather
 * than bouncing off them.
 */
export function containment(
	position: Vector3,
	heading: Vector3,
	lookAhead: number,
	bounds: Bounds,
	margin: number,
	out: Vector3,
): Vector3 {
	out.set(0, 0, 0)
	temp.copy(position).addScaledVector(heading, lookAhead)
	const push = (value: number, min: number, max: number) => {
		let force = 0
		const toMin = value - min
		const toMax = max - value
		if (toMin < margin) force += (1 - Math.max(toMin, -margin) / margin) ** 2
		if (toMax < margin) force -= (1 - Math.max(toMax, -margin) / margin) ** 2
		return force
	}
	out.x =
		push(temp.x, bounds.minX, bounds.maxX) * 0.5 + push(position.x, bounds.minX, bounds.maxX) * 0.5
	out.y =
		push(temp.y, bounds.minY, bounds.maxY) * 0.5 + push(position.y, bounds.minY, bounds.maxY) * 0.5
	out.z =
		push(temp.z, bounds.minZ, bounds.maxZ) * 0.5 + push(position.z, bounds.minZ, bounds.maxZ) * 0.5
	return out
}

/**
 * Steering around an obstacle given the signed distance to its surface and
 * its outward normal: slide along the surface, pushing away more firmly the
 * closer the fish gets.
 */
export function avoidSurface(
	heading: Vector3,
	surfaceDistance: number,
	normal: Vector3,
	range: number,
	out: Vector3,
): Vector3 {
	out.set(0, 0, 0)
	if (surfaceDistance >= range) return out
	const proximity = 1 - Math.max(surfaceDistance, 0) / range
	const approaching = -heading.dot(normal)
	// Tangential component: the heading with the into-surface component removed.
	out.copy(heading).addScaledVector(normal, Math.max(approaching, 0))
	out.multiplyScalar(proximity * Math.max(approaching, 0) * 0.8)
	out.addScaledVector(normal, proximity * proximity * (1 + Math.max(approaching, 0)))
	return out
}
