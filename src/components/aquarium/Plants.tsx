"use client"

import { useEffect, useMemo } from "react"
import {
	InstancedBufferAttribute,
	InstancedMesh,
	Vector3,
	type BufferGeometry,
	type Material,
} from "three"
import { useQualityPreset } from "@/hooks/useQualityPreset"
import { getPlantAssets } from "@/three/assets"
import type { PlantInstance } from "@/three/geometry/plantPlacement"
import { createPlantMaterial } from "@/three/materials/plantMaterial"

/** Builds one instanced draw call for a set of plant parts. */
function createPlantMesh(
	geometry: BufferGeometry,
	material: Material,
	instances: readonly PlantInstance[],
): InstancedMesh {
	// Each mesh gets its own geometry clone so the per-instance anchor attribute isn't shared.
	const instancedGeometry = geometry.clone()
	const anchors = new Float32Array(instances.length * 4)
	const mesh = new InstancedMesh(instancedGeometry, material, instances.length)
	instances.forEach((instance, i) => {
		mesh.setMatrixAt(i, instance.matrix)
		mesh.setColorAt(i, instance.color)
		instance.anchor.toArray(anchors, i * 4)
	})
	instancedGeometry.setAttribute("aAnchor", new InstancedBufferAttribute(anchors, 4))
	mesh.instanceMatrix.needsUpdate = true
	if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
	mesh.receiveShadow = true
	// Plants sway in the vertex shader, so bounds from rest positions are unreliable.
	mesh.frustumCulled = false
	return mesh
}

/** Aquatic plants, each species one instanced draw call swaying in the current. */
export function Plants() {
	const preset = useQualityPreset()
	const assets = getPlantAssets(preset)
	const layers = preset.causticLayers

	const meshes = useMemo(() => {
		const current = new Vector3(-0.02, 0, 0.004)
		const vallisneriaMaterial = createPlantMaterial({
			sway: 0.028,
			swayHeight: 0.3,
			current,
			translucency: 0.12,
			causticLayers: layers,
		})
		const grassMaterial = createPlantMaterial({
			sway: 0.004,
			swayHeight: 0.035,
			translucency: 0.06,
			roughness: 0.7,
			causticLayers: layers,
		})
		const leafMaterial = createPlantMaterial({
			sway: 0.006,
			swayHeight: 0.18,
			translucency: 0.08,
			roughness: 0.5,
			causticLayers: layers,
		})
		const stemMaterial = createPlantMaterial({
			sway: 0.018,
			swayHeight: 0.3,
			current,
			translucency: 0.1,
			causticLayers: layers,
		})
		return [
			createPlantMesh(assets.vallisneria, vallisneriaMaterial, assets.instances.vallisneria),
			createPlantMesh(assets.hairgrass, grassMaterial, assets.instances.hairgrass),
			createPlantMesh(assets.rosetteLeaf, leafMaterial, assets.instances.rosetteLeaves),
			createPlantMesh(assets.stem, stemMaterial, assets.instances.stems),
			createPlantMesh(assets.stemLeaf, stemMaterial, assets.instances.stemLeaves),
		]
	}, [assets, layers])

	useEffect(
		() => () => {
			const disposed = new Set<Material>()
			for (const mesh of meshes) {
				mesh.geometry.dispose()
				const material = mesh.material as Material
				if (!disposed.has(material)) {
					material.dispose()
					disposed.add(material)
				}
				mesh.dispose()
			}
		},
		[meshes],
	)

	return (
		<group>
			{meshes.map((mesh, i) => (
				<primitive key={i} object={mesh} />
			))}
		</group>
	)
}
