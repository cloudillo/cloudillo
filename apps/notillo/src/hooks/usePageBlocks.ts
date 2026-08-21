// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { Block } from '@blocknote/core'
import type { RtdbClient } from '@cloudillo/rtdb'
import { useCallback, useEffect, useRef, useState } from 'react'

import { reconstructBlocks } from '../rtdb/reconstruct.js'
import { fromStoredBlock } from '../rtdb/transform.js'
import type { BlockRecord } from '../rtdb/types.js'
import { decodeStoredBlock } from '../rtdb/types.js'

export function usePageBlocks(
	client: RtdbClient | undefined,
	pageId: string | undefined,
	ownerTag?: string
) {
	const [blocks, setBlocks] = useState<Block[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<Error | undefined>()
	const [loadedPageId, setLoadedPageId] = useState<string | undefined>()
	const [knownBlockIds, setKnownBlockIds] = useState<Set<string>>(new Set())
	const [knownBlockOrders, setKnownBlockOrders] = useState<Map<string, number>>(new Map())
	const [retryCount, setRetryCount] = useState(0)
	const recordsRef = useRef<Map<string, BlockRecord & { id: string }>>(new Map())

	const retry = useCallback(() => setRetryCount((n) => n + 1), [])

	useEffect(() => {
		if (!client || !pageId) {
			setBlocks([])
			setLoading(false)
			setError(undefined)
			setLoadedPageId(undefined)
			setKnownBlockIds(new Set())
			setKnownBlockOrders(new Map())
			return
		}

		setLoading(true)
		setError(undefined)
		setLoadedPageId(undefined)
		recordsRef.current.clear()

		let cancelled = false

		client
			.collection('b')
			.where('p', '==', pageId)
			.get()
			.then((snapshot) => {
				if (cancelled) return

				for (const doc of snapshot.docs) {
					// A block that will not decode is skipped, and the page loads
					// without it, rather than the whole page failing to open.
					const stored = decodeStoredBlock(doc.data(), doc.id)
					if (!stored) continue
					recordsRef.current.set(doc.id, {
						id: doc.id,
						...fromStoredBlock(stored, ownerTag)
					})
				}

				setBlocks(reconstructBlocks(recordsRef.current))
				setKnownBlockIds(new Set(recordsRef.current.keys()))
				const orders = new Map<string, number>()
				for (const [id, record] of recordsRef.current) {
					orders.set(id, record.order)
				}
				setKnownBlockOrders(orders)
				setLoadedPageId(pageId)
				setLoading(false)
			})
			.catch((err) => {
				if (cancelled) return
				console.error('[usePageBlocks] Query error:', err)
				// Clearing `loading` matters as much as reporting the error: without
				// it the content pane spins forever with no way back.
				setError(err instanceof Error ? err : new Error(String(err)))
				setLoading(false)
			})

		return () => {
			cancelled = true
		}
	}, [client, pageId, ownerTag, retryCount])

	return { blocks, loading, error, retry, loadedPageId, knownBlockIds, knownBlockOrders }
}

// vim: ts=4
