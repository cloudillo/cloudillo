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
import * as Y from 'yjs'
import { PropertySection, PropertyField, ColorInput } from '@cloudillo/react'
import { GradientPicker } from '@cloudillo/canvas-tools'
import type { Gradient } from '@cloudillo/canvas-tools'

import type { YPrezilloDocument, ViewId, ViewNode } from '../../crdt'
import { updateView } from '../../crdt'

type BackgroundType = 'solid' | 'gradient'

export interface BackgroundSectionProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	view: ViewNode
}

export function BackgroundSection({ doc, yDoc, view }: BackgroundSectionProps) {
	// Determine current background type
	const backgroundType: BackgroundType = React.useMemo(() => {
		const gradient = view.backgroundGradient
		if (gradient && gradient.type !== 'solid' && gradient.stops && gradient.stops.length >= 2) {
			return 'gradient'
		}
		return 'solid'
	}, [view.backgroundGradient])

	const [activeType, setActiveType] = React.useState<BackgroundType>(backgroundType)

	// Sync activeType when view changes
	React.useEffect(() => {
		setActiveType(backgroundType)
	}, [backgroundType])

	// Handle solid color change
	const handleSolidColorChange = React.useCallback(
		(color: string) => {
			updateView(yDoc, doc, view.id, {
				backgroundColor: color,
				backgroundGradient: undefined
			})
		},
		[yDoc, doc, view.id]
	)

	// Handle gradient change
	const handleGradientChange = React.useCallback(
		(gradient: Gradient) => {
			if (gradient.type === 'solid') {
				// User switched to solid in the picker
				updateView(yDoc, doc, view.id, {
					backgroundColor: gradient.color ?? '#ffffff',
					backgroundGradient: undefined
				})
			} else {
				updateView(yDoc, doc, view.id, {
					backgroundGradient: gradient,
					backgroundColor: undefined
				})
			}
		},
		[yDoc, doc, view.id]
	)

	// Handle type switch
	const handleTypeSwitch = React.useCallback(
		(type: BackgroundType) => {
			setActiveType(type)

			if (type === 'solid') {
				// Switch to solid - use first stop color if gradient exists
				const color =
					view.backgroundGradient?.stops?.[0]?.color ?? view.backgroundColor ?? '#ffffff'
				updateView(yDoc, doc, view.id, {
					backgroundColor: color,
					backgroundGradient: undefined
				})
			} else {
				// Switch to gradient - create default gradient from current color
				const currentColor = view.backgroundColor ?? '#ffffff'
				const gradient: Gradient = {
					type: 'linear',
					angle: 180,
					stops: [
						{ color: currentColor, position: 0 },
						{ color: '#e0e0e0', position: 1 }
					]
				}
				updateView(yDoc, doc, view.id, {
					backgroundGradient: gradient,
					backgroundColor: undefined
				})
			}
		},
		[yDoc, doc, view.id, view.backgroundColor, view.backgroundGradient]
	)

	// Get current gradient value for picker
	const gradientValue: Gradient = React.useMemo(() => {
		if (activeType === 'solid') {
			return { type: 'solid', color: view.backgroundColor ?? '#ffffff' }
		}

		if (view.backgroundGradient && view.backgroundGradient.type !== 'solid') {
			return view.backgroundGradient
		}

		// Default gradient
		return {
			type: 'linear',
			angle: 180,
			stops: [
				{ color: view.backgroundColor ?? '#ffffff', position: 0 },
				{ color: '#e0e0e0', position: 1 }
			]
		}
	}, [activeType, view.backgroundColor, view.backgroundGradient])

	return (
		<PropertySection title="Background" defaultExpanded>
			{/* Type selector */}
			<div className="c-hbox g-1 mb-2">
				<button
					type="button"
					className={`c-btn c-btn-sm flex-1 ${activeType === 'solid' ? 'c-btn-primary' : ''}`}
					onClick={() => handleTypeSwitch('solid')}
				>
					Solid
				</button>
				<button
					type="button"
					className={`c-btn c-btn-sm flex-1 ${activeType === 'gradient' ? 'c-btn-primary' : ''}`}
					onClick={() => handleTypeSwitch('gradient')}
				>
					Gradient
				</button>
			</div>

			{/* Solid color picker */}
			{activeType === 'solid' && (
				<PropertyField label="Color">
					<ColorInput
						value={view.backgroundColor ?? '#ffffff'}
						onChange={handleSolidColorChange}
					/>
				</PropertyField>
			)}

			{/* Gradient picker */}
			{activeType === 'gradient' && (
				<GradientPicker
					value={gradientValue}
					onChange={handleGradientChange}
					aspectRatio={view.width / view.height}
					showPresets
					maxPresets={8}
				/>
			)}
		</PropertySection>
	)
}

// vim: ts=4
