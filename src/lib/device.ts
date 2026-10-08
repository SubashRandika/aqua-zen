import type { QualityLevel } from "@/config/quality"

export interface DeviceProfile {
	isMobile: boolean
	isTablet: boolean
	/** Approximate memory in GB, when the browser exposes it. */
	memory: number | null
	cores: number | null
	pixelRatio: number
	/** Physical pixels the canvas would cover at full DPR. */
	screenPixels: number
	gpuRenderer: string | null
	/** True for software rasterisers and known weak integrated GPUs. */
	weakGpu: boolean
}

export interface DeviceSignals {
	userAgent: string
	maxTouchPoints: number
	deviceMemory?: number
	hardwareConcurrency?: number
	devicePixelRatio: number
	screenWidth: number
	screenHeight: number
	gpuRenderer: string | null
}

const WEAK_GPU =
	/swiftshader|llvmpipe|software|mali-4|mali-t|adreno \(tm\) [345]\d\d|powervr|intel\(r\) (hd|uhd) graphics [2-6]\d\d\b/i

export function profileDevice(signals: DeviceSignals): DeviceProfile {
	const ua = signals.userAgent
	const isTablet = /ipad|tablet/i.test(ua) || (/macintosh/i.test(ua) && signals.maxTouchPoints > 1)
	const isMobile = !isTablet && /android|iphone|ipod|mobile/i.test(ua)
	const shortSide = Math.min(signals.screenWidth, signals.screenHeight)
	const longSide = Math.max(signals.screenWidth, signals.screenHeight)
	return {
		isMobile,
		isTablet,
		memory: signals.deviceMemory ?? null,
		cores: signals.hardwareConcurrency ?? null,
		pixelRatio: signals.devicePixelRatio,
		screenPixels: shortSide * longSide * signals.devicePixelRatio ** 2,
		gpuRenderer: signals.gpuRenderer,
		weakGpu: signals.gpuRenderer ? WEAK_GPU.test(signals.gpuRenderer) : false,
	}
}

/**
 * Initial quality guess before any frame-rate measurement. Auto mode then
 * refines it from the measured frame rate.
 */
export function recommendQuality(profile: DeviceProfile): QualityLevel {
	if (profile.weakGpu) return "low"
	if (profile.memory !== null && profile.memory <= 2) return "low"
	if (profile.isMobile) return profile.memory !== null && profile.memory >= 6 ? "medium" : "low"
	if (profile.isTablet) return "medium"
	if (profile.cores !== null && profile.cores <= 4) return "medium"
	// Very large high-DPR screens are expensive even on capable GPUs.
	if (profile.screenPixels > 3840 * 2160 * 1.1) return "high"
	return "high"
}

function readGpuRenderer(): string | null {
	try {
		const canvas = document.createElement("canvas")
		const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl")
		if (!gl) return null
		const info = gl.getExtension("WEBGL_debug_renderer_info")
		const renderer = info
			? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
			: gl.getParameter(gl.RENDERER)
		gl.getExtension("WEBGL_lose_context")?.loseContext()
		return typeof renderer === "string" ? renderer : null
	} catch {
		return null
	}
}

/** Reads device signals from the browser. Client-only. */
export function detectDevice(): DeviceProfile {
	const nav = navigator as Navigator & { deviceMemory?: number }
	return profileDevice({
		userAgent: nav.userAgent,
		maxTouchPoints: nav.maxTouchPoints ?? 0,
		deviceMemory: nav.deviceMemory,
		hardwareConcurrency: nav.hardwareConcurrency,
		devicePixelRatio: window.devicePixelRatio || 1,
		screenWidth: window.screen?.width ?? window.innerWidth,
		screenHeight: window.screen?.height ?? window.innerHeight,
		gpuRenderer: readGpuRenderer(),
	})
}

/** AquaZen requires WebGL 2 (three.js no longer supports WebGL 1). */
export function isWebGL2Available(): boolean {
	try {
		const canvas = document.createElement("canvas")
		const gl = canvas.getContext("webgl2")
		const available = !!gl
		gl?.getExtension("WEBGL_lose_context")?.loseContext()
		return available
	} catch {
		return false
	}
}
