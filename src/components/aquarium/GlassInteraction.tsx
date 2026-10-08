"use client"

import type { ThreeEvent } from "@react-three/fiber"
import { useEffect, useMemo, useRef } from "react"
import { Plane, Vector3, type Vector4 } from "three"
import { TANK, TANK_INTERIOR } from "@/config/tank"
import { clamp } from "@/simulation/core/math"
import { useSessionStore } from "@/store/sessionStore"
import { useSettingsStore } from "@/store/settingsStore"
import { createGlassRippleMaterial, MAX_RIPPLES } from "@/three/effects/glassEffects"
import { useWorld } from "./WorldContext"

/** A press held longer than this, without much movement, becomes a touch on the glass. */
const HOLD_DELAY_MS = 320
/** Pointer travel (px) beyond which a press is a drag rather than a tap. */
const TAP_SLOP_PX = 8
const HOVER_INTERVAL_MS = 100

const surfacePlane = new Plane(new Vector3(0, 1, 0), -TANK.waterLevel)
const feedPoint = new Vector3()

interface PressState {
	pointerId: number
	startTime: number
	startX: number
	startY: number
	holding: boolean
	timer: number | null
	point: Vector3
}

/**
 * The front glass as an interaction surface. Taps knock on the glass,
 * press-and-hold rests a finger on it (and dragging moves it), hovering
 * lets curious fish follow the pointer, and in feeding mode a tap drops
 * food at the water surface above the touched point.
 */
export function GlassInteraction() {
	const world = useWorld()
	const material = useMemo(() => createGlassRippleMaterial(), [])
	const press = useRef<PressState | null>(null)
	const lastHover = useRef(0)
	const nextRipple = useRef(0)

	useEffect(() => () => material.dispose(), [material])

	const addRipple = (point: Vector3, strength: number) => {
		const ripples = material.uniforms.uRipples!.value as Vector4[]
		ripples[nextRipple.current % MAX_RIPPLES]!.set(point.x, point.y, world.elapsed, strength)
		nextRipple.current++
	}

	const setTouch = (point: Vector3 | null) => {
		const touch = material.uniforms.uTouch!.value as Vector4
		if (point) touch.set(point.x, point.y, 1, world.elapsed)
		else touch.z = 0
	}

	const releaseFood = (event: ThreeEvent<PointerEvent>) => {
		const hit = event.ray.intersectPlane(surfacePlane, feedPoint)
		const insideX = hit && hit.x > TANK_INTERIOR.minX && hit.x < TANK_INTERIOR.maxX
		const insideZ = hit && hit.z > TANK_INTERIOR.minZ && hit.z < TANK_INTERIOR.maxZ
		if (!hit || !insideX || !insideZ) {
			// Looking up from below the surface: drop food above the touched point, just behind the glass.
			feedPoint.set(
				clamp(event.point.x, TANK_INTERIOR.minX + 0.05, TANK_INTERIOR.maxX - 0.05),
				TANK.waterLevel,
				TANK_INTERIOR.maxZ - 0.12,
			)
		}
		const released = world.feed(feedPoint)
		if (released > 0) {
			const session = useSessionStore.getState()
			session.announce("Food released")
			// Each feeding keeps the mode armed a little longer.
			session.armFeeding()
		}
	}

	const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
		const explore = useSettingsStore.getState().camera.mode === "explore"
		const state: PressState = {
			pointerId: event.pointerId,
			startTime: performance.now(),
			startX: event.clientX,
			startY: event.clientY,
			holding: false,
			timer: null,
			point: event.point.clone(),
		}
		// In explore mode a drag orbits the camera, so only taps are glass interactions.
		if (!explore && !useSessionStore.getState().feedArmed) {
			state.timer = window.setTimeout(() => {
				const current = press.current
				if (!current || current.pointerId !== state.pointerId) return
				current.holding = true
				setTouch(current.point)
				addRipple(current.point, 0.5)
				world.events.emit({ type: "glass:hold", phase: "start", point: current.point })
			}, HOLD_DELAY_MS)
		}
		press.current = state
	}

	const endPress = (event: ThreeEvent<PointerEvent> | null) => {
		const state = press.current
		if (!state) return
		if (state.timer !== null) window.clearTimeout(state.timer)
		press.current = null
		if (state.holding) {
			setTouch(null)
			world.events.emit({ type: "glass:hold", phase: "end", point: state.point })
			return
		}
		if (!event) return
		const travel = Math.hypot(event.clientX - state.startX, event.clientY - state.startY)
		if (travel > TAP_SLOP_PX) return
		if (useSessionStore.getState().feedArmed) {
			releaseFood(event)
			addRipple(event.point, 0.25)
			return
		}
		const quickness = clamp(1 - (performance.now() - state.startTime) / 600, 0.4, 1)
		addRipple(event.point, quickness)
		world.events.emit({ type: "glass:tap", point: event.point, strength: quickness })
	}

	const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
		const state = press.current
		if (state) {
			state.point.copy(event.point)
			if (state.holding) {
				setTouch(state.point)
				world.events.emit({ type: "glass:hold", phase: "move", point: state.point })
			} else if (
				state.timer !== null &&
				Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > TAP_SLOP_PX
			) {
				// A quick drag across the glass also counts as a touch.
				window.clearTimeout(state.timer)
				state.timer = null
				state.holding = true
				setTouch(state.point)
				world.events.emit({ type: "glass:hold", phase: "start", point: state.point })
			}
			return
		}
		if (event.pointerType !== "mouse") return
		const now = performance.now()
		if (now - lastHover.current < HOVER_INTERVAL_MS) return
		lastHover.current = now
		world.events.emit({ type: "glass:hover", point: event.point })
	}

	const onPointerLeave = () => {
		world.events.emit({ type: "glass:hover", point: null })
		if (press.current?.holding) endPress(null)
	}

	return (
		<mesh
			position={[0, TANK.height / 2, TANK.depth / 2 + 0.0012]}
			material={material}
			renderOrder={14}
			onPointerDown={onPointerDown}
			onPointerUp={endPress}
			onPointerMove={onPointerMove}
			onPointerLeave={onPointerLeave}
			onPointerCancel={() => endPress(null)}
		>
			<planeGeometry args={[TANK.width, TANK.height]} />
		</mesh>
	)
}
