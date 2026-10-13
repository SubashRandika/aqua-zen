import { CanvasTexture, SRGBColorSpace } from "three"
import { createRandom } from "@/simulation/core/random"

/** Layout of the flake atlas: one irregular flake per tile. */
export const FLAKE_ATLAS = { columns: 4, rows: 2, tiles: 8, tileSize: 128 } as const

/**
 * Draws a sheet of fish-food flakes: torn, irregular outlines with a darker
 * rim and fine speckles of the ingredients pressed into them. The flakes are
 * pale so that each instance can be tinted its own colour.
 */
export function createFlakeAtlas(seed = 17): CanvasTexture {
	const { columns, rows, tileSize } = FLAKE_ATLAS
	const canvas = document.createElement("canvas")
	canvas.width = columns * tileSize
	canvas.height = rows * tileSize
	const ctx = canvas.getContext("2d")!
	const random = createRandom(seed)

	for (let tile = 0; tile < columns * rows; tile++) {
		const cx = (tile % columns) * tileSize + tileSize / 2
		const cy = Math.floor(tile / columns) * tileSize + tileSize / 2
		ctx.save()
		ctx.translate(cx, cy)
		ctx.rotate(random() * Math.PI * 2)
		ctx.scale(1, 0.62 + random() * 0.35)

		// A torn outline: a lumpy circle with a few sharp notches.
		const points = 22
		const radius = tileSize * 0.42
		const lumps = [random() * 6, random() * 6, random() * 6]
		ctx.beginPath()
		for (let i = 0; i < points; i++) {
			const angle = (i / points) * Math.PI * 2
			let r =
				radius *
				(0.78 +
					0.1 * Math.sin(angle * 2 + lumps[0]!) +
					0.07 * Math.sin(angle * 3 + lumps[1]!) +
					0.05 * Math.sin(angle * 5 + lumps[2]!))
			r *= random() < 0.18 ? 0.72 + random() * 0.15 : 0.95 + random() * 0.08
			const x = Math.cos(angle) * r
			const y = Math.sin(angle) * r
			if (i === 0) ctx.moveTo(x, y)
			else ctx.lineTo(x, y)
		}
		ctx.closePath()
		ctx.fillStyle = "#e9e4dc"
		ctx.fill()
		ctx.save()
		ctx.clip()

		// Uneven thickness shows as mottling.
		for (let i = 0; i < 26; i++) {
			const shade = 200 + Math.floor(random() * 50)
			ctx.fillStyle = `rgba(${shade}, ${shade - 6}, ${shade - 14}, 0.35)`
			ctx.beginPath()
			ctx.arc(
				(random() - 0.5) * radius * 2,
				(random() - 0.5) * radius * 2,
				4 + random() * 14,
				0,
				Math.PI * 2,
			)
			ctx.fill()
		}
		// Speckles of the ingredients.
		for (let i = 0; i < 90; i++) {
			const dark = random() < 0.55
			const value = dark ? 70 + Math.floor(random() * 80) : 235 + Math.floor(random() * 20)
			ctx.fillStyle = `rgba(${value}, ${value - 10}, ${value - 25}, ${dark ? 0.55 : 0.6})`
			ctx.beginPath()
			ctx.arc(
				(random() - 0.5) * radius * 2,
				(random() - 0.5) * radius * 2,
				0.8 + random() * 2.2,
				0,
				Math.PI * 2,
			)
			ctx.fill()
		}
		ctx.restore()
		// The broken edge is thinner and darker.
		ctx.strokeStyle = "rgba(90, 70, 50, 0.35)"
		ctx.lineWidth = 3
		ctx.stroke()
		ctx.restore()
	}

	const texture = new CanvasTexture(canvas)
	texture.colorSpace = SRGBColorSpace
	texture.anisotropy = 4
	return texture
}
