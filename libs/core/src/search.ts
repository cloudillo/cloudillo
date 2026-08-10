// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `SearchMatch` is a wire type — the server sends the ranges beside the plain-text
 * snippet — so it is defined in `@cloudillo/types` and re-exported here for
 * consumers that reach for it through the SDK.
 */
export type { SearchMatch } from '@cloudillo/types'

// vim: ts=4
