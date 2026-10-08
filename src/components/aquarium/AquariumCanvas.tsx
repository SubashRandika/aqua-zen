"use client"

import { PerformanceMonitor } from "@react-three/drei"
import { Canvas } from "@react-three/fiber"
import { useCallback, useState } from "react"
import { ACESFilmicToneMapping, PCFShadowMap, SRGBColorSpace } from "three"
import { ADAPTIVE_QUALITY, stepQuality } from "@/config/quality"
import { useQualityPreset } from "@/hooks/useQualityPreset"
import { CAMERA, defaultCameraPose } from "@/lib/cameraFraming"
import { lerp } from "@/simulation/core/math"
import type { AquariumWorld } from "@/simulation/core/World"
import { useSessionStore } from "@/store/sessionStore"
import { useSettingsStore } from "@/store/settingsStore"
import { configureThreeLogging } from "@/three/logging"
import { AquariumScene } from "./AquariumScene"
import { WorldProvider } from "./WorldContext"

configureThreeLogging()

/**
 * The WebGL canvas. Handles renderer setup, adaptive resolution and
 * quality, and graceful recovery when the GPU context is lost.
 */
export function AquariumCanvas({ world }: { world: AquariumWorld }) {
	const preset = useQualityPreset()
	const [dprFactor, setDprFactor] = useState(1)
	const dpr = lerp(preset.dpr[0], preset.dpr[1], dprFactor)
	const initialPose = defaultCameraPose(
		typeof window === "undefined" ? 16 / 9 : window.innerWidth / Math.max(window.innerHeight, 1),
	)

	const adapt = useCallback((direction: -1 | 1) => {
		if (useSettingsStore.getState().quality !== "auto") return
		const session = useSessionStore.getState()
		const next = stepQuality(session.activeQuality, direction)
		// Auto never climbs into Ultra by itself: it is an explicit choice for strong GPUs.
		if (direction === 1 && next === "ultra") return
		session.setActiveQuality(next)
	}, [])

	return (
		<Canvas
			className="!absolute inset-0"
			dpr={dpr}
			shadows={preset.shadows ? { type: PCFShadowMap } : false}
			camera={{ fov: CAMERA.fov, near: 0.02, far: 30, position: initialPose.position }}
			gl={{
				antialias: preset.antialias,
				powerPreference: "high-performance",
				alpha: false,
				stencil: false,
			}}
			onCreated={({ gl }) => {
				// Shader validation costs a synchronous GPU round-trip per program; skip it in production.
				gl.debug.checkShaderErrors = process.env.NODE_ENV !== "production"
				gl.toneMapping = ACESFilmicToneMapping
				gl.toneMappingExposure = 1
				gl.outputColorSpace = SRGBColorSpace
				const canvas = gl.domElement
				canvas.addEventListener("webglcontextlost", (event) => {
					event.preventDefault()
					useSessionStore.getState().setContextLost(true)
				})
				canvas.addEventListener("webglcontextrestored", () =>
					useSessionStore.getState().setContextLost(false),
				)
			}}
			aria-hidden
		>
			<PerformanceMonitor
				bounds={() => [ADAPTIVE_QUALITY.lowerBound, ADAPTIVE_QUALITY.upperBound]}
				flipflops={ADAPTIVE_QUALITY.maxFlips}
				onChange={({ factor }) => setDprFactor(Math.round(factor * 10) / 10)}
				onDecline={() => adapt(-1)}
				onIncline={() => adapt(1)}
			>
				<WorldProvider world={world}>
					<AquariumScene />
				</WorldProvider>
			</PerformanceMonitor>
		</Canvas>
	)
}
