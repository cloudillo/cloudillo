// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { EmptyState, List, ListItem, SkeletonList, Text, TimeFormat } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { IcPinned } from '../../../icons.js'
import { createdAtToSeconds } from '../../../read-position.js'
import { pinExcerpt, usePins } from '../conversation/PinBanner.js'
import type { Conversation } from '../types.js'

export interface PinnedTabProps {
	conversation: Conversation
	onJump: (actionId: string, createdAt?: number) => void
}

/** Every pin of the conversation, newest first, each jumps to its message */
export function PinnedTab({ conversation, onJump }: PinnedTabProps) {
	const { t } = useTranslation()
	const { pins } = usePins(conversation)

	if (pins === undefined) return <SkeletonList count={3} />
	if (pins.length === 0) {
		return (
			<EmptyState
				icon={<IcPinned />}
				title={t('No pinned messages')}
				description={t('Pin a message from its ⋯ menu to keep it here.')}
			/>
		)
	}
	return (
		<List variant="divided">
			{pins.map((p) => (
				<ListItem
					key={p.msgId}
					leading={<IcPinned />}
					title={<Text className="text-truncate">{pinExcerpt(p, t)}</Text>}
					subtitle={
						p.msg && (
							<>
								{p.msg.issuer.name || p.msg.issuer.idTag} ·{' '}
								<TimeFormat time={p.msg.createdAt} />
							</>
						)
					}
					onClick={() =>
						onJump(p.msgId, p.msg ? createdAtToSeconds(p.msg.createdAt) : undefined)
					}
				/>
			))}
		</List>
	)
}

// vim: ts=4
