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

	console.log('location.hash', location.hash)
	//const docId = location.hash.slice(1).split(':')[1]
	const docId = location.hash.slice(1)
	console.log('docId', docId)

	const bus = getAppBus()
	const state = await bus.init('quillo')
	console.log('[quillo] token', state.accessToken)
	console.log('[quillo] idTag', bus.idTag)
	const yDoc = new Y.Doc()
	const doc = await openYDoc(yDoc, docId)
	doc.provider.awareness.setLocalStateField('user', {
		name: bus.idTag,
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
			/*
			toolbar: [
				[{ header: [1, 2, false] }],
				['bold', 'italic', 'underline'],
				['image', 'code-block']
			],
			*/
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
})()

// vim: ts=4
