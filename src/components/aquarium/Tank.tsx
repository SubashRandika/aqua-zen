"use client"

import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo, useState } from "react"
import {
	AdditiveBlending,
	BoxGeometry,
	Color,
	MeshPhysicalMaterial,
	MeshStandardMaterial,
	PlaneGeometry,
	type CanvasTexture,
	type ShaderMaterial,
} from "three"
import { TANK, TANK_INTERIOR } from "@/config/tank"
import { useQualityPreset } from "@/hooks/useQualityPreset"
import { createBackdropMaterial } from "@/three/effects/backdropMaterial"
import { createEtchedMarkMaterial, createEtchedMarkTexture } from "@/three/effects/glassEffects"
import {
	createMeniscusMaterial,
	createWaterSurfaceMaterial,
} from "@/three/effects/waterSurfaceMaterial"
import { sceneReveal } from "@/three/reveal"
import { useWorld } from "./WorldContext"

const T = TANK.glassThickness
const W = TANK.width
const H = TANK.height
const D = TANK.depth

interface Pane {
	size: [number, number, number]
	position: [number, number, number]
}

const PANES: Pane[] = [
	{ size: [W, H, T], position: [0, H / 2, D / 2 - T / 2] },
	{ size: [W, H, T], position: [0, H / 2, -D / 2 + T / 2] },
	{ size: [T, H, D - 2 * T], position: [-W / 2 + T / 2, H / 2, 0] },
	{ size: [T, H, D - 2 * T], position: [W / 2 - T / 2, H / 2, 0] },
	{ size: [W, T, D], position: [0, T / 2, 0] },
]

/** Polished glass edges, seen edge-on, glow faintly green — the signature of low-iron glass. */
const EDGES: Pane[] = [
	{ size: [W, 0.0025, T], position: [0, H, D / 2 - T / 2] },
	{ size: [W, 0.0025, T], position: [0, H, -D / 2 + T / 2] },
	{ size: [T, 0.0025, D], position: [-W / 2 + T / 2, H, 0] },
	{ size: [T, 0.0025, D], position: [W / 2 - T / 2, H, 0] },
	{ size: [T, H, T], position: [-W / 2 + T / 2, H / 2, D / 2 - T / 2] },
	{ size: [T, H, T], position: [W / 2 - T / 2, H / 2, D / 2 - T / 2] },
]

function useGlassMaterials() {
	return useMemo(() => {
		// Reflections only: a black, additive surface adds the environment's
		// highlights without darkening what lies behind the glass.
		const glass = new MeshPhysicalMaterial({
			color: new Color(0, 0, 0),
			roughness: 0.03,
			metalness: 0,
			envMapIntensity: 1.6,
			transparent: true,
			blending: AdditiveBlending,
			depthWrite: false,
		})
		const edge = new MeshStandardMaterial({
			color: new Color("#9fd2bd"),
			emissive: new Color("#1d3a31"),
			roughness: 0.12,
			transparent: true,
			opacity: 0.55,
			depthWrite: false,
		})
		return { glass, edge }
	}, [])
}

function useEtchedMark(): ShaderMaterial | null {
	const [material, setMaterial] = useState<ShaderMaterial | null>(null)
	useEffect(() => {
		let texture: CanvasTexture | null = null
		let created: ShaderMaterial | null = null
		let cancelled = false
		const family =
			getComputedStyle(document.documentElement).getPropertyValue("--font-shippori").trim() ||
			"serif"
		document.fonts
			.load(`400 132px ${family}`)
			.catch(() => undefined)
			.then(() => {
				if (cancelled) return
				texture = createEtchedMarkTexture(family)
				created = createEtchedMarkMaterial(texture)
				setMaterial(created)
			})
		return () => {
			cancelled = true
			texture?.dispose()
			created?.dispose()
		}
	}, [])
	return material
}

