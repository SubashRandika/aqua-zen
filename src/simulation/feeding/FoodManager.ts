import { Vector3 } from "three"
import { TANK_INTERIOR } from "@/config/tank"
import { clamp } from "../core/math"
import { randomRange, type RandomSource } from "../core/random"
import { sampleFlow } from "../environment/flow"
import { substrateHeight } from "../environment/substrate"

export type FoodPhase = "floating" | "sinking" | "settled"

/**
 * Flakes float, soak and flutter down; sinking pellets drop quickly to the
 * bottom feeders; crumbs are the scraps torn from a flake when it is bitten.
 */
export type FoodKind = "flake" | "pellet" | "crumb"

export interface FoodParticle {
	id: number
	kind: FoodKind
	position: Vector3
	velocity: Vector3
	phase: FoodPhase
	age: number
	/** Seconds the food stays on the surface before it soaks through. */
	floatTime: number
	/** Seconds since settling on the substrate. */
	settledAge: number
	terminalVelocity: number
	/** 0 dry → 1 soaked. Wet food darkens. */
	wetness: number
	/** Falling-leaf swing: phase, rate (rad/s), horizontal speed and direction. */
	swingPhase: number
	swingRate: number
	swingSpeed: number
	swingHeading: number
	/** Current tilt of a sinking flake, in radians, towards `swingHeading`. */
	tilt: number
	/** Fixed orientation about the vertical, and tumbling for pellets. */
	yaw: number
	spin: number
	/** Remaining food, 0..1. Fish take bites until it is gone. */
	amount: number
	/** Number of fish currently heading for this particle. */
	claims: number
	/** Visual size multiplier. */
	size: number
	/** Which flake outline and colour it uses. */
	variant: number
	/** 0..1, used to fade the particle out at the end of its life. */
	opacity: number
}

export const FEEDING = {
	/** Minimum seconds between feedings — prevents flooding the tank. */
	cooldown: 1.4,
	maxParticles: 90,
	flakesPerFeeding: { min: 6, max: 9 },
	/** A few sinking granules in every pinch, so the bottom feeders get their share. */
	pelletsPerFeeding: { min: 2, max: 4 },
	spreadRadius: 0.035,
	settledLifetime: 50,
	maxLifetime: 150,
	fadeDuration: 3,
	/** Amount of food removed by a single bite. */
	biteSize: 0.35,
	/** Chance that a bite tears loose crumbs from a flake. */
	crumbChance: 0.55,
	/** Floating flakes drift together on the surface film (the "Cheerios effect"). */
	surfaceAttraction: { range: 0.03, speed: 0.004 },
	/** Number of flake outlines and colours to choose from. */
	variants: 8,
} as const

export type FoodZone = "surface" | "midwater" | "bottom"

const flowScratch = new Vector3()
const pull = new Vector3()

export class FoodManager {
	readonly particles: FoodParticle[] = []
	private nextId = 1
	private lastReleaseTime = Number.NEGATIVE_INFINITY

	constructor(private readonly random: RandomSource) {}

	canRelease(time: number): boolean {
		return (
			time - this.lastReleaseTime >= FEEDING.cooldown &&
			this.particles.length < FEEDING.maxParticles
		)
	}

	/**
	 * Sprinkles a pinch of flakes, with a few sinking pellets, onto the water
	 * surface around (x, z). Returns the particles created (empty during cooldown).
	 */
	release(x: number, z: number, time: number): FoodParticle[] {
		if (!this.canRelease(time)) return []
		this.lastReleaseTime = time
		const r = this.random
		const flakes = Math.round(
			randomRange(r, FEEDING.flakesPerFeeding.min, FEEDING.flakesPerFeeding.max),
		)
		const pellets = Math.round(
			randomRange(r, FEEDING.pelletsPerFeeding.min, FEEDING.pelletsPerFeeding.max),
		)
		const cx = clamp(x, TANK_INTERIOR.minX + 0.05, TANK_INTERIOR.maxX - 0.05)
		const cz = clamp(z, TANK_INTERIOR.minZ + 0.05, TANK_INTERIOR.maxZ - 0.05)
		const created: FoodParticle[] = []
		for (let i = 0; i < flakes + pellets; i++) {
			if (this.particles.length >= FEEDING.maxParticles) break
			const angle = r() * Math.PI * 2
			const radius = Math.sqrt(r()) * FEEDING.spreadRadius
			const kind: FoodKind = i < flakes ? "flake" : "pellet"
			const particle = this.create(
				kind,
				new Vector3(
					cx + Math.cos(angle) * radius,
					TANK_INTERIOR.surfaceY - 0.001,
					cz + Math.sin(angle) * radius,
				),
			)
			// Scattered by the fingers that dropped them.
			particle.velocity.set(Math.cos(angle) * 0.012, 0, Math.sin(angle) * 0.012)
			created.push(particle)
		}
		return created
	}

