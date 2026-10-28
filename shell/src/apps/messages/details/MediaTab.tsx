// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { type FileView, getFileUrl, getOptimalImageVariant } from '@cloudillo/core'
import {
	Alert,
	BadgeAnchor,
	Button,
	EmptyState,
	FileTile,
	Grid,
	IcDownload,
	Image,
	SkeletonList,
	Heading,
	useApi,
	VBox
} from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { IcGallery, IcMessage } from '../../../icons.js'
import { createdAtToSeconds } from '../../../read-position.js'
import { MediaViewer } from '../../viewer/MediaViewer.js'
import { useAttachmentFile } from '../conversation/MessageAttachments.js'
import { isGroupId } from '../utils.js'

type Attachment = NonNullable<ActionView['attachments']>[number]
interface Item {
	att: Attachment
	action: ActionView
}

const PAGE_SIZE = 30

export interface MediaTabProps {
	convId: string
	/** Node the files are served from (the local instance) */
	idTag: string
	/** Jump to the message carrying the attachment (`useMessages().jumpTo`) */
	onJump: (actionId: string, createdAt: number) => void
}

// The conversation's MSG attachments — an image grid (each tile opens that one
// image in MediaViewer) and a file list; every item can jump to its message.
export function MediaTab({ convId, idTag, onJump }: MediaTabProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [actions, setActions] = React.useState<ActionView[] | undefined>()
	const [cursor, setCursor] = React.useState<string | undefined>()
	const [loading, setLoading] = React.useState(false)
	const [error, setError] = React.useState(false)
	const [viewer, setViewer] = React.useState<FileView | undefined>()
	// A fresh load (conversation switch, reload) invalidates every in-flight request.
	const genRef = React.useRef(0)

	const load = React.useCallback(
		async (after?: string) => {
			if (!api) return
			const gen = after ? genRef.current : ++genRef.current
			setLoading(true)
			setError(false)
			try {
				const res = await api.actions.listPaginated({
					type: 'MSG',
					...(isGroupId(convId) ? { parentId: convId } : { involved: convId }),
					attachments: true,
					sort: 'created',
					sortDir: 'desc',
					limit: PAGE_SIZE,
					...(after ? { cursor: after } : {})
				})
				if (gen !== genRef.current) return
				const page = (res.data as ActionView[]).filter(
					(a) => a.subType !== 'DEL' && a.subType !== 'UPD' && a.attachments?.length
				)
				setActions((prev) => (after ? [...(prev ?? []), ...page] : page))
				setCursor(res.cursorPagination?.nextCursor ?? undefined)
			} catch (err) {
				console.error('Failed to load conversation media', err)
				if (gen === genRef.current) setError(true)
			} finally {
				if (gen === genRef.current) setLoading(false)
			}
		},
		[api, convId]
	)

	// Deps: reload on conversation switch
	React.useEffect(() => {
		setActions(undefined)
		setCursor(undefined)
		load()
	}, [load])

	function jump(action: ActionView) {
		onJump(action.actionId, createdAtToSeconds(action.createdAt))
	}

	function openImage(att: Attachment) {
		api?.files
			.getMetadata(att.fileId)
			.then(setViewer)
			.catch((err) => {
				console.error('Failed to open image', err)
				const url = getFileUrl(
					idTag,
					att.fileId,
					getOptimalImageVariant('fullscreen', att.localVariants)
				)
				if (url) window.open(url, '_blank', 'noopener')
			})
	}

	if (actions === undefined && !error) return <SkeletonList count={3} />

	const images: Item[] = []
	const files: Item[] = []
	for (const action of actions ?? []) {
		const into = action.subType === 'IMG' ? images : files
		for (const att of action.attachments ?? []) into.push({ att, action })
	}

	const jumpLabel = t('Show in conversation')

	return (
		<VBox gap={2} className="p-2">
			{error && (
				<Alert
					color="error"
					compact
					actions={
						<Button onClick={() => load(actions ? cursor : undefined)}>
							{t('Retry')}
						</Button>
					}
				>
					{t('Could not load media and files')}
				</Alert>
			)}
			{actions?.length === 0 && (
				<EmptyState
					icon={<IcGallery />}
					title={t('No media or files yet')}
					description={t('Images and files shared here will show up in this list.')}
				/>
			)}
			{images.length > 0 && (
				<>
					<Heading level={4} size="sm">
						{t('Media')}
					</Heading>
					<Grid gap={1} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
						{images.map(({ att, action }, i) => (
							<BadgeAnchor
								key={`${action.actionId}:${att.fileId}`}
								position="bottom-end"
								badge={
									<Button
										size="sm"
										icon={<IcMessage />}
										aria-label={jumpLabel}
										onClick={() => jump(action)}
									/>
								}
							>
								<Image
									role="button"
									tabIndex={0}
									alt={t('Image {{n}}', { n: i + 1 })}
									className="cursor-pointer"
									src={getFileUrl(
										idTag,
										att.fileId,
										getOptimalImageVariant('preview', att.localVariants)
									)}
									style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }}
									onClick={() => openImage(att)}
									onKeyDown={(evt: React.KeyboardEvent) => {
										if (evt.key === 'Enter' || evt.key === ' ') {
											evt.preventDefault()
											openImage(att)
										}
									}}
								/>
							</BadgeAnchor>
						))}
					</Grid>
				</>
			)}
			{files.length > 0 && (
				<>
					<Heading level={4} size="sm">
						{t('Files')}
					</Heading>
					{files.map(({ att, action }) => (
						<FileRow
							key={`${action.actionId}:${att.fileId}`}
							att={att}
							idTag={idTag}
							onOpen={setViewer}
							onJump={() => jump(action)}
						/>
					))}
				</>
			)}
			{cursor && !error && (
				<Button loading={loading} onClick={() => load(cursor)}>
					{t('Load more')}
				</Button>
			)}
			{viewer &&
				createPortal(
					<MediaViewer file={viewer} idTag={idTag} onBack={() => setViewer(undefined)} />,
					document.body
				)}
		</VBox>
	)
}

// One file: name and type from its metadata; open (viewable types) or download, plus jump.
function FileRow({
	att,
	idTag,
	onOpen,
	onJump
}: {
	att: Attachment
	idTag: string
	onOpen: (file: FileView) => void
	onJump: () => void
}) {
	const { t } = useTranslation()
	const { meta, name, download, open } = useAttachmentFile(att, idTag, onOpen)

	return (
		<FileTile
			name={name}
			meta={meta?.contentType}
			contentType={meta?.contentType}
			onClick={open}
			actions={
				<>
					<Button
						variant="ghost"
						size="sm"
						icon={<IcMessage />}
						aria-label={t('Show in conversation')}
						onClick={onJump}
					/>
					<Button
						variant="ghost"
						size="sm"
						icon={<IcDownload />}
						aria-label={t('Download')}
						onClick={download}
					/>
				</>
			}
		/>
	)
}

// vim: ts=4
