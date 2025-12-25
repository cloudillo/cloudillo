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
import { getFileUrl } from '@cloudillo/base'

const BlockEmbed = Quill.import('blots/block/embed') as any

export interface ClImageValue {
	fileId: string
	alt?: string
	width?: string
}

class ClImageBlot extends BlockEmbed {
	static blotName = 'cl-image'
	static tagName = 'IMG'
	static className = 'ql-cl-image'

	// Static property to hold ownerTag (set during app initialization)
	static ownerTag: string | undefined

	static create(value: ClImageValue): HTMLElement {
		const node = super.create() as HTMLImageElement
		node.setAttribute('data-file-id', value.fileId)
		node.setAttribute('alt', value.alt || '')

		// Construct src URL from fileId
		const variant = 'vis.sd' // Default variant for rich text display
		if (ClImageBlot.ownerTag) {
			node.setAttribute('src', getFileUrl(ClImageBlot.ownerTag, value.fileId, variant))
		} else {
			node.setAttribute('src', `/api/files/${value.fileId}?variant=${variant}`)
		}

		// Apply optional width
		if (value.width) {
			node.style.width = value.width
		}

		return node
	}

	static value(node: HTMLElement): ClImageValue {
		return {
			fileId: node.getAttribute('data-file-id') || '',
			alt: node.getAttribute('alt') || undefined,
			width: (node as HTMLElement).style.width || undefined
		}
	}

	/**
	 * Handle alignment via formats (for quill-blot-formatter2)
	 */
	static formats(node: HTMLElement): Record<string, string | null> {
		const formats: Record<string, string | null> = {}
		const align = node.getAttribute('data-blot-align')
		if (align) {
			formats['cl-image-align'] = align
		}
		return formats
	}

	format(name: string, value: any): void {
		if (name === 'cl-image-align') {
			if (value) {
				this.domNode.setAttribute('data-blot-align', value)
			} else {
				this.domNode.removeAttribute('data-blot-align')
			}
		} else if (name === 'width') {
			if (value) {
				this.domNode.style.width = value
			} else {
				this.domNode.style.width = ''
			}
		} else {
			super.format(name, value)
		}
	}
}

// Register the blot with Quill
Quill.register(ClImageBlot, true)

export { ClImageBlot }

// vim: ts=4
