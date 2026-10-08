"use client"

import { motion } from "framer-motion"
import { useEffect, useId, useRef, type ReactNode } from "react"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import { CloseIcon } from "./Icons"

/**
 * A small glass card that opens above the dock. Focus moves into it when it
 * opens and returns to the button that opened it when it closes.
 */
export function Panel({
	title,
	onClose,
	children,
}: {
	title: string
	onClose: () => void
	children: ReactNode
}) {
	const titleId = useId()
	const ref = useRef<HTMLDivElement>(null)
	const reducedMotion = useReducedMotion()

	useEffect(() => {
		// Move focus to the dialog so its title is announced; Tab then reaches its controls.
		const previous = document.activeElement as HTMLElement | null
		ref.current?.focus({ preventScroll: true })
		return () => previous?.focus?.({ preventScroll: true })
	}, [])

	return (
		<motion.div
			ref={ref}
			role="dialog"
			aria-modal="false"
			aria-labelledby={titleId}
			tabIndex={-1}
			className="glass-panel glass-panel--solid w-full rounded-2xl px-5 pt-4 pb-3 outline-none sm:w-[340px]"
			initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: reducedMotion ? 0 : 6 }}
			transition={{ duration: reducedMotion ? 0.12 : 0.35, ease: [0.32, 0.72, 0, 1] }}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.stopPropagation()
					onClose()
				}
			}}
		>
			<div className="mb-1 flex items-center justify-between">
				<h2 id={titleId} className="text-mist-faint text-[11px] tracking-[0.16em] uppercase">
					{title}
				</h2>
				<button
					type="button"
					onClick={onClose}
					aria-label={`Close ${title.toLowerCase()}`}
					className="text-mist-faint hover:text-mist -mr-2 grid size-7 place-items-center rounded-full transition-colors"
				>
					<CloseIcon />
				</button>
			</div>
			{children}
		</motion.div>
	)
}
