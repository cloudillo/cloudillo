// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import type Quill from 'quill'
import { PropertyPanel, Tabs, Tab } from '@cloudillo/react'

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
	const [activeTab, setActiveTab] = React.useState<'properties' | 'layers' | 'templates'>(
		'properties'
	)

	return (
		<PropertyPanel width={280} data-properties-panel="true">
			<div className="c-panel-tabs">
				<Tabs value={activeTab} onTabChange={setActiveTab as (v: string) => void}>
					<Tab value="properties">Properties</Tab>
					<Tab value="layers">Layers</Tab>
					<Tab value="templates">Templates</Tab>
				</Tabs>
			</div>

			<div className="c-panel-tab-content">
				{activeTab === 'properties' && (
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
				)}
				{activeTab === 'layers' && (
					<LayerBrowser
						doc={doc}
						yDoc={yDoc}
						selectedIds={selectedIds}
						onSelectObject={onSelectObject}
						activeViewId={activeViewId}
						selectedContainerId={selectedContainerId}
						onSelectContainer={onSelectContainer}
					/>
				)}
				{activeTab === 'templates' && (
					<TemplatePanel
						doc={doc}
						yDoc={yDoc}
						selectedTemplateId={selectedTemplateId ?? null}
						onSelectTemplate={onSelectTemplate}
						onEditTemplate={onSelectTemplate}
					/>
				)}
			</div>
		</PropertyPanel>
	)
}

// vim: ts=4
