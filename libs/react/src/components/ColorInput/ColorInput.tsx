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

export interface ColorInputProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
	value?: string
	onChange?: (color: string) => void
	/** Fires continuously during color picker drag for live preview (doesn't commit to CRDT) */
	onPreview?: (color: string) => void
	disabled?: boolean
	showHex?: boolean
}

export const ColorInput = createComponent<HTMLDivElement, ColorInputProps>(
	'ColorInput',
	({ className, value = '#000000', onChange, onPreview, disabled, showHex = true, ...props }, ref) => {
		// Local state to buffer color changes during drag
		const [localColor, setLocalColor] = React.useState(value)
		const [isEditing, setIsEditing] = React.useState(false)

		// Track the latest color during editing for commit on blur
		const pendingColorRef = React.useRef<string>(value)

		// Sync local state when external value changes (and we're not actively editing)
		React.useEffect(() => {
			if (!isEditing) {
				setLocalColor(value)
				pendingColorRef.current = value
			}
		}, [value, isEditing])

		const handleColorDrag = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
			// Update local state and call preview callback (for live visual feedback)
			// This handles both onInput and onChange during drag
			const newColor = e.target.value
			console.log('[ColorInput] drag:', newColor)
			setLocalColor(newColor)
			setIsEditing(true)
			pendingColorRef.current = newColor
			onPreview?.(newColor)
		}, [onPreview])

		const handleColorBlur = React.useCallback(() => {
			console.log('[ColorInput] blur, isEditing:', isEditing, 'pending:', pendingColorRef.current, 'value:', value)
			// Commit only on blur (when picker closes)
			if (isEditing && pendingColorRef.current !== value) {
				onChange?.(pendingColorRef.current)
			}
			setIsEditing(false)
		}, [onChange, isEditing, value])

		const handleHexChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
			let hex = e.target.value
			setLocalColor(hex)
			// Add # if missing
			if (hex && !hex.startsWith('#')) {
				hex = '#' + hex
			}
			// Validate hex format and commit immediately for text input
			if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
				onChange?.(hex)
			}
		}, [onChange])

		return (
			<div ref={ref} className={mergeClasses('c-color-input c-hbox g-1', className)} {...props}>
				<input
					type="color"
					className="c-color-input-picker"
					value={localColor}
					onInput={handleColorDrag}
					onChange={handleColorDrag}
					onBlur={handleColorBlur}
					disabled={disabled}
				/>
				{showHex && (
					<input
						type="text"
						className="c-input c-color-input-hex"
						value={localColor}
						onChange={handleHexChange}
						disabled={disabled}
						maxLength={7}
						placeholder="#000000"
					/>
				)}
			</div>
		)
	}
)

// vim: ts=4
