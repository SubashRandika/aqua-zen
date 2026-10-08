export type QualityLevel = "ultra" | "high" | "medium" | "low"
export type QualitySetting = QualityLevel | "auto"

export const QUALITY_LEVELS: readonly QualityLevel[] = ["low", "medium", "high", "ultra"]

export interface QualityPreset {
	level: QualityLevel
	/** Device pixel ratio range; adaptive rendering moves within it. */
	dpr: readonly [number, number]
	/** Fish population relative to the species' configured counts. */
	fishDensity: number
	/** Geometry detail of the procedural fish (segments around / along the body). */
	fishDetail: { radial: number; lengthwise: number }
	shadows: boolean
	shadowMapSize: number
	/** Fraction of configured plant counts to grow. */
	plantDensity: number
	rockDetail: number
	suspendedParticles: number
	bubbles: number
	/** Number of caustic layers in surface shaders (1 or 2). */
	causticLayers: 1 | 2
	lightShafts: boolean
	waterSurfaceSegments: number
	postProcessing: { bloom: boolean; vignette: boolean; grain: boolean; multisampling: number }
	/** Multiplier applied to fish LOD switch distances. */
	lodScale: number
	antialias: boolean
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
	ultra: {
		level: "ultra",
		dpr: [1, 2],
		fishDensity: 1.25,
		fishDetail: { radial: 16, lengthwise: 32 },
		shadows: true,
		shadowMapSize: 2048,
		plantDensity: 1,
		rockDetail: 5,
		suspendedParticles: 900,
		bubbles: 160,
		causticLayers: 2,
		lightShafts: true,
		waterSurfaceSegments: 160,
		postProcessing: { bloom: true, vignette: true, grain: true, multisampling: 4 },
		lodScale: 1.35,
		antialias: true,
	},
	high: {
		level: "high",
		dpr: [1, 1.75],
		fishDensity: 1,
		fishDetail: { radial: 14, lengthwise: 28 },
		shadows: true,
		shadowMapSize: 1024,
		plantDensity: 0.85,
		rockDetail: 4,
		suspendedParticles: 600,
		bubbles: 110,
		causticLayers: 2,
		lightShafts: true,
		waterSurfaceSegments: 112,
		postProcessing: { bloom: true, vignette: true, grain: true, multisampling: 2 },
		lodScale: 1.2,
		antialias: true,
	},
	medium: {
		level: "medium",
		dpr: [1, 1.5],
		fishDensity: 0.75,
		fishDetail: { radial: 12, lengthwise: 22 },
		shadows: true,
		shadowMapSize: 512,
		plantDensity: 0.62,
		rockDetail: 4,
		suspendedParticles: 350,
		bubbles: 70,
		causticLayers: 1,
		lightShafts: true,
		waterSurfaceSegments: 72,
		postProcessing: { bloom: false, vignette: true, grain: false, multisampling: 0 },
		lodScale: 1,
		antialias: true,
	},
	low: {
		level: "low",
		dpr: [0.75, 1],
		fishDensity: 0.5,
		fishDetail: { radial: 10, lengthwise: 16 },
		shadows: false,
		shadowMapSize: 512,
		plantDensity: 0.42,
		rockDetail: 3,
		suspendedParticles: 160,
		bubbles: 40,
		causticLayers: 1,
		lightShafts: false,
		waterSurfaceSegments: 48,
		postProcessing: { bloom: false, vignette: false, grain: false, multisampling: 0 },
		lodScale: 0.8,
		antialias: false,
	},
}

/** Reduced-effects mode strips motion-heavy and costly extras while keeping the scene intact. */
export function applyReducedEffects(preset: QualityPreset): QualityPreset {
	return {
		...preset,
		suspendedParticles: Math.round(preset.suspendedParticles * 0.4),
		bubbles: Math.round(preset.bubbles * 0.5),
		lightShafts: false,
		postProcessing: { ...preset.postProcessing, bloom: false, grain: false },
	}
}

export function stepQuality(level: QualityLevel, direction: -1 | 1): QualityLevel {
	const index = QUALITY_LEVELS.indexOf(level)
	const next = Math.min(QUALITY_LEVELS.length - 1, Math.max(0, index + direction))
	return QUALITY_LEVELS[next]!
}

/** Frame-rate thresholds used by adaptive quality in "auto". */
export const ADAPTIVE_QUALITY = {
	/** Average FPS below which quality steps down. */
	lowerBound: 45,
	/** Average FPS above which quality may step up. */
	upperBound: 58,
	/** After this many up/down changes, adaptive quality settles. */
	maxFlips: 3,
} as const
