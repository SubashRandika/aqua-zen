"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useEffect } from "react"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import { useSessionStore, type LoadingStage } from "@/store/sessionStore"

const STAGES: ReadonlyArray<{ stage: Exclude<LoadingStage, "ready">; label: string }> = [
	{ stage: "scape", label: "Arranging stone and wood" },
	{ stage: "plants", label: "Planting" },
	{ stage: "fish", label: "Introducing the fish" },
	{ stage: "lights", label: "Preparing the water and light" },
]

/**
 * Minimal loader. Each step shown is real work in progress (procedural
 * generation, then shader compilation) — there is no simulated progress.
 */
export function LoadingScreen() {
	const stage = useSessionStore((s) => s.loadingStage)
	const revealed = useSessionStore((s) => s.revealed)
	const reducedMotion = useReducedMotion()
	const index = STAGES.findIndex((s) => s.stage === stage)
	const done = stage === "ready"
	const label = done ? "Welcome" : (STAGES[index]?.label ?? STAGES[0]!.label)

	useEffect(() => {
		if (!done) return
		// The loader fades as the aquarium lights come on.
		const timer = window.setTimeout(
			() => useSessionStore.getState().setRevealed(true),
			reducedMotion ? 100 : 900,
		)
		return () => window.clearTimeout(timer)
	}, [done, reducedMotion])

	return (
		<AnimatePresence>
			{!revealed && (
				<motion.div
					key="loader"
					className="bg-ink absolute inset-0 z-30 flex flex-col items-center justify-center"
					initial={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: reducedMotion ? 0.2 : 2.2, ease: [0.32, 0.72, 0, 1] }}
					role="status"
					aria-live="polite"
				>
					<p className="wordmark text-mist pl-[0.32em] text-[22px]">AquaZen</p>
					<div className="mt-9 grid h-5 place-items-center" aria-hidden>
						<div className="loader-ring border-mist-faint size-5 rounded-full border" />
					</div>
					<AnimatePresence mode="wait">
						<motion.p
							key={label}
							className="text-mist-dim mt-7 text-[13px] tracking-[0.02em]"
							initial={{ opacity: 0, y: 3 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -3 }}
							transition={{ duration: 0.5 }}
						>
							{label}
						</motion.p>
					</AnimatePresence>
					<ol className="mt-5 flex gap-1.5" aria-label="Loading steps">
						{STAGES.map((s, i) => {
							const complete = done || i < index
							const active = i === index && !done
							return (
								<li key={s.stage} className="bg-hairline h-px w-6 overflow-hidden">
									<span className="sr-only">
										{s.label}: {complete ? "done" : active ? "in progress" : "waiting"}
									</span>
									<span
										aria-hidden
										className="bg-mist block h-full transition-[width,opacity] duration-700"
										style={{
											width: complete ? "100%" : active ? "45%" : "0%",
											opacity: active ? 0.6 : 1,
										}}
									/>
								</li>
							)
						})}
					</ol>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
