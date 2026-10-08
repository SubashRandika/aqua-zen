"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useIdle } from "@/hooks/useIdle"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import { FEED_ARMED_SECONDS, feedNow, stopWatching } from "@/lib/aquariumActions"
import type { LightMode } from "@/simulation/core/events"
import type { AquariumWorld } from "@/simulation/core/World"
import { useSessionStore, type Panel } from "@/store/sessionStore"
import { useSettingsStore } from "@/store/settingsStore"
import { DayTimeline } from "./DayTimeline"
import {
	AutoIcon,
	CameraIcon,
	FeedIcon,
	MoonIcon,
	SettingsIcon,
	SoundIcon,
	SunIcon,
	TankLightIcon,
} from "./Icons"
import { CameraPanel, SettingsPanel, SoundPanel } from "./panels"
import { cx, DockButton } from "./primitives"

/** Controls fade after this long without interaction. */
const IDLE_TIMEOUT_MS = 4500

const LIGHT_MODES: ReadonlyArray<{ mode: LightMode; label: string; icon: ReactNode }> = [
	{ mode: "auto", label: "Auto", icon: <AutoIcon /> },
	{ mode: "day", label: "Day", icon: <SunIcon /> },
	{ mode: "night", label: "Night", icon: <MoonIcon /> },
]

function LightModeSwitch() {
	const mode = useSettingsStore((s) => s.lightMode)
	const setMode = useSettingsStore((s) => s.setLightMode)
	const index = LIGHT_MODES.findIndex((m) => m.mode === mode)
	const select = (next: number) =>
		setMode(LIGHT_MODES[(next + LIGHT_MODES.length) % LIGHT_MODES.length]!.mode)
	return (
		<div
			role="radiogroup"
			aria-label="Lighting"
			className="flex items-center"
			onKeyDown={(event) => {
				if (event.key === "ArrowRight") select(index + 1)
				if (event.key === "ArrowLeft") select(index - 1)
			}}
		>
			{LIGHT_MODES.map((item) => {
				const checked = item.mode === mode
				return (
					<button
						key={item.mode}
						type="button"
						role="radio"
						aria-checked={checked}
						aria-label={item.label}
						tabIndex={checked ? 0 : -1}
						onClick={() => setMode(item.mode)}
						className={cx(
							"flex h-9 min-w-9 items-center justify-center gap-2 rounded-full px-2.5 text-[12.5px] transition-colors duration-300 sm:px-3",
							checked ? "text-mist bg-white/[0.11]" : "text-mist-dim hover:text-mist",
						)}
					>
						{item.icon}
						<span className="hidden md:inline" aria-hidden>
							{item.label}
						</span>
					</button>
				)
			})}
		</div>
	)
}

function TankLightButton() {
	const on = useSettingsStore((s) => s.tankLight)
	const setTankLight = useSettingsStore((s) => s.setTankLight)
	return (
		<DockButton
			icon={
				<span className={cx("transition-colors duration-500", on && "text-lamp")}>
					<TankLightIcon on={on} />
				</span>
			}
			label="Tank light"
			active={on}
			aria-pressed={on}
			onClick={() => setTankLight(!on)}
		/>
	)
}

function useFeedArming(): void {
	const armed = useSessionStore((s) => s.feedArmed)
	const armedAt = useSessionStore((s) => s.feedArmedAt)
	useEffect(() => {
		if (!armed) return
		const timer = window.setTimeout(
			() => useSessionStore.getState().setFeedArmed(false),
			FEED_ARMED_SECONDS * 1000,
		)
		return () => window.clearTimeout(timer)
	}, [armed, armedAt])
}

/**
 * The minimal interface: a wordmark with the light timeline at the top, a
 * single glass dock at the bottom. Everything fades away when the user is
 * just watching, and returns on any interaction.
 */
