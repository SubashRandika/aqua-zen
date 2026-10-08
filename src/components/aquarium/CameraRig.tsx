"use client"

import { OrbitControls } from "@react-three/drei"
import { useFrame, useThree } from "@react-three/fiber"
import gsap from "gsap"
import { useEffect, useRef } from "react"
import { Vector3 } from "three"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import { TANK, TANK_INTERIOR } from "@/config/tank"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import { defaultCameraPose } from "@/lib/cameraFraming"
import { damp } from "@/simulation/core/math"
import { useSessionStore } from "@/store/sessionStore"
import { useSettingsStore } from "@/store/settingsStore"
import { useWorld } from "./WorldContext"

const pose = { position: new Vector3(), target: new Vector3(), panRange: 0 }
const desiredPosition = new Vector3()
const desiredTarget = new Vector3()

/**
 * Cinematic camera. By default it is almost still — a viewer seated in
 * front of the tank, breathing gently, with slight parallax towards the
 * pointer. "Explore" hands control to the user (orbit, zoom, pan within
 * limits); "follow" quietly keeps one fish in view.
 */
export function CameraRig() {
	const world = useWorld()
	const camera = useThree((s) => s.camera)
	const size = useThree((s) => s.size)
	const controls = useRef<OrbitControlsImpl>(null)
	const mode = useSettingsStore((s) => s.camera.mode)
	const cinematic = useSettingsStore((s) => s.camera.cinematicMotion)
	const reducedMotion = useReducedMotion()
	const follow = useSessionStore((s) => s.follow)
	const resetToken = useSessionStore((s) => s.cameraResetToken)
	const current = useRef({
		position: new Vector3(),
		target: new Vector3(),
		initialised: false,
		tweening: false,
	})
	const pointer = useRef({ x: 0, y: 0 })

	// Recompute the default composition when the viewport changes.
	useEffect(() => {
		const { position, target, panRange } = defaultCameraPose(size.width / Math.max(size.height, 1))
		pose.position.set(...position)
		pose.target.set(...target)
		pose.panRange = panRange
		const state = current.current
		if (!state.initialised) {
			state.position.copy(pose.position)
			state.target.copy(pose.target)
			camera.position.copy(pose.position)
			camera.lookAt(pose.target)
			state.initialised = true
		}
	}, [camera, size.width, size.height])

	useEffect(() => {
		const onMove = (event: PointerEvent) => {
			pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1
			pointer.current.y = (event.clientY / window.innerHeight) * 2 - 1
		}
		window.addEventListener("pointermove", onMove, { passive: true })
		return () => window.removeEventListener("pointermove", onMove)
	}, [])

	// Return smoothly to the default view.
	useEffect(() => {
		if (resetToken === 0) return
		const state = current.current
		state.tweening = true
		const from = {
			px: camera.position.x,
			py: camera.position.y,
			pz: camera.position.z,
			tx: state.target.x,
			ty: state.target.y,
			tz: state.target.z,
		}
		const tween = gsap.to(from, {
			px: pose.position.x,
			py: pose.position.y,
			pz: pose.position.z,
			tx: pose.target.x,
			ty: pose.target.y,
			tz: pose.target.z,
			duration: reducedMotion ? 0.01 : 2.4,
			ease: "power2.inOut",
			onUpdate: () => {
				state.position.set(from.px, from.py, from.pz)
				state.target.set(from.tx, from.ty, from.tz)
				camera.position.copy(state.position)
				camera.lookAt(state.target)
				controls.current?.target.copy(state.target)
			},
			onComplete: () => {
				state.tweening = false
			},
		})
		return () => {
			tween.kill()
			state.tweening = false
		}
	}, [resetToken, camera, reducedMotion])

	// Leaving explore mode eases back to the composed view.
	const previousMode = useRef(mode)
	useEffect(() => {
		if (previousMode.current === "explore" && mode === "window")
			useSessionStore.getState().requestCameraReset()
		if (mode === "explore" && controls.current) {
			controls.current.target.copy(current.current.target)
			controls.current.update()
		}
		previousMode.current = mode
	}, [mode])

	useFrame((_, delta) => {
		const state = current.current
		if (state.tweening) return
		const dt = Math.min(delta, 0.1)

		if (follow) {
			const fish = world.fish.byId.get(follow.fishId)
			if (fish) {
				desiredTarget.copy(fish.position)
				desiredPosition.set(
					fish.position.x * 0.9,
					fish.position.y + 0.012,
					TANK.depth / 2 + 0.16 + fish.bodyLength * 2.5,
				)
				state.target.set(
					damp(state.target.x, desiredTarget.x, 1.6, dt),
					damp(state.target.y, desiredTarget.y, 1.6, dt),
					damp(state.target.z, desiredTarget.z, 1.6, dt),
				)
				state.position.set(
					damp(state.position.x, desiredPosition.x, 0.9, dt),
					damp(state.position.y, desiredPosition.y, 0.9, dt),
					damp(state.position.z, desiredPosition.z, 0.9, dt),
				)
				camera.position.copy(state.position)
				camera.lookAt(state.target)
				return
			}
		}

		if (mode === "explore") {
			const orbit = controls.current
			if (orbit) {
				// Keep the point of interest inside the tank and the camera outside the glass.
				orbit.target.x = Math.min(TANK_INTERIOR.maxX, Math.max(TANK_INTERIOR.minX, orbit.target.x))
				orbit.target.y = Math.min(TANK_INTERIOR.surfaceY, Math.max(0.05, orbit.target.y))
				orbit.target.z = Math.min(TANK_INTERIOR.maxZ, Math.max(TANK_INTERIOR.minZ, orbit.target.z))
				const insideX = Math.abs(camera.position.x) < TANK.width / 2 + 0.03
				const insideY = camera.position.y < TANK.height + 0.03 && camera.position.y > -0.02
				if (insideX && insideY && camera.position.z < TANK.depth / 2 + 0.05)
					camera.position.z = TANK.depth / 2 + 0.05
				state.position.copy(camera.position)
				state.target.copy(orbit.target)
			}
			return
		}

		// Window mode: nearly still, with an imperceptible breath and slight parallax.
		const moving = cinematic && !reducedMotion
		const t = world.elapsed
		// On narrow screens, a very slow documentary pan reveals the whole tank over several minutes.
		const pan = moving ? Math.sin(t * 0.011) * pose.panRange : 0
		const driftX = moving ? Math.sin(t * 0.031) * 0.018 + Math.sin(t * 0.017 + 1.3) * 0.01 : 0
		const driftY = moving ? Math.sin(t * 0.023 + 0.7) * 0.007 : 0
		const driftZ = moving ? Math.sin(t * 0.019 + 2.1) * 0.014 : 0
		const parallaxX = moving ? pointer.current.x * 0.035 : 0
		const parallaxY = moving ? -pointer.current.y * 0.014 : 0
		desiredPosition.set(
			pose.position.x + pan + driftX + parallaxX,
			pose.position.y + driftY + parallaxY,
			pose.position.z + driftZ,
		)
		desiredTarget.set(
			pose.target.x + pan + driftX * 0.4,
			pose.target.y + driftY * 0.5,
			pose.target.z,
		)
		state.position.set(
			damp(state.position.x, desiredPosition.x, 1.2, dt),
			damp(state.position.y, desiredPosition.y, 1.2, dt),
			damp(state.position.z, desiredPosition.z, 1.2, dt),
		)
		state.target.set(
			damp(state.target.x, desiredTarget.x, 1.2, dt),
			damp(state.target.y, desiredTarget.y, 1.2, dt),
			damp(state.target.z, desiredTarget.z, 1.2, dt),
		)
		camera.position.copy(state.position)
		camera.lookAt(state.target)
	})

	return (
		<OrbitControls
			ref={controls}
			enabled={mode === "explore" && !follow}
			enableDamping
			dampingFactor={0.06}
			rotateSpeed={0.45}
			zoomSpeed={0.6}
			panSpeed={0.5}
			minDistance={0.45}
			maxDistance={2.6}
			minPolarAngle={Math.PI * 0.3}
			maxPolarAngle={Math.PI * 0.56}
			minAzimuthAngle={-0.95}
			maxAzimuthAngle={0.95}
		/>
	)
}
