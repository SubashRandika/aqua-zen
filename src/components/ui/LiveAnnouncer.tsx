"use client"

import { useSessionStore } from "@/store/sessionStore"

/** A polite live region so screen-reader users hear the effects of their actions. */
export function LiveAnnouncer() {
	const announcement = useSessionStore((s) => s.announcement)
	return (
		<div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
			{announcement}
		</div>
	)
}
