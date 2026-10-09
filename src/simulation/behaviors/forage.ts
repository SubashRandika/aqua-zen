import { Vector3 } from "three"
import { clamp, lerp } from "../core/math"
import { pick, randomRange } from "../core/random"
import { obstacleDistance } from "../environment/scapeLayout"
import type { ClingSurface, FishAgent } from "../fish/FishAgent"
import { arriveSpeedFactor, seek } from "../steering/steering"
import type { BehaviorContext } from "./context"

/**
 * Foraging between meals. Goldfish, koi and corydoras pick over the
 * substrate nose-down in little darts; a pleco holds on to glass, stone or
 * wood with its sucker mouth and grazes the algae film in slow shuffles.
 */

const tmp = new Vector3()
const tmp2 = new Vector3()
const normal = new Vector3()

/** How quickly a grazer settles its belly onto a surface, in m/s. */
const SETTLE_SPEED = 0.06

function settle(current: number, target: number, dt: number): number {
	return current + clamp(target - current, -SETTLE_SPEED * dt, SETTLE_SPEED * dt)
}

/** Glass the pleco may graze, weighted towards the front where it can be seen. */
const GLASS_WEIGHTS = { front: 0.45, back: 0.25, left: 0.15, right: 0.15 } as const

export function forageStyle(agent: FishAgent): "peck" | "cling" | null {
	return agent.species.feeding.forage?.style ?? null
}

/** Outward normal of the substrate at (x, z), from its slope. */
export function substrateNormal(ctx: BehaviorContext, x: number, z: number, out: Vector3): Vector3 {
	const e = 0.01
	const dx = ctx.floorAt(x + e, z) - ctx.floorAt(x - e, z)
	const dz = ctx.floorAt(x, z + e) - ctx.floorAt(x, z - e)
	return out.set(-dx / (2 * e), 1, -dz / (2 * e)).normalize()
}

/** Distance the belly sits from a surface the fish is lying on. */
export function bellyOffset(agent: FishAgent): number {
	const bottom = Math.max(...agent.species.visual.shape.profile.map((p) => p.bottom))
	return agent.bodyLength * bottom * 0.9
}

function chooseGlassSpot(agent: FishAgent, ctx: BehaviorContext): ClingSurface {
	const b = ctx.bounds
	const r = ctx.random()
	const { front, back, left } = GLASS_WEIGHTS
	const pane =
		r < front ? "front" : r < front + back ? "back" : r < front + back + left ? "left" : "right"
	const margin = agent.bodyLength * 0.7
	const x = randomRange(ctx.random, b.minX + margin, b.maxX - margin)
	const z = randomRange(ctx.random, b.minZ + margin, b.maxZ - margin)
	const floor = ctx.floorAt(pane === "left" ? b.minX : pane === "right" ? b.maxX : x, z)
	const y = randomRange(ctx.random, floor + 0.04, ctx.surfaceY - 0.06)
	const surface: ClingSurface = { kind: "glass", normal: new Vector3(), obstacle: -1 }
	switch (pane) {
		case "front":
			surface.normal.set(0, 0, -1)
			agent.focusPoint.set(x, y, b.maxZ)
			break
		case "back":
			surface.normal.set(0, 0, 1)
			agent.focusPoint.set(x, y, b.minZ)
			break
		case "left":
			surface.normal.set(1, 0, 0)
			agent.focusPoint.set(b.minX, y, z)
			break
		case "right":
			surface.normal.set(-1, 0, 0)
			agent.focusPoint.set(b.maxX, y, z)
			break
	}
	return surface
}

/** A spot on the visible upper face of a stone or branch, from the scape's grazing points. */
function chooseScenerySpot(agent: FishAgent, ctx: BehaviorContext): ClingSurface | null {
	const point = pick(ctx.random, ctx.scape.interestPoints)
	if (!point) return null
	const index = ctx.scape.obstacles.findIndex(
		(o) => !o.soft && Math.abs(obstacleDistance(o, point.position, normal)) < 0.012,
	)
	if (index < 0) return null
	agent.focusPoint.copy(point.position)
	return { kind: "obstacle", normal: point.normal.clone(), obstacle: index }
}

function chooseSubstrateSpot(agent: FishAgent, ctx: BehaviorContext, reach: number): void {
	const b = ctx.bounds
	for (let attempt = 0; attempt < 6; attempt++) {
		// Somewhere ahead, rather than behind the fish.
		const angle = Math.atan2(agent.heading.z, agent.heading.x) + randomRange(ctx.random, -1.2, 1.2)
		const distance = randomRange(ctx.random, reach * 0.3, reach)
		const x = clamp(agent.position.x + Math.cos(angle) * distance, b.minX + 0.05, b.maxX - 0.05)
		const z = clamp(agent.position.z + Math.sin(angle) * distance, b.minZ + 0.04, b.maxZ - 0.04)
		agent.focusPoint.set(x, ctx.floorAt(x, z), z)
		const clear = ctx.scape.obstacles.every(
			(o) => o.soft || obstacleDistance(o, agent.focusPoint, normal) > agent.radius * 1.5,
		)
		if (clear) return
	}
}

/**
 * Picks where to forage and sets the approach target. Returns the surface a
 * clinging grazer will hold on to, or null for fish that peck at the bottom.
 */
