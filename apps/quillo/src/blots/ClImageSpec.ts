// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * ClImageSpec - Custom BlotSpec for quill-blot-formatter2
 *
 * Handles our cl-image blot for resize/align/delete functionality.
 * Extends ImageSpec pattern to properly handle click-to-select behavior.
 */

import Quill from 'quill'
import {
	BlotSpec,
	AlignAction,
	ResizeAction,
	DeleteAction,
	type Action
} from '@enzedonline/quill-blot-formatter2'

class ClImageSpec extends BlotSpec {
	private img: HTMLElement | null = null

	init = (): void => {
		// Listen for clicks on cl-image elements
		this.formatter.quill.root.addEventListener('click', this.onClick)
	}

	onClick = (event: MouseEvent): void => {
		const target = event.target as HTMLElement

		// Check if clicked element is our custom image blot
		if (target instanceof HTMLImageElement && target.classList.contains('ql-cl-image')) {
			// Prevent default link behavior if image is wrapped in link
			if (target.closest('a')) {
				event.preventDefault()
			}

			// Store reference to the clicked image
			this.img = target

			// Show the formatter overlay
			this.formatter.show(this)
		}
	}

	getTargetElement = (): HTMLElement | null => {
		return this.img
	}

	getActions = (): Action[] => {
		// Return action instances, not classes
		return [
			new AlignAction(this.formatter),
			new ResizeAction(this.formatter),
			new DeleteAction(this.formatter)
		]
	}

	onHide = (): void => {
		// Persist resize width to CRDT via Quill's API.
		// quill-blot-formatter2 sets width via setAttribute() which only modifies
		// the DOM. We read the final value and apply it through Quill's
		// formatText() so y-quill syncs to Yjs.
		const target = this.img
		if (target) {
			const width = target.getAttribute('width')
			if (width) {
				const quill = this.formatter.quill
				const blot = Quill.find(target)
				if (blot) {
					const index = quill.getIndex(blot)
					quill.formatText(index, 1, 'width', width, 'user')
				}
			}
		}
		this.img = null
	}
}

export { ClImageSpec }

// vim: ts=4
