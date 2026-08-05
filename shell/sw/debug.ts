// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The worker's sanctioned logger.
 *
 * `DEBUG` must stay a top-level `const` and `debug` a top-level `function`
 * declaration: esbuild defines `process.env.NODE_ENV` for the SW bundle, so
 * this folds to a constant and tree-shaking drops every `debug()` call from
 * production builds. Anything else (a `let`, an arrow assigned to a binding)
 * defeats that.
 *
 * The worker's logging rule applies here and in every module that imports this:
 * never log a parsed response body, and never log any value derived from an
 * `Authorization` header, a token, an API key or the encryption key.
 */

export const DEBUG = process.env.NODE_ENV !== 'production'

export function debug(...args: unknown[]): void {
	// biome-ignore lint/suspicious/noConsole: the one sanctioned console.log in the SW
	if (DEBUG) console.log('[SW]', ...args)
}

// vim: ts=4
