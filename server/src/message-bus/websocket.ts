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

import WS from 'ws'

import { WebSocketExt } from '../websocket.js'
import { messageBusAdapter } from '../adapters.js'

export interface WsBusMsg {
	cmd: string
	data: any
}

const nextWsId = (function () {
	let idSeq = 1
	return function () {
		if (idSeq > 1000000000) idSeq = 1
		return idSeq++
	}
})()

export async function handleMessageBusConnection(ws: WebSocketExt, path: string[]) {
	console.log(`User ${ws.auth?.idTag} connected`)
	ws.isAlive = true
	ws.id = nextWsId()

	ws.on('pong', function heartbeat(this: any, ...args: any[]) {
		this.isAlive = true
	})
	const interval = setInterval(function ping() {
		if (ws.isAlive === false) return ws.terminate()
		ws.isAlive = false
		ws.ping(function () {})
	}, 30000)

	ws.on('message', function message(msg: WS.RawData) {
		console.log('WS msg', msg)
	})
	ws.on('close', function message() {
		console.log('WS disconnected')
		if (ws.auth?.idTag) messageBusAdapter.unsubscribeOnline('' + ws.id, '' + ws.auth.idTag)
	})
	ws.on('error', function error(err) {
		console.log('WS error', err)
	})

	if (ws.auth?.idTag) messageBusAdapter.subscribeOnline('' + ws.id, '' + ws.auth.idTag, async (userId, msgType, payload) => {
		//console.log('WS BUS ONLINE', userId, msgType, payload)
		ws.send(JSON.stringify({ cmd: msgType, data: payload }))
		return true
	})
}

// vim: ts=4
