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

import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
//import { WebsocketProvider } from '../src/y-websocket.js'
import { IndexeddbPersistence } from 'y-indexeddb'

import * as T from '@symbion/runtype'

export let accessToken: string | undefined
export let idTag: string | undefined
export let tnId: number | undefined
export let roles: string[] | undefined
export let darkMode: boolean | undefined

// Utility functions //
export async function delay(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

const tCloudilloMessage = T.taggedUnion('type')({
	'initReq': T.struct({
		cloudillo: T.trueValue,
		type: T.literal('initReq')
	}),
	'init': T.struct({
		cloudillo: T.trueValue,
		type: T.literal('init'),
		idTag: T.optional(T.string),
		tnId: T.optional(T.id),
		roles: T.optional(T.array(T.string)),
		theme: T.string,
		darkMode: T.optional(T.boolean),
		token: T.optional(T.string)
	}),
	'reply': T.struct({
		cloudillo: T.trueValue,
		type: T.literal('reply'),
		id: T.number,
		data: T.unknown
	}),
})

export function init(app: string): Promise<string | undefined> {
	console.log(`[${app}] cloudillo.init`, app)
	return new Promise((resolve, reject) => {
		window.addEventListener('message', function onMessage(evt) {
			console.log(`[${app}] RECV:`,  evt.source, evt.data)
			if (!evt.data.cloudillo) return
			const msg = T.decode(tCloudilloMessage, evt.data)
			console.log(`[${app}] Decode:`, msg)

			if (T.isOk(msg)) {
				switch (msg.ok.type) {
				case 'init':
					accessToken = msg.ok.token
					idTag = msg.ok.idTag
					tnId = msg.ok.tnId
					roles = msg.ok.roles
					darkMode = !!msg.ok.darkMode
					if (msg.ok.darkMode) {
						console.log(`[${app}] setting dark mode`)
						document.body.classList.add('theme-glass')
						document.body.classList.add('dark')
						document.body.classList.remove('light')
					} else {
						console.log(`[${app}] setting light mode`)
						document.body.classList.add('theme-glass')
						document.body.classList.add('light')
						document.body.classList.remove('dark')
					}
					return resolve(accessToken)
				case 'reply':
					if (reqMap[msg.ok.id]) {
						reqMap[msg.ok.id].resolve(msg.ok.data)
						delete reqMap[msg.ok.id]
					}
					return
				}
			} else {
				console.log(`[${app}] Invalid message`, evt.data, msg.err)
				reject('Invalid message')
			}
		})

		console.log(`[${app}] Send:`, 'initReq')
		window.parent?.postMessage({
			cloudillo: true,
			type: 'initReq'
		}, '*')
	})
}

let reqId = 0
const reqMap: Record<number, {
	resolve: (data: unknown) => void
	reject: (reason?: any) => void
}> = {}

async function shellRequest() {
	const id = reqId++
	return new Promise((resolve, reject) => {
		reqMap[id] = {
			resolve,
			reject
		}
		window.postMessage({
			cloudillo: true,
			type: 'shellRequest',
			id
		}, '*')
	})
}

//async function getToken(): Promise<string> {
async function getToken() {
	return accessToken
}

export async function openYDoc(yDoc: Y.Doc, docId: string): Promise<{ yDoc: Y.Doc, provider: WebsocketProvider }> {
	const [targetTag, resId] = docId.split(':')
	console.log('openYDoc', yDoc, docId)
	if (!accessToken) throw new Error('No access token')

	const idbProvider = new IndexeddbPersistence(docId, yDoc)
	idbProvider.on('sync', () => console.log('content loaded from local storage'))

	console.log(`wss://cl-o.${targetTag}/ws/crdt`, resId, yDoc, { params: { token: accessToken }})
	const wsProvider = new WebsocketProvider(`wss://cl-o.${targetTag}/ws/crdt`, resId, yDoc, { params: { token: accessToken }})
	return {
		yDoc,
		provider: wsProvider
	}
}


// vim: ts=4
