// This file is part of the Cloudillo Platform.
// Copyright (C) 2026  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

// ── Stored types (compact, for RTDB wire/storage) ──

export interface StoredThread {
	sc: string // scope (app-defined region key for filtering)
	an: string // anchor (app-defined location string)
	st: string // status: 'O' = open, 'R' = resolved
	cc: number // commentCount (denormalized)
	tx?: string // textPreview (first comment text, truncated)
	ca: string // createdAt (ISO 8601)
	ua: string // updatedAt (ISO 8601)
	cb: string // createdBy (idTag)
}

export interface StoredComment {
	t: string // threadId
	tx: string // text (markdown)
	ca: string // createdAt (ISO 8601)
	ua?: string // updatedAt (if edited)
	cb: string // createdBy (idTag)
	cn?: string // createdByName (for guests)
	ed?: boolean // edited flag
	dl?: boolean // soft-deleted flag
	si?: string // signatureId (future: action-based verified comments)
}

// ── App types (readable, for application code) ──

export interface CommentThread {
	id: string
	scope: string
	anchor: string
	status: 'open' | 'resolved'
	commentCount: number
	textPreview?: string
	createdAt: string
	updatedAt: string
	createdBy: string
}

export interface Comment {
	id: string
	threadId: string
	text: string
	createdAt: string
	updatedAt?: string
	createdBy: string
	createdByName?: string
	edited?: boolean
	deleted?: boolean
	signatureId?: string
}

// ── Conversion functions ──

export function threadFromStored(id: string, stored: StoredThread): CommentThread {
	return {
		id,
		scope: stored.sc,
		anchor: stored.an,
		status: stored.st === 'R' ? 'resolved' : 'open',
		commentCount: stored.cc,
		textPreview: stored.tx,
		createdAt: stored.ca,
		updatedAt: stored.ua,
		createdBy: stored.cb
	}
}

export function commentFromStored(id: string, stored: StoredComment): Comment {
	return {
		id,
		threadId: stored.t,
		text: stored.dl ? '' : stored.tx,
		createdAt: stored.ca,
		updatedAt: stored.ua,
		createdBy: stored.cb,
		createdByName: stored.cn,
		edited: stored.ed,
		deleted: stored.dl,
		signatureId: stored.si
	}
}

// vim: ts=4
