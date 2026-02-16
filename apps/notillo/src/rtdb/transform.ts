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

import type { StoredBlockRecord, BlockRecord, StoredPageRecord, PageRecord } from './types.js'

// ── Block transformers ──

export function fromStoredBlock(stored: StoredBlockRecord): BlockRecord {
	return {
		pageId: stored.p,
		type: stored.t,
		...(stored.pr !== undefined && { props: stored.pr }),
		...(stored.c !== undefined && { content: stored.c }),
		...(stored.pb !== undefined && { parentBlockId: stored.pb }),
		order: stored.o,
		updatedAt: stored.ua,
		updatedBy: stored.ub
	}
}

export function toStoredBlock(block: BlockRecord): StoredBlockRecord {
	return {
		p: block.pageId,
		t: block.type,
		...(block.props !== undefined && { pr: block.props }),
		...(block.content !== undefined && { c: block.content }),
		...(block.parentBlockId !== undefined && { pb: block.parentBlockId }),
		o: block.order,
		ua: block.updatedAt,
		ub: block.updatedBy
	}
}

// ── Page transformers ──

export function fromStoredPage(stored: StoredPageRecord): PageRecord {
	return {
		title: stored.ti,
		...(stored.ic !== undefined && { icon: stored.ic }),
		...(stored.ci !== undefined && { coverImage: stored.ci }),
		...(stored.pp !== undefined && { parentPageId: stored.pp }),
		order: stored.o,
		createdAt: stored.ca,
		updatedAt: stored.ua,
		createdBy: stored.cb
	}
}

export function toStoredPage(page: PageRecord): StoredPageRecord {
	return {
		ti: page.title,
		...(page.icon !== undefined && { ic: page.icon }),
		...(page.coverImage !== undefined && { ci: page.coverImage }),
		...(page.parentPageId !== undefined && { pp: page.parentPageId }),
		o: page.order,
		ca: page.createdAt,
		ua: page.updatedAt,
		cb: page.createdBy
	}
}

// vim: ts=4
