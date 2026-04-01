// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useState, useEffect } from 'react'

const MOBILE_QUERY = '(max-width: 767px)'

export function useIsMobile(): boolean {
	const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)

	useEffect(() => {
		const mql = window.matchMedia(MOBILE_QUERY)
		const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
		mql.addEventListener('change', onChange)
		return () => mql.removeEventListener('change', onChange)
	}, [])

	return isMobile
}

// vim: ts=4
