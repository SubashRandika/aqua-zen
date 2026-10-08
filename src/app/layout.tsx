import type { Metadata, Viewport } from "next"
import { IBM_Plex_Mono, Instrument_Sans, Shippori_Mincho } from "next/font/google"
import type { ReactNode } from "react"
import { APP } from "@/config/app"
import "./globals.css"

const display = Shippori_Mincho({
	variable: "--font-shippori",
	weight: ["400", "500"],
	subsets: ["latin"],
	display: "swap",
})

const sans = Instrument_Sans({
	variable: "--font-instrument",
	subsets: ["latin"],
	display: "swap",
})

const mono = IBM_Plex_Mono({
	variable: "--font-plex",
	weight: ["400"],
	subsets: ["latin"],
	display: "swap",
})

export const metadata: Metadata = {
	metadataBase: new URL(APP.url),
	title: { default: APP.name, template: `%s · ${APP.name}` },
	description: APP.description,
	applicationName: APP.name,
	keywords: ["aquarium", "relaxation", "calm", "ambient", "fish", "WebGL", "AquaZen"],
	openGraph: {
		type: "website",
		siteName: APP.name,
		title: `${APP.name} — ${APP.tagline}`,
		description: APP.description,
		url: "/",
	},
	twitter: {
		card: "summary_large_image",
		title: `${APP.name} — ${APP.tagline}`,
		description: APP.description,
	},
	appleWebApp: { title: APP.name, statusBarStyle: "black-translucent" },
}

export const viewport: Viewport = {
	themeColor: "#070a0b",
	colorScheme: "dark",
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
			<body>{children}</body>
		</html>
	)
}
