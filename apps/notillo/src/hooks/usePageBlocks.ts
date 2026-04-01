// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useState, useEffect, useRef } from 'react'

import type { Block } from '@blocknote/core'
import type { RtdbClient } from '@cloudillo/rtdb'
import type { StoredBlockRecord, BlockRecord } from '../rtdb/types.js'
import { fromStoredBlock } from '../rtdb/transform.js'
import { reconstructBlocks } from '../rtdb/reconstruct.js'

export function usePageBlocks(
	client: RtdbClient | undefined,
	pageId: string | undefined,
	ownerTag?: string
) {
	const [blocks, setBlocks] = useState<Block[]>([])
	const [loading, setLoading] = useState(true)
	const [loadedPageId, setLoadedPageId] = useState<string | undefined>()
	const [knownBlockIds, setKnownBlockIds] = useState<Set<string>>(new Set())
	const [knownBlockOrders, setKnownBlockOrders] = useState<Map<string, number>>(new Map())
	const recordsRef = useRef<Map<string, BlockRecord & { id: string }>>(new Map())

	useEffect(() => {
		if (!client || !pageId) {
			setBlocks([])
			setLoading(false)
			setLoadedPageId(undefined)
			setKnownBlockIds(new Set())
			setKnownBlockOrders(new Map())
			return
		}

		setLoading(true)
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
					const record = fromStoredBlock(doc.data() as StoredBlockRecord, ownerTag)
					recordsRef.current.set(doc.id, {
						id: doc.id,
						...record
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
				if (!cancelled) {
					console.error('[usePageBlocks] Query error:', err)
				}
			})

		return () => {
			cancelled = true
		}
	}, [client, pageId, ownerTag])

	return { blocks, loading, loadedPageId, knownBlockIds, knownBlockOrders }
}

// vim: ts=4
