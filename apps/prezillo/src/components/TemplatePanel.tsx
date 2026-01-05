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
 * TemplatePanel - Panel for managing page templates
 *
 * Lists all templates, allows creating, editing, duplicating, and deleting templates.
 * Shows template usage counts and provides quick preview of template styles.
 */

import * as React from 'react'
import * as Y from 'yjs'
import { useY } from 'react-yjs'
import {
	PiPlusBold as IcAdd,
	PiPencilBold as IcEdit,
	PiCopyBold as IcDuplicate,
	PiTrashBold as IcDelete,
	PiFileBold as IcTemplate,
	PiDotsThreeVerticalBold as IcMenu
} from 'react-icons/pi'

import type { YPrezilloDocument, TemplateId, Template } from '../crdt'
import {
	getAllTemplates,
	createTemplate,
	deleteTemplate,
	duplicateTemplate,
	getViewsUsingTemplate,
	getTemplatePrototypeObjects
} from '../crdt'
import { mergeClasses } from '../utils'

export interface TemplatePanelProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	selectedTemplateId: TemplateId | null
	onSelectTemplate: (templateId: TemplateId | null) => void
	onEditTemplate: (templateId: TemplateId) => void
	readOnly?: boolean
}

interface TemplateMenuState {
	templateId: TemplateId
	x: number
	y: number
}

