// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * TemplateSelector - Dropdown to assign a template to a page/view
 *
 * Shows available templates and allows applying/removing template assignment.
 * Used in ViewPropertiesPanel.
 */

import * as React from 'react'
import type * as Y from 'yjs'
import { useY } from 'react-yjs'
import {
	PiCaretDownBold as IcCaret,
	PiCheckBold as IcCheck,
	PiFileBold as IcTemplate,
	PiXBold as IcRemove
} from 'react-icons/pi'

import type { YPrezilloDocument, ViewId, TemplateId, Template } from '../crdt'
import {
	getAllTemplates,
	getViewTemplate,
	applyTemplateToView,
	removeTemplateFromView,
	getTemplate
} from '../crdt'
import { mergeClasses } from '../utils'

export interface TemplateSelectorProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	viewId: ViewId
	disabled?: boolean
}

export function TemplateSelector({ doc, yDoc, viewId, disabled }: TemplateSelectorProps) {
	// Subscribe to templates and views for reactivity
	useY(doc.tpl)
	useY(doc.v)

	const [isOpen, setIsOpen] = React.useState(false)
	const dropdownRef = React.useRef<HTMLDivElement>(null)

	// Get current template assignment
	const currentTemplateId = getViewTemplate(doc, viewId)
	const currentTemplate = currentTemplateId ? getTemplate(doc, currentTemplateId) : undefined

	// Get all available templates
	const templates = getAllTemplates(doc)

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

	// Handle template selection
	const handleSelectTemplate = React.useCallback(
		(templateId: TemplateId) => {
			// Remove old template instances first if switching templates
			if (currentTemplateId && currentTemplateId !== templateId) {
				removeTemplateFromView(yDoc, doc, viewId, { instanceAction: 'delete' })
			}
			applyTemplateToView(yDoc, doc, viewId, templateId)
			setIsOpen(false)
		},
		[yDoc, doc, viewId, currentTemplateId]
	)

	// Handle template removal
	const handleRemoveTemplate = React.useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation()
			removeTemplateFromView(yDoc, doc, viewId, { instanceAction: 'detach' })
			setIsOpen(false)
		},
		[yDoc, doc, viewId]
	)

	if (templates.length === 0 && !currentTemplate) {
		return (
			<div className="c-template-selector c-template-selector--empty">
				<IcTemplate className="c-template-selector__icon" />
				<span className="c-template-selector__label">No templates available</span>
			</div>
		)
	}

	return (
		<div ref={dropdownRef} className="c-template-selector">
			<div
				className={mergeClasses(
					'c-template-selector__trigger',
					currentTemplate && 'has-template',
					disabled && 'disabled'
				)}
			>
				<button
					type="button"
					className="c-template-selector__trigger-btn"
					onClick={() => !disabled && setIsOpen(!isOpen)}
					disabled={disabled}
				>
					<IcTemplate className="c-template-selector__icon" />
					<span className="c-template-selector__label">
						{currentTemplate ? currentTemplate.name : 'No template'}
					</span>
					{!currentTemplate && (
						<IcCaret
							className={mergeClasses('c-template-selector__caret', isOpen && 'open')}
						/>
					)}
				</button>
				{currentTemplate && (
					<button
						type="button"
						className="c-template-selector__remove"
						onClick={handleRemoveTemplate}
						title="Remove template"
					>
						<IcRemove />
					</button>
				)}
			</div>

			{isOpen && (
				<div className="c-template-selector__dropdown">
					<div className="c-template-selector__header">Select Template</div>
					<div className="c-template-selector__list">
						{templates.map((template) => (
							<button
								key={template.id}
								type="button"
								className={mergeClasses(
									'c-template-selector__item',
									template.id === currentTemplateId && 'selected'
								)}
								onClick={() => handleSelectTemplate(template.id)}
							>
								<span
									className="c-template-selector__item-swatch"
									style={{
										backgroundColor:
											(template.backgroundColor ??
											template.backgroundGradient)
												? undefined
												: '#f0f0f0',
										background: template.backgroundGradient
											? formatGradientPreview(template.backgroundGradient)
											: undefined
									}}
								/>
								<span className="c-template-selector__item-name">
									{template.name}
								</span>
								{template.id === currentTemplateId && (
									<IcCheck className="c-template-selector__item-check" />
								)}
							</button>
						))}
					</div>
					{currentTemplate && (
						<div className="c-template-selector__footer">
							<button
								type="button"
								className="c-template-selector__remove-btn"
								onClick={handleRemoveTemplate}
							>
								<IcRemove />
								Remove template
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	)
}

/**
 * Format gradient for preview swatch
 */
function formatGradientPreview(gradient: Template['backgroundGradient']): string | undefined {
	if (!gradient || !gradient.stops || gradient.stops.length < 2) return undefined

	const stops = gradient.stops
		.map((s) => `${s.color} ${(s.position * 100).toFixed(0)}%`)
		.join(', ')

	if (gradient.type === 'linear') {
		return `linear-gradient(${gradient.angle ?? 180}deg, ${stops})`
	} else if (gradient.type === 'radial') {
		return `radial-gradient(circle, ${stops})`
	}

	return undefined
}

// vim: ts=4
