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

// ── BlockNote inline content types (stored as-is) ──

export interface StyledText {
	type: 'text'
	text: string
	styles: {
		bold?: boolean
		italic?: boolean
		underline?: boolean
		strikethrough?: boolean
		code?: boolean
		textColor?: string
		backgroundColor?: string
	}
}

export interface Link {
	type: 'link'
	href: string
	content: StyledText[]
}

export interface WikiLinkContent {
	type: 'wikiLink'
	props: { pageId: string; pageTitle: string }
}

export interface TagContent {
	type: 'tag'
	props: { tag: string }
}

export type InlineContent = StyledText | Link | WikiLinkContent | TagContent

// ── Stored types (compact, for RTDB wire/storage) ──

export interface StoredPageRecord {
	ti: string // title
	ic?: string // icon
	ci?: string // coverImage
	pp?: string // parentPageId ('__root__' = root, pageId = child, absent = orphan)
	hc?: boolean // hasChildren (true = has child pages)
	ae?: boolean // autoExpand on load
	o: number // order
	ca: string // createdAt
	ua: string // updatedAt
	cb: string // createdBy
	tg?: string[] // tags (sorted, deduplicated)
}

export interface StoredBlockRecord {
	p: string // pageId
	t: string // type
	pr?: Record<string, any> // props
	c?: InlineContent[] // content
	pb?: string | null // parentBlockId (null = root)
	o: number // order
	ua: string // updatedAt
	ub: string // updatedBy
}

// ── App types (readable, for application code) ──

export interface PageRecord {
	title: string
	icon?: string
	coverImage?: string
	parentPageId?: string // '__root__' = root, pageId = child, absent = orphan
	hasChildren?: boolean
	autoExpand?: boolean
	order: number
	createdAt: string
	updatedAt: string
	createdBy: string
	tags?: string[]
}

export interface BlockRecord {
	pageId: string
	type: string
	props?: Record<string, any>
	content?: InlineContent[]
	parentBlockId?: string | null // null = root, undefined = not specified
	order: number
	updatedAt: string
	updatedBy: string
}

// ── Settings (singleton document) ──

export interface Settings {
	title: string
	defaultPage?: string
	theme?: string
}

// vim: ts=4
