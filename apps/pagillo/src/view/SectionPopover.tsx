// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Section settings, anchored to a Pages-rail separator: first/other page layout, start parity,
 * page numbering, page cap, reorder, duplicate, remove.
 */

import {
	Button,
	Checkbox,
	IcDelete,
	IcDuplicate,
	IcMoveDown,
	IcMoveUp,
	Input,
	NativeSelect,
	NumberInput,
	PopoverSurface,
	PropertyField,
	useDialog
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { mastersOf, sectionOf } from '../crdt/entities'
import type { SectionId } from '../crdt/ids'
import { deleteSection, duplicateSection, moveSection, updateSection } from '../crdt/section-ops'
import type { StoredSection } from '../crdt/stored-types'
import type { PanelProps } from '../panels/FormatPanel'
import { useDocVersion } from '../panels/useY'

export interface SectionPopoverProps extends PanelProps {
	secId: SectionId
	anchor: HTMLElement
	onClose(): void
	/** "Edit layout…": open the page-layout editor on this master id. */
	onEditLayout(masterId: string): void
}

export function SectionPopover({
	yDoc,
	doc,
	secId,
	anchor,
	onClose,
	onEditLayout
}: SectionPopoverProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	useDocVersion(doc)
	const s = sectionOf(doc, secId)
	if (!s) return null

	const ids = doc.secs.toArray()
	const index = ids.indexOf(secId)
	const masters = mastersOf(doc)
	const pageNum = s.pageNum ?? { restart: false, format: '' }
	const update = (p: Partial<Omit<StoredSection, 'story'>>) => updateSection(yDoc, doc, secId, p)
	const setPageNum = (p: { restart: boolean; format: string }) =>
		update({ pageNum: p.restart || p.format ? p : undefined })
	const layoutSelect = (key: 'first' | 'rest') => (
		<NativeSelect
			value={s[key]}
			onChange={(e) =>
				update(key === 'first' ? { first: e.target.value } : { rest: e.target.value })
			}
		>
			{masters.map(([mid, m]) => (
				<option key={mid} value={mid}>
					{m.name}
				</option>
			))}
		</NativeSelect>
	)

	const remove = async () => {
		const ok = await dialog.confirm(
			t('Remove section'),
			t('The section and all its text and images are removed.')
		)
		if (!ok) return
		onClose()
		deleteSection(yDoc, doc, secId)
	}

	return (
		<PopoverSurface
			anchor={anchor}
			placement="right-start"
			width="md"
			onClose={onClose}
			aria-label={t('Section {{n}}', { n: index + 1 })}
		>
			<div className="c-vbox g-2 p-2">
				<PropertyField label={t('First page')}>{layoutSelect('first')}</PropertyField>
				<PropertyField label={t('Other pages')}>{layoutSelect('rest')}</PropertyField>
				<div>
					<Button variant="link" onClick={() => onEditLayout(s.first)}>
						{t('Edit layout…')}
					</Button>
				</div>
				<PropertyField label={t('Start on')}>
					<NativeSelect
						value={s.start}
						onChange={(e) =>
							update({ start: e.target.value as StoredSection['start'] })
						}
					>
						<option value="any">{t('Any page')}</option>
						<option value="odd">{t('Odd page')}</option>
						<option value="even">{t('Even page')}</option>
					</NativeSelect>
				</PropertyField>
				<Checkbox
					label={t('Restart page numbers')}
					checked={pageNum.restart}
					onChange={(e) => setPageNum({ ...pageNum, restart: e.target.checked })}
				/>
				<PropertyField label={t('Number format')}>
					<Input
						key={pageNum.format}
						defaultValue={pageNum.format}
						placeholder="1"
						title={t('1, a, A, i or I, with any text around it')}
						onBlur={(e) => {
							const format = e.target.value
							if (format !== pageNum.format) setPageNum({ ...pageNum, format })
						}}
					/>
				</PropertyField>
				<Checkbox
					label={t('Limit page count')}
					checked={s.maxPages !== undefined}
					onChange={(e) => update({ maxPages: e.target.checked ? 1 : undefined })}
				/>
				{s.maxPages !== undefined && (
					<PropertyField label={t('Maximum pages')}>
						<NumberInput
							value={s.maxPages}
							min={1}
							onChange={(n) => update({ maxPages: Math.max(1, Math.round(n)) })}
						/>
					</PropertyField>
				)}
				<div className="c-hbox g-1">
					<Button
						variant="ghost"
						icon={<IcMoveUp />}
						aria-label={t('Move section up')}
						disabled={index <= 0}
						onClick={() => moveSection(yDoc, doc, secId, index - 1)}
					/>
					<Button
						variant="ghost"
						icon={<IcMoveDown />}
						aria-label={t('Move section down')}
						disabled={index >= ids.length - 1}
						onClick={() => moveSection(yDoc, doc, secId, index + 1)}
					/>
					<Button
						variant="ghost"
						icon={<IcDuplicate />}
						onClick={() => {
							duplicateSection(yDoc, doc, secId)
							onClose()
						}}
					>
						{t('Duplicate section')}
					</Button>
					<Button
						variant="ghost"
						color="error"
						icon={<IcDelete />}
						aria-label={t('Remove section')}
						disabled={ids.length <= 1}
						onClick={remove}
					/>
				</div>
			</div>
		</PopoverSurface>
	)
}

// vim: ts=4
