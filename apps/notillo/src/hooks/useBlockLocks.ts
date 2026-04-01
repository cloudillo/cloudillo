// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useState, useEffect, useCallback } from 'react'

import type { ChangeEvent, LockEventData } from '@cloudillo/rtdb'

export interface BlockLock {
	userId: string
	mode: 'soft' | 'hard'
}

export function useBlockLocks(pageId: string | undefined) {
	const [locks, setLocks] = useState<Map<string, BlockLock>>(new Map())

	// Reset locks when page changes
	useEffect(() => {
		setLocks(new Map())
	}, [pageId])

	const handleLockEvent = useCallback((event: ChangeEvent) => {
		if (event.action === 'lock') {
			const blockId = event.path.split('/').pop() || ''
			const { userId, mode } = event.data as LockEventData
			setLocks((prev) => {
				const next = new Map(prev)
				next.set(blockId, { userId, mode })
				return next
			})
		} else if (event.action === 'unlock') {
			const blockId = event.path.split('/').pop() || ''
			setLocks((prev) => {
				if (!prev.has(blockId)) return prev
				const next = new Map(prev)
				next.delete(blockId)
				return next
			})
		}
	}, [])

	return { locks, handleLockEvent }
}

// vim: ts=4
