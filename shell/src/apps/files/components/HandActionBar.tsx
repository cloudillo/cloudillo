// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiClient } from '@cloudillo/core'
import { FetchError } from '@cloudillo/core'
import { Button, Dialog, useAuth, useToast } from '@cloudillo/react'
import { useAtom, useAtomValue, useStore } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuChevronRight as IcChevron,
	LuMessageSquare as IcComment,
	LuHand as IcHand,
	LuFolderInput as IcMove,
	LuPin as IcPin,
	LuShare2 as IcPlace,
	LuEye as IcRead,
	LuRotateCcw as IcRestore,
	LuPencil as IcWrite
} from 'react-icons/lu'

import { activeContextAtom, useApiContext } from '../../../context/index.js'
import { aggregateVerbStates, type FileHandItem, handAtom, setDown } from '../../../state/hand.js'
import {
	flyFromHand,
	handTargetElAtom,
	prefersReducedMotion,
	waveHand
} from '../../../state/hand-fly.js'
import type { ViewMode } from '../types.js'

export interface HandActionBarProps {
	api: ApiClient | null
	currentFolderId: string | null
	currentFolderName?: string
	viewMode: ViewMode
	onRefresh: () => void
}

type AccessLevel = 'read' | 'comment' | 'write'

const LAST_USED_KEY = 'cl.hand.placeAccess'

function readLastUsed(): AccessLevel {
	if (typeof window === 'undefined') return 'read'
	try {
		const v = window.localStorage.getItem(LAST_USED_KEY)
		if (v === 'read' || v === 'comment' || v === 'write') return v
	} catch {
		// ignore
	}
	return 'read'
}

function writeLastUsed(level: AccessLevel) {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.setItem(LAST_USED_KEY, level)
	} catch {
		// ignore
	}
}

