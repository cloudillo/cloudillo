// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import {
	Button,
	Segmented,
	SegmentedItem,
	Toolbar as ToolbarContainer,
	ToolbarDivider,
	ToolbarSpacer
} from '@cloudillo/react'
import { useTranslation } from 'react-i18next'
import {
	LuArrowLeft as IcArrowLeft,
	LuArrowUp as IcArrowUp,
	LuTrash2 as IcEmptyTrash,
	LuLayoutGrid as IcGrid,
	LuList as IcList
} from 'react-icons/lu'

export type DisplayMode = 'grid' | 'list'

export interface ToolbarProps {
	canGoBack?: boolean
	onGoBack?: () => void
	canGoUp?: boolean
	onGoUp?: () => void
	displayMode: DisplayMode
	onDisplayModeChange: (mode: DisplayMode) => void
	onEmptyTrash?: () => void
	className?: string
}

export function Toolbar({
	canGoBack,
	onGoBack,
	canGoUp,
	onGoUp,
	displayMode,
	onDisplayModeChange,
	onEmptyTrash,
	className
}: ToolbarProps) {
	const { t } = useTranslation()

	return (
		<ToolbarContainer className={className}>
			{onGoBack && (
				<Button
					icon={<IcArrowLeft />}
					aria-label={t('Go back')}
					disabled={!canGoBack}
					onClick={onGoBack}
				/>
			)}
			{onGoUp && (
				<Button
					icon={<IcArrowUp />}
					aria-label={t('Go to parent folder')}
					disabled={!canGoUp}
					onClick={onGoUp}
				/>
			)}
			{(onGoBack || onGoUp) && onEmptyTrash && <ToolbarDivider />}
			{onEmptyTrash && (
				<Button
					color="error"
					icon={<IcEmptyTrash />}
					aria-label={t('Empty trash')}
					onClick={onEmptyTrash}
				/>
			)}

			<ToolbarSpacer />

			<ToolbarDivider />
			<Segmented
				aria-label={t('View mode')}
				value={displayMode}
				onChange={(mode) => onDisplayModeChange(mode as DisplayMode)}
			>
				<SegmentedItem value="list" icon={IcList} label={t('List view')} />
				<SegmentedItem value="grid" icon={IcGrid} label={t('Grid view')} />
			</Segmented>
		</ToolbarContainer>
	)
}

// vim: ts=4
