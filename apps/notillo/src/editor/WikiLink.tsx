// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createReactInlineContentSpec } from '@blocknote/react'
import { useNotilloEditor } from './NotilloEditorContext.js'

export const WikiLink = createReactInlineContentSpec(
	{
		type: 'wikiLink' as const,
		content: 'none' as const,
		propSchema: {
			pageId: { default: '' },
			pageTitle: { default: 'Untitled' }
		}
	},
	{
		render: (props) => {
			const { pageId, pageTitle } = props.inlineContent.props
			const { pages } = useNotilloEditor()
			const page = pageId ? pages.get(pageId) : undefined
			const displayTitle = page?.title || pageTitle || 'Untitled'
			const isBroken = !!pageId && !page

			return (
				<span
					className={`notillo-wiki-link${isBroken ? ' broken' : ''}`}
					data-page-id={pageId}
					title={displayTitle}
				>
					{displayTitle}
				</span>
			)
		}
	}
)

// vim: ts=4
