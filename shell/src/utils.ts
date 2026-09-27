// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { FetchError } from '@cloudillo/core'
import { bytesToBase64 } from '@cloudillo/core/base64'
import { atom, useAtom } from 'jotai'
import * as React from 'react'

/** A transparent 1×1 GIF. The `src` for a slide whose URL `getFileUrl` refused: it keeps
 *  the array index-aligned with `lbIndex` the way `''` did, but `<img src="">` resolves to
 *  the document URL and refetches the shell's own HTML, and a data: URI fetches nothing. */
export const BLANK_IMAGE_SRC =
	'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

// Run async tasks with a bounded concurrency so a large fan-out (federated
// probes, per-group hydration, proxy-token fetches) doesn't fire every request
// at once (rate-limit safety).
export async function runWithLimit(
	tasks: Array<() => Promise<void>>,
	limit: number
): Promise<void> {
	let i = 0
	async function worker(): Promise<void> {
		while (i < tasks.length) {
			const task = tasks[i++]
			await task()
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
}

export const format = {
	integer: function integer(n: number | undefined) {
		return n ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'
	},

	number: function number(n: number | undefined) {
		return n ? n.toLocaleString() : '-'
	},

	currency: function currency(n: number | undefined) {
		return n
			? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
			: '-'
	}
}

// Thin aliases over @cloudillo/core/base64, which is the chunk-safe implementation
// (spreading the whole array into String.fromCharCode throws on large inputs).
export function arrayBufferToBase64(buffer: Uint8Array): string {
	return bytesToBase64(buffer)
}

// Call a JSON POST API endpoint with fetch()
export type FetchResultError = {
	error: {
		code: string
		descr: string
	}
}

/**
 * Whether an error is the server refusing the request on authorization grounds. The API client
 * deliberately never auto-recovers a 403 (unlike a 401), so these surface raw at the call site and
 * each caller must decide how to present them.
 */
export function isPermissionError(err: unknown): boolean {
	return err instanceof FetchError && err.httpStatus === 403
}

/**
 * Whether the server declined to produce a resource at all. On READ paths this is
 * indistinguishable from a refusal — several endpoints hide a resource rather than 403 on it — so
 * a reader UI should present it as "you may not see this", not as a retryable failure.
 * NOT for write paths, where a 404 can genuinely mean the row is gone.
 */
export function isMissingError(err: unknown): boolean {
	return err instanceof FetchError && err.httpStatus === 404
}

/**
 * Coerce an HTML input's value for the typed-settings backend.
 * - checkbox -> boolean
 * - number input, or a setting whose current value is a number -> JS number
 * - empty / non-finite numeric input -> undefined (caller should skip the write)
 * - everything else -> string
 */
export function coerceSettingValue(
	target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
	oldValue: unknown
): boolean | number | string | undefined {
	const { type } = target
	if (type === 'checkbox') return (target as HTMLInputElement).checked
	if (type === 'number' || typeof oldValue === 'number') {
		if (target.value === '') return undefined
		const n = Number(target.value)
		return Number.isFinite(n) ? n : undefined
	}
	return target.value
}

// useAppConfig() //
////////////////////

/**
 * How far a microfrontend app is trusted — 'trusted' (first-party), 'semi-trusted'
 * (verified third-party), 'untrusted' (everything else).
 *
 * A **presentation and policy** label only: it becomes the visible trust badge and a CSS
 * class on the frame (`<AppFrame trust={…}>`, `shell/src/ui/AppFrame.tsx`). It does **not**
 * reach the sandbox. Every level gets the same `APP_SANDBOX` from
 * `libs/core/src/iframe-sandbox.ts`, which never grants `allow-same-origin` — see that
 * file for why.
 */
export type TrustLevel = 'trusted' | 'semi-trusted' | 'untrusted'

/** Booleans are the legacy spelling of trusted/untrusted; a TrustLevel passes through. */
export function normalizeTrust(trust: TrustLevel | boolean | undefined): TrustLevel {
	if (trust === true) return 'trusted'
	if (trust === false || trust === undefined) return 'untrusted'
	return trust
}

export interface AppConfig {
	id: string
	url: string
	trust?: TrustLevel | boolean // boolean for backwards compatibility
}

export interface MenuItem {
	id: string
	icon?: React.ComponentType
	label: string
	trans?: Record<string, string>
	/**
	 * A context-RELATIVE template (`app/files`, `settings`): `scopePath(ctx.base, path)`
	 * turns it into a real route. An absolute one passes through unscoped — that is how
	 * `site-admin` stays pinned to home and the guest-document item carries a whole route.
	 */
	path: string
	public?: boolean
	perm?: string
}

export interface AppConfigState {
	apps: AppConfig[]
	mime: Record<string, string>
	menu: MenuItem[]
	defaultMenu?: string
}

const appConfigAtom = atom<AppConfigState | undefined>(undefined)

export function useAppConfig() {
	return useAtom(appConfigAtom)
}

// vim: ts=4
