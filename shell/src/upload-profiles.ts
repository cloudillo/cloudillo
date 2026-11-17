// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

export const UPLOAD_PROFILES = ['orig', 'preview', 'standard', 'high', 'compact'] as const
export type UploadProfile = (typeof UPLOAD_PROFILES)[number]

/** A switch rather than a lookup table so `pnpm run l-scan` sees every literal key. */
export function profileLabel(t: (key: string) => string, profile: UploadProfile): string {
	switch (profile) {
		case 'standard':
			return t('Standard')
		case 'high':
			return t('High quality')
		case 'compact':
			return t('Space saving')
		case 'preview':
			return t('Preview')
		case 'orig':
			return t('Original only')
	}
}
