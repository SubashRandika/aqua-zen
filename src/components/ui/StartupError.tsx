"use client"

import { CalmMessage, QuietButton } from "./CalmMessage"

export function StartupError() {
	return (
		<CalmMessage
			title="The aquarium couldn’t start"
			action={<QuietButton onClick={() => window.location.reload()}>Reload AquaZen</QuietButton>}
		>
			<p>
				Something went wrong while preparing the scene. Reloading usually fixes it. If it keeps
				happening, try lowering the quality or closing other graphics-heavy tabs.
			</p>
		</CalmMessage>
	)
}
