// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * ClDocumentBlot - Custom Quill blot for embedded Cloudillo documents
 *
 * Renders `DocViewEmbed` (a React island) into the blot node.
 *
 * Delta format: { insert: { 'cl-document': { fileId, appId, contentType, navState?, name? } },
 *   attributes?: { navState?, sizing?, scale?, maxH?, textScale?, lastW?, lastH?, widthPct?,
 *     embedAlign?, embedEditable?, width?, height? } }
 * `widthPct` is the reflow frame width (% of the line); `embedAlign` is left/center/right (not
 * `align`, which Quill's block align attributor owns). `width` / `height` are legacy (resize
 * handles); a legacy `height` reads as `maxH`, and setting `widthPct` clears a legacy `width`.
 * `embedEditable` lets writers of this document edit the embedded one in place.
 */

import { type EmbedViewReportPayload, getAppBus } from '@cloudillo/core'
import {
	DocViewEmbed,
	type EmbedViewSettings,
	embedReportToStore,
	grantEmbedEditable,
	normalizeEmbedSettings
} from '@cloudillo/react/doc-bar'
import Quill from 'quill'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/** Typed base class for Quill block embed blots */
interface QuillBlockEmbedClass {
	new (): {
		domNode: HTMLElement
		format(name: string, value: string | false | null): void
		attach(): void
		detach(): void
	}
	create(value?: unknown): HTMLElement
	prototype: {
		domNode: HTMLElement
		format(name: string, value: string | false | null): void
		attach(): void
		detach(): void
	}
}

const BlockEmbed = Quill.import('blots/block/embed') as unknown as QuillBlockEmbedClass

export interface ClDocumentValue {
	fileId: string
	appId?: string
	contentType: string
	width?: string
	height?: string
	navState?: string
	/** Embedded file's name, shown as the embed's title */
	name?: string
}

/** Format name → data attribute. Numeric formats use 0 / absent for "unset". */
const FORMAT_ATTRS: Record<string, string> = {
	navState: 'data-nav-state',
	sizing: 'data-sizing',
	scale: 'data-scale',
	maxH: 'data-max-h',
	textScale: 'data-text-scale',
	lastW: 'data-last-w',
	lastH: 'data-last-h',
	widthPct: 'data-width-pct',
	embedAlign: 'data-embed-align',
	embedEditable: 'data-embed-editable',
	width: 'data-width',
	height: 'data-height'
}

const roots = new Map<HTMLElement, Root>()

function num(node: HTMLElement, attr: string): number {
	return Number.parseFloat(node.getAttribute(attr) || '') || 0
}

/** Mirrors quillo's own enable rule: writers, and inside an embed only while activated */
function hostEditable(): boolean {
	const bus = getAppBus()
	return bus.access === 'write' && (!bus.embedded || !!bus.viewLayout?.interactive)
}

function blotQuill(node: HTMLElement): Quill | undefined {
	const container = node.closest('.ql-container')
	return container ? (Quill.find(container) as Quill | null) || undefined : undefined
}

/**
 * Writes formats on the blot through Quill so y-quill syncs them. An `'api'` write still
 * syncs but stays out of undo (history is `userOnly`).
 */
function writeFormats(
	node: HTMLElement,
	formats: Record<string, unknown>,
	source: 'user' | 'api' = 'user'
): void {
	const quill = blotQuill(node)
	const blot = Quill.find(node)
	if (!quill || !blot || blot instanceof Quill) return
	quill.formatText(quill.getIndex(blot), 1, formats, source)
}

/** Another editable embed of `fileId` in this document still needs the 'W' share */
function othersEditable(node: HTMLElement, fileId: string): boolean {
	const editor = node.closest('.ql-editor')
	if (!editor) return false
	for (const other of editor.querySelectorAll<HTMLElement>('[data-embed-editable]')) {
		if (other !== node && other.getAttribute('data-file-id') === fileId) return true
	}
	return false
}

function removeBlot(node: HTMLElement): void {
	const quill = blotQuill(node)
	const blot = Quill.find(node)
	if (!quill || !blot || blot instanceof Quill) return
	quill.deleteText(quill.getIndex(blot), 1, 'user')
}

