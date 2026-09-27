// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	CopyButton,
	Dialog,
	HBox,
	Heading,
	IdentityTag,
	ProfilePicture,
	QRCode,
	Text,
	useAuth,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { buildCloudilloUri } from '../../utils/cloudillo-uri.js'

export interface BusinessCardDialogProps {
	open: boolean
	onClose: () => void
}

export function BusinessCardDialog({ open, onClose }: BusinessCardDialogProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()

	if (!open || !auth?.idTag) return null

	return (
		<Dialog open title={t('My Card')} size="sm" onClose={onClose}>
			<VBox align="center" gap={3}>
				<ProfilePicture profile={auth} />
				<Heading level={3}>{auth.name}</Heading>
				<HBox align="center" gap={1}>
					<Text emphasis="muted">
						<IdentityTag idTag={auth.idTag} />
					</Text>
					<CopyButton text={auth.idTag} label={t('identity tag')} />
				</HBox>
				<QRCode
					value={buildCloudilloUri('id', auth.idTag)}
					size={220}
					label={t('QR code of your identity')}
				/>
			</VBox>
		</Dialog>
	)
}

// vim: ts=4
