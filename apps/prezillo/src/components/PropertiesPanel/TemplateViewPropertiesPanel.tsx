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
 * Inline template properties shown in the Properties section of the sidebar
 * (not the full sidebar takeover). Mirrors ViewPropertiesPanel pattern.
 */

import * as React from 'react'
import * as Y from 'yjs'
import { useY } from 'react-yjs'
import { PropertySection, PropertyField, ColorInput, NumberInput, Input } from '@cloudillo/react'
import { GradientPicker } from '@cloudillo/canvas-tools'
import type { Gradient } from '@cloudillo/canvas-tools'
import {
	PiPlusBold as IcAdd,
	PiTrashBold as IcDelete,
	PiArrowsHorizontalBold as IcArrowsHorizontal,
	PiArrowsVerticalBold as IcArrowsVertical
} from 'react-icons/pi'

import type { YPrezilloDocument, TemplateId, SnapGuide } from '../../crdt'
import {
	getTemplate,
	updateTemplate,
	addSnapGuide,
	updateSnapGuide,
	removeSnapGuide
} from '../../crdt'
import { mergeClasses } from '../../utils'

export interface TemplateViewPropertiesPanelProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	templateId: TemplateId
}

type BackgroundType = 'solid' | 'gradient'

export function TemplateViewPropertiesPanel({
	doc,
	yDoc,
	templateId
}: TemplateViewPropertiesPanelProps) {
	useY(doc.tpl)

	const template = getTemplate(doc, templateId)

	const backgroundType: BackgroundType = React.useMemo(() => {
		const gradient = template?.backgroundGradient
		if (gradient && gradient.type !== 'solid' && gradient.stops && gradient.stops.length >= 2) {
			return 'gradient'
		}
		return 'solid'
	}, [template?.backgroundGradient])

	const [activeType, setActiveType] = React.useState<BackgroundType>(backgroundType)

	React.useEffect(() => {
		setActiveType(backgroundType)
	}, [backgroundType])

	if (!template) {
		return <div className="c-empty-message">Template not found</div>
	}

	const handleNameChange = (name: string) => {
		updateTemplate(yDoc, doc, templateId, { name })
	}

	const handleWidthChange = (width: number) => {
		updateTemplate(yDoc, doc, templateId, { width })
	}

	const handleHeightChange = (height: number) => {
		updateTemplate(yDoc, doc, templateId, { height })
	}

	const handleSolidColorChange = (color: string) => {
		updateTemplate(yDoc, doc, templateId, {
			backgroundColor: color,
			backgroundGradient: null
		})
	}

	const handleGradientChange = (gradient: Gradient) => {
		if (gradient.type === 'solid') {
			updateTemplate(yDoc, doc, templateId, {
				backgroundColor: gradient.color ?? '#ffffff',
				backgroundGradient: null
			})
		} else {
			updateTemplate(yDoc, doc, templateId, {
				backgroundGradient: gradient,
				backgroundColor: null
			})
		}
	}

	const handleTypeSwitch = (type: BackgroundType) => {
		setActiveType(type)

		if (type === 'solid') {
			const color =
				template.backgroundGradient?.stops?.[0]?.color ??
				template.backgroundColor ??
				'#ffffff'
			updateTemplate(yDoc, doc, templateId, {
				backgroundColor: color,
				backgroundGradient: null
			})
		} else {
			const currentColor = template.backgroundColor ?? '#ffffff'
			const gradient: Gradient = {
				type: 'linear',
				angle: 180,
				stops: [
					{ color: currentColor, position: 0 },
					{ color: '#e0e0e0', position: 1 }
				]
			}
			updateTemplate(yDoc, doc, templateId, {
				backgroundGradient: gradient,
				backgroundColor: null
			})
		}
	}

	const gradientValue: Gradient = React.useMemo(() => {
		if (activeType === 'solid') {
			return { type: 'solid', color: template.backgroundColor ?? '#ffffff' }
		}

		if (template.backgroundGradient && template.backgroundGradient.type !== 'solid') {
			return template.backgroundGradient
		}

		return {
			type: 'linear',
			angle: 180,
			stops: [
				{ color: template.backgroundColor ?? '#ffffff', position: 0 },
				{ color: '#e0e0e0', position: 1 }
			]
		}
	}, [activeType, template.backgroundColor, template.backgroundGradient])

	const handleAddGuide = (direction: 'horizontal' | 'vertical') => {
		addSnapGuide(yDoc, doc, templateId, {
			direction,
			position: 0.5,
			absolute: false
		})
	}

	const handleUpdateGuide = (index: number, updates: Partial<SnapGuide>) => {
		const currentGuide = template.snapGuides[index]
		if (!currentGuide) return
		updateSnapGuide(yDoc, doc, templateId, index, { ...currentGuide, ...updates })
	}

	const handleRemoveGuide = (index: number) => {
		removeSnapGuide(yDoc, doc, templateId, index)
	}

	return (
		<div className="c-vbox g-2">
			{/* General Section */}
			<PropertySection title="General" defaultExpanded>
				<PropertyField label="Name">
					<Input
						value={template.name}
						onChange={(e) => handleNameChange(e.target.value)}
					/>
				</PropertyField>
				<div className="c-hbox g-2">
					<PropertyField label="Width">
						<NumberInput
							value={template.width}
							onChange={handleWidthChange}
							min={100}
							max={7680}
						/>
					</PropertyField>
					<PropertyField label="Height">
						<NumberInput
							value={template.height}
							onChange={handleHeightChange}
							min={100}
							max={4320}
						/>
					</PropertyField>
				</div>
			</PropertySection>

			{/* Background Section */}
			<PropertySection title="Background" defaultExpanded>
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

				{activeType === 'solid' && (
					<PropertyField label="Color">
						<ColorInput
							value={template.backgroundColor ?? '#ffffff'}
							onChange={handleSolidColorChange}
						/>
					</PropertyField>
				)}

				{activeType === 'gradient' && (
					<GradientPicker
						value={gradientValue}
						onChange={handleGradientChange}
						aspectRatio={template.width / template.height}
						showPresets
						maxPresets={8}
					/>
				)}
			</PropertySection>

			{/* Snap Guides Section */}
			<PropertySection title="Snap Guides" defaultExpanded={template.snapGuides.length > 0}>
				<div className="c-template-properties__guides">
					{template.snapGuides.length === 0 ? (
						<p className="c-template-properties__guides-empty">
							No snap guides defined. Add guides to help with object alignment.
						</p>
					) : (
						<div className="c-template-properties__guides-list">
							{template.snapGuides.map((guide, index) => (
								<SnapGuideEditor
									key={index}
									guide={guide}
									templateWidth={template.width}
									templateHeight={template.height}
									onChange={(updates) => handleUpdateGuide(index, updates)}
									onDelete={() => handleRemoveGuide(index)}
								/>
							))}
						</div>
					)}
					<div className="c-hbox g-1 mt-2">
						<button
							type="button"
							className="c-button compact flex-1"
							onClick={() => handleAddGuide('horizontal')}
							title="Add horizontal guide"
						>
							<IcArrowsHorizontal />H
						</button>
						<button
							type="button"
							className="c-button compact flex-1"
							onClick={() => handleAddGuide('vertical')}
							title="Add vertical guide"
						>
							<IcArrowsVertical />V
						</button>
					</div>
				</div>
			</PropertySection>
		</div>
	)
}

