// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as React from 'react'

import { useFieldControl } from '../Form/Field.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface NumberInputProps
	extends Omit<
		React.InputHTMLAttributes<HTMLInputElement>,
		'type' | 'onChange' | 'value' | 'size'
	> {
	size?: 'sm' | 'md' | 'lg'
	value?: number
	onChange?: (value: number) => void
	/** Fires continuously during scrub for live preview (doesn't commit to CRDT) */
	onScrub?: (value: number) => void
	suffix?: string
	min?: number
	max?: number
	step?: number
	/** Pixels of mouse movement per step increment (default: 5) */
	scrubSensitivity?: number
	/**
	 * Text mode: the input takes free text (units, arithmetic…) and commits `parse(text)` on
	 * blur/Enter; `undefined` rejects it. ArrowUp/Down step; scrub still works.
	 */
	parse?: (text: string) => number | undefined
	/** Text mode: how a value is shown (default: `String`) */
	format?: (value: number) => string
}

const SCRUB_THRESHOLD = 3 // pixels before entering scrub mode

export const NumberInput = createComponent<HTMLDivElement, NumberInputProps>(
	'NumberInput',
	(
		{
			className,
			value,
			onChange,
			onScrub,
			suffix,
			min,
			max,
			step = 1,
			scrubSensitivity = 5,
			parse,
			format = String,
			onBlur,
			onKeyDown,
			size,
			...props
		},
		ref
	) => {
		const inputRef = React.useRef<HTMLInputElement>(null)
		// The Field's id/size go on the inner <input>; the outer ref stays on the wrapper
		const field = useFieldControl(props, inputRef, 'NumberInput')
		const sizeClass = (size ?? field.size) !== 'md' && (size ?? field.size)
		// Text mode: what the user is typing, until committed or cancelled
		const [draft, setDraft] = React.useState<string | undefined>(undefined)

		// Local value for visual feedback during scrub (doesn't update CRDT)
		const [localValue, setLocalValue] = React.useState<number | undefined>(value)
		const [isScrubbing, setIsScrubbing] = React.useState(false)

		// Scrubbing state ref
		const scrubState = React.useRef<{
			startX: number
			startValue: number
			isActive: boolean
		} | null>(null)

		// Sync local value when external value changes (and not scrubbing)
		React.useEffect(() => {
			if (!isScrubbing) {
				setLocalValue(value)
			}
		}, [value, isScrubbing])

		// Clamp value to min/max
		const clampValue = React.useCallback(
			(val: number) => {
				if (min !== undefined) val = Math.max(min, val)
				if (max !== undefined) val = Math.min(max, val)
				return val
			},
			[min, max]
		)

		// Calculate step multiplier based on modifier keys
		const getMultiplier = React.useCallback((e: { shiftKey: boolean; altKey: boolean }) => {
			if (e.shiftKey) return 10
			if (e.altKey) return 0.1
			return 1
		}, [])

		// Text mode: commit a parsed draft
		const commit = (text: string) => {
			setDraft(undefined)
			const parsed = parse?.(text)
			if (parsed === undefined || Number.isNaN(parsed)) return
			const clamped = clampValue(parsed)
			// No optimistic local value: an accepted change comes back through `value`.
			if (clamped !== value) onChange?.(clamped)
		}

		const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
			if (parse && draft !== undefined) commit(draft)
			onBlur?.(e)
		}

		const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
			onKeyDown?.(e)
			if (!parse || e.defaultPrevented) return
			if (e.key === 'Enter' && draft !== undefined) {
				e.preventDefault()
				commit(draft)
			} else if (e.key === 'Escape' && draft !== undefined) {
				e.preventDefault()
				setDraft(undefined)
			} else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
				e.preventDefault()
				const base = (draft !== undefined ? parse(draft) : undefined) ?? value ?? 0
				const next = clampValue(
					base + (e.key === 'ArrowUp' ? 1 : -1) * step * getMultiplier(e)
				)
				setDraft(undefined)
				onChange?.(next)
			}
		}

		// Handle text input change (commit immediately for typing)
		const handleChange = React.useCallback(
			(e: React.ChangeEvent<HTMLInputElement>) => {
				if (parse) {
					setDraft(e.target.value)
					return
				}
				const newValue = parseFloat(e.target.value)
				if (!Number.isNaN(newValue)) {
					const clamped = clampValue(newValue)
					setLocalValue(clamped)
					onChange?.(clamped)
				}
			},
			[onChange, clampValue, parse]
		)

		// Mouse down - prepare for potential scrub
		const handleMouseDown = React.useCallback(
			(e: React.MouseEvent) => {
				// Only start scrub on left mouse button
				if (e.button !== 0) return

				scrubState.current = {
					startX: e.clientX,
					startValue: value ?? 0,
					isActive: false
				}
			},
			[value]
		)

		// Mouse move/up handlers (attached to document during potential scrub)
		React.useEffect(() => {
			const handleMouseMove = (e: MouseEvent) => {
				if (!scrubState.current) return

				const delta = e.clientX - scrubState.current.startX

				// Enter scrub mode after threshold
				if (!scrubState.current.isActive && Math.abs(delta) > SCRUB_THRESHOLD) {
					scrubState.current.isActive = true
					setIsScrubbing(true)
					inputRef.current?.blur()
				}

				// Update LOCAL value while scrubbing (no CRDT update)
				if (scrubState.current.isActive) {
					const multiplier = getMultiplier(e)
					const steps = Math.round(delta / scrubSensitivity)
					const newValue = clampValue(
						scrubState.current.startValue + steps * step * multiplier
					)
					setLocalValue(newValue)
					// Call onScrub for live preview
					onScrub?.(newValue)
				}
			}

			const handleMouseUp = () => {
				if (scrubState.current) {
					// Commit to CRDT only on mouse up
					if (
						scrubState.current.isActive &&
						localValue !== undefined &&
						localValue !== value
					) {
						onChange?.(localValue)
					}
					scrubState.current = null
					setIsScrubbing(false)
				}
			}

			document.addEventListener('mousemove', handleMouseMove)
			document.addEventListener('mouseup', handleMouseUp)

			return () => {
				document.removeEventListener('mousemove', handleMouseMove)
				document.removeEventListener('mouseup', handleMouseUp)
			}
		}, [
			onChange,
			onScrub,
			value,
			localValue,
			step,
			scrubSensitivity,
			clampValue,
			getMultiplier
		])

		return (
			<div
				ref={ref}
				className={mergeClasses('c-number-input', isScrubbing && 'scrubbing', className)}
			>
				<input
					ref={field.ref}
					type={parse ? 'text' : 'number'}
					inputMode={parse ? 'decimal' : undefined}
					className={mergeClasses('c-input', sizeClass)}
					value={
						parse
							? (draft ?? (localValue === undefined ? '' : format(localValue)))
							: (localValue ?? '')
					}
					onChange={handleChange}
					onBlur={handleBlur}
					onKeyDown={handleKeyDown}
					onMouseDown={handleMouseDown}
					min={min}
					max={max}
					step={step}
					{...props}
					{...field.controlProps}
				/>
				{suffix && <span className="c-number-input-suffix">{suffix}</span>}
			</div>
		)
	}
)

// vim: ts=4
