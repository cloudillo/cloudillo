// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilard Hajba
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
import { LuSearch as IcSearch, LuX as IcClose } from 'react-icons/lu'

import type { NominatimResult } from './types.js'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

interface SearchBarProps {
	onSelect: (result: NominatimResult) => void
	privacyAcknowledged: boolean
	onPrivacyAcknowledge: () => void
}

export function SearchBar({ onSelect, privacyAcknowledged, onPrivacyAcknowledge }: SearchBarProps) {
	const [query, setQuery] = React.useState('')
	const [results, setResults] = React.useState<NominatimResult[]>([])
	const [loading, setLoading] = React.useState(false)
	const [showResults, setShowResults] = React.useState(false)
	const [showPrivacyNotice, setShowPrivacyNotice] = React.useState(false)
	const containerRef = React.useRef<HTMLDivElement>(null)

	// Close results dropdown on outside click
	React.useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setShowResults(false)
			}
		}
		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [])

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
		if (e.key === 'Enter') {
			e.preventDefault()
			doSearch()
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
					placeholder="Search location..."
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={handleKeyDown}
					onFocus={() => results.length > 0 && setShowResults(true)}
				/>
				{query && (
					<button className="mapillo-search-clear" onClick={clearSearch} title="Clear">
						<IcClose />
					</button>
				)}
				<button
					className="mapillo-search-btn"
					onClick={() => doSearch()}
					disabled={loading || !query.trim()}
					title="Search"
				>
					{loading ? '...' : 'Go'}
				</button>
			</div>

			{showPrivacyNotice && (
				<div className="mapillo-privacy-notice">
					<p>
						This will contact <b>OpenStreetMap Nominatim</b> servers. Your search query
						will be sent to nominatim.openstreetmap.org.
					</p>
					<div className="mapillo-privacy-actions">
						<button onClick={() => setShowPrivacyNotice(false)}>Cancel</button>
						<button className="mapillo-btn-primary" onClick={handlePrivacyAccept}>
							OK, search
						</button>
					</div>
				</div>
			)}

			{showResults && results.length > 0 && (
				<ul className="mapillo-search-results">
					{results.map((r) => (
						<li key={r.place_id} onClick={() => handleSelect(r)}>
							<span className="mapillo-result-name">
								{r.display_name.split(',')[0]}
							</span>
							<span className="mapillo-result-detail">
								{r.display_name.split(',').slice(1, 3).join(',')}
							</span>
						</li>
					))}
					<li className="mapillo-search-attribution">Powered by OSM Nominatim</li>
				</ul>
			)}

			{showResults && results.length === 0 && !loading && query.trim() && (
				<div className="mapillo-search-results">
					<div className="mapillo-no-results">No results found</div>
				</div>
			)}
		</div>
	)
}

// vim: ts=4
