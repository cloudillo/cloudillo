// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
