import { Vector3 } from "three"
import { clamp, damp, moveTowards, TAU, wrapAngle } from "../core/math"
import { randomRange, type RandomSource } from "../core/random"
import type { FishPersonality, FishSpeciesDefinition, FishState } from "./types"

/** A reaction scheduled for the future — fish don't all react on the same frame. */
export interface PendingReaction {
	at: number
	kind: "startle" | "curious" | "avoid" | "flinch"
	point: Vector3
	/** Identifies the originating stimulus so alarms don't echo endlessly. */
	stimulusId: number
	strength: number
	sourceFishId?: number
}

const axis = new Vector3()
const scratch = new Vector3()

/**
 * One autonomous fish. Holds physical state (position, heading, speed),
 * internal drives (hunger, stamina, fear), the current behaviour state and
 * the animation parameters the renderer reads each frame.
 *
 * Fish cannot strafe: all steering acts by rotating the heading at a
 * species-limited turn rate, and propulsion acts along the heading. This is
 * what makes their paths look like swimming rather than drifting points.
 */
export class FishAgent {
	readonly id: number
	readonly species: FishSpeciesDefinition
	readonly personality: FishPersonality
	/** Total length in metres for this individual. */
	readonly bodyLength: number
	/** Approximate collision radius. */
	readonly radius: number
	readonly seed: number

	readonly position = new Vector3()
	readonly heading = new Vector3(1, 0, 0)
	readonly velocity = new Vector3()
	speed = 0
	targetSpeed = 0

	state: FishState = "wandering"
	stateTime = 0
	stateDuration = 5
	nextDecisionAt = 0
	readonly target = new Vector3()
	readonly threat = new Vector3()
	/** What a curious fish is looking at. */
	readonly focusPoint = new Vector3()
	targetFoodId = -1
	targetFishId = -1
	/** Glass stimulus a curious fish is investigating (-1 for scenery). */
	focusStimulusId = -1
	/** Lateral approach offset so feeding fish arrive from different sides. */
	approachSide = 0
	/** Set once a resting/curious/hiding fish has reached its spot. */
	arrived = false

	hunger: number
	stamina = 1
	fear = 0
	/** Time from which this fish may chase intruders again. */
	territorialCooldownUntil = 0
	territory: Vector3 | null = null
	territoryRadius = 0
	/** When this fish first noticed food (Infinity if it hasn't). */
	foodNoticedAt = Number.POSITIVE_INFINITY
	lastBiteAt = -10
	readonly pendingReactions: PendingReaction[] = []
	readonly handledStimuli = new Set<number>()

	// Propulsion
	private kickTimer = 0
	private thrustTimer = 0
	/** 0..1 how hard the fish is currently propelling itself. */
	thrust = 0

	// Animation outputs read by the renderer.
	tailPhase: number
	finPhase: number
	tailAmplitude = 0
	bend = 0
	roll = 0
	yawRate = 0
	pitch = 0
	finFlare = 0
	colorIntensity = 1
	private bendImpulse = 0
	private turnBend = 0
	snapTimer = 0

	/** Distance to the camera, used for level of detail. */
	cameraDistance = 1
	/** Seconds until neighbour perception is refreshed. */
	perceptionCountdown = 0

	constructor(
		id: number,
		species: FishSpeciesDefinition,
		personality: FishPersonality,
		random: RandomSource,
	) {
		this.id = id
		this.species = species
		this.personality = personality
		this.seed = random() * 1000
		this.bodyLength =
			species.scale * (1 + randomRange(random, -species.sizeVariation, species.sizeVariation))
		const shape = species.visual.shape
		const maxHeight = Math.max(...shape.profile.map((p) => p.top + p.bottom))
		this.radius = this.bodyLength * Math.max(0.18, maxHeight * 0.5)
		this.hunger = randomRange(random, 0.3, 0.75)
		this.tailPhase = random() * TAU
		this.finPhase = random() * TAU
		this.approachSide = randomRange(random, -1, 1)
	}

	get maxPitch(): number {
		return this.species.movement.maxPitch
	}

