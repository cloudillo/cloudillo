// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { ActionBar, Button, Dialog, RadioGroup } from '@cloudillo/react'
import dayjs from 'dayjs'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

export type RecurringScope = 'occurrence' | 'following' | 'series'

interface Props {
	open: boolean
	mode: 'edit' | 'delete'
	/** ISO date of the clicked occurrence — formatted with Intl for display. */
	occurrenceDate: string
	locale: string
	onChoose: (scope: RecurringScope) => void
	onCancel: () => void
}

/** Prompt shown when the user edits/deletes one occurrence of a recurring series.
 *  Defaults to "This event only" (smallest blast radius) so an accidental confirm
 *  can't rewrite the whole series. Enter triggers the primary action; Escape cancels. */
export function RecurringEditScopeDialog({
	open,
	mode,
	occurrenceDate,
	locale,
	onChoose,
	onCancel
}: Props) {
	const { t } = useTranslation()
	const [scope, setScope] = React.useState<RecurringScope>('occurrence')

	React.useEffect(() => {
		if (open) setScope('occurrence')
	}, [open])

	const dateLabel = React.useMemo(() => {
		const d = dayjs(occurrenceDate)
		if (!d.isValid()) return occurrenceDate
		return new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(d.toDate())
	}, [occurrenceDate, locale])

	const primaryLabel = mode === 'delete' ? t('Delete') : t('Save changes')
	const title = mode === 'delete' ? t('Delete recurring event') : t('Edit recurring event')
	const body =
		mode === 'delete'
			? t('This event repeats. Which occurrences should be deleted?')
			: t('This event repeats. Which occurrences should the changes apply to?')

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		onChoose(scope)
	}

	return (
		<Dialog
			open={open}
			onClose={onCancel}
			title={title}
			description={body}
			size="sm"
			onSubmit={handleSubmit}
			footer={
				<ActionBar>
					<Button type="button" onClick={onCancel}>
						{t('Cancel')}
					</Button>
					<Button type="submit" color={mode === 'delete' ? 'error' : 'primary'}>
						{primaryLabel}
					</Button>
				</ActionBar>
			}
		>
			<RadioGroup<RecurringScope>
				aria-label={t('Scope')}
				value={scope}
				onChange={setScope}
				options={[
					{
						value: 'occurrence',
						label: t('This event only'),
						description: t('Only the occurrence on {{date}}', { date: dateLabel })
					},
					{
						value: 'following',
						label: t('This and following events'),
						description: t('All occurrences from {{date}} onward', { date: dateLabel })
					},
					{
						value: 'series',
						label: t('All events in the series'),
						description: t('Every occurrence, past and future')
					}
				]}
			/>
		</Dialog>
	)
}

// vim: ts=4