	private create(kind: FoodKind, position: Vector3): FoodParticle {
		const r = this.random
		const pellet = kind === "pellet"
		const crumb = kind === "crumb"
		const particle: FoodParticle = {
			id: this.nextId++,
			kind,
			position,
			velocity: new Vector3(),
			phase: crumb ? "sinking" : "floating",
			age: 0,
			// Pellets break the surface almost at once; flakes float until they soak through.
			floatTime: pellet ? randomRange(r, 0.15, 0.8) : randomRange(r, 1.5, 6),
			settledAge: 0,
			terminalVelocity: pellet
				? randomRange(r, 0.035, 0.055)
				: crumb
					? randomRange(r, 0.006, 0.012)
					: randomRange(r, 0.009, 0.018),
			wetness: crumb ? 1 : 0,
			swingPhase: r() * Math.PI * 2,
			swingRate: pellet ? randomRange(r, 4, 7) : randomRange(r, 2.2, 3.6),
			swingSpeed: pellet ? 0.002 : crumb ? 0.006 : randomRange(r, 0.008, 0.015),
			swingHeading: r() * Math.PI * 2,
			tilt: 0,
			yaw: r() * Math.PI * 2,
			spin: r() * Math.PI * 2,
			amount: crumb ? 0.3 : 1,
			claims: 0,
			size: crumb ? randomRange(r, 0.3, 0.45) : randomRange(r, 0.75, 1.25),
			variant: Math.floor(r() * FEEDING.variants),
			opacity: 1,
		}
		this.particles.push(particle)
		return particle
	}

	update(dt: number, time: number): void {
		this.gatherOnSurface(dt)
		for (const particle of this.particles) {
			particle.age += dt
			particle.claims = 0
			if (particle.phase !== "settled") this.moveParticle(particle, dt, time)
			else particle.settledAge += dt

			const remaining = Math.min(
				FEEDING.maxLifetime - particle.age,
				particle.phase === "settled"
					? FEEDING.settledLifetime - particle.settledAge
					: Number.POSITIVE_INFINITY,
			)
			particle.opacity =
				clamp(remaining / FEEDING.fadeDuration, 0, 1) * clamp(particle.amount * 1.5, 0, 1)
		}
		this.removeWhere((p) => p.amount <= 0 || p.opacity <= 0)
	}

	/** Flakes floating close together are drawn into little rafts by surface tension. */
	private gatherOnSurface(dt: number): void {
		const { range, speed } = FEEDING.surfaceAttraction
		for (const a of this.particles) {
			if (a.phase !== "floating" || a.kind !== "flake") continue
			pull.set(0, 0, 0)
			for (const b of this.particles) {
				if (b === a || b.phase !== "floating" || b.kind !== "flake") continue
				const dx = b.position.x - a.position.x
				const dz = b.position.z - a.position.z
				const distance = Math.hypot(dx, dz)
				// Attract within range, but don't stack flakes on top of each other.
				if (distance > range || distance < 0.004) continue
				const strength = 1 - distance / range
				pull.x += (dx / distance) * strength
				pull.z += (dz / distance) * strength
			}
			const length = pull.length()
			if (length > 1e-6) a.position.addScaledVector(pull, (speed * dt) / Math.max(length, 1))
		}
	}

