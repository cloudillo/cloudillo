// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as React from 'react'

import { Clamp } from '../Clamp/index.js'
import { generateFragments } from '../formatted-text.js'
import { PersonHover } from '../Person/PersonHover.js'
import type { TextSize } from '../Text/index.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface RichTextProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Plain text: blank lines split paragraphs, single newlines become line breaks */
	text: string
	size?: TextSize
	/** Collapse to this many lines behind a "Show more" toggle */
	clamp?: number
	/** Render `@idTag` / `@all` tokens as idTag pills (with a person card). Default off. */
	mentions?: boolean
	/** With `mentions`: render `@all` as a pill (it notifies everyone). Off → plain text. Default off. */
	allowAll?: boolean
}

// `@all`, or `@idTag` (a domain, so at least one dot) at a word start (not an e-mail);
// a trailing dot is punctuation, not the tag (but `@all.example.org` is an idTag). Exactly
// two capturing groups, the leading whitespace and the mention, so `split` cycles
// [text, lead, mention]. No lookbehind: Safari before 16.4 rejects it.
const MENTION_RE =
	/(^|\s)(@(?:all(?![\w-]|\.[a-z0-9])|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+))/i

function MentionPill({ idTag, allowAll }: { idTag: string; allowAll: boolean }) {
	if (idTag.toLowerCase() === 'all')
		return allowAll ? <span className="c-tag mention">@all</span> : <>@{idTag}</>
	// The idTag, never the self-chosen display name (anyone can call themselves "Alice")
	return (
		<PersonHover idTag={idTag}>
			<span className="c-tag mention" tabIndex={0}>
				@{idTag}
			</span>
		</PersonHover>
	)
}

/** One line with links, hashtags and emoji highlighted (and mention pills when asked). */
function renderLine(line: string, mentions?: boolean, allowAll = false) {
	const parts = mentions ? line.split(MENTION_RE) : [line]
	return parts.map((part, i) =>
		i % 3 === 2 ? (
			<MentionPill key={i} idTag={part.slice(1)} allowAll={allowAll} />
		) : i % 3 === 1 ? (
			<React.Fragment key={i}>{part}</React.Fragment>
		) : (
			<React.Fragment key={i}>
				{generateFragments(part).map((n, k) => (
					<React.Fragment key={k}>{n}</React.Fragment>
				))}
			</React.Fragment>
		)
	)
}

/**
 * User-written text: paragraphs, line breaks, links, hashtags and emoji.
 * Kept in `formatted-text`'s module graph (react-router), never imported by `doc-bar`.
 */
export const RichText = createComponent<HTMLDivElement, RichTextProps>(
	'RichText',
	({ text, size, clamp, mentions, allowAll, className, ...props }, ref) => {
		const paragraphs = text.split('\n\n').map((paragraph, i) => (
			<p key={i}>
				{paragraph.split('\n').map((line, j, arr) => (
					<React.Fragment key={j}>
						{renderLine(line, mentions, allowAll)}
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
