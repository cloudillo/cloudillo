// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import dayjs from 'dayjs'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	type ApiClient,
	FetchError,
	type CalendarObjectInput,
	type CalendarObjectOutput
} from '@cloudillo/core'
import { useToast } from '@cloudillo/react'

import type { RecurringScope } from '../components/RecurringEditScopeDialog.js'
import type { EventOccurrence, SelectedObjectRef } from '../types.js'
import { toRfc5545Utc } from '../utils.js'
import type { UseEventRangeResult } from './useEventRange.js'

/** Scope-prompt state. Set when the user triggers save/delete/drag on a recurring
 *  occurrence; cleared when they choose a scope or cancel. The stored payload lets
 *  us resume the original action once the scope is known. */
export type ScopePrompt =
	| {
			kind: 'save'
			occurrenceStart: string
			calId: number
			uid: string
			data: CalendarObjectInput
	  }
	| {
			kind: 'delete'
			occurrenceStart: string
			calId: number
			uid: string
	  }
	| {
			kind: 'dragresize'
			occurrenceStart: string
			calId: number
			uid: string
			occId: string
			patch: { start: string; end: string; allDay: boolean }
			previous: { start: string; end: string; allDay: boolean }
	  }

interface UseRecurringScopeOpsArgs {
	api: ApiClient | null
	events: UseEventRangeResult
	selectedRef: SelectedObjectRef | null
	setSelectedRef: (ref: SelectedObjectRef | null) => void
	setDetailObject: (obj: CalendarObjectOutput | undefined) => void
}

export interface UseRecurringScopeOpsResult {
	scopePrompt: ScopePrompt | null
	openPrompt: (prompt: ScopePrompt) => void
	handleScopeChoose: (scope: RecurringScope) => Promise<void>
	handleScopeCancel: () => void
	/** Commit a drag or resize. Non-recurring events go through a single PATCH;
	 *  recurring events apply the optimistic UI change, dispatch via
	 *  `dragWithScope`, and revert on failure. */
	handleEventUpdate: (
		occ: EventOccurrence,
		patch: { start: string; end: string; allDay: boolean; scope?: RecurringScope }
	) => Promise<void>
}

/** Trim a master RRULE so it stops just before the given occurrence. Preserves the
 *  original rule's BYDAY/BYMONTHDAY/etc., but swaps COUNT/UNTIL for an UNTIL that
 *  lands at the last occurrence before `splitStart`. */
function truncateRruleBefore(rrule: string, allDay: boolean, splitStart: string): string {
	const parts = rrule
		.split(';')
		.map((p) => p.trim())
		.filter((p) => p.length > 0 && !/^(COUNT|UNTIL)=/i.test(p))
	// UNTIL is exclusive by RFC 5545; subtract 1 second so the last-before-split
	// occurrence (if any) is still included.
	const until = dayjs(splitStart).subtract(1, 'second')
	parts.push(`UNTIL=${toRfc5545Utc(until, allDay)}`)
	return parts.join(';')
}

/** True when the anchored slot IS the master's first occurrence — i.e. the
 *  drag/edit targets the series anchor, not a later expansion. In that case
 *  the override row produced by the `'occurrence'` code path would have its
 *  `RECURRENCE-ID` equal to the master's own `DTSTART`, which is semantically
 *  redundant: patching the master achieves the same visible result with one
 *  API call and no extra row. Compared with 1-second tolerance because
 *  ISO round-trips between server (`Z` form) and `Date.toISOString()`
 *  (`.000Z` form) can differ by sub-millisecond noise. */
function isMasterAnchor(occurrenceStart: string, master: { dtstart?: string }): boolean {
	if (!master.dtstart) return false
	const a = dayjs(occurrenceStart)
	const b = dayjs(master.dtstart)
	if (!a.isValid() || !b.isValid()) return false
	return Math.abs(a.valueOf() - b.valueOf()) < 1000
}

/** Rebase `dtstart` to `anchor`'s calendar date, preserving the time-of-day. Used
 *  on "all events" saves: the editor was seeded with the clicked occurrence's date,
 *  but the series should still start on the master's original first-occurrence date. */
function rebaseDtstart(dtstart: string, anchor: string, allDay: boolean): string {
	const a = dayjs(anchor)
	if (!a.isValid()) return dtstart
	if (allDay) return a.format('YYYY-MM-DD')
	const user = dayjs(dtstart)
	if (!user.isValid()) return dtstart
	// Anchor the UTC date + the user's UTC time-of-day, matching the legacy
	// behaviour where both sides were compared/written in UTC.
	return a
		.utc()
		.hour(user.utc().hour())
		.minute(user.utc().minute())
		.second(user.utc().second())
		.millisecond(0)
		.toISOString()
}

