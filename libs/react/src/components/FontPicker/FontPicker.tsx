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
import { createPortal } from 'react-dom'
import { usePopper } from 'react-popper'
import { PiCaretDownBold as IcCaret } from 'react-icons/pi'
import {
	FONTS,
	getFontsByCategory,
	getFontsByRole,
	getSuggestedBodyFonts,
	getSuggestedHeadingFonts,
	type FontRole,
	type FontCategory,
	type FontMetadata
} from '@cloudillo/fonts'
import { mergeClasses } from '../utils.js'
import { useOutsideClick, useEscapeKey } from '../hooks.js'

export interface FontPickerProps {
	/** Current font family value */
	value: string
	/** Called when user selects a font */
	onChange: (family: string) => void
	/** Filter fonts by role */
	role?: FontRole
	/** Show pairing suggestions based on complementary font */
	suggestPairingsFor?: string
	/** Whether the picker is disabled */
	disabled?: boolean
	/** Additional class name */
	className?: string
}

interface FontGroup {
	category: FontCategory
	label: string
	fonts: FontMetadata[]
}

const CATEGORY_LABELS: Record<FontCategory, string> = {
	'sans-serif': 'Sans Serif',
	serif: 'Serif',
	display: 'Display',
	monospace: 'Monospace'
}

// Column layout: [['sans-serif'], ['serif'], ['display', 'monospace']]
const COLUMN_CATEGORIES: FontCategory[][] = [['sans-serif'], ['serif'], ['display', 'monospace']]

/**
 * FontPicker component for selecting fonts from the curated collection.
 * Displays fonts grouped by category with each font name rendered in its own font.
 */
