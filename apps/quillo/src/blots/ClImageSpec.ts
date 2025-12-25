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
 * ClImageSpec - Custom BlotSpec for quill-blot-formatter2
 *
 * Handles our cl-image blot for resize/align/delete functionality.
 * Extends ImageSpec pattern to properly handle click-to-select behavior.
 */

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
		// Clear the image reference when hiding
		this.img = null
	}
}

export { ClImageSpec }

// vim: ts=4
