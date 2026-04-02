// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import React from 'react'
import { atom, useAtom } from 'jotai'

import { useAuth } from '@cloudillo/react'

import { delay } from './utils.js'
import { handleFileIdGenerated } from './services/file-id-resolver.js'

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
	const [wsBus, _setWsBus] = useWsBusState()

	React.useEffect(
		function wsBusEvent() {
			if (!wsBus.lastMsg) return
			if (opts.cmds && !opts.cmds.includes(wsBus.lastMsg.cmd)) return
			cb(wsBus.lastMsg)
		},
		[wsBus.lastMsg]
	)
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
	const [_wsBus, setWsBus] = useWsBusState()
	const wsRef = React.useRef<WebSocket | undefined>(undefined)

	React.useEffect(
		function init() {
			if (!auth?.idTag || !auth.token) {
				// Close existing connection if auth becomes invalid
				if (wsRef.current) {
					wsRef.current.close()
					wsRef.current = undefined
				}
				return
			}

			// Close existing connection before creating a new one
			if (wsRef.current) {
				wsRef.current.close()
				wsRef.current = undefined
			}

			const newWs = new WebSocket(`wss://cl-o.${auth.idTag}/ws/bus?token=${auth.token}`)
			wsRef.current = newWs

			newWs.onopen = function open() {
				console.log('connected')
				for (const sm of connSendBuf) {
					console.log('WS sending', sm)
					newWs.send(sm)
				}
				connSendBuf.length = 0
			}

			newWs.onclose = async function close(event) {
				console.log('disconnected', event.code, event.reason)
				// Only reconnect if this is still the current WebSocket
				if (wsRef.current !== newWs) return

				// Don't reconnect on auth errors (1008 Policy Violation or 4xxx custom codes)
				// WebSocket close codes: 1008 = Policy Violation (auth failure)
				// 4000-4999 = Application-specific codes (often used for auth errors)
				if (event.code === 1008 || (event.code >= 4000 && event.code < 5000)) {
					console.log('WS closed due to auth error, not reconnecting')
					return
				}
				await delay(10_000)
				// Re-check if still current before reconnecting
				if (wsRef.current === newWs) {
					wsRef.current = undefined
					// Trigger re-render to reconnect
					setWsBus((prev) => ({ ...prev, connected: false }))
				}
			}

			newWs.onmessage = function incoming(msg) {
				const j = JSON.parse(msg.data)
				console.log('WS BUS MSG', j)
				switch (j.cmd) {
					case 'debug':
						console.log('WS DEBUG', j)
						break
					case 'FILE_ID_GENERATED':
						// Handle file ID resolution
						if (j.data?.tempId && j.data?.fileId) {
							handleFileIdGenerated(j.data.tempId, j.data.fileId, j.data.rootId)
						}
						break
				}
				setWsBus((prev) => ({ ...prev, lastMsg: j }))
			}

			// Cleanup: close WebSocket when effect re-runs or component unmounts
			return () => {
				if (wsRef.current === newWs) {
					newWs.close()
					wsRef.current = undefined
				}
			}
		},
		[auth]
	)

	return <>{children}</>
}

// vim: ts=4
