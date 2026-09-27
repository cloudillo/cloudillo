// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuCheck as IcCheck } from 'react-icons/lu'

import { useLibTranslation } from '../../i18n.js'
import { FileTypeIcon } from '../AppIcon/index.js'
import { ActionTarget, Image } from '../Image/index.js'
import { mergeClasses } from '../utils.js'

export interface FileTileProps {
	/** File name; on an `href`/`onClick` tile it is the stretched link covering the tile */
	name: React.ReactNode
	/** Secondary line (size, date, owner…) */
	meta?: React.ReactNode
	/** Preview image; without it the tile shows the FileTypeIcon for `contentType` */
	src?: string
	/** Alt text for `src` (default `""`: the name already labels the tile) */
	alt?: string
	/** MIME type for the icon fallback (`cloudillo/folder`, `image/png`, …) */
	contentType?: string
	selected?: boolean
	/** Hover-revealed tile actions (menu, checkbox); always visible on touch and focus */
	actions?: React.ReactNode
	href?: string
	onClick?: (evt: React.MouseEvent<HTMLElement>) => void
	className?: string
	style?: React.CSSProperties
}

/** Grid tile for a file or folder: preview (or type icon), name, meta, actions. */
export function FileTile({
	name,
	meta,
	src,
	alt = '',
	contentType,
	selected,
	actions,
	href,
	onClick,
	className,
	style
}: FileTileProps) {
	const { t } = useLibTranslation()
	return (
		<div
			className={mergeClasses('c-file-tile', selected && 'selected', className)}
			style={style}
		>
			<span className="c-file-tile-media">
				{src ? (
					<Image src={src} alt={alt} aspect={1} fit="cover" />
				) : (
					<FileTypeIcon contentType={contentType} size="lg" />
				)}
			</span>
			<ActionTarget
				href={href}
				onClick={onClick}
				className={mergeClasses('c-file-tile-name', (href || onClick) && 'c-surface-link')}
			>
				{name}
			</ActionTarget>
			{meta && <span className="c-file-tile-meta">{meta}</span>}
			{selected && (
				<span className="c-file-tile-check">
					<IcCheck role="img" aria-label={t('Selected')} />
				</span>
			)}
			{actions && <span className="c-file-tile-actions surface-actions">{actions}</span>}
		</div>
	)
}

// vim: ts=4
