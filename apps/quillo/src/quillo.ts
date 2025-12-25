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

const APP_NAME = 'quillo'

import * as Y from 'yjs'
//import { IndexeddbPersistence } from 'y-indexeddb'

import { QuillBinding } from 'y-quill'
import Quill from 'quill'
//import QuillCursors from 'quill-cursors'
import QuillCursors from 'quill-cursors'
import BlotFormatter from '@enzedonline/quill-blot-formatter2'
import '@enzedonline/quill-blot-formatter2/dist/css/quill-blot-formatter2.css'

import QuillTableBetter from 'quill-table-better'
import 'quill-table-better/dist/quill-table-better.css'

import { ClImageBlot } from './blots/ClImageBlot.js'
import { ClImageSpec } from './blots/ClImageSpec.js'
import { registerSafeTableBlots } from './blots/SafeTableBlots.js'

import './quillo.css'

import '@symbion/opalui'
//import '@symbion/opalui/themes/opaque.css'
import '@symbion/opalui/themes/glass.css'

import 'quill/dist/quill.core.css'
import 'quill/dist/quill.snow.css'
//import 'quill/dist/quill.bubble.css'

import * as T from '@symbion/runtype'

import { createElement, Cloud, CloudOff } from 'lucide'

import { getAppBus, openYDoc, str2color } from '@cloudillo/base'

// ============================================
// Color Palette System
// ============================================

const PALETTE = {
	neutrals: ['n0', 'n1', 'n2', 'n3', 'n4', 'n5'],
	normal: ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'],
	pastel: ['red-p', 'orange-p', 'yellow-p', 'green-p', 'cyan-p', 'blue-p', 'purple-p', 'pink-p']
}

function paletteKeyToCss(key: string): string {
	if (key === 'clear' || key === 'none') return ''
	return `var(--palette-${key})`
}

