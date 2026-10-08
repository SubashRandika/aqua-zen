"use client"

import { useEffect, useState } from "react"

const ACTIVITY_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const

/** True once the user has been inactive for `timeout` ms; resets on any interaction. */
export function useIdle(timeout: number): boolean {
	const [idle, setIdle] = useState(false)
	useEffect(() => {
		let timer = window.setTimeout(() => setIdle(true), timeout)
		const onActivity = () => {
			setIdle(false)
			window.clearTimeout(timer)
			timer = window.setTimeout(() => setIdle(true), timeout)
		}
		for (const event of ACTIVITY_EVENTS)
			window.addEventListener(event, onActivity, { passive: true })
		return () => {
			window.clearTimeout(timer)
			for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity)
		}
	}, [timeout])
	return idle
}
