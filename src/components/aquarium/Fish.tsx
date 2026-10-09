"use client"

import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo } from "react"
import {
	DynamicDrawUsage,
	InstancedBufferAttribute,
	InstancedMesh,
	Matrix4,
	Quaternion,
	Vector3,
	type BufferGeometry,
} from "three"
import { QUALITY_PRESETS } from "@/config/quality"
import { SPECIES } from "@/config/species"
import { useQualityPreset } from "@/hooks/useQualityPreset"
import { clamp } from "@/simulation/core/math"
import type { FishAgent } from "@/simulation/fish/FishAgent"
import { speciesCount } from "@/simulation/fish/population"
import type { FishSpeciesDefinition } from "@/simulation/fish/types"
import { getFishAssets } from "@/three/assets"
import type { FishGeometrySet } from "@/three/geometry/fishGeometry"
import { createFishMaterials } from "@/three/materials/fishMaterial"
import { useWorld } from "./WorldContext"

const FISH_FORWARD_AXIS = new Vector3(1, 0, 0)
const forward = new Vector3()
const side = new Vector3()
const up = new Vector3()
const scaleVector = new Vector3()
const rotation = new Quaternion()
const rollQuaternion = new Quaternion()
const matrix = new Matrix4()

/** One level of detail: body and fins drawn as instances, sharing transforms and animation data. */
class FishLod {
	readonly body: InstancedMesh
	readonly fins: InstancedMesh
	readonly swim: InstancedBufferAttribute
	readonly look: InstancedBufferAttribute
	readonly identity: InstancedBufferAttribute
	count = 0

	constructor(
		geometry: FishGeometrySet,
		materials: ReturnType<typeof createFishMaterials>,
		capacity: number,
		shadows: boolean,
	) {
		const body = geometry.body.clone()
		const fins = geometry.fins.clone()
		this.swim = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(
			DynamicDrawUsage,
		)
		this.look = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(
			DynamicDrawUsage,
		)
		this.identity = new InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(
			DynamicDrawUsage,
		)
		for (const g of [body, fins] as BufferGeometry[]) {
			g.setAttribute("aSwim", this.swim)
			g.setAttribute("aLook", this.look)
			g.setAttribute("aIdentity", this.identity)
		}
		this.body = new InstancedMesh(body, materials.body, capacity)
		this.fins = new InstancedMesh(fins, materials.fins, capacity)
		// Both meshes share one transform buffer.
		this.fins.instanceMatrix = this.body.instanceMatrix
		this.body.instanceMatrix.setUsage(DynamicDrawUsage)
		this.body.castShadow = shadows
		this.body.receiveShadow = shadows
		this.fins.renderOrder = 2
		for (const mesh of [this.body, this.fins]) {
			mesh.frustumCulled = false
			mesh.count = 0
		}
	}

	write(agent: FishAgent): void {
		const i = this.count++
		forward.copy(agent.heading)
		// Usually world up; a pleco clinging to the glass has its back to the water instead.
		side.crossVectors(forward, agent.up)
		if (side.lengthSq() < 1e-6) side.set(0, 0, 1)
		side.normalize()
		up.crossVectors(side, forward).normalize()
		matrix.makeBasis(forward, up, side)
		rotation.setFromRotationMatrix(matrix)
		rotation.multiply(rollQuaternion.setFromAxisAngle(FISH_FORWARD_AXIS, agent.roll))
		matrix.compose(agent.position, rotation, scaleVector.setScalar(agent.bodyLength))
		this.body.setMatrixAt(i, matrix)
		const cruise = agent.species.movement.cruiseSpeed
		const hueVariation = agent.species.visual.pattern.hueVariation
		const hueShift = ((agent.seed % 1) * 2 - 1) * hueVariation
		this.swim.setXYZW(i, agent.tailPhase, agent.tailAmplitude, agent.bend, agent.finPhase)
		this.look.setXYZW(
			i,
			agent.colorIntensity,
			hueShift,
			agent.finFlare,
			clamp(agent.speed / Math.max(cruise, 1e-3), 0, 1),
		)
		this.identity.setXY(i, agent.seed % 1, agent.variety)
	}

	commit(): void {
		this.body.count = this.count
		this.fins.count = this.count
		this.body.instanceMatrix.needsUpdate = true
		this.swim.needsUpdate = true
		this.look.needsUpdate = true
		this.identity.needsUpdate = true
		this.count = 0
	}

	dispose(): void {
		this.body.geometry.dispose()
		this.fins.geometry.dispose()
		this.body.dispose()
		this.fins.dispose()
	}
}

function SpeciesFish({ species }: { species: FishSpeciesDefinition }) {
	const world = useWorld()
	const preset = useQualityPreset()
	const assets = getFishAssets(preset)
	const geometry = assets.geometries.get(species.id)!
	const capacity = speciesCount(species, QUALITY_PRESETS.ultra.fishDensity) + 2

	const { near, far, materials } = useMemo(() => {
		const materials = createFishMaterials(species, preset.causticLayers)
		return {
			materials,
			near: new FishLod(geometry.near, materials, capacity, preset.shadows),
			far: new FishLod(geometry.far, materials, capacity, preset.shadows),
		}
	}, [species, geometry, capacity, preset.causticLayers, preset.shadows])

	useEffect(
		() => () => {
			near.dispose()
			far.dispose()
			materials.body.dispose()
			materials.fins.dispose()
		},
		[near, far, materials],
	)

	const lodDistance = (species.visual.lodDistances[0] ?? 1) * preset.lodScale
	useFrame(() => {
		for (const agent of world.fish.agents) {
			if (agent.species !== species) continue
			const lod = agent.cameraDistance < lodDistance ? near : far
			if (lod.count < capacity) lod.write(agent)
		}
		near.commit()
		far.commit()
	})

	return (
		<group>
			<primitive object={near.body} />
			<primitive object={far.body} />
			<primitive object={near.fins} />
			<primitive object={far.fins} />
		</group>
	)
}

/** Every fish in the tank: per species, a handful of instanced draw calls. */
export function Fish() {
	return (
		<group>
			{SPECIES.map((species) => (
				<SpeciesFish key={species.id} species={species} />
			))}
		</group>
	)
}
