// This file is part of the Cloudillo Platform.
// Copyright (C) 2024-2026  Szilárd Hajba
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
 * ClDocumentBlot - Custom Quill blot for embedded Cloudillo documents
 *
 * Embeds other Cloudillo documents as live nested iframes within the editor.
 * Uses the shell message bus to obtain scoped tokens and embed URLs.
 *
 * Delta format: { insert: { 'cl-document': { fileId, appId, contentType, width?, height? } } }
 */

import Quill from 'quill'
import { getAppBus, setupEmbedRelay } from '@cloudillo/core'

/** Typed base class for Quill block embed blots */
interface QuillBlockEmbedClass {
	new (): { domNode: HTMLElement; format(name: string, value: string | false | null): void }
	create(value?: unknown): HTMLElement
	prototype: { domNode: HTMLElement; format(name: string, value: string | false | null): void }
}

const BlockEmbed = Quill.import('blots/block/embed') as unknown as QuillBlockEmbedClass

export interface ClDocumentValue {
	fileId: string
	appId?: string
	contentType: string
	width?: string
	height?: string
	navState?: string
}

class ClDocumentBlot extends BlockEmbed {
	static blotName = 'cl-document'
	static tagName = 'DIV'
	static className = 'ql-cl-document'

	// Static property set during app initialization (source document fileId)
	static sourceFileId: string | undefined

	static create(value: ClDocumentValue): HTMLElement {
		// biome-ignore lint/complexity/noThisInStatic: Parchment requires polymorphic `this` to read subclass tagName
		const node = super.create() as HTMLElement

		// Bridge setAttribute to inline styles for resize support.
		// quill-blot-formatter2's ResizeAction calls setAttribute("width", "400px")
		// which has no visual effect on DIVs. This override synchronously mirrors
		// width/height to style so resize is visible and persists via value()/formats().
		const origSetAttribute = node.setAttribute.bind(node)
		node.setAttribute = function (name: string, value: string) {
			origSetAttribute(name, value)
			if (name === 'width' || name === 'height') {
				node.style.setProperty(name, value)
			}
		}

		node.setAttribute('data-file-id', value.fileId)
		node.setAttribute('data-app-id', value.appId || 'view')
		node.setAttribute('data-content-type', value.contentType)

		// Persist initial navState so value() can read it back
		if (value.navState) {
			node.setAttribute('data-nav-state', value.navState)
		}

		// Apply optional dimensions (data attributes = stable source of truth,
		// inline styles = visual display; this separation prevents Quill's
		// MutationObserver from detecting value changes during resize drag)
		if (value.width) {
			node.setAttribute('data-width', value.width)
			node.style.width = value.width
		}
		if (value.height) {
			node.setAttribute('data-height', value.height)
			node.style.height = value.height
		}

		// Show loading placeholder
		node.classList.add('loading')
		const placeholder = document.createElement('div')
		placeholder.className = 'ql-cl-document-placeholder'
		placeholder.textContent = 'Loading embedded document...'
		node.appendChild(placeholder)

		// Asynchronously request embed URL and create iframe
		ClDocumentBlot.loadEmbed(node, value)

		return node
	}

