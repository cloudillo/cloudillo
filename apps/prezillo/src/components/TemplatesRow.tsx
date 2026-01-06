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
 * Templates row component for rendering template thumbnails on the canvas.
 * Displays a horizontal row of template thumbnails above the slides.
 */

import * as React from 'react'
import * as Y from 'yjs'
import { IoChevronUp, IoChevronDown, IoAdd } from 'react-icons/io5'

import type { TemplateId, YPrezilloDocument } from '../crdt'
import { createTemplate } from '../crdt'
import type { TemplateWithUsage } from '../hooks/useTemplates'
import { TemplateThumbnail } from './TemplateThumbnail'

// Thumbnail dimensions
const THUMBNAIL_WIDTH = 200
const THUMBNAIL_HEIGHT = 112 // 16:9 aspect ratio
const THUMBNAIL_GAP = 24
const ROW_PADDING = 20
const LABEL_HEIGHT = 50 // Space for name and usage count below thumbnail

export interface TemplatesRowProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	/** Templates with usage data */
	templates: TemplateWithUsage[]
	/** Currently selected template ID */
	selectedTemplateId: TemplateId | null
	/** @deprecated No longer used - templates are edited directly on canvas */
	editingTemplateId?: TemplateId | null
	/** Callback when a template is selected */
	onSelectTemplate: (id: TemplateId | null) => void
	/** Callback when a template should be selected (double-click now just selects) */
	onEditTemplate: (id: TemplateId) => void
	/** Y position for the row */
	rowY: number
	/** Whether the row is collapsed */
	collapsed: boolean
	/** Toggle collapse state */
	onToggleCollapse: () => void
	/** Read-only mode */
	readOnly?: boolean
	/** Get template prototype objects */
	getTemplateObjects: (templateId: TemplateId) => any[]
}

export function TemplatesRow({
	doc,
	yDoc,
	templates,
	selectedTemplateId,
	onSelectTemplate,
	onEditTemplate,
	rowY,
	collapsed,
	onToggleCollapse,
	readOnly,
	getTemplateObjects
}: TemplatesRowProps) {
	// Calculate row width based on number of templates
	const totalWidth = templates.length * (THUMBNAIL_WIDTH + THUMBNAIL_GAP) + THUMBNAIL_GAP + 60 // Extra space for add button

	// Handle template click (select)
	const handleTemplateClick = React.useCallback(
		(e: React.MouseEvent, templateId: TemplateId) => {
			e.stopPropagation()
			onSelectTemplate(templateId)
		},
		[onSelectTemplate]
	)

	// Handle template double-click (edit)
	const handleTemplateDoubleClick = React.useCallback(
		(e: React.MouseEvent, templateId: TemplateId) => {
			e.stopPropagation()
			if (!readOnly) {
				onEditTemplate(templateId)
			}
		},
		[onEditTemplate, readOnly]
	)

	// Handle add new template
	const handleAddTemplate = React.useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation()
			if (readOnly) return

			const templateId = createTemplate(yDoc, doc, {
				name: `Template ${templates.length + 1}`,
				width: 1920,
				height: 1080,
				backgroundColor: '#ffffff'
			})
			onSelectTemplate(templateId)
		},
		[yDoc, doc, templates.length, onSelectTemplate, readOnly]
	)

	// Row header Y position
	const headerY = collapsed ? rowY : rowY - 10

	// If collapsed, show minimal header
	if (collapsed) {
		return (
			<g className="c-templates-row c-templates-row--collapsed">
				{/* Collapsed header bar */}
				<rect
					x={-100}
					y={headerY}
					width={totalWidth + 200}
					height={36}
					fill="#f3f4f6"
					stroke="#e5e7eb"
					strokeWidth={1}
					rx={4}
					style={{ cursor: 'pointer' }}
					onClick={onToggleCollapse}
				/>
				<text
					x={ROW_PADDING}
					y={headerY + 24}
					fontSize={14}
					fontWeight={500}
					fill="#374151"
					style={{ cursor: 'pointer', pointerEvents: 'none' }}
				>
					Templates ({templates.length})
				</text>
				<g
					transform={`translate(${totalWidth - 40}, ${headerY + 8})`}
					style={{ cursor: 'pointer' }}
					onClick={onToggleCollapse}
				>
					<IoChevronDown size={20} color="#6b7280" />
				</g>
			</g>
		)
	}

	// Expanded row
	return (
		<g className="c-templates-row">
			{/* Row background */}
			<rect
				x={-100}
				y={rowY - 20}
				width={totalWidth + 200}
				height={THUMBNAIL_HEIGHT + LABEL_HEIGHT + 40}
				fill="#f9fafb"
				stroke="#e5e7eb"
				strokeWidth={1}
				rx={8}
			/>

			{/* Row header with collapse button */}
			<g style={{ cursor: 'pointer' }} onClick={onToggleCollapse}>
				<text x={ROW_PADDING} y={rowY} fontSize={13} fontWeight={500} fill="#6b7280">
					TEMPLATES
				</text>
				<g transform={`translate(${100}, ${rowY - 12})`}>
					<IoChevronUp size={16} color="#9ca3af" />
				</g>
			</g>

			{/* Template thumbnails */}
			{templates.map((template, index) => {
				const thumbnailX = ROW_PADDING + index * (THUMBNAIL_WIDTH + THUMBNAIL_GAP)
				const thumbnailY = rowY + 16

				return (
					<TemplateThumbnail
						key={template.id}
						template={template}
						objects={getTemplateObjects(template.id)}
						usageCount={template.usageCount}
						x={thumbnailX}
						y={thumbnailY}
						width={THUMBNAIL_WIDTH}
						height={THUMBNAIL_HEIGHT}
						isSelected={selectedTemplateId === template.id}
						onClick={(e) => handleTemplateClick(e, template.id)}
						onDoubleClick={(e) => handleTemplateDoubleClick(e, template.id)}
						readOnly={readOnly}
					/>
				)
			})}

			{/* Add template button */}
			{!readOnly && (
				<g
					className="c-templates-row__add-button"
					onClick={handleAddTemplate}
					style={{ cursor: 'pointer' }}
				>
					<rect
						x={ROW_PADDING + templates.length * (THUMBNAIL_WIDTH + THUMBNAIL_GAP)}
						y={rowY + 16}
						width={THUMBNAIL_WIDTH / 2}
						height={THUMBNAIL_HEIGHT}
						rx={8}
						fill="#e5e7eb"
						stroke="#d1d5db"
						strokeWidth={1}
						strokeDasharray="4"
					/>
					<g
						transform={`translate(${ROW_PADDING + templates.length * (THUMBNAIL_WIDTH + THUMBNAIL_GAP) + THUMBNAIL_WIDTH / 4}, ${rowY + 16 + THUMBNAIL_HEIGHT / 2})`}
					>
						<IoAdd
							size={32}
							color="#9ca3af"
							style={{ transform: 'translate(-16px, -16px)' }}
						/>
					</g>
					<text
						x={
							ROW_PADDING +
							templates.length * (THUMBNAIL_WIDTH + THUMBNAIL_GAP) +
							THUMBNAIL_WIDTH / 4
						}
						y={rowY + 16 + THUMBNAIL_HEIGHT + 18}
						textAnchor="middle"
						fontSize={12}
						fill="#6b7280"
					>
						Add Template
					</text>
				</g>
			)}
		</g>
	)
}

// vim: ts=4
