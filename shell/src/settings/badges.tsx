// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	badgeLabel,
	Card,
	CommunityBadge,
	HBox,
	IdentityTag,
	invalidateProfile,
	LoadError,
	LoadingSpinner,
	Panel,
	SortableGroup,
	SortableList,
	Text,
	Toggle,
	useApi,
	useAuth,
	useToast,
	VBox
} from '@cloudillo/react'
import { communityName } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	listReceivedBadges,
	MAX_SHOWN,
	type ReceivedBadge,
	readShownBadges,
	SETTING,
	shownBadgeEvents
} from '../profile/badges.js'
import { formatUnixTime } from '../utils.js'

const SAVE_DELAY_MS = 600

type Section = 'shown' | 'hidden'

export function BadgeSettings() {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const { api } = useApi(auth?.idTag)
	const { error: toastError } = useToast()
	const [received, setReceived] = React.useState<ReceivedBadge[]>()
	const [shown, setShown] = React.useState<string[]>([])
	const [error, setError] = React.useState<unknown>()

	const idTag = auth?.idTag
	const load = React.useCallback(
		async (cancelled: () => boolean = () => false) => {
			if (!api || !idTag) return
			try {
				const [list, keys] = await Promise.all([
					listReceivedBadges(api, idTag),
					readShownBadges(api)
				])
				if (cancelled()) return
				setReceived(list)
				setShown(keys)
				setError(undefined)
			} catch (err) {
				console.error('Failed to load badges:', err)
				if (cancelled()) return
				setError(err)
				setReceived((prev) => prev ?? [])
			}
		},
		[api, idTag]
	)

	React.useEffect(() => {
		let cancelled = false
		void load(() => cancelled)
		return () => {
			cancelled = true
		}
	}, [load])

	// Debounced save; a pending write is flushed on unmount.
	const pending = React.useRef<{
		timer: ReturnType<typeof setTimeout>
		keys: string[]
		flush: () => Promise<void>
	}>(undefined)

	// A badge shown from a notification while this page is open: keep it through a pending
	// save, then reload. Same-tab only; an in-flight write can still race (no compare-and-set).
	React.useEffect(() => {
		async function onAdded(e: Event) {
			const key = (e as CustomEvent<string>).detail
			const p = pending.current
			if (p) {
				clearTimeout(p.timer)
				// Full: the pending order wins; the `load()` below shows the server's state.
				if (!p.keys.includes(key) && p.keys.length < MAX_SHOWN) p.keys = [...p.keys, key]
				await p.flush()
			}
			await load()
		}
		shownBadgeEvents.addEventListener('added', onAdded)
		return () => shownBadgeEvents.removeEventListener('added', onAdded)
	}, [load])
	React.useEffect(
		() => () => {
			const p = pending.current
			if (p) {
				clearTimeout(p.timer)
				p.flush()
			}
		},
		[]
	)

	const save = React.useCallback(
		(keys: string[]) => {
			setShown(keys)
			if (!api) return
			if (pending.current) clearTimeout(pending.current.timer)
			const next = {
				timer: setTimeout(() => void next.flush(), SAVE_DELAY_MS),
				keys,
				flush: () => {
					pending.current = undefined
					return api.settings
						.update(SETTING, { value: next.keys })
						.then(() => {
							// Only the owner's own badges changed.
							if (idTag) invalidateProfile(idTag)
							shownBadgeEvents.dispatchEvent(new Event('changed'))
						})
						.catch((err) => {
							console.error('Failed to save badge setting:', err)
							toastError(t('Failed to save setting. Please try again.'))
							// Drop the optimistic order.
							void load()
						})
				}
			}
			pending.current = next
		},
		[api, idTag, toastError, t, load]
	)

	const byKey = React.useMemo(() => new Map((received ?? []).map((b) => [b.key, b])), [received])
	// Stale keys (expired, unknown) are not listed, and drop out of the setting on the next save.
	const shownItems = shown.flatMap((k) => byKey.get(k) ?? [])
	const hiddenItems = (received ?? []).filter((b) => !shown.includes(b.key))

	// `to` is the item's index after the move (SortableList semantics)
	function move(source: Section, from: number, target: Section, to: number) {
		const lists = { shown: shownItems.map((b) => b.key), hidden: hiddenItems.map((b) => b.key) }
		const key = lists[source][from]
		if (!key) return
		// Hidden order is derived from `received` and never persisted: nothing to save.
		if (source === 'hidden' && target === 'hidden') return
		if (target === 'shown' && source !== 'shown' && lists.shown.length >= MAX_SHOWN) return
		lists[source].splice(from, 1)
		lists[target].splice(to, 0, key)
		save(lists.shown)
	}

	function toggle(badge: ReceivedBadge) {
		const from = shownItems.indexOf(badge)
		if (from >= 0) move('shown', from, 'hidden', 0)
		else move('hidden', hiddenItems.indexOf(badge), 'shown', shownItems.length)
	}

	function renderSection(section: Section, items: ReceivedBadge[], title: string) {
		const full = shownItems.length >= MAX_SHOWN
		return (
			<Card
				variant="outline"
				color={section === 'shown' ? 'primary' : undefined}
				padding={2}
				title={title}
			>
				<SortableList
					group={section}
					items={items}
					getKey={(b) => b.key}
					getLabel={(b) => badgeLabel(b.slot, b.level, t)}
					onReorder={(from, to, source) =>
						move((source as Section | undefined) ?? section, from, section, to)
					}
					renderItem={(b, { handle }) => (
						<HBox gap={2} align="center" padding={1}>
							{handle}
							<Toggle
								color="primary"
								aria-label={t('Show on profile')}
								checked={section === 'shown'}
								disabled={section === 'hidden' && full}
								onChange={() => toggle(b)}
							/>
							<CommunityBadge {...b} size={24} srcTag={auth?.idTag} />
							<VBox className="flex-fill">
								<Text>
									{communityName(b.community) ?? (
										<IdentityTag idTag={b.community.idTag} />
									)}
								</Text>
								<Text size="sm" emphasis="muted">
									{badgeLabel(b.slot, b.level, t)} ·{' '}
									{t('Expires {{date}}', {
										date: formatUnixTime(b.exp)
									})}
								</Text>
							</VBox>
						</HBox>
					)}
				/>
				{items.length === 0 && (
					<Text as="div" size="sm" emphasis="muted" className="text-center">
						{t('Drag items here')}
					</Text>
				)}
			</Card>
		)
	}

	if (!received) return api && idTag ? <LoadingSpinner /> : null

	return (
		<Panel title={t('Badges')}>
			{error && received.length === 0 ? (
				<LoadError
					error={error}
					onRetry={() => void load()}
					title={t("Couldn't load badges")}
				/>
			) : received.length === 0 ? (
				<Text as="div" emphasis="muted">
					{t('You have not received any badges yet.')}
				</Text>
			) : (
				<SortableGroup>
					{renderSection(
						'shown',
						shownItems,
						t('Shown on profile ({{count}}/{{max}})', {
							count: shownItems.length,
							max: MAX_SHOWN
						})
					)}
					{renderSection('hidden', hiddenItems, t('Hidden'))}
				</SortableGroup>
			)}
		</Panel>
	)
}

// vim: ts=4