	private moveParticle(particle: FoodParticle, dt: number, time: number): void {
		sampleFlow(particle.position, time, flowScratch)
		if (particle.phase === "floating") {
			// Surface tension holds the food flat on the water while it drifts with the current.
			particle.velocity.lerp(flowScratch.setY(0), 1 - Math.exp(-2 * dt))
			particle.wetness = clamp(particle.age / particle.floatTime, 0, 1) * 0.6
			if (particle.age >= particle.floatTime) particle.phase = "sinking"
		} else {
			particle.wetness = Math.min(1, particle.wetness + dt * 0.08)
			// Falling leaf: the flake swings from side to side, tipping its leading
			// edge down mid-swing and levelling out (and slowing) as it turns back.
			particle.swingPhase += dt * particle.swingRate
			particle.swingHeading += dt * 0.25 * Math.sin(particle.swingPhase * 0.31 + particle.id)
			const swing = Math.cos(particle.swingPhase)
			const along = particle.swingSpeed * swing
			const targetX = flowScratch.x + Math.cos(particle.swingHeading) * along
			const targetZ = flowScratch.z + Math.sin(particle.swingHeading) * along
			const fall =
				particle.kind === "pellet"
					? particle.terminalVelocity
					: particle.terminalVelocity * (0.55 + 0.9 * swing * swing)
			const response = 1 - Math.exp(-4 * dt)
			particle.velocity.x += (targetX - particle.velocity.x) * response
			particle.velocity.z += (targetZ - particle.velocity.z) * response
			particle.velocity.y += (-fall + flowScratch.y * 0.3 - particle.velocity.y) * response
			particle.tilt = particle.kind === "pellet" ? 0 : 0.7 * swing
			// Pellets tumble as they drop.
			if (particle.kind === "pellet") particle.spin += dt * particle.swingRate
		}
		particle.position.addScaledVector(particle.velocity, dt)
		particle.position.x = clamp(
			particle.position.x,
			TANK_INTERIOR.minX + 0.005,
			TANK_INTERIOR.maxX - 0.005,
		)
		particle.position.z = clamp(
			particle.position.z,
			TANK_INTERIOR.minZ + 0.005,
			TANK_INTERIOR.maxZ - 0.005,
		)
		particle.position.y = Math.min(particle.position.y, TANK_INTERIOR.surfaceY - 0.001)

		const ground = substrateHeight(particle.position.x, particle.position.z) + 0.002
		if (particle.position.y <= ground) {
			particle.position.y = ground
			particle.velocity.set(0, 0, 0)
			particle.tilt = 0
			particle.phase = "settled"
		}
	}

	/**
	 * Removes up to `amount` of food from a particle and returns how much was
	 * eaten. Biting a flake sometimes tears crumbs loose, which drift down.
	 */
	consume(id: number, amount: number = FEEDING.biteSize): number {
		const particle = this.particles.find((p) => p.id === id)
		if (!particle || particle.amount <= 0) return 0
		const eaten = Math.min(particle.amount, amount)
		particle.amount -= eaten
		if (
			particle.kind === "flake" &&
			particle.phase !== "settled" &&
			this.random() < FEEDING.crumbChance
		) {
			const crumbs = 1 + Math.floor(this.random() * 2)
			for (let i = 0; i < crumbs && this.particles.length < FEEDING.maxParticles; i++) {
				const crumb = this.create("crumb", particle.position.clone())
				const angle = this.random() * Math.PI * 2
				crumb.velocity.set(Math.cos(angle) * 0.02, -0.004, Math.sin(angle) * 0.02)
				crumb.variant = particle.variant
				crumb.position.y = Math.min(crumb.position.y, TANK_INTERIOR.surfaceY - 0.004)
			}
		}
		return eaten
	}

	get(id: number): FoodParticle | undefined {
		return this.particles.find((p) => p.id === id)
	}

	zoneOf(particle: FoodParticle): FoodZone {
		if (particle.phase === "settled") return "bottom"
		if (particle.position.y > TANK_INTERIOR.surfaceY - 0.05) return "surface"
		if (particle.position.y < substrateHeight(particle.position.x, particle.position.z) + 0.05)
			return "bottom"
		return "midwater"
	}

	clear(): void {
		this.particles.length = 0
	}

	private removeWhere(predicate: (particle: FoodParticle) => boolean): void {
		let write = 0
		for (let read = 0; read < this.particles.length; read++) {
			const particle = this.particles[read]!
			if (!predicate(particle)) this.particles[write++] = particle
		}
		this.particles.length = write
	}
}
