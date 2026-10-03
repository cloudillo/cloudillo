// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Which hat to wear when entering a community B.
 *
 * B's home-node mirror row carries `hats`: the communities I have entered B through, most
 * recent first, `''` = as myself. A plain entry (pin, search, link, reload) into a community
 * I am a member of is always bare — hats only come from an explicit "Enter via A" or "Change
 * identity", so a reload while hatted re-enters bare. For a non-member, a plain entry reads
 * the list: 0–1 entries are used silently, 2+ open the `HatPicker`. A hat-bearing entry (a
 * partner row on a profile, "Change identity") never asks and moves its hat to the front. A
 * refused hat (403/404) is toasted, dropped from the list, and the next entry — finally bare
 * — is tried.
 *
 * The URL never carries the hat, and `ctx.tsx` stays the only place that activates a
 * context on navigation: a hat-bearing entry to another context parks its hat in
 * `pendingHatEntryAtom` and navigates, and the route effect picks it up.
 */

import { useApi, useToast } from '@cloudillo/react'
import { atom, useSetAtom, useStore } from 'jotai'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { activeContextAtom, communitiesAtom, partnerCommunitiesAtom, refFromActive } from './atoms'
import { hatRefusedText, isRefusal } from './hat-recovery.js'
import { useApiContext, useContextSwitch, useContextSwitchNav } from './hooks'

/**
 * An open `HatPicker`: B, its remembered hats, and where the choice goes — `hat` undefined
 * = dismissed (a plain entry then goes in as yourself), `null` = superseded by another entry
 * (B is not entered), `entries` = the list after any × forgets (already saved by the picker).
 */
export interface HatPickerRequest {
	community: string
	entries: string[]
	resolve: (hat: string | null | undefined, entries: string[]) => void
}

export const hatPickerAtom = atom<HatPickerRequest | undefined>(undefined)

/** The hat a hat-bearing entry asked for, until `ctx.tsx` activates `idTag` from the URL. */
export const pendingHatEntryAtom = atom<{ idTag: string; hat: string } | undefined>(undefined)

/** `entry` first, the rest in order. */
export function toFront(list: string[], entry: string): string[] {
	return [entry, ...list.filter((h) => h !== entry)]
}

/**
 * Activation without navigation — for `ctx.tsx` and the token renewal, which already sit on
 * the right URL. See `useEnterContext` for the navigating entry point.
 */
