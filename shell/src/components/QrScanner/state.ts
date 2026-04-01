// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { atom, useAtom } from 'jotai'

const qrScannerOpenAtom = atom(false)

export function useQrScanner() {
	return useAtom(qrScannerOpenAtom)
}

// vim: ts=4
