// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Properties panel for view/slide editing (shown when no objects are selected)
 */

import { PropertySection } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useY } from 'react-yjs'
import type * as Y from 'yjs'

import type { ViewId, YPrezilloDocument } from '../../crdt'
import { getView } from '../../crdt'
import { NotesEditor } from '../NotesEditor'
import { TemplateSelector } from '../TemplateSelector'
import { BackgroundSection } from './BackgroundSection'

export interface ViewPropertiesPanelProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	activeViewId: ViewId
	/** Document synced (speaker notes are created lazily only then) */
	synced: boolean
}

export function ViewPropertiesPanel({ doc, yDoc, activeViewId, synced }: ViewPropertiesPanelProps) {
	// Subscribe to view changes
	useY(doc.v)
	const { t } = useTranslation()

	const view = getView(doc, activeViewId)

	if (!view) {
		return <div className="c-empty-message">View not found</div>
	}

	return (
		<div className="c-vbox g-2">
			<TemplateSelector doc={doc} yDoc={yDoc} viewId={activeViewId} />
			<BackgroundSection doc={doc} yDoc={yDoc} view={view} />
			<PropertySection title={t('Speaker notes')}>
				<NotesEditor
					yDoc={yDoc}
					doc={doc}
					viewId={activeViewId}
					synced={synced}
					ariaLabel={t('Speaker notes')}
				/>
			</PropertySection>
		</div>
	)
}

// vim: ts=4
