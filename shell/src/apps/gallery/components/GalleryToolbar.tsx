// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	IcDropdown,
	IcSortAsc,
	IcSortDesc,
	Popper,
	Toolbar as ToolbarContainer,
	ToolbarDivider,
	ToolbarGroup,
	ToolbarSpacer
} from '@cloudillo/react'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { IcMasonry, IcRows } from '../../../icons.js'
import type { GalleryLayout, SortDir, SortOption } from '../types.js'

interface GalleryToolbarProps {
	className?: string
	layout: GalleryLayout
	onLayoutChange: (layout: GalleryLayout) => void
	sort: SortOption
	sortDir: SortDir
	onSortChange: (sort: SortOption, dir?: SortDir) => void
}

const getSortLabels = (t: TFunction): Record<SortOption, string> => ({
	created: t('Date taken'),
	name: t('Name')
})

export function GalleryToolbar({
	className,
	layout,
	onLayoutChange,
	sort,
	sortDir,
	onSortChange
}: GalleryToolbarProps) {
	const { t } = useTranslation()
	const sortLabels = React.useMemo(() => getSortLabels(t), [t])

	const toggleSortDir = () => {
		onSortChange(sort, sortDir === 'asc' ? 'desc' : 'asc')
	}

	return (
		<ToolbarContainer className={className}>
			<ToolbarSpacer />

			{/* Sort dropdown */}
			<Popper
				menuClassName="c-button g-2"
				label={
					<>
						{sortLabels[sort]} <IcDropdown />
					</>
				}
				contentClassName="c-nav vertical emph"
			>
				{(Object.keys(sortLabels) as SortOption[]).map((sortOption) => (
					<Button
						key={sortOption}
						kind="nav-item"
						active={sort === sortOption}
						onClick={() => onSortChange(sortOption)}
					>
						{sortLabels[sortOption]}
					</Button>
				))}
			</Popper>

			{/* Sort direction toggle */}
			<Button
				onClick={toggleSortDir}
				aria-label={sortDir === 'asc' ? t('Sort ascending') : t('Sort descending')}
				icon={sortDir === 'asc' ? <IcSortAsc /> : <IcSortDesc />}
			/>

			<ToolbarDivider />

			{/* Layout toggle */}
			<ToolbarGroup>
				<Button
					active={layout === 'rows'}
					onClick={() => onLayoutChange('rows')}
					icon={<IcRows />}
					aria-label={t('Justified rows layout')}
				/>
				<Button
					active={layout === 'masonry'}
					onClick={() => onLayoutChange('masonry')}
					icon={<IcMasonry />}
					aria-label={t('Masonry layout')}
				/>
			</ToolbarGroup>
		</ToolbarContainer>
	)
}

// vim: ts=4
