// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { createReactInlineContentSpec } from '@blocknote/react'
import * as React from 'react'

export const Tag = createReactInlineContentSpec(
	{
		type: 'tag' as const,
		content: 'none' as const,
		propSchema: {
			tag: { default: '' }
		}
	},
	{
		render: (props) => {
			const { tag } = props.inlineContent.props
			return (
				<span className="notillo-tag" data-tag={tag}>
					#{tag}
				</span>
			)
		}
	}
)

// vim: ts=4
