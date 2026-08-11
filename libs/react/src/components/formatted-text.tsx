// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Text with links, hashtags and emoji.
 *
 * Kept out of `utils.tsx` — which every component imports — because this is the
 * only thing in the component layer needing `react-router-dom`, and the router in
 * that module graph defeats `@cloudillo/react/doc-bar`'s reason to exist and
 * breaks any consumer without a `<Router>`. Only the shell uses these exports.
 */

import * as React from 'react'
import { Link } from 'react-router-dom'

/**
 * Emoji mappings for text fragment generation
 */
const emojis: Record<string, string> = {
	':)': '😊',
	';)': '😉',
	':D': '😄',
	XD: '🤣',
	':P': '😛',
	';P': '😜',
	':|': '😐',
	':/': '😕',
	':(': '😢',
	":'(": '😭',
	':O': '😮',
	'<3': '❤️'
}

/**
 * Generate React fragments from text with links, hashtags, and emoji support
 */
export function generateFragments(text: string): React.ReactNode[] {
	const fragments: React.ReactNode[] = []

	for (const w of text.split(/(\s+)/)) {
		let n: React.ReactNode = w

		switch (w[0]) {
			case 'h':
				if (w.match(/^https?:\/\//)) {
					if (w.startsWith(`https://${window.location.host}/`)) {
						n = <Link to={w.replace(`https://${window.location.host}/`, '/')}>{w}</Link>
					} else {
						n = (
							<a href={w} target="_blank" rel="noopener noreferrer">
								{w}
							</a>
						)
					}
				}
				break
			case '#':
				if (w.match(/^#\S+/)) {
					n = <span className="c-tag">{w}</span>
				}
				break
			case ':':
			case ';':
			case '<':
			case 'X': {
				const emoji = emojis[w]
				if (emoji) n = emoji
				break
			}
		}
		const last = fragments[fragments.length - 1]
		if (typeof n == 'string' && typeof last == 'string') {
			fragments[fragments.length - 1] = last + n
		} else {
			fragments.push(n)
		}
	}
	return fragments
}

/**
 * Component to render formatted text with paragraphs, line breaks, links, hashtags, and emojis
 */
export interface FormattedTextProps {
	content: string
	className?: string
}

export function FormattedText({ content, className }: FormattedTextProps) {
	if (!content) return null

	return (
		<div className={className}>
			{content.split('\n\n').map((paragraph, i) => (
				<p key={i}>
					{paragraph.split('\n').map((line, j) => (
						<React.Fragment key={j}>
							{generateFragments(line).map((n, k) => (
								<React.Fragment key={k}>{n}</React.Fragment>
							))}
							{j < paragraph.split('\n').length - 1 && <br />}
						</React.Fragment>
					))}
				</p>
			))}
		</div>
	)
}

// vim: ts=4
