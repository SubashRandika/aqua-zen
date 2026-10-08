"use client"

import { useThree } from "@react-three/fiber"
import gsap from "gsap"
import { useEffect } from "react"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import { sceneReveal } from "@/three/reveal"
import { useSessionStore } from "@/store/sessionStore"

/**
 * Compiles every shader before the aquarium is shown (so the first seconds
 * don't stutter), then turns the aquarium lights on.
 */
export function SceneReady() {
	const gl = useThree((s) => s.gl)
	const scene = useThree((s) => s.scene)
	const camera = useThree((s) => s.camera)
	const reducedMotion = useReducedMotion()

	useEffect(() => {
		let cancelled = false
		let tween: gsap.core.Tween | null = null
		const session = useSessionStore.getState()
		session.setLoadingStage("lights")
		const compile = gl.compileAsync
			? gl.compileAsync(scene, camera)
			: Promise.resolve(gl.compile(scene, camera))
		compile
			.catch(() => undefined)
			.then(() => {
				if (cancelled) return
				useSessionStore.getState().setLoadingStage("ready")
				tween = gsap.to(sceneReveal, {
					value: 1,
					duration: reducedMotion ? 0.4 : 4,
					delay: reducedMotion ? 0 : 0.6,
					ease: "power2.inOut",
				})
			})
		return () => {
			cancelled = true
			tween?.kill()
		}
		// Runs once per scene; reduced-motion only affects the initial reveal.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gl, scene, camera])

	return null
}
