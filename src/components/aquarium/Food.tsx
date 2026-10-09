"use client"

import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo } from "react"
import {
	Color,
	DoubleSide,
	DynamicDrawUsage,
	IcosahedronGeometry,
	InstancedBufferAttribute,
	InstancedMesh,
	Matrix4,
	MeshStandardMaterial,
	PlaneGeometry,
	Quaternion,
	Vector3,
} from "three"
import { FEEDING, type FoodParticle } from "@/simulation/feeding/FoodManager"
import { createFlakeAtlas, FLAKE_ATLAS } from "@/three/effects/foodTextures"
import { applyShaderPatches } from "@/three/materials/shaderPatch"
import { sharedUniforms } from "@/three/materials/sharedUniforms"
import { useWorld } from "./WorldContext"

/** A mixed tropical flake food: shrimp red, orange, ochre, spirulina green, brown. */
const FLAKE_COLORS = [
	"#c4472c",
	"#d9782f",
	"#c9a33f",
	"#7c8a3a",
	"#8a5a36",
	"#b8562e",
	"#9aa04a",
	"#a8693a",
].map((c) => new Color(c))
const PELLET_COLORS = ["#6b3f24", "#7a3326", "#4f5a2c", "#8a5a33"].map((c) => new Color(c))

/** Flakes are a few millimetres across; sinking granules about two. */
const FLAKE_SIZE = 0.0055
const PELLET_RADIUS = 0.0011

const UP = new Vector3(0, 1, 0)
const matrix = new Matrix4()
const flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
const yaw = new Quaternion()
const tilt = new Quaternion()
const rotation = new Quaternion()
const tiltAxis = new Vector3()
const scale = new Vector3()
const color = new Color()

/** A flake is slightly cupped, never perfectly flat. */
function createFlakeGeometry(): PlaneGeometry {
	const geometry = new PlaneGeometry(1, 1, 4, 4)
	const position = geometry.attributes.position!
	for (let i = 0; i < position.count; i++) {
		const x = position.getX(i)
		const y = position.getY(i)
		position.setZ(i, 0.09 * (x * x + y * y) + 0.03 * x * y)
	}
	geometry.computeVertexNormals()
	return geometry
}

function createFlakeMesh(): InstancedMesh {
	const geometry = createFlakeGeometry()
	const tiles = new InstancedBufferAttribute(new Float32Array(FEEDING.maxParticles), 1)
	tiles.setUsage(DynamicDrawUsage)
	geometry.setAttribute("aTile", tiles)
	const material = applyShaderPatches(
		new MeshStandardMaterial({
			map: createFlakeAtlas(),
			alphaTest: 0.5,
			side: DoubleSide,
			roughness: 0.55,
			envMapIntensity: 0.3,
		}),
		[
			{
				key: "food:flake",
				uniforms: { uDaylight: sharedUniforms.uDaylight },
				vertexHeader: "attribute float aTile;",
				vertexAfter: {
					"#include <uv_vertex>": /* glsl */ `
						vMapUv = vMapUv / vec2(${FLAKE_ATLAS.columns}.0, ${FLAKE_ATLAS.rows}.0)
							+ vec2(mod(aTile, ${FLAKE_ATLAS.columns}.0), floor(aTile / ${FLAKE_ATLAS.columns}.0))
							/ vec2(${FLAKE_ATLAS.columns}.0, ${FLAKE_ATLAS.rows}.0);
					`,
				},
				fragmentHeader: "uniform float uDaylight;",
				fragmentAfter: {
					// Thin flakes let light through, so they never read as black cut-outs.
					"#include <emissivemap_fragment>":
						"totalEmissiveRadiance += diffuseColor.rgb * 0.14 * uDaylight;",
				},
			},
		],
	)
	const mesh = new InstancedMesh(geometry, material, FEEDING.maxParticles)
	mesh.instanceMatrix.setUsage(DynamicDrawUsage)
	mesh.setColorAt(0, FLAKE_COLORS[0]!)
	mesh.frustumCulled = false
	mesh.count = 0
	return mesh
}

