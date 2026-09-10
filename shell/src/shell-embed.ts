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

import { appBundleUrl } from '@cloudillo/core'
import * as React from 'react'

import { shellEmbedAppName } from './app-name.js'
import { getShellBus } from './message-bus/shell-bus.js'

export type ShellEmbedAccess = 'read' | 'comment' | 'write'

/** What the shell records so the iframe's `auth:init.req` can be answered. */
export interface ShellEmbedRegistration {
	access: ShellEmbedAccess
	/** `<srcIdTag>:<fileId>` of the embedded document — what the shell mints the token against. */
	resId: string
	/** Owner tenant of the embedded document — the app's `bus.idTag` for a guest. */
	idTag: string
	/** Which bundle was launched. Handlers treat the recorded name as attested. */
	appName: string
	navState?: string
}

/** `key` is the per-mount `_embed:<nonce>` handshake key, not the document's resId. */
export function registerShellEmbed(key: string, registration: ShellEmbedRegistration): void {
	// Stamped here rather than at each call site: every entry this function creates IS an
	// embed, and a future caller cannot forget it.
	getShellBus()?.setPendingRegistration(key, { ...registration, embed: true })
}

export function releaseShellEmbed(key: string): void {
	// Never consumed means the iframe never booted; leaving it would hand the
	// next claimant of this key a registration it did not open. The key is per
	// mount, so this can never drop an entry a sibling embed of the same document
	// is still waiting on.
	getShellBus()?.getAppTracker().consumePendingRegistration(key)
}

