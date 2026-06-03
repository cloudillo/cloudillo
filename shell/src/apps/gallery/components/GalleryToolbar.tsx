// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	Popper,
	Toolbar as ToolbarContainer,
	ToolbarDivider,
	ToolbarGroup,
	ToolbarSpacer
} from '@cloudillo/react'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuArrowUp as IcAsc,
	LuChevronDown as IcChevron,
	LuArrowDown as IcDesc,
	LuFilter as IcFilter,
	LuLayoutList as IcMasonry,
	LuLayoutGrid as IcRows
} from 'react-icons/lu'

import type { GalleryLayout, SortDir, SortOption } from '../types.js'

interface GalleryToolbarProps {
	className?: string
	layout: GalleryLayout
	onLayoutChange: (layout: GalleryLayout) => void
	sort: SortOption
	sortDir: SortDir
	onSortChange: (sort: SortOption, dir?: SortDir) => void
	onFilterToggle: () => void
	showFilterButton?: boolean
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
	onSortChange,
	onFilterToggle,
	showFilterButton = true
}: GalleryToolbarProps) {
	const { t } = useTranslation()
	const sortLabels = React.useMemo(() => getSortLabels(t), [t])

	const toggleSortDir = () => {
		onSortChange(sort, sortDir === 'asc' ? 'desc' : 'asc')
	}

	return (
		<ToolbarContainer className={className}>
			{/* Filter toggle button (mobile) */}
			{showFilterButton && (
				<Button
					mode="icon"
					className="md-hide lg-hide"
					onClick={onFilterToggle}
					title={t('Toggle filters')}
				>
					<IcFilter />
				</Button>
			)}

			<ToolbarSpacer />

			{/* Sort dropdown */}
			<Popper
				menuClassName="c-button g-2"
				label={
					<>
						{sortLabels[sort]} <IcChevron />
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
				mode="icon"
				onClick={toggleSortDir}
				title={sortDir === 'asc' ? t('Sort ascending') : t('Sort descending')}
			>
				{sortDir === 'asc' ? <IcAsc /> : <IcDesc />}
			</Button>

			<ToolbarDivider />

			{/* Layout toggle */}
			<ToolbarGroup>
				<Button
					mode="icon"
					active={layout === 'rows'}
					onClick={() => onLayoutChange('rows')}
					title={t('Justified rows layout')}
				>
					<IcRows />
				</Button>
				<Button
					mode="icon"
					active={layout === 'masonry'}
					onClick={() => onLayoutChange('masonry')}
					title={t('Masonry layout')}
				>
					<IcMasonry />
				</Button>
			</ToolbarGroup>
		</ToolbarContainer>
	)
}

// vim: ts=4
