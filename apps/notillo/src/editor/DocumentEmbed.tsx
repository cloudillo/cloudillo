// This file is part of the Cloudillo Platform.
// Copyright (C) 2024-2026  Szilárd Hajba
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

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { createReactBlockSpec } from '@blocknote/react'
import { useDocumentEmbed, DocumentEmbedIframe } from '@cloudillo/react'
import { useNotilloEditor } from './NotilloEditorContext.js'

export const DocumentEmbed = createReactBlockSpec(
	{
		type: 'documentEmbed' as const,
		content: 'none' as const,
		propSchema: {
			fileId: { default: '' },
			contentType: { default: '' },
			appId: { default: '' },
			navState: { default: '' },
			width: { default: 100 },
			height: { default: 400 }
		}
	},
	{
		render: (props) => {
			const { t } = useTranslation()
			const { fileId, contentType, navState, width, height } = props.block.props
			const { sourceFileId } = useNotilloEditor()
			const [active, setActive] = React.useState(false)
			const isEditable = props.editor.isEditable
			const containerRef = React.useRef<HTMLDivElement>(null)

			const embed = useDocumentEmbed(
				fileId && sourceFileId
					? {
							targetFileId: fileId,
							targetContentType: contentType,
							sourceFileId,
							access: 'read',
							navState: navState || undefined
						}
					: null
			)

			// Cache pending navState (flushed on deactivate)
			const pendingNavStateRef = React.useRef<string | null>(null)

			// Aspect ratio from embedded app
			const aspectRef = React.useRef<{ ratio?: [number, number]; fixed?: boolean }>({})

			const handleViewStateChange = React.useCallback(
				(viewState: string, aspectRatio?: [number, number], aspectFixed?: boolean) => {
					pendingNavStateRef.current = viewState
					if (aspectRatio) aspectRef.current = { ratio: aspectRatio, fixed: aspectFixed }
				},
				[]
			)

			const handleDeactivate = React.useCallback(() => {
				setActive(false)
				const pending = pendingNavStateRef.current
				if (pending != null && pending !== (navState || '')) {
					if (isEditable) {
						props.editor.updateBlock(props.block.id, {
							props: { navState: pending }
						})
					}
					pendingNavStateRef.current = null
				}
			}, [navState, isEditable, props.editor, props.block.id])

			// Flush pending navState on unmount (e.g. user navigates away while embed is active)
			const navStateRef = React.useRef(navState)
			navStateRef.current = navState
			const editorRef = React.useRef(props.editor)
			editorRef.current = props.editor
			const blockIdRef = React.useRef(props.block.id)
			blockIdRef.current = props.block.id

			React.useEffect(() => {
				return () => {
					const pending = pendingNavStateRef.current
					if (pending != null && pending !== (navStateRef.current || '')) {
						if (editorRef.current.isEditable) {
							editorRef.current.updateBlock(blockIdRef.current, {
								props: { navState: pending }
							})
						}
					}
				}
			}, [])

			// Helper: get parent width for percentage calculations
			const getParentWidth = React.useCallback(() => {
				return containerRef.current?.parentElement?.clientWidth || 1
			}, [])

			// Bottom resize (height only)
			const handleResizeBottom = React.useCallback(
				(e: React.PointerEvent) => {
					e.preventDefault()
					e.stopPropagation()
					const target = e.target as HTMLElement
					target.setPointerCapture(e.pointerId)
					const pointerId = e.pointerId
					const startY = e.clientY
					const startHeight = height as number

					const onPointerMove = (ev: PointerEvent) => {
						const newHeight = Math.max(100, startHeight + ev.clientY - startY)
						props.editor.updateBlock(props.block.id, {
							props: { height: newHeight }
						})
					}

					const onPointerUp = () => {
						target.releasePointerCapture(pointerId)
						target.removeEventListener('pointermove', onPointerMove)
						target.removeEventListener('pointerup', onPointerUp)
					}

					target.addEventListener('pointermove', onPointerMove)
					target.addEventListener('pointerup', onPointerUp)
				},
				[height, props.editor, props.block.id]
			)

			// Right resize (width only, with optional aspect-ratio height adjustment)
			const handleResizeRight = React.useCallback(
				(e: React.PointerEvent) => {
					e.preventDefault()
					e.stopPropagation()
					const target = e.target as HTMLElement
					target.setPointerCapture(e.pointerId)
					const pointerId = e.pointerId
					const startX = e.clientX
					const parentWidth = getParentWidth()
					const startPixelWidth = ((width as number) / 100) * parentWidth
					const _startHeight = height as number

					const onPointerMove = (ev: PointerEvent) => {
						const newPixelWidth = startPixelWidth + ev.clientX - startX
						const newWidth = Math.max(
							20,
							Math.min(100, Math.round((newPixelWidth / parentWidth) * 100))
						)
						const update: Record<string, number> = { width: newWidth }

						if (aspectRef.current.fixed && aspectRef.current.ratio) {
							const [aw, ah] = aspectRef.current.ratio
							const actualPixelWidth = (newWidth / 100) * parentWidth
							update.height = Math.max(100, Math.round(actualPixelWidth * (ah / aw)))
						}

						props.editor.updateBlock(props.block.id, { props: update })
					}

					const onPointerUp = () => {
						target.releasePointerCapture(pointerId)
						target.removeEventListener('pointermove', onPointerMove)
						target.removeEventListener('pointerup', onPointerUp)
					}

					target.addEventListener('pointermove', onPointerMove)
					target.addEventListener('pointerup', onPointerUp)
				},
				[width, height, props.editor, props.block.id, getParentWidth]
			)

			// Corner resize (width + height, aspect-ratio lock when fixed)
			const handleResizeCorner = React.useCallback(
				(e: React.PointerEvent) => {
					e.preventDefault()
					e.stopPropagation()
					const target = e.target as HTMLElement
					target.setPointerCapture(e.pointerId)
					const pointerId = e.pointerId
					const startX = e.clientX
					const startY = e.clientY
					const parentWidth = getParentWidth()
					const startPixelWidth = ((width as number) / 100) * parentWidth
					const startHeight = height as number

					const onPointerMove = (ev: PointerEvent) => {
						const newPixelWidth = startPixelWidth + ev.clientX - startX
						const newWidth = Math.max(
							20,
							Math.min(100, Math.round((newPixelWidth / parentWidth) * 100))
						)

						let newHeight: number
						if (aspectRef.current.fixed && aspectRef.current.ratio) {
							const [aw, ah] = aspectRef.current.ratio
							const actualPixelWidth = (newWidth / 100) * parentWidth
							newHeight = Math.max(100, Math.round(actualPixelWidth * (ah / aw)))
						} else {
							newHeight = Math.max(100, startHeight + ev.clientY - startY)
						}

						props.editor.updateBlock(props.block.id, {
							props: { width: newWidth, height: newHeight }
						})
					}

					const onPointerUp = () => {
						target.releasePointerCapture(pointerId)
						target.removeEventListener('pointermove', onPointerMove)
						target.removeEventListener('pointerup', onPointerUp)
					}

					target.addEventListener('pointermove', onPointerMove)
					target.addEventListener('pointerup', onPointerUp)
				},
				[width, height, props.editor, props.block.id, getParentWidth]
			)

			if (!fileId) {
				return (
					<div className="notillo-document-embed notillo-document-embed--empty">
						{t('No document selected')}
					</div>
				)
			}

			if (embed.status === 'loading') {
				return (
					<div className="notillo-document-embed notillo-document-embed--loading">
						{t('Loading embedded document...')}
					</div>
				)
			}

			if (embed.status === 'error') {
				return (
					<div className="notillo-document-embed notillo-document-embed--error">
						{t('Failed to load document: {{error}}', { error: embed.error })}
					</div>
				)
			}

			return (
				<div
					ref={containerRef}
					className={`notillo-document-embed${active ? ' active' : ''}`}
					style={{
						height: `${height}px`,
						width: `${width}%`,
						margin: (width as number) < 100 ? '0 auto' : undefined
					}}
				>
					{embed.iframeSrc && (
						<>
							<DocumentEmbedIframe
								src={embed.iframeSrc}
								active={!isEditable || active}
								onActivate={() => setActive(true)}
								onDeactivate={handleDeactivate}
								onViewStateChange={handleViewStateChange}
							/>
							{isEditable && !active && (
								<div
									className="notillo-document-embed-overlay"
									contentEditable={false}
									onDoubleClick={() => setActive(true)}
								/>
							)}
							{isEditable && (
								<>
									<div
										className="notillo-document-embed-resize-bottom"
										contentEditable={false}
										onPointerDown={handleResizeBottom}
									/>
									<div
										className="notillo-document-embed-resize-right"
										contentEditable={false}
										onPointerDown={handleResizeRight}
									/>
									<div
										className="notillo-document-embed-resize-corner"
										contentEditable={false}
										onPointerDown={handleResizeCorner}
									/>
								</>
							)}
						</>
					)}
				</div>
			)
		}
	}
)()

// vim: ts=4
