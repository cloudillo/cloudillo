// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * ThemeDropdown - Toolbar dropdown for presentation theme settings
 * Contains ThemePicker (presets) and PaletteEditor (custom colors/gradients)
 */

import * as React from 'react'
import type * as Y from 'yjs'
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
