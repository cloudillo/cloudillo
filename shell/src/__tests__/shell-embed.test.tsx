// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { jest } from '@jest/globals'
import { act, renderHook } from '@testing-library/react'

import {
	EMBED_LOADING_TIMEOUT_MS,
	type ShellEmbedOptions,
	shellEmbedAppName,
	useShellEmbed
} from '../shell-embed.js'

// The `contentType` reaching this function is **author-controlled**: a published
// page's `documentEmbed` island carries it in `data-props`, which is markup the
// document's author wrote. The answer is then interpolated into the embed iframe's
// `/apps/<name>/` src *and* recorded as the `appName` the shell's handlers treat as
// attested. So the suffix has to be validated as a bundle name, not merely sliced
// off — otherwise a stored `cloudillo/../../~/settings/security` frames an arbitrary
// same-origin shell route inside the reader's session.

describe('shellEmbedAppName', () => {
	it('should name the bundle for a real app content type', () => {
		expect(shellEmbedAppName('cloudillo/notillo')).toBe('notillo')
		expect(shellEmbedAppName('cloudillo/quillo')).toBe('quillo')
		expect(shellEmbedAppName('cloudillo/canvas-tools')).toBe('canvas-tools')
	})

	it('should fall back to the generic viewer for a non-app content type', () => {
		expect(shellEmbedAppName('image/png')).toBe('view')
		expect(shellEmbedAppName('application/pdf')).toBe('view')
		expect(shellEmbedAppName('')).toBe('view')
	})

	it.each([
		'cloudillo/../../~/settings/security',
		'cloudillo/../../login',
		'cloudillo/..',
		'cloudillo/a/b',
		'cloudillo//evil',
		'cloudillo/.',
		'cloudillo/notillo?x=1',
		'cloudillo/notillo#frag',
		'cloudillo/notillo/../view',
		'cloudillo/%2e%2e%2fadmin'
	])('should refuse %p and fall back to the viewer', (contentType) => {
		expect(shellEmbedAppName(contentType)).toBe('view')
	})

	it('should refuse anything that is not a bare lowercase bundle name', () => {
		// None of these fall in the set real app directory names use, so none may reach a path.
		expect(shellEmbedAppName('cloudillo/Notillo')).toBe('view')
		expect(shellEmbedAppName('cloudillo/not_illo')).toBe('view')
		expect(shellEmbedAppName('cloudillo/not.illo')).toBe('view')
		expect(shellEmbedAppName('cloudillo/-notillo')).toBe('view')
		expect(shellEmbedAppName('cloudillo/')).toBe('view')
	})
})

// A pending registration the shell never consumes is a leak: its iframe never boots, and the
// shell answers the next init for that key from a stale entry. Every registration this hook
// makes must be released — the case that used to escape is the caller passing `null`.
//
// The key is minted per *mount*, not taken from the resId: `handlers/auth.ts` consumes the
// entry on the first `auth:init.req`, so a page embedding the same document twice shared one
// entry — the first iframe took it and the second was rejected with 'App not registered'.

/** The `_embed:<nonce>` half of an iframe src's hash. */
function keyOf(src: string | undefined): string {
	return src?.slice(src.indexOf(':_embed:') + 1) ?? ''
}

