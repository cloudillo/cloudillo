// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { IcClear, IcSearch, useOutsideClick } from '@cloudillo/react'
import * as React from 'react'
import { Trans, useTranslation } from 'react-i18next'

import type { NominatimResult } from './types.js'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

interface SearchBarProps {
	onSelect: (result: NominatimResult) => void
	privacyAcknowledged: boolean
	onPrivacyAcknowledge: () => void
}

export function SearchBar({ onSelect, privacyAcknowledged, onPrivacyAcknowledge }: SearchBarProps) {
	const { t } = useTranslation()
	const [query, setQuery] = React.useState('')
	const [results, setResults] = React.useState<NominatimResult[]>([])
	const [loading, setLoading] = React.useState(false)
	const [showResults, setShowResults] = React.useState(false)
	const [showPrivacyNotice, setShowPrivacyNotice] = React.useState(false)
	const [active, setActive] = React.useState(-1)
	const containerRef = React.useRef<HTMLDivElement>(null)
	const baseId = React.useId()
	const listId = `${baseId}-list`
	const optionId = (i: number) => `${baseId}-opt-${i}`
	const listOpen = showResults && results.length > 0

	// New results, a closed list or a cleared query start with no active option
	React.useEffect(() => setActive(-1), [results, showResults])

	React.useEffect(() => {
		if (active >= 0)
			document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' })
	}, [active])

	// Close results dropdown on outside click
	useOutsideClick(containerRef, () => setShowResults(false))

	async function doSearch(bypassPrivacy = false) {
		const trimmed = query.trim()
		if (!trimmed) return

		if (!bypassPrivacy && !privacyAcknowledged) {
			setShowPrivacyNotice(true)
			return
		}

		setLoading(true)
		try {
			const params = new URLSearchParams({
				q: trimmed,
				format: 'json',
				limit: '8'
			})
			let res = await fetch(`${NOMINATIM_URL}?${params}`, {
				headers: { 'Accept-Language': navigator.language || 'en' }
			})
			// Retry once on 425 Too Early (TLS early-data rejection)
			if (res.status === 425) {
				res = await fetch(`${NOMINATIM_URL}?${params}`, {
					headers: { 'Accept-Language': navigator.language || 'en' }
				})
			}
			if (!res.ok) throw new Error(`Nominatim error: ${res.status}`)
			const data: NominatimResult[] = await res.json()
			setResults(data)
			setShowResults(true)
		} catch (err) {
			console.error('[Mapillo] Search error:', err)
			setResults([])
		} finally {
			setLoading(false)
		}
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			if (!listOpen) return
			e.preventDefault()
			const n = results.length
			const down = e.key === 'ArrowDown'
			setActive((i) => (down ? (i + 1) % n : (i <= 0 ? n : i) - 1))
		} else if (e.key === 'Enter') {
			e.preventDefault()
			if (listOpen && active >= 0) handleSelect(results[active])
			else doSearch()
		} else if (e.key === 'Escape' && showResults) {
			e.preventDefault()
			setShowResults(false)
		}
	}

	function handleSelect(result: NominatimResult) {
		setShowResults(false)
		setQuery(result.display_name.split(',')[0])
		onSelect(result)
	}

	function handlePrivacyAccept() {
		onPrivacyAcknowledge()
		setShowPrivacyNotice(false)
		doSearch(true)
	}

	function clearSearch() {
		setQuery('')
		setResults([])
		setShowResults(false)
	}

	return (
		<div ref={containerRef} className="mapillo-search">
			<div className="mapillo-search-input">
				<IcSearch className="mapillo-search-icon" />
				<input
					type="text"
					role="combobox"
					aria-autocomplete="list"
					aria-expanded={listOpen}
					aria-controls={listOpen ? listId : undefined}
					aria-activedescendant={listOpen && active >= 0 ? optionId(active) : undefined}
					placeholder={t('Search location...')}
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={handleKeyDown}
					onFocus={() => results.length > 0 && setShowResults(true)}
				/>
				{query && (
					<button
						className="mapillo-search-clear"
						onClick={clearSearch}
						title={t('Clear')}
					>
						<IcClear />
					</button>
				)}
				<button
					className="mapillo-search-btn"
					onClick={() => doSearch()}
					disabled={loading || !query.trim()}
					title={t('Search')}
				>
					{loading ? '...' : t('Go')}
				</button>
			</div>

			{showPrivacyNotice && (
				<div className="mapillo-privacy-notice">
					<p>
						<Trans
							i18nKey="This will contact <0>OpenStreetMap Nominatim</0> servers. Your search query will be sent to nominatim.openstreetmap.org."
							components={[<b key="b" />]}
						/>
					</p>
					<div className="mapillo-privacy-actions">
						<button onClick={() => setShowPrivacyNotice(false)}>{t('Cancel')}</button>
						<button className="mapillo-btn-primary" onClick={handlePrivacyAccept}>
							{t('OK, search')}
						</button>
					</div>
				</div>
			)}

			{listOpen && (
				<div className="mapillo-search-results">
					<ul id={listId} role="listbox" className="mapillo-search-listbox">
						{results.map((r, i) => (
							<li
								key={r.place_id}
								id={optionId(i)}
								role="option"
								aria-selected={i === active}
								onClick={() => handleSelect(r)}
							>
								<span className="mapillo-result-name">
									{r.display_name.split(',')[0]}
								</span>
								<span className="mapillo-result-detail">
									{r.display_name.split(',').slice(1, 3).join(',')}
								</span>
							</li>
						))}
					</ul>
					<div className="mapillo-search-attribution">
						{t('Powered by OSM Nominatim')}
					</div>
				</div>
			)}

			{/* Kept mounted so screen readers announce the message when it appears */}
			<div aria-live="polite">
				{showResults && results.length === 0 && !loading && query.trim() && (
					<div className="mapillo-search-results">
						<div className="mapillo-no-results">{t('No results found')}</div>
					</div>
				)}
			</div>
		</div>
	)
}

// vim: ts=4