export function TemplatePanel({
	doc,
	yDoc,
	selectedTemplateId,
	onSelectTemplate,
	onEditTemplate,
	readOnly
}: TemplatePanelProps) {
	// Subscribe to templates for reactivity
	useY(doc.tpl)
	useY(doc.v)

	const [menuState, setMenuState] = React.useState<TemplateMenuState | null>(null)
	const [deleteConfirm, setDeleteConfirm] = React.useState<TemplateId | null>(null)
	const menuRef = React.useRef<HTMLDivElement>(null)

	// Get all templates
	const templates = getAllTemplates(doc)

	// Close menu on outside click
	React.useEffect(() => {
		if (!menuState) return

		function handleClickOutside(evt: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(evt.target as Node)) {
				setMenuState(null)
			}
		}

		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [menuState])

	// Handle create new template
	const handleCreate = React.useCallback(() => {
		const templateId = createTemplate(yDoc, doc, {
			name: `Template ${templates.length + 1}`,
			width: 1920,
			height: 1080,
			backgroundColor: '#ffffff'
		})
		onSelectTemplate(templateId)
		onEditTemplate(templateId)
	}, [yDoc, doc, templates.length, onSelectTemplate, onEditTemplate])

	// Handle template click (select on canvas)
	const handleClick = React.useCallback(
		(templateId: TemplateId) => {
			onSelectTemplate(templateId === selectedTemplateId ? null : templateId)
		},
		[onSelectTemplate, selectedTemplateId]
	)

	// Handle menu button click
	const handleMenuClick = React.useCallback((e: React.MouseEvent, templateId: TemplateId) => {
		e.stopPropagation()
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
		setMenuState({ templateId, x: rect.right, y: rect.bottom })
	}, [])

	// Handle duplicate
	const handleDuplicate = React.useCallback(
		(templateId: TemplateId) => {
			const newId = duplicateTemplate(yDoc, doc, templateId)
			onSelectTemplate(newId)
			setMenuState(null)
		},
		[yDoc, doc, onSelectTemplate]
	)

	// Handle delete confirmation
	const handleDeleteConfirm = React.useCallback(
		(templateId: TemplateId) => {
			const usageCount = getViewsUsingTemplate(doc, templateId).length
			if (usageCount > 0) {
				setDeleteConfirm(templateId)
			} else {
				deleteTemplate(yDoc, doc, templateId, { viewAction: 'detach' })
				if (selectedTemplateId === templateId) {
					onSelectTemplate(null)
				}
			}
			setMenuState(null)
		},
		[doc, yDoc, selectedTemplateId, onSelectTemplate]
	)

	// Handle delete with option
	const handleDelete = React.useCallback(
		(viewAction: 'detach' | 'remove-instances' | 'keep-background') => {
			if (!deleteConfirm) return
			deleteTemplate(yDoc, doc, deleteConfirm, { viewAction })
			if (selectedTemplateId === deleteConfirm) {
				onSelectTemplate(null)
			}
			setDeleteConfirm(null)
		},
		[yDoc, doc, deleteConfirm, selectedTemplateId, onSelectTemplate]
	)

	// Get template stats
	const getTemplateStats = React.useCallback(
		(templateId: TemplateId) => {
			const usageCount = getViewsUsingTemplate(doc, templateId).length
			const objectCount = getTemplatePrototypeObjects(doc, templateId).length
			return { usageCount, objectCount }
		},
		[doc]
	)

	return (
		<div className="c-template-panel">
			<div className="c-template-panel__header">
				<span className="c-template-panel__title">
					<IcTemplate />
					Templates
				</span>
				{!readOnly && (
					<button
						type="button"
						className="c-button icon compact"
						onClick={handleCreate}
						title="Create template"
					>
						<IcAdd />
					</button>
				)}
			</div>

			{templates.length === 0 ? (
				<div className="c-template-panel__empty">
					<p>No templates yet</p>
					{!readOnly && (
						<button type="button" className="c-button compact" onClick={handleCreate}>
							<IcAdd />
							Create Template
						</button>
					)}
				</div>
			) : (
				<div className="c-template-panel__list">
					{templates.map((template) => {
						const { usageCount, objectCount } = getTemplateStats(template.id)
						return (
							<div
								key={template.id}
								className={mergeClasses(
									'c-template-panel__item',
									template.id === selectedTemplateId && 'selected'
								)}
								onClick={() => handleClick(template.id)}
							>
								<div
									className="c-template-panel__item-preview"
									style={{
										backgroundColor: template.backgroundColor ?? '#f0f0f0',
										background: template.backgroundGradient
											? formatGradientPreview(template.backgroundGradient)
											: undefined
									}}
								>
									{objectCount > 0 && (
										<span className="c-template-panel__item-objects">
											{objectCount}
										</span>
									)}
								</div>
								<div className="c-template-panel__item-info">
									<span className="c-template-panel__item-name">
										{template.name}
									</span>
									<span className="c-template-panel__item-usage">
										{usageCount === 0
											? 'Not used'
											: usageCount === 1
												? '1 page'
												: `${usageCount} pages`}
									</span>
								</div>
								{!readOnly && (
									<button
										type="button"
										className="c-template-panel__item-menu"
										onClick={(e) => handleMenuClick(e, template.id)}
									>
										<IcMenu />
									</button>
								)}
							</div>
						)
					})}
				</div>
			)}

			{/* Context menu */}
			{menuState && (
				<div
					ref={menuRef}
					className="c-template-panel__menu"
					style={{
						position: 'fixed',
						left: menuState.x,
						top: menuState.y,
						zIndex: 1000
					}}
				>
					<button
						type="button"
						className="c-template-panel__menu-item"
						onClick={() => {
							onEditTemplate(menuState.templateId)
							setMenuState(null)
						}}
					>
						<IcEdit />
						Edit
					</button>
					<button
						type="button"
						className="c-template-panel__menu-item"
						onClick={() => handleDuplicate(menuState.templateId)}
					>
						<IcDuplicate />
						Duplicate
					</button>
					<button
						type="button"
						className="c-template-panel__menu-item danger"
						onClick={() => handleDeleteConfirm(menuState.templateId)}
					>
						<IcDelete />
						Delete
					</button>
				</div>
			)}

			{/* Delete confirmation dialog */}
			{deleteConfirm && (
				<div className="c-template-panel__confirm-overlay">
					<div className="c-template-panel__confirm">
						<h3>Delete Template?</h3>
						<p>
							This template is used by{' '}
							{getViewsUsingTemplate(doc, deleteConfirm).length} page(s). What should
							happen to those pages?
						</p>
						<div className="c-template-panel__confirm-options">
							<button
								type="button"
								className="c-button"
								onClick={() => handleDelete('keep-background')}
							>
								Keep Background
							</button>
							<button
								type="button"
								className="c-button"
								onClick={() => handleDelete('detach')}
							>
								Detach Objects
							</button>
							<button
								type="button"
								className="c-button danger"
								onClick={() => handleDelete('remove-instances')}
							>
								Remove All
							</button>
						</div>
						<button
							type="button"
							className="c-button secondary"
							onClick={() => setDeleteConfirm(null)}
						>
							Cancel
						</button>
					</div>
				</div>
			)}
		</div>
	)
}

/**
 * Format gradient for preview
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
