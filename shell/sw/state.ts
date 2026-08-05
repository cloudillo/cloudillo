// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The worker's mutable cross-subsystem state.
 *
 * These four values are written from `onMessage` and read from the fetch
 * pipeline, the blob cache and the download handler — i.e. across module
 * boundaries. ES module live bindings support cross-module *reads* but not
 * writes, so each one is exposed as an accessor pair rather than as an exported
 * `let`. Nothing else belongs here: state owned by a single subsystem stays in
 * that subsystem's module.
 */

/** The tenant this worker belongs to; resolved lazily from `/.well-known`. */
let idTag: string | undefined

/** The page's session token. Absent after an SW restart until the page pushes one. */
let authToken: string | undefined

/** Encryption key relayed over postMessage — the Firefox/Safari path, where the
 *  worker has no Cookie Store API and cannot read the `swKey` cookie itself. */
let cachedKeyString: string | null = null

/** The imported AES key, dropped whenever the key material changes. */
let cryptoKey: CryptoKey | null = null

export function getIdTag(): string | undefined {
	return idTag
}

export function setIdTag(value: string | undefined): void {
	idTag = value
}

export function getAuthToken(): string | undefined {
	return authToken
}

export function setAuthToken(value: string | undefined): void {
	authToken = value
}

export function getCachedKey(): string | null {
	return cachedKeyString
}

export function setCachedKey(value: string | null): void {
	cachedKeyString = value
}

export function getCryptoKey(): CryptoKey | null {
	return cryptoKey
}

export function setCryptoKey(value: CryptoKey | null): void {
	cryptoKey = value
}

/** Force the next `initCryptoKey()` to re-import from the current key material. */
export function invalidateCryptoKey(): void {
	cryptoKey = null
}

// vim: ts=4
