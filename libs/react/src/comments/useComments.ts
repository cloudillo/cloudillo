// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useState, useRef, useCallback, useEffect } from 'react'
import { RtdbClient, increment } from '@cloudillo/rtdb'
import { getMetaDbId } from '@cloudillo/core'

import type { StoredThread, StoredComment, CommentThread, Comment } from './types.js'
import { threadFromStored, commentFromStored } from './types.js'

const ID_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

function shortId(length = 10): string {
	const arr = crypto.getRandomValues(new Uint8Array(length))
	return Array.from(arr, (b) => ID_CHARS[b % 62]).join('')
}

export interface UseCommentsOptions {
	fileId: string
	serverUrl: string
	getToken: () => string | undefined
	idTag?: string
	displayName?: string
	access: 'read' | 'comment' | 'write'
}

export interface UseCommentsReturn {
	connected: boolean
	subscribeThreads: (scope: string, callback: (threads: CommentThread[]) => void) => () => void
	subscribeComments: (threadId: string, callback: (comments: Comment[]) => void) => () => void
	createThread: (
		scope: string,
		anchor: string,
		text: string
	) => Promise<{ threadId: string; commentId: string }>
	addComment: (threadId: string, text: string) => Promise<string>
	editComment: (commentId: string, text: string) => Promise<void>
	deleteComment: (commentId: string, threadId: string) => Promise<void>
	setThreadStatus: (threadId: string, status: 'open' | 'resolved') => Promise<void>
}

