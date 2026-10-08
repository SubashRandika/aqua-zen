"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
	fallback: ReactNode
	children: ReactNode
}

/** Contains rendering failures in the 3D scene so the rest of the page keeps working. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
	override state = { failed: false }

	static getDerivedStateFromError(): { failed: boolean } {
		return { failed: true }
	}

	override componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error("AquaZen scene error", error, info.componentStack)
	}

	override render(): ReactNode {
		return this.state.failed ? this.props.fallback : this.props.children
	}
}
