// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ActionView } from '@cloudillo/types'
import { atom } from 'jotai'

import type { AudienceTarget } from './AudienceSelector.js'

export interface QuoteIntent {
	original: ActionView
	target: AudienceTarget
}

/** Set by a non‑feed surface (e.g. a profile page) to request the feed app open
 * its quote composer on mount. FeedApp consumes and clears it (one‑shot, so the
 * back button doesn't re‑trigger). */
export const pendingQuoteAtom = atom<QuoteIntent | undefined>(undefined)

// vim: ts=4