export interface ShellEmbedOptions {
	/** `<srcIdTag>:<fileId>`. The iframe reads it back out of its location hash. */
	resId: string
	/**
	 * The **home** node's idTag — the origin app bundles are served from. Not the
	 * `<srcIdTag>` half of `resId`, which names the node the *document* lives on.
	 *
	 * On a published-site route this must be the *page owner's* idTag: the page carries
	 * a CSP (`content_security_policy` in `cloudillo-rs`, `crates/cloudillo-site/src/
	 * cache.rs`) whose `frame-src` is `'self' https://cl-o.<page owner idTag>`. Any other
	 * value gives an iframe the browser blocks silently — no load event, no error event,
	 * so `useShellEmbed` just sits at `'connecting'` until the boot timer errors out.
	 * The one site caller, `shell/src/site/island-components.tsx`, passes `api.idTag`
	 * for both halves, so the invariant holds by construction today.
	 */
	idTag: string
	/** The target document's content type; picks the bundle. */
	contentType: string
	/** Defaults to `read` — the only level a published page ever asks for. */
	access?: ShellEmbedAccess
	navState?: string
	/** Shell build version, for the `?v=` cache buster on the bundle URL. */
	version?: string
	/** Bump to force a fresh mount: a new registration key, a new iframe, timers reset.
	 *  The only escape from the boot timeout on a surface with no collapse to toggle. */
	retryKey?: string | number
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

/** Assignable to `LoadingStage` from `shell/src/apps/AppLoadingIndicator.tsx`. */
export type ShellEmbedStage = 'connecting' | 'syncing' | 'ready' | 'error'

export interface ShellEmbedState {
	/** What the embed box should show right now. */
	stage: ShellEmbedStage
	iframeSrc?: string
	/** Fallback error text (malformed resId, or the app's own message). */
	error?: string
	/** App error code — 4401/4403/4404 — for `<AppLoadingIndicator errorCode>`. */
	errorCode?: number
	/** Pass to `<DocumentEmbedIframe onAppReady>`. Stable identity. */
	onAppReady: (stage?: string) => void
	/** Pass to `<DocumentEmbedIframe onAppError>`. Stable identity. */
	onAppError: (code: number, message?: string) => void
}

/**
 * How long an embedded app may stay silent before the box calls it a failure, and the
 * ceiling on `'syncing'`.
 *
 * Its own budget, deliberately not shared with `LOADING_TIMEOUT_MS` in
 * `shell/src/apps/index.tsx`. It is what covers the apps that report nothing at all:
 * an RTDB-only app (notillo, taskillo) never emits `app:error.notify`, and neither
 * does a bundle that fails to boot.
 *
 * `bus.init()` emits `'auth'` on every handshake, but only the Yjs apps and notillo go on
 * to report `'synced'` — the `view` bundle, taskillo, formillo, mapillo and scanillo stop
 * at `'auth'`. So `'syncing'` needs a ceiling, and this is it for everyone: no per-bundle
 * list to keep in step with which apps happen to report sync. The stage only shows the
 * subtle corner spinner over a fully readable document, so waiting it out costs nothing.
 */
export const EMBED_LOADING_TIMEOUT_MS = 15000

/**
 * A registration key for one mount of one embed. **Per mount, never per resId** —
 * `handlers/auth.ts` *consumes* the pending registration on the first
 * `auth:init.req`, so two components embedding the same document would otherwise
 * fight over a single entry.
 *
 * The `_embed:<nonce>` shape is the one `handlers/embed.ts` already mints, and is
 * what `parseAppHash` splits a `<srcIdTag>:<fileId>:_embed:<nonce>` hash on.
 *
 * Unguessable, not merely unique: `handlers/auth.ts` binds the consuming connection to this
 * entry's `resId`, so a key another iframe could predict is a token for a document it was
 * never opened on.
 */
function embedRegistrationKey(): string {
	return `_embed:shell-${crypto.randomUUID()}`
}

/**
 * The iframe src for an embedded document, plus the registration that makes it
 * bootable. Pass `null` while the caller is still missing an input.
 */
export function useShellEmbed(options: ShellEmbedOptions | null): ShellEmbedState {
	type EmbedStatus = Omit<ShellEmbedState, 'onAppReady' | 'onAppError'>
	const [state, setState] = React.useState<EmbedStatus>({ stage: 'connecting' })
	const timerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const syncTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

	// Callbacks and navState change identity freely; only these decide which document is
	// being embedded — plus `retryKey`, the caller's explicit "start over".
	const key = options
		? `${options.resId}|${options.idTag}|${options.contentType}|${options.access ?? 'read'}|${options.version ?? ''}|${options.retryKey ?? ''}`
		: null
	const optionsRef = React.useRef(options)
	optionsRef.current = options

	/*
	 * Which mount a report belongs to.
	 *
	 * After a `retryKey` bump the previous document is still alive — the relay filters on
	 * `iframe.contentWindow`, and the element survives a `src` change — so its late
	 * `app:ready.notify` would otherwise land on the NEW mount, clearing its boot timeout
	 * and painting a dead retry as ready. Each mount's callbacks capture the `iframeSrc`
	 * they were made for and drop anything reported against an older one. Callers must
	 * therefore key the iframe on `iframeSrc` (`LiveDocCard`, `island-components`), so the
	 * pre-retry element is a separate instance still holding the older callbacks.
	 */
	const srcRef = React.useRef<string | undefined>(undefined)
	// In an effect, not the render body: a ref write during render is the pattern React
	// disallows, and effects flush before the browser can deliver the next `postMessage`
	// task, so the guard below still names the newest mount by the time it runs.
	React.useEffect(() => {
		srcRef.current = state.iframeSrc
	}, [state.iframeSrc])
	const mountSrc = state.iframeSrc

	// A late `app:ready.notify` must never clear an error the app already reported,
	// hence the functional update reading the stage it is moving away from.
	const onAppReady = React.useCallback(
		(stage?: string) => {
			if (mountSrc !== srcRef.current) return
			// Any report at all proves the bundle booted, so the boot timeout is done.
			clearTimeout(timerRef.current)
			if (stage === 'auth') {
				setState((s) => (s.stage === 'connecting' ? { ...s, stage: 'syncing' } : s))
				clearTimeout(syncTimerRef.current)
				syncTimerRef.current = setTimeout(() => {
					setState((s) => (s.stage === 'syncing' ? { ...s, stage: 'ready' } : s))
				}, EMBED_LOADING_TIMEOUT_MS)
				return
			}
			clearTimeout(syncTimerRef.current)
			setState((s) =>
				s.stage === 'connecting' || s.stage === 'syncing' ? { ...s, stage: 'ready' } : s
			)
		},
		[mountSrc]
	)

	const onAppError = React.useCallback(
		(code: number, message?: string) => {
			if (mountSrc !== srcRef.current) return
			clearTimeout(timerRef.current)
			clearTimeout(syncTimerRef.current)
			setState((s) => ({
				...s,
				stage: 'error',
				errorCode: code,
				error: message || undefined
			}))
		},
		[mountSrc]
	)

	React.useEffect(() => {
		const opts = optionsRef.current
		if (!opts || !key) {
			setState({ stage: 'connecting' })
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
			setState({ stage: 'error', error: 'Embed needs an <srcIdTag>:<fileId> resId' })
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
			resId: opts.resId,
			idTag,
			appName,
			navState: opts.navState
		})

		const version = encodeURIComponent(opts.version ?? '1')
		// `<srcIdTag>:<fileId>:_embed:<nonce>`, the same composition
		// `useDocumentEmbed` (`@cloudillo/react`) uses.
		setState({
			stage: 'connecting',
			// `opts.idTag` is the home node; the local `idTag` is the document owner.
			iframeSrc: `${appBundleUrl(opts.idTag, appName)}?v=${version}#${opts.resId}:${registrationKey}`
		})
		// No `errorCode` and no message: `AppLoadingIndicator` then falls back to its
		// own generic text, which keeps this module i18n-free.
		timerRef.current = setTimeout(() => {
			setState((s) => (s.stage === 'connecting' ? { ...s, stage: 'error' } : s))
		}, EMBED_LOADING_TIMEOUT_MS)

		return () => {
			clearTimeout(timerRef.current)
			clearTimeout(syncTimerRef.current)
			release?.(registrationKey)
		}
	}, [key])

	return { ...state, onAppReady, onAppError }
}

// vim: ts=4
