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
 * Document initialization and CRDT structure access
 */

import * as Y from 'yjs'
import type {
	YPrezilloDocument,
	StoredObject,
	StoredContainer,
	StoredView,
	StoredStyle,
	StoredPalette,
	StoredTemplate,
	ChildRef
} from './stored-types'
import { generateContainerId, generateViewId, generateStyleId } from './ids'
import type { ContainerId, ViewId, StyleId } from './ids'
import { compactPalette } from './type-converters'
import { DEFAULT_PALETTE } from './palette-ops'

/**
 * Get or create the Prezillo document structure from a Y.Doc
 * @param yDoc The Y.Doc instance
 * @param initializeIfEmpty If true, will initialize with default data when empty.
 *                          Set to false during initial load before sync completes.
 */
export function getOrCreateDocument(
	yDoc: Y.Doc,
	initializeIfEmpty: boolean = true
): YPrezilloDocument {
	const doc: YPrezilloDocument = {
		o: yDoc.getMap<StoredObject>('o'),
		c: yDoc.getMap<StoredContainer>('c'),
		r: yDoc.getArray<ChildRef>('r'),
		v: yDoc.getMap<StoredView>('v'),
		vo: yDoc.getArray<string>('vo'),
		m: yDoc.getMap<unknown>('m'),
		rt: yDoc.getMap<Y.Text>('rt'),
		st: yDoc.getMap<StoredStyle>('st'),
		pl: yDoc.getMap<StoredPalette>('pl'),
		ch: yDoc.getMap<Y.Array<ChildRef>>('ch'),
		// Template system
		tpl: yDoc.getMap<StoredTemplate>('tpl'),
		tpo: yDoc.getMap<Y.Array<string>>('tpo')
	}

	// Initialize if empty (only if requested - wait for sync before initializing)
	if (initializeIfEmpty && doc.r.length === 0) {
		initializeDocument(yDoc, doc)
	}

	return doc
}

/**
 * Get container children array (creates if doesn't exist)
 */
export function getContainerChildren(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	containerId: ContainerId
): Y.Array<ChildRef> {
	let children = doc.ch.get(containerId)
	if (!children) {
		children = new Y.Array<ChildRef>()
		yDoc.transact(() => {
			doc.ch.set(containerId, children!)
		}, yDoc.clientID)
	}
	return children
}

/**
 * Initialize a new empty document
 */
function initializeDocument(yDoc: Y.Doc, doc: YPrezilloDocument): void {
	yDoc.transact(() => {
		// Create default layer
		const layerId = generateContainerId()
		const layerData: StoredContainer = {
			t: 'L',
			n: 'Layer 1',
			xy: [0, 0],
			x: true
		}
		doc.c.set(layerId, layerData)

		// Create children array for layer
		const layerChildren = new Y.Array<ChildRef>()
		doc.ch.set(layerId, layerChildren)

		// Add layer to root children
		doc.r.push([[1, layerId]])

		// Create default view (first slide/page)
		const viewId = generateViewId()
		const viewData: StoredView = {
			name: 'Page 1',
			x: 0,
			y: 0,
			width: 1920,
			height: 1080,
			backgroundColor: '#ffffff',
			showBorder: true
		}
		doc.v.set(viewId, viewData)
		doc.vo.push([viewId])

		// Set document meta
		doc.m.set('defaultViewWidth', 1920)
		doc.m.set('defaultViewHeight', 1080)
		doc.m.set('name', 'Untitled Presentation')

		// Initialize default palette
		doc.pl.set('default', compactPalette(DEFAULT_PALETTE))

		// Add default styles
		addDefaultStyles(doc)
	}, yDoc.clientID)
}

/**
 * Add default style definitions
 */