export function useHatEntry() {
	const { api } = useApi()
	const { setActiveContext } = useApiContext()
	const setPicker = useSetAtom(hatPickerAtom)
	const store = useStore()
	const { error: toastError } = useToast()
	const { t } = useTranslation()

	const readHats = React.useCallback(
		// `undefined` = unknown (no api, or the read failed): entry goes on, but nothing
		// is saved over the remembered list. Not rethrown — ctx.tsx would mark B failed.
		async (idTag: string): Promise<string[] | undefined> => {
			if (!api) return undefined
			try {
				return (await api.profiles.get(idTag))?.hats ?? []
			} catch {
				return undefined
			}
		},
		[api]
	)

	const saveHats = React.useCallback(
		(idTag: string, hats: string[]) => {
			api?.profiles.setHats(idTag, hats).catch((err) => {
				console.error(`[HatEntry] Failed to save hats of ${idTag}:`, err)
			})
		},
		[api]
	)

	const pickHat = React.useCallback(
		(idTag: string, entries: string[]) =>
			new Promise<{ hat: string | null | undefined; entries: string[] }>((resolve) => {
				setPicker({
					community: idTag,
					entries,
					resolve: (hat, entries) => {
						setPicker(undefined)
						resolve({ hat, entries })
					}
				})
			}),
		[setPicker]
	)

	/**
	 * Enters `idTag` with the first hat of `order` it accepts; `''` or an exhausted list
	 * means as yourself. Refused hats leave `list`; the one used moves to its front.
	 * `list` undefined = the remembered list is unknown, so it is never saved.
	 */
	const activate = React.useCallback(
		async (idTag: string, order: string[], list: string[] | undefined) => {
			let hats = list ?? []
			const commit = (used: string) => {
				// A partner's row badges the hat it was last entered with; a hatted entry of a
				// non-member adds the row, so a reload knows the context (`isKnownContext`).
				const active = store.get(activeContextAtom)
				const worn = active?.hat
				store.set(partnerCommunitiesAtom, (prev) => {
					if (prev.some((c) => c.idTag === idTag))
						return prev.map((c) => (c.idTag === idTag ? { ...c, hat: worn } : c))
					if (!used || active?.idTag !== idTag) return prev
					if (store.get(communitiesAtom).some((c) => c.idTag === idTag)) return prev
					return [...prev, { ...refFromActive(active), hat: worn }]
				})
				if (!list) return
				// `['']` alone says nothing a missing list does not.
				const next = used || hats.some(Boolean) ? toFront(hats, used) : []
				if (next.join('\n') !== list.join('\n')) saveHats(idTag, next)
			}
			for (const hat of order) {
				// '' = as yourself: stop trying hats and enter bare below
				if (!hat) break
				try {
					// A newer switch took over: this entry's hat was never used.
					if (await setActiveContext(idTag, { hat })) commit(hat)
					return
				} catch (err) {
					if (!isRefusal(err)) throw err
					const communities = store.get(communitiesAtom)
					const nameOf = (id: string) =>
						communities.find((c) => c.idTag === id)?.name ?? id
					toastError(hatRefusedText(t, nameOf(hat), nameOf(idTag)))
					hats = hats.filter((h) => h !== hat)
				}
			}
			if (await setActiveContext(idTag)) commit('')
		},
		[setActiveContext, saveHats, store, toastError, t]
	)

	/**
	 * `hat` undefined = plain entry: bare for a member, the 0/1/2+ rule otherwise; a string =
	 * hat-bearing, `''` as yourself. Never navigates.
	 */
	const enter = React.useCallback(
		async (idTag: string, hat?: string) => {
			if (hat === undefined && store.get(communitiesAtom).some((c) => c.idTag === idTag))
				hat = ''
			const list = await readHats(idTag)
			const known = list ?? []
			if (hat !== undefined) return activate(idTag, toFront(known, hat), list)
			if (known.length < 2) return activate(idTag, known, list)
			const { hat: chosen, entries } = await pickHat(idTag, known)
			if (chosen === null) return
			return activate(idTag, toFront(entries, chosen ?? ''), entries)
		},
		[readHats, activate, pickHat, store]
	)

	/** Opens the picker regardless of the list's length, then enters with the choice. */
	const changeHat = React.useCallback(
		async (idTag: string) => {
			const list = await readHats(idTag)
			const { hat: chosen, entries } = await pickHat(idTag, list ?? [])
			if (chosen != null) await activate(idTag, toFront(entries, chosen), list && entries)
		},
		[readHats, pickHat, activate]
	)

	/**
	 * The active `(idTag, hat)` was refused mid-session: skip `hat` and fall back to the next
	 * remembered entry, or bare. The caller has already toasted. Nothing is saved — a 403/404
	 * here can't be told apart from a transient refusal, so the hat is skipped for this
	 * session only; a later explicit entry tries it again and forgets it visibly there.
	 */
	const fallback = React.useCallback(
		async (idTag: string, hat: string) => {
			const list = await readHats(idTag)
			await activate(
				idTag,
				(list ?? []).filter((h) => h !== hat),
				undefined
			)
		},
		[readHats, activate]
	)

	return { enter, changeHat, fallback }
}

/** "Enter B via A" — the label every hat-bearing entry control shares. */
export const enterViaLabel = (t: TFunction, community: string, hat: string) =>
	t('Enter {{community}} via {{hat}}', { community, hat })

/**
 * Enter B and go there: `hat` given (`''` = as yourself) wears it without asking, omitted
 * is a plain entry. The one entry point for hat-bearing links. `feed` lands on B's feed
 * instead of keeping the current section.
 */
export function useEnterContext(): (
	idTag: string,
	opts?: { hat?: string; feed?: boolean }
) => Promise<void> {
	const { enter } = useHatEntry()
	const switchNav = useContextSwitchNav()
	const { switchTo } = useContextSwitch()
	const setPending = useSetAtom(pendingHatEntryAtom)
	const store = useStore()

	return React.useCallback(
		async (idTag: string, { hat, feed }: { hat?: string; feed?: boolean } = {}) => {
			if (hat !== undefined) {
				// Same idTag: the URL will not change, so nothing else would activate it.
				if (store.get(activeContextAtom)?.idTag === idTag) await enter(idTag, hat)
				else setPending({ idTag, hat })
			}
			if (feed) await switchTo(idTag)
			else switchNav(idTag)
		},
		[enter, switchNav, switchTo, setPending, store]
	)
}

// vim: ts=4
