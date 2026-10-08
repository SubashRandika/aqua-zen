import type { SVGProps } from "react"

/** Hairline icons drawn for AquaZen: 18px, 1.4px stroke, round caps. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
	return (
		<svg
			width={18}
			height={18}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.4}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden
			focusable="false"
			{...props}
		>
			{children}
		</svg>
	)
}

export const SunIcon = () => (
	<Icon>
		<circle cx="12" cy="12" r="3.6" />
		<path d="M12 3.5v1.6M12 18.9v1.6M3.5 12h1.6M18.9 12h1.6M6 6l1.1 1.1M16.9 16.9 18 18M6 18l1.1-1.1M16.9 7.1 18 6" />
	</Icon>
)

export const MoonIcon = () => (
	<Icon>
		<path d="M19.2 14.6A7.6 7.6 0 0 1 9.4 4.8a7.6 7.6 0 1 0 9.8 9.8Z" />
	</Icon>
)

/** Half-lit circle: the light follows the aquarium's own day. */
export const AutoIcon = () => (
	<Icon>
		<circle cx="12" cy="12" r="7.2" />
		<path d="M12 4.8a7.2 7.2 0 0 1 0 14.4Z" fill="currentColor" stroke="none" opacity="0.55" />
	</Icon>
)

/** Pinch of flakes falling. */
export const FeedIcon = () => (
	<Icon>
		<path d="M8.5 4.5c1.6 1.1 5.4 1.1 7 0" />
		<path d="m9.6 9.6 1.4 1M14.3 11.4l-1.5.7M11.1 14.6l1.2 1.2M14.9 17.3l-1.5.4M10 19.6l1.3-.6" />
	</Icon>
)

export const SoundIcon = ({ muted }: { muted?: boolean }) => (
	<Icon>
		<path d="M4.5 9.6h3l4.3-3.6v12l-4.3-3.6h-3Z" />
		{muted ? (
			<path d="m16 9.8 4.2 4.4M20.2 9.8 16 14.2" />
		) : (
			<path d="M15.6 9.2a4 4 0 0 1 0 5.6M18 6.9a7.4 7.4 0 0 1 0 10.2" />
		)}
	</Icon>
)

/** An eye: looking into the tank. */
export const CameraIcon = () => (
	<Icon>
		<path d="M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6Z" />
		<circle cx="12" cy="12" r="2.6" />
	</Icon>
)

export const SettingsIcon = () => (
	<Icon>
		<path d="M4.5 7.5h9M17.5 7.5h2M4.5 16.5h2M10.5 16.5h9" />
		<circle cx="15.5" cy="7.5" r="2" />
		<circle cx="8.5" cy="16.5" r="2" />
	</Icon>
)

export const CloseIcon = () => (
	<Icon width={14} height={14}>
		<path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
	</Icon>
)
