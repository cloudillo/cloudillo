// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The key-loss *signal*: the atom the app blocks on, the report latch, and the
 * entry point low-level code calls when it finds no key.
 *
 * Split out of `key-loss.ts` so that the cache and CRDT modules — which are the
 * ones that discover the missing key — do not take a static import edge on the
 * assessment, which imports the cache and the CRDT store right back. This module
 * imports only `jotai` and a type.
 */

import { atom, getDefaultStore, type PrimitiveAtom } from 'jotai'

import type { DirtyDocSummary } from './wipe-local-data.js'

export interface KeyLossState {
	dirtyDocs: DirtyDocSummary[]
}

/** Non-null while unsynced work is at risk. Read by `Layout` to block the app. */
export const keyLossAtom: PrimitiveAtom<KeyLossState | null> = atom<KeyLossState | null>(null)

// An assessment is in flight, or a dialog has already been raised — either way
// there is nothing a second report could add. Released again once an assessment
// comes back clean, so a key evicted later in the session is still caught.
let reported = false

export function setKeyLossReported(value: boolean): void {
	reported = value
}

/** Raise the key-loss dialog once the assessment confirms something is at risk. */
export function publishKeyLoss(state: KeyLossState): void {
	getDefaultStore().set(keyLossAtom, state)
}

/**
 * Mid-session key loss: the cookie was evicted while the app was running.
 * Called from `cache/crypto.ts` the first time `initCryptoKey()` finds no
 * cookie. Only raises the dialog — recovery is left to the next boot, because
 * deleting IndexedDB out from under a live session would block on the
 * connections the app still holds open.
 */
export function reportKeyUnavailable(): void {
	if (reported) return
	reported = true
	// Dynamic so the low-level cache/CRDT modules that call this do not take a
	// static edge on the assessment (which imports the cache and the CRDT store
	// right back). The shell bundle is code-split, so this resolves from an
	// already-loaded chunk in practice.
	void import('./key-loss.js').then((m) => m.handleKeyUnavailable())
}

// vim: ts=4
