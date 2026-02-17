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

import type { RtdbClient } from '@cloudillo/rtdb'
import type { StoredPageRecord } from './types.js'

export interface ConsistencyResult {
	totalPages: number
	rootPages: number
	orphanPages: string[] // page IDs with no pp — not in sidebar
	hcMissing: string[] // parent IDs that need hc: true
	hcStale: string[] // pages with hc: true but no children
	needsFix: boolean
}

export async function checkConsistency(client: RtdbClient): Promise<ConsistencyResult> {
	const snapshot = await client.collection('p').get()

	const allPages = new Map<string, StoredPageRecord>()
	snapshot.forEach((doc) => {
		allPages.set(doc.id, doc.data() as StoredPageRecord)
	})

	// Compute which pages are actually parents (referenced by other pages' pp)
	const actualParents = new Set<string>()
	const orphanPages: string[] = []
	let rootPages = 0

	for (const [id, page] of allPages) {
		if (page.pp === '__root__') {
			rootPages++
		} else if (!page.pp) {
			orphanPages.push(id)
		}

		// Track actual parent references (excluding __root__)
		if (page.pp && page.pp !== '__root__') {
			actualParents.add(page.pp)
		}
	}

	// hcMissing: pages that ARE parents but don't have hc: true
	const hcMissing: string[] = []
	for (const parentId of actualParents) {
		const parent = allPages.get(parentId)
		if (parent && !parent.hc) {
			hcMissing.push(parentId)
		}
	}

	// hcStale: pages with hc: true but no children actually reference them
	const hcStale: string[] = []
	for (const [id, page] of allPages) {
		if (page.hc && !actualParents.has(id)) {
			hcStale.push(id)
		}
	}

	return {
		totalPages: allPages.size,
		rootPages,
		orphanPages,
		hcMissing,
		hcStale,
		needsFix: orphanPages.length > 0 || hcMissing.length > 0 || hcStale.length > 0
	}
}

export async function fixConsistency(client: RtdbClient, result: ConsistencyResult): Promise<void> {
	const batch = client.batch()

	// Fix orphans: set pp to '__root__'
	for (const id of result.orphanPages) {
		batch.update(client.ref(`p/${id}`), { pp: '__root__' })
	}

	// Fix missing hc flags
	for (const id of result.hcMissing) {
		batch.update(client.ref(`p/${id}`), { hc: true })
	}

	// Clear stale hc flags
	for (const id of result.hcStale) {
		batch.update(client.ref(`p/${id}`), { hc: null })
	}

	await batch.commit()
}

// vim: ts=4