export function HandActionBar({
	api,
	currentFolderId,
	currentFolderName,
	viewMode,
	onRefresh
}: HandActionBarProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const [activeContext] = useAtom(activeContextAtom)
	const hand = useAtomValue(handAtom)
	const store = useStore()
	const { getClientFor } = useApiContext()
	const toast = useToast()
	const [placeOpen, setPlaceOpen] = React.useState(false)
	const initialAccess = React.useMemo<AccessLevel>(() => readLastUsed(), [])
	const [lastUsed, setLastUsed] = React.useState<AccessLevel>(initialAccess)
	const [placeAccess, setPlaceAccess] = React.useState<AccessLevel>(initialAccess)

	if (hand?.status !== 'active' || !auth || !activeContext || !api) return null

	const items = hand.items
	const ctxIdTag = activeContext.idTag
	const isOwnContext = ctxIdTag === auth.idTag
	const isBrowse = viewMode === 'browse'

	const canWriteHere =
		ctxIdTag === auth.idTag ||
		activeContext.roles.some((r) => r === 'leader' || r === 'moderator' || r === 'contributor')

	const applies = {
		place: (it: FileHandItem) =>
			isBrowse && it.idTag === auth.idTag && !isOwnContext && canWriteHere && !it.brokenAt,
		pin: (it: FileHandItem) =>
			isBrowse &&
			it.idTag !== auth.idTag &&
			isOwnContext &&
			it.sourceContext !== ctxIdTag &&
			!it.brokenAt,
		move: (it: FileHandItem) => {
			if (!isBrowse || it.sourceContext !== ctxIdTag || !canWriteHere || it.brokenAt)
				return false
			if (it.sourceParentId === undefined) return true
			const src = it.sourceParentId === '__root__' ? null : it.sourceParentId
			const cur = !currentFolderId || currentFolderId === '__root__' ? null : currentFolderId
			return src !== cur
		},
		restore: (it: FileHandItem) => isBrowse && it.inTrash === true && canWriteHere
	}

	const states = {
		place: aggregateVerbStates(items.map(applies.place)),
		pin: aggregateVerbStates(items.map(applies.pin)),
		move: aggregateVerbStates(items.map(applies.move)),
		restore: aggregateVerbStates(items.map(applies.restore))
	}

	async function run(
		applicable: (it: FileHandItem) => boolean,
		fn: (it: FileHandItem) => Promise<void>,
		success: (count: number) => string
	): Promise<{ ok: number; failed: number }> {
		const targets = items.filter(applicable)
		if (targets.length === 0) return { ok: 0, failed: 0 }
		const results = await Promise.allSettled(targets.map(fn))
		const ok = results.filter((r) => r.status === 'fulfilled').length
		const failed = results.length - ok
		onRefresh()
		// Only dismiss the hand when at least one item succeeded; on full failure
		// keep the hand active so the user can retry.
		// Use the Jotai store's live get/set so we operate on the current
		// hand value, not the one captured at render time.
		if (ok > 0) {
			const handEl = store.get(handTargetElAtom)
			const reduced = prefersReducedMotion()
			if (handEl && !reduced) {
				waveHand(handEl)
				const successItems = targets.filter((_, i) => results[i].status === 'fulfilled')
				// Wait two paints for the post-refresh rows to mount, then start
				// the reverse flight. Switching to dormant must wait until the
				// flight is in motion, otherwise React unmounts the active hand
				// icon and its detached rect collapses to (0,0). flyFromHand
				// also retries row resolution internally.
				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						const flight = flyFromHand({
							items: successItems,
							source: handEl,
							reducedMotion: false
						})
						setDown(store.get, store.set)
						void flight
					})
				})
			} else {
				setDown(store.get, store.set)
			}
		}
		if (failed === 0) {
			toast.success(success(ok))
		} else {
			const firstReason = results.find((r) => r.status === 'rejected') as
				| PromiseRejectedResult
				| undefined
			const err =
				firstReason && firstReason.reason instanceof FetchError
					? firstReason.reason
					: undefined
			let reason: string
			if (err?.is('E-FILE-ACCESS_LEVEL_FORBIDDEN')) {
				reason = t('This access level is not allowed for this file type')
			} else if (err?.is('E-FILE-SOURCE_FORBIDDEN')) {
				reason = t("You don't have permission to share this file")
			} else if (err?.is('E-FILE-SOURCE_NOT_FOUND')) {
				reason = t('Source file no longer exists')
			} else if (err?.is('E-FILE-SOURCE_UNREACHABLE')) {
				reason = t('Source server is unreachable — please retry')
			} else if (err?.is('E-FILE-ALREADY_PLACED')) {
				const existingParentId =
					typeof err.details === 'object' && err.details !== null
						? (err.details as { existing_parent_id?: string }).existing_parent_id
						: undefined
				reason = existingParentId
					? t('Already placed in this context (in folder {{folder}})', {
							folder: existingParentId
						})
					: t('Already placed in this context')
			} else {
				reason = err?.message ?? t('access denied')
			}
			toast.warning(
				t('{{ok}} of {{total}} files succeeded. {{failed}} failed: {{reason}}.', {
					ok,
					total: results.length,
					failed,
					reason
				})
			)
		}
		return { ok, failed }
	}

	const doPin = () =>
		run(
			applies.pin,
			async (it) => {
				await api.files.create({
					fileTp: it.fileTp ?? 'BLOB',
					sourceFileId: it.id,
					sourceIdTag: it.idTag,
					parentId: currentFolderId ?? undefined
				})
			},
			(count) => t('Pinned {{count}} files', { count })
		)

	const doPlace = (level: AccessLevel) => {
		const perm: 'R' | 'C' | 'W' = level === 'read' ? 'R' : level === 'comment' ? 'C' : 'W'
		return run(
			applies.place,
			async (it) => {
				// For Place, the user IS the source owner, so the source client
				// is the user's own primary API.
				const ownIdTag = auth.idTag
				if (!ownIdTag) throw new Error('No source identity')
				const sourceApi = getClientFor(ownIdTag)
				if (!sourceApi) throw new Error('No source API client')

				// Step 1: grant the destination tenant access on the source.
				await sourceApi.files.createShare(it.id, {
					subjectType: 'U',
					subjectId: ctxIdTag,
					permission: perm
				})

				// Step 2: create the placement on the destination (no accessLevel).
				await api.files.create({
					fileTp: it.fileTp ?? 'BLOB',
					sourceFileId: it.id,
					sourceIdTag: auth.idTag,
					parentId: currentFolderId ?? undefined
				})
			},
			(count) => t('Placed {{count}} files', { count })
		)
	}

	const reparent = (
		applicable: (it: FileHandItem) => boolean,
		success: (count: number) => string
	) =>
		run(
			applicable,
			async (it) => {
				await api.files.update(it.id, { parentId: currentFolderId ?? null })
			},
			success
		)

	const doMove = () => reparent(applies.move, (count) => t('Moved {{count}} files', { count }))
	const doRestore = () =>
		reparent(applies.restore, (count) => t('Restored {{count}} files', { count }))

	const counts = {
		place: items.filter(applies.place).length,
		pin: items.filter(applies.pin).length,
		move: items.filter(applies.move).length,
		restore: items.filter(applies.restore).length
	}

	const visibleVerbs =
		(states.pin !== 'hidden' ? 1 : 0) +
		(states.place !== 'hidden' ? 1 : 0) +
		(states.move !== 'hidden' ? 1 : 0) +
		(states.restore !== 'hidden' ? 1 : 0)

	// On non-browse views with a non-empty hand, show a muted hint instead of action buttons.
	if (!isBrowse) {
		return (
			<div className="c-hbox align-items-center g-2 p-2 bg-mid br">
				<IcHand />
				<span className="cl-hand-hint">
					{t('Holding {{count}} files. Switch to Browse to place, move or pin them.', {
						count: items.length
					})}
				</span>
			</div>
		)
	}

	if (visibleVerbs === 0) return null

	const disabledTooltip = (n: number, m: number, verb: string) =>
		t('Only {{n}} of {{m}} items can be {{verb}} here. Drop the others or empty your hand.', {
			n,
			m,
			verb
		})

	const placeTargets = items.filter(applies.place)
	const placeCount = placeTargets.length
	// Backend convention: missing fileTp defaults to BLOB (immutable).
	// If any placed item is immutable, 'write' access is invalid for the batch.
	const anyImmutable = placeTargets.some((it) => it.fileTp == null || it.fileTp === 'BLOB')
	const folderLabel = currentFolderName || t('the current folder')
	const dialogTitle =
		placeCount === 1
			? t('Place "{{name}}" in "{{folder}}"', {
					name: placeTargets[0]?.label ?? '',
					folder: folderLabel
				})
			: t('Place {{count}} files in "{{folder}}"', {
					count: placeCount,
					folder: folderLabel
				})

	const onConfirmPlace = async () => {
		writeLastUsed(placeAccess)
		setLastUsed(placeAccess)
		const { ok } = await doPlace(placeAccess)
		// Keep the dialog open on full failure so the user can adjust and retry.
		if (ok > 0) setPlaceOpen(false)
	}

	const onCancelPlace = () => {
		setPlaceOpen(false)
	}

	const onOpenPlace = () => {
		const initial = readLastUsed()
		setLastUsed(initial)
		// If the batch contains an immutable item, demote 'write' to 'read'
		setPlaceAccess(initial === 'write' && anyImmutable ? 'read' : initial)
		setPlaceOpen(true)
	}

	const previewChips = placeTargets.slice(0, 3)
	const previewOverflow = placeCount - previewChips.length

	const allOptions: Array<{
		value: AccessLevel
		icon: React.ReactNode
		title: string
		desc: string
	}> = [
		{
			value: 'read',
			icon: <IcRead />,
			title: t('Read only'),
			desc: t('Recipients can view the files.')
		},
		{
			value: 'comment',
			icon: <IcComment />,
			title: t('Can comment'),
			desc: t('Recipients can view and add comments.')
		},
		{
			value: 'write',
			icon: <IcWrite />,
			title: t('Can edit'),
			desc: t('Recipients can edit the content.')
		}
	]
	const options = anyImmutable ? allOptions.filter((o) => o.value !== 'write') : allOptions

	return (
		<>
			<div className="c-hbox align-items-center g-2 p-2 bg-mid br flex-wrap">
				<IcHand />
				<span className="small text-muted">
					{t('Hand: {{count}} files', { count: items.length })}
				</span>

				{states.pin !== 'hidden' && (
					<button
						type="button"
						className="c-button primary"
						disabled={states.pin === 'disabled'}
						title={
							states.pin === 'disabled'
								? disabledTooltip(
										items.filter(applies.pin).length,
										items.length,
										t('pinned')
									)
								: undefined
						}
						onClick={doPin}
					>
						<IcPin />
						{t('Pin here')}
						{states.pin === 'disabled' && (
							<span
								className="cl-hand-action-badge"
								aria-label={t('{{count}} applicable', { count: counts.pin })}
							>
								{counts.pin}
							</span>
						)}
					</button>
				)}

				{states.place !== 'hidden' && (
					<button
						type="button"
						className="c-button primary"
						disabled={states.place === 'disabled'}
						title={
							states.place === 'disabled'
								? disabledTooltip(
										items.filter(applies.place).length,
										items.length,
										t('placed')
									)
								: undefined
						}
						onClick={onOpenPlace}
					>
						<IcPlace />
						{t('Place here…')}
						{states.place === 'disabled' && (
							<span
								className="cl-hand-action-badge"
								aria-label={t('{{count}} applicable', { count: counts.place })}
							>
								{counts.place}
							</span>
						)}
					</button>
				)}

				{states.move !== 'hidden' && (
					<button
						type="button"
						className="c-button"
						disabled={states.move === 'disabled'}
						title={
							states.move === 'disabled'
								? disabledTooltip(
										items.filter(applies.move).length,
										items.length,
										t('moved')
									)
								: undefined
						}
						onClick={doMove}
					>
						<IcMove />
						{t('Move here')}
						{states.move === 'disabled' && (
							<span
								className="cl-hand-action-badge"
								aria-label={t('{{count}} applicable', { count: counts.move })}
							>
								{counts.move}
							</span>
						)}
					</button>
				)}

				{states.restore !== 'hidden' && (
					<button
						type="button"
						className="c-button"
						disabled={states.restore === 'disabled'}
						title={
							states.restore === 'disabled'
								? disabledTooltip(
										items.filter(applies.restore).length,
										items.length,
										t('restored')
									)
								: undefined
						}
						onClick={doRestore}
					>
						<IcRestore />
						{t('Restore here')}
						{states.restore === 'disabled' && (
							<span
								className="cl-hand-action-badge"
								aria-label={t('{{count}} applicable', { count: counts.restore })}
							>
								{counts.restore}
							</span>
						)}
					</button>
				)}
			</div>

			<Dialog
				open={placeOpen}
				title={dialogTitle}
				onClose={onCancelPlace}
				className="cl-hand-place-dialog"
			>
				<form
					onSubmit={(e) => {
						e.preventDefault()
						onConfirmPlace()
					}}
				>
					<p className="m-0 mb-3">{t('Choose what recipients can do:')}</p>
					<fieldset className="cl-perm-options">
						<legend className="sr-only">{t('Permission')}</legend>
						{options.map((opt) => {
							const isLast = opt.value === lastUsed
							const isSelected = opt.value === placeAccess
							return (
								<label
									key={opt.value}
									className={'cl-perm-option' + (isSelected ? ' selected' : '')}
								>
									<input
										type="radio"
										name="hand-place-access"
										value={opt.value}
										checked={isSelected}
										onChange={() => setPlaceAccess(opt.value)}
										autoFocus={isSelected}
									/>
									<span className="cl-perm-option__icon" aria-hidden="true">
										{opt.icon}
									</span>
									<span className="cl-perm-option__body">
										<span className="cl-perm-option__title">
											{opt.title}
											{isLast && (
												<span className="cl-perm-option__badge">
													· {t('last used')} ·
												</span>
											)}
										</span>
										<span className="cl-perm-option__desc">{opt.desc}</span>
									</span>
								</label>
							)
						})}
					</fieldset>

					{previewChips.length > 0 && (
						<div className="cl-hand-place-preview">
							<span className="text-muted small">
								{t('{{count}} files', { count: placeCount })}:
							</span>
							{previewChips.map((it) => (
								<span
									key={`${it.sourceContext}:${it.id}`}
									className="cl-hand-chip"
									title={it.label}
								>
									{it.label}
								</span>
							))}
							{previewOverflow > 0 && (
								<span className="cl-hand-chip cl-hand-chip--more">
									{t('+{{count}} more', { count: previewOverflow })}
								</span>
							)}
						</div>
					)}

					<div className="c-hbox g-2 align-items-center justify-content-flex-end mt-3">
						<Button type="button" onClick={onCancelPlace}>
							{t('Cancel')}
						</Button>
						<Button type="submit" variant="primary" className="g-2">
							{placeCount === 1 ? t('Place') : t('Place files')}
							<IcChevron />
						</Button>
					</div>
					<div className="cl-hand-place-kbd-hint">{t('Esc to cancel · ⏎ to place')}</div>
				</form>
			</Dialog>
		</>
	)
}

// vim: ts=4
