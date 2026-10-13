"use client"

import { useId } from "react"
import { QUALITY_PRESETS, type QualityLevel } from "@/config/quality"
import { SPECIES, STARTER_ROSTER } from "@/config/species"
import { planTotal, populationPlan, rosterTotal, type Roster } from "@/simulation/fish/population"
import type { FishSpeciesDefinition, SpeciesGroup } from "@/simulation/fish/types"
import { useSessionStore } from "@/store/sessionStore"
import { useSettingsStore } from "@/store/settingsStore"
import { FishPortrait } from "./FishPortrait"
import { Panel } from "./Panel"
import { cx, QuietAction, Stepper, SwitchButton } from "./primitives"

const GROUPS: ReadonlyArray<{ group: SpeciesGroup; title: string }> = [
	{ group: "shoaling", title: "Shoaling fish" },
	{ group: "openWater", title: "Open water" },
	{ group: "bottom", title: "Bottom dwellers and algae eaters" },
]

const QUALITY_NAMES: Record<QualityLevel, string> = {
	low: "Low",
	medium: "Medium",
	high: "High",
	ultra: "Ultra",
}

function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1)
}

function sameRoster(a: Roster, b: Roster): boolean {
	const keys = Object.keys(a)
	return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
}

function FishRow({
	species,
	count,
	onToggle,
	onCount,
}: {
	species: FishSpeciesDefinition
	count: number
	onToggle: (inTank: boolean) => void
	onCount: (count: number) => void
}) {
	const nameId = useId()
	const noteId = useId()
	const inTank = count > 0
	const { minCount, maxCount } = species.population
	return (
		<li className="flex items-center gap-3 py-[7px]">
			<FishPortrait
				species={species}
				className={cx(
					"h-6 w-11 shrink-0 transition-opacity duration-500",
					inTank ? "opacity-100" : "opacity-35",
				)}
			/>
			<div className="min-w-0 flex-1">
				<p
					id={nameId}
					className={cx(
						"truncate text-[13px] transition-colors duration-300",
						inTank ? "text-mist" : "text-mist-dim",
					)}
				>
					{species.name}
				</p>
				<p id={noteId} className="text-mist-faint line-clamp-2 text-[12px] leading-snug">
					{species.catalog.note}
				</p>
			</div>
			{inTank && maxCount > minCount && (
				<Stepper
					value={count}
					min={minCount}
					max={maxCount}
					noun={species.catalog.plural}
					onChange={onCount}
				/>
			)}
			<SwitchButton
				checked={inTank}
				onChange={onToggle}
				aria-labelledby={nameId}
				aria-describedby={noteId}
			/>
		</li>
	)
}

/**
 * Choosing the fish: every species AquaZen keeps, grouped by where it lives
 * in the tank. A switch adds or takes out a species; the count sets the
 * size of its group. Changes reach the tank at once, gently.
 */
export function FishPanel({ onClose }: { onClose: () => void }) {
	const roster = useSettingsStore((s) => s.roster)
	const setSpeciesCount = useSettingsStore((s) => s.setSpeciesCount)
	const restoreStarterTank = useSettingsStore((s) => s.restoreStarterTank)
	const quality = useSessionStore((s) => s.activeQuality)
	const announce = useSessionStore((s) => s.announce)

	const chosen = rosterTotal(roster)
	const shown = planTotal(populationPlan(SPECIES, roster, QUALITY_PRESETS[quality].fishCapacity))
	const kinds = Object.keys(roster).length

	const toggle = (species: FishSpeciesDefinition, inTank: boolean) => {
		setSpeciesCount(species.id, inTank ? species.population.count : 0)
		const name = capitalize(species.catalog.plural)
		announce(inTank ? `${name} added. They’ll come out from the plants.` : `${name} taken out.`)
	}

	return (
		<Panel title="Fish" wide onClose={onClose}>
			<p className="text-mist-dim text-[12.5px]">
				{chosen === 0
					? "The tank is empty. Switch a species on to add it."
					: `${chosen} fish of ${kinds} ${kinds === 1 ? "kind" : "kinds"}`}
			</p>
			<div className="az-scroll -mx-5 mt-1 max-h-[min(52vh,26rem)] overflow-y-auto px-5 pb-3">
				{GROUPS.map(({ group, title }) => (
					<section key={group} aria-label={title}>
						<h3 className="text-mist-faint pt-3 pb-0.5 text-[11.5px] tracking-[0.02em]">{title}</h3>
						<ul>
							{SPECIES.filter((s) => s.catalog.group === group).map((species) => (
								<FishRow
									key={species.id}
									species={species}
									count={roster[species.id] ?? 0}
									onToggle={(inTank) => toggle(species, inTank)}
									onCount={(count) => setSpeciesCount(species.id, count)}
								/>
							))}
						</ul>
					</section>
				))}
			</div>
			{shown < chosen && (
				<p className="text-mist-faint pt-1 text-[12px] leading-snug">
					At {QUALITY_NAMES[quality]} quality about {shown} of them swim at once, so each group is a
					little smaller.
				</p>
			)}
			{!sameRoster(roster, STARTER_ROSTER) && (
				<div className="border-hairline mt-2 border-t pt-3 pb-1">
					<QuietAction
						onClick={() => {
							restoreStarterTank()
							announce("The starter fish are back.")
						}}
					>
						Restore the starter fish
					</QuietAction>
				</div>
			)}
		</Panel>
	)
}