	private static async loadEmbed(node: HTMLElement, value: ClDocumentValue): Promise<void> {
		try {
			const bus = getAppBus()

			if (!ClDocumentBlot.sourceFileId) {
				throw new Error('sourceFileId not set')
			}

			const result = await bus.requestEmbed({
				targetFileId: value.fileId,
				targetContentType: value.contentType,
				sourceFileId: ClDocumentBlot.sourceFileId,
				access: 'read',
				navState: value.navState
			})

			if (!node.isConnected) return

			// Remove loading state and placeholder
			node.classList.remove('loading')
			const placeholder = node.querySelector('.ql-cl-document-placeholder')
			if (placeholder) placeholder.remove()

			// Create iframe
			const iframe = document.createElement('iframe')
			iframe.className = 'ql-cl-document-iframe'
			const hash = result.resId
				? `${result.resId}:_embed:${result.nonce}`
				: `_embed:${result.nonce}`
			iframe.src = `${result.embedUrl}?v=1#${hash}`
			iframe.sandbox.add('allow-scripts')
			iframe.sandbox.add('allow-forms')
			iframe.sandbox.add('allow-downloads')
			iframe.setAttribute('loading', 'lazy')
			node.appendChild(iframe)
			// In read-only mode the iframe is immediately interactive,
			// so prevent scroll chaining right away
			if (node.closest('.ql-disabled')) {
				node.style.overscrollBehavior = 'contain'
			}
			const relay = setupEmbedRelay(iframe, {
				onChildNotification: (type, payload) => {
					if (type === 'embed:viewstate.push' && payload) {
						const p = payload as {
							viewState: string
							aspectRatio?: [number, number]
							aspectFixed?: boolean
						}
						// Cache pending navState (flushed to CRDT on deactivate)
						;(node as HTMLElement & Record<string, unknown>).__pendingNavState =
							p.viewState
						// Auto-resize height based on aspect ratio (width-preserving)
						if (p.aspectRatio) {
							const [arW, arH] = p.aspectRatio
							const currentWidth = node.offsetWidth
							if (currentWidth > 0 && arW > 0) {
								const newHeight = Math.round(currentWidth * (arH / arW))
								node.style.height = `${newHeight}px`
								node.setAttribute('data-height', `${newHeight}px`)
							}
						}
					}
				}
			})
			// Store relay handle for potential future use
			;(node as HTMLElement & Record<string, unknown>).__embedRelay = relay

			// Use AbortController to tie listeners to the node's DOM lifetime
			const ac = new AbortController()

			// Click outside to deactivate and flush pending navState
			document.addEventListener(
				'click',
				(e: MouseEvent) => {
					if (!node.contains(e.target as HTMLElement)) {
						node.classList.remove('active')
						node.style.overscrollBehavior = ''
						// Flush cached navState to data attribute (Quill picks up the change)
						// Skip in read-only mode (no CRDT writes)
						const pendingNS = (node as HTMLElement & Record<string, unknown>)
							.__pendingNavState as string | undefined
						if (pendingNS != null && !node.closest('.ql-disabled')) {
							const currentNS = node.getAttribute('data-nav-state') || undefined
							if (pendingNS !== currentNS) {
								node.setAttribute('data-nav-state', pendingNS)
							}
							delete (node as HTMLElement & Record<string, unknown>).__pendingNavState
						}
					}
				},
				{ signal: ac.signal }
			)

			// Clean up when node is removed from the DOM
			const observer = new MutationObserver((mutations) => {
				for (const mutation of mutations) {
					for (const removed of mutation.removedNodes) {
						if (removed === node || removed.contains(node)) {
							ac.abort()
							relay.cleanup()
							observer.disconnect()
							return
						}
					}
				}
			})
			if (node.parentNode) {
				observer.observe(node.parentNode, { childList: true })
			}
			;(node as HTMLElement & Record<string, unknown>).__embedCleanup = () => {
				ac.abort()
				relay.cleanup()
				observer.disconnect()
			}
		} catch (err) {
			console.error('[ClDocumentBlot] Failed to load embed:', err)
			node.classList.remove('loading')
			node.classList.add('error')
			const placeholder = node.querySelector('.ql-cl-document-placeholder')
			if (placeholder) {
				placeholder.textContent = 'Failed to load embedded document'
			}
		}
	}

	static value(node: HTMLElement): ClDocumentValue {
		return {
			fileId: node.getAttribute('data-file-id') || '',
			appId: node.getAttribute('data-app-id') || undefined,
			contentType: node.getAttribute('data-content-type') || '',
			width: node.getAttribute('data-width') || undefined,
			height: node.getAttribute('data-height') || undefined,
			navState: node.getAttribute('data-nav-state') || undefined
		}
	}

	static formats(node: HTMLElement): Record<string, string | null> {
		const formats: Record<string, string | null> = {}
		if (node.getAttribute('data-width')) formats.width = node.getAttribute('data-width')
		if (node.getAttribute('data-height')) formats.height = node.getAttribute('data-height')
		return formats
	}

	format(name: string, value: string | false | null): void {
		if (name === 'width') {
			if (value) {
				this.domNode.setAttribute('data-width', value)
				this.domNode.style.width = value
			} else {
				this.domNode.removeAttribute('data-width')
				this.domNode.style.width = ''
			}
		} else if (name === 'height') {
			if (value) {
				this.domNode.setAttribute('data-height', value)
				this.domNode.style.height = value
			} else {
				this.domNode.removeAttribute('data-height')
				this.domNode.style.height = ''
			}
		} else {
			super.format(name, value)
		}
	}
}

// Register the blot with Quill
Quill.register('formats/cl-document', ClDocumentBlot, true)

export { ClDocumentBlot }

// vim: ts=4
