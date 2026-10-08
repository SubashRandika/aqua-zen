"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState } from "react"
import { useSessionStore } from "@/store/sessionStore"
import { QuietButton } from "./CalmMessage"

/** Offer a reload if the browser hasn't restored the GPU context by then. */
const RELOAD_OFFER_DELAY_MS = 6000

/** Shown while the GPU context is lost (e.g. after a driver reset or under memory pressure). */
export function ContextLostOverlay() {
	const lost = useSessionStore((s) => s.contextLost)
	const [offerReload, setOfferReload] = useState(false)

	useEffect(() => {
		if (!lost) return
		const timer = window.setTimeout(() => setOfferReload(true), RELOAD_OFFER_DELAY_MS)
		return () => {
			window.clearTimeout(timer)
			setOfferReload(false)
		}
	}, [lost])

	return (
		<AnimatePresence>
			{lost && (
				<motion.div
					className="bg-ink/90 absolute inset-0 z-40 flex flex-col items-center justify-center px-6 text-center"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					role="alert"
				>
					<p className="text-mist text-[15px]">Graphics were interrupted</p>
					<p className="text-mist-dim mt-2 text-[13px]">Restoring the aquarium…</p>
					{offerReload && (
						<div className="mt-7">
							<QuietButton onClick={() => window.location.reload()}>Reload AquaZen</QuietButton>
						</div>
					)}
				</motion.div>
			)}
		</AnimatePresence>
	)
}
