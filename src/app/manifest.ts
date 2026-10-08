import type { MetadataRoute } from "next"
import { APP } from "@/config/app"

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: APP.name,
		short_name: APP.name,
		description: APP.description,
		start_url: "/",
		display: "fullscreen",
		orientation: "any",
		background_color: "#070a0b",
		theme_color: "#070a0b",
		icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
	}
}
