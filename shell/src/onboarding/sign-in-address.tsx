// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/** A new user's own address and where to sign in, with a copy button (onboarding). */

import { CopyButton, HBox, Text } from '@cloudillo/react'
import * as React from 'react'
import { Trans, useTranslation } from 'react-i18next'

export function SignInAddress({ idTag }: { idTag: string }) {
	const { t } = useTranslation()
	return (
		<HBox align="center" gap={1}>
			<Text as="p" className="flex-fill w-min-0">
				<Trans
					i18nKey="Your Cloudillo address: <0>{{idTag}}</0> · sign in at https://{{idTag}}"
					values={{ idTag }}
					components={[<Text key="b" as="span" className="font-semibold" />]}
				/>
			</Text>
			<CopyButton text={idTag} label={t('identity tag')} />
		</HBox>
	)
}

// vim: ts=4
