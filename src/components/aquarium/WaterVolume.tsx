"use client"

import { useFrame, useThree } from "@react-three/fiber"
import { useEffect, useMemo } from "react"
import {
	BufferGeometry,
	Color,
	Float32BufferAttribute,
	InstancedBufferAttribute,
	InstancedBufferGeometry,
	PerspectiveCamera,
	PlaneGeometry,
	type ShaderMaterial,
} from "three"
import { AIR_STONE, PLANT_GROUPS } from "@/config/scape"
import { TANK_INTERIOR } from "@/config/tank"
import { useQualityPreset } from "@/hooks/useQualityPreset"
import { createRandom, randomRange } from "@/simulation/core/random"
import { substrateHeight } from "@/simulation/environment/substrate"
import {
	createBubbleMaterial,
	createLightShaftMaterial,
	createSuspendedParticleMaterial,
	sharedPointScale,
} from "@/three/effects/particleMaterials"
import { sceneReveal } from "@/three/reveal"
import { useWorld } from "./WorldContext"

function createParticleGeometry(count: number): BufferGeometry {
	const random = createRandom(311)
	const seeds = new Float32Array(count * 4)
	for (let i = 0; i < count * 4; i++) seeds[i] = random()
	const geometry = new BufferGeometry()
	geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(count * 3), 3))
	geometry.setAttribute("aSeed", new Float32BufferAttribute(seeds, 4))
	return geometry
}

/** Bubbles from the air stone, plus tiny oxygen bubbles "pearling" off plant leaves. */
function createBubbleGeometry(count: number, pearls: number): BufferGeometry {
	const random = createRandom(733)
	const total = count + pearls
	const origins = new Float32Array(total * 3)
	const bubbles = new Float32Array(total * 4)
	const stoneY = substrateHeight(AIR_STONE[0], AIR_STONE[2]) + 0.012
	for (let i = 0; i < count; i++) {
		origins.set(
			[
				AIR_STONE[0] + randomRange(random, -0.006, 0.006),
				stoneY,
				AIR_STONE[2] + randomRange(random, -0.006, 0.006),
			],
			i * 3,
		)
		bubbles.set(
			[
				randomRange(random, 0.14, 0.24),
				randomRange(random, 0.0012, 0.0032),
				random(),
				randomRange(random, 0.6, 1.4),
			],
			i * 4,
		)
	}
	const leafy = PLANT_GROUPS.filter((g) => g.kind === "rosette" || g.kind === "stem")
	for (let i = 0; i < pearls; i++) {
		const group = leafy[i % leafy.length]!
		const x = group.center[0] + randomRange(random, -1, 1) * group.radius[0]
		const z = group.center[1] + randomRange(random, -1, 1) * group.radius[1]
		const y = substrateHeight(x, z) + randomRange(random, 0.3, 0.9) * group.height[1]
		origins.set([x, y, z], (count + i) * 3)
		bubbles.set(
			[randomRange(random, 0.05, 0.08), randomRange(random, 0.0007, 0.0012), random(), 0.3],
			(count + i) * 4,
		)
	}
	const geometry = new BufferGeometry()
	geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(total * 3), 3))
	geometry.setAttribute("aOrigin", new Float32BufferAttribute(origins, 3))
	geometry.setAttribute("aBubble", new Float32BufferAttribute(bubbles, 4))
	return geometry
}

function createShaftGeometry(count: number): InstancedBufferGeometry {
	const random = createRandom(97)
	const plane = new PlaneGeometry(1, TANK_INTERIOR.surfaceY - 0.02, 1, 1)
	plane.translate(0, (TANK_INTERIOR.surfaceY - 0.02) / 2 + 0.02, 0)
	const geometry = new InstancedBufferGeometry()
	geometry.index = plane.index
	geometry.setAttribute("position", plane.attributes.position!)
	geometry.setAttribute("uv", plane.attributes.uv!)
	const shafts = new Float32Array(count * 4)
	for (let i = 0; i < count; i++) {
		shafts.set(
			[
				randomRange(random, TANK_INTERIOR.minX + 0.15, TANK_INTERIOR.maxX - 0.15),
				randomRange(random, TANK_INTERIOR.minZ + 0.08, TANK_INTERIOR.maxZ - 0.12),
				randomRange(random, 0.05, 0.14),
				random(),
			],
			i * 4,
		)
	}
	geometry.setAttribute("aShaft", new InstancedBufferAttribute(shafts, 4))
	geometry.instanceCount = count
	return geometry
}

