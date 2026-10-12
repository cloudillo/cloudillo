// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Publication settings dialog, opened from the docbar menu: page size, orientation, facing pages,
 * language, "Apply style set from template…". Per-user view prefs live in the status-bar popover.
 */

import {
	Button,
	Dialog,
	Input,
	NativeSelect,
	PropertyField,
	PropertySection,
	Segmented,
	SegmentedItem,
	Toggle
} from '@cloudillo/react'
import { FX } from '@cloudillo/typeset'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { setMeta } from '../crdt/document'
import { setPageSize } from '../crdt/master-ops'
import type { PageSize } from '../crdt/runtime-types'
import { applyStyleSet } from '../crdt/style-ops'
import { PAGE_SIZES } from '../crdt/type-converters'
import {
	type Orientation,
	type PagePreset,
	pageSize,
	TEMPLATES,
	type TemplateId,
	templateStyleSet
} from '../templates'
import { LengthInput } from '../ui/LengthInput'
import type { PanelProps } from './FormatPanel'
import { useDocVersion } from './useY'

export interface PublicationSettingsProps extends PanelProps {
	onClose(): void
}

export function PublicationSettings({ yDoc, doc, onClose }: PublicationSettingsProps) {
	const { t } = useTranslation()
	useDocVersion(doc)
	const [styleSet, setStyleSet] = React.useState<TemplateId>('simple')

	const page = (doc.m.get('page') as PageSize | undefined) ?? PAGE_SIZES.A4
	const orientation: Orientation = page.w > page.h ? 'landscape' : 'portrait'
	const preset =
		(Object.keys(PAGE_SIZES) as PagePreset[]).find((p) => {
			const s = pageSize(p, orientation)
			return s.w === page.w && s.h === page.h
		}) ?? 'custom'
	const lang = (doc.m.get('lang') as string | undefined) ?? ''

	/** Proportional rescale of every page layout, one transaction. */
	const resize = ({ w, h }: PageSize) => {
		if (w > 0 && h > 0 && (w !== page.w || h !== page.h)) setPageSize(yDoc, doc, w, h)
	}

	return (
		<Dialog open size="md" title={t('Publication settings')} onClose={onClose}>
			<PropertySection title={t('Publication')}>
				<PropertyField label={t('Page size')}>
					<NativeSelect
						value={preset}
						onChange={(e) => {
							const v = e.target.value
							if (v !== 'custom') resize(pageSize(v as PagePreset, orientation))
						}}
					>
						<option value="A4">A4</option>
						<option value="Letter">{t('Letter')}</option>
						<option value="custom">{t('Custom')}</option>
					</NativeSelect>
				</PropertyField>
				<PropertyField label={t('Width')}>
					<LengthInput
						min={FX}
						value={page.w}
						onChange={(w) => resize({ w, h: page.h })}
					/>
				</PropertyField>
				<PropertyField label={t('Height')}>
					<LengthInput
						min={FX}
						value={page.h}
						onChange={(h) => resize({ w: page.w, h })}
					/>
				</PropertyField>
				<PropertyField label={t('Orientation')}>
					<Segmented
						value={orientation}
						onChange={(o) => resize(pageSize(page, o as Orientation))}
					>
						<SegmentedItem value="portrait">{t('Portrait')}</SegmentedItem>
						<SegmentedItem value="landscape">{t('Landscape')}</SegmentedItem>
					</Segmented>
				</PropertyField>
				<Toggle
					label={t('Facing pages')}
					checked={!!doc.m.get('facing')}
					onChange={(e) => setMeta(yDoc, doc, { facing: e.target.checked })}
				/>
				<PropertyField label={t('Language')}>
					<Input
						key={lang}
						defaultValue={lang}
						placeholder="en-US"
						onBlur={(e) => {
							const v = e.target.value.trim()
							if (v !== lang) setMeta(yDoc, doc, { lang: v || undefined })
						}}
					/>
				</PropertyField>
			</PropertySection>
			<PropertySection title={t('Apply style set from template…')}>
				<p className="small text-muted">
					{t('Styles with the same name are replaced; your text keeps its styles.')}
				</p>
				<div className="c-hbox g-2">
					<NativeSelect
						className="flex-fill"
						value={styleSet}
						onChange={(e) => setStyleSet(e.target.value as TemplateId)}
					>
						{TEMPLATES.map((tp) => (
							<option key={tp.id} value={tp.id}>
								{t(tp.name)}
							</option>
						))}
					</NativeSelect>
					<Button onClick={() => applyStyleSet(yDoc, doc, templateStyleSet(styleSet))}>
						{t('Apply')}
					</Button>
				</div>
			</PropertySection>
		</Dialog>
	)
}

// vim: ts=4