export function FontPicker({
	value,
	onChange,
	role,
	suggestPairingsFor,
	disabled,
	className
}: FontPickerProps) {
	const [isOpen, setIsOpen] = React.useState(false)
	const [highlightedIndex, setHighlightedIndex] = React.useState(-1)

	// Popper setup
	const [buttonRef, setButtonRef] = React.useState<HTMLButtonElement | null>(null)
	const [menuEl, setMenuEl] = React.useState<HTMLDivElement | null>(null)
	const menuRef = React.useRef<HTMLDivElement | null>(null)

	// Sync the state-based ref with the actual ref for useOutsideClick
	const setMenuRef = React.useCallback((el: HTMLDivElement | null) => {
		menuRef.current = el
		setMenuEl(el)
	}, [])

	const { styles: popperStyles, attributes } = usePopper(buttonRef, menuEl, {
		placement: 'bottom-start',
		strategy: 'fixed',
		modifiers: [
			{ name: 'offset', options: { offset: [0, 4] } },
			{ name: 'preventOverflow', options: { padding: 8 } }
		]
	})

	// Get filtered fonts
	const fonts = React.useMemo(() => {
		let filtered = role ? getFontsByRole(role) : FONTS
		return filtered
	}, [role])

	// Get suggested fonts for pairing
	const suggestedFonts = React.useMemo(() => {
		if (!suggestPairingsFor) return new Set<string>()

		// Check if the complementary font is typically used as heading or body
		const asHeading = getSuggestedBodyFonts(suggestPairingsFor)
		const asBody = getSuggestedHeadingFonts(suggestPairingsFor)

		return new Set([...asHeading, ...asBody])
	}, [suggestPairingsFor])

	// Group fonts by category, organized into columns
	const columns = React.useMemo((): FontGroup[][] => {
		return COLUMN_CATEGORIES.map((categories) => {
			const columnGroups: FontGroup[] = []

			for (const category of categories) {
				const categoryFonts = fonts.filter((f) => f.category === category)
				if (categoryFonts.length > 0) {
					// Sort: suggested fonts first, then alphabetically
					const sorted = [...categoryFonts].sort((a, b) => {
						const aSuggested = suggestedFonts.has(a.family)
						const bSuggested = suggestedFonts.has(b.family)
						if (aSuggested && !bSuggested) return -1
						if (!aSuggested && bSuggested) return 1
						return a.displayName.localeCompare(b.displayName)
					})

					columnGroups.push({
						category,
						label: CATEGORY_LABELS[category],
						fonts: sorted
					})
				}
			}

			return columnGroups
		})
	}, [fonts, suggestedFonts])

	// Flat groups for keyboard navigation
	const groups = React.useMemo(() => columns.flat(), [columns])

	// Flat list of fonts for keyboard navigation
	const flatFonts = React.useMemo(() => {
		return groups.flatMap((g) => g.fonts)
	}, [groups])

	// Current font display
	const currentFont = React.useMemo(() => {
		return fonts.find((f) => f.family === value)
	}, [fonts, value])

	// Close menu
	const closeMenu = React.useCallback(() => {
		setIsOpen(false)
		setHighlightedIndex(-1)
	}, [])

	// Handle outside click and escape
	useOutsideClick(menuRef, closeMenu, isOpen)
	useEscapeKey(closeMenu, isOpen)

	// Handle keyboard navigation
	const handleKeyDown = React.useCallback(
		(e: React.KeyboardEvent) => {
			if (disabled) return

			if (!isOpen) {
				if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
					e.preventDefault()
					setIsOpen(true)
					setHighlightedIndex(0)
				}
				return
			}

			switch (e.key) {
				case 'ArrowDown':
					e.preventDefault()
					setHighlightedIndex((i) => Math.min(i + 1, flatFonts.length - 1))
					break
				case 'ArrowUp':
					e.preventDefault()
					setHighlightedIndex((i) => Math.max(i - 1, 0))
					break
				case 'Enter':
				case ' ':
					e.preventDefault()
					if (highlightedIndex >= 0 && highlightedIndex < flatFonts.length) {
						onChange(flatFonts[highlightedIndex].family)
						closeMenu()
					}
					break
				case 'Home':
					e.preventDefault()
					setHighlightedIndex(0)
					break
				case 'End':
					e.preventDefault()
					setHighlightedIndex(flatFonts.length - 1)
					break
			}
		},
		[disabled, isOpen, flatFonts, highlightedIndex, onChange, closeMenu]
	)

	// Handle font selection
	const handleSelect = React.useCallback(
		(family: string) => {
			onChange(family)
			closeMenu()
		},
		[onChange, closeMenu]
	)

	// Toggle menu
	const handleButtonClick = React.useCallback(() => {
		if (disabled) return
		setIsOpen((prev) => !prev)
	}, [disabled])

	// Get index in flat list for a font
	const getFlatIndex = React.useCallback(
		(family: string) => {
			return flatFonts.findIndex((f) => f.family === family)
		},
		[flatFonts]
	)

	return (
		<div className={mergeClasses('c-font-picker', className)}>
			<button
				ref={setButtonRef}
				type="button"
				className={mergeClasses(
					'c-font-picker__button c-input',
					isOpen && 'c-font-picker__button--open'
				)}
				onClick={handleButtonClick}
				onKeyDown={handleKeyDown}
				disabled={disabled}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
			>
				<span
					className="c-font-picker__value"
					style={{
						fontFamily: currentFont ? `'${currentFont.family}', sans-serif` : undefined
					}}
				>
					{currentFont?.displayName || value || 'Select font...'}
				</span>
				<IcCaret
					size={12}
					className={mergeClasses(
						'c-font-picker__caret',
						isOpen && 'c-font-picker__caret--open'
					)}
				/>
			</button>

			{isOpen &&
				createPortal(
					<div
						ref={setMenuRef}
						className="c-font-picker__menu c-nav"
						style={popperStyles.popper}
						role="listbox"
						{...attributes.popper}
					>
						{columns.map((columnGroups, colIdx) => (
							<div key={colIdx} className="c-font-picker__column">
								{columnGroups.map((group) => (
									<div key={group.category} className="c-font-picker__group">
										<div className="c-font-picker__group-label">
											{group.label}
										</div>
										{group.fonts.map((font) => {
											const flatIndex = getFlatIndex(font.family)
											const isSelected = font.family === value
											const isHighlighted = flatIndex === highlightedIndex
											const isSuggested = suggestedFonts.has(font.family)

											return (
												<button
													key={font.family}
													type="button"
													className={mergeClasses(
														'c-font-picker__item c-nav-item',
														isSelected && 'selected',
														isHighlighted && 'highlighted',
														isSuggested &&
															'c-font-picker__item--suggested'
													)}
													style={{
														fontFamily: `'${font.family}', sans-serif`
													}}
													onClick={() => handleSelect(font.family)}
													onMouseEnter={() =>
														setHighlightedIndex(flatIndex)
													}
													role="option"
													aria-selected={isSelected}
												>
													{font.displayName}
													{isSuggested && (
														<span className="c-font-picker__suggested-badge">
															Pair
														</span>
													)}
												</button>
											)
										})}
									</div>
								))}
							</div>
						))}
					</div>,
					document.getElementById('popper-container') || document.body
				)}
		</div>
	)
}

// vim: ts=4
