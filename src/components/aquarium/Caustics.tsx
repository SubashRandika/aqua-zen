"use client"

import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo } from "react"
import { CausticsTexture } from "@/three/effects/causticsTexture"
import { sharedUniforms } from "@/three/materials/sharedUniforms"

/** Renders the shared caustic texture each frame, before the scene is drawn. */
export function Caustics() {
	const caustics = useMemo(() => new CausticsTexture(), [])

	useEffect(() => {
		sharedUniforms.uCausticMap.value = caustics.target.texture
		return () => {
			sharedUniforms.uCausticMap.value = null
			caustics.dispose()
		}
	}, [caustics])

	useFrame(({ gl }) => caustics.update(gl, sharedUniforms.uTime.value), -5)
	return null
}
