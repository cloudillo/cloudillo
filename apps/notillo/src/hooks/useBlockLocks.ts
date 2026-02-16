// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
