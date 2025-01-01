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

import React from 'react'
import { atom, useAtom } from 'jotai'

import { useAuth, delay } from './utils.js'

let ws: WebSocket | undefined
const connSendBuf: string[] = []

export interface Notification {
	type: string
	title: string
	body: string
}

export interface WsBusMsg {
	cmd: string
	data?: unknown
}

export interface WsBusState {
	connected: boolean
	notifications: Notification[]
	lastMsg?: WsBusMsg
}

const wsBusAtom = atom<WsBusState>({ connected: false, notifications: [] })

export function useWsBusState() {
	return useAtom(wsBusAtom)
}

interface UseWsBusOpts {
	cmds?: string[]
}
export function useWsBus(opts: UseWsBusOpts, cb: (msg: WsBusMsg) => void) {
	const [wsBus, setWsBus] = useWsBusState()

	React.useEffect(function wsBusEvent() {
		if (!wsBus.lastMsg) return
		if (opts.cmds && !opts.cmds.includes(wsBus.lastMsg.cmd)) return
		cb(wsBus.lastMsg)
	}, [wsBus.lastMsg])
}

export function send(msg: unknown): void {
	const sm = JSON.stringify(msg)
	if (ws?.readyState === WebSocket.OPEN) {
		ws.send(sm)
	} else {
		connSendBuf.push(sm)
	}
}

export function WsBusRoot({ children }: { children: React.ReactNode }) {
	const [auth] = useAuth()
	const [wsBus, setWsBus] = useWsBusState()

	let ws: WebSocket | undefined

	function initWs() {
		if (!auth) return

		ws = new WebSocket(`wss://cl-o.${auth.idTag}/ws/bus`)

		ws.onopen = function open() {
			console.log('connected')
			for (let sm of connSendBuf) {
				console.log('WS sending', sm)
				ws && ws.send(sm)
			}
			//connSendBuf = []
		}

		ws.onclose = async function close() {
			console.log('disconnected')
			await delay(10_000)
			initWs()
		}

		ws.onmessage = function incoming(msg) {
			const j = JSON.parse(msg.data)
			console.log('WS BUS MSG', j)
			switch (j.cmd) {
			case 'debug':
				console.log('WS DEBUG', j)
				break
			}
			setWsBus({ ...wsBus, lastMsg: j })
		}

		//ws.onerror = async function(err) {
		//	console.log('WS error', err)
		//}
	}

	React.useEffect(function init() {
		if (auth) {
			initWs()
		} else if (ws) {
			ws.close()
			ws = undefined
		}
	}, [auth])

	return <>{children}</>
}

// vim: ts=4
