// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Highlight } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { PiFileBold as IcPage } from 'react-icons/pi'

import type { SearchResult } from '../utils/search.js'

export interface SearchResultRowProps {
	result: SearchResult
	/** Keyboard cursor position — distinct from `selected`, the open page. */
	active?: boolean
	/**
	 * Scroll this row into view. Kept separate from `active` because hover also
	 * moves the cursor, and scrolling on hover slides another row under a
	 * stationary pointer, which fires `pointerenter` again.
	 */
	scrollIntoView?: boolean
	selected?: boolean
	id?: string
	/** Replaces the page glyph — tag rows pass their own icon. */
	iconNode?: React.ReactNode
	/** Rendered after the body: the tag rows' count badge and active dot. */
	trailing?: React.ReactNode
	onSelect: () => void
	onPointerEnter?: () => void
}

export function SearchResultRow({
	result,
	active,
	scrollIntoView,
	selected,
	id,
	iconNode,
	trailing,
	onSelect,
	onPointerEnter
}: SearchResultRowProps) {
	const { t } = useTranslation()
	const ref = React.useRef<HTMLButtonElement>(null)
	const title = result.title || t('Untitled')

	// Keep the keyboard cursor visible while arrowing through a long list.
	React.useEffect(() => {
		if (scrollIntoView) ref.current?.scrollIntoView({ block: 'nearest' })
	}, [scrollIntoView])

	return (
		<button
			ref={ref}
			id={id}
			type="button"
			role="option"
			// The search input is the combobox's only tab stop — the cursor moves
			// through the rows with `aria-activedescendant`, not with focus.
			tabIndex={-1}
			aria-selected={!!active}
			className={`notillo-search-result${active ? ' active' : ''}${selected ? ' current' : ''}`}
			title={title}
			onClick={onSelect}
			onPointerEnter={onPointerEnter}
		>
			<span className="notillo-search-result-icon">
				{iconNode ?? (result.icon ? <span>{result.icon}</span> : <IcPage />)}
			</span>
			<span className="notillo-search-result-body">
				<span className="notillo-search-result-title">
					<Highlight
						text={title}
						matches={result.titleMatch && [result.titleMatch]}
						markClassName="notillo-search-mark"
					/>
				</span>
				{result.path.length > 0 && (
					<span className="notillo-search-result-path">
						{result.path.map((p) => p || t('Untitled')).join(' / ')}
					</span>
				)}
				{result.snippet && (
					<span className="notillo-search-result-snippet">
						<Highlight
							text={result.snippet}
							matches={result.snippetMatches}
							markClassName="notillo-search-mark"
						/>
					</span>
				)}
			</span>
			{trailing}
		</button>
	)
}

// vim: ts=4