export function useComments(options: UseCommentsOptions): UseCommentsReturn {
	const { fileId, serverUrl, getToken, idTag, displayName, access } = options
	const clientRef = useRef<RtdbClient | null>(null)
	const connectingRef = useRef<Promise<RtdbClient> | null>(null)
	const getTokenRef = useRef(getToken)
	getTokenRef.current = getToken
	const [connected, setConnected] = useState(false)

	// Lazy connection: connect on first use
	const ensureClient = useCallback(async (): Promise<RtdbClient> => {
		if (!fileId) throw new Error('fileId not ready')
		if (clientRef.current) return clientRef.current
		if (connectingRef.current) return connectingRef.current

		const promise = (async () => {
			const metaDbId = getMetaDbId(fileId)
			const client = new RtdbClient({
				dbId: metaDbId,
				auth: { getToken: () => getTokenRef.current() },
				serverUrl,
				options: {
					enableCache: true,
					reconnect: true,
					reconnectDelay: 1000,
					maxReconnectDelay: 30000
				}
			})

			await client.connect()
			await client.createIndex('t', 'sc')
			await client.createIndex('c', 't')

			clientRef.current = client
			connectingRef.current = null
			setConnected(true)
			return client
		})()

		connectingRef.current = promise
		promise.catch(() => {
			connectingRef.current = null
		})
		return promise
	}, [fileId, serverUrl])

	// Cleanup on unmount or connection param change
	useEffect(() => {
		return () => {
			const pending = connectingRef.current
			if (clientRef.current) {
				clientRef.current.disconnect().catch(console.error)
				clientRef.current = null
				connectingRef.current = null
				setConnected(false)
			} else if (pending) {
				// Connection was in-flight — disconnect once it resolves
				pending.then((c) => c.disconnect().catch(console.error)).catch(() => {})
				connectingRef.current = null
			}
		}
	}, [fileId, serverUrl])

	const subscribeThreads = useCallback(
		(scope: string, callback: (threads: CommentThread[]) => void): (() => void) => {
			let unsubscribe: (() => void) | undefined
			let cancelled = false

			ensureClient()
				.then((client) => {
					if (cancelled) return

					unsubscribe = client
						.collection<StoredThread>('t')
						.where('sc', '==', scope)
						.orderBy('ua', 'desc')
						.onSnapshot((snapshot) => {
							const threads: CommentThread[] = []
							snapshot.forEach((doc) => {
								const data = doc.data()
								if (data) threads.push(threadFromStored(doc.id, data))
							})
							callback(threads)
						})
				})
				.catch(console.error)

			return () => {
				cancelled = true
				unsubscribe?.()
			}
		},
		[ensureClient]
	)

	const subscribeComments = useCallback(
		(threadId: string, callback: (comments: Comment[]) => void): (() => void) => {
			let unsubscribe: (() => void) | undefined
			let cancelled = false

			ensureClient()
				.then((client) => {
					if (cancelled) return

					unsubscribe = client
						.collection<StoredComment>('c')
						.where('t', '==', threadId)
						.onSnapshot((snapshot) => {
							const comments: Comment[] = []
							snapshot.forEach((doc) => {
								const data = doc.data()
								if (data) comments.push(commentFromStored(doc.id, data))
							})
							comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
							callback(comments)
						})
				})
				.catch(console.error)

			return () => {
				cancelled = true
				unsubscribe?.()
			}
		},
		[ensureClient]
	)

	const createThread = useCallback(
		async (scope: string, anchor: string, text: string) => {
			if (access === 'read') throw new Error('Comment access required')

			const client = await ensureClient()
			const now = new Date().toISOString()
			const threadId = shortId()
			const commentId = shortId()

			const batch = client.batch()
			batch.set(client.ref<StoredThread>(`t/${threadId}`), {
				sc: scope,
				an: anchor,
				st: 'O',
				cc: 1,
				tx: text.length > 120 ? text.slice(0, 120) + '...' : text,
				ca: now,
				ua: now,
				cb: idTag || 'anonymous',
				cn: displayName
			})
			batch.set(client.ref<StoredComment>(`c/${commentId}`), {
				t: threadId,
				tx: text,
				ca: now,
				cb: idTag || 'anonymous',
				cn: displayName
			})
			await batch.commit()

			return { threadId, commentId }
		},
		[access, ensureClient, idTag, displayName]
	)

	const addComment = useCallback(
		async (threadId: string, text: string): Promise<string> => {
			if (access === 'read') throw new Error('Comment access required')

			const client = await ensureClient()
			const now = new Date().toISOString()
			const commentId = shortId()

			const batch = client.batch()
			batch.set(client.ref<StoredComment>(`c/${commentId}`), {
				t: threadId,
				tx: text,
				ca: now,
				cb: idTag || 'anonymous',
				cn: displayName
			})
			// Update thread's updatedAt and increment comment count
			batch.update(client.ref<StoredThread>(`t/${threadId}`), {
				ua: now,
				cc: increment()
			})
			await batch.commit()

			return commentId
		},
		[access, ensureClient, idTag, displayName]
	)

	const editComment = useCallback(
		async (commentId: string, text: string): Promise<void> => {
			if (access === 'read') throw new Error('Comment access required')

			const client = await ensureClient()
			const now = new Date().toISOString()

			await client.ref<Partial<StoredComment>>(`c/${commentId}`).update({
				tx: text,
				ua: now,
				ed: true
			})
		},
		[access, ensureClient]
	)

	const deleteComment = useCallback(
		async (commentId: string, threadId: string): Promise<void> => {
			if (access === 'read') throw new Error('Comment access required')

			const client = await ensureClient()
			const now = new Date().toISOString()

			const batch = client.batch()
			batch.update(client.ref<Partial<StoredComment>>(`c/${commentId}`), {
				dl: true,
				tx: '',
				ua: now
			})
			batch.update(client.ref<StoredThread>(`t/${threadId}`), {
				ua: now,
				cc: increment(-1)
			})
			await batch.commit()
		},
		[access, ensureClient]
	)

	const setThreadStatus = useCallback(
		async (threadId: string, status: 'open' | 'resolved'): Promise<void> => {
			if (access === 'read') throw new Error('Comment access required')

			const client = await ensureClient()
			const now = new Date().toISOString()

			await client.ref<Partial<StoredThread>>(`t/${threadId}`).update({
				st: status === 'resolved' ? 'R' : 'O',
				ua: now
			})
		},
		[access, ensureClient]
	)

	return {
		connected,
		subscribeThreads,
		subscribeComments,
		createThread,
		addComment,
		editComment,
		deleteComment,
		setThreadStatus
	}
}

// vim: ts=4
