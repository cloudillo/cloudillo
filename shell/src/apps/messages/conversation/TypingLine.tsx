// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { Text, VBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useTypists } from '../hooks/useTyping.js'

/** "Anna is typing…" above the composer. The status region stays mounted so it announces. */
export function TypingLine({ convId }: { convId: string }) {
	const { t } = useTranslation()
	const typists = useTypists(convId)
	const [first] = typists

	return (
		<VBox role="status" aria-live="polite" className="px-2">
			{first && (
				<Text size="sm" emphasis="muted">
					{/* Animation is stilled by OpalUI's global prefers-reduced-motion rule */}
					{/* biome-ignore lint/plugin/no-raw-intrinsic: ds-allow: OpalUI c-spinner-dots has no component */}
					<span className="c-spinner-dots sm" aria-hidden="true">
						{/* biome-ignore lint/plugin/no-raw-intrinsic: ds-allow: c-spinner-dots dot */}
						<span />
						{/* biome-ignore lint/plugin/no-raw-intrinsic: ds-allow: c-spinner-dots dot */}
						<span />
						{/* biome-ignore lint/plugin/no-raw-intrinsic: ds-allow: c-spinner-dots dot */}
						<span />
					</span>{' '}
					{typists.length === 1
						? t('{{name}} is typing…', { name: first.name })
						: t('{{name}} and {{count}} others are typing…', {
								name: first.name,
								count: typists.length - 1
							})}
				</Text>
			)}
		</VBox>
	)
}

// vim: ts=4
