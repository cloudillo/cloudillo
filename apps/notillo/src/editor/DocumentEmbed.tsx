// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { createReactBlockSpec } from '@blocknote/react'
import type { EmbedViewReportPayload } from '@cloudillo/core'
import {
	DocViewEmbed,
	type EmbedViewSettings,
	embedReportToStore,
	grantEmbedEditable,
	normalizeEmbedSettings
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useNotilloEditor } from './NotilloEditorContext.js'

interface BlockLike {
	id: string
	type: string
	props: Record<string, unknown>
	children: BlockLike[]
}

/**
 * Another editable embed of `fileId` still needs the 'W' share.
 * Scans only the open page; the share is per notillo document, so an editable embed
 * on another page can still be downgraded. Scan the RTDB block store if that matters.
 */
function othersEditable(blocks: readonly BlockLike[], self: string, fileId: string): boolean {
	return blocks.some(
		(b) =>
			(b.id !== self &&
				b.type === 'documentEmbed' &&
				!!b.props.editable &&
				b.props.fileId === fileId) ||
			othersEditable(b.children, self, fileId)
	)
}

// Numeric props use 0 for "unset"
export const DocumentEmbed = createReactBlockSpec(
	{
		type: 'documentEmbed' as const,
		content: 'none' as const,
		propSchema: {
			fileId: { default: '' },
			contentType: { default: '' },
			appId: { default: '' },
			navState: { default: '' },
			/** Source document's file name, shown as the embed title */
			name: { default: '' },
			/** % of the container width (caps a fixed view, sizes a reflow one) */
			width: { default: 100 },
			/** left / center / right; '' = center */
			align: { default: '' },
			/** Legacy fixed height (px); read as `maxH` when no `maxH` is stored */
			height: { default: 0 },
			sizing: { default: 'fit-width' },
			scale: { default: 0 },
			maxH: { default: 0 },
			textScale: { default: 0 },
			lastW: { default: 0 },
			lastH: { default: 0 },
			/** Last reported view kind ('fixed' | 'reflow'), for the published placeholder */
			kind: { default: '' },
			/** Readers with write access on this page may edit the embedded document */
			editable: { default: false }
		}
	},
	{
		render: (props) => {
			const { t } = useTranslation()
			const { block, editor } = props
			const { fileId, contentType, appId, navState, height } = block.props
			const { sourceFileId, ownerTag, canWrite } = useNotilloEditor()
			const isEditable = editor.isEditable
			const app = appId || contentType.replace(/^cloudillo\//, '')

			const settings = normalizeEmbedSettings(
				{ ...block.props, maxH: block.props.maxH || height },
				'center'
			)

			const update = (p: Partial<typeof block.props>) =>
				editor.updateBlock(block.id, { props: p })

			const handleReport = (report: EmbedViewReportPayload) => {
				if (!isEditable) return
				const { lastW: w, lastH: h, kind } = block.props
				const next = embedReportToStore({ w, h, kind }, report)
				if (next) update({ lastW: next.w, lastH: next.h, kind: next.kind })
			}

			if (!fileId || !sourceFileId) {
				return (
					<div className="notillo-document-embed notillo-document-embed--empty">
						{t('No document selected')}
					</div>
				)
			}

			return (
				<div className="notillo-document-embed" contentEditable={false}>
					<DocViewEmbed
						fileId={fileId}
						contentType={contentType}
						sourceFileId={sourceFileId}
						// Granted access, not interactivity: an inactive nested embed keeps its token
						access={block.props.editable && canWrite ? 'write' : 'read'}
						title={block.props.name || undefined}
						appId={app}
						owner={ownerTag}
						nav={navState || undefined}
						settings={settings}
						canInteract={true}
						canEdit={isEditable}
						onReport={handleReport}
						actions={{
							...(isEditable && {
								onSizing: (s: EmbedViewSettings) =>
									update({
										sizing: s.sizing,
										scale: s.scale ?? 0,
										maxH: s.maxH ?? 0,
										textScale: s.textScale ?? 0,
										width: s.width ?? 100,
										align: s.align ?? '',
										// The legacy height stops standing in for maxH
										height: 0
									}),
								onUseCurrentView: (nav: string) => update({ navState: nav }),
								editable: block.props.editable,
								onEditableChange: async (editable: boolean) => {
									const others = othersEditable(
										editor.document as unknown as BlockLike[],
										block.id,
										fileId
									)
									if (
										(await grantEmbedEditable(
											fileId,
											sourceFileId,
											editable,
											others
										)) &&
										// The block may be gone once the confirm dialog closes
										editor.getBlock(block.id)
									) {
										update({ editable })
									}
								},
								onRemove: () => editor.removeBlocks([block.id])
							})
						}}
					/>
				</div>
			)
		}
	}
)()

// vim: ts=4
