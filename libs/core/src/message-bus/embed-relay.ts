// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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
 * The only message types a nested embed may have relayed to the shell.
 *
 * The relay reposts from THIS window, so the shell sees the host app as the
 * sender and answers every connection-scoped request against the HOST's
 * connection — its resId, its appName, its token. Anything forwarded here is
 * therefore something the embed gets to do *as the document it is embedded in*.
 * A positive list, so a new message type is unreachable from an embed until
 * someone decides it should be.
 *
 * Deliberately absent, and why:
 * - `doc:info.req` / `doc:rename.req` — answered about the HOST document. The
 *   read is meaningless for an embed (whose DocBar is hidden anyway) and the
 *   write lets foreign-owned embedded content rename the document containing it.
 * - `storage:op.req` / `settings:{get,list,set}.req` — the shell namespaces both
 *   by the HOST's appName, so an embed would read and write the host document's
 *   app data. An embedded app that genuinely needs its own store has to be
 *   registered as a real connection first.
 * - `share:create.req` — mints a share link from the host connection, i.e. hands
 *   out access to the host document.
 * - `app:title.push` — the browser tab is showing the host document, not this.
 * - `camera:*` / `sensor:compass.sub` — device capture for an iframe the user
 *   never focused; no embeddable document type needs either.
 * - `import:complete.notify` — acknowledges an import the shell delivered to the
 *   host.
 *
 * The rest is what an activated embed genuinely needs to be a working document:
 * the auth handshake, the CRDT client id and offline cache, the pickers an
 * editable embed opens, and `embed:open.req` for a further nesting level.
 *
 * `EMBED_ALLOWED_MESSAGES` in `shell/src/message-bus/shell-bus.ts` is the same idea
 * for a shell-hosted embed, which is its own connection rather than one riding on a
 * host app's. Different trust boundary, so the two sets legitimately differ — but a
 * new message type wants a decision in both.
 */
const RELAY_UP_TYPES = new Set([
	'auth:init.req',
	'auth:token.refresh.req',
	'app:ready.notify',
	'app:error.notify',
	'embed:viewstate.push',
	'embed:open.req',
	'crdt:clientid.req',
	'crdt:cache.read.req',
	'crdt:cache.append.req',
	'crdt:cache.compact.req',
	'doc:pick.req',
	'media:pick.req'
])

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
 * **In a top-level window there is nothing to bridge and nothing is relayed
 * upward**: a direct child of the shell already reaches it. Relaying anyway
 * would repost every child message to *this* window, i.e. deliver it to the
 * shell a second time — which for `auth:init.req` means an `ok: false, 'App not
 * registered'` (the pending registration having been consumed by the real one)
 * handed back to the child under the original request id, beating the real
 * answer whenever that one waits on a token mint. Interception and
 * `sendToChild` still work, so a shell-side embed keeps its viewstate channel.
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
	const isTopWindow = window.parent === window

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

		// See the doc comment: from a top-level window the repost below would
		// deliver the message to the shell a second time. Interception above
		// still runs, so a shell-side host keeps hearing its child.
		if (isTopWindow) return

		// Local interception above happens for anything the child sends; only the
		// allowlisted types are put on the wire as if this app had sent them.
		if (!RELAY_UP_TYPES.has(msg.type)) return

		if (typeof msg.id === 'number') {
			const original = msg.id
			msg.id = original + idOffset
			relayedIds.set(msg.id, original)
		}
		// Set unconditionally and after the spread, so a child cannot clear or
		// forge it. Handlers that must not act on an embed's behalf check it —
		// see `doc:rename.req` in the shell. Not a substitute for the allowlist
		// above: a hostile HOST app can simply not use this relay at all, and
		// gains nothing by stripping the flag from its own messages.
		msg.relayed = true
		window.parent.postMessage(msg, '*')
	}

	// Downward: shell → child (match relayed responses + broadcast pushes, restore IDs)
	const downHandler = (event: MessageEvent) => {
		// Symmetric with `upHandler`: from a top-level window `window.parent` is
		// this window, so this would match the shell's own outgoing messages —
		// which already went straight to the child.
		if (isTopWindow) return
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
