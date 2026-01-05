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
import { PiArrowCounterClockwiseBold as IcReset } from 'react-icons/pi'

import type { YPrezilloDocument, ViewId, ViewNode } from '../../crdt'
import {
	updateView,
	getViewTemplate,
	resolveViewBackground,
	setViewBackgroundOverride,
	resetViewBackgroundToTemplate
} from '../../crdt'

type BackgroundType = 'solid' | 'gradient'

export interface BackgroundSectionProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	view: ViewNode
}

export function BackgroundSection({ doc, yDoc, view }: BackgroundSectionProps) {
	// Check if view has a template
	const templateId = getViewTemplate(doc, view.id)
	const hasTemplate = !!templateId

	// Resolve background with template inheritance
	const resolvedBackground = React.useMemo(
		() => resolveViewBackground(doc, view.id),
		[doc, view.id, view.backgroundColor, view.backgroundGradient, templateId]
	)

	// Check if background is overridden (only relevant when template is assigned)
	const isOverridden =
		hasTemplate &&
		(resolvedBackground.overrides.backgroundColor ||
			resolvedBackground.overrides.backgroundGradient)

	// Determine current background type from resolved values
	const backgroundType: BackgroundType = React.useMemo(() => {
		const gradient = resolvedBackground.backgroundGradient
		if (gradient && gradient.type !== 'solid' && gradient.stops && gradient.stops.length >= 2) {
			return 'gradient'
		}
		return 'solid'
	}, [resolvedBackground.backgroundGradient])

	const [activeType, setActiveType] = React.useState<BackgroundType>(backgroundType)

	// Sync activeType when resolved background changes
	React.useEffect(() => {
		setActiveType(backgroundType)
	}, [backgroundType])

	// Handle solid color change
	const handleSolidColorChange = React.useCallback(
		(color: string) => {
			if (hasTemplate) {
				// Use override mechanism when template is assigned
				setViewBackgroundOverride(yDoc, doc, view.id, 'backgroundColor', color)
				setViewBackgroundOverride(yDoc, doc, view.id, 'backgroundGradient', null)
			} else {
				updateView(yDoc, doc, view.id, {
					backgroundColor: color,
					backgroundGradient: undefined
				})
			}
		},
		[yDoc, doc, view.id, hasTemplate]
	)

	// Handle gradient change
	const handleGradientChange = React.useCallback(
		(gradient: Gradient) => {
			if (gradient.type === 'solid') {
				// User switched to solid in the picker
				if (hasTemplate) {
					setViewBackgroundOverride(
						yDoc,
						doc,
						view.id,
						'backgroundColor',
						gradient.color ?? '#ffffff'
					)
					setViewBackgroundOverride(yDoc, doc, view.id, 'backgroundGradient', null)
				} else {
					updateView(yDoc, doc, view.id, {
						backgroundColor: gradient.color ?? '#ffffff',
						backgroundGradient: undefined
					})
				}
			} else {
				if (hasTemplate) {
					setViewBackgroundOverride(yDoc, doc, view.id, 'backgroundGradient', gradient)
					setViewBackgroundOverride(yDoc, doc, view.id, 'backgroundColor', null)
				} else {
					updateView(yDoc, doc, view.id, {
						backgroundGradient: gradient,
						backgroundColor: undefined
					})
				}
			}
		},
		[yDoc, doc, view.id, hasTemplate]
	)

	// Handle type switch
	const handleTypeSwitch = React.useCallback(
		(type: BackgroundType) => {
			setActiveType(type)

			if (type === 'solid') {
				// Switch to solid - use first stop color if gradient exists
				const color =
					resolvedBackground.backgroundGradient?.stops?.[0]?.color ??
					resolvedBackground.backgroundColor ??
					'#ffffff'
				if (hasTemplate) {
					setViewBackgroundOverride(yDoc, doc, view.id, 'backgroundColor', color)
					setViewBackgroundOverride(yDoc, doc, view.id, 'backgroundGradient', null)
				} else {
					updateView(yDoc, doc, view.id, {
						backgroundColor: color,
						backgroundGradient: undefined
					})
				}
			} else {
				// Switch to gradient - create default gradient from current color
				const currentColor = resolvedBackground.backgroundColor ?? '#ffffff'
				const gradient: Gradient = {
					type: 'linear',
					angle: 180,
					stops: [
						{ color: currentColor, position: 0 },
						{ color: '#e0e0e0', position: 1 }
					]
				}
				if (hasTemplate) {
					setViewBackgroundOverride(yDoc, doc, view.id, 'backgroundGradient', gradient)
					setViewBackgroundOverride(yDoc, doc, view.id, 'backgroundColor', null)
				} else {
					updateView(yDoc, doc, view.id, {
						backgroundGradient: gradient,
						backgroundColor: undefined
					})
				}
			}
		},
		[
			yDoc,
			doc,
			view.id,
			hasTemplate,
			resolvedBackground.backgroundColor,
			resolvedBackground.backgroundGradient
		]
	)

	// Handle reset to template
	const handleResetToTemplate = React.useCallback(() => {
		resetViewBackgroundToTemplate(yDoc, doc, view.id, 'all')
	}, [yDoc, doc, view.id])

	// Get current gradient value for picker (from resolved background)
	const gradientValue: Gradient = React.useMemo(() => {
		if (activeType === 'solid') {
			return { type: 'solid', color: resolvedBackground.backgroundColor ?? '#ffffff' }
		}

		if (
			resolvedBackground.backgroundGradient &&
			resolvedBackground.backgroundGradient.type !== 'solid'
		) {
			return resolvedBackground.backgroundGradient
		}

		// Default gradient
		return {
			type: 'linear',
			angle: 180,
			stops: [
				{ color: resolvedBackground.backgroundColor ?? '#ffffff', position: 0 },
				{ color: '#e0e0e0', position: 1 }
			]
		}
	}, [activeType, resolvedBackground.backgroundColor, resolvedBackground.backgroundGradient])

	return (
		<PropertySection title="Background" defaultExpanded>
			{/* Template inheritance indicator */}
			{hasTemplate && !isOverridden && (
				<div className="c-background-inherited-badge">From template</div>
			)}

			{/* Reset to template button when overridden */}
			{isOverridden && (
				<div className="c-hbox jc-end mb-2">
					<button
						type="button"
						className="c-button compact small"
						onClick={handleResetToTemplate}
						title="Reset to template background"
					>
						<IcReset />
						Reset to Template
					</button>
				</div>
			)}

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
						value={resolvedBackground.backgroundColor ?? '#ffffff'}
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
