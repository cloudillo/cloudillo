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
import * as syncProtocol from 'y-protocols/sync.js'
import * as awarenessProtocol from  'y-protocols/awareness.js'
//import { LeveldbPersistence } from 'y-leveldb'
import * as Encoder from 'lib0/encoding.js'
import * as Decoder from 'lib0/decoding.js'

import WS from 'ws'

import { Auth } from './index.js'
import{ determineTnId } from './auth.js'
import { WebSocketExt } from './websocket.js'
//import { readMetaAuth } from './meta-store/index.js'
import { metaAdapter, crdtAdapter } from './adapters.js'

//const ldb: any = new LeveldbPersistence('./doc.ldb')

const MSG_SYNC = 0
const MSG_AWARENESS = 1
const pingTimeout = 30000

/* DEBUG */

interface WSDoc {
	ydoc: Y.Doc
	awareness: awarenessProtocol.Awareness
	//conns: Set<WebSocketExt>
	conns: Map<WebSocketExt, Set<number>>
}

export const docs = new Map<string, WSDoc>()

async function loadDoc(tnId: number, docId: string) {

	console.log('LOAD DOC', tnId, docId)
	let ydoc = await crdtAdapter.getYDoc(docId)
	console.log('ydoc', !!ydoc, ydoc?.getText('doc')?.toDelta())

	const doc = {
		ydoc,
		awareness: new awarenessProtocol.Awareness(ydoc),
		conns: new Map<WebSocketExt,
		Set<number>>()
	}

	function updateHandler(update: Uint8Array) {
		crdtAdapter.storeUpdate(docId, update)
		const encoder = Encoder.createEncoder()
		Encoder.writeVarUint(encoder, MSG_SYNC)
		syncProtocol.writeUpdate(encoder, update)
		const message = Encoder.toUint8Array(encoder)
		doc.conns.forEach((_, c) => send(doc, c, message))
	}

	function awarenessHandler({ added, updated, removed }: { added: number[], updated: number[], removed: number[] }, ws: WebSocketExt) {
		const changedClients = added.concat(updated, removed)
		if (ws !== null) {
			const connControlledIDs = doc.conns.get(ws)
			if (connControlledIDs !== undefined) {
				added.forEach(id => connControlledIDs.add(id))
				removed.forEach(id => connControlledIDs.delete(id))
			}
		}
		// broadcast
		const encoder = Encoder.createEncoder()
		Encoder.writeVarUint(encoder, MSG_AWARENESS)
		Encoder.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(doc.awareness, changedClients))
		const buf = Encoder.toUint8Array(encoder)
		doc.conns.forEach((_, c) => {
			//console.log('send awareness', c.id)
			send(doc, c, buf)
		})
	}

	doc.ydoc.on('update', updateHandler)
	doc.awareness.on('update', awarenessHandler)
	docs.set(docId, doc)
	return doc
}

function closeConn(doc: WSDoc, ws: WebSocketExt) {
	console.log('closeConn', doc.conns.has(ws))
	if (doc.conns.has(ws)) {
		//const controlledIds = doc.conns.get(ws)
		doc.conns.delete(ws)

	}
}

function send(doc: WSDoc, ws: WebSocketExt, msg: Uint8Array) {
	if (ws.readyState !== WS.CONNECTING && ws.readyState !== WS.OPEN) {
		console.error('ERROR: send() (ws.readyState)', ws.readyState)
		closeConn(doc, ws)
	}
	try {
		ws.send(msg, err => {
			if (err != null) {
				console.error('ERROR: ws.send()', err)
				closeConn(doc, ws)
			}
		})
	} catch (err) {
		console.error('ERROR: send()', err instanceof Error ? err.toString() : err)
		closeConn(doc, ws)
	}
}

function handleMessage(ws: WebSocketExt, doc: WSDoc, msg: Uint8Array) {
	try {
		const encoder = Encoder.createEncoder()
		const decoder = Decoder.createDecoder(msg)
		const msgType = Decoder.readVarUint(decoder)
		switch (msgType) {
			case MSG_SYNC:
				console.log('MSG', msgType, decoder)
				Encoder.writeVarUint(encoder, MSG_SYNC)
				syncProtocol.readSyncMessage(decoder, encoder, doc.ydoc, ws)
				if (Encoder.length(encoder) > 1) {
					send(doc, ws, Encoder.toUint8Array(encoder))
				}
				break
			case MSG_AWARENESS:
				awarenessProtocol.applyAwarenessUpdate(doc.awareness, Decoder.readVarUint8Array(decoder), ws)
				break
		}
	} catch (err) {
		console.error('ERROR: handleMessage()', err instanceof Error ? err.toString() : err)
	}
}

export async function handleDocConnection(ws: WebSocketExt, path: string[]) {
	const [tenantTag, docId] = path.length >= 2 ? path[1].split(':') : ['', '']
	if (!tenantTag || !docId) return
	const tnId = await determineTnId(tenantTag)
	//console.log('WS DOC', { path, docId })
	ws.binaryType = 'arraybuffer'
	ws.isAlive = true

	// Check metadata
	console.log('WS AUTH', ws.auth)
	if (!ws.tnId || !ws.auth?.idTag) return
	const meta = await metaAdapter.readFileAuth(tnId, ws.auth, docId)
	console.log('META', docId, meta)
	if (!meta) return

	// Load doc
	let doc: WSDoc = docs.get(docId) || await loadDoc(tnId, docId)

	doc.conns.set(ws, new Set<number>())

	ws.on('message', (message: ArrayBuffer) => handleMessage(ws, doc, new Uint8Array(message)))

	// Check if connection is still alive
	let pongReceived = true
	const pingInterval = setInterval(() => {
		//console.log('interval', ws.id, doc.conns.size, doc.conns.has(ws))
		if (!pongReceived) {
			if (doc.conns.has(ws)) {
				console.log('missing pong')
				closeConn(doc, ws)
			}
			clearInterval(pingInterval)
		} else if (doc.conns.has(ws)) {
			pongReceived = false
			try {
				//console.log('WS PING', ws.id)
				ws.ping()
			} catch (e) {
				console.log('ping error')
				closeConn(doc, ws)
				clearInterval(pingInterval)
			}
		}
	}, pingTimeout)
	ws.on('pong', () => {
		pongReceived = true
		//console.log('WS PONG received', ws.id)
	})
	ws.on('ping', () => {
		//console.log('WS PING received', ws.id)
		ws.pong()
	})
	ws.on('error', function error(err) {
		console.log('WS error', err)
	})
	ws.on('close', () => {
		//console.log('WS CLOSE', ws.id)
		closeConn(doc, ws)
		//clearInterval(pingInterval)
	})
	{
		// send sync step 1
		const encoder = Encoder.createEncoder()
		Encoder.writeVarUint(encoder, MSG_SYNC)
		syncProtocol.writeSyncStep1(encoder, doc.ydoc)
		send(doc, ws, Encoder.toUint8Array(encoder))
		const awarenessStates = doc.awareness.getStates()
		if (awarenessStates.size > 0) {
			const encoder = Encoder.createEncoder()
			Encoder.writeVarUint(encoder, MSG_AWARENESS)
			Encoder.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys())))
			send(doc, ws, Encoder.toUint8Array(encoder))
		}
	}
}

// vim: ts=4
