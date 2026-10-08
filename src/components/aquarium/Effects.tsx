"use client"

import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from "@react-three/postprocessing"
import { BlendFunction, ToneMappingMode } from "postprocessing"
import type { ReactElement } from "react"
import { useQualityPreset } from "@/hooks/useQualityPreset"

/**
 * Restrained post-processing: a whisper of bloom on the brightest
 * highlights, a vignette that draws the eye into the tank, and fine grain
 * that hides banding in the dark gradients. Disabled entirely on low tiers.
 */
export function Effects() {
	const preset = useQualityPreset()
	const post = preset.postProcessing
	if (!post.bloom && !post.vignette && !post.grain) return null

	const effects: ReactElement[] = []
	if (post.bloom) {
		effects.push(
			<Bloom
				key="bloom"
				mipmapBlur
				intensity={0.32}
				luminanceThreshold={0.82}
				luminanceSmoothing={0.2}
				radius={0.65}
			/>,
		)
	}
	if (post.vignette) effects.push(<Vignette key="vignette" offset={0.28} darkness={0.62} />)
	if (post.grain)
		effects.push(
			<Noise key="grain" premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.22} />,
		)
	effects.push(<ToneMapping key="tone" mode={ToneMappingMode.ACES_FILMIC} />)

	return (
		<EffectComposer multisampling={post.multisampling} enableNormalPass={false}>
			{effects}
		</EffectComposer>
	)
}
