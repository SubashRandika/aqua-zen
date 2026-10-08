"use client"

import { useEffect, useState } from "react"
import { mod } from "@/simulation/core/math"
import type { DayPhase } from "@/simulation/core/events"
import type { AquariumWorld } from "@/simulation/core/World"
import { useSessionStore } from "@/store/sessionStore"
import { useSettingsStore } from "@/store/settingsStore"

const PHASE_LABEL: Record<DayPhase, string> = {
	night: "Night",
	sunrise: "Sunrise",
	morning: "Morning",
	day: "Day",
	afternoon: "Afternoon",
	sunset: "Sunset",
	evening: "Evening",
}

function formatClock(hour: number): string {
	const h = Math.floor(mod(hour, 24))
	const m = Math.floor((mod(hour, 24) - h) * 60)
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/**
 * The aquarium's light controller, as a hairline: a single line for the
 * day with a dot at the simulated hour — warm while the lamp is on, pale
 * blue under moonlight. Updated once a second, never per frame.
 */
export function DayTimeline({ world }: { world: AquariumWorld }) {
	const phase = useSessionStore((s) => s.phase)
	const mode = useSettingsStore((s) => s.lightMode)
	const [hour, setHour] = useState(world.clock.hour)
	const [daylight, setDaylight] = useState(world.lighting.current.daylight)

	useEffect(() => {
		const timer = window.setInterval(() => {
			setHour(world.clock.hour)
			setDaylight(world.lighting.current.daylight)
		}, 1000)
		return () => window.clearInterval(timer)
	}, [world])

	const position = mod(hour, 24) / 24
	const isDay = daylight > 0.35
	const label =
		mode === "auto"
			? `${PHASE_LABEL[phase]} · ${formatClock(hour)}`
			: mode === "day"
				? "Lights on"
				: "Moonlight"

	return (
		<div
			className="flex flex-col items-center gap-2"
			aria-label={`Aquarium time: ${label}`}
			role="group"
		>
			<div className="bg-hairline-strong relative h-px w-24" aria-hidden>
				{mode === "auto" && (
					<span
						className="absolute top-1/2 size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left,background-color,box-shadow] duration-1000"
						style={{
							left: `${position * 100}%`,
							backgroundColor: isDay ? "var(--color-lamp)" : "var(--color-moon)",
							boxShadow: `0 0 8px ${isDay ? "rgb(232 192 138 / 0.6)" : "rgb(159 184 214 / 0.5)"}`,
						}}
					/>
				)}
			</div>
			<p className="text-mist-faint font-mono text-[10.5px] tracking-[0.08em]">{label}</p>
		</div>
	)
}
