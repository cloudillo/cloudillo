// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * New-publication template gallery. Shown by `app.tsx` to writers while `secs` is
 * empty; it closes by itself when `secs` fills — locally or by a collaborator's apply.
 */

import {
	Button,
	HBox,
	IcBook,
	IcColumns,
	IcDocument,
	IcFile,
	IcImage,
	Panel,
	Segmented,
	SegmentedItem,
	VBox
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
		<div className="flex-fill p-4 pagillo-gallery">
			<Panel title={t('Choose a template')} padding={4} className="pagillo-gallery-card">
				<VBox gap={3} className="mt-3">
					<Segmented
						layout="grid"
						value={id}
						onChange={(v) => setId(v as TemplateId)}
						className="pagillo-gallery-templates"
						aria-label={t('Template')}
					>
						{TEMPLATES.map((tp) => (
							<SegmentedItem key={tp.id} value={tp.id} icon={ICONS[tp.id]}>
								{t(tp.name)}
							</SegmentedItem>
						))}
					</Segmented>
					<HBox gap={3}>
						<Segmented
							value={size}
							onChange={(v) => setSize(v as PagePreset)}
							aria-label={t('Page size')}
						>
							<SegmentedItem value="A4">A4</SegmentedItem>
							<SegmentedItem value="Letter">{t('Letter')}</SegmentedItem>
						</Segmented>
						<Segmented
							value={orientation}
							onChange={(v) => setOrientation(v as Orientation)}
							aria-label={t('Orientation')}
						>
							<SegmentedItem value="portrait">{t('Portrait')}</SegmentedItem>
							<SegmentedItem value="landscape">{t('Landscape')}</SegmentedItem>
						</Segmented>
					</HBox>
					<HBox>
						<Button color="primary" onClick={create}>
							{t('Create publication')}
						</Button>
					</HBox>
				</VBox>
			</Panel>
		</div>
	)
}

// vim: ts=4
