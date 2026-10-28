// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { type FileView, getFileUrl, getOptimalImageVariant } from '@cloudillo/core'
import {
	Badge,
	BadgeAnchor,
	Button,
	FileTile,
	Grid,
	IcDownload,
	Image,
	useApi,
	VBox
} from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { isViewerSupported, MediaViewer, triggerFileDownload } from '../../viewer/MediaViewer.js'

type Attachment = NonNullable<ActionView['attachments']>[number]

const MAX_TILES = 4

export interface MessageAttachmentsProps {
	attachments: ActionView['attachments']
	/** `IMG` → image grid; any other subtype → one file card per attachment */
	subType: string | undefined
	/** Node the files are served from (the local instance) */
	idTag: string | undefined
}

function previewVariants(att: Attachment): boolean {
	return !!att.localVariants?.some((v) => v.startsWith('vis.'))
}

/** Images as a 1-4 tile grid ("+N" on the 4th), other files as cards; one opens in MediaViewer. */
export function MessageAttachments({ attachments, subType, idTag }: MessageAttachmentsProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [viewer, setViewer] = React.useState<FileView | undefined>()

	if (!idTag || !attachments?.length) return null
	const serving = idTag

	// MediaViewer takes a FileView, which the attachment doesn't carry: look it up.
	function openImage(att: Attachment) {
		api?.files
			.getMetadata(att.fileId)
			.then(setViewer)
			.catch((err) => {
				console.error('Failed to open image', err)
				const url = getFileUrl(
					serving,
					att.fileId,
					getOptimalImageVariant('fullscreen', att.localVariants)
				)
				if (url) window.open(url, '_blank', 'noopener')
			})
	}

	const viewerNode =
		viewer &&
		createPortal(
			<MediaViewer file={viewer} idTag={serving} onBack={() => setViewer(undefined)} />,
			document.body
		)

	if (subType !== 'IMG') {
		return (
			<VBox gap={1} className="mb-1">
				{attachments.map((att) => (
					<FileCard key={att.fileId} att={att} idTag={serving} onOpen={setViewer} />
				))}
				{viewerNode}
			</VBox>
		)
	}

	const shown = attachments.slice(0, MAX_TILES)
	const more = attachments.length - MAX_TILES
	return (
		<>
			<Grid
				gap={1}
				className="mb-1"
				style={{ gridTemplateColumns: shown.length === 1 ? '1fr' : 'repeat(2, 1fr)' }}
			>
				{shown.map((att, i) => {
					const tile = (
						<Image
							key={att.fileId}
							role="button"
							tabIndex={0}
							alt={t('Image {{n}}', { n: i + 1 })}
							className="cursor-pointer"
							src={getFileUrl(
								serving,
								att.fileId,
								getOptimalImageVariant('preview', att.localVariants)
							)}
							style={
								shown.length === 1
									? { maxWidth: '100%', maxHeight: '20rem' }
									: { width: '100%', aspectRatio: '1', objectFit: 'cover' }
							}
							onClick={() => openImage(att)}
							onKeyDown={(evt: React.KeyboardEvent) => {
								if (evt.key === 'Enter' || evt.key === ' ') {
									evt.preventDefault()
									openImage(att)
								}
							}}
						/>
					)
					return i === MAX_TILES - 1 && more > 0 ? (
						<BadgeAnchor
							key={att.fileId}
							position="bottom-end"
							badge={<Badge size="lg">{`+${more}`}</Badge>}
						>
							{tile}
						</BadgeAnchor>
					) : (
						tile
					)
				})}
			</Grid>
			{viewerNode}
		</>
	)
}

/** Metadata, display name, download and open-or-download for one file attachment. */
export function useAttachmentFile(
	att: Attachment,
	idTag: string,
	onOpen: (file: FileView) => void
): { meta: FileView | undefined; name: string; download: () => void; open: () => void } {
	const { t } = useTranslation()
	const { api } = useApi()
	const [meta, setMeta] = React.useState<FileView | undefined>()

	React.useEffect(() => {
		if (!api) return
		let cancelled = false
		api.files
			.getMetadata(att.fileId)
			.then((m) => {
				if (!cancelled) setMeta(m)
			})
			.catch((err) => console.error('Failed to load attachment metadata', err))
		return () => {
			cancelled = true
		}
	}, [api, att.fileId])

	const name = meta?.fileName ?? t('Attachment')
	const download = () => triggerFileDownload(idTag, att.fileId, name)
	const open = () => (meta && isViewerSupported(meta.contentType) ? onOpen(meta) : download())
	return { meta, name, download, open }
}

// One non-image file: name and type from its metadata, open (viewable types) or download.
// no size shown — FileView carries none; add when the metadata exposes it.
function FileCard({
	att,
	idTag,
	onOpen
}: {
	att: Attachment
	idTag: string
	onOpen: (file: FileView) => void
}) {
	const { t } = useTranslation()
	const { meta, name, download, open } = useAttachmentFile(att, idTag, onOpen)

	return (
		<FileTile
			name={name}
			meta={meta?.contentType}
			contentType={meta?.contentType}
			src={
				previewVariants(att)
					? getFileUrl(
							idTag,
							att.fileId,
							getOptimalImageVariant('preview', att.localVariants)
						)
					: undefined
			}
			style={{ width: '16rem', maxWidth: '100%' }}
			onClick={open}
			actions={
				<Button
					variant="ghost"
					size="sm"
					icon={<IcDownload />}
					aria-label={t('Download')}
					onClick={download}
				/>
			}
		/>
	)
}

// vim: ts=4