describe('useShellEmbed', () => {
	function options(over: Partial<ShellEmbedOptions> = {}): ShellEmbedOptions {
		return {
			resId: 'bob.org:f1',
			contentType: 'cloudillo/notillo',
			register: jest.fn(),
			release: jest.fn(),
			...over
		}
	}

	/** The single key `register` was called with. */
	function registeredKey(opts: ShellEmbedOptions): string {
		const calls = (opts.register as jest.Mock).mock.calls
		expect(calls).toHaveLength(1)
		return calls[0][0] as string
	}

	it('should register a per-mount key and hand back the bundle src', () => {
		const opts = options()
		const { result } = renderHook(() => useShellEmbed(opts))

		expect(result.current).toMatchObject({ stage: 'connecting' })
		const key = registeredKey(opts)
		expect(key).toMatch(/^_embed:/)
		// `<ownerTag>:<fileId>:_embed:<nonce>` — the app reads the document half for
		// file URLs, the shell matches the init on the `_embed:` half.
		expect(result.current.iframeSrc).toBe(`/apps/notillo/?v=1#bob.org:f1:${key}`)
		expect(opts.register).toHaveBeenCalledWith(key, {
			access: 'read',
			// The document, not the `_embed:` key it is filed under — that is what
			// the shell mints the app's token against.
			resId: 'bob.org:f1',
			idTag: 'bob.org',
			appName: 'notillo',
			navState: undefined
		})
	})

	it('should give two embeds of the same document two distinct keys', () => {
		// A published page may carry the same `documentEmbed` twice. One shared
		// registration meant the second iframe never booted.
		const first = options()
		const second = options()
		const a = renderHook(() => useShellEmbed(first))
		const b = renderHook(() => useShellEmbed(second))

		const keyA = registeredKey(first)
		const keyB = registeredKey(second)
		expect(keyA).not.toBe(keyB)
		expect(keyOf(a.result.current.iframeSrc)).toBe(keyA)
		expect(keyOf(b.result.current.iframeSrc)).toBe(keyB)

		// And unmounting one must not consume the other's entry.
		a.unmount()
		expect(first.release).toHaveBeenCalledTimes(1)
		expect(first.release).toHaveBeenCalledWith(keyA)
		expect(second.release).not.toHaveBeenCalled()
	})

	it('should release the registration when the options become null', () => {
		// `optionsRef.current` is reassigned during render, which runs *before* cleanup —
		// reading `release` off the ref at cleanup time found the `null` just passed, releasing nothing.
		const opts = options()
		const { rerender } = renderHook(
			({ value }: { value: ShellEmbedOptions | null }) => useShellEmbed(value),
			{ initialProps: { value: opts as ShellEmbedOptions | null } }
		)
		expect(opts.release).not.toHaveBeenCalled()

		rerender({ value: null })
		expect(opts.release).toHaveBeenCalledTimes(1)
		expect(opts.release).toHaveBeenCalledWith(registeredKey(opts))
	})

	it('should release the registration on unmount', () => {
		const opts = options()
		const { unmount } = renderHook(() => useShellEmbed(opts))
		const key = registeredKey(opts)
		unmount()
		expect(opts.release).toHaveBeenCalledWith(key)
	})

	it('should release the old key exactly once when the document changes', () => {
		const first = options()
		const second = options({ resId: 'bob.org:f2' })
		const { rerender } = renderHook(
			({ value }: { value: ShellEmbedOptions }) => useShellEmbed(value),
			{ initialProps: { value: first } }
		)
		const firstKey = registeredKey(first)

		rerender({ value: second })
		expect(first.release).toHaveBeenCalledTimes(1)
		expect(first.release).toHaveBeenCalledWith(firstKey)
		expect(registeredKey(second)).not.toBe(firstKey)
	})

	it('should error on a resId that is not <srcIdTag>:<fileId>', () => {
		const opts = options({ resId: 'f1' })
		const { result } = renderHook(() => useShellEmbed(opts))
		expect(result.current.stage).toBe('error')
		expect(opts.register).not.toHaveBeenCalled()
	})

	it('should stay loading while the caller has no options', () => {
		const { result } = renderHook(() => useShellEmbed(null))
		expect(result.current).toMatchObject({ stage: 'connecting' })
	})
})

// The blank-rectangle bug: `useShellEmbed` contacts no backend, so a reader with no
// access to the document got an empty box. The signal that says so is the app's own
// `app:error.notify` (4403), relayed in by `DocumentEmbedIframe` — plus a timeout for
// the apps that report nothing at all (RTDB-only ones, or a bundle that never boots).

