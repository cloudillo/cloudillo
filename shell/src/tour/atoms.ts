// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { atom, useSetAtom } from 'jotai'

/** Guided tour: `'offer'` asks first (post-onboarding), an object is a running tour. */
export type TourState = null | 'offer' | { step: number }

export const tourAtom = atom<TourState>(null)

/** Start the tour here; it comes back to the current page when done. */
export function useStartTour() {
	const setTour = useSetAtom(tourAtom)
	return () => setTour({ step: 0 })
}

// vim: ts=4
