"use client"

import { useEffect, useMemo } from "react"
import { MeshStandardMaterial } from "three"
import { ROCKS } from "@/config/scape"
import { useQualityPreset } from "@/hooks/useQualityPreset"
import { substrateHeight } from "@/simulation/environment/substrate"
import { getScapeAssets } from "@/three/assets"
import { causticsPatch } from "@/three/materials/causticsPatch"
import { applyShaderPatches } from "@/three/materials/shaderPatch"
import { surfaceDetailPatch } from "@/three/materials/surfaceDetailPatch"
import { createSubstrateMaterial } from "@/three/materials/substrateMaterial"

interface Detail {
	scale: number
	strength: number
	tint: number
}

function createHardscapeMaterial(
	roughness: number,
	detail: Detail,
	causticLayers: 1 | 2,
): MeshStandardMaterial {
	return applyShaderPatches(
		new MeshStandardMaterial({
			vertexColors: true,
			roughness,
			metalness: 0,
			envMapIntensity: 0.35,
		}),
		[causticsPatch(1), surfaceDetailPatch(detail.scale, detail.strength, detail.tint)],
		{ CAUSTIC_LAYERS: causticLayers },
	)
}

/** Substrate, stones and driftwood — the static hardscape of the aquarium. */
export function Scape() {
	const preset = useQualityPreset()
	const assets = getScapeAssets(preset)
	const layers = preset.causticLayers
	const materials = useMemo(
		() => ({
			substrate: createSubstrateMaterial(layers),
			skirt: createSubstrateMaterial(layers, true),
			stone: createHardscapeMaterial(0.8, { scale: 70, strength: 0.0028, tint: 0.14 }, layers),
			wood: createHardscapeMaterial(0.88, { scale: 180, strength: 0.0022, tint: 0.3 }, layers),
		}),
		[layers],
	)
	useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials])

	return (
		<group>
			<mesh geometry={assets.substrate} material={materials.substrate} receiveShadow />
			<mesh geometry={assets.skirt} material={materials.skirt} />
			{ROCKS.map((rock, i) => (
				<mesh
					key={rock.id}
					geometry={assets.rocks[i]}
					material={materials.stone}
					position={[
						rock.position[0],
						substrateHeight(rock.position[0], rock.position[1]),
						rock.position[1],
					]}
					castShadow
					receiveShadow
				/>
			))}
			{assets.driftwood.map((geometry, i) => (
				<mesh key={i} geometry={geometry} material={materials.wood} castShadow receiveShadow />
			))}
		</group>
	)
}
