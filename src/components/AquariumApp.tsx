"use client"

import dynamic from "next/dynamic"
import { useEffect, useState, useSyncExternalStore } from "react"
import { applyReducedEffects, QUALITY_PRESETS } from "@/config/quality"
import { useAudio } from "@/hooks/useAudio"
import { useWorldSync } from "@/hooks/useWorldSync"
import { detectDevice, isWebGL2Available, recommendQuality } from "@/lib/device"
import { AquariumWorld } from "@/simulation/core/World"
import { useSessionStore } from "@/store/sessionStore"
import { useSettingsStore } from "@/store/settingsStore"
import { prepareAssets } from "@/three/assets"
import { ControlDock } from "./controls/ControlDock"
import { ContextLostOverlay } from "./ui/ContextLostOverlay"
import { ErrorBoundary } from "./ui/ErrorBoundary"
import { LiveAnnouncer } from "./ui/LiveAnnouncer"
import { LoadingScreen } from "./ui/LoadingScreen"
import { StartupError } from "./ui/StartupError"
import { WebGLFallback } from "./ui/WebGLFallback"

const AquariumCanvas = dynamic(
	() => import("./aquarium/AquariumCanvas").then((m) => m.AquariumCanvas),
	{ ssr: false },
)

/** WebGL support never changes during a session, so it is checked once and cached. */
let webglSupport: boolean | null = null
const subscribeNever = () => () => {}
const readWebGLSupport = () => (webglSupport ??= isWebGL2Available())
const serverWebGLSupport = () => null

/**
 * Client entry point. Checks for WebGL 2, chooses a starting quality for
 * the device, creates the simulation and prepares assets, then hands over
 * to the 3D scene and the controls.
 */
export function AquariumApp() {
	const webgl = useSyncExternalStore(subscribeNever, readWebGLSupport, serverWebGLSupport)
	const [world, setWorld] = useState<AquariumWorld | null>(null)
	const [failed, setFailed] = useState(false)
	useWorldSync(world)
	useAudio(world)

	useEffect(() => {
		if (!webgl) return
		let cancelled = false
		const settings = useSettingsStore.getState()
		const session = useSessionStore.getState()
		const level = settings.quality === "auto" ? recommendQuality(detectDevice()) : settings.quality
		session.setActiveQuality(level)
		const basePreset = QUALITY_PRESETS[level]
		const preset = settings.accessibility.reducedEffects
			? applyReducedEffects(basePreset)
			: basePreset
		const created = new AquariumWorld({
			populationDensity: preset.fishDensity,
			hour: settings.aquariumHour,
			cycleMinutes: settings.cycleMinutes,
			lightMode: settings.lightMode,
		})
		prepareAssets(preset, (step) => {
			if (!cancelled) useSessionStore.getState().setLoadingStage(step)
		})
			.then(() => {
				if (cancelled) return
				setWorld(created)
			})
			.catch(() => {
				if (!cancelled) setFailed(true)
			})
		return () => {
			cancelled = true
			created.dispose()
		}
	}, [webgl])

	const status = webgl === false ? "unsupported" : failed ? "failed" : "running"

	return (
		<main className="bg-ink fixed inset-0 overflow-hidden">
			<h1 className="sr-only">AquaZen — a virtual aquarium</h1>
			{status === "unsupported" && <WebGLFallback />}
			{status === "failed" && <StartupError />}
			{world && (
				<ErrorBoundary fallback={<StartupError />}>
					<AquariumCanvas world={world} />
				</ErrorBoundary>
			)}
			{status === "running" && <LoadingScreen />}
			{world && <ControlDock world={world} />}
			<ContextLostOverlay />
			<LiveAnnouncer />
		</main>
	)
}
