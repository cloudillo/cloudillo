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
 * ClDocumentSpec - Custom BlotSpec for quill-blot-formatter2
 *
 * Handles cl-document blot for resize/delete functionality.
 * Embeds are full-width blocks, so no alignment actions.
 */

import Quill from 'quill'
import {
	BlotSpec,
	ResizeAction,
	DeleteAction,
	type Action
} from '@enzedonline/quill-blot-formatter2'

class ClDocumentSpec extends BlotSpec {
	private target: HTMLElement | null = null
	private activateBtn: HTMLButtonElement | null = null

	init = (): void => {
		this.formatter.quill.root.addEventListener('click', this.onClick)
	}

	private createActivateIcon(): SVGSVGElement {
		const ns = 'http://www.w3.org/2000/svg'
		const svg = document.createElementNS(ns, 'svg')
		svg.setAttribute('width', '24')
		svg.setAttribute('height', '24')
		svg.setAttribute('viewBox', '0 0 24 24')
		svg.setAttribute('fill', 'none')
		svg.setAttribute('stroke', 'currentColor')
		svg.setAttribute('stroke-width', '2')
		svg.setAttribute('stroke-linecap', 'round')
		svg.setAttribute('stroke-linejoin', 'round')
		const cursor = document.createElementNS(ns, 'path')
		cursor.setAttribute('d', 'M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z')
		const line = document.createElementNS(ns, 'path')
		line.setAttribute('d', 'M13 13l6 6')
		svg.appendChild(cursor)
		svg.appendChild(line)
		return svg
	}

	onClick = (event: MouseEvent): void => {
		const target = event.target as HTMLElement

		// Find the closest cl-document container (click might be on child elements)
		const container = target.closest('.ql-cl-document') as HTMLElement | null
		if (!container) return

		// Skip if container is already activated (prevents re-showing formatter
		// after activation, which would block the iframe)
		if (container.classList.contains('active')) return

		event.preventDefault()
		this.target = container
		this.formatter.show(this)

		// Add activation button to the overlay
		const overlay = this.formatter.overlay
		if (overlay) {
			const btn = document.createElement('button')
			btn.className = 'ql-cl-document-activate'
			btn.type = 'button'
			btn.appendChild(this.createActivateIcon())
			btn.addEventListener('click', (e) => {
				e.stopPropagation()
				const t = this.target
				this.formatter.hide()
				if (t) {
					t.style.overscrollBehavior = 'contain'
					t.classList.add('active')
				}
			})
			this.activateBtn = btn
			overlay.appendChild(btn)
		}
	}

	getTargetElement = (): HTMLElement | null => {
		return this.target
	}

	getActions = (): Action[] => {
		return [new ResizeAction(this.formatter), new DeleteAction(this.formatter)]
	}

	onHide = (): void => {
		// Remove activation button from the reused overlay
		if (this.activateBtn) {
			this.activateBtn.remove()
			this.activateBtn = null
		}

		// Persist resize dimensions to CRDT via Quill's API.
		// quill-blot-formatter2 sets width/height via setAttribute() which only
		// modifies the DOM. We read the final values and apply them through
		// Quill's formatText() so y-quill syncs to Yjs.
		const target = this.target
		if (target) {
			const width = target.getAttribute('width')
			const height = target.getAttribute('height')
			const storedWidth = target.getAttribute('data-width')
			const storedHeight = target.getAttribute('data-height')
			if (width || height) {
				const quill = this.formatter.quill
				const blot = Quill.find(target)
				if (blot) {
					const index = quill.getIndex(blot)
					if (width && width !== storedWidth)
						quill.formatText(index, 1, 'width', width, 'user')
					if (height && height !== storedHeight)
						quill.formatText(index, 1, 'height', height, 'user')
				}
			}
		}
		this.target = null
	}
}

export { ClDocumentSpec }

// vim: ts=4
