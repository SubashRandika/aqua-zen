"use client"

import { useFrame } from "@react-three/fiber"
import { sharedUniforms } from "@/three/materials/sharedUniforms"
import { useWorld } from "./WorldContext"

/**
 * Advances the simulation once per frame, before anything renders.
 * This is the only place the world is stepped — no React state is touched.
 */
export function SimulationDriver() {
	const world = useWorld()
	useFrame(({ camera }, delta) => {
		world.setCameraPosition(camera.position)
		world.update(delta)
		const lighting = world.lighting.current
		sharedUniforms.uTime.value = world.elapsed
		sharedUniforms.uDaylight.value = lighting.daylight
		sharedUniforms.uWaterColor.value.setRGB(...lighting.waterColor)
	}, -10)
	return null
}
