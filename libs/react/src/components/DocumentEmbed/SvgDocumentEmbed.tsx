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

/**
 * SVG wrapper for embedding documents in canvas apps (ideallo, prezillo).
 * Renders a foreignObject containing a DocumentEmbedIframe with loading/error states.
 */

import * as React from 'react'
import { useDocumentEmbed } from './useDocumentEmbed.js'
import { DocumentEmbedIframe, type DocumentEmbedIframeRef } from './DocumentEmbedIframe.js'

export interface SvgDocumentEmbedProps {
	x: number
	y: number
	width: number
	height: number
	fileId: string
	contentType: string
	sourceFileId: string
	appId?: string
	access?: 'read' | 'write'
	navState?: string
	active?: boolean
	onActivate?: () => void
	onDeactivate?: () => void
	/** Called when embedded app reports view state changes */
	onViewStateChange?: (
		viewState: string,
		aspectRatio?: [number, number],
		aspectFixed?: boolean
	) => void
}

export const SvgDocumentEmbed = React.memo(function SvgDocumentEmbed({
	x,
	y,
	width,
	height,
	fileId,
	contentType,
	sourceFileId,
	access,
	navState,
	active,
	onActivate,
	onDeactivate,
	onViewStateChange
}: SvgDocumentEmbedProps) {
	const embedIframeRef = React.useRef<DocumentEmbedIframeRef>(null)
	const embed = useDocumentEmbed(
		sourceFileId
			? {
					targetFileId: fileId,
					targetContentType: contentType,
					sourceFileId,
					access,
					navState
				}
			: null
	)

	if (embed.status === 'error') {
		return (
			<g className="cl-document-embed cl-document-embed--error">
				<rect
					x={x}
					y={y}
					width={width}
					height={height}
					fill="none"
					stroke="var(--c-error, #d32f2f)"
					strokeWidth={2}
					strokeDasharray="6 3"
					rx={4}
				/>
				<text
					x={x + width / 2}
					y={y + height / 2}
					textAnchor="middle"
					dominantBaseline="central"
					fill="var(--c-error, #d32f2f)"
					fontSize={14}
				>
					Failed to load document
				</text>
			</g>
		)
	}

	if (embed.status === 'loading' || !embed.iframeSrc) {
		return (
			<g className="cl-document-embed cl-document-embed--loading">
				<rect
					x={x}
					y={y}
					width={width}
					height={height}
					fill="none"
					stroke="var(--col-outline, #999)"
					strokeWidth={1.5}
					strokeDasharray="8 4"
					rx={4}
				/>
				<text
					x={x + width / 2}
					y={y + height / 2}
					textAnchor="middle"
					dominantBaseline="central"
					fill="var(--col-on-surface, #666)"
					fontSize={13}
				>
					Loading document...
				</text>
			</g>
		)
	}

	return (
		<foreignObject x={x} y={y} width={width} height={height} className="cl-document-embed-fo">
			<DocumentEmbedIframe
				ref={embedIframeRef}
				src={embed.iframeSrc}
				className="cl-document-embed-iframe"
				active={active}
				onActivate={onActivate}
				onDeactivate={onDeactivate}
				onViewStateChange={onViewStateChange}
			/>
		</foreignObject>
	)
})

// vim: ts=4
