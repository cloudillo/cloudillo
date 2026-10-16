// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * New-publication template gallery. Shown by `app.tsx` to writers while `secs` is
 * empty; it closes by itself when `secs` fills — locally or by a collaborator's apply.
 */

import {
	Button,
	IcBook,
	IcColumns,
	IcDocument,
	IcFile,
	IcImage,
	Segmented,
	SegmentedItem
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import type * as Y from 'yjs'

import type { YPagilloDocument } from '../crdt/stored-types'
import { IcAnnouncement, IcNewsletter } from '../icons.js'
import {
	applyTemplate,
	type Orientation,
	type PagePreset,
	TEMPLATES,
	type TemplateId
} from '../templates'

const ICONS: Record<TemplateId, typeof IcFile> = {
	simple: IcDocument,
	'two-col': IcColumns,
	hero: IcImage,
	newsletter: IcNewsletter,
	report: IcBook,
	flyer: IcAnnouncement,
	blank: IcFile
}

export interface TemplateGalleryProps {
	yDoc: Y.Doc
	doc: YPagilloDocument
}

export function TemplateGallery({ yDoc, doc }: TemplateGalleryProps) {
	const { t, i18n } = useTranslation()
	const [id, setId] = React.useState<TemplateId>('simple')
	const [size, setSize] = React.useState<PagePreset>(() =>
		navigator.language === 'en-US' ? 'Letter' : 'A4'
	)
	const [orientation, setOrientation] = React.useState<Orientation>('portrait')

	// false = a collaborator applied one first; the `secs` observer in app.tsx closes us either way.
	const create = () =>
		applyTemplate(yDoc, doc, id, { size, orientation, lang: i18n.language, t: (s) => t(s) })

	return (
		<div className="c-vbox flex-fill g-3 p-4" style={{ overflowY: 'auto' }}>
			<h2>{t('Choose a template')}</h2>
			<Segmented layout="grid" value={id} onChange={(v) => setId(v as TemplateId)}>
				{TEMPLATES.map((tp) => (
					<SegmentedItem key={tp.id} value={tp.id} icon={ICONS[tp.id]}>
						{t(tp.name)}
					</SegmentedItem>
				))}
			</Segmented>
			<div className="c-hbox g-3">
				<Segmented value={size} onChange={(v) => setSize(v as PagePreset)}>
					<SegmentedItem value="A4">A4</SegmentedItem>
					<SegmentedItem value="Letter">{t('Letter')}</SegmentedItem>
				</Segmented>
				<Segmented value={orientation} onChange={(v) => setOrientation(v as Orientation)}>
					<SegmentedItem value="portrait">{t('Portrait')}</SegmentedItem>
					<SegmentedItem value="landscape">{t('Landscape')}</SegmentedItem>
				</Segmented>
			</div>
			<div>
				<Button color="primary" onClick={create}>
					{t('Create publication')}
				</Button>
			</div>
		</div>
	)
}

// vim: ts=4
