"use client"

import { useId } from "react"
import { Vector3 } from "three"
import type { FishSpeciesDefinition } from "@/simulation/fish/types"
import { caudalPoint, medianFinPoint, sampleProfile } from "@/three/geometry/fishGeometry"

/** Outline samples along the body and around each fin. */
const STEPS = 24
const BAR_COLOR = "#141414"

interface Portrait {
	viewBox: string
	body: string
	fins: string[]
	eye: { x: number; y: number; r: number }
	bars: Array<{ x: number; width: number }>
	top: number
	height: number
}

const portraits = new Map<string, Portrait>()

/**
 * Traces the species' own body plan, the same one its 3D model is built
 * from, as a flat side view. SVG y runs down, so heights are negated.
 */
function tracePortrait(species: FishSpeciesDefinition): Portrait {
	const shape = species.visual.shape
	const point = new Vector3()
	const xs: number[] = []
	const ys: number[] = []
	const toPoints = (list: ReadonlyArray<readonly [number, number]>) =>
		list
			.map(([x, y]) => {
				xs.push(x)
				ys.push(-y)
				return `${x.toFixed(4)},${(-y).toFixed(4)}`
			})
			.join(" ")

	const backLine: Array<[number, number]> = []
	const bellyLine: Array<[number, number]> = []
	for (let i = 0; i <= STEPS; i++) {
		const t = i / STEPS
		const profile = sampleProfile(shape.profile, t)
		const x = 0.5 - t * shape.bodyLength
		backLine.push([x, profile.top])
		bellyLine.push([x, -profile.bottom])
	}
	const nose = sampleProfile(shape.profile, 0)
	const body = toPoints([
		[0.505, (nose.top - nose.bottom) / 2],
		...backLine,
		...bellyLine.reverse(),
	])

	const fin = (sample: (u: number, flex: number) => Vector3) => {
		const base: Array<[number, number]> = []
		const edge: Array<[number, number]> = []
		for (let i = 0; i <= STEPS; i++) {
			const u = i / STEPS
			const b = sample(u, 0)
			base.push([b.x, b.y])
			const e = sample(u, 1)
			edge.push([e.x, e.y])
		}
		return toPoints([...base, ...edge.reverse()])
	}
	const fins = [fin((u, flex) => caudalPoint(shape, u, flex, point))]
	if (shape.dorsal) {
		const span = shape.dorsal
		fins.push(fin((u, flex) => medianFinPoint(shape, span, 1, u, flex, point)))
	}
	if (shape.anal) {
		const span = shape.anal
		fins.push(fin((u, flex) => medianFinPoint(shape, span, -1, u, flex, point)))
	}

	const pad = 0.02
	const minX = Math.min(...xs) - pad
	const maxX = Math.max(...xs) + pad
	const minY = Math.min(...ys) - pad
	const maxY = Math.max(...ys) + pad
	const barWidth = 0.05 * shape.bodyLength
	return {
		viewBox: `${minX.toFixed(4)} ${minY.toFixed(4)} ${(maxX - minX).toFixed(4)} ${(maxY - minY).toFixed(4)}`,
		body,
		fins,
		eye: { x: 0.5 - shape.eye.t * shape.bodyLength, y: -shape.eye.y, r: shape.eye.radius * 0.85 },
		bars: (species.catalog.swatch.bars ?? []).map((t) => ({
			x: 0.5 - t * shape.bodyLength - barWidth / 2,
			width: barWidth,
		})),
		top: minY,
		height: maxY - minY,
	}
}

function portraitOf(species: FishSpeciesDefinition): Portrait {
	let portrait = portraits.get(species.id)
	if (!portrait) {
		portrait = tracePortrait(species)
		portraits.set(species.id, portrait)
	}
	return portrait
}

/** A small side view of a species, coloured from its swatch, for the fish list. */
export function FishPortrait({
	species,
	className,
}: {
	species: FishSpeciesDefinition
	className?: string
}) {
	const id = useId()
	const portrait = portraitOf(species)
	const { colors, barColor } = species.catalog.swatch
	const pattern = species.visual.pattern
	const gradientId = `${id}-body`
	const clipId = `${id}-clip`
	return (
		<svg
			viewBox={portrait.viewBox}
			preserveAspectRatio="xMidYMid meet"
			className={className}
			aria-hidden
			focusable="false"
		>
			<defs>
				<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
					{colors.map((color, i) => (
						<stop
							key={i}
							offset={colors.length > 1 ? i / (colors.length - 1) : 0}
							stopColor={color}
						/>
					))}
				</linearGradient>
				<clipPath id={clipId}>
					<polygon points={portrait.body} />
				</clipPath>
			</defs>
			{portrait.fins.map((points, i) => (
				<polygon
					key={i}
					points={points}
					fill={pattern.fin}
					fillOpacity={0.4 + 0.5 * pattern.finOpacity}
				/>
			))}
			<polygon points={portrait.body} fill={`url(#${gradientId})`} />
			{portrait.bars.length > 0 && (
				<g clipPath={`url(#${clipId})`} fill={barColor ?? BAR_COLOR} fillOpacity={0.88}>
					{portrait.bars.map((bar, i) => (
						<rect key={i} x={bar.x} y={portrait.top} width={bar.width} height={portrait.height} />
					))}
				</g>
			)}
			<circle cx={portrait.eye.x} cy={portrait.eye.y} r={portrait.eye.r} fill="#0b0d0e" />
		</svg>
	)
}
