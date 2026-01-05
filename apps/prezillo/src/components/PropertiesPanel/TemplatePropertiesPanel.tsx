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
 * TemplatePropertiesPanel - Template properties shown in the sidebar
 *
 * Provides interface for editing:
 * - Template name and dimensions
 * - Background (solid/gradient)
 * - Snap guides (horizontal/vertical alignment lines)
 * - Usage info (which pages use this template)
 * - Edit content button
 */

import * as React from 'react'
import * as Y from 'yjs'
import { useY } from 'react-yjs'
import {
	PropertySection,
	PropertyField,
	ColorInput,
	NumberInput,
	Input,
	Dialog,
	useDialog
} from '@cloudillo/react'
import { GradientPicker } from '@cloudillo/canvas-tools'
import type { Gradient } from '@cloudillo/canvas-tools'
import {
	PiXBold as IcClose,
	PiPlusBold as IcAdd,
	PiTrashBold as IcDelete,
	PiArrowsHorizontalBold as IcArrowsHorizontal,
	PiArrowsVerticalBold as IcArrowsVertical,
	PiPencilBold as IcEdit
} from 'react-icons/pi'

import type { YPrezilloDocument, TemplateId, Template, SnapGuide, ViewId } from '../../crdt'
import {
	getTemplate,
	updateTemplate,
	addSnapGuide,
	updateSnapGuide,
	removeSnapGuide,
	getViewsUsingTemplate,
	deleteTemplate,
	getView
} from '../../crdt'
import { mergeClasses } from '../../utils'

export interface TemplatePropertiesPanelProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	templateId: TemplateId
	/** Called when user wants to edit template content on canvas */
	onEditContent: (templateId: TemplateId) => void
	/** Called when template is deleted */
	onDelete?: () => void
	/** Called when user clicks close/back */
	onClose?: () => void
}

type BackgroundType = 'solid' | 'gradient'

export function TemplatePropertiesPanel({
	doc,
	yDoc,
	templateId,
	onEditContent,
	onDelete,
	onClose
}: TemplatePropertiesPanelProps) {
	// Subscribe to template changes
	useY(doc.tpl)
	useY(doc.v)

	const template = getTemplate(doc, templateId)
	const dialog = useDialog()

	// Get views using this template
	const viewsUsingTemplate = React.useMemo(() => {
		return getViewsUsingTemplate(doc, templateId)
	}, [doc, templateId, doc.v])

	// Determine current background type
	const backgroundType: BackgroundType = React.useMemo(() => {
		const gradient = template?.backgroundGradient
		if (gradient && gradient.type !== 'solid' && gradient.stops && gradient.stops.length >= 2) {
			return 'gradient'
		}
		return 'solid'
	}, [template?.backgroundGradient])

	const [activeType, setActiveType] = React.useState<BackgroundType>(backgroundType)

	// Sync activeType when template changes
	React.useEffect(() => {
		setActiveType(backgroundType)
	}, [backgroundType])

	if (!template) {
		return (
			<div className="c-template-properties">
				<div className="c-template-properties__header">
					<span>Template not found</span>
					{onClose && (
						<button type="button" className="c-button icon" onClick={onClose}>
							<IcClose />
						</button>
					)}
				</div>
			</div>
		)
	}

	// Handle name change
	const handleNameChange = (name: string) => {
		updateTemplate(yDoc, doc, templateId, { name })
	}

	// Handle dimension changes
	const handleWidthChange = (width: number) => {
		updateTemplate(yDoc, doc, templateId, { width })
	}

	const handleHeightChange = (height: number) => {
		updateTemplate(yDoc, doc, templateId, { height })
	}

	// Handle solid color change
	const handleSolidColorChange = (color: string) => {
		updateTemplate(yDoc, doc, templateId, {
			backgroundColor: color,
			backgroundGradient: null
		})
	}

	// Handle gradient change
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

	// Handle type switch
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

	// Get current gradient value for picker
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

	// Handle add snap guide
	const handleAddGuide = (direction: 'horizontal' | 'vertical') => {
		addSnapGuide(yDoc, doc, templateId, {
			direction,
			position: 0.5, // Default to center
			absolute: false
		})
	}

	// Handle update snap guide
	const handleUpdateGuide = (index: number, updates: Partial<SnapGuide>) => {
		const currentGuide = template.snapGuides[index]
		if (!currentGuide) return
		updateSnapGuide(yDoc, doc, templateId, index, { ...currentGuide, ...updates })
	}

	// Handle remove snap guide
	const handleRemoveGuide = (index: number) => {
		removeSnapGuide(yDoc, doc, templateId, index)
	}

	// Handle delete template
	const handleDelete = async () => {
		const usageCount = viewsUsingTemplate.length
		if (usageCount > 0) {
			const confirmed = await dialog.confirm(
				'Delete Template?',
				`This template is used by ${usageCount} page(s). Deleting will detach all instances. Continue?`
			)
			if (!confirmed) return
		}

		deleteTemplate(yDoc, doc, templateId, { viewAction: 'detach' })
		onDelete?.()
		onClose?.()
	}

	return (
		<div className="c-template-properties">
			{/* Header */}
			<div className="c-template-properties__header">
				<span className="c-template-properties__title">Template Properties</span>
				{onClose && (
					<button type="button" className="c-button icon" onClick={onClose} title="Close">
						<IcClose />
					</button>
				)}
			</div>

			{/* Edit Content button */}
			<div className="c-template-properties__edit-content p-2">
				<button
					type="button"
					className="c-button primary w-100"
					onClick={() => onEditContent(templateId)}
				>
					<IcEdit />
					Edit Template Content
				</button>
				<p className="c-template-properties__edit-hint">
					Add or edit objects that appear on all pages using this template
				</p>
			</div>

			<div className="c-template-properties__content">
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
								value={template.backgroundColor ?? '#ffffff'}
								onChange={handleSolidColorChange}
							/>
						</PropertyField>
					)}

					{/* Gradient picker */}
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
				<PropertySection
					title="Snap Guides"
					defaultExpanded={template.snapGuides.length > 0}
				>
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

				{/* Usage Section */}
				<PropertySection title="Usage" defaultExpanded>
					<div className="c-template-properties__usage">
						{viewsUsingTemplate.length === 0 ? (
							<p className="c-template-properties__usage-empty">
								This template is not used by any pages.
							</p>
						) : (
							<ul className="c-template-properties__usage-list">
								{viewsUsingTemplate.map((viewId) => {
									const view = getView(doc, viewId)
									return <li key={viewId}>{view?.name || `Page ${viewId}`}</li>
								})}
							</ul>
						)}
					</div>
				</PropertySection>

				{/* Delete button */}
				<div className="c-template-properties__actions p-2">
					<button type="button" className="c-button danger w-100" onClick={handleDelete}>
						<IcDelete />
						Delete Template
					</button>
				</div>
			</div>
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
	// Calculate display value based on mode
	const displayValue = guide.absolute ? guide.position : Math.round(guide.position * 100)

	// Handle value change
	const handleValueChange = (value: number) => {
		if (guide.absolute) {
			onChange({ position: value })
		} else {
			onChange({ position: value / 100 })
		}
	}

	// Handle mode toggle
	const handleModeToggle = () => {
		const maxValue = guide.direction === 'horizontal' ? templateHeight : templateWidth
		if (guide.absolute) {
			// Convert to percentage
			onChange({ absolute: false, position: guide.position / maxValue })
		} else {
			// Convert to absolute
			onChange({ absolute: true, position: Math.round(guide.position * maxValue) })
		}
	}

	// Handle direction toggle
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
