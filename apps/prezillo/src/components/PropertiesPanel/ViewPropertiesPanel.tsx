// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
/**
 * Properties panel for view/slide editing (shown when no objects are selected)
 */

import type * as Y from 'yjs'
import { useY } from 'react-yjs'

import type { YPrezilloDocument, ViewId } from '../../crdt'
import { getView } from '../../crdt'
import { BackgroundSection } from './BackgroundSection'
import { TemplateSelector } from '../TemplateSelector'

export interface ViewPropertiesPanelProps {
	doc: YPrezilloDocument
	yDoc: Y.Doc
	activeViewId: ViewId
}

export function ViewPropertiesPanel({ doc, yDoc, activeViewId }: ViewPropertiesPanelProps) {
	// Subscribe to view changes
	useY(doc.v)

	const view = getView(doc, activeViewId)

	if (!view) {
		return <div className="c-empty-message">View not found</div>
	}

	return (
		<div className="c-vbox g-2">
			<TemplateSelector doc={doc} yDoc={yDoc} viewId={activeViewId} />
			<BackgroundSection doc={doc} yDoc={yDoc} view={view} />
			{/* Future: TransitionSection, NotesSection, etc. */}
		</div>
	)
}

// vim: ts=4
