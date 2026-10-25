// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	ActionBar,
	BadgeGlyph,
	Button,
	badgeLabel,
	Dialog,
	Field,
	Input,
	Segmented,
	SegmentedItem,
	Text,
	useToast,
	VBox
} from '@cloudillo/react'
import {
	BADGE_LEVELS,
	BADGE_MAX_TTL_SECS,
	type BadgeLevel,
	type BadgeSlot,
	type Profile
} from '@cloudillo/types'
import dayjs from 'dayjs'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useApiContext } from '../context/index.js'
import type { ReceivedBadge } from './badges.js'

// One minute of slack for a client clock running ahead of the server's.
const CLOCK_SLACK_SECS = 60

// Five items do not fit a phone width in one row: wrap them into columns instead.
const SEGMENTED_WRAP = { '--segmented-min': '6rem' } as React.CSSProperties

type Expiry = '1' | '3' | '6' | '12' | 'custom'

export interface AwardBadgeDialogProps {
	open: boolean
	onClose: () => void
	communityIdTag: string
	member: Profile
	/** The member's current badges from this community (preselected per slot) */
	current: readonly ReceivedBadge[]
	/** Renew: only this slot is shown and re-issued */
	slot?: BadgeSlot
	onAwarded: () => void
}

export function AwardBadgeDialog({
	open,
	onClose,
	communityIdTag,
	member,
	current,
	slot,
	onAwarded
}: AwardBadgeDialogProps) {
	const { t } = useTranslation()
	const { getClientFor } = useApiContext()
	const toast = useToast()

	const currentLevel = (s: BadgeSlot) => current.find((b) => b.slot === s)?.level
	const slots: BadgeSlot[] = slot ? [slot] : ['STD', 'PAT']
	const [levels, setLevels] = React.useState<Partial<Record<BadgeSlot, BadgeLevel>>>(() => ({
		STD: currentLevel('STD'),
		PAT: currentLevel('PAT')
	}))
	const [expiry, setExpiry] = React.useState<Expiry>('12')
	const [customDate, setCustomDate] = React.useState('')
	const [submitting, setSubmitting] = React.useState(false)
	// Slots issued by an attempt that failed later: a retry before `onAwarded`'s refresh lands skips them.
	const [issuedSlots, setIssuedSlots] = React.useState<BadgeSlot[]>([])

	const minDate = dayjs().add(1, 'day').format('YYYY-MM-DD')
	const maxDate = dayjs().add(BADGE_MAX_TTL_SECS, 'second').format('YYYY-MM-DD')

	function expiresAt(): number | undefined {
		// `add(n, 'month')` clamps to the month's end: Jan 31 + 1 month is the last day of February.
		const d =
			expiry === 'custom'
				? dayjs(customDate).endOf('day')
				: dayjs().add(Number(expiry), 'month')
		if (!d.isValid()) return
		const nowSecs = dayjs().unix()
		const secs = Math.min(d.unix(), nowSecs + BADGE_MAX_TTL_SECS - CLOCK_SLACK_SECS)
		return secs > nowSecs ? secs : undefined
	}

	// Award: only slots whose level changed. Renew: the one slot, even if unchanged.
	const toIssue = slots.filter(
		(s) => levels[s] && !issuedSlots.includes(s) && (slot || levels[s] !== currentLevel(s))
	)
	const exp = expiresAt()

	async function handleSubmit() {
		if (exp === undefined || toIssue.length === 0) return
		setSubmitting(true)
		let issued = 0
		try {
			// Explicit: a user-initiated administrative action on the community.
			const client = getClientFor(communityIdTag, { explicit: true })
			if (!client) throw new Error('No API client for community')
			for (const s of toIssue) {
				await client.actions.create({
					type: 'BDG',
					subType: s,
					audienceTag: member.idTag,
					content: { b: levels[s] },
					expiresAt: exp
				})
				issued++
				setIssuedSlots((prev) => [...prev, s])
			}
			toast.success(t('Badge awarded'))
			onAwarded()
			onClose()
		} catch (err) {
			console.error('Failed to award badge:', err)
			toast.error(t('Failed to award badge'))
			// Refresh `current`, so a retry does not re-issue the slots that went through.
			if (issued) onAwarded()
			setSubmitting(false)
		}
	}

	return (
		<Dialog
			open={open}
			onClose={onClose}
			size="md"
			title={slot ? t('Renew') : t('Award badge…')}
			description={member.name || `@${member.idTag}`}
			footer={
				<ActionBar>
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button
						color="primary"
						disabled={exp === undefined || toIssue.length === 0 || submitting}
						onClick={handleSubmit}
					>
						{slot ? t('Renew') : t('Award')}
					</Button>
				</ActionBar>
			}
		>
			<VBox gap={3}>
				{slots.map((s) => (
					<Field key={s} label={s === 'STD' ? t('Standing') : t('Patron')}>
						<Segmented
							layout="grid"
							style={SEGMENTED_WRAP}
							aria-label={s === 'STD' ? t('Standing') : t('Patron')}
							value={levels[s] ?? ''}
							onChange={(v) => {
								setLevels((prev) => ({
									...prev,
									[s]: (v || undefined) as BadgeLevel
								}))
							}}
						>
							{!currentLevel(s) && (
								<SegmentedItem value="">{t('None')}</SegmentedItem>
							)}
							{BADGE_LEVELS[s].map((l) => (
								<SegmentedItem key={l} value={l}>
									<BadgeGlyph slot={s} level={l} />
									{badgeLabel(s, l, t)}
								</SegmentedItem>
							))}
						</Segmented>
					</Field>
				))}
				<Field label={t('Expires')}>
					<Segmented
						layout="grid"
						style={SEGMENTED_WRAP}
						aria-label={t('Expires')}
						value={expiry}
						onChange={(v) => setExpiry(v as Expiry)}
					>
						<SegmentedItem value="1">{t('1 month')}</SegmentedItem>
						<SegmentedItem value="3">{t('3 months')}</SegmentedItem>
						<SegmentedItem value="6">{t('6 months')}</SegmentedItem>
						<SegmentedItem value="12">{t('12 months')}</SegmentedItem>
						<SegmentedItem value="custom">{t('Custom date')}</SegmentedItem>
					</Segmented>
				</Field>
				{expiry === 'custom' && (
					<Field label={t('Custom date')}>
						<Input
							type="date"
							min={minDate}
							max={maxDate}
							value={customDate}
							onChange={(e) => setCustomDate(e.target.value)}
						/>
					</Field>
				)}
				<Text size="sm" emphasis="muted">
					{t("Badges can't be revoked; they expire.")}
				</Text>
			</VBox>
		</Dialog>
	)
}

// vim: ts=4
