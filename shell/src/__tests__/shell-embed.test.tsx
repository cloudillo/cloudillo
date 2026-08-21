// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { jest } from '@jest/globals'
import { renderHook } from '@testing-library/react'

import { type ShellEmbedOptions, shellEmbedAppName, useShellEmbed } from '../shell-embed.js'

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

		expect(result.current).toMatchObject({ status: 'ready' })
		const key = registeredKey(opts)
		expect(key).toMatch(/^_embed:/)
		// `<ownerTag>:<fileId>:_embed:<nonce>` — the app reads the document half for
		// file URLs, the shell matches the init on the `_embed:` half.
		expect(result.current.iframeSrc).toBe(`/apps/notillo/?v=1#bob.org:f1:${key}`)
		expect(opts.register).toHaveBeenCalledWith(key, {
			access: 'read',
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

	it('should error on a resId that is not <ownerIdTag>:<fileId>', () => {
		const opts = options({ resId: 'f1' })
		const { result } = renderHook(() => useShellEmbed(opts))
		expect(result.current.status).toBe('error')
		expect(opts.register).not.toHaveBeenCalled()
	})

	it('should stay loading while the caller has no options', () => {
		const { result } = renderHook(() => useShellEmbed(null))
		expect(result.current).toEqual({ status: 'loading' })
	})
})
