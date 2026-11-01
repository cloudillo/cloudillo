// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * ClImageSpec - Custom BlotSpec for quill-blot-formatter2
 *
 * Handles our cl-image blot for resize/align/delete functionality.
 * Extends ImageSpec pattern to properly handle click-to-select behavior.
 */

import { getAppBus } from '@cloudillo/core'
import {
	Action,
	AlignAction,
	BlotSpec,
	DeleteAction,
	ResizeAction,
	ToolbarButton
} from '@enzedonline/quill-blot-formatter2'
import Quill from 'quill'

import i18n from '../i18n.js'

// Only call after `bus.init` has applied the shell's language, like the one in `quillo.ts`
const t = (key: string): string => i18n.t(key)

// lucide `type` icon, inline (quillo.ts no longer imports lucide)
const ALT_TEXT_ICON =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>'

/** Toolbar button that opens quillo's alt-text dialog for the selected image */
class AltTextAction extends Action {
	constructor(formatter: Action['formatter']) {
		super(formatter)
		const toolbar = formatter.options.toolbar
		this.toolbarButtons = [
			new ToolbarButton('altText', this.onClickHandler, {
				...toolbar,
				icons: { ...toolbar.icons, altText: ALT_TEXT_ICON },
				tooltips: { ...toolbar.tooltips, altText: t('Alt text') }
			})
		]
	}

	onClickHandler = (): void => {
		const img = this.formatter.currentSpec?.getTargetElement()
		if (!(img instanceof HTMLImageElement)) return
		// Hide first: `onHide` persists a pending resize while the node is still in the DOM,
		// and saving replaces the embed, which would orphan the overlay
		this.formatter.hide()
		ClImageSpec.onEditAlt?.(img)
	}
}

class ClImageSpec extends BlotSpec {
	/** Opens the alt-text dialog; set from `quillo.ts` once the editor exists */
	static onEditAlt?: (img: HTMLImageElement) => void

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
		const actions: Action[] = [
			new AlignAction(this.formatter),
			new ResizeAction(this.formatter),
			new DeleteAction(this.formatter)
		]
		if (ClImageSpec.onEditAlt && getAppBus().access === 'write') {
			actions.push(new AltTextAction(this.formatter))
		}
		return actions
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

export { AltTextAction, ClImageSpec }

// vim: ts=4
