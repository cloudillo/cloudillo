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
import { PropertyPanel } from '@cloudillo/react'

import type { YPrezilloDocument, ObjectId, ViewId, ContainerId, TemplateId } from '../../crdt'
import { LayerBrowser } from './LayerBrowser'
import { PropertyEditor } from './PropertyEditor'
import { TemplatePropertiesPanel } from './TemplatePropertiesPanel'
import { TemplatePanel } from '../'

export interface PropertyPreview {
	objectId: ObjectId
	opacity?: number
}

export interface PrezilloPropertiesPanelProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	selectedIds: Set<ObjectId>
	onSelectObject: (id: ObjectId, addToSelection?: boolean) => void
	activeViewId: ViewId | null
	/** True when view background was explicitly clicked */
	isViewFocused?: boolean
	/** Callback for live preview during scrubbing */
	onPreview?: (preview: PropertyPreview | null) => void
	/** Currently selected container (layer) ID */
	selectedContainerId?: ContainerId | null
	/** Callback when a container is selected */
	onSelectContainer?: (id: ContainerId | null) => void
	/** Callback when user wants to edit template content on canvas */
	onStartEditingTemplate?: (templateId: TemplateId) => void
	/** Currently selected template ID (from canvas templates row) */
	selectedTemplateId?: TemplateId | null
	/** Callback to clear template selection */
	onClearTemplateSelection?: () => void
	/** Callback to select a template */
	onSelectTemplate?: (templateId: TemplateId | null) => void
}

export function PrezilloPropertiesPanel({
	doc,
	yDoc,
	selectedIds,
	onSelectObject,
	activeViewId,
	isViewFocused,
	onPreview,
	selectedContainerId,
	onSelectContainer,
	onStartEditingTemplate,
	selectedTemplateId,
	onClearTemplateSelection,
	onSelectTemplate
}: PrezilloPropertiesPanelProps) {
	// If a template is selected, show template properties panel
	if (selectedTemplateId) {
		return (
			<PropertyPanel width={280}>
				<TemplatePropertiesPanel
					doc={doc}
					yDoc={yDoc}
					templateId={selectedTemplateId}
					onEditContent={(id) => onStartEditingTemplate?.(id)}
					onDelete={onClearTemplateSelection}
					onClose={onClearTemplateSelection}
				/>
			</PropertyPanel>
		)
	}

	return (
		<PropertyPanel width={280}>
			{/* Layer Browser - top section */}
			<div className="c-panel-section c-panel-section--layers">
				<h4 className="c-panel-heading m-0">Layers</h4>
				<div className="p-2 pt-0">
					<LayerBrowser
						doc={doc}
						yDoc={yDoc}
						selectedIds={selectedIds}
						onSelectObject={onSelectObject}
						activeViewId={activeViewId}
						selectedContainerId={selectedContainerId}
						onSelectContainer={onSelectContainer}
					/>
				</div>
			</div>

			{/* Templates Section */}
			<div className="c-panel-section c-panel-section--templates">
				<h4 className="c-panel-heading m-0">Templates</h4>
				<div className="p-2 pt-0">
					<TemplatePanel
						doc={doc}
						yDoc={yDoc}
						selectedTemplateId={null}
						onSelectTemplate={onSelectTemplate ?? (() => {})}
						onEditTemplate={onStartEditingTemplate ?? (() => {})}
					/>
				</div>
			</div>

			{/* Property Editor - bottom section */}
			<div className="c-panel-section flex-fill">
				<h4 className="c-panel-heading m-0">Properties</h4>
				<div className="p-2 pt-0">
					<PropertyEditor
						doc={doc}
						yDoc={yDoc}
						selectedIds={selectedIds}
						activeViewId={activeViewId ?? undefined}
						isViewFocused={isViewFocused}
						onPreview={onPreview}
					/>
				</div>
			</div>
		</PropertyPanel>
	)
}

// vim: ts=4