export function ControlDock({ world }: { world: AquariumWorld }) {
	const idle = useIdle(IDLE_TIMEOUT_MS)
	const reducedMotion = useReducedMotion()
	const revealed = useSessionStore((s) => s.revealed)
	const openPanel = useSessionStore((s) => s.openPanel)
	const setOpenPanel = useSessionStore((s) => s.setOpenPanel)
	const feedArmed = useSessionStore((s) => s.feedArmed)
	const follow = useSessionStore((s) => s.follow)
	const sound = useSettingsStore((s) => s.audio.sound)
	const music = useSettingsStore((s) => s.audio.music)
	const [hidden, setHidden] = useState(false)
	const [focusWithin, setFocusWithin] = useState(false)
	const dockRef = useRef<HTMLElement>(null)

	const toggleHidden = useCallback(() => setHidden((h) => !h), [])
	useKeyboardShortcuts(world, toggleHidden)
	useFeedArming()

	const visible = revealed && !hidden && (!idle || openPanel !== null || feedArmed || focusWithin)

	useEffect(() => {
		// Hide the cursor too while simply watching.
		document.body.style.cursor = revealed && !visible ? "none" : ""
		return () => {
			document.body.style.cursor = ""
		}
	}, [revealed, visible])

	// Close panels when clicking elsewhere.
	useEffect(() => {
		if (!openPanel) return
		const onPointerDown = (event: PointerEvent) => {
			if (dockRef.current && !dockRef.current.contains(event.target as Node)) setOpenPanel(null)
		}
		window.addEventListener("pointerdown", onPointerDown)
		return () => window.removeEventListener("pointerdown", onPointerDown)
	}, [openPanel, setOpenPanel])

	const togglePanel = (panel: Exclude<Panel, null>) =>
		setOpenPanel(openPanel === panel ? null : panel)

	const onFeed = () => {
		const session = useSessionStore.getState()
		if (session.feedArmed) {
			session.setFeedArmed(false)
			return
		}
		feedNow(world)
		session.armFeeding()
	}

	const fade = { duration: reducedMotion ? 0.15 : 0.9, ease: [0.32, 0.72, 0, 1] as const }

	return (
		<>
			<motion.header
				className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center pt-[max(1.25rem,env(safe-area-inset-top))]"
				initial={{ opacity: 0 }}
				animate={{ opacity: visible ? 1 : 0 }}
				transition={fade}
				aria-hidden={!visible}
			>
				<p className="wordmark text-mist/80 pl-[0.32em] text-[13px]">AquaZen</p>
				<div className="mt-3">
					<DayTimeline world={world} />
				</div>
			</motion.header>

			<AnimatePresence>
				{revealed && (feedArmed || follow) && (
					<motion.div
						key={follow ? "follow" : "feed"}
						className="absolute inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-4"
						initial={{ opacity: 0, y: reducedMotion ? 0 : 4 }}
						animate={{ opacity: visible || feedArmed ? 1 : 0.4, y: 0 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.4 }}
					>
						{follow ? (
							<p className="glass-panel text-mist-dim flex items-center gap-3 rounded-full py-1.5 pr-1.5 pl-4 text-[12.5px]">
								Watching a {follow.label}
								<button
									type="button"
									onClick={stopWatching}
									className="text-mist rounded-full px-3 py-1 transition-colors hover:bg-white/10"
								>
									Stop
								</button>
							</p>
						) : (
							<p className="bg-ink/40 text-mist-dim rounded-full px-4 py-1.5 text-[12.5px] backdrop-blur-sm">
								Tap the water to add more food
							</p>
						)}
					</motion.div>
				)}
			</AnimatePresence>

			<motion.nav
				ref={dockRef}
				aria-label="Aquarium controls"
				className={cx(
					"absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]",
					!visible && "pointer-events-none",
				)}
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: visible ? 1 : 0, y: visible || reducedMotion ? 0 : 6 }}
				transition={fade}
				onFocus={() => setFocusWithin(true)}
				onBlur={(event) => {
					if (!event.currentTarget.contains(event.relatedTarget as Node | null))
						setFocusWithin(false)
				}}
			>
				<AnimatePresence mode="wait">
					{openPanel === "sound" && <SoundPanel key="sound" onClose={() => setOpenPanel(null)} />}
					{openPanel === "camera" && (
						<CameraPanel key="camera" world={world} onClose={() => setOpenPanel(null)} />
					)}
					{openPanel === "settings" && (
						<SettingsPanel key="settings" onClose={() => setOpenPanel(null)} />
					)}
				</AnimatePresence>

				<div className="glass-panel flex items-center gap-0.5 rounded-full p-1">
					<LightModeSwitch />
					<TankLightButton />
					<span aria-hidden className="bg-hairline mx-1 h-5 w-px" />
					<DockButton
						icon={<FeedIcon />}
						label="Feed"
						active={feedArmed}
						aria-pressed={feedArmed}
						onClick={onFeed}
					/>
					<DockButton
						icon={<SoundIcon muted={!sound && !music} />}
						label="Sound"
						active={openPanel === "sound"}
						aria-expanded={openPanel === "sound"}
						aria-haspopup="dialog"
						onClick={() => togglePanel("sound")}
					/>
					<DockButton
						icon={<CameraIcon />}
						label="View"
						active={openPanel === "camera"}
						aria-expanded={openPanel === "camera"}
						aria-haspopup="dialog"
						onClick={() => togglePanel("camera")}
					/>
					<DockButton
						icon={<SettingsIcon />}
						label="Settings"
						active={openPanel === "settings"}
						aria-expanded={openPanel === "settings"}
						aria-haspopup="dialog"
						onClick={() => togglePanel("settings")}
					/>
				</div>
			</motion.nav>
		</>
	)
}