export function useRecurringScopeOps({
	api,
	events,
	selectedRef,
	setSelectedRef,
	setDetailObject
}: UseRecurringScopeOpsArgs): UseRecurringScopeOpsResult {
	const { t } = useTranslation()
	const toast = useToast()

	const [scopePrompt, setScopePrompt] = React.useState<ScopePrompt | null>(null)

	/** Treat only an HTTP 404 as "no override exists"; rethrow anything else so
	 *  network / 5xx / auth failures don't silently degrade to replaceObject and
	 *  potentially stomp on data. */
	const getExceptionOrNull = React.useCallback(
		async (calId: number, uid: string, rid: string): Promise<CalendarObjectOutput | null> => {
			if (!api) throw new Error(t('Not connected'))
			try {
				return await api.calendars.getException(calId, uid, rid)
			} catch (err) {
				if (err instanceof FetchError && err.httpStatus === 404) return null
				throw err
			}
		},
		[api, t]
	)

	const saveWithScope = React.useCallback(
		async (scope: RecurringScope, prompt: ScopePrompt & { kind: 'save' }) => {
			if (!api) throw new Error(t('Not connected'))
			const { calId, uid, occurrenceStart, data } = prompt

			// First-slot short-circuit: editing the master's anchor occurrence with
			// "this only" or "this and following" scope collapses to a simple
			// replaceObject on the master — same visible result, one row. Skip only
			// if an override already exists at the slot.
			if (scope === 'occurrence' || scope === 'following') {
				const master = await api.calendars.getObject(calId, uid)
				if (isMasterAnchor(occurrenceStart, master)) {
					const existing = await getExceptionOrNull(calId, uid, occurrenceStart)
					if (!existing) {
						const updated = await api.calendars.replaceObject(calId, uid, data)
						setDetailObject(updated)
						toast.success(t('Event updated'))
						return
					}
				}
			}

			if (scope === 'series') {
				// Editor was seeded with the occurrence's date, not the master's. For
				// "all events in the series" we only want to carry the user's edits
				// forward — the series anchor should stay on the master's original date.
				// dtend rebases against master.dtend so multi-day spans (all-day or timed)
				// keep their original duration instead of collapsing onto dtstart's date.
				const master = await api.calendars.getObject(calId, uid)
				const dtendAnchor = master.dtend ?? master.dtstart
				const rebased: CalendarObjectInput = data.event
					? {
							...data,
							event: {
								...data.event,
								dtstart:
									data.event.dtstart && master.dtstart
										? rebaseDtstart(
												data.event.dtstart,
												master.dtstart,
												data.event.allDay ?? false
											)
										: data.event.dtstart,
								dtend:
									data.event.dtend && dtendAnchor
										? rebaseDtstart(
												data.event.dtend,
												dtendAnchor,
												data.event.allDay ?? false
											)
										: data.event.dtend
							}
						}
					: data
				const updated = await api.calendars.replaceObject(calId, uid, rebased)
				setDetailObject(updated)
			} else if (scope === 'occurrence') {
				const eventWithRid = data.event
					? { ...data.event, dtstart: data.event.dtstart ?? occurrenceStart }
					: undefined
				const updated = await api.calendars.createException(calId, uid, occurrenceStart, {
					...data,
					recurrenceId: occurrenceStart,
					event: eventWithRid
				})
				setDetailObject(updated)
			} else {
				// "This and following": fork via the atomic /split endpoint. Backend
				// patches the master, drops post-split overrides, and inserts the tail
				// in one transaction — no half-split states to recover from.
				const master = await api.calendars.getObject(calId, uid)
				const truncated = master.rrule
					? truncateRruleBefore(master.rrule, master.allDay ?? false, occurrenceStart)
					: undefined
				const resp = await api.calendars.splitSeries(calId, uid, {
					splitAt: occurrenceStart,
					masterPatch: truncated ? { event: { rrule: truncated } } : undefined,
					tail: data
				})
				setSelectedRef({ calId: resp.tail.calId, uid: resp.tail.uid })
			}
			toast.success(t('Event updated'))
		},
		[api, getExceptionOrNull, setDetailObject, setSelectedRef, t, toast]
	)

	const deleteWithScope = React.useCallback(
		async (scope: RecurringScope, prompt: ScopePrompt & { kind: 'delete' }) => {
			if (!api) throw new Error(t('Not connected'))
			const { calId, uid, occurrenceStart } = prompt
			if (scope === 'series') {
				await api.calendars.deleteObject(calId, uid)
				setSelectedRef(null)
				setDetailObject(undefined)
			} else if (scope === 'occurrence') {
				const master = await api.calendars.getObject(calId, uid)
				const existing = master.exdate ?? []
				// Compare by timestamp — the server may round-trip ISO strings with
				// slightly different shape (ms precision, Z vs +00:00) so a raw
				// `.includes()` can miss an existing entry and duplicate it.
				const target = dayjs(occurrenceStart)
				const alreadyExcluded =
					target.isValid() &&
					existing.some((e) => dayjs(e).valueOf() === target.valueOf())
				const nextExdate = alreadyExcluded ? existing : [...existing, occurrenceStart]
				await api.calendars.patchObject(calId, uid, {
					event: { exdate: nextExdate }
				})
				// Also drop any override for this occurrence, since EXDATE excludes it entirely.
				try {
					await api.calendars.deleteException(calId, uid, occurrenceStart)
				} catch (err) {
					// 404 just means no override existed for this slot. Anything else
					// (auth, 5xx, network) must surface so the user sees the half-applied
					// delete instead of silently trusting EXDATE to have done both jobs.
					if (!(err instanceof FetchError && err.httpStatus === 404)) throw err
				}
			} else {
				// "This and following": truncate master + drop on/after overrides.
				const master = await api.calendars.getObject(calId, uid)
				if (master.rrule) {
					const truncated = truncateRruleBefore(
						master.rrule,
						master.allDay ?? false,
						occurrenceStart
					)
					await api.calendars.patchObject(calId, uid, {
						event: { rrule: truncated }
					})
				}
				const overrides = await api.calendars.listExceptions(calId, uid)
				const splitMs = dayjs(occurrenceStart).valueOf()
				for (const ov of overrides) {
					if (ov.recurrenceId && dayjs(ov.recurrenceId).valueOf() >= splitMs) {
						await api.calendars.deleteException(calId, uid, ov.recurrenceId)
					}
				}
			}
			toast.success(t('Deleted'))
		},
		[api, setDetailObject, setSelectedRef, t, toast]
	)

	const dragWithScope = React.useCallback(
		async (scope: RecurringScope, prompt: ScopePrompt & { kind: 'dragresize' }) => {
			if (!api) throw new Error(t('Not connected'))
			const { calId, uid, occurrenceStart, patch } = prompt

			// First-slot short-circuit: dragging the master's anchor occurrence means
			// re-anchoring the series — a single PATCH on the master is enough, and
			// the row stays master-only. Only skip the optimisation if someone else
			// already stored an override at that slot (imported from another client,
			// say), so we don't stomp on their edit.
			if (scope === 'occurrence' || scope === 'following') {
				const master = await api.calendars.getObject(calId, uid)
				if (isMasterAnchor(occurrenceStart, master)) {
					const existing = await getExceptionOrNull(calId, uid, occurrenceStart)
					if (!existing) {
						const updated = await api.calendars.patchObject(calId, uid, {
							event: {
								dtstart: patch.start,
								dtend: patch.end,
								allDay: patch.allDay
							}
						})
						if (selectedRef?.uid === updated.uid) setDetailObject(updated)
						toast.success(t('Event updated'))
						return
					}
				}
			}

			if (scope === 'series') {
				const updated = await api.calendars.patchObject(calId, uid, {
					event: { dtstart: patch.start, dtend: patch.end, allDay: patch.allDay }
				})
				if (selectedRef?.uid === updated.uid) setDetailObject(updated)
			} else if (scope === 'occurrence') {
				await api.calendars.createException(calId, uid, occurrenceStart, {
					recurrenceId: occurrenceStart,
					event: {
						dtstart: patch.start,
						dtend: patch.end,
						allDay: patch.allDay
					}
				})
			} else {
				// Scope === 'following': fork via the atomic /split endpoint. The tail
				// inherits the master's fields with the dragged start/end applied; the
				// master's RRULE is truncated to stop just before the split point.
				const master = await api.calendars.getObject(calId, uid)
				const truncated = master.rrule
					? truncateRruleBefore(master.rrule, master.allDay ?? false, occurrenceStart)
					: undefined
				await api.calendars.splitSeries(calId, uid, {
					splitAt: occurrenceStart,
					masterPatch: truncated ? { event: { rrule: truncated } } : undefined,
					tail: {
						event: {
							summary: master.summary,
							description: master.description,
							location: master.location,
							dtstart: patch.start,
							dtend: patch.end,
							allDay: patch.allDay,
							rrule: master.rrule,
							status: master.status,
							organizer: master.organizer
						}
					}
				})
			}
			toast.success(t('Event updated'))
		},
		[api, getExceptionOrNull, selectedRef, setDetailObject, t, toast]
	)

	const handleScopeChoose = React.useCallback(
		async (scope: RecurringScope) => {
			const current = scopePrompt
			if (!current) return
			setScopePrompt(null)
			try {
				if (current.kind === 'save') await saveWithScope(scope, current)
				else if (current.kind === 'delete') await deleteWithScope(scope, current)
				else await dragWithScope(scope, current)
				events.refresh()
			} catch (err) {
				toast.error(err instanceof Error ? err.message : t('Update failed'))
				events.refresh()
			}
		},
		[scopePrompt, saveWithScope, deleteWithScope, dragWithScope, events, t, toast]
	)

	const handleScopeCancel = React.useCallback(() => {
		const current = scopePrompt
		setScopePrompt(null)
		if (current?.kind === 'dragresize') {
			// Revert optimistic UI update.
			events.updateOccurrence(current.occId, current.previous)
		}
	}, [scopePrompt, events])

	/** Persist a drag or resize via PATCH — only the changed fields go over
	 *  the wire, so we avoid the full-body GET that a PUT would require. On
	 *  success we splice the server's authoritative values into the grid's
	 *  occurrences in place; on failure we fall back to a list refresh. */
	const handleEventUpdate = React.useCallback(
		async (
			occ: EventOccurrence,
			patch: { start: string; end: string; allDay: boolean; scope?: RecurringScope }
		) => {
			if (!api) return
			const previous = { start: occ.start, end: occ.end, allDay: occ.allDay }
			// Recurring: keep the grid optimistic, then dispatch per the scope hint
			// the grid picked from the pointerup modifier keys. No dialog — the user
			// chose the scope when they dragged.
			if (occ.recurring && patch.scope) {
				events.updateOccurrence(occ.id, patch)
				// Use the RECURRENCE-ID as anchor — the stable key the override lives
				// under. `occ.start` has already been overlaid with a prior override's
				// time, so it wouldn't match any RECURRENCE-ID row.
				const anchor = occ.recurrenceId ?? occ.start
				try {
					await dragWithScope(patch.scope, {
						kind: 'dragresize',
						occurrenceStart: anchor,
						calId: occ.calId,
						uid: occ.uid,
						occId: occ.id,
						patch: { start: patch.start, end: patch.end, allDay: patch.allDay },
						previous
					})
					// Override row was just created/updated — refresh so the expansion
					// overlays it (including the "modified" badge).
					events.refresh()
					// If the user had this occurrence selected, force a detail-pane
					// reload so the "modified" notice + Reset button appear without
					// needing a re-click. A fresh object reference re-triggers the
					// loadSelected effect.
					if (selectedRef?.uid === occ.uid) {
						// We just created/updated an override for this occurrence,
						// so the details pane should fetch it on the next render.
						setSelectedRef({
							calId: occ.calId,
							uid: occ.uid,
							occurrenceStart: anchor,
							hasOverride: true
						})
					}
				} catch (err) {
					toast.error(err instanceof Error ? err.message : t('Update failed'))
					// refresh() restores authoritative server state, so there's no need
					// to also apply the local `previous` revert — it would just cause
					// an extra render before refresh overwrites it.
					events.refresh()
				}
				return
			}
			try {
				const updated = await api.calendars.patchObject(occ.calId, occ.uid, {
					event: {
						dtstart: patch.start,
						dtend: patch.end,
						allDay: patch.allDay
					}
				})
				events.updateOccurrence(occ.id, {
					start: updated.dtstart ?? patch.start,
					end: updated.dtend ?? patch.end,
					allDay: updated.allDay ?? patch.allDay
				})
				if (selectedRef?.uid === updated.uid) setDetailObject(updated)
				toast.success(t('Event updated'))
			} catch (err) {
				toast.error(err instanceof Error ? err.message : t('Update failed'))
				events.refresh()
			}
		},
		[api, events, dragWithScope, selectedRef, setDetailObject, setSelectedRef, t, toast]
	)

	const openPrompt = React.useCallback((prompt: ScopePrompt) => {
		setScopePrompt(prompt)
	}, [])

	return {
		scopePrompt,
		openPrompt,
		handleScopeChoose,
		handleScopeCancel,
		handleEventUpdate
	}
}
