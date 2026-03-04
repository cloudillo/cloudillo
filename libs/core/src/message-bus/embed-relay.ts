// This file is part of the Cloudillo Platform.
// Copyright (C) 2024-2026  Szilárd Hajba
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

/**
 * Embed Relay for Nested Sandboxed Iframes
 *
 * Nested sandboxed iframes cannot reach window.top via postMessage.
 * This relay forwards messages between a child iframe and the shell
 * by routing through the parent (this window).
 */

import { PROTOCOL_VERSION } from './types.js'

let embedCounter = 0
const EMBED_ID_RANGE = 1_000_000

/** Push message types that should be broadcast to nested embeds */
const BROADCAST_TYPES = new Set(['theme:update'])

/**
 * Options for configuring the embed relay
 */
export interface EmbedRelayOptions {
	/**
	 * Called when the child sends a notification (message with payload but no replyTo/id).
	 * Use this to intercept messages like embed:viewstate.push from embedded apps.
	 */
	onChildNotification?: (type: string, payload: unknown) => void
}

/**
 * Return type from setupEmbedRelay
 */
export interface EmbedRelayHandle {
	/** Remove all relay listeners */
	cleanup: () => void
	/** Send a message to the child iframe */
	sendToChild: (type: string, payload: unknown) => void
}

/**
 * Set up a bidirectional message relay for a nested embedded iframe.
 *
 * Nested sandboxed iframes cannot reach window.top via postMessage.
 * This relay forwards messages between a child iframe and the shell
 * by routing through the parent (this window).
 *
 * @param iframe - The nested iframe element
 * @param options - Optional configuration for notification interception
 * @returns EmbedRelayHandle with cleanup and sendToChild functions
 */
export function setupEmbedRelay(
	iframe: HTMLIFrameElement,
	options?: EmbedRelayOptions
): EmbedRelayHandle {
	// Each embed gets a unique ID offset to avoid collisions
	// with the host app's own request IDs
	const idOffset = ++embedCounter * EMBED_ID_RANGE
	const relayedIds = new Map<number, number>() // remapped → original

	// Upward: child → shell (remap request IDs, forward to parent)
	const upHandler = (event: MessageEvent) => {
		if (event.source !== iframe.contentWindow) return
		if (!event.data?.cloudillo) return

		const msg = { ...event.data }

		// Intercept notifications from child (no id, no replyTo, has payload)
		if (
			options?.onChildNotification &&
			typeof msg.id !== 'number' &&
			typeof msg.replyTo !== 'number' &&
			msg.payload
		) {
			options.onChildNotification(msg.type, msg.payload)
		}

		if (typeof msg.id === 'number') {
			const original = msg.id
			msg.id = original + idOffset
			relayedIds.set(msg.id, original)
		}
		window.parent.postMessage(msg, '*')
	}

	// Downward: shell → child (match relayed responses + broadcast pushes, restore IDs)
	const downHandler = (event: MessageEvent) => {
		if (event.source !== window.parent) return
		if (!event.data?.cloudillo) return

		// Forward allowed broadcast pushes (no id, no replyTo) to child
		if (
			typeof event.data.replyTo !== 'number' &&
			typeof event.data.id !== 'number' &&
			BROADCAST_TYPES.has(event.data.type)
		) {
			iframe.contentWindow?.postMessage(event.data, '*')
			return
		}

		if (typeof event.data.replyTo !== 'number') return

		const original = relayedIds.get(event.data.replyTo)
		if (original === undefined) return

		relayedIds.delete(event.data.replyTo)
		iframe.contentWindow?.postMessage({ ...event.data, replyTo: original }, '*')
	}

	window.addEventListener('message', upHandler)
	window.addEventListener('message', downHandler)

	const cleanup = () => {
		window.removeEventListener('message', upHandler)
		window.removeEventListener('message', downHandler)
		relayedIds.clear()
	}

	const sendToChild = (type: string, payload: unknown) => {
		iframe.contentWindow?.postMessage(
			{
				cloudillo: true,
				v: PROTOCOL_VERSION,
				type,
				payload
			},
			'*'
		)
	}

	return { cleanup, sendToChild }
}

// vim: ts=4
