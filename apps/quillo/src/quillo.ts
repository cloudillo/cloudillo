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

import { getAppBus, str2color } from '@cloudillo/core'
import { openYDoc } from '@cloudillo/crdt'
import {
	FONTS,
	getFontsByCategory,
	getSuggestedBodyFonts,
	getSuggestedHeadingFonts,
	type FontCategory
} from '@cloudillo/fonts'
import '@cloudillo/fonts/fonts.css'

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

// ============================================
// Font Utilities
// ============================================

const CATEGORY_LABELS: Record<FontCategory, string> = {
	'sans-serif': 'Sans Serif',
	serif: 'Serif',
	display: 'Display',
	monospace: 'Monospace'
}

function sanitizeFontName(family: string): string {
	return family.toLowerCase().replace(/\s+/g, '-')
}

// ============================================
// Settings Dialog System
// ============================================

function createSettingsDialog(
	settingsMap: Y.Map<any>,
	applyDocumentFonts: () => void
): HTMLDialogElement {
	const dialog = document.createElement('dialog')
	dialog.className = 'quillo-settings-dialog'
	dialog.id = 'settings-dialog'

	// Dialog container with OpalUI styling
	const container = document.createElement('div')
	container.className = 'c-dialog c-panel emph p-0'

	// Header
	const header = document.createElement('div')
	header.className = 'c-hbox g-2 p-3 border-bottom'
	const title = document.createElement('h3')
	title.className = 'm-0'
	title.textContent = 'Document Settings'
	header.appendChild(title)
	container.appendChild(header)

	// Content
	const content = document.createElement('div')
	content.className = 'c-vbox g-3 p-3'

	// Section title
	const sectionTitle = document.createElement('div')
	sectionTitle.className = 'text-secondary text-uppercase small'
	sectionTitle.style.letterSpacing = '0.05em'
	sectionTitle.textContent = 'Typography'
	content.appendChild(sectionTitle)

	// Heading font picker
	const headingField = document.createElement('div')
	headingField.className = 'c-vbox g-1'
	const headingLabel = document.createElement('label')
	headingLabel.className = 'small'
	headingLabel.textContent = 'Heading Font'
	headingField.appendChild(headingLabel)

	const headingSelect = createDocFontSelect('heading', () => bodySelect.value)
	headingSelect.value = settingsMap.get('headingFont') || ''
	headingField.appendChild(headingSelect)
	content.appendChild(headingField)

	// Body font picker
	const bodyField = document.createElement('div')
	bodyField.className = 'c-vbox g-1'
	const bodyLabel = document.createElement('label')
	bodyLabel.className = 'small'
	bodyLabel.textContent = 'Body Font'
	bodyField.appendChild(bodyLabel)

	const bodySelect = createDocFontSelect('body', () => headingSelect.value)
	bodySelect.value = settingsMap.get('bodyFont') || ''
	bodyField.appendChild(bodySelect)
	content.appendChild(bodyField)

	// Update pairing suggestions when either changes
	headingSelect.addEventListener('change', () => {
		updatePairingBadges(bodySelect, 'body', headingSelect.value)
	})
	bodySelect.addEventListener('change', () => {
		updatePairingBadges(headingSelect, 'heading', bodySelect.value)
	})

	// Initial pairing badge update
	setTimeout(() => {
		updatePairingBadges(bodySelect, 'body', headingSelect.value)
		updatePairingBadges(headingSelect, 'heading', bodySelect.value)
	}, 0)

	container.appendChild(content)

	// Footer with actions
	const footer = document.createElement('div')
	footer.className = 'c-hbox g-2 p-3 border-top jc-end'

	const cancelBtn = document.createElement('button')
	cancelBtn.type = 'button'
	cancelBtn.className = 'c-button secondary'
	cancelBtn.textContent = 'Cancel'
	cancelBtn.addEventListener('click', () => {
		// Reset to current values
		headingSelect.value = settingsMap.get('headingFont') || ''
		bodySelect.value = settingsMap.get('bodyFont') || ''
		dialog.close()
	})
	footer.appendChild(cancelBtn)

	const applyBtn = document.createElement('button')
	applyBtn.type = 'button'
	applyBtn.className = 'c-button primary'
	applyBtn.textContent = 'Apply'
	applyBtn.addEventListener('click', () => {
		settingsMap.set('headingFont', headingSelect.value)
		settingsMap.set('bodyFont', bodySelect.value)
		applyDocumentFonts()
		dialog.close()
	})
	footer.appendChild(applyBtn)

	container.appendChild(footer)
	dialog.appendChild(container)
	return dialog
}

function createDocFontSelect(
	type: 'heading' | 'body',
	getOtherFont: () => string
): HTMLSelectElement {
	const select = document.createElement('select')
	select.className = 'c-select'
	select.id = `settings-${type}-font`

	// Default option (inherit)
	const defaultOpt = document.createElement('option')
	defaultOpt.value = ''
	defaultOpt.textContent = type === 'heading' ? 'Default heading font' : 'Default body font'
	select.appendChild(defaultOpt)

	// Group fonts by category
	for (const category of ['sans-serif', 'serif', 'display', 'monospace'] as FontCategory[]) {
		const fonts = getFontsByCategory(category)
		if (fonts.length === 0) continue

		const optgroup = document.createElement('optgroup')
		optgroup.label = CATEGORY_LABELS[category]

		for (const font of fonts) {
			const option = document.createElement('option')
			option.value = font.family
			option.textContent = font.displayName
			option.style.fontFamily = `'${font.family}', sans-serif`
			optgroup.appendChild(option)
		}

		select.appendChild(optgroup)
	}

	return select
}

