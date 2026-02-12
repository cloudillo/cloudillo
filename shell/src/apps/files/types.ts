// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
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
		name: string
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
	accessLevel?: 'read' | 'write' | 'none'
	visibility?: FileVisibility
}

export interface FileView extends File {
	actions: undefined
}

export interface FileOps {
	setFile?: (file: File) => void
	openFile: (fileId: string, access?: 'read' | 'write') => void
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
}

export interface FileFiltState {
	fileName?: string
	preset?: string
	tags?: string[]
	parentId?: string | null
}

export type ViewMode = 'all' | 'live' | 'static' | 'recent' | 'trash' | 'starred' | 'pinned'

export const TRASH_FOLDER_ID = '__trash__'

// vim: ts=4
