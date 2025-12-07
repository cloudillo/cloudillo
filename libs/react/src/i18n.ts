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

import { useTranslation } from 'react-i18next'

type TFunction = (key: string, options?: Record<string, unknown>) => string

/**
 * A wrapper around useTranslation that falls back to returning the key
 * (which should be English text) if i18n is not initialized.
 */
export function useLibTranslation(): { t: TFunction } {
	try {
		const { t, i18n } = useTranslation()
		if (i18n.isInitialized) {
			return { t: t as TFunction }
		}
	} catch {
		// i18n not available
	}
	// Fallback: return identity function (key is English text)
	return { t: (key: string) => key }
}

// vim: ts=4
