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
 * ClImageBlot - Custom Quill blot for Cloudillo images
 *
 * Stores fileId instead of URL, compatible with quill-blot-formatter2 for
 * resize/align/float/margin editing.
 *
 * Delta format: { insert: { 'cl-image': { fileId, alt?, width? } } }
 */

import Quill from 'quill'
import { getFileUrl } from '@cloudillo/core'

/** Typed base class for Quill block embed blots */
interface QuillBlockEmbedClass {
	new (): { domNode: HTMLElement; format(name: string, value: string | false | null): void }
	create(value?: unknown): HTMLElement
	prototype: { domNode: HTMLElement; format(name: string, value: string | false | null): void }
}

const BlockEmbed = Quill.import('blots/block/embed') as unknown as QuillBlockEmbedClass

export interface ClImageValue {
	fileId: string
	alt?: string
	width?: string
}

class ClImageBlot extends BlockEmbed {
	static blotName = 'cl-image'
	static tagName = 'IMG'
	static className = 'ql-cl-image'

	// Static properties set during app initialization
	static ownerTag: string | undefined
	static token: string | undefined

	static create(value: ClImageValue): HTMLElement {
		const node = BlockEmbed.create() as HTMLImageElement
		node.setAttribute('data-file-id', value.fileId)
		node.setAttribute('alt', value.alt || '')

		// Construct src URL from fileId
		const variant = 'vis.sd' // Default variant for rich text display
		if (ClImageBlot.ownerTag) {
			node.setAttribute(
				'src',
				getFileUrl(
					ClImageBlot.ownerTag,
					value.fileId,
					variant,
					ClImageBlot.token ? { token: ClImageBlot.token } : undefined
				)
			)
		} else {
			node.setAttribute('src', `/api/files/${value.fileId}?variant=${variant}`)
		}

		// Apply optional width (data attribute = stable source of truth,
		// HTML width attribute = visual display; avoid style.width which
		// has higher specificity and blocks setAttribute('width') resizes)
		if (value.width) {
			node.setAttribute('data-width', value.width)
			node.setAttribute('width', value.width)
		}

		return node
	}

	static value(node: HTMLElement): ClImageValue {
		return {
			fileId: node.getAttribute('data-file-id') || '',
			alt: node.getAttribute('alt') || undefined,
			width: node.getAttribute('data-width') || undefined
		}
	}

	/**
	 * Handle alignment and width via formats (for quill-blot-formatter2)
	 */
	static formats(node: HTMLElement): Record<string, string | null> {
		const formats: Record<string, string | null> = {}
		const align = node.getAttribute('data-blot-align')
		if (align) {
			formats['cl-image-align'] = align
		}
		const width = node.getAttribute('data-width')
		if (width) {
			formats.width = width
		}
		return formats
	}

	format(name: string, value: string | false | null): void {
		if (name === 'cl-image-align') {
			if (value) {
				this.domNode.setAttribute('data-blot-align', value)
			} else {
				this.domNode.removeAttribute('data-blot-align')
			}
		} else if (name === 'width') {
			if (value) {
				this.domNode.setAttribute('data-width', value)
				this.domNode.setAttribute('width', value)
			} else {
				this.domNode.removeAttribute('data-width')
				this.domNode.removeAttribute('width')
			}
		} else {
			super.format(name, value)
		}
	}
}

// Register the blot with Quill
Quill.register('formats/cl-image', ClImageBlot, true)

export { ClImageBlot }

// vim: ts=4
