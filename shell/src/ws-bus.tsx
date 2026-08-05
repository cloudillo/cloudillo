// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getMessageBusUrl } from '@cloudillo/core'
import { useAuth } from '@cloudillo/react'
import { atom, useAtom } from 'jotai'
import React from 'react'

import { handleFileIdGenerated } from './services/file-id-resolver.js'
import { delay } from './utils.js'

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
	const [reconnectNonce, setReconnectNonce] = React.useState(0)
	const attemptRef = React.useRef(0)

	// The init effect deliberately ignores token rotations (see its dep array), with
	// one exception: a socket the server closed as unauthenticated, which the backoff
	// loop does not retry. `rejectedTokenRef` holds the refused token;
	// `latestTokenRef` is the newest the page holds, for the race where the close
	// arrives after the rotation.
	const rejectedTokenRef = React.useRef<string | undefined>(undefined)
	const latestTokenRef = React.useRef<string | undefined>(auth?.token)

	React.useEffect(() => {
		latestTokenRef.current = auth?.token
	})

	React.useEffect(
		function retryAfterTokenRotation() {
			const rejected = rejectedTokenRef.current
			if (!rejected || !auth?.token || auth.token === rejected) return
			rejectedTokenRef.current = undefined
			setReconnectNonce((n) => n + 1)
		},
		[auth?.token]
	)

	React.useEffect(
		function init() {
			if (!auth?.idTag || !auth.token) {
				// Close existing connection if auth becomes invalid
				if (wsRef.current) {
					wsRef.current.close()
					wsRef.current = undefined
					ws = undefined
				}
				setWsBus((prev) => ({ ...prev, connected: false }))
				return
			}
			const connectedToken = auth.token

			// Close existing connection before creating a new one
			if (wsRef.current) {
				wsRef.current.close()
				wsRef.current = undefined
				ws = undefined
			}

			const newWs = new WebSocket(getMessageBusUrl(auth.idTag, auth.token))
			wsRef.current = newWs
			ws = newWs

			newWs.onopen = function open() {
				attemptRef.current = 0
				rejectedTokenRef.current = undefined
				for (const sm of connSendBuf) {
					newWs.send(sm)
				}
				connSendBuf.length = 0
				setWsBus((prev) => ({ ...prev, connected: true }))
			}

			newWs.onclose = async function close(event) {
				console.warn('[WsBus] disconnected', event.code, event.reason)
				// Only reconnect if this is still the current WebSocket
				if (wsRef.current !== newWs) return

				// Don't reconnect on auth errors (1008 Policy Violation or 4xxx custom codes)
				// WebSocket close codes: 1008 = Policy Violation (auth failure)
				// 4000-4999 = Application-specific codes (often used for auth errors)
				if (event.code === 1008 || (event.code >= 4000 && event.code < 5000)) {
					console.warn('[WsBus] closed due to auth error')
					setWsBus((prev) => ({ ...prev, connected: false }))
					wsRef.current = undefined
					ws = undefined
					if (latestTokenRef.current && latestTokenRef.current !== connectedToken) {
						// A newer token landed while this close was in flight —
						// retry now.
						setReconnectNonce((n) => n + 1)
					} else {
						// Wait for a rotation; retrying the refused token would
						// just fail again.
						rejectedTokenRef.current = connectedToken
					}
					return
				}
				setWsBus((prev) => ({ ...prev, connected: false }))
				const backoff = Math.min(30_000, 1_000 * 2 ** attemptRef.current)
				attemptRef.current += 1
				await delay(backoff)
				// Re-check if still current before reconnecting
				if (wsRef.current === newWs) {
					wsRef.current = undefined
					ws = undefined
					setReconnectNonce((n) => n + 1)
				}
			}

			newWs.onmessage = function incoming(msg) {
				const j = JSON.parse(msg.data)
				switch (j.cmd) {
					case 'debug':
						console.log('[WsBus] debug', j)
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
					ws = undefined
				}
			}
		},
		// Deliberately NOT `[auth, ...]`: the backend authenticates this socket
		// once, at connect time, so a token rotation is no reason to tear it
		// down — and doing so drops whatever is sitting in `connSendBuf`.
		[auth?.idTag, reconnectNonce]
	)

	return <>{children}</>
}

// vim: ts=4
