// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Presentation API receiver (`receiver.html`): the audience view on a wired display or
 * a Cast device. It has no shell parent, so it never calls `getAppBus().init()`. It opens
 * its own READ-only Yjs connection with the token the presenter sends as the first
 * message (`init`), and follows the presenter over the `PresentationConnection`.
 */

import './i18n.js'

import '@symbion/opalui/themes/glass.css'
import '@cloudillo/fonts/fonts.css'
import '@cloudillo/react/components.css'
import '@cloudillo/canvas-tools/components.css'
import './style.css'

import { getCrdtUrl } from '@cloudillo/core'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'

import { PresentationSlide } from './components/PresentationMode'
import { getOrCreateDocument } from './crdt/document'
import type { YPrezilloDocument } from './crdt'
import { useViews } from './hooks/useViews'
import { type BlankMode, decode, type PresentationMsg } from './presentation-channel'

/** The slice of the Presentation API the receiver uses (not in TS's DOM lib) */
interface ReceiverConnection extends EventTarget {
	state: string
	send(data: string): void
	onmessage: ((evt: MessageEvent) => void) | null
}
interface ReceiverConnectionList extends EventTarget {
	connections: ReceiverConnection[]
}

interface Session {
	doc: YPrezilloDocument
	provider: WebsocketProvider
	ownerIdTag: string
	fileId: string
}

function ReceiverSlides({
	session,
	token,
	index,
	pointer,
	blank,
	poll
}: {
	session: Session
	token: string
	index: number
	pointer: { x: number; y: number } | null
	blank: BlankMode | null
	poll: Extract<PresentationMsg, { type: 'poll' }> | null
}) {
	const views = useViews(session.doc)
	const presented = React.useMemo(() => views.filter((v) => !v.hidden), [views])
	const view = presented[Math.min(index, presented.length - 1)]
	const voteCounts = React.useMemo(
		() => (poll ? new Map(Object.entries(poll.counts)) : undefined),
		[poll]
	)
	if (!view) return null

	return (
		<div
			style={{
				position: 'relative',
				aspectRatio: `${view.width} / ${view.height}`,
				width: `min(100vw, calc(100vh * ${view.width / view.height}))`
			}}
		>
			<PresentationSlide
				key={view.id}
				view={view}
				doc={session.doc}
				ownerTag={session.ownerIdTag}
				token={token}
				sourceFileId={session.fileId}
				isVisible
				noEmbeds
				voteCounts={voteCounts}
				totalVotes={poll?.total}
				winningFrames={poll?.winners}
			/>
			{pointer && (
				<div
					aria-hidden
					style={{
						position: 'absolute',
						left: `${pointer.x * 100}%`,
						top: `${pointer.y * 100}%`,
						width: '1.25rem',
						height: '1.25rem',
						margin: '-0.625rem 0 0 -0.625rem',
						borderRadius: '50%',
						background: 'rgba(255, 32, 32, 0.85)',
						boxShadow: '0 0 0.75rem rgba(255, 32, 32, 0.9)',
						pointerEvents: 'none'
					}}
				/>
			)}
			{blank && (
				<div style={{ position: 'fixed', inset: 0, background: blank }} aria-hidden />
			)}
		</div>
	)
}

function Receiver() {
	const [session, setSession] = React.useState<Session | null>(null)
	const [token, setToken] = React.useState('')
	const [index, setIndex] = React.useState(0)
	const [pointer, setPointer] = React.useState<{ x: number; y: number } | null>(null)
	const [blank, setBlank] = React.useState<BlankMode | null>(null)
	const [poll, setPoll] = React.useState<Extract<PresentationMsg, { type: 'poll' }> | null>(null)
	const sessionRef = React.useRef<Session | null>(null)

	React.useEffect(() => {
		const receiver = (
			navigator as Navigator & {
				presentation?: { receiver?: { connectionList: Promise<ReceiverConnectionList> } }
			}
		).presentation?.receiver
		if (!receiver) return

		const onMessage = (evt: MessageEvent) => {
			const msg = decode(evt.data)
			if (!msg) return
			switch (msg.type) {
				case 'init': {
					const cur = sessionRef.current
					if (cur?.ownerIdTag === msg.ownerIdTag && cur.fileId === msg.fileId) {
						// A reconnected presenter re-sends init: only the token is new
						cur.provider.params.token = msg.token
						setToken(msg.token)
						break
					}
					if (cur) {
						// Another deck: drop the old session and its state
						cur.provider.destroy()
						cur.provider.doc.destroy()
						setIndex(0)
						setPointer(null)
						setBlank(null)
						setPoll(null)
					}
					const yDoc = new Y.Doc()
					const provider = new WebsocketProvider(
						getCrdtUrl(msg.ownerIdTag),
						msg.fileId,
						yDoc,
						{ params: { access: 'read', token: msg.token } }
					)
					const s = {
						doc: getOrCreateDocument(yDoc, false, false),
						provider,
						ownerIdTag: msg.ownerIdTag,
						fileId: msg.fileId
					}
					sessionRef.current = s
					setToken(msg.token)
					setSession(s)
					break
				}
				case 'token':
					// Used by the provider's next (re)connect and by image URLs
					if (sessionRef.current) sessionRef.current.provider.params.token = msg.token
					setToken(msg.token)
					break
				case 'slide':
					setIndex(msg.index)
					break
				case 'pointer':
					setPointer(msg.at)
					break
				case 'blank':
					setBlank(msg.mode)
					break
				case 'poll':
					setPoll(msg)
					break
				case 'media':
					// no playable media object is rendered here yet; apply once one exists
					break
				case 'end':
					sessionRef.current?.provider.destroy()
					window.close()
					break
			}
		}

		const attach = (conn: ReceiverConnection) => {
			conn.onmessage = onMessage
		}
		let list: ReceiverConnectionList | undefined
		const onAvailable = (evt: Event) => {
			attach((evt as Event & { connection: ReceiverConnection }).connection)
		}
		receiver.connectionList.then((l) => {
			list = l
			l.connections.forEach((c) => {
				attach(c)
			})
			l.addEventListener('connectionavailable', onAvailable)
		})
		return () => {
			list?.removeEventListener('connectionavailable', onAvailable)
			sessionRef.current?.provider.destroy()
		}
	}, [])

	return (
		<div
			style={{
				position: 'fixed',
				inset: 0,
				background: '#000',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				cursor: 'none'
			}}
		>
			{session && (
				<ReceiverSlides
					session={session}
					token={token}
					index={index}
					pointer={pointer}
					blank={blank}
					poll={poll}
				/>
			)}
		</div>
	)
}

createRoot(document.getElementById('app')!).render(<Receiver />)

// vim: ts=4
