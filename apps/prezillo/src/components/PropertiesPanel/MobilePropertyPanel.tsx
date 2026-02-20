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
import { useY } from 'react-yjs'
import { BottomSheet, type BottomSheetSnapPoint, Tabs, Tab } from '@cloudillo/react'

import type { PrezilloObject } from '../../crdt'
import { getObject } from '../../crdt'
import type { UsePrezilloDocumentResult } from '../../hooks/usePrezilloDocument'
import { TransformSection } from './TransformSection'
import { StyleSection } from './StyleSection'
import { TextStyleSection } from './TextStyleSection'
import { ShapeSection } from './ShapeSection'
import { ViewPropertiesPanel } from './ViewPropertiesPanel'
import type { PropertyPreview } from './PrezilloPropertiesPanel'

type PropertyTab = 'transform' | 'style' | 'text'

export interface MobilePropertyPanelProps {
	prezillo: UsePrezilloDocumentResult
	snapPoint: BottomSheetSnapPoint
	onSnapChange: (snapPoint: BottomSheetSnapPoint) => void
	onPreview?: (preview: PropertyPreview | null) => void
}

export function MobilePropertyPanel({
	prezillo,
	snapPoint,
	onSnapChange,
	onPreview
}: MobilePropertyPanelProps) {
	const { doc, yDoc, selectedIds, activeViewId, isViewFocused } = prezillo
	// Subscribe to object changes
	useY(doc.o)

	const [activeTab, setActiveTab] = React.useState<PropertyTab>('transform')

	// Get selected object if single selection
	let selectedObject: PrezilloObject | null = null
	if (selectedIds.size === 1) {
		const id = Array.from(selectedIds)[0]
		selectedObject = getObject(doc, id) ?? null
	}

	// Check object types for available tabs
	const isTextObject = selectedObject?.type === 'text'
	const isRectObject = selectedObject?.type === 'rect'

	// Check if we should show view properties
	const showViewProperties = isViewFocused && activeViewId

	// Get object label for header
	const objectLabel = React.useMemo(() => {
		if (showViewProperties) return 'Page Properties'
		if (selectedIds.size === 0) return 'No selection'
		if (selectedIds.size > 1) return `${selectedIds.size} objects`
		if (!selectedObject) return 'Unknown'

		const typeLabels: Record<string, string> = {
			rect: 'Rectangle',
			ellipse: 'Ellipse',
			text: 'Text',
			textbox: 'Text Box',
			line: 'Line',
			image: 'Image',
			group: 'Group',
			layer: 'Layer'
		}
		return typeLabels[selectedObject.type] || selectedObject.type
	}, [showViewProperties, selectedIds.size, selectedObject])

	// Determine available tabs
	const availableTabs = React.useMemo(() => {
		const tabs: PropertyTab[] = ['transform', 'style']
		if (isTextObject) tabs.push('text')
		return tabs
	}, [isTextObject])

	// Ensure active tab is valid
	React.useEffect(() => {
		if (!availableTabs.includes(activeTab)) {
			setActiveTab('transform')
		}
	}, [availableTabs, activeTab])

	// Header content
	const header = (
		<div className="c-mobile-property-header">
			<span className="c-mobile-property-label">{objectLabel}</span>
		</div>
	)

	// Content to render based on selection state
	const renderContent = () => {
		// No selection or panel closed
		if (snapPoint === 'closed') {
			return null
		}

		// Show view properties when view is focused
		if (showViewProperties && activeViewId) {
			return (
				<div className="c-mobile-property-content">
					<div className="c-mobile-property-tab-content">
						<ViewPropertiesPanel doc={doc} yDoc={yDoc} activeViewId={activeViewId} />
					</div>
				</div>
			)
		}

		// Multi-selection not supported
		if (selectedIds.size > 1) {
			return (
				<div className="c-mobile-property-empty">Multi-selection editing not supported</div>
			)
		}

		// No selection
		if (selectedIds.size === 0 || !selectedObject) {
			return <div className="c-mobile-property-empty">Select an object to edit</div>
		}

		// Single selection - show property editor
		return (
			<div className="c-mobile-property-content">
				{/* Tab navigation */}
				<div className="c-mobile-property-tabs">
					<Tabs>
						<Tab
							active={activeTab === 'transform'}
							onClick={() => setActiveTab('transform')}
						>
							Transform
						</Tab>
						<Tab active={activeTab === 'style'} onClick={() => setActiveTab('style')}>
							Style
						</Tab>
						{isTextObject && (
							<Tab active={activeTab === 'text'} onClick={() => setActiveTab('text')}>
								Text
							</Tab>
						)}
					</Tabs>
				</div>

				{/* Tab content */}
				<div className="c-mobile-property-tab-content">
					{activeTab === 'transform' && (
						<TransformSection
							doc={doc}
							yDoc={yDoc}
							object={selectedObject}
							onPreview={onPreview}
						/>
					)}
					{activeTab === 'style' && (
						<>
							<StyleSection doc={doc} yDoc={yDoc} object={selectedObject} />
							{isRectObject && (
								<ShapeSection doc={doc} yDoc={yDoc} object={selectedObject} />
							)}
						</>
					)}
					{activeTab === 'text' && isTextObject && (
						<TextStyleSection doc={doc} yDoc={yDoc} object={selectedObject} />
					)}
				</div>
			</div>
		)
	}

	return (
		<BottomSheet
			snapPoint={snapPoint}
			onSnapChange={onSnapChange}
			header={header}
			snapConfig={{
				peek: 56,
				half: 0.45,
				full: 0.85
			}}
		>
			{renderContent()}
		</BottomSheet>
	)
}

// vim: ts=4
