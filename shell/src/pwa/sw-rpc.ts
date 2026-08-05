// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Page <-> ServiceWorker messaging: one id counter, one pending map, one
 * `navigator.serviceWorker` listener, one timeout policy.
 *
 * Requests correlate by `id` on the way out and `replyTo` on the way back.
 */

import { decodeSwInbound, PROTOCOL_VERSION, type SwInbound } from '../../shared/sw-protocol.js'

export type { SwInbound }

const DEFAULT_TIMEOUT_MS = 3000

let nextRequestId = 0
const pending = new Map<number, (msg: SwInbound) => void>()
const listeners = new Map<string, Set<(msg: SwInbound) => void>>()

const swAvailable = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator

/** `replyTo`/`data` exist on some union members only. */
function replyToOf(msg: SwInbound): number | undefined {
	return 'replyTo' in msg ? msg.replyTo : undefined
}

function dataOf(msg: SwInbound): Record<string, unknown> | undefined {
	return 'data' in msg ? (msg.data as Record<string, unknown> | undefined) : undefined
}

/** Absent `ok` means success — replies predating the field carried no failures. */
function failedOf(msg: SwInbound): boolean {
	return 'ok' in msg && msg.ok === false
}

function errorOf(msg: SwInbound): string | undefined {
	return 'error' in msg ? msg.error : undefined
}

if (typeof window !== 'undefined' && swAvailable()) {
	navigator.serviceWorker.addEventListener('message', (evt) => {
		const msg = decodeSwInbound(evt.data)
		if (!msg) return

		const replyTo = replyToOf(msg)
		if (typeof replyTo === 'number') {
			const resolve = pending.get(replyTo)
			if (resolve) {
				pending.delete(replyTo)
				resolve(msg)
			}
		}

		const handlers = listeners.get(msg.type)
		if (handlers) for (const handler of handlers) handler(msg)
	})
}

/** Await the controlling worker. Resolves to undefined when there is none. */
async function getController(): Promise<ServiceWorker | undefined> {
	if (!swAvailable()) return undefined
	const reg = await navigator.serviceWorker.getRegistration()
	if (!reg?.active) return undefined
	await navigator.serviceWorker.ready
	return navigator.serviceWorker.controller ?? undefined
}

/** Fire-and-forget message to the SW. Silently no-ops without a controller. */
export async function swNotify(type: string, payload?: unknown): Promise<void> {
	const controller = await getController()
	if (!controller) return
	controller.postMessage({ cloudillo: true, v: PROTOCOL_VERSION, type, payload })
}

/**
 * The outcome of a round trip. The three non-`ok` cases are deliberately
 * distinct: "the worker answered that it failed" is a transient storage error,
 * while "there is no controller" says the worker holds nothing at all — callers
 * that gate a logout on the answer must not confuse the two.
 */
export type SwReply<T> =
	| { status: 'ok'; data?: T }
	| { status: 'error'; error?: string }
	| { status: 'unavailable' }
	| { status: 'timeout' }

/** Request/response round trip, with the failure modes kept apart. */
export async function swRequestResult<T = Record<string, unknown>>(
	type: string,
	payload?: unknown,
	timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<SwReply<T>> {
	const controller = await getController()
	if (!controller) return { status: 'unavailable' }

	const id = ++nextRequestId
	return new Promise<SwReply<T>>((resolve) => {
		const timeout = setTimeout(() => {
			pending.delete(id)
			console.warn(`[PWA] SW request timed out: ${type}`)
			resolve({ status: 'timeout' })
		}, timeoutMs)

		pending.set(id, (msg) => {
			clearTimeout(timeout)
			if (failedOf(msg)) resolve({ status: 'error', error: errorOf(msg) })
			else resolve({ status: 'ok', data: dataOf(msg) as T | undefined })
		})

		controller.postMessage({ cloudillo: true, v: PROTOCOL_VERSION, type, payload, id })
	})
}

/**
 * Request/response round trip. Resolves to undefined when there is no
 * controller, the SW reports a failure, or it does not answer within
 * `timeoutMs`. Use `swRequestResult` where those cases differ.
 */
export async function swRequest<T = Record<string, unknown>>(
	type: string,
	payload?: unknown,
	timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T | undefined> {
	const reply = await swRequestResult<T>(type, payload, timeoutMs)
	return reply.status === 'ok' ? reply.data : undefined
}

/** Subscribe to unsolicited SW messages of `type`. Returns an unsubscribe fn. */
export function onSwMessage(type: string, handler: (msg: SwInbound) => void): () => void {
	let handlers = listeners.get(type)
	if (!handlers) {
		handlers = new Set()
		listeners.set(type, handlers)
	}
	handlers.add(handler)
	// Re-look-up rather than closing over the Set: run twice (StrictMode
	// double-invokes cleanups), or after another subscriber recreated the set for
	// this type, a captured-and-now-empty Set would delete the live one.
	return () => {
		const current = listeners.get(type)
		if (!current) return
		current.delete(handler)
		if (current.size === 0) listeners.delete(type)
	}
}

// vim: ts=4