export function Tank() {
	const world = useWorld()
	const preset = useQualityPreset()
	const { glass, edge } = useGlassMaterials()
	const mark = useEtchedMark()
	const backdrop = useMemo(() => createBackdropMaterial(), [])
	const surface = useMemo(() => createWaterSurfaceMaterial(), [])
	const meniscus = useMemo(() => createMeniscusMaterial(), [])
	const surfaceGeometry = useMemo(() => {
		const geometry = new PlaneGeometry(
			TANK_INTERIOR.maxX - TANK_INTERIOR.minX,
			TANK_INTERIOR.maxZ - TANK_INTERIOR.minZ,
			preset.waterSurfaceSegments,
			Math.round(preset.waterSurfaceSegments * 0.4),
		)
		geometry.rotateX(-Math.PI / 2)
		return geometry
	}, [preset.waterSurfaceSegments])
	const paneGeometries = useMemo(() => PANES.map((p) => new BoxGeometry(...p.size)), [])
	const edgeGeometries = useMemo(() => EDGES.map((p) => new BoxGeometry(...p.size)), [])
	const fixtureGlow = useMemo(
		() =>
			new MeshStandardMaterial({
				color: "#111",
				emissive: new Color(1, 1, 1),
				emissiveIntensity: 1,
			}),
		[],
	)
	const moonStrip = useMemo(
		() =>
			new MeshStandardMaterial({
				color: "#000",
				emissive: new Color(0.35, 0.5, 1),
				emissiveIntensity: 1,
			}),
		[],
	)

	useEffect(
		() => () => {
			for (const g of [...paneGeometries, ...edgeGeometries, surfaceGeometry]) g.dispose()
			for (const m of [glass, edge, backdrop, surface, meniscus, fixtureGlow, moonStrip])
				m.dispose()
		},
		[
			paneGeometries,
			edgeGeometries,
			surfaceGeometry,
			glass,
			edge,
			backdrop,
			surface,
			meniscus,
			fixtureGlow,
			moonStrip,
		],
	)

	useFrame(() => {
		const profile = world.lighting.current
		const reveal = sceneReveal.value
		backdrop.uniforms
			.uTop!.value.setRGB(...profile.backdropTop)
			.multiplyScalar(0.25 + 0.75 * reveal)
		backdrop.uniforms.uBottom!.value.setRGB(...profile.backdropBottom)
		const light = surface.uniforms.uLight!.value as Color
		light.setRGB(...profile.keyColor).multiplyScalar(0.25 + profile.fixtureGlow * reveal * 0.75)
		light.r += profile.moonColor[0] * profile.moonGlow * 0.15
		light.g += profile.moonColor[1] * profile.moonGlow * 0.15
		light.b += profile.moonColor[2] * profile.moonGlow * 0.15
		;(surface.uniforms.uDeep!.value as Color).setRGB(...profile.waterColor)
		;(surface.uniforms.uSky!.value as Color).setRGB(...profile.backdropTop)
		;(meniscus.uniforms.uLight!.value as Color).copy(light)
		fixtureGlow.emissive.setRGB(...profile.keyColor)
		fixtureGlow.emissiveIntensity = profile.fixtureGlow * reveal * 1.1
		moonStrip.emissiveIntensity = profile.moonGlow * 1.2
		if (mark) mark.uniforms.uLight!.value = profile.environmentIntensity * 2
	})

	const fixtureY = H + 0.16
	return (
		<group>
			{/* Glass */}
			{PANES.map((pane, i) => (
				<mesh
					key={`pane-${i}`}
					geometry={paneGeometries[i]}
					material={glass}
					position={pane.position}
					renderOrder={10}
				/>
			))}
			{EDGES.map((pane, i) => (
				<mesh
					key={`edge-${i}`}
					geometry={edgeGeometries[i]}
					material={edge}
					position={pane.position}
					renderOrder={11}
				/>
			))}

			{/* Back-lit background film behind the rear glass. */}
			<mesh position={[0, H / 2, -D / 2 - 0.002]} material={backdrop}>
				<planeGeometry args={[W, H]} />
			</mesh>

			{/* Water surface and the meniscus line on the front glass. */}
			<mesh
				geometry={surfaceGeometry}
				material={surface}
				position={[0, TANK.waterLevel, 0]}
				renderOrder={5}
			/>
			<mesh
				position={[0, TANK.waterLevel, TANK_INTERIOR.maxZ - 0.0012]}
				material={meniscus}
				renderOrder={12}
			>
				<planeGeometry args={[TANK_INTERIOR.maxX - TANK_INTERIOR.minX, 0.005]} />
			</mesh>

			{/* Etched wordmark, lower right of the front glass. */}
			{mark && (
				<mesh position={[W / 2 - 0.085, 0.021, D / 2 + 0.0004]} material={mark} renderOrder={13}>
					<planeGeometry args={[0.1, 0.025]} />
				</mesh>
			)}

			{/* Cabinet */}
			<mesh position={[0, -0.452, 0]} receiveShadow>
				<boxGeometry args={[W + 0.04, 0.9, D + 0.06]} />
				<meshStandardMaterial color="#0d0e0f" roughness={0.55} metalness={0.1} />
			</mesh>

			{/* Pendant light fixture */}
			<group position={[0, fixtureY, 0.02]}>
				<mesh>
					<boxGeometry args={[W - 0.08, 0.012, 0.13]} />
					<meshStandardMaterial color="#1b1d1f" roughness={0.35} metalness={0.8} />
				</mesh>
				<mesh position={[0, -0.0065, 0.01]} rotation-x={Math.PI / 2} material={fixtureGlow}>
					<planeGeometry args={[W - 0.12, 0.08]} />
				</mesh>
				<mesh position={[0, -0.0066, -0.045]} rotation-x={Math.PI / 2} material={moonStrip}>
					<planeGeometry args={[W - 0.12, 0.006]} />
				</mesh>
				{[-0.45, 0.45].map((x) => (
					<mesh key={x} position={[x, 1, 0]}>
						<cylinderGeometry args={[0.0008, 0.0008, 2, 4]} />
						<meshBasicMaterial color="#2a2c2e" />
					</mesh>
				))}
			</group>
		</group>
	)
}
