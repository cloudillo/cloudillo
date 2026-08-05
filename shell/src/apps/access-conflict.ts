// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Classifying the outcome of a cross-context access conflict.
 *
 * When an app iframe 401/403s on a file it reached through another context,
 * the shell re-runs `files.refresh` and asks this module what actually
 * happened, so `ExternalApp` can pick the right user-facing response.
 */

import type { ApiClient, FileView } from '@cloudillo/core'

import { toAppAccess } from './files/utils.js'

/**
 * Result of attempting to reconcile an access conflict on a cross-context
 * file via files.refresh. Drives the user-facing handler in ExternalApp.
 */
export type AccessConflict =
	/** Source tombstoned the file (revoked/deleted/unreachable). Show a
	 * reason-specific toast and navigate back to the files list. */
	| { kind: 'broken'; file: FileView }
	/** Refresh returned a lower access level than the user requested.
	 * Prompt to open in read-only; on confirm, re-mount at `granted`. */
	| {
			kind: 'downgraded'
			file: FileView
			requested: 'write' | 'comment'
			granted: 'read' | 'comment'
	  }
	/** files.refresh returned 400 — the file is local-owned, so cross-context
	 * reconciliation doesn't apply. Treat as a plain auth failure. */
	| { kind: 'unsupported' }
	/** Refresh succeeded but reported the same-or-higher access the user
	 * already requested — the original 401/403 is a real auth failure
	 * (token-endpoint issue), not a permissions change. */
	| { kind: 'unchanged' }
	/** Refresh itself threw (network error, etc). */
	| { kind: 'error'; err: unknown }

// In-flight refresh promises keyed by fileId — de-dups concurrent triggers
// (rapid double-click, simultaneous initial-fetch + first-renewal failure).
const inFlightRefreshes = new Map<string, Promise<FileView>>()

export function refreshFileDeduped(api: ApiClient, fileId: string): Promise<FileView> {
	const existing = inFlightRefreshes.get(fileId)
	if (existing) return existing
	const p = api.files.refresh(fileId).finally(() => {
		inFlightRefreshes.delete(fileId)
	})
	inFlightRefreshes.set(fileId, p)
	return p
}

export function suffixToAccess(suffix: 'R' | 'C' | 'W'): 'read' | 'comment' | 'write' {
	return suffix === 'R' ? 'read' : suffix === 'C' ? 'comment' : 'write'
}

export function classifyOutcome(file: FileView, requestedSuffix: 'R' | 'C' | 'W'): AccessConflict {
	// Tombstoned by the source server — broken, regardless of accessLevel.
	if (file.brokenAt) return { kind: 'broken', file }
	const requested = suffixToAccess(requestedSuffix)
	// `toAppAccess` collapses the level to the 3 values an app can hold: 'admin' ranks as
	// 'write', and both 'none' and a missing level fall back to 'read'. The backend's refresh
	// sometimes omits accessLevel even when access remains (the row would have been tombstoned
	// otherwise), so that reads as a downgrade rather than a phantom "broken".
	const granted: 'read' | 'comment' | 'write' = toAppAccess(file.accessLevel)
	const rank = { read: 1, comment: 2, write: 3 } as const
	if (rank[granted] < rank[requested]) {
		// The comparison implies requested ≠ 'read' (nothing outranks 1) and
		// granted ≠ 'write' (nothing is outranked by 3); the casts state that
		// for TS.
		return {
			kind: 'downgraded',
			file,
			requested: requested as 'write' | 'comment',
			granted: granted as 'read' | 'comment'
		}
	}
	// Same or higher access — real auth failure (token endpoint should have succeeded).
	return { kind: 'unchanged' }
}
// vim: ts=4
