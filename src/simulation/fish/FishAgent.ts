import { Vector3 } from "three"
import { clamp, damp, lerp, moveTowards, TAU, wrapAngle } from "../core/math"
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

/** A surface a clinging grazer is holding on to. */
export interface ClingSurface {
	kind: "glass" | "substrate" | "obstacle"
	/** Outward normal, into the water. */
	normal: Vector3
	/** For `obstacle`: index into the scape's obstacles. */
	obstacle: number
}

const WORLD_UP = new Vector3(0, 1, 0)
const WORLD_X = new Vector3(1, 0, 0)
const axis = new Vector3()
const scratch = new Vector3()
const desiredSpin = new Vector3()

/**
 * One autonomous fish. Holds physical state (position, heading, speed),
 * internal drives (hunger, stamina, fear), the current behaviour state and
 * the animation parameters the renderer reads each frame.
 *
 * Fish cannot strafe: all steering acts by rotating the heading, and
 * propulsion acts along it. The rotation has momentum (a turn builds up
 * and eases off rather than switching on and off) and most of it comes
 * from the tail, so burst-and-glide swimmers turn as they kick, not while
 * they coast.
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
	/** Colour variety among the species' varieties (koi kohaku, sanke, showa…). */
	readonly variety: number

	readonly position = new Vector3()
	readonly heading = new Vector3(1, 0, 0)
	readonly velocity = new Vector3()
	/** The fish's back. World up, except for a grazer clinging to glass or stone. */
	readonly up = new Vector3(0, 1, 0)
	/** The surface this fish is clinging to, or null while it swims free. */
	cling: ClingSurface | null = null
	/** The surface a grazer has chosen and is swimming towards. */
	forageSurface: ClingSurface | null = null
	/**
	 * How close the body may come to glass and stone. It shrinks to the
	 * belly while clinging and eases back out afterwards, so letting go
	 * never makes the fish jump.
	 */
	wallMargin: number
	/** Angular velocity of the heading (axis × rad/s). */
	readonly spin = new Vector3()
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
	/** The yaw rate the fish is reaching for; the body bends ahead of the turn. */
	intendedYawRate = 0
	pitch = 0
	finFlare = 0
	colorIntensity = 1
	private bendImpulse = 0
	private turnBend = 0
	snapTimer = 0

	/**
	 * How much of the fish is drawn (0..1). A fish joining the tank fades in
	 * as it leaves cover; one taken out swims into cover and fades away.
	 */
	presence = 1
	/** Set when the owner takes this fish out of the tank. */
	leaving = false

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
		this.variety = Math.floor(random() * (species.visual.pattern.varieties ?? 1))
		this.bodyLength =
			species.scale * (1 + randomRange(random, -species.sizeVariation, species.sizeVariation))
		const shape = species.visual.shape
		const maxHeight = Math.max(...shape.profile.map((p) => p.top + p.bottom))
		this.radius = this.bodyLength * Math.max(0.18, maxHeight * 0.5)
		this.wallMargin = this.radius
		this.hunger = randomRange(random, 0.3, 0.75)
		this.tailPhase = random() * TAU
		this.finPhase = random() * TAU
		this.approachSide = randomRange(random, -1, 1)
	}

	get maxPitch(): number {
		// Bottom foragers tip nose-down to pick at the substrate.
		if (this.state === "foraging" && this.species.feeding.forage?.style === "peck")
			return Math.max(this.species.movement.maxPitch, 0.85)
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
		if (state !== "foraging") {
			this.cling = null
			this.forageSurface = null
		}
		if (state === "startled") {
			// C-start: the body snaps into a C before the escape stroke.
			this.bendImpulse = Math.sign(this.yawRate || 1) * 0.9
			this.thrustTimer = 0.25
		}
		this.nextDecisionAt = Math.max(this.nextDecisionAt, time + Math.min(duration, 1))
	}

	/** Called on a successful bite: a quick dart forward with a flick of the body. */
	snap(random: RandomSource): void {
		this.snapTimer = 0.2
		this.bendImpulse = (random() - 0.5) * 0.3
	}

	/**
	 * Turns towards the desired direction and adjusts speed.
	 * @param desire summed steering desire (direction × urgency)
	 * @param urgency 0..1+ — scales how hard the fish turns
	 */
	integrate(desire: Vector3, urgency: number, dt: number, random: RandomSource): void {
		if (this.cling) {
			this.crawl(desire, dt)
			return
		}
		const previousYaw = Math.atan2(this.heading.z, this.heading.x)
		const startled = this.state === "startled"
		const capacity = this.turnCapacity() * (startled ? 3 : 1)
		let turnDemand = 0

		// 1. How fast the fish wants to be turning, and about which axis.
		desiredSpin.set(0, 0, 0)
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
			turnDemand = angle
			if (angle > 1e-5) {
				axis.crossVectors(this.heading, scratch)
				if (axis.lengthSq() < 1e-12) axis.set(0, 1, 0)
				axis.normalize()
				desiredSpin.copy(axis).multiplyScalar(Math.min(capacity, angle * (2.6 + urgency * 2)))
			}
		}

		// 2. Turning has momentum: the spin builds up and eases off at a limited rate.
		const angularAcceleration = capacity * (startled ? 30 : 4 + urgency * 2.5)
		scratch.subVectors(desiredSpin, this.spin)
		const change = scratch.length()
		const maxChange = angularAcceleration * dt
		if (change > maxChange) scratch.multiplyScalar(maxChange / change)
		this.spin.add(scratch)
		// Only rotation that actually swings the heading counts.
		this.spin.addScaledVector(this.heading, -this.spin.dot(this.heading))
		const rate = this.spin.length()
		if (rate > 1e-6) {
			axis.copy(this.spin).divideScalar(rate)
			this.heading.applyAxisAngle(axis, rate * dt).normalize()
		}
		// Spin about +y turns the heading from +x towards -z, the opposite sense to yaw below.
		this.intendedYawRate = damp(this.intendedYawRate, -desiredSpin.y, 12, dt)

		// 3. Propulsion. A big change of direction calls for a stroke of the tail.
		this.updatePropulsion(dt, random, turnDemand)
		this.velocity.copy(this.heading).multiplyScalar(this.speed)

		// 4. Animation state derived from the motion.
		const yaw = Math.atan2(this.heading.z, this.heading.x)
		const instantYawRate = dt > 0 ? wrapAngle(yaw - previousYaw) / dt : 0
		this.yawRate = damp(this.yawRate, instantYawRate, 14, dt)
		this.pitch = Math.asin(clamp(this.heading.y, -1, 1))
		this.updateAnimation(dt)
	}

	/**
	 * Movement while clinging to a surface: the heading stays in the surface
	 * plane and turns slowly about its normal, and the fish shuffles along.
	 */
	private crawl(desire: Vector3, dt: number): void {
		const n = this.cling!.normal
		// Settle the heading into the surface plane gradually, not in one jump.
		const out = clamp(this.heading.dot(n), -1, 1)
		axis.crossVectors(this.heading, n)
		if (axis.lengthSq() < 1e-8) {
			// Facing straight at the surface: pick any direction along it.
			this.heading.crossVectors(n, Math.abs(n.y) < 0.9 ? WORLD_UP : WORLD_X).normalize()
		} else if (Math.abs(out) > 1e-4) {
			axis.normalize()
			const settle = Math.min(Math.abs(Math.asin(out)), 2.5 * dt)
			this.heading.applyAxisAngle(axis, -Math.sign(out) * settle).normalize()
		}
		scratch.copy(desire).addScaledVector(n, -desire.dot(n))
		let desiredRate = 0
		if (scratch.lengthSq() > 1e-8) {
			scratch.normalize()
			const angle = this.heading.angleTo(scratch)
			const sign = Math.sign(axis.crossVectors(this.heading, scratch).dot(n)) || 1
			desiredRate = sign * Math.min(this.species.movement.turnRate * 0.35, angle * 1.5)
		}
		const current = this.spin.dot(n)
		const rate = moveTowards(current, desiredRate, this.species.movement.turnRate * dt)
		this.spin.copy(n).multiplyScalar(rate)
		this.heading.applyAxisAngle(n, rate * dt).normalize()

		const movement = this.species.movement
		this.speed = moveTowards(this.speed, this.targetSpeed, movement.acceleration * 0.5 * dt)
		this.thrust = damp(this.thrust, 0.1, 4, dt)
		this.velocity.copy(this.heading).multiplyScalar(this.speed)
		this.yawRate = damp(this.yawRate, rate, 6, dt)
		this.intendedYawRate = 0
		this.pitch = 0
		this.updateAnimation(dt)
	}

	/**
	 * How fast this fish can swing its heading right now, in rad/s. Agility
	 * peaks around cruising speed; a hovering fish only pivots slowly on its
	 * pectoral fins, and a burst-and-glide swimmer turns mostly while it kicks.
	 */
	private turnCapacity(): number {
		const movement = this.species.movement
		const speedRatio = this.speed / Math.max(movement.cruiseSpeed, 1e-3)
		let capacity = movement.turnRate * clamp(0.32 + speedRatio * 0.68, 0.32, 1.5)
		if (movement.swimStyle !== "continuous") capacity *= lerp(0.4, 1.15, this.thrust)
		return capacity
	}

	private updatePropulsion(dt: number, random: RandomSource, turnDemand: number): void {
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

		// Bottom dwellers hop when pottering about but swim steadily to get somewhere.
		const travelling = style === "bottomHop" && target > movement.cruiseSpeed * 1.1
		if (style === "continuous" || travelling || target <= movement.minSpeed * 1.1) {
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
			// A sharp change of direction is made with a kick, even mid-glide.
			const turnKick = turnDemand > 0.7 && this.kickTimer < interval.max * 0.6 && target > 0
			if ((this.kickTimer <= 0 && this.speed < threshold + 1e-4) || turnKick) {
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
		// Turning is done with the tail too: a turning fish sweeps it wider.
		const turning = clamp(Math.abs(this.yawRate) / Math.max(movement.turnRate, 1e-3), 0, 1)
		const amplitudeTarget =
			tail.amplitude *
			((resting ? 0.12 : 0.18 + 0.82 * this.thrust) + turning * 0.35) *
			(this.snapTimer > 0 ? 1.4 : 1)
		this.tailAmplitude = damp(this.tailAmplitude, amplitudeTarget, 6, dt)

		// Pectoral fins scull faster when hovering, as real fish do to hold position.
		const hover = 1 - clamp(this.speed / Math.max(movement.cruiseSpeed, 1e-3), 0, 1)
		const finFrequency = 1.2 + hover * 2.4 + this.thrust * 0.8
		this.finPhase = (this.finPhase + TAU * finFrequency * dt) % (TAU * 1000)

		this.bendImpulse = damp(this.bendImpulse, 0, 9, dt)
		// The body curves into a turn slightly before the heading follows, and
		// a slow fish bends more for the same rate of turn (a tighter circle).
		const slow = 1 + 0.6 * hover
		const bendTarget = (this.yawRate * 0.65 + this.intendedYawRate * 0.35) * 0.15 * slow
		this.turnBend = damp(this.turnBend, clamp(bendTarget, -0.5, 0.5), 9, dt)
		this.bend = clamp(this.turnBend + this.bendImpulse, -1, 1)
		this.roll = damp(this.roll, clamp(-this.yawRate * 0.04, -0.18, 0.18), 3, dt)

		const flareTarget =
			this.state === "territorial" ||
			(this.state === "curious" && this.personality.territoriality > 0.5)
				? 1
				: 0
		this.finFlare = damp(this.finFlare, flareTarget, 3, dt)
	}
}
