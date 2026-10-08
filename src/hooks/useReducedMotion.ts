"use client"

import { useSyncExternalStore } from "react"
import { useSettingsStore } from "@/store/settingsStore"

const QUERY = "(prefers-reduced-motion: reduce)"

function subscribe(callback: () => void): () => void {
	const media = window.matchMedia(QUERY)
	media.addEventListener("change", callback)
	return () => media.removeEventListener("change", callback)
}

function systemPrefersReducedMotion(): boolean {
	return window.matchMedia(QUERY).matches
}

/** Whether to minimise motion: the user's in-app choice, falling back to the OS setting. */
export function useReducedMotion(): boolean {
	const preference = useSettingsStore((s) => s.accessibility.reducedMotion)
	const system = useSyncExternalStore(subscribe, systemPrefersReducedMotion, () => false)
	if (preference === "on") return true
	if (preference === "off") return false
	return system
}
