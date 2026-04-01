// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

export interface FileUserData {
	accessedAt?: string
	modifiedAt?: string
	pinned?: boolean
	starred?: boolean
}

// File visibility levels: D=Direct (owner only), P=Public, V=Verified, 2=2nd degree, F=Followers, C=Connected
export type FileVisibility = 'D' | 'P' | 'V' | '2' | 'F' | 'C' | null

export interface File {
	fileId: string
	fileName: string
	owner?: {
		idTag: string
		name?: string
		profilePic?: string
	}
	creator?: {
		idTag: string
		name?: string
		profilePic?: string
	}
	fileTp?: string
	contentType: string
	createdAt: string
	accessedAt?: string // Global access timestamp
	modifiedAt?: string // Global modification timestamp
	userData?: FileUserData // User-specific data (pinned, starred, etc.)
	preset: string
	tags?: string[]
	variantId?: string
	parentId?: string | null
	accessLevel?: 'read' | 'comment' | 'write' | 'none'
	visibility?: FileVisibility
}

export interface FileView extends File {
	actions: undefined
}

export interface FileOps {
	setFile?: (file: File) => void
	openFile: (fileId: string, access?: 'read' | 'comment' | 'write') => void
	openFileWithApp?: (
		fileId: string,
		appId: string,
		access?: 'read' | 'comment' | 'write',
		params?: string
	) => void
	renameFile: (fileId?: string) => void
	setRenameFileName: (name?: string) => void
	doRenameFile: (fileId: string, fileName: string) => void
	doDeleteFile: (fileId: string) => void
	doRestoreFile?: (fileId: string, parentId?: string) => void
	doPermanentDeleteFile?: (fileId: string) => void
	toggleStarred?: (fileId: string) => void
	togglePinned?: (fileId: string) => void
	// Batch operations for multi-select
	doDeleteFiles?: (fileIds: string[]) => void
	doRestoreFiles?: (fileIds: string[], parentId?: string) => void
	doPermanentDeleteFiles?: (fileIds: string[]) => void
	toggleStarredBatch?: (fileIds: string[], starred: boolean) => void
	togglePinnedBatch?: (fileIds: string[], pinned: boolean) => void
	setVisibility?: (fileId: string, visibility: FileVisibility) => void
	doDuplicateFile?: (fileId: string) => void
}

export interface FileFiltState {
	fileName?: string
	preset?: string
	tags?: string[]
	parentId?: string | null
}

export type ViewMode = 'browse' | 'recent' | 'trash' | 'starred'
export type FileTypeFilter = 'all' | 'live' | 'static'
export type OwnerFilter = 'anyone' | 'me' | 'others'

export const TRASH_FOLDER_ID = '__trash__'

// vim: ts=4
