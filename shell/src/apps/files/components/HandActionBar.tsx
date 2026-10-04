// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiClient, PorchEntry } from '@cloudillo/core'
import { FetchError } from '@cloudillo/core'
import {
	Badge,
	Button,
	Dialog,
	HBox,
	Icon,
	parseChannel,
	RadioGroup,
	type RadioOption,
	Tag,
	Text,
	Toolbar,
	useAuth,
	useDialog,
	useToast,
	VBox
} from '@cloudillo/react'
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
import { fly, handTargetElAtom, prefersReducedMotion, waveHand } from '../../../state/hand-fly.js'
import {
	audienceText,
	confirmAudienceDialog,
	findRoom,
	leavesRoom,
	reparentPatch,
	widensAudience
} from '../audience.js'
import type { ViewMode } from '../types.js'

export interface HandActionBarProps {
	api: ApiClient | null
	currentFolderId: string | null
	currentFolderName?: string
	viewMode: ViewMode
	onRefresh: () => void
	/** The drive being browsed (`@ctx~name`); undefined = main drive. */
	driveChannel?: string
	contextName: string
	/** The whole porch (undefined while loading): tells a deleted room from one merely left,
	 *  and gives the audience text for the cross-drive confirm. */
	rooms: PorchEntry[] | undefined
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
	onRefresh,
	driveChannel,
	contextName,
	rooms
}: HandActionBarProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const [activeContext] = useAtom(activeContextAtom)
	const hand = useAtomValue(handAtom)
	const store = useStore()
	const { getClientFor } = useApiContext()
	const toast = useToast()
	const dialog = useDialog()
	const [placeOpen, setPlaceOpen] = React.useState(false)
	const initialAccess = React.useMemo<AccessLevel>(() => readLastUsed(), [])
	const [lastUsed, setLastUsed] = React.useState<AccessLevel>(initialAccess)
	const [placeAccess, setPlaceAccess] = React.useState<AccessLevel>(initialAccess)

	if (hand?.status !== 'active' || !auth || !activeContext || !api) return null

	const items = hand.items
	const ctxIdTag = activeContext.idTag
	const isOwnContext = ctxIdTag === auth.idTag
	const isBrowse = viewMode === 'browse'

	const targetChannel = driveChannel ?? null
	const atRoot = !currentFolderId || currentFolderId === '__root__'

	const canWriteHere =
		ctxIdTag === auth.idTag ||
		activeContext.roles.some((r) => r === 'leader' || r === 'moderator' || r === 'contributor')

	const applies = {
		place: (it: FileHandItem) =>
			isBrowse &&
			it.fileId !== null &&
			it.idTag === auth.idTag &&
			!isOwnContext &&
			canWriteHere &&
			!it.brokenAt,
		pin: (it: FileHandItem) =>
			isBrowse &&
			it.fileId !== null &&
			it.idTag !== auth.idTag &&
			isOwnContext &&
			it.sourceContext !== ctxIdTag &&
			!it.brokenAt,
		move: (it: FileHandItem) => {
			if (!isBrowse || it.sourceContext !== ctxIdTag || !canWriteHere || it.brokenAt)
				return false
			if (it.sourceParentId === undefined) return true
			if (it.sourceChannel !== undefined && it.sourceChannel !== targetChannel) return true
			const src = it.sourceParentId === '__root__' ? null : it.sourceParentId
			const cur = atRoot ? null : currentFolderId
			return src !== cur
		},
		restore: (it: FileHandItem) =>
			isBrowse && it.inTrash === true && it.sourceContext === ctxIdTag && canWriteHere
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
		success: (count: number) => string,
		// Move/Restore cross drives on the server, which gates other members' files to moderators
		driveGate = false
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
				// icon and its detached rect collapses to (0,0). fly({ dir: 'from' })
				// also retries row resolution internally.
				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						const flight = fly({
							items: successItems,
							anchor: handEl,
							dir: 'from',
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
			const failedItem = targets[results.findIndex((r) => r.status === 'rejected')]
			let reason: string
			if (
				driveGate &&
				err?.httpStatus === 403 &&
				failedItem?.sourceContext === ctxIdTag &&
				failedItem.sourceChannel &&
				leavesRoom(failedItem.sourceChannel, targetChannel) &&
				// Best-effort: the server sends a generic 403, but only a folder or someone
				// else's file can trip the moderator gate
				(failedItem.fileTp === 'FLDR' || failedItem.ownerIdTag !== auth?.idTag)
			) {
				// Cross-drive move gate: the subtree holds other members' files
				reason = t("Only moderators can move other members' files out of ~{{room}}", {
					room: parseChannel(failedItem.sourceChannel).name
				})
			} else if (err?.is('E-FILE-ACCESS_LEVEL_FORBIDDEN')) {
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
			} else if (err?.is('E-CORE-CONFLICT')) {
				reason = t('This file is in several folders — pick it up from your own Files')
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

	/** Asks before items widen their audience, naming who will see them here. */
	async function confirmAudience(
		applicable: (it: FileHandItem) => boolean,
		title: (place: string) => string
	): Promise<boolean> {
		if (
			!items.some(
				(it) =>
					applicable(it) &&
					widensAudience(rooms, ctxIdTag, it.sourceChannel, targetChannel)
			)
		)
			return true
		const place = driveChannel ? `~${parseChannel(driveChannel).name}` : contextName
		const found = driveChannel ? findRoom(rooms, ctxIdTag, driveChannel) : null
		const room = found === 'unknown' ? undefined : found
		const audience = audienceText(t, contextName, room, isOwnContext) ?? place
		return confirmAudienceDialog(dialog, t, title(place), audience)
	}

	// Root targets name the room; inside a folder the server inherits its drive.
	const rootChannel = atRoot && driveChannel ? { channel: driveChannel } : {}

	const doPin = () =>
		run(
			applies.pin,
			async (it) => {
				await api.files.create({
					fileTp: it.fileTp ?? 'BLOB',
					sourceFileId: it.fileId!,
					sourceIdTag: it.idTag,
					parentId: currentFolderId ?? undefined,
					...rootChannel
				})
			},
			(count) => t('Pinned {{count}} files', { count })
		)

	const doPlace = async (level: AccessLevel) => {
		if (!(await confirmAudience(applies.place, (place) => t('Place in {{place}}?', { place }))))
			return { ok: 0, failed: 0 }
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
				// Entry ids are per-DB, so only our own rows can name the entry; mirrored
				// rows fall back to the content id.
				await sourceApi.files.createShare(
					it.sourceContext === auth.idTag ? it.id : it.fileId!,
					{
						subjectType: 'U',
						subjectId: ctxIdTag,
						permission: perm
					}
				)

				// Step 2: create the placement on the destination (no accessLevel).
				await api.files.create({
					fileTp: it.fileTp ?? 'BLOB',
					sourceFileId: it.fileId!,
					sourceIdTag: auth.idTag,
					parentId: currentFolderId ?? undefined,
					...rootChannel
				})
			},
			(count) => t('Placed {{count}} files', { count })
		)
	}

	const reparent = async (
		applicable: (it: FileHandItem) => boolean,
		title: (place: string) => string,
		success: (count: number) => string
	) => {
		if (!(await confirmAudience(applicable, title))) return { ok: 0, failed: 0 }
		return run(
			applicable,
			async (it) => {
				await api.files.update(it.id, reparentPatch(atRoot, currentFolderId, targetChannel))
			},
			success,
			true
		)
	}

	const doMove = () =>
		reparent(
			applies.move,
			(place) => t('Move to {{place}}?', { place }),
			(count) => t('Moved {{count}} files', { count })
		)
	const doRestore = () =>
		reparent(
			applies.restore,
			(place) => t('Restore to {{place}}?', { place }),
			(count) => t('Restored {{count}} files', { count })
		)

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
			<Toolbar variant="soft">
				<Icon as={IcHand} />
				<Text size="sm" emphasis="muted">
					{t('Holding {{count}} files. Switch to Browse to place, move or pin them.', {
						count: items.length
					})}
				</Text>
			</Toolbar>
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

	const allOptions: Array<RadioOption<AccessLevel>> = [
		{
			value: 'read',
			leading: <IcRead />,
			label: t('Read only'),
			description: t('Recipients can view the files.')
		},
		{
			value: 'comment',
			leading: <IcComment />,
			label: t('Can comment'),
			description: t('Recipients can view and add comments.')
		},
		{
			value: 'write',
			leading: <IcWrite />,
			label: t('Can edit'),
			description: t('Recipients can edit the content.')
		}
	]
	const options = (anyImmutable ? allOptions.filter((o) => o.value !== 'write') : allOptions).map(
		(o) =>
			o.value === lastUsed
				? {
						...o,
						label: (
							<>
								{o.label}{' '}
								<Text size="sm" emphasis="muted">
									· {t('last used')} ·
								</Text>
							</>
						)
					}
				: o
	)

	return (
		<>
			<Toolbar variant="soft" className="flex-wrap">
				<Icon as={IcHand} />
				<Text size="sm" emphasis="muted">
					{t('Hand: {{count}} files', { count: items.length })}
				</Text>

				{states.pin !== 'hidden' && (
					<Button
						color="primary"
						icon={<IcPin />}
						disabledReason={
							states.pin === 'disabled'
								? disabledTooltip(counts.pin, items.length, t('pinned'))
								: undefined
						}
						onClick={doPin}
					>
						{t('Pin here')}
						{states.pin === 'disabled' && (
							<Badge
								size="sm"
								aria-label={t('{{count}} applicable', { count: counts.pin })}
							>
								{counts.pin}
							</Badge>
						)}
					</Button>
				)}

				{states.place !== 'hidden' && (
					<Button
						color="primary"
						icon={<IcPlace />}
						disabledReason={
							states.place === 'disabled'
								? disabledTooltip(counts.place, items.length, t('placed'))
								: undefined
						}
						onClick={onOpenPlace}
					>
						{t('Place here…')}
						{states.place === 'disabled' && (
							<Badge
								size="sm"
								aria-label={t('{{count}} applicable', { count: counts.place })}
							>
								{counts.place}
							</Badge>
						)}
					</Button>
				)}

				{states.move !== 'hidden' && (
					<Button
						icon={<IcMove />}
						disabledReason={
							states.move === 'disabled'
								? disabledTooltip(counts.move, items.length, t('moved'))
								: undefined
						}
						onClick={doMove}
					>
						{t('Move here')}
						{states.move === 'disabled' && (
							<Badge
								size="sm"
								aria-label={t('{{count}} applicable', { count: counts.move })}
							>
								{counts.move}
							</Badge>
						)}
					</Button>
				)}

				{states.restore !== 'hidden' && (
					<Button
						icon={<IcRestore />}
						disabledReason={
							states.restore === 'disabled'
								? disabledTooltip(counts.restore, items.length, t('restored'))
								: undefined
						}
						onClick={doRestore}
					>
						{t('Restore here')}
						{states.restore === 'disabled' && (
							<Badge
								size="sm"
								aria-label={t('{{count}} applicable', { count: counts.restore })}
							>
								{counts.restore}
							</Badge>
						)}
					</Button>
				)}
			</Toolbar>

			<Dialog
				open={placeOpen}
				title={dialogTitle}
				description={t('Choose what recipients can do:')}
				onClose={onCancelPlace}
				onSubmit={() => onConfirmPlace()}
				footer={
					<HBox gap={2} align="center" justify="between" wrap>
						<Text size="xs" emphasis="muted">
							{t('Esc to cancel · ⏎ to place')}
						</Text>
						<HBox gap={2}>
							<Button type="button" onClick={onCancelPlace}>
								{t('Cancel')}
							</Button>
							<Button type="submit" color="primary">
								{placeCount === 1 ? t('Place') : t('Place files')}
								<IcChevron />
							</Button>
						</HBox>
					</HBox>
				}
			>
				<VBox gap={3}>
					<RadioGroup
						variant="card"
						name="hand-place-access"
						aria-label={t('Permission')}
						options={options}
						value={placeAccess}
						onChange={setPlaceAccess}
					/>

					{previewChips.length > 0 && (
						<HBox gap={1} align="center" wrap>
							<Text size="sm" emphasis="muted">
								{t('{{count}} files', { count: placeCount })}:
							</Text>
							{previewChips.map((it) => (
								<Tag key={`${it.sourceContext}:${it.id}`} size="sm">
									{it.label}
								</Tag>
							))}
							{previewOverflow > 0 && (
								<Text size="sm" emphasis="muted">
									{t('+{{count}} more', { count: previewOverflow })}
								</Text>
							)}
						</HBox>
					)}
				</VBox>
			</Dialog>
		</>
	)
}

// vim: ts=4
