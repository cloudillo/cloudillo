// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { Button, HBox, IcNext, Text, useApi, useToast } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { IcPinned } from '../../../icons.js'
import { createdAtToSeconds } from '../../../read-position.js'
import { useWsBus } from '../../../ws-bus.js'
import type { Conversation } from '../types.js'

/** At most this many pins per conversation; the backend unpins the oldest beyond it */
export const MAX_PINS = 10

/** One pinned message (a PIN row, newest first) */
export interface Pin {
	/** The pinned MSG's actionId */
	msgId: string
	/** The pinned message, when the listing hydrated it */
	msg?: ActionView
	pinnedAt: number
}

export interface UsePins {
	pins: Pin[] | undefined
	isPinned: (msgId: string) => boolean
	pin: (msgId: string) => Promise<void>
	unpin: (msgId: string) => Promise<void>
}

/** One-line excerpt of a pinned message */
export function pinExcerpt(pin: Pin, t: (s: string) => string): string {
	const c = pin.msg?.content
	if (typeof c === 'string' && c.trim()) return c.replace(/\s+/g, ' ').trim()
	return pin.msg?.attachments?.length ? t('Attachment') : t('Pinned message')
}

// Group PINs carry parentId = CONV (filled by post_action); DM PINs involve the peer and have none.
function isConvPin(a: ActionView, convId: string, isGroup: boolean): boolean {
	if (a.type !== 'PIN') return false
	return isGroup
		? a.parentId === convId
		: !a.parentId && (a.issuer?.idTag === convId || a.audience?.idTag === convId)
}

/**
 * The conversation's pins, home node. Each caller loads its own copy and
 * follows live PIN / PIN:DEL actions (own ones echo back over the WS bus too).
 */
export function usePins(conversation: Conversation | undefined): UsePins {
	const { t } = useTranslation()
	const { api } = useApi()
	const toast = useToast()
	const convId = conversation?.id
	const isGroup = conversation?.type === 'group'
	// Group: the CONV owner relays to every member; DM: the peer.
	const audience = isGroup ? conversation?.ownerTag : convId
	const [pins, setPins] = React.useState<Pin[]>()
	const pinsRef = React.useRef(pins)
	pinsRef.current = pins

	const loadGenRef = React.useRef(0)

	const load = React.useCallback(async (): Promise<Pin[] | undefined> => {
		if (!api || !convId) return
		const gen = ++loadGenRef.current
		const rows = await api.actions.list({
			type: 'PIN',
			...(isGroup ? { parentId: convId } : { involved: convId }),
			includeSubject: true,
			limit: 50
		})
		// A newer load (e.g. another conversation) superseded this one
		if (gen !== loadGenRef.current) return
		// Key PIN:{subject}: a PIN:DEL row is an unpin; in a DM both people may pin one message.
		const bySubject = new Map<string, Pin>()
		for (const a of rows) {
			if (!a.subject || !isConvPin(a, convId, isGroup)) continue
			const prev = bySubject.get(a.subject)
			const at = createdAtToSeconds(a.createdAt)
			// PIN:DEL rows store a negative pinnedAt
			if (prev && Math.abs(prev.pinnedAt) >= at) continue
			bySubject.set(a.subject, {
				msgId: a.subject,
				msg: a.subType === 'DEL' ? undefined : a.subjectAction,
				pinnedAt: a.subType === 'DEL' ? -at : at
			})
		}
		const next = [...bySubject.values()]
			.filter((p) => p.pinnedAt > 0)
			.sort((a, b) => b.pinnedAt - a.pinnedAt)
		setPins(next)
		return next
	}, [api, convId, isGroup])

	// Deps: reload on conversation switch
	React.useEffect(() => {
		setPins(undefined)
		load().catch((err) => console.error('Failed to load pins', err))
	}, [load])

	useWsBus({ cmds: ['ACTION'] }, (m) => {
		const a = m.data as ActionView
		if (convId && isConvPin(a, convId, isGroup)) {
			load().catch((err) => console.error('Failed to reload pins', err))
		}
	})

	const pin = React.useCallback(
		async (msgId: string) => {
			if (!api || !audience) return
			const before = pinsRef.current ?? []
			try {
				await api.actions.create({ type: 'PIN', subject: msgId, audienceTag: audience })
				const after = await load()
				// The 11th pin makes the backend drop the oldest.
				const oldest = before[before.length - 1]
				if (
					before.length >= MAX_PINS &&
					oldest &&
					after &&
					!after.some((p) => p.msgId === oldest.msgId)
				) {
					toast.info(t('Pinned. The oldest pin was unpinned.'))
				}
			} catch (err) {
				console.error('Failed to pin message', err)
				toast.error(t('Could not pin the message'))
			}
		},
		[api, audience, load, toast, t]
	)

	const unpin = React.useCallback(
		async (msgId: string) => {
			if (!api || !audience) return
			try {
				await api.actions.create({
					type: 'PIN',
					subType: 'DEL',
					subject: msgId,
					audienceTag: audience
				})
				await load()
			} catch (err) {
				console.error('Failed to unpin message', err)
				toast.error(t('Could not unpin the message'))
			}
		},
		[api, audience, load, toast, t]
	)

	const isPinned = React.useCallback(
		(msgId: string) => !!pins?.some((p) => p.msgId === msgId),
		[pins]
	)

	return { pins, isPinned, pin, unpin }
}

export interface PinBannerProps {
	pins: Pin[] | undefined
	onJump: (actionId: string, createdAt?: number) => void
}

/** The newest pin as a one-line banner under the header; the chevron cycles */
export function PinBanner({ pins, onJump }: PinBannerProps) {
	const { t } = useTranslation()
	const [idx, setIdx] = React.useState(0)
	if (!pins?.length) return null
	const i = idx % pins.length
	const p = pins[i]
	if (!p) return null
	const excerpt = pinExcerpt(p, t)
	return (
		<HBox gap={1} align="center" className="px-2 py-1 border-bottom">
			<Button
				variant="ghost"
				icon={<IcPinned />}
				className="flex-fill text-start mw-0"
				aria-label={t('Pinned message: {{text}}', { text: excerpt })}
				onClick={() =>
					onJump(p.msgId, p.msg ? createdAtToSeconds(p.msg.createdAt) : undefined)
				}
			>
				<Text size="sm" className="text-truncate">
					{excerpt}
				</Text>
			</Button>
			{pins.length > 1 && (
				<Button
					variant="ghost"
					icon={<IcNext />}
					aria-label={t('Next pinned message ({{n}} of {{count}})', {
						n: i + 1,
						count: pins.length
					})}
					onClick={() => setIdx(i + 1)}
				>
					<Text size="sm" emphasis="muted">
						{i + 1}/{pins.length}
					</Text>
				</Button>
			)}
		</HBox>
	)
}

// vim: ts=4
