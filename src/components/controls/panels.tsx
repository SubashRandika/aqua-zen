"use client"

import { useId } from "react"
import { DAY_CYCLE, type CycleMinutes } from "@/config/dayNight"
import type { QualitySetting } from "@/config/quality"
import { watchAFish } from "@/lib/aquariumActions"
import type { AquariumWorld } from "@/simulation/core/World"
import { useSessionStore } from "@/store/sessionStore"
import { useSettingsStore } from "@/store/settingsStore"
import { Panel } from "./Panel"
import { QuietAction, Segmented, Switch, type SegmentOption } from "./primitives"

export function SoundPanel({ onClose }: { onClose: () => void }) {
	const audio = useSettingsStore((s) => s.audio)
	const setSound = useSettingsStore((s) => s.setSound)
	const setMusic = useSettingsStore((s) => s.setMusic)
	const setVolume = useSettingsStore((s) => s.setVolume)
	const status = useSessionStore((s) => s.audioStatus)
	const volumeId = useId()
	const percent = Math.round(audio.volume * 100)
	return (
		<Panel title="Sound" onClose={onClose}>
			<Switch
				label="Water sounds"
				description="Gentle water, bubbles and the hum of the room"
				checked={audio.sound}
				onChange={setSound}
			/>
			<Switch
				label="Music"
				description="Slow, generative and never the same twice"
				checked={audio.music}
				onChange={setMusic}
			/>
			<div className="py-2">
				<div className="flex items-baseline justify-between">
					<label htmlFor={volumeId} className="text-mist text-[13px]">
						Volume
					</label>
					<span className="text-mist-faint font-mono text-[11px]">{percent}%</span>
				</div>
				<input
					id={volumeId}
					type="range"
					min={0}
					max={100}
					step={1}
					value={percent}
					onChange={(event) => setVolume(Number(event.target.value) / 100)}
					className="az-range mt-1 w-full"
					style={{ ["--fill" as string]: `${percent}%` }}
				/>
			</div>
			{status === "unavailable" && (
				<p className="text-mist-faint pb-1 text-[12px]">Audio isn’t available in this browser.</p>
			)}
		</Panel>
	)
}

export function CameraPanel({ world, onClose }: { world: AquariumWorld; onClose: () => void }) {
	const mode = useSettingsStore((s) => s.camera.mode)
	const cinematic = useSettingsStore((s) => s.camera.cinematicMotion)
	const setMode = useSettingsStore((s) => s.setCameraMode)
	const setCinematic = useSettingsStore((s) => s.setCinematicMotion)
	const follow = useSessionStore((s) => s.follow)
	const requestReset = useSessionStore((s) => s.requestCameraReset)
	return (
		<Panel title="View" onClose={onClose}>
			<Segmented
				label="Camera"
				value={mode}
				onChange={(value) => {
					if (follow) requestReset()
					setMode(value)
				}}
				options={[
					{ value: "window", label: "Seated" },
					{ value: "explore", label: "Explore" },
				]}
				hint={
					mode === "explore"
						? "Drag to look around · scroll or pinch to zoom"
						: "A still view, as if sitting in front of the tank"
				}
			/>
			<Switch
				label="Gentle camera motion"
				description="A slow drift and slight parallax in the seated view"
				checked={cinematic}
				onChange={setCinematic}
			/>
			<div className="flex flex-wrap gap-2 pt-2 pb-1">
				<QuietAction onClick={() => watchAFish(world, follow?.fishId)}>
					{follow ? "Watch another fish" : "Watch a fish"}
				</QuietAction>
				<QuietAction onClick={requestReset}>Reset view</QuietAction>
			</div>
		</Panel>
	)
}

const QUALITY_OPTIONS: ReadonlyArray<SegmentOption<QualitySetting>> = [
	{ value: "auto", label: "Auto" },
	{ value: "low", label: "Low" },
	{ value: "medium", label: "Medium" },
	{ value: "high", label: "High" },
	{ value: "ultra", label: "Ultra" },
]

const CYCLE_LABELS: Record<CycleMinutes, string> = {
	12: "12 min",
	24: "24 min",
	60: "1 hour",
	0: "Local time",
}

const SHORTCUTS: ReadonlyArray<[string, string]> = [
	["F", "Feed"],
	["A · D · N", "Auto, day, night"],
	["M", "Sound on or off"],
	["C", "Seated or explore"],
	["W", "Watch a fish"],
	["R", "Reset view"],
	["H", "Hide controls"],
]

export function SettingsPanel({ onClose }: { onClose: () => void }) {
	const quality = useSettingsStore((s) => s.quality)
	const cycle = useSettingsStore((s) => s.cycleMinutes)
	const reducedMotion = useSettingsStore((s) => s.accessibility.reducedMotion)
	const reducedEffects = useSettingsStore((s) => s.accessibility.reducedEffects)
	const setQuality = useSettingsStore((s) => s.setQuality)
	const setCycle = useSettingsStore((s) => s.setCycleMinutes)
	const setReducedMotion = useSettingsStore((s) => s.setReducedMotion)
	const setReducedEffects = useSettingsStore((s) => s.setReducedEffects)
	const active = useSessionStore((s) => s.activeQuality)
	const activeLabel = active.charAt(0).toUpperCase() + active.slice(1)

	return (
		<Panel title="Settings" onClose={onClose}>
			<Segmented
				label="Quality"
				value={quality}
				options={QUALITY_OPTIONS}
				onChange={(value) => {
					setQuality(value)
					if (value !== "auto") useSessionStore.getState().setActiveQuality(value)
				}}
				hint={quality === "auto" ? `Now ${activeLabel}` : undefined}
			/>
			<Segmented
				label="Length of a day"
				value={cycle}
				options={DAY_CYCLE.cycleOptions.map((value) => ({ value, label: CYCLE_LABELS[value] }))}
				onChange={setCycle}
			/>
			<Segmented
				label="Reduce motion"
				value={reducedMotion}
				options={[
					{ value: "system", label: "Match system" },
					{ value: "on", label: "On" },
					{ value: "off", label: "Off" },
				]}
				onChange={setReducedMotion}
			/>
			<Switch
				label="Reduce effects"
				description="Fewer particles, no light shafts or bloom"
				checked={reducedEffects}
				onChange={setReducedEffects}
			/>
			<details className="group border-hairline mt-1 border-t pt-2 pb-1">
				<summary className="text-mist-faint hover:text-mist-dim cursor-pointer list-none text-[12px] transition-colors">
					Keyboard shortcuts
				</summary>
				<dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
					{SHORTCUTS.map(([keys, action]) => (
						<div key={keys} className="contents">
							<dt className="text-mist-dim font-mono text-[11px]">{keys}</dt>
							<dd className="text-mist-faint">{action}</dd>
						</div>
					))}
				</dl>
			</details>
		</Panel>
	)
}
