import type { ReactNode } from "react"

/**
 * A quiet full-screen message over slowly moving water light — used when the
 * aquarium can't be shown. Pure CSS, so it works without WebGL.
 */
export function CalmMessage({
	title,
	children,
	action,
}: {
	title: string
	children: ReactNode
	action?: ReactNode
}) {
	return (
		<div className="bg-ink absolute inset-0 z-40 flex items-center justify-center overflow-hidden px-6">
			<div aria-hidden className="calm-water absolute inset-0" />
			<div className="relative max-w-[26rem] text-center">
				<p className="wordmark text-mist pl-[0.32em] text-[20px]">AquaZen</p>
				<h2 className="text-mist mt-8 text-[17px] font-medium">{title}</h2>
				<div className="text-mist-dim mt-3 text-[14px] leading-relaxed">{children}</div>
				{action && <div className="mt-8">{action}</div>}
			</div>
		</div>
	)
}

export function QuietButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="glass-panel text-mist rounded-full px-5 py-2 text-[13px] transition-colors hover:bg-white/10"
		>
			{children}
		</button>
	)
}
