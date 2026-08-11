// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

const _APP_NAME = 'quillo'

import * as Y from 'yjs'

//import { IndexeddbPersistence } from 'y-indexeddb'

import BlotFormatter from '@enzedonline/quill-blot-formatter2'
import Quill from 'quill'
//import QuillCursors from 'quill-cursors'
import QuillCursors from 'quill-cursors'
import Delta from 'quill-delta'
import { QuillBinding } from 'y-quill'
import '@enzedonline/quill-blot-formatter2/dist/css/quill-blot-formatter2.css'

import QuillTableBetter from 'quill-table-better'
import 'quill-table-better/dist/quill-table-better.css'

import { ClDocumentBlot } from './blots/ClDocumentBlot.js'
import { ClDocumentSpec } from './blots/ClDocumentSpec.js'
import { ClImageBlot } from './blots/ClImageBlot.js'
import { ClImageSpec } from './blots/ClImageSpec.js'
import { registerSafeTableBlots } from './blots/SafeTableBlots.js'

import './quillo.css'

import '@symbion/opalui'
//import '@symbion/opalui/themes/opaque.css'
import '@symbion/opalui/themes/glass.css'
// The DocBar's stylesheet — after the theme, before Quill's, so Quill keeps
// winning on the editor chrome it owns.
import '@cloudillo/react/components.css'

import 'quill/dist/quill.core.css'
import 'quill/dist/quill.snow.css'

//import 'quill/dist/quill.bubble.css'

import { getAppBus, idAccent } from '@cloudillo/core'
import { initPresence, openYDoc } from '@cloudillo/crdt'
import type { Awareness } from 'y-protocols/awareness'
import {
	FONTS,
	type FontCategory,
	getFontsByCategory,
	getSuggestedBodyFonts,
	getSuggestedHeadingFonts
} from '@cloudillo/fonts'
import { Cloud, CloudOff, createElement } from 'lucide'

