// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import dayjs from 'dayjs'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Modal } from '@cloudillo/react'

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
		<Modal open={open} onClose={onCancel}>
			<form
				className="c-dialog c-panel emph"
				style={{ maxWidth: '460px', width: '100%' }}
				onSubmit={handleSubmit}
				onKeyDown={(e) => {
					if (e.key === 'Escape') {
						e.preventDefault()
						onCancel()
					}
				}}
			>
				<div className="c-cal-editor__header">
					<h3 className="m-0">{title}</h3>
				</div>
				<div className="c-cal-editor__body">
					<p style={{ marginTop: 0 }}>{body}</p>
					<fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
						<legend className="sr-only">{t('Scope')}</legend>
						<label className="d-flex align-items-flex-start g-2 mb-2">
							<input
								type="radio"
								name="scope"
								value="occurrence"
								checked={scope === 'occurrence'}
								onChange={() => setScope('occurrence')}
								autoFocus
							/>
							<span>
								<strong>{t('This event only')}</strong>
								<div
									className="c-hint"
									style={{ fontSize: '0.8rem', opacity: 0.75 }}
								>
									{t('Only the occurrence on {{date}}', { date: dateLabel })}
								</div>
							</span>
						</label>
						<label className="d-flex align-items-flex-start g-2 mb-2">
							<input
								type="radio"
								name="scope"
								value="following"
								checked={scope === 'following'}
								onChange={() => setScope('following')}
							/>
							<span>
								<strong>{t('This and following events')}</strong>
								<div
									className="c-hint"
									style={{ fontSize: '0.8rem', opacity: 0.75 }}
								>
									{t('All occurrences from {{date}} onward', {
										date: dateLabel
									})}
								</div>
							</span>
						</label>
						<label className="d-flex align-items-flex-start g-2">
							<input
								type="radio"
								name="scope"
								value="series"
								checked={scope === 'series'}
								onChange={() => setScope('series')}
							/>
							<span>
								<strong>{t('All events in the series')}</strong>
								<div
									className="c-hint"
									style={{ fontSize: '0.8rem', opacity: 0.75 }}
								>
									{t('Every occurrence, past and future')}
								</div>
							</span>
						</label>
					</fieldset>
				</div>
				<div className="c-cal-editor__footer">
					<Button type="button" onClick={onCancel}>
						{t('Cancel')}
					</Button>
					<Button type="submit" variant="primary">
						{primaryLabel}
					</Button>
				</div>
			</form>
		</Modal>
	)
}
