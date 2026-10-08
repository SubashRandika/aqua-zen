import { Vector3 } from "three"
import { TANK_INTERIOR } from "@/config/tank"
import { clamp } from "../core/math"
import { randomRange, type RandomSource } from "../core/random"
import { sampleFlow } from "../environment/flow"
import { substrateHeight } from "../environment/substrate"

export type FoodPhase = "floating" | "sinking" | "settled"

export interface FoodParticle {
	id: number
	position: Vector3
	velocity: Vector3
	phase: FoodPhase
	age: number
	/** Seconds the flake stays on the surface before it soaks through. */
	floatTime: number
	/** Seconds since settling on the substrate. */
	settledAge: number
	terminalVelocity: number
	flutterPhase: number
	flutterRate: number
	/** Remaining food, 0..1. Fish take bites until it is gone. */
	amount: number
	/** Number of fish currently heading for this particle. */
	claims: number
	/** Visual size multiplier. */
	size: number
	/** 0..1, used to fade the particle out at the end of its life. */
	opacity: number
	spin: number
}

export const FEEDING = {
	/** Minimum seconds between feedings — prevents flooding the tank. */
	cooldown: 1.4,
	maxParticles: 70,
	flakesPerFeeding: { min: 6, max: 10 },
	spreadRadius: 0.035,
	settledLifetime: 50,
	maxLifetime: 150,
	fadeDuration: 3,
	/** Amount of food removed by a single bite. */
	biteSize: 0.35,
} as const

export type FoodZone = "surface" | "midwater" | "bottom"

const flowScratch = new Vector3()

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
	 * Sprinkles flakes onto the water surface around (x, z).
	 * Returns the particles created (empty during cooldown).
	 */
	release(x: number, z: number, time: number): FoodParticle[] {
		if (!this.canRelease(time)) return []
		this.lastReleaseTime = time
		const count = Math.min(
			Math.round(
				randomRange(this.random, FEEDING.flakesPerFeeding.min, FEEDING.flakesPerFeeding.max),
			),
			FEEDING.maxParticles - this.particles.length,
		)
		const created: FoodParticle[] = []
		const cx = clamp(x, TANK_INTERIOR.minX + 0.05, TANK_INTERIOR.maxX - 0.05)
		const cz = clamp(z, TANK_INTERIOR.minZ + 0.05, TANK_INTERIOR.maxZ - 0.05)
		for (let i = 0; i < count; i++) {
			const angle = this.random() * Math.PI * 2
			const radius = Math.sqrt(this.random()) * FEEDING.spreadRadius
			const particle: FoodParticle = {
				id: this.nextId++,
				position: new Vector3(
					cx + Math.cos(angle) * radius,
					TANK_INTERIOR.surfaceY - 0.001,
					cz + Math.sin(angle) * radius,
				),
				velocity: new Vector3(Math.cos(angle) * 0.01, 0, Math.sin(angle) * 0.01),
				phase: "floating",
				age: 0,
				floatTime: randomRange(this.random, 0.6, 4.5),
				settledAge: 0,
				terminalVelocity: randomRange(this.random, 0.009, 0.02),
				flutterPhase: this.random() * Math.PI * 2,
				flutterRate: randomRange(this.random, 1.5, 3.5),
				amount: 1,
				claims: 0,
				size: randomRange(this.random, 0.7, 1.3),
				opacity: 1,
				spin: this.random() * Math.PI * 2,
			}
			this.particles.push(particle)
			created.push(particle)
		}
		return created
	}

	update(dt: number, time: number): void {
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

	private moveParticle(particle: FoodParticle, dt: number, time: number): void {
		sampleFlow(particle.position, time, flowScratch)
		if (particle.phase === "floating") {
			// Surface tension holds the flake while it drifts with the current.
			particle.velocity.lerp(flowScratch.setY(0), 1 - Math.exp(-2 * dt))
			if (particle.age >= particle.floatTime) particle.phase = "sinking"
		} else {
			// Flakes flutter as they sink, drifting with the water.
			const flutter = Math.sin(particle.age * particle.flutterRate + particle.flutterPhase) * 0.008
			const targetX = flowScratch.x + flutter
			const targetZ =
				flowScratch.z +
				Math.cos(particle.age * particle.flutterRate * 0.7 + particle.flutterPhase) * 0.005
			const response = 1 - Math.exp(-3 * dt)
			particle.velocity.x += (targetX - particle.velocity.x) * response
			particle.velocity.z += (targetZ - particle.velocity.z) * response
			particle.velocity.y +=
				(-particle.terminalVelocity + flowScratch.y * 0.3 - particle.velocity.y) * response
			particle.spin += dt * particle.flutterRate * 0.6
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
			particle.phase = "settled"
		}
	}

	/** Removes up to `amount` of food from a particle. Returns how much was eaten. */
	consume(id: number, amount: number = FEEDING.biteSize): number {
		const particle = this.particles.find((p) => p.id === id)
		if (!particle || particle.amount <= 0) return 0
		const eaten = Math.min(particle.amount, amount)
		particle.amount -= eaten
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