function createColorPicker(
	type: 'color' | 'background',
	onSelect: (color: string) => void
): HTMLElement {
	const picker = document.createElement('div')
	picker.className = 'quillo-color-picker hidden'
	picker.id = `${type}-picker`

	// Clear option row
	const clearRow = document.createElement('div')
	clearRow.className = 'quillo-color-row'
	const clearBtn = document.createElement('button')
	clearBtn.className = 'quillo-color-swatch clear'
	clearBtn.title = 'Clear'
	clearBtn.dataset.color = 'clear'
	clearBtn.addEventListener('click', () => {
		onSelect('')
		picker.classList.add('hidden')
	})
	clearRow.appendChild(clearBtn)
	picker.appendChild(clearRow)

	// Neutrals row
	const neutralRow = document.createElement('div')
	neutralRow.className = 'quillo-color-row'
	for (const key of PALETTE.neutrals) {
		const swatch = document.createElement('button')
		swatch.className = 'quillo-color-swatch'
		swatch.style.backgroundColor = paletteKeyToCss(key)
		swatch.title = key
		swatch.dataset.color = key
		swatch.addEventListener('click', () => {
			onSelect(paletteKeyToCss(key))
			picker.classList.add('hidden')
		})
		neutralRow.appendChild(swatch)
	}
	picker.appendChild(neutralRow)

	// Normal colors row
	const normalRow = document.createElement('div')
	normalRow.className = 'quillo-color-row'
	for (const key of PALETTE.normal) {
		const swatch = document.createElement('button')
		swatch.className = 'quillo-color-swatch'
		swatch.style.backgroundColor = paletteKeyToCss(key)
		swatch.title = key
		swatch.dataset.color = key
		swatch.addEventListener('click', () => {
			onSelect(paletteKeyToCss(key))
			picker.classList.add('hidden')
		})
		normalRow.appendChild(swatch)
	}
	picker.appendChild(normalRow)

	// Pastel colors row
	const pastelRow = document.createElement('div')
	pastelRow.className = 'quillo-color-row'
	for (const key of PALETTE.pastel) {
		const swatch = document.createElement('button')
		swatch.className = 'quillo-color-swatch'
		swatch.style.backgroundColor = paletteKeyToCss(key)
		swatch.title = key
		swatch.dataset.color = key
		swatch.addEventListener('click', () => {
			onSelect(paletteKeyToCss(key))
			picker.classList.add('hidden')
		})
		pastelRow.appendChild(swatch)
	}
	picker.appendChild(pastelRow)

	return picker
}
;(async function () {
	// Register modules
	Quill.register('modules/cursors', QuillCursors as any)
	Quill.register('modules/blotFormatter2', BlotFormatter)

	// Register table-better module
	Quill.register({ 'modules/table-better': QuillTableBetter }, true)

	// Fix: Override table blots with null-safe versions (fixes crash on Yjs sync)
	registerSafeTableBlots()

	console.log('location.hash', location.hash)
	//const docId = location.hash.slice(1).split(':')[1]
	const docId = location.hash.slice(1)
	console.log('docId', docId)

	const bus = getAppBus()
	const state = await bus.init('quillo')
	console.log('[quillo] token', state.accessToken)
	console.log('[quillo] idTag', bus.idTag)

	// Set ownerTag for image URL construction
	ClImageBlot.ownerTag = bus.idTag
	const yDoc = new Y.Doc()
	const doc = await openYDoc(yDoc, docId)
	doc.provider.awareness.setLocalStateField('user', {
		name: bus.displayName || bus.idTag || 'Anonymous',
		color: await str2color(bus.idTag ?? '', 40, 70, bus.darkMode)
	})
	/*
	doc.provider.awareness.on('change', function (changes: any) {
		console.log('Awareness change:', changes, Array.from(doc.provider.awareness.getStates().values()))
	})
	*/

	const ytext = doc.yDoc.getText('doc')

	const iconEl = document.getElementById('ws-bus-status')!
	doc.provider.on('status', function ({ status }: { status: string }) {
		console.log('STATUS', status)
		switch (status) {
			case 'connected':
				iconEl.replaceChildren(createElement(Cloud, { class: 'text-success' }))
				break
			case 'disconnected':
				iconEl.replaceChildren(createElement(CloudOff, { class: 'text-error' }))
				break
		}
	})

	const editor = new Quill('#editor', {
		modules: {
			cursors: true,
			toolbar: '#toolbar',
			blotFormatter2: {
				specs: [ClImageSpec]
			},
			history: {
				userOnly: true
			},
			table: false, // Disable Quill's built-in table module
			'table-better': {
				language: 'en_US',
				menus: ['column', 'row', 'merge', 'table', 'cell', 'wrap', 'delete'],
				toolbarTable: true
			},
			keyboard: {
				bindings: QuillTableBetter.keyboardBindings
			}
		},
		placeholder: 'Start collaborating...',
		theme: 'snow' // or 'bubble'
	})

	const binding = new QuillBinding(ytext, editor, doc.provider.awareness)

	// Set read-only mode based on access level
	if (bus.access === 'read') {
		editor.enable(false)
		const toolbar = document.getElementById('toolbar')
		if (toolbar) toolbar.style.display = 'none'
	}

	// Register image insertion handler
	const toolbarModule = editor.getModule('toolbar') as any
	toolbarModule.addHandler('image', async () => {
		if (bus.access === 'read') return

		try {
			const result = await bus.pickMedia({
				mediaType: 'image/*',
				documentFileId: docId,
				title: 'Insert Image'
			})

			if (!result) return // User cancelled

			// Get current selection range
			const range = editor.getSelection(true)

			// Insert the cl-image blot at cursor
			editor.insertEmbed(range.index, 'cl-image', { fileId: result.fileId, alt: '' }, 'user')

			// Move cursor after the image
			editor.setSelection(range.index + 1, 0, 'silent')
		} catch (error) {
			console.error('[quillo] Failed to insert image:', error)
		}
	})

	// ============================================
	// Custom Color Picker Setup
	// ============================================

	const colorBtn = document.getElementById('color-btn')
	const backgroundBtn = document.getElementById('background-btn')
	const colorIndicator = document.getElementById('color-indicator')
	const backgroundIndicator = document.getElementById('background-indicator')

	let currentTextColor = 'var(--palette-n0)'
	let currentBackgroundColor = 'var(--palette-yellow-p)'

	// Create color pickers
	const colorPicker = createColorPicker('color', (color) => {
		editor.format('color', color || false)
		if (color && colorIndicator) {
			colorIndicator.style.backgroundColor = color
			currentTextColor = color
		}
	})

	const backgroundPicker = createColorPicker('background', (color) => {
		editor.format('background', color || false)
		if (color && backgroundIndicator) {
			backgroundIndicator.style.backgroundColor = color
			currentBackgroundColor = color
		}
	})

	// Add pickers to body
	document.body.appendChild(colorPicker)
	document.body.appendChild(backgroundPicker)

	// Position picker above button
	function showPicker(picker: HTMLElement, button: HTMLElement) {
		const rect = button.getBoundingClientRect()

		// Temporarily show off-screen to measure height
		picker.style.visibility = 'hidden'
		picker.style.top = '0'
		picker.style.left = '0'
		picker.classList.remove('hidden')

		const pickerHeight = picker.offsetHeight
		const pickerWidth = picker.offsetWidth

		// Calculate position: above button, aligned left
		let top = rect.top - pickerHeight - 8
		let left = rect.left

		// Ensure picker stays within viewport
		if (top < 8) top = rect.bottom + 8 // flip below if no room above
		if (left + pickerWidth > window.innerWidth - 8) {
			left = window.innerWidth - pickerWidth - 8
		}

		// Apply position and show
		picker.style.top = `${top}px`
		picker.style.left = `${left}px`
		picker.style.visibility = ''
	}

	// Toggle color picker
	colorBtn?.addEventListener('click', (e) => {
		e.stopPropagation()
		backgroundPicker.classList.add('hidden')
		if (colorPicker.classList.contains('hidden')) {
			showPicker(colorPicker, colorBtn)
		} else {
			colorPicker.classList.add('hidden')
		}
	})

	// Toggle background picker
	backgroundBtn?.addEventListener('click', (e) => {
		e.stopPropagation()
		colorPicker.classList.add('hidden')
		if (backgroundPicker.classList.contains('hidden')) {
			showPicker(backgroundPicker, backgroundBtn)
		} else {
			backgroundPicker.classList.add('hidden')
		}
	})

	// Close pickers on outside click
	document.addEventListener('click', (e) => {
		const target = e.target as HTMLElement
		if (!colorPicker.contains(target) && target !== colorBtn) {
			colorPicker.classList.add('hidden')
		}
		if (!backgroundPicker.contains(target) && target !== backgroundBtn) {
			backgroundPicker.classList.add('hidden')
		}
	})

	// Close pickers on Escape key
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			colorPicker.classList.add('hidden')
			backgroundPicker.classList.add('hidden')
		}
	})
})()

// vim: ts=4
