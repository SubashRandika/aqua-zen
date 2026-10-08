import { Vector3, type Vector3Like } from "three"
import { FRONT_GLASS_Z } from "@/config/tank"

export type StimulusKind = "tap" | "touch" | "hover"

export interface GlassStimulus {
	id: number
	kind: StimulusKind
	/** Point on the inside of the front glass. */
	position: Vector3
	startedAt: number
	/** 0..1 */
	strength: number
	active: boolean
}

export const GLASS_INTERACTION = {
	/** Radius around a tap within which fish notice it. */
	tapRadius: 0.42,
	/** How long a tap remains interesting to curious fish. */
	tapInterestDuration: 7,
	touchRadius: 0.5,
	hoverRadius: 0.3,
	/** Curious fish stop this far from the glass. */
	standoffDistance: 0.045,
} as const

/**
 * Tracks what is happening at the front glass: taps (transient), touches
 * (persistent while held) and hover (desktop pointer). Fish read these when
 * deciding whether to investigate or keep their distance.
 */
export class GlassStimuli {
	readonly stimuli: GlassStimulus[] = []
	private nextId = 1

	private toGlass(point: Vector3Like): Vector3 {
		// Stimuli live just inside the glass regardless of where the ray hit.
		return new Vector3(point.x, point.y, FRONT_GLASS_Z - 0.004)
	}

	addTap(point: Vector3Like, strength: number, time: number): GlassStimulus {
		const stimulus: GlassStimulus = {
			id: this.nextId++,
			kind: "tap",
			position: this.toGlass(point),
			startedAt: time,
			strength,
			active: true,
		}
		this.stimuli.push(stimulus)
		return stimulus
	}

	startTouch(point: Vector3Like, time: number): GlassStimulus {
		this.endTouch()
		const stimulus: GlassStimulus = {
			id: this.nextId++,
			kind: "touch",
			position: this.toGlass(point),
			startedAt: time,
			strength: 0.6,
			active: true,
		}
		this.stimuli.push(stimulus)
		return stimulus
	}

	moveTouch(point: Vector3Like): void {
		const touch = this.current("touch")
		if (touch) touch.position.copy(this.toGlass(point))
	}

	endTouch(): void {
		const touch = this.current("touch")
		if (touch) touch.active = false
	}

	setHover(point: Vector3Like | null, time: number): void {
		const hover = this.current("hover")
		if (!point) {
			if (hover) hover.active = false
			return
		}
		if (hover) {
			hover.position.copy(this.toGlass(point))
			return
		}
		this.stimuli.push({
			id: this.nextId++,
			kind: "hover",
			position: this.toGlass(point),
			startedAt: time,
			strength: 0.25,
			active: true,
		})
	}

	current(kind: StimulusKind): GlassStimulus | undefined {
		for (let i = this.stimuli.length - 1; i >= 0; i--) {
			const stimulus = this.stimuli[i]!
			if (stimulus.kind === kind && stimulus.active) return stimulus
		}
		return undefined
	}

	update(time: number): void {
		for (const stimulus of this.stimuli) {
			if (
				stimulus.kind === "tap" &&
				time - stimulus.startedAt > GLASS_INTERACTION.tapInterestDuration
			) {
				stimulus.active = false
			}
		}
		for (let i = this.stimuli.length - 1; i >= 0; i--) {
			if (!this.stimuli[i]!.active) this.stimuli.splice(i, 1)
		}
	}

	/** The most attractive active stimulus for a fish at `position`, with its pull in 0..1. */
	strongestNear(position: Vector3, time: number): { stimulus: GlassStimulus; pull: number } | null {
		let best: GlassStimulus | null = null
		let bestPull = 0
		for (const stimulus of this.stimuli) {
			if (!stimulus.active) continue
			const radius =
				stimulus.kind === "touch"
					? GLASS_INTERACTION.touchRadius
					: stimulus.kind === "hover"
						? GLASS_INTERACTION.hoverRadius
						: GLASS_INTERACTION.tapRadius
			const distance = position.distanceTo(stimulus.position)
			if (distance > radius) continue
			let pull = (1 - distance / radius) * stimulus.strength
			if (stimulus.kind === "tap") {
				// Interest in a tap builds after the initial fright, then fades.
				const age = time - stimulus.startedAt
				pull *= Math.min(1, age / 1.5) * (1 - age / GLASS_INTERACTION.tapInterestDuration)
			}
			if (pull > bestPull) {
				bestPull = pull
				best = stimulus
			}
		}
		return best ? { stimulus: best, pull: bestPull } : null
	}
}
