// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Document initialization and CRDT structure access
 */

import * as Y from 'yjs'

import type { ContainerId } from './ids'
import { generateContainerId, generateStyleId, generateViewId } from './ids'
import { DEFAULT_PALETTE } from './palette-ops'
import { detachedObject } from './prototype-ops'
import type {
	ChildRef,
	StoredContainer,
	StoredObject,
	StoredPalette,
	StoredStyle,
	StoredTemplate,
	StoredText,
	LegacyStoredView,
	StoredView,
	YPrezilloDocument
} from './stored-types'
import { getAbsoluteBoundsStored } from './transforms'
import { compactPalette } from './type-converters'

/**
 * Get or create the Prezillo document structure from a Y.Doc
 * @param yDoc The Y.Doc instance
 * @param initializeIfEmpty If true, will initialize with default data when empty.
 *                          Set to false during initial load before sync completes.
 * @param canWrite If false, writes (notes migration, template refs, legacy layout) are skipped.
 */
export function getOrCreateDocument(
	yDoc: Y.Doc,
	initializeIfEmpty: boolean = true,
	canWrite: boolean = true
): YPrezilloDocument {
	const doc: YPrezilloDocument = {
		o: yDoc.getMap<StoredObject>('o'),
		c: yDoc.getMap<StoredContainer>('c'),
		r: yDoc.getArray<ChildRef>('r'),
		v: yDoc.getMap<StoredView>('v'),
		vo: yDoc.getArray<string>('vo'),
		m: yDoc.getMap<unknown>('m'),
		rt: yDoc.getMap<Y.Text>('rt'),
		vn: yDoc.getMap<Y.Text>('vn'),
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

	// Migrate plain text objects (tx string) to rich text (doc.rt Y.Text)
	if (initializeIfEmpty) {
		migrateTextToRichText(yDoc, doc)
	}
	// One-time gate (like ideallo's m.initialized). An older client editing after the
	// marker is set can still write legacy `notes` or view x/y; those aren't migrated again, but
	// readers tolerate both (getViewPositions' legacy check, the PPTX notes fallback).
	if (initializeIfEmpty && canWrite && doc.m.get('schema') !== 2) {
		migrateNotesToYText(yDoc, doc)
		repairTemplateRefs(yDoc, doc)
		migrateLegacyViewLayout(yDoc, doc)
		// No origin: stays off the undo stack, like the migrations
		yDoc.transact(() => doc.m.set('schema', 2))
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
 * Migrate text objects from plain text (tx string) to rich text (doc.rt Y.Text).
 * Idempotent: skips objects that already have a Y.Text entry in doc.rt.
 * Runs in a single Yjs transaction.
 */
function migrateTextToRichText(yDoc: Y.Doc, doc: YPrezilloDocument): void {
	const toMigrate: Array<{ id: string; text: string }> = []

	doc.o.forEach((obj, id) => {
		if (obj.t === 'T') {
			const textObj = obj as StoredText
			// Migrate if tx exists and no Y.Text in doc.rt yet
			if (textObj.tx !== undefined && !doc.rt.has(id)) {
				toMigrate.push({ id, text: textObj.tx })
			}
			// Also ensure objects without tx have an entry in doc.rt
			if (textObj.tx === undefined && !doc.rt.has(id)) {
				toMigrate.push({ id, text: '' })
			}
		}
	})

	if (toMigrate.length === 0) return

	yDoc.transact(() => {
		for (const { id, text } of toMigrate) {
			const yText = new Y.Text()
			if (text) {
				yText.insert(0, text)
			}
			doc.rt.set(id, yText)

			// Remove tx from stored object (content now lives in doc.rt)
			const obj = doc.o.get(id)
			if (obj && 'tx' in obj) {
				const updated = { ...obj }
				delete (updated as StoredText).tx
				doc.o.set(id, updated)
			}
		}
		// No origin: the canvas UndoManager must not record (and Ctrl+Z revert) the migration
	})

	console.log(`[migrateTextToRichText] Migrated ${toMigrate.length} text objects`)
}

/**
 * Migrate speaker notes from the plain `notes` string on stored views to doc.vn (Y.Text).
 * Migrates when the doc.vn entry is missing or empty; always sets a fresh Y.Text (map LWW keeps
 * concurrent migrations from duplicating text). Idempotent once `notes` is removed. One
 * transaction, no origin, so the canvas UndoManager does not record it.
 */
function migrateNotesToYText(yDoc: Y.Doc, doc: YPrezilloDocument): void {
	const toMigrate: Array<{ id: string; text: string }> = []

	doc.v.forEach((view, id) => {
		if (typeof view.notes === 'string' && view.notes && !doc.vn.get(id)?.length) {
			toMigrate.push({ id, text: view.notes })
		}
	})

	if (toMigrate.length === 0) return

	yDoc.transact(() => {
		for (const { id, text } of toMigrate) {
			doc.vn.set(id, new Y.Text(text))

			const view = doc.v.get(id)
			if (view) {
				const { notes: _notes, ...rest } = view
				doc.v.set(id, rest)
			}
		}
	})

	console.log(`[migrateNotesToYText] Migrated ${toMigrate.length} speaker notes`)
}

/**
 * Repair template references left dangling by older code (deleteView turned instances into
 * floating objects, undo did not track tpl/tpo). A view pointing at a missing template loses its
 * `tpl`; an instance whose page does not use its prototype's template is detached into a plain
 * object (prototype fields merged in). Orphaned prototypes stay, as ordinary floating objects.
 */
function repairTemplateRefs(yDoc: Y.Doc, doc: YPrezilloDocument): void {
	const owner = new Map<string, string>()
	doc.tpo.forEach((protoIds, templateId) => {
		for (const protoId of protoIds.toArray()) owner.set(protoId, templateId)
	})

	const views: string[] = []
	doc.v.forEach((view, id) => {
		if (view.tpl && !doc.tpl.has(view.tpl)) views.push(id)
	})
	const viewTpl = (vi: string) => {
		const tpl = doc.v.get(vi)?.tpl
		return tpl && doc.tpl.has(tpl) ? tpl : undefined
	}
	const objects: string[] = []
	doc.o.forEach((obj, id) => {
		if (!obj.proto) return
		const tpl = owner.get(obj.proto)
		if (!obj.vi || !tpl || tpl !== viewTpl(obj.vi)) objects.push(id)
	})

	if (views.length === 0 && objects.length === 0) return

	yDoc.transact(() => {
		for (const id of views) {
			const view = doc.v.get(id)
			if (view) {
				const { tpl: _tpl, ...rest } = view
				doc.v.set(id, rest)
			}
		}
		for (const id of objects) {
			const obj = doc.o.get(id)
			if (!obj?.proto) continue
			doc.o.set(id, detachedObject(obj, doc.o.get(obj.proto)))
		}
	})

	console.log(
		`[repairTemplateRefs] Cleared ${views.length} dangling view templates, detached ${objects.length} instances`
	)
}

/**
 * Migrate documents from the old free-form view layout (views stored x/y) to the derived vertical
 * stack: a floating object whose center sat on a slide becomes page-relative to that slide, so it
 * follows the slide. Then x/y is stripped from every view (idempotent). No origin, off the undo stack.
 */
function migrateLegacyViewLayout(yDoc: Y.Doc, doc: YPrezilloDocument): void {
	const rects: Array<{ id: string; x: number; y: number; width: number; height: number }> = []
	let legacy = false
	doc.v.forEach((view, id) => {
		const { x, y } = view as LegacyStoredView
		if (typeof x !== 'number' && typeof y !== 'number') return
		legacy = true
		rects.push({ id, x: x ?? 0, y: y ?? 0, width: view.width, height: view.height })
	})
	if (!legacy) return

	const protoIds = new Set<string>()
	doc.tpo.forEach((ids) => {
		for (const id of ids.toArray()) protoIds.add(id)
	})

	const converted: Array<[string, StoredObject]> = []
	doc.o.forEach((obj, id) => {
		if (obj.vi || obj.proto || protoIds.has(id)) return
		const b = getAbsoluteBoundsStored(doc, obj)
		if (!b) return
		const cx = b.x + b.width / 2
		const cy = b.y + b.height / 2
		const rect = rects.find(
			(r) => cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height
		)
		// Ignores rotated/scaled parent groups, same as updateObjectPageAssociation
		if (rect)
			converted.push([
				id,
				{ ...obj, vi: rect.id, xy: [obj.xy[0] - rect.x, obj.xy[1] - rect.y] }
			])
	})

	yDoc.transact(() => {
		for (const [id, obj] of converted) doc.o.set(id, obj)
		for (const { id } of rects) {
			const view = doc.v.get(id)
			if (!view) continue
			const { x: _x, y: _y, ...rest } = view as LegacyStoredView
			doc.v.set(id, rest)
		}
	})

	console.log(
		`[migrateLegacyViewLayout] Stripped ${rects.length} view positions, attached ${converted.length} objects`
	)
}

/**
 * Get or create the speaker notes Y.Text for a view. No origin, so the main UndoManager does not
 * track the creation (undoing it on the canvas would drop typed notes).
 */
export function getOrCreateViewNotes(yDoc: Y.Doc, doc: YPrezilloDocument, viewId: string): Y.Text {
	let yText = doc.vn.get(viewId)
	if (!yText) {
		const created = new Y.Text()
		yDoc.transact(() => {
			doc.vn.set(viewId, created)
		})
		yText = created
	}
	return yText
}

/**
 * Append a notes snapshot to `target`: restores typing into a Y.Text that lost the doc.vn key
 * to another client's concurrent create (Yjs drops the loser's content). No origin, like
 * `getOrCreateViewNotes`.
 */
export function appendNotesDelta(
	yDoc: Y.Doc,
	target: Y.Text,
	delta: ReturnType<Y.Text['toDelta']>
): void {
	if (!delta.length) return
	yDoc.transact(() => {
		target.applyDelta([{ retain: target.length }, ...delta])
	})
}

/**
 * Whether `winner` replaced `ours` in doc.vn through a concurrent create (true), or through a
 * later set such as an undo restore (false). A later set is integrated after our item, so its
 * origin is our id; a concurrent create was made without seeing ours.
 */
export function lostConcurrentCreate(winner: Y.Text, ours: Y.Text): boolean {
	return !Y.compareIDs(winner._item?.origin ?? null, ours._item?.lastId ?? null)
}

/**
 * Get or create a Y.Text entry in doc.rt for a text object.
 * Creates a new Y.Text if one doesn't exist.
 */
export function getOrCreateRichText(yDoc: Y.Doc, doc: YPrezilloDocument, objectId: string): Y.Text {
	let yText = doc.rt.get(objectId)
	if (!yText) {
		yText = new Y.Text()
		yDoc.transact(() => {
			doc.rt.set(objectId, yText!)
		}, yDoc.clientID)
	}
	return yText
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

// vim: ts=4
