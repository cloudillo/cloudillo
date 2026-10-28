// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { Button, Text, useApi, VBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { createdAtToSeconds } from '../../../read-position.js'
import type { ActionEvt } from '../types.js'

export interface ReplyQuoteProps {
	/** The quoted MSG id (the reply's `subject`) */
	subjectId: string
	/** The quoted message when it is loaded in the window (or hydrated as `subjectAction`) */
	target: ActionEvt | undefined
	onJump: (actionId: string, createdAt?: number) => void
}

/** Quote chip of a reply: sender + one-line excerpt; activating it jumps to the original. */
export function ReplyQuote({ subjectId, target, onJump }: ReplyQuoteProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	// Fetched when the original is outside the window: undefined = not yet, null = gone.
	const [fetched, setFetched] = React.useState<ActionEvt | null | undefined>()

	React.useEffect(() => {
		if (target || !api) return
		let cancelled = false
		api.actions
			.get(subjectId)
			.then((a) => {
				if (!cancelled) setFetched((a as ActionEvt | undefined) ?? null)
			})
			.catch(() => {
				if (!cancelled) setFetched(null)
			})
		return () => {
			cancelled = true
		}
	}, [api, subjectId, target])

	const quoted = target ?? fetched ?? undefined
	const gone = fetched === null || !!quoted?.x?.deletedBy || quoted?.content === null
	const excerpt = gone
		? t('Message deleted')
		: (typeof quoted?.content === 'string' ? quoted.content.split('\n')[0] : '') ||
			(quoted?.attachments?.length ? t('Attachment') : '…')

	return (
		<Button
			variant="ghost"
			size="sm"
			className="w-100 mb-1"
			style={{ borderInlineStart: '3px solid currentColor', justifyContent: 'flex-start' }}
			disabled={gone}
			aria-label={t('Go to the quoted message')}
			onClick={() =>
				onJump(subjectId, quoted ? createdAtToSeconds(quoted.createdAt) : undefined)
			}
		>
			<VBox className="text-start" style={{ minWidth: 0 }}>
				{quoted && !gone && (
					<Text size="sm" weight="semibold" truncate>
						{quoted.issuer.name || quoted.issuer.idTag}
					</Text>
				)}
				<Text size="sm" emphasis="muted" truncate>
					{excerpt}
				</Text>
			</VBox>
		</Button>
	)
}

// vim: ts=4
