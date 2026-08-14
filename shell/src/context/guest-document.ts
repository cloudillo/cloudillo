// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { atom, useAtom } from 'jotai'

import { matchAppRoute } from '../routes.js'

export type GuestFileType = 'BLOB' | 'CRDT' | 'RTDB' | 'FLDR'

export interface GuestDocumentInfo {
	fileName: string
	contentType: string
	fileId: string
	appId: string
	resId: string // Format: "idTag:fileId"
	token: string
	accessLevel: 'read' | 'comment' | 'write'
	ownerIdTag: string
	guestName?: string // Guest display name for awareness
	refId?: string // Original share ref, for returning to /s/:refId (static shares)
	fileTp?: GuestFileType // 'BLOB' | 'CRDT' | 'RTDB' | 'FLDR' — drives icon + return-path choice
}

export const guestDocumentAtom = atom<GuestDocumentInfo | null>(null)

export function useGuestDocument() {
	return useAtom(guestDocumentAtom)
}

/**
 * True while `pathname` addresses the shared document itself — the `/s/<refId>` view or the
 * app route the menu links back to. Guest mode outlives that route (the token in this atom
 * keeps working elsewhere on the node), so this is a question about the *page*, not the session.
 */
export function isGuestDocumentPath(pathname: string, doc: GuestDocumentInfo | null): boolean {
	if (!doc) return false
	if (doc.refId && pathname === `/s/${doc.refId}`) return true
	// BLOB/FLDR shares carry appId='' and only ever live at /s/.
	if (!doc.appId) return false

	const route = matchAppRoute(pathname)
	if (!route || route.appId !== doc.appId || !route.resId) return false
	// Both spellings occur: the menu builds the full `/@owner/app/…` form with an
	// `<owner>:<fileId>` resId, other entry points the context-relative bare fileId.
	return route.resId === doc.resId || route.resId === doc.resId.slice(doc.resId.indexOf(':') + 1)
}

// vim: ts=4
