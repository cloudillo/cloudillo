// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export interface NumberInputProps
	extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> {
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
			...props
		},
		ref
	) => {
		const inputRef = React.useRef<HTMLInputElement>(null)

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

		// Handle text input change (commit immediately for typing)
		const handleChange = React.useCallback(
			(e: React.ChangeEvent<HTMLInputElement>) => {
				const newValue = parseFloat(e.target.value)
				if (!isNaN(newValue)) {
					const clamped = clampValue(newValue)
					setLocalValue(clamped)
					onChange?.(clamped)
				}
			},
			[onChange, clampValue]
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

		// Scroll wheel handler (commit immediately - discrete steps)
		const handleWheel = React.useCallback(
			(e: React.WheelEvent) => {
				e.preventDefault()
				const multiplier = getMultiplier(e)
				const direction = e.deltaY < 0 ? 1 : -1
				const newValue = clampValue((value ?? 0) + direction * step * multiplier)
				setLocalValue(newValue)
				onChange?.(newValue)
			},
			[onChange, value, step, clampValue, getMultiplier]
		)

		return (
			<div
				ref={ref}
				className={mergeClasses(
					'c-number-input c-hbox',
					isScrubbing && 'scrubbing',
					className
				)}
			>
				<input
					ref={inputRef}
					type="number"
					className="c-input"
					value={localValue ?? ''}
					onChange={handleChange}
					onMouseDown={handleMouseDown}
					onWheel={handleWheel}
					min={min}
					max={max}
					step={step}
					{...props}
				/>
				{suffix && <span className="c-number-input-suffix">{suffix}</span>}
			</div>
		)
	}
)

// vim: ts=4
