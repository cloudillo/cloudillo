// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { atom, useAtom } from 'jotai'

const qrScannerOpenAtom = atom(false)

export function useQrScanner() {
	return useAtom(qrScannerOpenAtom)
}

export function browserName(t: (key: string) => string, ua?: string): string {
	if (!ua) return t('Unknown browser')
	if (ua.includes('Firefox')) return 'Firefox'
	if (ua.includes('Edg/')) return 'Edge'
	if (ua.includes('Chrome')) return 'Chrome'
	if (ua.includes('Safari')) return 'Safari'
	return t('Unknown browser')
}

// Per-device opt-out of the native BarcodeDetector: with GrapheneOS sandboxed Google Play it is very slow
const QR_NATIVE_OFF_KEY = 'cloudillo.qrNativeOff'

export function isQrNativeOff(): boolean {
	try {
		return localStorage.getItem(QR_NATIVE_OFF_KEY) === '1'
	} catch {
		return false
	}
}

export function setQrNativeOff(off: boolean) {
	try {
		if (off) localStorage.setItem(QR_NATIVE_OFF_KEY, '1')
		else localStorage.removeItem(QR_NATIVE_OFF_KEY)
	} catch {
		// localStorage may be unavailable (sandboxed contexts, etc.)
	}
}

// vim: ts=4
