// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Which bundle directory serves a content type.
 *
 * Pure and React-free, in the spirit of `shell/src/routes.ts`, so both the shell's own
 * embed hook (`shell/src/shell-embed.ts`) and the app-facing `embed:open.req` handler
 * (`shell/src/message-bus/handlers/embed.ts`) can share it — importing the former from
 * the latter would close a cycle through `message-bus/shell-bus.ts`.
 */

/** A bundle directory name, and nothing that could be read as a path. */
const APP_NAME_RE = /^[a-z0-9][a-z0-9-]*$/

/** The bundle that renders anything without an app of its own. */
const GENERIC_VIEWER = 'view'

/**
 * Which bundle serves a content type. `cloudillo/quillo` → `quillo`, anything
 * else → the generic viewer.
 *
 * The suffix is **validated, not just sliced.** A published page's `documentEmbed`
 * island carries its `contentType` in author-controlled `data-props`, and the
 * result of this call is both interpolated into the iframe's `/apps/<name>/index.html` src
 * and recorded as the `appName` the shell's handlers treat as attested. Without
 * the check, a stored `cloudillo/../../api/files/...` would frame an arbitrary
 * path on the API origin serving the bundle. Anything unrecognised falls back to the
 * viewer, which is the same answer an unknown app already got.
 */
export function shellEmbedAppName(contentType: string): string {
	if (!contentType.startsWith('cloudillo/')) return GENERIC_VIEWER
	const name = contentType.slice('cloudillo/'.length)
	return APP_NAME_RE.test(name) ? name : GENERIC_VIEWER
}

/**
 * Resolve an app ID from a content type using the manifest MIME mapping
 * (`/app/quillo` → `quillo`).
 */
export function resolveAppId(
	contentType: string,
	mime: Record<string, string>
): string | undefined {
	return mime[contentType]?.match(/^\/app\/(.+)$/)?.[1]
}

// vim: ts=4
