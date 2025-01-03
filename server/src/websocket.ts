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

import http from 'http'
import http2 from 'http2'
import WS, { WebSocketServer, WebSocket } from 'ws'
import Cookies from 'cookies'
import jwt from 'jsonwebtoken'

import { determineTnId } from './auth.js'
import { Auth } from './index.js'
import { AuthAdapter } from './auth-adapter.js'
import { messageBusAdapter } from './adapters.js'
import { handleDocConnection } from './ws-doc.js'
import { handleMessageBusConnection } from './message-bus/websocket.js'

export class WebSocketExt extends WebSocket {
	id?: number
	tnId?: number
	auth?: Auth
	isAlive?: boolean
}

export interface WsBusMsg {
	cmd: string
	data: any
}

let wss: WS.Server<typeof WebSocketExt>

export interface WsConfig {
}

export async function init(server: http.Server | http2.Http2Server, authAdapter: AuthAdapter, config: WsConfig) {
	wss = new WebSocketServer({ noServer: true, WebSocket: WebSocketExt })

	server.on('upgrade', async function upgrade(req, socket, head) {
		try {
			//console.log('WS BUS UPGRADE', req.url)
			// Check auth token
			const tokenIdx = req.url?.indexOf('?token=') || -1
			const params = tokenIdx >= 0 ? new URLSearchParams(req.url?.slice(tokenIdx + 1)) : undefined
			const token = params?.get('token') || (new Cookies(req, undefined as any)).get('token')

			// Decode token
			const auth = token ? await authAdapter.verifyAccessToken(token) : undefined

			// FIXME
			if (!auth?.t || !req.headers.host) {
				console.log('auth', auth)
				throw 'Unauthorized'
			}
			const tnId = await determineTnId(req.headers['x-forwarded-host'] as string || req.headers.host)
			wss.handleUpgrade(req, socket, head, async function doneUpgrade(ws: WebSocketExt) {
				//ws.id = nextWsId()
				ws.tnId = tnId,
				ws.auth = {
					idTag: auth.u || auth.t,
					roles: auth.r || []
				}

				try {
					const path = req.url?.slice(1).split('?')[0].split('/') || []
					//console.log('WS BUS CONNECT', { url: req.url, path, id: ws.id, userId: ws.auth?.userId })
					//console.log('WS BUS CONNECT', path)
					if (path[0] == 'ws') path.shift()
					switch (path[0]) {
						case 'bus':
							handleMessageBusConnection(ws, path)
							break
						case 'crdt':
							console.log('WS DOC connect', path)
							handleDocConnection(ws, path)
							break
						default:
							console.log('WS unknown path', req.url, path)
					}
				} catch (err) {
					console.log('WS AUTH ERROR', err)
					//ws.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
					ws.close()
				}
			})
		} catch (err) {
			console.log('WS AUTH ERROR', err)
			socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
			socket.destroy()
		}
	})
}

/*
export async function init(httpServer: http.Server, config: WsConfig) {
	wss = new WebSocketServer({ noServer: true, WebSocket: WebSocketExt })
	//wss.binaryType = 'arraybuffer'
	//app.context.dispatch = dispatch

	httpServer.on('upgrade', function upgrade(req, socket, head) {
		try {
			console.log('WS BUS UPGRADE', req.url)
			// Check auth token
			const tokenIdx = req.url?.indexOf('?token=') || -1
			const params = tokenIdx >= 0 ? new URLSearchParams(req.url?.slice(tokenIdx + 1)) : undefined
			const token = params?.get('token') || (new Cookies(req, undefined as any)).get('token')

			// Decode token
			const auth = token ? jwt.verify(token, config.jwtSecret || '') as any : {}
			console.log('AUTH verified', auth)

			// FIXME
			if (!auth?.u) {
				console.log('auth', auth)
				throw 'Unauthorized'
			}
			wss.handleUpgrade(req, socket, head, async function doneUpgrade(ws: WebSocketExt) {
				ws.id = nextWsId()
				//console.log('WS BUS AUTH', ws.id, token, auth?.userId)
				//[ws.tnId, ws.userId] = auth.iss.split(':')
				if (!req.headers.host) throw 'Unauthorized'
				const tnId = await determineTnId(req.headers['x-forwarded-host'] as string || req.headers.host)
				//ws.tnId = tnId
				//ws.userId = userId
				ws.auth = {
					tnId,
					userId: tnId === auth.t ? auth.u : undefined,
					roles: tnId === auth.t && auth.r || []
				}
				if (ws.auth.userId) messageBusAdapter.subscribeOnline('' + ws.id, '' + ws.auth.userId, async (userId, msgType, payload) => {
					console.log('WS BUS ONLINE', userId, msgType, payload)
					ws.send(JSON.stringify({ cmd: 'online', args: [userId, msgType, payload] }))
					return true
				})
				if (userWS[`${ws.auth.userId}`]) {
					userWS[`${ws.auth.userId}`].push(ws)
				} else {
					userWS[`${ws.auth.userId}`] = [ws]
				}
				wss.emit('connection', ws, req)
			})
		} catch (err) {
			console.log('WS AUTH ERROR', err)
			socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
			socket.destroy()
		}
	})

	wss.on('connection', function connection(ws: WebSocketExt, req) {
		try {
			const path = req.url?.slice(1).split('?')[0].split('/') || []
			console.log('WS BUS CONNECT', { url: req.url, path, id: ws.id, userId: ws.auth?.userId })
			if (path[1] === 'doc') {
				handleDocWS(ws, req, path)
			} else {
				ws.isAlive = true

				ws.on('pong', function heartbeat(this: any, ...args: any[]) {
					//console.log('WS PONG')
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
					if (ws.auth?.userId) messageBusAdapter.unsubscribeOnline('' + ws.id, '' + ws.auth.userId)
					cleanup(ws)
				})
				ws.on('error', function error(err) {
					console.log('WS error', err)
				})
			}
		} catch (err) {
			console.log('WS AUTH ERROR', err)
			//ws.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
			ws.close()
		}
	})
}
*/

// vim: ts=4
