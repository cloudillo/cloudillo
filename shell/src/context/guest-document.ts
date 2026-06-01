// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { atom, useAtom } from 'jotai'

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

// vim: ts=4