/**
 * Editor for a single snap guide
 */
interface SnapGuideEditorProps {
	guide: SnapGuide
	templateWidth: number
	templateHeight: number
	onChange: (updates: Partial<SnapGuide>) => void
	onDelete: () => void
}

function SnapGuideEditor({
	guide,
	templateWidth,
	templateHeight,
	onChange,
	onDelete
}: SnapGuideEditorProps) {
	const displayValue = guide.absolute ? guide.position : Math.round(guide.position * 100)

	const handleValueChange = (value: number) => {
		if (guide.absolute) {
			onChange({ position: value })
		} else {
			onChange({ position: value / 100 })
		}
	}

	const handleModeToggle = () => {
		const maxValue = guide.direction === 'horizontal' ? templateHeight : templateWidth
		if (guide.absolute) {
			onChange({ absolute: false, position: guide.position / maxValue })
		} else {
			onChange({ absolute: true, position: Math.round(guide.position * maxValue) })
		}
	}

	const handleDirectionToggle = () => {
		const newDirection = guide.direction === 'horizontal' ? 'vertical' : 'horizontal'
		onChange({ direction: newDirection })
	}

	return (
		<div className="c-snap-guide-editor">
			<button
				type="button"
				className={mergeClasses('c-snap-guide-editor__direction', guide.direction)}
				onClick={handleDirectionToggle}
				title={`${guide.direction === 'horizontal' ? 'Horizontal' : 'Vertical'} (click to toggle)`}
			>
				{guide.direction === 'horizontal' ? <IcArrowsHorizontal /> : <IcArrowsVertical />}
			</button>
			<div className="c-snap-guide-editor__value">
				<NumberInput
					value={displayValue}
					onChange={handleValueChange}
					min={0}
					max={
						guide.absolute
							? guide.direction === 'horizontal'
								? templateHeight
								: templateWidth
							: 100
					}
					step={guide.absolute ? 1 : 1}
				/>
				<button
					type="button"
					className={mergeClasses(
						'c-snap-guide-editor__mode',
						guide.absolute && 'absolute'
					)}
					onClick={handleModeToggle}
					title={guide.absolute ? 'Absolute (px)' : 'Percentage (%)'}
				>
					{guide.absolute ? 'px' : '%'}
				</button>
			</div>
			<button
				type="button"
				className="c-snap-guide-editor__delete"
				onClick={onDelete}
				title="Delete guide"
			>
				<IcDelete />
			</button>
		</div>
	)
}

// vim: ts=4
