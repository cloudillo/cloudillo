// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { atom, useAtom } from 'jotai'

const qrScannerOpenAtom = atom(false)

export function useQrScanner() {
	return useAtom(qrScannerOpenAtom)
}

// vim: ts=4
