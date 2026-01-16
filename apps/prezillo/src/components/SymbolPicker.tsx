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

/**
 * SymbolPicker component - Dropdown picker for inserting symbols
 *
 * Shows a grid of symbols organized by category with tab navigation.
 * Mobile-friendly with 44px+ touch targets.
 */

import * as React from 'react'
import { PiStarBold as IcSymbol } from 'react-icons/pi'
import {
	SYMBOLS,
	getCategories,
	getSymbolsByCategory,
	CATEGORY_NAMES,
	type SymbolCategory,
	type SymbolDefinition
} from '../data/symbol-library'
import { mergeClasses } from '../utils'

export interface SymbolPickerProps {
	isActive: boolean
	selectedSymbolId: string | null
	onSelectSymbol: (symbolId: string) => void
	onClose: () => void
}

/**
 * Renders a single symbol button in the grid
 */
function SymbolButton({
	symbol,
	isSelected,
	onClick
}: {
	symbol: SymbolDefinition
	isSelected: boolean
	onClick: () => void
}) {
	const [vbX, vbY, vbWidth, vbHeight] = symbol.viewBox

	return (
		<button
			className={mergeClasses('c-symbol-btn', isSelected ? 'active' : '')}
			onClick={onClick}
			title={symbol.name}
			type="button"
		>
			<svg viewBox={`${vbX} ${vbY} ${vbWidth} ${vbHeight}`} className="c-symbol-icon">
				<path d={symbol.pathData} fill="currentColor" />
			</svg>
		</button>
	)
}

export function SymbolPicker({
	isActive,
	selectedSymbolId,
	onSelectSymbol,
	onClose
}: SymbolPickerProps) {
	const [isOpen, setIsOpen] = React.useState(false)
	const [activeCategory, setActiveCategory] = React.useState<SymbolCategory>('status')
	const containerRef = React.useRef<HTMLDivElement>(null)

	const categories = getCategories()
	const currentSymbols = getSymbolsByCategory(activeCategory)

	// Close dropdown when clicking outside
	React.useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
				setIsOpen(false)
			}
		}
		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside)
			return () => document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [isOpen])

	// Close on Escape
	React.useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === 'Escape' && isOpen) {
				setIsOpen(false)
				onClose()
			}
		}
		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [isOpen, onClose])

	const handleSymbolClick = (symbolId: string) => {
		onSelectSymbol(symbolId)
		setIsOpen(false)
	}

	const handleToggle = () => {
		if (isActive) {
			// Clicking again deselects
			onClose()
		} else {
			setIsOpen(!isOpen)
		}
	}

	return (
		<div ref={containerRef} className="c-symbol-picker" style={{ position: 'relative' }}>
			<button
				onClick={handleToggle}
				className={mergeClasses('c-button icon', isActive ? 'active' : '')}
				title="Symbol"
				type="button"
			>
				<IcSymbol />
			</button>

			{isOpen && (
				<div className="c-symbol-dropdown">
					{/* Category tabs */}
					<div className="c-symbol-tabs">
						{categories.map((cat) => (
							<button
								key={cat}
								className={mergeClasses(
									'c-symbol-tab',
									activeCategory === cat ? 'active' : ''
								)}
								onClick={() => setActiveCategory(cat)}
								type="button"
							>
								{CATEGORY_NAMES[cat]}
							</button>
						))}
					</div>

					{/* Symbol grid */}
					<div className="c-symbol-grid">
						{currentSymbols.map((symbol) => (
							<SymbolButton
								key={symbol.id}
								symbol={symbol}
								isSelected={selectedSymbolId === symbol.id}
								onClick={() => handleSymbolClick(symbol.id)}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	)
}

// vim: ts=4
