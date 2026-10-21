// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * ThemeDropdown - Toolbar dropdown for presentation theme settings
 * Contains ThemePicker (presets) and PaletteEditor (custom colors/gradients)
 */

import { IcAppearance, useOutsideClick } from '@cloudillo/react'
import * as React from 'react'
import type * as Y from 'yjs'

import type { YPrezilloDocument } from '../crdt'
import { usePaletteValue } from '../hooks'
import { PaletteEditor } from './PropertiesPanel/PaletteEditor'
import { ThemePicker } from './PropertiesPanel/ThemePicker'

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
	useOutsideClick(dropdownRef, () => setIsOpen(false), isOpen)

	return (
		<div className="c-theme-dropdown-wrapper" ref={dropdownRef}>
			<button
				type="button"
				className="c-button icon"
				onClick={() => setIsOpen(!isOpen)}
				title="Theme"
			>
				<IcAppearance />
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
