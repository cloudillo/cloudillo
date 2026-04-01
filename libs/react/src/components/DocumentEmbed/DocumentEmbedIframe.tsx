// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Renders a sandboxed iframe for an embedded document and manages the embed relay.
 */

import * as React from 'react'
import { setupEmbedRelay, type EmbedRelayHandle } from '@cloudillo/core'

export interface DocumentEmbedIframeProps {
	src: string
	className?: string
	active?: boolean
	onActivate?: () => void
	onDeactivate?: () => void
	/** Called when the embedded app reports view state changes */
	onViewStateChange?: (
		viewState: string,
		aspectRatio?: [number, number],
		aspectFixed?: boolean
	) => void
}

export interface DocumentEmbedIframeRef {
	/** Send a view state to the embedded app */
	sendViewState: (viewState?: string) => void
}

export const DocumentEmbedIframe = React.memo(
	React.forwardRef<DocumentEmbedIframeRef, DocumentEmbedIframeProps>(function DocumentEmbedIframe(
		{ src, className, active, onActivate, onDeactivate, onViewStateChange },
		ref
	) {
		const iframeRef = React.useRef<HTMLIFrameElement | null>(null)
		const relayRef = React.useRef<EmbedRelayHandle | null>(null)
		const cleanupRef = React.useRef<(() => void) | null>(null)
		const onViewStateChangeRef = React.useRef(onViewStateChange)
		onViewStateChangeRef.current = onViewStateChange

		// Expose sendViewState via ref
		React.useImperativeHandle(
			ref,
			() => ({
				sendViewState: (viewState?: string) => {
					relayRef.current?.sendToChild('embed:viewstate.set', { viewState })
				}
			}),
			[]
		)

		// Set up embed relay when iframe mounts
		const setIframeRef = React.useCallback((el: HTMLIFrameElement | null) => {
			// Clean up previous relay
			if (cleanupRef.current) {
				cleanupRef.current()
				cleanupRef.current = null
				relayRef.current = null
			}

			iframeRef.current = el

			if (el) {
				const relay = setupEmbedRelay(el, {
					onChildNotification: (type, payload) => {
						if (type === 'embed:viewstate.push' && payload) {
							const p = payload as {
								viewState: string
								aspectRatio?: [number, number]
								aspectFixed?: boolean
							}
							onViewStateChangeRef.current?.(
								p.viewState,
								p.aspectRatio,
								p.aspectFixed
							)
						}
					}
				})
				relayRef.current = relay
				cleanupRef.current = relay.cleanup
			}
		}, [])

		// Clean up on unmount
		React.useEffect(() => {
			return () => {
				if (cleanupRef.current) {
					cleanupRef.current()
					cleanupRef.current = null
					relayRef.current = null
				}
			}
		}, [])

		// Handle click-outside deactivation
		React.useEffect(() => {
			if (!active || !onDeactivate) return

			const handler = (e: MouseEvent) => {
				if (iframeRef.current && !iframeRef.current.contains(e.target as Node)) {
					onDeactivate()
				}
			}
			document.addEventListener('click', handler)
			return () => document.removeEventListener('click', handler)
		}, [active, onDeactivate])

		return (
			<iframe
				ref={setIframeRef}
				src={src}
				className={className}
				sandbox="allow-scripts allow-forms allow-downloads"
				loading="lazy"
				style={{ pointerEvents: active ? 'auto' : 'none' }}
				onDoubleClick={(e) => {
					e.stopPropagation()
					onActivate?.()
				}}
			/>
		)
	})
)

// vim: ts=4
