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

/** The pendant light above the tank, with light falling from it — faint while it is off. */
export const TankLightIcon = ({ on }: { on: boolean }) => (
	<Icon>
		<path d="M8 4v2.6M16 4v2.6" />
		<rect x="4" y="6.6" width="16" height="3" rx="1.5" />
		<path
			d="m8.4 13.2-.9 3.8M12 13.4v4.2M15.6 13.2l.9 3.8"
			opacity={on ? 1 : 0.3}
			className="transition-opacity duration-500"
		/>
	</Icon>
)

/** Pinch of flakes falling. */
export const FeedIcon = () => (
	<Icon>
		<path d="M8.5 4.5c1.6 1.1 5.4 1.1 7 0" />
		<path d="m9.6 9.6 1.4 1M14.3 11.4l-1.5.7M11.1 14.6l1.2 1.2M14.9 17.3l-1.5.4M10 19.6l1.3-.6" />
	</Icon>
)

/** A fish in profile: the fish in the tank. */
export const FishIcon = () => (
	<Icon>
		<path d="M6.6 12c2.4-3.5 7.6-5 11.2-2.7.9.6 1.9 1.6 2.7 2.7-.8 1.1-1.8 2.1-2.7 2.7C14.2 17 9 15.5 6.6 12Z" />
		<path d="M6.6 12 3.2 8.8c.7 2.1.7 4.3 0 6.4Z" />
		<circle cx="16.4" cy="11.2" r="0.55" fill="currentColor" stroke="none" />
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
