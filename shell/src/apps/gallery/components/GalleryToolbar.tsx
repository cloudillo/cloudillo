// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
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
import {
	LuLayoutGrid as IcRows,
	LuLayoutList as IcMasonry,
	LuFilter as IcFilter,
	LuArrowUp as IcAsc,
	LuArrowDown as IcDesc,
	LuChevronDown as IcChevron
} from 'react-icons/lu'

import {
	Button,
	Popper,
	Toolbar as ToolbarContainer,
	ToolbarSpacer,
	ToolbarGroup,
	ToolbarDivider
} from '@cloudillo/react'

import type { GalleryLayout, SortOption, SortDir } from '../types.js'

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

const SORT_LABELS: Record<SortOption, string> = {
	created: 'Date taken',
	name: 'Name'
}

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
						{t(SORT_LABELS[sort])} <IcChevron />
					</>
				}
				contentClassName="c-nav vertical emph"
			>
				{(Object.keys(SORT_LABELS) as SortOption[]).map((sortOption) => (
					<Button
						key={sortOption}
						navItem
						active={sort === sortOption}
						onClick={() => onSortChange(sortOption)}
					>
						{t(SORT_LABELS[sortOption])}
					</Button>
				))}
			</Popper>

			{/* Sort direction toggle */}
			<Button
				mode="icon"
				onClick={toggleSortDir}
				title={t(sortDir === 'asc' ? 'Sort ascending' : 'Sort descending')}
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
