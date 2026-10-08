import type { Vector3Like } from "three"

export type LightMode = "auto" | "day" | "night"

export type DayPhase = "night" | "sunrise" | "morning" | "day" | "afternoon" | "sunset" | "evening"

export interface GlassTapEvent {
	type: "glass:tap"
	/** World-space point on the front glass. */
	point: Vector3Like
	/** 0..1, how firm the tap was (taps after long holds are softer). */
	strength: number
}

export interface GlassHoldEvent {
	type: "glass:hold"
	phase: "start" | "move" | "end"
	point: Vector3Like
}

export interface GlassHoverEvent {
	type: "glass:hover"
	/** `null` when the pointer leaves the glass. */
	point: Vector3Like | null
}

export interface FoodReleasedEvent {
	type: "food:released"
	position: Vector3Like
	count: number
}

export interface FoodConsumedEvent {
	type: "food:consumed"
	foodId: number
	fishId: number
}

export interface LightChangedEvent {
	type: "light:changed"
	mode: LightMode
}

export interface TimeChangedEvent {
	type: "time:phase"
	phase: DayPhase
}

export interface CameraInteractionEvent {
	type: "camera:interaction"
}

export interface FishStartledEvent {
	type: "fish:startled"
	fishId: number
	position: Vector3Like
}

export type AquariumEvent =
	| GlassTapEvent
	| GlassHoldEvent
	| GlassHoverEvent
	| FoodReleasedEvent
	| FoodConsumedEvent
	| LightChangedEvent
	| TimeChangedEvent
	| CameraInteractionEvent
	| FishStartledEvent

export type AquariumEventType = AquariumEvent["type"]

export type AquariumEventOf<T extends AquariumEventType> = Extract<AquariumEvent, { type: T }>

type Listener<T extends AquariumEventType> = (event: AquariumEventOf<T>) => void
type AnyListener = (event: AquariumEvent) => void

/**
 * A small typed event bus. Simulation systems, audio and UI subscribe to the
 * environmental events they care about instead of calling each other directly.
 */
export class EventBus {
	private readonly listeners = new Map<AquariumEventType, Set<AnyListener>>()

	on<T extends AquariumEventType>(type: T, listener: Listener<T>): () => void {
		let set = this.listeners.get(type)
		if (!set) {
			set = new Set()
			this.listeners.set(type, set)
		}
		set.add(listener as unknown as AnyListener)
		return () => this.off(type, listener)
	}

	off<T extends AquariumEventType>(type: T, listener: Listener<T>): void {
		this.listeners.get(type)?.delete(listener as unknown as AnyListener)
	}

	emit<T extends AquariumEventType>(event: AquariumEventOf<T>): void {
		const set = this.listeners.get(event.type)
		if (!set) return
		for (const listener of [...set]) listener(event)
	}

	clear(): void {
		this.listeners.clear()
	}
}
