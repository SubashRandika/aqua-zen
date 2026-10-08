import { setConsoleFunction } from "three"

/**
 * React Three Fiber 9 still constructs `THREE.Clock`, which three r183+
 * reports as deprecated on every page load. That warning is about a
 * dependency's internals, not AquaZen, so it alone is filtered; every other
 * three.js message is passed through unchanged.
 */
const UPSTREAM_NOTICES = ["THREE.Clock: This module has been deprecated"]

let configured = false

export function configureThreeLogging(): void {
	if (configured) return
	configured = true
	setConsoleFunction((type: string, message: string, ...params: unknown[]) => {
		if (UPSTREAM_NOTICES.some((notice) => message.startsWith(notice))) return
		const method = type === "error" ? console.error : type === "warn" ? console.warn : console.log
		method(message, ...params)
	})
}
