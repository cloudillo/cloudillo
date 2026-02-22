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
