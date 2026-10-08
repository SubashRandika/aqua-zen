import { CalmMessage } from "./CalmMessage"

export function WebGLFallback() {
	return (
		<CalmMessage title="This browser can’t show the aquarium">
			<p>
				AquaZen needs WebGL 2. Turn on hardware acceleration in your browser settings, or open
				AquaZen in a current version of Chrome, Edge, Firefox or Safari.
			</p>
		</CalmMessage>
	)
}