	setState(state: FishState, time: number, duration: number): void {
		this.state = state
		this.stateTime = 0
		this.stateDuration = duration
		this.arrived = false
		if (state !== "seekingFood" && state !== "feeding") this.targetFoodId = -1
		if (state !== "territorial" && state !== "avoiding") this.targetFishId = -1
		if (state !== "curious") this.focusStimulusId = -1
		if (state === "startled") {
			// C-start: the body snaps into a C before the escape stroke.
			this.bendImpulse = Math.sign(this.yawRate || 1) * 0.9
			this.thrustTimer = 0.25
		}
		this.nextDecisionAt = Math.max(this.nextDecisionAt, time + Math.min(duration, 1))
	}

	/** Keeps the heading within the species' pitch limit (fish rarely point straight up or down). */
	limitPitch(): void {
		const maxY = Math.sin(this.maxPitch)
		if (Math.abs(this.heading.y) <= maxY) return
		const horizontal = Math.hypot(this.heading.x, this.heading.z)
		if (horizontal < 1e-6) {
			// Degenerate: pick the last known yaw direction.
			const yaw = Math.atan2(this.velocity.z, this.velocity.x) || 0
			this.heading.set(Math.cos(yaw), 0, Math.sin(yaw))
		}
		const h = Math.hypot(this.heading.x, this.heading.z)
		const scale = Math.sqrt(1 - maxY * maxY) / h
		this.heading.set(
			this.heading.x * scale,
			Math.sign(this.heading.y) * maxY,
			this.heading.z * scale,
		)
	}

	/** Called on a successful bite: a quick dart forward with a flick of the body. */
	snap(random: RandomSource): void {
		this.snapTimer = 0.2
		this.bendImpulse = (random() - 0.5) * 0.3
	}

	/**
	 * Turns towards the desired direction and adjusts speed.
	 * @param desire summed steering desire (direction × urgency)
	 * @param urgency 0..1+ — scales turn responsiveness
	 */
	integrate(desire: Vector3, urgency: number, dt: number, random: RandomSource): void {
		const movement = this.species.movement
		const previousYaw = Math.atan2(this.heading.z, this.heading.x)

		// 1. Rotate the heading towards the desired direction at a limited rate.
		if (desire.lengthSq() > 1e-10) {
			scratch.copy(desire).normalize()
			// Fish rarely swim steeply up or down.
			const maxY = Math.sin(this.maxPitch)
			if (Math.abs(scratch.y) > maxY) {
				const horizontal = Math.sqrt(scratch.x * scratch.x + scratch.z * scratch.z)
				const scale = horizontal > 1e-6 ? Math.sqrt(1 - maxY * maxY) / horizontal : 0
				scratch
					.set(
						horizontal > 1e-6 ? scratch.x * scale : this.heading.x,
						Math.sign(scratch.y) * maxY,
						horizontal > 1e-6 ? scratch.z * scale : this.heading.z,
					)
					.normalize()
			}
			const angle = this.heading.angleTo(scratch)
			if (angle > 1e-5) {
				// Agility peaks around cruising speed; hovering fish pivot slowly with their fins.
				const speedRatio = this.speed / Math.max(movement.cruiseSpeed, 1e-3)
				const agility = movement.turnRate * clamp(0.45 + speedRatio * 0.55, 0.45, 1.6)
				const boost = this.state === "startled" ? 2.5 : 1
				const proportional = angle * (1 - Math.exp(-(2.2 + urgency * 3) * dt))
				const turn = Math.min(angle, agility * boost * dt, Math.max(proportional, 0.02 * dt))
				axis.crossVectors(this.heading, scratch)
				if (axis.lengthSq() < 1e-12) axis.set(0, 1, 0)
				axis.normalize()
				this.heading.applyAxisAngle(axis, turn).normalize()
			}
		}

		// 2. Propulsion.
		this.updatePropulsion(dt, random)
		this.velocity.copy(this.heading).multiplyScalar(this.speed)

		// 3. Animation state derived from the motion.
		const yaw = Math.atan2(this.heading.z, this.heading.x)
		const instantYawRate = dt > 0 ? wrapAngle(yaw - previousYaw) / dt : 0
		this.yawRate = damp(this.yawRate, instantYawRate, 10, dt)
		this.pitch = Math.asin(clamp(this.heading.y, -1, 1))
		this.updateAnimation(dt)
	}

