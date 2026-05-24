// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { atom } from 'jotai'

export interface FileHandItem {
	type: 'file'
	id: string // fileId in sourceContext's database
	idTag: string // owner.idTag — canonical host of the content
	sourceContext: string // listing-context idTag the row was picked up from
	sourceParentId?: string | null // parent folder at pick-up time. null = root, undefined = unknown (legacy)
	label: string // last-known fileName
	icon?: string
	fileTp?: string // needed for create call
	contentType?: string
	brokenAt?: string // tombstone state
	inTrash?: boolean // captured at pick-up time when picked from trash view
}

export interface HandState {
	type: 'file' // extensible; v1 only 'file'
	items: FileHandItem[]
	status: 'active' | 'dormant'
}

export const handAtom = atom<HandState | null>(null)

/**
 * Aggregate per-item applicability into a verb display state.
 * Mirrors PRD §5.0 "shown enabled / shown disabled / hidden" rule.
 */
export function aggregateVerbStates(perItem: boolean[]): 'enabled' | 'disabled' | 'hidden' {
	if (perItem.length === 0) return 'hidden'
	const some = perItem.some(Boolean)
	if (!some) return 'hidden'
	const all = perItem.every(Boolean)
	return all ? 'enabled' : 'disabled'
}

export class HandTypeConflictError extends Error {
	constructor(
		public existing: HandState['type'],
		public incoming: HandState['type']
	) {
		super(`Hand type conflict: have ${existing}, asked to add ${incoming}`)
		this.name = 'HandTypeConflictError'
	}
}

/**
 * Helpers operating on the current value of handAtom.
 * Bind to the atom's get/set via a Jotai store (or a useAtom pair in components).
 */
type Get = (a: typeof handAtom) => HandState | null
type Set = (a: typeof handAtom, v: HandState | null) => void

export function pickUp(get: Get, set: Set, items: FileHandItem[]) {
	if (items.length === 0) return
	const cur = get(handAtom)
	if (!cur) {
		set(handAtom, { type: 'file', items, status: 'active' })
		return
	}
	if (cur.status === 'dormant') {
		// silently replace
		set(handAtom, { type: 'file', items, status: 'active' })
		return
	}
	// active + same type → append (dedupe by id+sourceContext)
	if (cur.type === 'file') {
		const seen = new Set(cur.items.map((i) => `${i.sourceContext}:${i.id}`))
		const merged = [...cur.items]
		for (const it of items) {
			const key = `${it.sourceContext}:${it.id}`
			if (!seen.has(key)) {
				merged.push(it)
				seen.add(key)
			}
		}
		set(handAtom, { ...cur, items: merged })
		return
	}
	// active + different type → throw a sentinel error; caller wires a confirm dialog
	// TODO when 2nd HandItem type lands
	throw new HandTypeConflictError(cur.type, 'file')
}

export function drop(get: Get, set: Set, itemId: string, sourceContext: string) {
	const cur = get(handAtom)
	if (!cur) return
	const remaining = cur.items.filter(
		(i) => !(i.id === itemId && i.sourceContext === sourceContext)
	)
	if (remaining.length === 0) {
		set(handAtom, null)
	} else {
		set(handAtom, { ...cur, items: remaining })
	}
}

export function empty(_get: Get, set: Set) {
	set(handAtom, null)
}

export function setDown(get: Get, set: Set) {
	const cur = get(handAtom)
	if (!cur) return
	set(handAtom, { ...cur, status: 'dormant' })
}

export function pickUpAgain(get: Get, set: Set) {
	const cur = get(handAtom)
	if (!cur) return
	set(handAtom, { ...cur, status: 'active' })
}

export function forget(_get: Get, set: Set) {
	set(handAtom, null)
}

// vim: ts=4