function createPelletMesh(): InstancedMesh {
	const material = new MeshStandardMaterial({ roughness: 0.6, envMapIntensity: 0.4 })
	const mesh = new InstancedMesh(new IcosahedronGeometry(1, 1), material, FEEDING.maxParticles)
	mesh.instanceMatrix.setUsage(DynamicDrawUsage)
	mesh.setColorAt(0, PELLET_COLORS[0]!)
	mesh.castShadow = false
	mesh.frustumCulled = false
	mesh.count = 0
	return mesh
}

/** Soaked food darkens, and food lying on the bottom slowly turns dull. */
function shade(base: Color, particle: FoodParticle): Color {
	const soaked = 1 - 0.3 * particle.wetness
	const decayed = 1 - 0.4 * Math.min(1, particle.settledAge / FEEDING.settledLifetime)
	return color.copy(base).multiplyScalar(soaked * decayed)
}

function flakeRotation(particle: FoodParticle): Quaternion {
	yaw.setFromAxisAngle(UP, particle.yaw)
	rotation.multiplyQuaternions(yaw, flat)
	let angle = particle.tilt
	// Floating flakes rock gently on the surface ripples.
	if (particle.phase === "floating") angle = 0.05 * Math.sin(particle.age * 1.7 + particle.id)
	if (Math.abs(angle) > 1e-4) {
		// Tip the leading edge (towards the swing) down.
		tiltAxis.set(Math.sin(particle.swingHeading), 0, -Math.cos(particle.swingHeading))
		tilt.setFromAxisAngle(tiltAxis, angle)
		rotation.premultiply(tilt)
	}
	return rotation
}

/** Fish food drawn from the simulation's food particles: flakes, crumbs and sinking pellets. */
export function Food() {
	const world = useWorld()
	const { flakes, pellets } = useMemo(
		() => ({ flakes: createFlakeMesh(), pellets: createPelletMesh() }),
		[],
	)

	useEffect(
		() => () => {
			for (const mesh of [flakes, pellets]) {
				const material = mesh.material as MeshStandardMaterial
				material.map?.dispose()
				material.dispose()
				mesh.geometry.dispose()
				mesh.dispose()
			}
		},
		[flakes, pellets],
	)

	useFrame(() => {
		const tiles = flakes.geometry.attributes.aTile as InstancedBufferAttribute
		let flakeCount = 0
		let pelletCount = 0
		for (const particle of world.food.particles) {
			// Bitten food shrinks; expiring food fades by shrinking too.
			const remaining = Math.min(1, 0.35 + particle.amount * 0.65) * particle.opacity
			if (particle.kind === "pellet") {
				rotation.setFromAxisAngle(tiltAxis.set(0.6, 0.7, 0.4).normalize(), particle.spin)
				rotation.premultiply(yaw.setFromAxisAngle(UP, particle.yaw))
				const radius = PELLET_RADIUS * particle.size * remaining
				scale.set(radius, radius * 0.82, radius * 0.94)
				matrix.compose(particle.position, rotation, scale)
				pellets.setMatrixAt(pelletCount, matrix)
				pellets.setColorAt(
					pelletCount,
					shade(PELLET_COLORS[particle.variant % PELLET_COLORS.length]!, particle),
				)
				pelletCount++
			} else {
				const size = FLAKE_SIZE * particle.size * remaining
				matrix.compose(particle.position, flakeRotation(particle), scale.setScalar(size))
				flakes.setMatrixAt(flakeCount, matrix)
				flakes.setColorAt(flakeCount, shade(FLAKE_COLORS[particle.variant]!, particle))
				tiles.setX(flakeCount, particle.variant % FLAKE_ATLAS.tiles)
				flakeCount++
			}
		}
		for (const [mesh, count] of [
			[flakes, flakeCount],
			[pellets, pelletCount],
		] as const) {
			mesh.count = count
			mesh.instanceMatrix.needsUpdate = true
			if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
		}
		tiles.needsUpdate = true
	})

	return (
		<>
			<primitive object={flakes} />
			<primitive object={pellets} />
		</>
	)
}
