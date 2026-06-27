// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { UploadError, type UploadErrorKind } from '@cloudillo/core'
import type { TFunction } from 'i18next'

export const getUploadErrorMessages = (t: TFunction): Record<UploadErrorKind, string> => ({
	auth: t('Session expired — please reload and try again.'),
	forbidden: t("You don't have permission to upload here."),
	too_large: t('File is too large for this server.'),
	network: t('Network error — check your connection.'),
	invalid_response: t('Upload failed — invalid server response.'),
	server: t('Server error — please try again.')
})

export function getUploadErrorMessage(t: TFunction, err: unknown): string {
	const messages = getUploadErrorMessages(t)
	if (err instanceof UploadError) {
		if (err.kind === 'invalid_response' && err.detail) return err.detail
		return messages[err.kind]
	}
	return messages.invalid_response
}

// vim: ts=4