function addDefaultStyles(doc: YPrezilloDocument): void {
	// Default shape style
	const defaultShapeId = generateStyleId()
	doc.st.set(defaultShapeId, {
		n: 'Default Shape',
		t: 'S',
		f: '#e0e0e0',
		s: '#999999',
		sw: 1
	})

	// Primary shape style
	const primaryShapeId = generateStyleId()
	doc.st.set(primaryShapeId, {
		n: 'Primary',
		t: 'S',
		f: '#4a90d9',
		s: '#2d5a87',
		sw: 2,
		cr: 8
	})

	// Secondary shape style
	const secondaryShapeId = generateStyleId()
	doc.st.set(secondaryShapeId, {
		n: 'Secondary',
		t: 'S',
		p: primaryShapeId,
		f: '#5cb85c',
		s: '#3d8b3d'
	})

	// Accent shape style
	const accentShapeId = generateStyleId()
	doc.st.set(accentShapeId, {
		n: 'Accent',
		t: 'S',
		p: primaryShapeId,
		f: '#f0ad4e',
		s: '#c87f0a'
	})

	// Outline style
	doc.st.set(generateStyleId(), {
		n: 'Outline',
		t: 'S',
		f: 'none',
		s: '#333333',
		sw: 2,
		sd: '5,5'
	})

	// Connector style
	doc.st.set(generateStyleId(), {
		n: 'Connector',
		t: 'S',
		f: 'none',
		s: '#666666',
		sw: 2
	})

	// Default text style
	doc.st.set(generateStyleId(), {
		n: 'Default Text',
		t: 'T',
		ff: 'system-ui',
		fs: 16,
		fw: 'normal',
		fc: '#333333'
	})

	// Heading style
	const headingId = generateStyleId()
	doc.st.set(headingId, {
		n: 'Heading',
		t: 'T',
		ff: 'Inter, system-ui',
		fs: 48,
		fw: 'bold',
		fc: '#1a1a2e'
	})

	// Body text style
	const bodyId = generateStyleId()
	doc.st.set(bodyId, {
		n: 'Body',
		t: 'T',
		ff: 'Inter, system-ui',
		fs: 18,
		fw: 'normal',
		fc: '#333333',
		lh: 1.5
	})

	// Caption style
	doc.st.set(generateStyleId(), {
		n: 'Caption',
		t: 'T',
		p: bodyId,
		fs: 14,
		fc: '#666666',
		fi: true
	})
}

/**
 * Get document metadata
 */
export function getDocumentMeta(doc: YPrezilloDocument): {
	name: string
	defaultViewWidth: number
	defaultViewHeight: number
	gridSize?: number
	snapToGrid?: boolean
	snapToObjects?: boolean
} {
	return {
		name: (doc.m.get('name') as string) || 'Untitled',
		defaultViewWidth: (doc.m.get('defaultViewWidth') as number) || 1920,
		defaultViewHeight: (doc.m.get('defaultViewHeight') as number) || 1080,
		gridSize: doc.m.get('gridSize') as number | undefined,
		snapToGrid: doc.m.get('snapToGrid') as boolean | undefined,
		snapToObjects: doc.m.get('snapToObjects') as boolean | undefined
	}
}

/**
 * Update document metadata
 */
export function updateDocumentMeta(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	updates: Partial<{
		name: string
		defaultViewWidth: number
		defaultViewHeight: number
		gridSize: number
		snapToGrid: boolean
		snapToObjects: boolean
	}>
): void {
	yDoc.transact(() => {
		if (updates.name !== undefined) doc.m.set('name', updates.name)
		if (updates.defaultViewWidth !== undefined)
			doc.m.set('defaultViewWidth', updates.defaultViewWidth)
		if (updates.defaultViewHeight !== undefined)
			doc.m.set('defaultViewHeight', updates.defaultViewHeight)
		if (updates.gridSize !== undefined) doc.m.set('gridSize', updates.gridSize)
		if (updates.snapToGrid !== undefined) doc.m.set('snapToGrid', updates.snapToGrid)
		if (updates.snapToObjects !== undefined) doc.m.set('snapToObjects', updates.snapToObjects)
	}, yDoc.clientID)
}

// vim: ts=4
