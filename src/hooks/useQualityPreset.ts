"use client"

import { useMemo } from "react"
import { applyReducedEffects, QUALITY_PRESETS, type QualityPreset } from "@/config/quality"
import { useSessionStore } from "@/store/sessionStore"
import { useSettingsStore } from "@/store/settingsStore"

/** The quality preset currently in effect, including the reduced-effects option. */
export function useQualityPreset(): QualityPreset {
	const level = useSessionStore((s) => s.activeQuality)
	const reducedEffects = useSettingsStore((s) => s.accessibility.reducedEffects)
	return useMemo(() => {
		const preset = QUALITY_PRESETS[level]
		return reducedEffects ? applyReducedEffects(preset) : preset
	}, [level, reducedEffects])
}
