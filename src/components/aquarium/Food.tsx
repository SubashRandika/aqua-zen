"use client"

import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo } from "react"
import {
	Color,
	DoubleSide,
	DynamicDrawUsage,
	Euler,
	InstancedMesh,
	Matrix4,
	MeshStandardMaterial,
	PlaneGeometry,
	Quaternion,
	Vector3,
} from "three"
import { FEEDING } from "@/simulation/feeding/FoodManager"
import { useWorld } from "./WorldContext"

const FLAKE_COLORS = ["#c8692e", "#a8452c", "#7c8a3a", "#c99a45", "#8f5a35"].map(
	(c) => new Color(c),
)
const FLAKE_SIZE = 0.0042

const matrix = new Matrix4()
const quaternion = new Quaternion()
const euler = new Euler()
const scale = new Vector3()

/** Fish food flakes, drawn from the simulation's food particles. */
export function Food() {
	const world = useWorld()
	const mesh = useMemo(() => {
		const geometry = new PlaneGeometry(FLAKE_SIZE, FLAKE_SIZE * 0.8)
		const material = new MeshStandardMaterial({
			roughness: 0.7,
			side: DoubleSide,
			envMapIntensity: 0.2,
		})
		const instanced = new InstancedMesh(geometry, material, FEEDING.maxParticles)
		instanced.instanceMatrix.setUsage(DynamicDrawUsage)
		instanced.setColorAt(0, FLAKE_COLORS[0]!)
		instanced.frustumCulled = false
		instanced.count = 0
		return instanced
	}, [])

	useEffect(
		() => () => {
			mesh.geometry.dispose()
			;(mesh.material as MeshStandardMaterial).dispose()
			mesh.dispose()
		},
		[mesh],
	)

	useFrame(() => {
		const particles = world.food.particles
		let count = 0
		for (const particle of particles) {
			if (count >= FEEDING.maxParticles) break
			const tilt =
				particle.phase === "settled" ? Math.PI / 2 : Math.PI / 2 + Math.sin(particle.spin) * 0.9
			euler.set(tilt, particle.spin * 0.7 + particle.id, Math.cos(particle.spin * 0.8) * 0.4)
			quaternion.setFromEuler(euler)
			// Bitten flakes shrink; expiring ones fade by shrinking too.
			const size = particle.size * Math.min(1, 0.35 + particle.amount * 0.65) * particle.opacity
			matrix.compose(particle.position, quaternion, scale.setScalar(size))
			mesh.setMatrixAt(count, matrix)
			mesh.setColorAt(count, FLAKE_COLORS[particle.id % FLAKE_COLORS.length]!)
			count++
		}
		mesh.count = count
		mesh.instanceMatrix.needsUpdate = true
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
	})

	return <primitive object={mesh} />
}
