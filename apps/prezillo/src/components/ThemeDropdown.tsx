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
 * ThemeDropdown - Toolbar dropdown for presentation theme settings
 * Contains ThemePicker (presets) and PaletteEditor (custom colors/gradients)
 */

import * as React from 'react'
import * as Y from 'yjs'
import { PiPaletteBold as IcPalette } from 'react-icons/pi'

import type { YPrezilloDocument } from '../crdt'
import { usePaletteValue } from '../hooks'
import { ThemePicker } from './PropertiesPanel/ThemePicker'
import { PaletteEditor } from './PropertiesPanel/PaletteEditor'

import './ThemeDropdown.css'

export interface ThemeDropdownProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
}

export function ThemeDropdown({ doc, yDoc }: ThemeDropdownProps) {
	const currentPalette = usePaletteValue(doc)
	const [isOpen, setIsOpen] = React.useState(false)
	const dropdownRef = React.useRef<HTMLDivElement>(null)

	// Close on click outside
	React.useEffect(() => {
		if (!isOpen) return

		function handleClickOutside(evt: MouseEvent) {
			if (dropdownRef.current && !dropdownRef.current.contains(evt.target as Node)) {
				setIsOpen(false)
			}
		}

		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [isOpen])

	return (
		<div className="c-theme-dropdown-wrapper" ref={dropdownRef}>
			<button
				type="button"
				className="c-button icon"
				onClick={() => setIsOpen(!isOpen)}
				title="Theme"
			>
				<IcPalette />
			</button>

			{isOpen && (
				<div className="c-theme-dropdown-popover">
					<div className="c-theme-dropdown-header">
						<span className="c-theme-dropdown-title">Presentation Theme</span>
						<span className="c-theme-dropdown-subtitle">Applies to all pages</span>
					</div>
					<ThemePicker doc={doc} yDoc={yDoc} currentPalette={currentPalette} />
					<PaletteEditor doc={doc} yDoc={yDoc} mode="section" />
				</div>
			)}
		</div>
	)
}

// vim: ts=4