	private updatePropulsion(dt: number, random: RandomSource): void {
		const movement = this.species.movement
		const target = this.targetSpeed
		const style = movement.swimStyle
		this.thrustTimer = Math.max(0, this.thrustTimer - dt)
		this.snapTimer = Math.max(0, this.snapTimer - dt)

		if (this.state === "startled" && this.thrustTimer > 0) {
			this.speed = moveTowards(this.speed, movement.burstSpeed, movement.acceleration * 6 * dt)
			this.thrust = 1
			return
		}
		if (this.snapTimer > 0) {
			this.speed = moveTowards(
				this.speed,
				Math.max(target, movement.cruiseSpeed * 1.4),
				movement.acceleration * 3 * dt,
			)
			this.thrust = 1
			return
		}

		if (style === "continuous" || target <= movement.minSpeed * 1.1) {
			const accel = movement.acceleration * (target > this.speed ? 1 : 1.4)
			const previous = this.speed
			this.speed = moveTowards(this.speed, target, accel * dt)
			const accelerating = this.speed > previous + 1e-6
			this.thrust = damp(
				this.thrust,
				accelerating ? 1 : clamp(this.speed / Math.max(movement.cruiseSpeed, 1e-3), 0.15, 1),
				8,
				dt,
			)
			return
		}

		// Burst-and-glide (and bottom hopping): short kicks, then coasting.
		this.kickTimer -= dt
		if (this.thrustTimer > 0) {
			this.speed = moveTowards(this.speed, target * 1.55, movement.acceleration * 2.2 * dt)
			this.thrust = damp(this.thrust, 1, 20, dt)
		} else {
			const drag = style === "bottomHop" ? 2.6 : 1.3
			this.speed *= Math.exp(-drag * dt)
			this.thrust = damp(this.thrust, 0, 6, dt)
			const threshold = target * (style === "bottomHop" ? 0.15 : 0.72)
			const interval = movement.kickInterval ?? { min: 0.4, max: 1 }
			if (this.kickTimer <= 0 && this.speed < threshold + 1e-4) {
				this.thrustTimer = randomRange(random, 0.1, 0.2)
				this.kickTimer = randomRange(random, interval.min, interval.max)
			}
		}
		this.speed = Math.max(this.speed, style === "bottomHop" ? 0 : movement.minSpeed * 0.5)
	}

	private updateAnimation(dt: number): void {
		const movement = this.species.movement
		const tail = movement.tailBeat
		const bodyLengthsPerSecond = this.speed / this.bodyLength
		const frequency =
			tail.baseFrequency * (0.35 + 0.65 * this.thrust) +
			tail.frequencyPerBodyLength * bodyLengthsPerSecond * (0.5 + 0.5 * this.thrust)
		this.tailPhase = (this.tailPhase + TAU * frequency * dt) % (TAU * 1000)

		const resting = this.state === "resting" && this.arrived
		const amplitudeTarget =
			tail.amplitude * (resting ? 0.12 : 0.18 + 0.82 * this.thrust) * (this.snapTimer > 0 ? 1.4 : 1)
		this.tailAmplitude = damp(this.tailAmplitude, amplitudeTarget, 6, dt)

		// Pectoral fins scull faster when hovering, as real fish do to hold position.
		const hover = 1 - clamp(this.speed / Math.max(movement.cruiseSpeed, 1e-3), 0, 1)
		const finFrequency = 1.2 + hover * 2.4 + this.thrust * 0.8
		this.finPhase = (this.finPhase + TAU * finFrequency * dt) % (TAU * 1000)

		this.bendImpulse = damp(this.bendImpulse, 0, 9, dt)
		this.turnBend = damp(this.turnBend, clamp(this.yawRate * 0.16, -0.45, 0.45), 8, dt)
		this.bend = clamp(this.turnBend + this.bendImpulse, -1, 1)
		this.roll = damp(this.roll, clamp(-this.yawRate * 0.06, -0.25, 0.25), 4, dt)

		const flareTarget =
			this.state === "territorial" ||
			(this.state === "curious" && this.personality.territoriality > 0.5)
				? 1
				: 0
		this.finFlare = damp(this.finFlare, flareTarget, 3, dt)
	}
}
