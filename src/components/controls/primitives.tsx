"use client"

import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react"

function cx(...classes: Array<string | false | null | undefined>): string {
	return classes.filter(Boolean).join(" ")
}

interface DockButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	icon: ReactNode
	label: string
	active?: boolean
}

/** Icon button for the dock. The label is visible on larger screens and always available to assistive tech. */
export const DockButton = forwardRef<HTMLButtonElement, DockButtonProps>(function DockButton(
	{ icon, label, active, className, ...props },
	ref,
) {
	return (
		<button
			ref={ref}
			type="button"
			aria-label={label}
			className={cx(
				"flex h-9 min-w-8 items-center justify-center gap-2 rounded-full px-2 text-[12.5px] tracking-[0.01em] transition-colors duration-300 min-[400px]:min-w-9 min-[400px]:px-2.5 sm:px-3",
				active
					? "text-mist bg-white/[0.11]"
					: "text-mist-dim hover:text-mist hover:bg-white/[0.06]",
				className,
			)}
			{...props}
		>
			{icon}
			<span className="hidden sm:inline" aria-hidden>
				{label}
			</span>
		</button>
	)
})

interface SwitchButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
	checked: boolean
	onChange: (checked: boolean) => void
}

/** The switch itself; label it with `aria-label`, `aria-labelledby` or a `<label>`. */
export function SwitchButton({ checked, onChange, className, ...props }: SwitchButtonProps) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			onClick={() => onChange(!checked)}
			className={cx(
				"relative h-[18px] w-[30px] shrink-0 rounded-full border transition-colors duration-300",
				checked ? "border-mist/60 bg-mist/80" : "border-hairline-strong bg-transparent",
				className,
			)}
			{...props}
		>
			<span
				aria-hidden
				className={cx(
					"absolute top-1/2 size-3 -translate-y-1/2 rounded-full transition-[left,background-color] duration-300 ease-[var(--ease-calm)]",
					checked ? "bg-ink left-[14px]" : "bg-mist-dim left-[2px]",
				)}
			/>
		</button>
	)
}

/** An on/off switch with a visible label and optional description. */
export function Switch({
	label,
	description,
	checked,
	onChange,
}: {
	label: string
	description?: string
	checked: boolean
	onChange: (checked: boolean) => void
}) {
	const id = useId()
	return (
		<div className="flex items-center justify-between gap-6 py-2">
			<div>
				<label htmlFor={id} className="text-mist block cursor-pointer text-[13px]">
					{label}
				</label>
				{description && (
					<p className="text-mist-faint mt-0.5 text-[12px] leading-snug">{description}</p>
				)}
			</div>
			<SwitchButton id={id} checked={checked} onChange={onChange} />
		</div>
	)
}

/**
 * A small count with fewer and more buttons. `noun` is plural and names
 * what is counted ("neon tetras"), for the buttons' accessible names.
 */
export function Stepper({
	value,
	min,
	max,
	noun,
	onChange,
}: {
	value: number
	min: number
	max: number
	noun: string
	onChange: (value: number) => void
}) {
	const button =
		"text-mist-dim hover:text-mist grid size-7 place-items-center rounded-full transition-colors duration-300 hover:bg-white/[0.06] disabled:pointer-events-none disabled:opacity-30"
	return (
		<div role="group" aria-label={`Number of ${noun}`} className="flex items-center">
			<button
				type="button"
				aria-label={`Fewer ${noun}`}
				disabled={value <= min}
				onClick={() => onChange(value - 1)}
				className={button}
			>
				<svg width={10} height={10} viewBox="0 0 10 10" aria-hidden focusable="false">
					<path d="M2 5h6" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
				</svg>
			</button>
			<output
				aria-live="polite"
				className="text-mist w-5 text-center font-mono text-[12px] tabular-nums"
			>
				{value}
			</output>
			<button
				type="button"
				aria-label={`More ${noun}`}
				disabled={value >= max}
				onClick={() => onChange(value + 1)}
				className={button}
			>
				<svg width={10} height={10} viewBox="0 0 10 10" aria-hidden focusable="false">
					<path d="M2 5h6M5 2v6" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
				</svg>
			</button>
		</div>
	)
}

export interface SegmentOption<T extends string | number> {
	value: T
	label: string
}

/** A compact single-choice group (radio semantics, arrow-key navigation). */
export function Segmented<T extends string | number>({
	label,
	value,
	options,
	onChange,
	hint,
}: {
	label: string
	value: T
	options: ReadonlyArray<SegmentOption<T>>
	onChange: (value: T) => void
	hint?: string
}) {
	const labelId = useId()
	const select = (index: number) => {
		const option = options[(index + options.length) % options.length]
		if (option) onChange(option.value)
	}
	const current = options.findIndex((o) => o.value === value)
	return (
		<div className="py-2">
			<div className="flex items-baseline justify-between gap-4">
				<p id={labelId} className="text-mist text-[13px]">
					{label}
				</p>
				{hint && <p className="text-mist-faint text-[12px]">{hint}</p>}
			</div>
			<div
				role="radiogroup"
				aria-labelledby={labelId}
				className="mt-2 flex flex-wrap gap-1"
				onKeyDown={(event) => {
					if (event.key === "ArrowRight" || event.key === "ArrowDown") {
						event.preventDefault()
						select(current + 1)
					} else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
						event.preventDefault()
						select(current - 1)
					}
				}}
			>
				{options.map((option) => {
					const checked = option.value === value
					return (
						<button
							key={String(option.value)}
							type="button"
							role="radio"
							aria-checked={checked}
							tabIndex={checked ? 0 : -1}
							onClick={() => onChange(option.value)}
							className={cx(
								"rounded-full border px-3 py-1 text-[12px] transition-colors duration-300",
								checked
									? "border-mist/40 text-mist bg-white/[0.1]"
									: "border-hairline text-mist-dim hover:text-mist",
							)}
						>
							{option.label}
						</button>
					)
				})}
			</div>
		</div>
	)
}

export function QuietAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="border-hairline text-mist-dim hover:border-hairline-strong hover:text-mist rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors duration-300"
		>
			{children}
		</button>
	)
}

export { cx }
