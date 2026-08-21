// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** `attr`, the one output-safety helper `@cloudillo/core` does not carry. The
 *  allowlist itself (`escapeHtml`, `safe*`) is core's — import it from there.
 *  Why it works the way it does: `libs/core/src/site.ts`. */

import { escapeHtml } from '@cloudillo/core'

/** An attribute, or nothing at all when the value did not survive its allowlist. */
export function attr(name: string, value: string | undefined): string {
	return value === undefined ? '' : ` ${name}="${escapeHtml(value)}"`
}

// vim: ts=4