export function chooseForageSpot(agent: FishAgent, ctx: BehaviorContext): ClingSurface | null {
	if (forageStyle(agent) !== "cling") {
		chooseSubstrateSpot(agent, ctx, 0.25)
		agent.target.copy(agent.focusPoint)
		agent.target.y += agent.bodyLength * 0.28
		return null
	}
	const r = ctx.random()
	let surface: ClingSurface | null = null
	if (r < 0.55) surface = chooseGlassSpot(agent, ctx)
	else if (r < 0.85) surface = chooseScenerySpot(agent, ctx)
	if (!surface) {
		chooseSubstrateSpot(agent, ctx, 0.35)
		surface = {
			kind: "substrate",
			normal: substrateNormal(ctx, agent.focusPoint.x, agent.focusPoint.z, new Vector3()),
			obstacle: -1,
		}
	}
	agent.target.copy(agent.focusPoint).addScaledVector(surface.normal, bellyOffset(agent) + 0.004)
	return surface
}

/**
 * Keeps a clinging fish on its surface after it has moved, and updates the
 * surface normal on curved stone and wood.
 */
export function holdOnToSurface(agent: FishAgent, ctx: BehaviorContext): void {
	const surface = agent.cling
	if (!surface) return
	const offset = bellyOffset(agent)
	const b = ctx.bounds
	const p = agent.position
	const dt = ctx.dt
	switch (surface.kind) {
		case "glass": {
			const n = surface.normal
			if (n.z < -0.5) p.z = settle(p.z, b.maxZ - offset, dt)
			else if (n.z > 0.5) p.z = settle(p.z, b.minZ + offset, dt)
			else if (n.x > 0.5) p.x = settle(p.x, b.minX + offset, dt)
			else p.x = settle(p.x, b.maxX - offset, dt)
			const floor = ctx.floorAt(p.x, p.z)
			p.y = clamp(p.y, floor + agent.bodyLength * 0.4, ctx.surfaceY - agent.bodyLength * 0.4)
			p.x = clamp(p.x, b.minX + offset, b.maxX - offset)
			p.z = clamp(p.z, b.minZ + offset, b.maxZ - offset)
			break
		}
		case "substrate":
			p.x = clamp(p.x, b.minX + agent.radius, b.maxX - agent.radius)
			p.z = clamp(p.z, b.minZ + agent.radius, b.maxZ - agent.radius)
			p.y = settle(p.y, ctx.floorAt(p.x, p.z) + offset, dt)
			substrateNormal(ctx, p.x, p.z, surface.normal)
			break
		case "obstacle": {
			const obstacle = ctx.scape.obstacles[surface.obstacle]
			if (!obstacle) return
			const distance = obstacleDistance(obstacle, p, normal)
			p.addScaledVector(normal, settle(0, offset - distance, dt))
			surface.normal.copy(normal)
			break
		}
	}
}

/** Steering while foraging. Returns the target speed. */
export function steerForaging(agent: FishAgent, ctx: BehaviorContext, desire: Vector3): number {
	const movement = agent.species.movement
	const distance = agent.position.distanceTo(agent.target)

	if (agent.cling) {
		// Grazing: slow shuffles across the surface with pauses, never straying off it.
		const n = agent.cling.normal
		const shuffle = ctx.noise(agent.seed + 300, ctx.time * 0.35, 1.5)
		desire.addScaledVector(agent.heading, 0.6)
		tmp.set(
			ctx.noise(agent.seed + 310, ctx.time * 0.12, 2.5),
			ctx.noise(agent.seed + 320, ctx.time * 0.12, 4.5),
			ctx.noise(agent.seed + 330, ctx.time * 0.12, 6.5),
		)
		desire.addScaledVector(tmp, 0.8)
		// Drift back towards the chosen patch if it wanders too far.
		tmp2.subVectors(agent.focusPoint, agent.position)
		desire.addScaledVector(tmp2, clamp(tmp2.length() / 0.15, 0, 1) * 0.8)
		if (agent.cling.kind === "glass") {
			// Stay below the waterline and above the substrate.
			const floor = ctx.floorAt(agent.position.x, agent.position.z)
			if (agent.position.y > ctx.surfaceY - 0.06) desire.y -= 1
			if (agent.position.y < floor + 0.05) desire.y += 1
		}
		desire.addScaledVector(n, -desire.dot(n))
		return Math.max(0, shuffle - 0.1) * movement.cruiseSpeed * 0.35
	}

	desire.addScaledVector(seek(agent.position, agent.target, tmp), 1.6)
	if (forageStyle(agent) === "cling") {
		// Swimming to the patch, then settling onto it.
		if (distance < agent.bodyLength * 0.5) {
			agent.arrived = true
			agent.cling = agent.forageSurface
		}
		return movement.cruiseSpeed * 1.4 * arriveSpeedFactor(distance, 0.12, 0.25)
	}

	// Pecking: nose down to the substrate, a nibble, then shuffle on a little.
	if (!agent.arrived) {
		if (distance < agent.bodyLength * 0.4) agent.arrived = true
		return movement.cruiseSpeed * 0.7 * arriveSpeedFactor(distance, 0.1, 0.25)
	}
	tmp2.copy(agent.heading).setY(0)
	if (tmp2.lengthSq() < 1e-6) tmp2.set(1, 0, 0)
	tmp2.normalize()
	tmp.copy(agent.position).addScaledVector(tmp2, agent.bodyLength * 0.5)
	tmp.y = ctx.floorAt(tmp.x, tmp.z)
	desire.addScaledVector(seek(agent.position, tmp, tmp), 1.4)
	if (ctx.time - agent.lastBiteAt > randomRange(ctx.random, 0.6, 1.8)) {
		agent.lastBiteAt = ctx.time
		agent.snap(ctx.random)
		// Every few nibbles, move on to the next patch.
		if (ctx.random() < 0.25) {
			chooseSubstrateSpot(agent, ctx, 0.1)
			agent.target.copy(agent.focusPoint)
			agent.target.y += agent.bodyLength * 0.28
			agent.arrived = false
		}
	}
	return lerp(movement.minSpeed * 0.3, movement.minSpeed, 0.5)
}
