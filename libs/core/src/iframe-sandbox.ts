// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The default iframe sandbox attribute value, for every app whose trust level (`appTrust()` in
 * the shell) is not 'trusted'. It never has 'allow-same-origin': the opaque origin it forces
 * is what stands between an untrusted app and the API origin its bundle is served from.
 *
 * `allow-popups` lets apps open external links; `allow-popups-to-escape-sandbox` makes those
 * popups normal windows instead of sandbox inheritors, as users expect from an external link.
 * An escaped popup (or a top-level visit) of the app's own HTML stays opaque all the same: the
 * backend serves untrusted installed-app files with `Content-Security-Policy: sandbox <these
 * tokens>` (`cloudillo-rs`, `crates/cloudillo-file/src/apkg.rs`). Keep the two lists identical.
 */
export const APP_SANDBOX =
	'allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox'

/**
 * Sandbox for apps whose trust level is 'trusted' (bundled or third-party): `APP_SANDBOX` plus
 * 'allow-same-origin', so the app shares the API origin `https://cl-o.<idTag>` its bundle is
 * served from (module Workers from URLs, `WebAssembly.instantiateStreaming`, IndexedDB).
 * The iframe stays cross-origin to the shell, so it cannot lift its own sandbox.
 *
 * Trusted apps share that origin's storage with each other: every localStorage key, IndexedDB
 * database name and cache name a trusted app uses MUST be prefixed with its app id.
 *
 * Trust is decided only by the shell (`appTrust()`) — never by an app or a host. Only trusted
 * apps can work offline (service worker), which needs this real origin.
 *
 * This origin holds only as long as the API host never serves active user content (SVG, HTML)
 * without `Content-Security-Policy: sandbox` (cloudillo-rs `cloudillo-file` `handler.rs`, `apkg.rs`).
 */
export const APP_SANDBOX_TRUSTED = `${APP_SANDBOX} allow-same-origin`

/** The sandbox value for an app the shell has (or has not) marked trusted */
export function appSandbox(trusted: boolean): string {
	return trusted ? APP_SANDBOX_TRUSTED : APP_SANDBOX
}

// vim: ts=4