describe('useShellEmbed app lifecycle', () => {
	function options(over: Partial<ShellEmbedOptions> = {}): ShellEmbedOptions {
		return {
			resId: 'bob.org:f1',
			contentType: 'cloudillo/notillo',
			register: jest.fn(),
			release: jest.fn(),
			...over
		}
	}

	it('should surface the app error code', () => {
		const { result } = renderHook(() => useShellEmbed(options()))
		act(() => result.current.onAppError(4403, 'Access denied'))
		expect(result.current).toMatchObject({
			stage: 'error',
			errorCode: 4403,
			error: 'Access denied'
		})
	})

	it('should go ready when the app reports itself up', () => {
		// No stage at all — the pre-`stage` shape — still means "up".
		const { result } = renderHook(() => useShellEmbed(options()))
		act(() => result.current.onAppReady())
		expect(result.current.stage).toBe('ready')
	})

	// `bus.init()` emits `'auth'` on every handshake, so treating it as "up" cleared the overlay
	// on an empty document. Only the Yjs apps and notillo go on to report `'synced'`, so the
	// wait for it has to fail open — one ceiling for every bundle, since `syncing` shows only
	// the subtle corner spinner over a readable document.
	it('should hold at syncing after auth, then fall through to ready', () => {
		jest.useFakeTimers()
		try {
			// taskillo stops at 'auth', so the ceiling is the only thing that ends it.
			const { result } = renderHook(() =>
				useShellEmbed(options({ contentType: 'cloudillo/taskillo' }))
			)
			act(() => result.current.onAppReady('auth'))
			expect(result.current.stage).toBe('syncing')

			act(() => {
				jest.advanceTimersByTime(EMBED_LOADING_TIMEOUT_MS + 1)
			})
			expect(result.current.stage).toBe('ready')
		} finally {
			jest.useRealTimers()
		}
	})

	// An unknown content type falls back to the `view` bundle, which reports nothing after auth.
	it('should resolve the generic viewer at the ceiling', () => {
		jest.useFakeTimers()
		try {
			const { result } = renderHook(() =>
				useShellEmbed(options({ contentType: 'application/pdf' }))
			)
			act(() => result.current.onAppReady('auth'))

			act(() => {
				jest.advanceTimersByTime(EMBED_LOADING_TIMEOUT_MS + 1)
			})
			expect(result.current.stage).toBe('ready')
		} finally {
			jest.useRealTimers()
		}
	})

	it('should go ready as soon as an app that reports sync does so', () => {
		jest.useFakeTimers()
		try {
			const { result } = renderHook(() => useShellEmbed(options()))
			act(() => result.current.onAppReady('auth'))
			act(() => result.current.onAppReady('synced'))
			expect(result.current.stage).toBe('ready')

			act(() => {
				jest.advanceTimersByTime(EMBED_LOADING_TIMEOUT_MS + 1)
			})
			expect(result.current.stage).toBe('ready')
		} finally {
			jest.useRealTimers()
		}
	})

	it('should not let the sync ceiling resurrect a failed embed', () => {
		jest.useFakeTimers()
		try {
			const { result } = renderHook(() => useShellEmbed(options()))
			act(() => result.current.onAppReady('auth'))
			act(() => result.current.onAppError(4403, 'Access denied'))

			act(() => {
				jest.advanceTimersByTime(EMBED_LOADING_TIMEOUT_MS + 1)
			})
			expect(result.current).toMatchObject({ stage: 'error', errorCode: 4403 })
		} finally {
			jest.useRealTimers()
		}
	})

	it('should keep the error when a late ready arrives', () => {
		// The app may still emit a ready after it reported the failure; clearing the
		// error there would put the reader back at a blank box.
		const { result } = renderHook(() => useShellEmbed(options()))
		act(() => result.current.onAppError(4403))
		act(() => result.current.onAppReady())
		expect(result.current).toMatchObject({ stage: 'error', errorCode: 4403 })
	})

	it('should reset to connecting when the document changes', () => {
		const { result, rerender } = renderHook(
			({ value }: { value: ShellEmbedOptions }) => useShellEmbed(value),
			{ initialProps: { value: options() } }
		)
		act(() => result.current.onAppError(4403))

		rerender({ value: options({ resId: 'bob.org:f2' }) })
		expect(result.current.stage).toBe('connecting')
		expect(result.current.errorCode).toBeUndefined()
	})

	// The only escape from the boot timeout on a surface with no collapse to toggle.
	it('should start over when the retry key changes', () => {
		jest.useFakeTimers()
		try {
			const { result, rerender } = renderHook(
				({ value }: { value: ShellEmbedOptions }) => useShellEmbed(value),
				{ initialProps: { value: options({ retryKey: 0 }) } }
			)
			act(() => {
				jest.advanceTimersByTime(EMBED_LOADING_TIMEOUT_MS + 1)
			})
			expect(result.current.stage).toBe('error')

			rerender({ value: options({ retryKey: 1 }) })
			expect(result.current.stage).toBe('connecting')
			expect(result.current.errorCode).toBeUndefined()
		} finally {
			jest.useRealTimers()
		}
	})

	// The pre-retry iframe outlives the retry — the relay filters on `contentWindow`, and a
	// memoised `DocumentEmbedIframe` merely navigates the same element — so its late ready
	// used to clear the NEW mount's boot timeout and paint a dead retry as ready.
	it('should ignore a ready reported by the pre-retry mount', () => {
		jest.useFakeTimers()
		try {
			const { result, rerender } = renderHook(
				({ value }: { value: ShellEmbedOptions }) => useShellEmbed(value),
				{ initialProps: { value: options({ retryKey: 0 }) } }
			)
			const stale = result.current.onAppReady

			rerender({ value: options({ retryKey: 1 }) })
			expect(result.current.stage).toBe('connecting')

			act(() => stale())
			expect(result.current.stage).toBe('connecting')

			act(() => {
				jest.advanceTimersByTime(EMBED_LOADING_TIMEOUT_MS + 1)
			})
			expect(result.current.stage).toBe('error')
		} finally {
			jest.useRealTimers()
		}
	})

	it('should ignore an error reported by the pre-retry mount', () => {
		const { result, rerender } = renderHook(
			({ value }: { value: ShellEmbedOptions }) => useShellEmbed(value),
			{ initialProps: { value: options({ retryKey: 0 }) } }
		)
		const stale = result.current.onAppError

		rerender({ value: options({ retryKey: 1 }) })
		act(() => stale(4403, 'Access denied'))
		expect(result.current.stage).toBe('connecting')
		expect(result.current.errorCode).toBeUndefined()
	})

	it('should fail the box when the app stays silent', () => {
		jest.useFakeTimers()
		try {
			const { result } = renderHook(() => useShellEmbed(options()))
			act(() => {
				jest.advanceTimersByTime(EMBED_LOADING_TIMEOUT_MS + 1)
			})
			// No code: `AppLoadingIndicator` then shows its own generic text.
			expect(result.current.stage).toBe('error')
			expect(result.current.errorCode).toBeUndefined()
		} finally {
			jest.useRealTimers()
		}
	})
})
