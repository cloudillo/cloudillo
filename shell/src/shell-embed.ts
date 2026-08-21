// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Embedding a document from the **shell's own** React tree.
 *
 * `useDocumentEmbed` (`@cloudillo/react`) is the app-side hook: it asks the shell
 * over `embed:open.req`, which is rejected from any source that is not a registered
 * app iframe (`shell/src/message-bus/handlers/embed.ts`), so the shell cannot use it
 * to render an embed of its own. This hook does the same job from the other side: it
 * composes the iframe src itself and hands the shell a pending registration for the
 * resource, which the iframe's first `auth:init.req` consumes.
 *
 * **It mints no token, deliberately.** The shell's auth handler already calls
 * `bus.getAccessToken(resId, access)` for a connection carrying no pre-provided one,
 * and that path *is* `mintAppToken` — which yields nothing when there is no session.
 * So a signed-in viewer gets a file-scoped token from the single implementation that
 * mints them, and an anonymous reader boots with `token: undefined`, whereupon
 * `buildRtdbUrl` emits `?access=read` and the backend forces guest read-only access.
 */

import * as React from 'react'

export type ShellEmbedAccess = 'read' | 'comment' | 'write'

/** What the shell records so the iframe's `auth:init.req` can be answered. */
export interface ShellEmbedRegistration {
	access: ShellEmbedAccess
	/** Owner tenant of the embedded document — the app's `bus.idTag` for a guest. */
	idTag: string
	/** Which bundle was launched. Handlers treat the recorded name as attested. */
	appName: string
	navState?: string
}

export interface ShellEmbedOptions {
	/** `<ownerIdTag>:<fileId>`. The iframe reads it back out of its location hash. */
	resId: string
	/** The target document's content type; picks the bundle. */
	contentType: string
	/** Defaults to `read` — the only level a published page ever asks for. */
	access?: ShellEmbedAccess
	navState?: string
	/** Shell build version, for the `?v=` cache buster on the bundle URL. */
	version?: string
	/**
	 * Records the pending registration the iframe's first init consumes.
	 *
	 * Keyed by the per-mount `_embed:<nonce>` handshake key, **not** by the resId —
	 * see `embedRegistrationKey`.
	 */
	register: (key: string, registration: ShellEmbedRegistration) => void
	/** Drops a registration that was never consumed. Takes the same key. */
	release?: (key: string) => void
}

export interface ShellEmbedState {
	status: 'loading' | 'ready' | 'error'
	iframeSrc?: string
	error?: string
}

/** A bundle directory name, and nothing that could be read as a path. */
const APP_NAME_RE = /^[a-z0-9][a-z0-9-]*$/

/** The bundle that renders anything without an app of its own. */
const GENERIC_VIEWER = 'view'

/** Serial for `embedRegistrationKey`. Uniqueness within one document is all it needs. */
let embedSerial = 0

/**
 * A registration key for one mount of one embed. **Per mount, never per resId** —
 * `handlers/auth.ts` *consumes* the pending registration on the first
 * `auth:init.req`, so two components embedding the same document would otherwise
 * fight over a single entry.
 *
 * The `_embed:<nonce>` shape is the one `handlers/embed.ts` already mints, and is
 * what `parseAppHash` splits a `<ownerTag>:<fileId>:_embed:<nonce>` hash on.
 */
function embedRegistrationKey(): string {
	embedSerial += 1
	return `_embed:shell-${embedSerial}`
}

/**
 * Which bundle serves a content type. `cloudillo/quillo` → `quillo`, anything
 * else → the generic viewer.
 *
 * The suffix is **validated, not just sliced.** A published page's `documentEmbed`
 * island carries its `contentType` in author-controlled `data-props`, and the
 * result of this call is both interpolated into the iframe's `/apps/<name>/` src
 * and recorded as the `appName` the shell's handlers treat as attested. Without
 * the check, a stored `cloudillo/../../~/settings/security` would frame an
 * arbitrary same-origin shell route. Anything unrecognised falls back to the
 * viewer, which is the same answer an unknown app already got.
 */
export function shellEmbedAppName(contentType: string): string {
	if (!contentType.startsWith('cloudillo/')) return GENERIC_VIEWER
	const name = contentType.slice('cloudillo/'.length)
	return APP_NAME_RE.test(name) ? name : GENERIC_VIEWER
}

/**
 * The iframe src for an embedded document, plus the registration that makes it
 * bootable. Pass `null` while the caller is still missing an input.
 */
export function useShellEmbed(options: ShellEmbedOptions | null): ShellEmbedState {
	const [state, setState] = React.useState<ShellEmbedState>({ status: 'loading' })

	// Callbacks and navState change identity freely; only these four decide
	// which document is being embedded, so only they may reload the iframe.
	const key = options
		? `${options.resId}|${options.contentType}|${options.access ?? 'read'}|${options.version ?? ''}`
		: null
	const optionsRef = React.useRef(options)
	optionsRef.current = options

	React.useEffect(() => {
		const opts = optionsRef.current
		if (!opts || !key) {
			setState({ status: 'loading' })
			return
		}
		// Captured here, not read off the ref at cleanup time: the ref is reassigned
		// during *render*, which runs before the cleanup. A caller passing `null` — the
		// documented "still missing an input" case — would otherwise leave the shell
		// holding a pending registration for a resId that never boots.
		const release = opts.release

		// Split on the FIRST colon only, as `AppBus.fileId` does — a fileId may
		// contain one, an idTag may not.
		const colon = opts.resId.indexOf(':')
		const idTag = colon > 0 ? opts.resId.slice(0, colon) : ''
		const fileId = colon > 0 ? opts.resId.slice(colon + 1) : ''
		if (!idTag || !fileId) {
			setState({ status: 'error', error: 'Embed needs an <ownerIdTag>:<fileId> resId' })
			return
		}

		const appName = shellEmbedAppName(opts.contentType)
		// Captured next to `release`, and for the same reason: the cleanup must
		// consume the entry *this* effect run created and nothing else.
		const registrationKey = embedRegistrationKey()
		// Before the src is handed over, never after: the iframe may load and
		// send its init before a later effect would have run.
		opts.register(registrationKey, {
			access: opts.access ?? 'read',
			idTag,
			appName,
			navState: opts.navState
		})

		const version = encodeURIComponent(opts.version ?? '1')
		// `<ownerTag>:<fileId>:_embed:<nonce>`, the same composition
		// `useDocumentEmbed` (`@cloudillo/react`) uses.
		setState({
			status: 'ready',
			iframeSrc: `/apps/${appName}/?v=${version}#${opts.resId}:${registrationKey}`
		})

		return () => release?.(registrationKey)
	}, [key])

	return state
}

// vim: ts=4
