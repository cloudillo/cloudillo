// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Document-title pipeline.
 *
 * The shell shows a live `Context › App › Document` breadcrumb in the header.
 * The document segment comes from this atom. Ownership is simple:
 *
 *  - **Shell (default):** when a file-backed document opens, the shell fetches
 *    its `fileName` via `api.files.list({ fileId })` and writes it here so a
 *    title appears immediately.
 *  - **App (takes over):** if an app pushes a title via the `app:title.push`
 *    message (see `AppMessageBus.setTitle`), it sets `appManaged` and from then
 *    on owns the title — the shell prefetch will not override it. Apps that
 *    don't push a title leave the shell-provided file name in place.
 *
 * The atom is keyed by `resId` so a stale title from a previously open document
 * is ignored once the route changes (list/feed pages clear it).
 */

import { atom } from 'jotai'

export interface DocumentTitleState {
	/** The resId (`<owner>:<fileId>`) the title belongs to. */
	resId?: string
	/** Human-readable document title. */
	title?: string
	/** Whether the document has unsaved changes (shown as a leading `*`). */
	dirty?: boolean
	/** True once an app has pushed a title — the shell stops managing it. */
	appManaged?: boolean
}

export const documentTitleAtom = atom<DocumentTitleState>({})

// vim: ts=4