function updatePairingBadges(
	select: HTMLSelectElement,
	type: 'heading' | 'body',
	otherFontFamily: string
): void {
	// Get suggested fonts based on the other picker's selection
	const suggestedFamilies = otherFontFamily
		? type === 'body'
			? getSuggestedBodyFonts(otherFontFamily)
			: getSuggestedHeadingFonts(otherFontFamily)
		: []

	// Update option labels with "Pair" badge
	for (const option of select.querySelectorAll('option')) {
		const fontFamily = option.value
		if (!fontFamily) continue

		const font = FONTS.find((f) => f.family === fontFamily)
		if (!font) continue

		const isPair = suggestedFamilies.includes(fontFamily)
		option.textContent = isPair ? `${font.displayName} ★` : font.displayName
	}
}

;(async function () {
	// Register modules
	Quill.register('modules/cursors', QuillCursors as any)
	Quill.register('modules/blotFormatter2', BlotFormatter)

	// Register table-better module
	Quill.register({ 'modules/table-better': QuillTableBetter }, true)

	// Register Font format with whitelist (class-based for .ql-font-xxx styles)
	const Parchment = Quill.import('parchment') as any
	const fontWhitelist = FONTS.map((f) => sanitizeFontName(f.family))
	const FontClass = new Parchment.ClassAttributor('font', 'ql-font', {
		scope: Parchment.Scope.INLINE,
		whitelist: fontWhitelist
	})
	Quill.register('formats/font', FontClass, true)

	// Register Size format with whitelist (class-based for .ql-size-xxx styles)
	const SizeClass = new Parchment.ClassAttributor('size', 'ql-size', {
		scope: Parchment.Scope.INLINE,
		whitelist: ['9pt', '12pt', '16pt', '24pt', '36pt', '48pt', '72pt']
	})
	Quill.register('formats/size', SizeClass, true)

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

	// Set ownerTag for image URL construction (extract from URL hash, not bus.idTag which is the user's identity)
	const [ownerTag] = location.hash.slice(1).split(':')
	ClImageBlot.ownerTag = ownerTag
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

	// Notify shell when CRDT sync is complete
	if (doc.provider.synced) {
		bus.notifyReady('synced')
	} else {
		doc.provider.once('sync', () => {
			bus.notifyReady('synced')
		})
	}

	// ============================================
	// Populate Font Select Options (BEFORE Quill init)
	// ============================================
	// Must populate before Quill transforms the select into its picker UI
	const toolbarEl = document.getElementById('toolbar')
	const fontSelect = toolbarEl?.querySelector('.ql-font') as HTMLSelectElement | null
	if (fontSelect) {
		for (const font of FONTS) {
			const option = document.createElement('option')
			option.value = sanitizeFontName(font.family)
			fontSelect.appendChild(option)
		}
	}

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

	// ============================================
	// Document Settings (Yjs Storage)
	// ============================================

	const settingsMap = doc.yDoc.getMap<string>('settings')

	// Apply document fonts as CSS custom properties
	function applyDocumentFonts() {
		const headingFont = settingsMap.get('headingFont') || ''
		const bodyFont = settingsMap.get('bodyFont') || ''

		const editorEl = document.querySelector('.ql-editor') as HTMLElement | null
		if (editorEl) {
			editorEl.style.setProperty(
				'--doc-heading-font',
				headingFont ? `'${headingFont}', sans-serif` : 'inherit'
			)
			editorEl.style.setProperty(
				'--doc-body-font',
				bodyFont ? `'${bodyFont}', sans-serif` : 'inherit'
			)
		}
	}

	// Apply initial fonts and observe changes
	applyDocumentFonts()
	settingsMap.observe(applyDocumentFonts)

	// Create settings dialog
	const settingsDialog = createSettingsDialog(settingsMap, applyDocumentFonts)
	document.body.appendChild(settingsDialog)

	// Settings button click handler
	const settingsBtn = document.getElementById('settings-btn')
	settingsBtn?.addEventListener('click', () => {
		// Refresh select values from Yjs before showing dialog
		const headingSelect = document.getElementById(
			'settings-heading-font'
		) as HTMLSelectElement | null
		const bodySelect = document.getElementById('settings-body-font') as HTMLSelectElement | null
		if (headingSelect) headingSelect.value = settingsMap.get('headingFont') || ''
		if (bodySelect) bodySelect.value = settingsMap.get('bodyFont') || ''
		settingsDialog.showModal()
	})

	// Close dialog on Escape
	settingsDialog.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			settingsDialog.close()
		}
	})

	// ============================================
	// Close Pickers on Outside Click / Escape
	// ============================================

	document.addEventListener('click', (e) => {
		const target = e.target as HTMLElement
		if (!colorPicker.contains(target) && target !== colorBtn) {
			colorPicker.classList.add('hidden')
		}
		if (!backgroundPicker.contains(target) && target !== backgroundBtn) {
			backgroundPicker.classList.add('hidden')
		}
	})

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			colorPicker.classList.add('hidden')
			backgroundPicker.classList.add('hidden')
		}
	})
})()

// vim: ts=4