import { mountDocBar } from './docbar.js'
import { importMarkdown } from './import-markdown.js'
import { registerTablePasteNormalizer } from './normalize-table-paste.js'
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
	// Cancel mousedown so picking a color keeps editor focus; swatches act on click.
	picker.addEventListener('mousedown', (e) => {
		e.preventDefault()
	})
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
	settingsMap: Y.Map<string>,
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
	_getOtherFont: () => string
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
	Quill.register('modules/cursors', QuillCursors as unknown as typeof Quill)
	Quill.register('modules/blotFormatter2', BlotFormatter)

	// Register table-better module
	Quill.register({ 'modules/table-better': QuillTableBetter }, true)

	// Register Font format with whitelist (class-based for .ql-font-xxx styles)
	interface ParchmentStatic {
		ClassAttributor: new (
			name: string,
			keyName: string,
			options: { scope: number; whitelist: string[] }
		) => unknown
		Scope: { INLINE: number }
	}
	const Parchment = Quill.import('parchment') as unknown as ParchmentStatic
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

	const docId = location.hash.slice(1)

	// Assigned once the settings dialog exists, further down; the DocBar's
	// "Document Settings" item calls through this rather than duplicating the
	// dialog in React.
	let openSettingsDialog: (() => void) | undefined

	const bus = getAppBus()
	const state = await bus.init('quillo')

	// Set ownerTag for image URL construction (extract from URL hash, not bus.idTag which is the user's identity)
	const [ownerTag, fileId] = docId.split(':')
	ClImageBlot.ownerTag = ownerTag
	ClImageBlot.token = state.accessToken
	ClDocumentBlot.sourceFileId = docId

	// Registered BEFORE `openYDoc` awaits: a corrective `auth:init.push` (the shell
	// sends one once auth resolves on a share-link mount) can land inside that await,
	// and quillo is the one Yjs app with no React effect to re-run.
	let awareness: Awareness | undefined
	bus.onIdentityChange(() => {
		if (awareness) initPresence(awareness, bus)
	})

	const yDoc = new Y.Doc()
	const doc = await openYDoc(yDoc, docId)
	awareness = doc.provider.awareness
	// Name and idTag only — the colour is derived from the idTag by whoever is
	// LOOKING, so a peer cannot assert someone else's identity over awareness.
	// Reads live bus state, so this also covers any push missed during the await.
	initPresence(awareness, bus)

	// Read by the `createCursor` wrapper installed further down. Declared here
	// because `bus.onThemeChange` keeps it current for the life of the document.
	let caretsDark = bus.darkMode

	// Quillo's one React island. `AppDocBar` renders null in an embed anyway;
	// this second guard keeps the React root from being created at all there.
	if (!bus.embedded) {
		const docBarEl = document.getElementById('docbar')
		if (docBarEl) {
			mountDocBar(docBarEl, {
				awareness: doc.provider.awareness,
				// Passed unconditionally: `QuilloDocBar` gates them on live
				// `bus.access`, so a corrective `auth:init.push` that upgrades a
				// share-link reader to a writer fills the menu in without a reload.
				actions: {
					onImportMarkdown: () => {
						const input = document.getElementById(
							'import-input'
						) as HTMLInputElement | null
						input?.click()
					},
					onOpenSettings: () => openSettingsDialog?.()
				}
			})
		}
	}
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
				specs: [ClImageSpec, ClDocumentSpec]
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

	// Normalize pasted tables (e.g. from spreadsheets) to the canonical
	// uniform-column shape so they round-trip correctly through the stored
	// Delta on reopen. Registered after `new Quill` so this matcher runs after
	// quill-table-better's own table matchers and rewrites their output.
	registerTablePasteNormalizer(editor)

	/*
	 * Give every remote caret its owner's identity colour.
	 *
	 * y-quill reads `user.color` off the awareness state and falls back to a
	 * single `#ffa500` for everyone (`y-quill/src/y-quill.js`, `updateCursor`).
	 * `initPresence` deliberately never publishes a colour — a peer must not get
	 * to assert one — so the colour is derived here, by whoever is LOOKING, from
	 * the same seed `DocBarPresence` uses: a peer's caret and their avatar in the
	 * bar come out the same colour.
	 *
	 * `updateCursor` reaches the colour through exactly one call, so wrapping that
	 * call is enough. Doing it here rather than writing into the peer's awareness
	 * state keeps the read-only property read-only, and works whatever order lib0
	 * happens to invoke the `change` handlers in.
	 */
	const cursorsModule = editor.getModule('cursors') as QuillCursors
	const createCursor = cursorsModule.createCursor.bind(cursorsModule)
	cursorsModule.createCursor = (id: string, name: string, _color: string) => {
		const state = doc.provider.awareness.getStates().get(Number(id)) as
			| { user?: { idTag?: string } }
			| undefined
		return createCursor(id, name, idAccent(state?.user?.idTag ?? id, caretsDark))
	}

	// Patch setContents during QuillBinding init: setContents drops table cells,
	// so redirect to delete + updateContents which handles tables correctly.
	// Assumption: QuillBinding calls setContents synchronously in its constructor
	// (verified with y-quill 1.x). If y-quill changes this, the patch will not apply.
	const origSetContents = editor.setContents.bind(editor)
	// biome-ignore lint/suspicious/noExplicitAny: y-quill passes plain array from type.toDelta()
	editor.setContents = ((delta: any, source: unknown) => {
		const ops = Array.isArray(delta) ? delta : (delta?.ops ?? [])
		const length = editor.getLength()
		return editor.updateContents(
			new Delta().delete(length).concat(new Delta(ops)),
			source as 'api'
		)
	}) as typeof editor.setContents
	try {
		const _binding = new QuillBinding(ytext, editor, doc.provider.awareness)
	} finally {
		editor.setContents = origSetContents
	}

	// quill-cursors fixes a cursor's colour at creation, and `createCursor`
	// (wrapper and all) hands back an existing cursor untouched for an id it
	// already knows. So a theme flip drops them and lets y-quill's own awareness
	// handler rebuild them, which also restores each caret's position; recreating
	// them by hand would lose it until the peer next moved.
	bus.onThemeChange((dark) => {
		caretsDark = dark
		const aw = doc.provider.awareness
		const remote = [...aw.getStates().keys()].filter((id) => id !== aw.clientID)
		for (const id of remote) cursorsModule.removeCursor(String(id))
		aw.emit('change', [{ added: [], updated: remote, removed: [] }, 'local'])
	})

	// Set read-only mode based on access level
	if (bus.access !== 'write') {
		editor.enable(false)
		const toolbar = document.getElementById('toolbar')
		if (toolbar) toolbar.style.display = 'none'
	}

	// Register image insertion handler
	interface QuillToolbarModule {
		addHandler(name: string, handler: () => void): void
	}
	const toolbarModule = editor.getModule('toolbar') as unknown as QuillToolbarModule
	toolbarModule.addHandler('image', async () => {
		if (bus.access !== 'write') return

		try {
			const result = await bus.pickMedia({
				mediaType: 'image/*',
				documentFileId: fileId,
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

	toolbarModule.addHandler('cl-document', async () => {
		if (bus.access !== 'write') return

		try {
			const result = await bus.pickDocument({
				sourceFileId: fileId,
				title: 'Embed Document'
			})

			if (!result) return // User cancelled

			const range = editor.getSelection(true)
			editor.insertEmbed(
				range.index,
				'cl-document',
				{
					fileId: result.fileId,
					appId: result.appId || 'view',
					contentType: result.contentType
				},
				'user'
			)
			editor.setSelection(range.index + 1, 0, 'silent')
		} catch (error) {
			console.error('[quillo] Failed to embed document:', error)
		}
	})

	// Undo/Redo handlers
	const historyModule = editor.getModule('history') as { undo(): void; redo(): void }
	document.getElementById('undo-btn')?.addEventListener('click', () => {
		historyModule.undo()
	})
	document.getElementById('redo-btn')?.addEventListener('click', () => {
		historyModule.redo()
	})

	// ============================================
	// Multi-range (discontinuous) selection guard
	// ============================================
	// Firefox lets users build a discontinuous selection (ctrl+double-click on
	// non-adjacent words). Quill 2.x only reads getRangeAt(0), so formatting
	// would silently apply to the first range only and then drop the selection.
	// Until multi-selection is supported, collapse to the newest range so the
	// limitation is obvious as soon as the user adds a second range.
	if (bus.access === 'write') {
		const selectionGuard = new AbortController()
		const collapseMultiRangeSelection = () => {
			const sel = document.getSelection()
			if (!sel || sel.rangeCount <= 1) return
			// Only act when the selection actually involves the editor.
			const root = editor.root
			let lastInEditor: Range | null = null
			for (let i = 0; i < sel.rangeCount; i++) {
				const r = sel.getRangeAt(i)
				if (root.contains(r.commonAncestorContainer)) lastInEditor = r
			}
			if (!lastInEditor) return
			// Keep only the last range (selection/document order); this visibly
			// removes the earlier selection(s), signalling multi-select isn't supported.
			sel.removeAllRanges()
			sel.addRange(lastInEditor)
		}
		document.addEventListener('selectionchange', collapseMultiRangeSelection, {
			signal: selectionGuard.signal
		})
		// Cancel toolbar mousedown so focus stays in the editor: otherwise the
		// selection highlight vanishes and Quill's stale `savedRange` can format the
		// wrong line. Controls still fire on click/change; programmatic focus unaffected.
		toolbarEl?.addEventListener('mousedown', (e) => {
			e.preventDefault()
		})
		// Tear down when the app frame goes away (single explicit cleanup point;
		// the listener would otherwise live for the whole page lifetime).
		window.addEventListener('pagehide', () => selectionGuard.abort(), { once: true })
	}

	// ============================================
	// Markdown Import
	// ============================================

	// Handle import data from shell (markdown → quillo conversion via smart upload)
	bus.onImportData(async (payload) => {
		if (bus.access !== 'write') {
			bus.notifyImportComplete(false, 'Read-only document')
			return
		}
		if (payload.sourceMimeType === 'text/markdown') {
			try {
				const bytes = Uint8Array.from(atob(payload.data), (c) => c.charCodeAt(0))
				const markdown = new TextDecoder().decode(bytes)
				importMarkdown(editor, markdown)
				bus.notifyImportComplete(true)
			} catch (err) {
				console.error('[quillo] Markdown import failed:', err)
				bus.notifyImportComplete(
					false,
					err instanceof Error ? err.message : 'Import failed'
				)
			}
		} else {
			bus.notifyImportComplete(false, `Unsupported import type: ${payload.sourceMimeType}`)
		}
	})

	// Hidden file input, opened by the DocBar's Import Markdown item
	const importInput = document.getElementById('import-input') as HTMLInputElement | null
	importInput?.addEventListener('change', async () => {
		if (bus.access !== 'write') return
		const file = importInput.files?.[0]
		if (!file) return
		const text = await file.text()
		importMarkdown(editor, text)
		importInput.value = ''
	})

	// ============================================
	// Custom Color Picker Setup
	// ============================================

	const colorBtn = document.getElementById('color-btn')
	const backgroundBtn = document.getElementById('background-btn')
	const colorIndicator = document.getElementById('color-indicator')
	const backgroundIndicator = document.getElementById('background-indicator')

	let _currentTextColor = 'var(--palette-n0)'
	let _currentBackgroundColor = 'var(--palette-yellow-p)'

	// Create color pickers
	const colorPicker = createColorPicker('color', (color) => {
		editor.format('color', color || false)
		if (color && colorIndicator) {
			colorIndicator.style.backgroundColor = color
			_currentTextColor = color
		}
	})

	const backgroundPicker = createColorPicker('background', (color) => {
		editor.format('background', color || false)
		if (color && backgroundIndicator) {
			backgroundIndicator.style.backgroundColor = color
			_currentBackgroundColor = color
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

	// Named, because the DocBar's Document Settings item opens the same dialog —
	// the dialog itself stays imperative, the React side only asks for it.
	openSettingsDialog = () => {
		// Refresh select values from Yjs before showing dialog
		const headingSelect = document.getElementById(
			'settings-heading-font'
		) as HTMLSelectElement | null
		const bodySelect = document.getElementById('settings-body-font') as HTMLSelectElement | null
		if (headingSelect) headingSelect.value = settingsMap.get('headingFont') || ''
		if (bodySelect) bodySelect.value = settingsMap.get('bodyFont') || ''
		settingsDialog.showModal()
	}

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
