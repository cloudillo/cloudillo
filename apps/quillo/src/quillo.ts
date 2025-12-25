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

import { ClImageBlot } from './blots/ClImageBlot.js'
import { ClImageSpec } from './blots/ClImageSpec.js'

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
;(async function () {
	Quill.register('modules/cursors', QuillCursors as any)
	Quill.register('modules/blotFormatter2', BlotFormatter)

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
})()

// vim: ts=4
