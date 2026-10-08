"use client"

import { useFrame, useThree } from "@react-three/fiber"
import { useEffect, useMemo, useRef } from "react"
import { Color, Fog, type DirectionalLight, type HemisphereLight } from "three"
import { TANK } from "@/config/tank"
import { useQualityPreset } from "@/hooks/useQualityPreset"
import { sharedUniforms } from "@/three/materials/sharedUniforms"
import { sceneReveal } from "@/three/reveal"
import { useWorld } from "./WorldContext"

/** How far light travels through the water before fading to the water colour, in metres. */
const WATER_VISIBILITY = 1.9

/**
 * The aquarium's light rig, driven every frame by the simulation's live
 * lighting profile: a key light from above (daylight and the tank light,
 * with shadows), a hemisphere fill for light scattered in the water,
 * moonlight LEDs for night, and underwater fog that gives the tank depth.
 */
export function Lighting() {
	const world = useWorld()
	const preset = useQualityPreset()
	const scene = useThree((s) => s.scene)
	const key = useRef<DirectionalLight>(null)
	const moon = useRef<DirectionalLight>(null)
	const fill = useRef<HemisphereLight>(null)
	const fog = useMemo(() => new Fog(new Color(0.1, 0.2, 0.2), 1, 4), [])

	useEffect(() => {
		scene.fog = fog
		return () => {
			scene.fog = null
		}
	}, [scene, fog])

	useEffect(() => {
		const light = key.current
		if (!light) return
		light.target.position.set(0, TANK.height / 2, 0)
		light.target.updateMatrixWorld()
	}, [])

	useFrame(({ camera, gl }) => {
		const profile = world.lighting.current
		const reveal = sceneReveal.value
		if (key.current) {
			key.current.color.setRGB(...profile.keyColor)
			key.current.intensity = profile.keyIntensity * reveal
		}
		if (moon.current) {
			moon.current.color.setRGB(...profile.moonColor)
			moon.current.intensity = profile.moonIntensity
		}
		if (fill.current) {
			fill.current.color.setRGB(...profile.skyColor)
			fill.current.groundColor.setRGB(...profile.groundColor)
			fill.current.intensity = profile.fillIntensity * (0.35 + 0.65 * reveal)
		}
		// Fog starts at the front glass, so only the water — not the room — is tinted.
		const toGlass = Math.max(0.05, camera.position.z - TANK.depth / 2)
		fog.near = toGlass
		fog.far = toGlass + WATER_VISIBILITY
		fog.color.setRGB(...profile.waterColor)
		scene.environmentIntensity = profile.environmentIntensity
		gl.toneMappingExposure = profile.exposure
		sharedUniforms.uCausticIntensity.value = profile.causticIntensity * reveal
	})

	const shadowSize = preset.shadowMapSize
	return (
		<>
			<directionalLight
				ref={key}
				position={[0.12, 1.7, 0.28]}
				castShadow={preset.shadows}
				shadow-mapSize={[shadowSize, shadowSize]}
				shadow-bias={-0.0004}
				shadow-normalBias={0.0025}
				shadow-camera-left={-0.66}
				shadow-camera-right={0.66}
				shadow-camera-top={0.4}
				shadow-camera-bottom={-0.4}
				shadow-camera-near={0.8}
				shadow-camera-far={2.4}
			/>
			<directionalLight ref={moon} position={[-0.2, 1.6, 0.1]} />
			<hemisphereLight ref={fill} />
		</>
	)
}