function renderEmbed(node: HTMLElement): void {
	const sourceFileId = ClDocumentBlot.sourceFileId
	if (!sourceFileId) return
	const fileId = node.getAttribute('data-file-id') || ''
	const contentType = node.getAttribute('data-content-type') || ''
	const storedApp = node.getAttribute('data-app-id')
	const app =
		storedApp && storedApp !== 'view' ? storedApp : contentType.replace(/^cloudillo\//, '')
	const owner = sourceFileId.split(':')[0]
	const nav = node.getAttribute('data-nav-state') || undefined
	const editable = hostEditable()
	const embedEditable = !!node.getAttribute('data-embed-editable')

	const settings = normalizeEmbedSettings(
		{
			sizing: node.getAttribute('data-sizing'),
			align: node.getAttribute('data-embed-align'),
			scale: num(node, 'data-scale'),
			maxH: num(node, 'data-max-h') || num(node, 'data-height'),
			textScale: num(node, 'data-text-scale'),
			width: num(node, 'data-width-pct'),
			lastW: num(node, 'data-last-w'),
			lastH: num(node, 'data-last-h')
		},
		'left'
	)

	const handleReport = (report: EmbedViewReportPayload) => {
		if (!hostEditable()) return
		const stored = { w: num(node, 'data-last-w'), h: num(node, 'data-last-h') }
		const next = embedReportToStore(stored, report)
		if (next) writeFormats(node, { lastW: next.w, lastH: next.h }, 'api')
	}

	let root = roots.get(node)
	if (!root) {
		root = createRoot(node)
		roots.set(node, root)
	}
	root.render(
		createElement(DocViewEmbed, {
			fileId,
			contentType,
			sourceFileId,
			// Granted access, not interactivity: an inactive nested embed keeps its token
			access: embedEditable && getAppBus().access === 'write' ? 'write' : 'read',
			title: node.getAttribute('data-name') || undefined,
			appId: app,
			owner,
			nav,
			settings,
			canInteract: true,
			canEdit: editable,
			onReport: handleReport,
			actions: {
				...(editable && {
					onSizing: (s: EmbedViewSettings) => {
						const widthPct = s.width && s.width < 100 ? s.width : null
						writeFormats(node, {
							sizing: s.sizing,
							scale: s.scale || null,
							maxH: s.maxH || null,
							textScale: s.textScale || null,
							widthPct,
							embedAlign: s.align || null,
							// The legacy height stops standing in for maxH, the legacy width for widthPct
							height: null,
							...(widthPct && { width: null })
						})
					},
					onUseCurrentView: (n: string) => writeFormats(node, { navState: n }),
					// Hidden inside an embed by DocViewEmbed: the shell refuses doc:grant there
					editable: embedEditable,
					onEditableChange: async (v: boolean) => {
						if (
							await grantEmbedEditable(
								fileId,
								sourceFileId,
								v,
								othersEditable(node, fileId)
							)
						) {
							writeFormats(node, { embedEditable: v || null })
						}
					},
					onRemove: () => removeBlot(node)
				})
			}
		})
	)
}

/**
 * Re-render every mounted embed: the host's editable state (`hostEditable`) is read at render
 * time, so call this when the access or the embed layout's `interactive` changes.
 */
export function refreshDocumentEmbeds(): void {
	for (const node of roots.keys()) renderEmbed(node)
}

class ClDocumentBlot extends BlockEmbed {
	static blotName = 'cl-document'
	static tagName = 'DIV'
	static className = 'ql-cl-document'

	// Static property set during app initialization (source document `owner:fileId`)
	static sourceFileId: string | undefined

	static create(value: ClDocumentValue): HTMLElement {
		// biome-ignore lint/complexity/noThisInStatic: Parchment requires polymorphic `this` to read subclass tagName
		const node = super.create() as HTMLElement
		node.setAttribute('contenteditable', 'false')
		// The embed frame sizes itself; neutralize the legacy fixed-aspect box styles
		node.style.aspectRatio = 'auto'
		node.style.minHeight = '0'
		node.style.border = 'none'
		node.style.background = 'none'
		node.style.overflow = 'visible'

		node.setAttribute('data-file-id', value.fileId)
		node.setAttribute('data-app-id', value.appId || 'view')
		node.setAttribute('data-content-type', value.contentType)
		if (value.navState) node.setAttribute('data-nav-state', value.navState)
		if (value.name) node.setAttribute('data-name', value.name)
		if (value.width) {
			node.setAttribute('data-width', value.width)
			node.style.width = value.width
		}
		// Legacy fixed height: kept only as the `maxH` fallback, never as a box height
		if (value.height) node.setAttribute('data-height', value.height)

		return node
	}

	static value(node: HTMLElement): ClDocumentValue {
		const name = node.getAttribute('data-name')
		return {
			fileId: node.getAttribute('data-file-id') || '',
			appId: node.getAttribute('data-app-id') || undefined,
			contentType: node.getAttribute('data-content-type') || '',
			// Legacy fields round-trip unchanged, so y-quill never rewrites an old embed
			width: node.getAttribute('data-width') || undefined,
			height: node.getAttribute('data-height') || undefined,
			navState: node.getAttribute('data-nav-state') || undefined,
			// No `name` key at all when absent, so an old embed's value stays identical
			...(name && { name })
		}
	}

	static formats(node: HTMLElement): Record<string, string | null> {
		const formats: Record<string, string | null> = {}
		for (const [name, attr] of Object.entries(FORMAT_ATTRS)) {
			const v = node.getAttribute(attr)
			if (v) formats[name] = v
		}
		return formats
	}

	attach(): void {
		super.attach()
		renderEmbed(this.domNode)
	}

	detach(): void {
		const node = this.domNode
		const root = roots.get(node)
		if (root) {
			// Deferred: Quill may detach while React is mid-render. A node re-attached in the
			// meantime (a move) keeps its root, which `renderEmbed` reuses.
			queueMicrotask(() => {
				if (node.isConnected) return
				roots.delete(node)
				root.unmount()
			})
		}
		super.detach()
	}

	format(name: string, value: string | false | null): void {
		const attr = FORMAT_ATTRS[name]
		if (!attr) {
			super.format(name, value)
			return
		}
		if (value) this.domNode.setAttribute(attr, String(value))
		else this.domNode.removeAttribute(attr)
		if (name === 'width') this.domNode.style.width = value ? String(value) : ''
		if (roots.has(this.domNode)) renderEmbed(this.domNode)
	}
}

// Register the blot with Quill
Quill.register('formats/cl-document', ClDocumentBlot, true)

export { ClDocumentBlot }

// vim: ts=4
