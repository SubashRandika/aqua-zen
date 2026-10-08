import { Color, type BufferGeometry } from "three"
import type { QualityPreset } from "@/config/quality"
import { DRIFTWOOD, ROCKS } from "@/config/scape"
import { SPECIES } from "@/config/species"
import { createDriftwoodGeometry } from "./geometry/driftwoodGeometry"
import { createFishGeometry, lowDetail, type FishGeometrySet } from "./geometry/fishGeometry"
import {
	createBladeGeometry,
	createLeafGeometry,
	createStemGeometry,
	createStemLeafGeometry,
} from "./geometry/plantGeometry"
import { placePlants, type PlantInstances } from "./geometry/plantPlacement"
import { createRockGeometry } from "./geometry/rockGeometry"
import { createSubstrateGeometry, createSubstrateSkirtGeometry } from "./geometry/substrateGeometry"

export interface ScapeAssets {
	substrate: BufferGeometry
	skirt: BufferGeometry
	rocks: BufferGeometry[]
	driftwood: BufferGeometry[]
}

export interface PlantAssets {
	instances: PlantInstances
	vallisneria: BufferGeometry
	hairgrass: BufferGeometry
	rosetteLeaf: BufferGeometry
	stem: BufferGeometry
	stemLeaf: BufferGeometry
}

export interface FishAssets {
	geometries: Map<string, { near: FishGeometrySet; far: FishGeometrySet }>
}

export type LoadingStep = "scape" | "plants" | "fish"

/**
 * Procedural assets are expensive enough to matter on slow devices, so they
 * are generated once per quality level and cached. `prepareAssets` builds
 * them stage by stage (yielding to the browser between stages) so the
 * loading screen can report real progress.
 */
const scapeCache = new Map<number, ScapeAssets>()
const plantCache = new Map<number, PlantAssets>()
const fishCache = new Map<string, FishAssets>()

export function getScapeAssets(preset: QualityPreset): ScapeAssets {
	const key = preset.rockDetail
	let assets = scapeCache.get(key)
	if (!assets) {
		const resolution = preset.rockDetail >= 5 ? 1 : preset.rockDetail >= 4 ? 0.75 : 0.5
		assets = {
			substrate: createSubstrateGeometry(Math.round(220 * resolution), Math.round(96 * resolution)),
			skirt: createSubstrateSkirtGeometry(Math.round(160 * resolution)),
			rocks: ROCKS.map((rock) => createRockGeometry(rock, preset.rockDetail)),
			driftwood: DRIFTWOOD.map((wood) =>
				createDriftwoodGeometry(wood, preset.rockDetail >= 4 ? 12 : 8),
			),
		}
		scapeCache.set(key, assets)
	}
	return assets
}

export function getPlantAssets(preset: QualityPreset): PlantAssets {
	const key = preset.plantDensity
	let assets = plantCache.get(key)
	if (!assets) {
		assets = {
			instances: placePlants(preset.plantDensity),
			vallisneria: createBladeGeometry(
				preset.level === "low" ? 5 : 9,
				new Color("#1d3517"),
				new Color("#6a8f44"),
			),
			hairgrass: createBladeGeometry(3, new Color("#2c4a1f"), new Color("#7ea353")),
			rosetteLeaf: createLeafGeometry(
				preset.level === "low" ? 6 : 10,
				1.1,
				new Color("#22401c"),
				new Color("#4f7d35"),
			),
			stem: createStemGeometry(new Color("#56703a")),
			stemLeaf: createStemLeafGeometry(new Color("#3f6c2c"), new Color("#6f9a48")),
		}
		plantCache.set(key, assets)
	}
	return assets
}

export function getFishAssets(preset: QualityPreset): FishAssets {
	const key = `${preset.fishDetail.radial}:${preset.fishDetail.lengthwise}`
	let assets = fishCache.get(key)
	if (!assets) {
		const geometries = new Map<string, { near: FishGeometrySet; far: FishGeometrySet }>()
		for (const species of SPECIES) {
			geometries.set(species.id, {
				near: createFishGeometry(species.visual.shape, preset.fishDetail),
				far: createFishGeometry(species.visual.shape, lowDetail(preset.fishDetail)),
			})
		}
		assets = { geometries }
		fishCache.set(key, assets)
	}
	return assets
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

export async function prepareAssets(
	preset: QualityPreset,
	onStep: (step: LoadingStep) => void,
): Promise<void> {
	onStep("scape")
	await nextFrame()
	getScapeAssets(preset)
	onStep("plants")
	await nextFrame()
	getPlantAssets(preset)
	onStep("fish")
	await nextFrame()
	getFishAssets(preset)
	await nextFrame()
}
