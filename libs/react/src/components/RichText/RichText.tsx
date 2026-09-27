// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { Clamp } from '../Clamp/index.js'
import { generateFragments } from '../formatted-text.js'
import type { TextSize } from '../Text/index.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface RichTextProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Plain text: blank lines split paragraphs, single newlines become line breaks */
	text: string
	size?: TextSize
	/** Collapse to this many lines behind a "Show more" toggle */
	clamp?: number
}

/** One line with links, hashtags and emoji highlighted. */
function renderLine(line: string) {
	return generateFragments(line).map((n, k) => <React.Fragment key={k}>{n}</React.Fragment>)
}

/**
 * User-written text: paragraphs, line breaks, links, hashtags and emoji.
 * Kept in `formatted-text`'s module graph (react-router), never imported by `doc-bar`.
 */
export const RichText = createComponent<HTMLDivElement, RichTextProps>(
	'RichText',
	({ text, size, clamp, className, ...props }, ref) => {
		const paragraphs = text.split('\n\n').map((paragraph, i) => (
			<p key={i}>
				{paragraph.split('\n').map((line, j, arr) => (
					<React.Fragment key={j}>
						{renderLine(line)}
						{j < arr.length - 1 && <br />}
					</React.Fragment>
				))}
			</p>
		))
		const classes = mergeClasses('c-rich-text', size && `text-${size}`, className)

		return clamp ? (
			<Clamp ref={ref} lines={clamp} className={classes} {...props}>
				{paragraphs}
			</Clamp>
		) : (
			<div ref={ref} className={classes} {...props}>
				{paragraphs}
			</div>
		)
	}
)

// vim: ts=4
