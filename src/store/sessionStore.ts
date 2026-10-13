import { create } from "zustand"
import type { QualityLevel } from "@/config/quality"
import type { DayPhase } from "@/simulation/core/events"

export type LoadingStage = "scape" | "plants" | "fish" | "lights" | "ready"
export type Panel = "fish" | "sound" | "camera" | "settings" | null
export type AudioStatus = "idle" | "running" | "suspended" | "unavailable"

export interface FollowTarget {
	fishId: number
	label: string
}

interface SessionState {
	loadingStage: LoadingStage
	/** True once the scene has compiled and the loader has faded. */
	revealed: boolean
	/** Quality actually in use (resolved from "auto"). */
	activeQuality: QualityLevel
	feedArmed: boolean
	/** When feeding was last armed or used; the arming lapses a few seconds later. */
	feedArmedAt: number
	controlsVisible: boolean
	openPanel: Panel
	contextLost: boolean
	phase: DayPhase
	audioStatus: AudioStatus
	follow: FollowTarget | null
	/** Incremented to ask the camera rig to return to the default view. */
	cameraResetToken: number
	/** Short message for screen readers. */
	announcement: string

	setLoadingStage: (stage: LoadingStage) => void
	setRevealed: (revealed: boolean) => void
	setActiveQuality: (level: QualityLevel) => void
	setFeedArmed: (armed: boolean) => void
	armFeeding: () => void
	setControlsVisible: (visible: boolean) => void
	setOpenPanel: (panel: Panel) => void
	setContextLost: (lost: boolean) => void
	setPhase: (phase: DayPhase) => void
	setAudioStatus: (status: AudioStatus) => void
	setFollow: (follow: FollowTarget | null) => void
	requestCameraReset: () => void
	announce: (message: string) => void
}

/** Transient, non-persisted UI state. Changes rarely — never per frame. */
export const useSessionStore = create<SessionState>()((set) => ({
	loadingStage: "scape",
	revealed: false,
	activeQuality: "high",
	feedArmed: false,
	feedArmedAt: 0,
	controlsVisible: true,
	openPanel: null,
	contextLost: false,
	phase: "morning",
	audioStatus: "idle",
	follow: null,
	cameraResetToken: 0,
	announcement: "",

	setLoadingStage: (loadingStage) => set({ loadingStage }),
	setRevealed: (revealed) => set({ revealed }),
	setActiveQuality: (activeQuality) => set({ activeQuality }),
	setFeedArmed: (feedArmed) => set({ feedArmed }),
	armFeeding: () => set({ feedArmed: true, feedArmedAt: Date.now() }),
	setControlsVisible: (controlsVisible) => set({ controlsVisible }),
	setOpenPanel: (openPanel) => set({ openPanel }),
	setContextLost: (contextLost) => set({ contextLost }),
	setPhase: (phase) => set({ phase }),
	setAudioStatus: (audioStatus) => set({ audioStatus }),
	setFollow: (follow) => set({ follow }),
	requestCameraReset: () =>
		set((s) => ({ cameraResetToken: s.cameraResetToken + 1, follow: null })),
	// A trailing space alternates the text so repeated messages are still announced.
	announce: (message) =>
		set((s) => ({ announcement: s.announcement === message ? `${message} ` : message })),
}))