/** Everything that makes the water itself visible: motes, bubbles and shafts of light. */
export function WaterVolume() {
	const world = useWorld()
	const preset = useQualityPreset()
	const camera = useThree((s) => s.camera)
	const size = useThree((s) => s.size)
	const dpr = useThree((s) => s.viewport.dpr)

	const particles = useMemo(
		() => ({
			geometry: createParticleGeometry(preset.suspendedParticles),
			material: createSuspendedParticleMaterial(),
		}),
		[preset.suspendedParticles],
	)
	const bubbles = useMemo(
		() => ({
			geometry: createBubbleGeometry(preset.bubbles, Math.round(preset.bubbles * 0.25)),
			material: createBubbleMaterial(),
		}),
		[preset.bubbles],
	)
	const shafts = useMemo(
		() =>
			preset.lightShafts
				? { geometry: createShaftGeometry(7), material: createLightShaftMaterial() }
				: null,
		[preset.lightShafts],
	)

	useEffect(() => {
		const fov = camera instanceof PerspectiveCamera ? camera.fov : 32
		sharedPointScale.value = (size.height * dpr) / (2 * Math.tan((fov * Math.PI) / 360))
	}, [camera, size.height, dpr])

	useEffect(
		() => () => {
			for (const item of [particles, bubbles, shafts]) {
				item?.geometry.dispose()
				item?.material.dispose()
			}
		},
		[particles, bubbles, shafts],
	)

	useFrame(() => {
		const profile = world.lighting.current
		const reveal = sceneReveal.value
		const particleMaterial = particles.material as ShaderMaterial
		;(particleMaterial.uniforms.uColor!.value as Color).setRGB(...profile.keyColor)
		particleMaterial.uniforms.uBrightness!.value =
			(profile.keyIntensity / 3) * reveal + profile.moonIntensity * 0.25
		;(bubbles.material.uniforms.uLight!.value as Color)
			.setRGB(...profile.keyColor)
			.multiplyScalar(0.35 + 0.65 * profile.daylight * reveal)
		if (shafts) {
			;(shafts.material.uniforms.uColor!.value as Color).setRGB(...profile.keyColor)
			shafts.material.uniforms.uIntensity!.value = profile.shaftIntensity * reveal
		}
	})

	return (
		<group>
			<points
				geometry={particles.geometry}
				material={particles.material}
				frustumCulled={false}
				renderOrder={3}
			/>
			<points
				geometry={bubbles.geometry}
				material={bubbles.material}
				frustumCulled={false}
				renderOrder={4}
			/>
			{shafts && (
				<mesh
					geometry={shafts.geometry}
					material={shafts.material}
					frustumCulled={false}
					renderOrder={6}
				/>
			)}
			{/* The air stone and its line, tucked behind the left planting. */}
			<mesh
				position={[AIR_STONE[0], substrateHeight(AIR_STONE[0], AIR_STONE[2]) + 0.006, AIR_STONE[2]]}
			>
				<cylinderGeometry args={[0.012, 0.013, 0.014, 12]} />
				<meshStandardMaterial color="#8a8a86" roughness={0.95} />
			</mesh>
			<mesh position={[AIR_STONE[0] - 0.02, 0.29, TANK_INTERIOR.minZ + 0.012]}>
				<cylinderGeometry args={[0.0022, 0.0022, 0.52, 6]} />
				<meshStandardMaterial color="#cfe3df" roughness={0.1} transparent opacity={0.25} />
			</mesh>
		</group>
	)
}
