// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import type Quill from 'quill'
import { PropertyPanel } from '@cloudillo/react'

import type { ObjectId, ContainerId } from '../../crdt'
import type { UsePrezilloDocumentResult } from '../../hooks/usePrezilloDocument'
import { LayerBrowser } from './LayerBrowser'
import { PropertyEditor } from './PropertyEditor'
import { TemplatePanel } from '../'

export interface PropertyPreview {
	objectId: ObjectId
	opacity?: number
	lineHeight?: number
}

export interface PrezilloPropertiesPanelProps {
	prezillo: UsePrezilloDocumentResult
	/** Callback for live preview during scrubbing */
	onPreview?: (preview: PropertyPreview | null) => void
	/** Currently selected container (layer) ID */
	selectedContainerId?: ContainerId | null
	/** Callback when a container is selected */
	onSelectContainer?: (id: ContainerId | null) => void
	/** Quill instance ref for inline formatting */
	quillRef?: React.MutableRefObject<Quill | null>
	/** ID of the text object currently being edited */
	editingTextId?: ObjectId | null
}

export function PrezilloPropertiesPanel({
	prezillo,
	onPreview,
	selectedContainerId,
	onSelectContainer,
	quillRef,
	editingTextId
}: PrezilloPropertiesPanelProps) {
	const {
		doc,
		yDoc,
		selectedIds,
		selectObject: onSelectObject,
		activeViewId,
		isViewFocused,
		isTemplateFocused,
		selectedTemplateId,
		selectTemplate: onSelectTemplate
	} = prezillo
	return (
		<PropertyPanel width={280} data-properties-panel="true">
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
						selectedTemplateId={selectedTemplateId ?? null}
						onSelectTemplate={onSelectTemplate}
						onEditTemplate={onSelectTemplate}
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
						selectedTemplateId={selectedTemplateId}
						isTemplateFocused={isTemplateFocused}
						onPreview={onPreview}
						quillRef={quillRef}
						editingTextId={editingTextId}
					/>
				</div>
			</div>
		</PropertyPanel>
	)
}

// vim: ts=4
