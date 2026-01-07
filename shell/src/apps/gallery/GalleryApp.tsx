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
import { LuImage as IcImage } from 'react-icons/lu'

import { useAuth, LoadingSpinner, EmptyState, Fcd } from '@cloudillo/react'
import { getFileUrl } from '@cloudillo/base'

import { useCurrentContextIdTag, useContextAwareApi } from '../../context/index.js'
import { useGalleryFilters } from './hooks/useGalleryFilters.js'
import { GallerySidebar } from './components/GallerySidebar.js'
import { ActiveFilters } from './components/ActiveFilters.js'
import { GalleryToolbar } from './components/GalleryToolbar.js'
import { GalleryGrid } from './components/GalleryGrid.js'
import type { Photo } from './types.js'

interface FileResponse {
	fileId: string
	variantId?: string
	fileName: string
	contentType: string
	createdAt: string | Date
	preset?: string
	tags?: string[]
	owner?: {
		idTag: string
		name?: string
		profilePic?: string
	}
	x?: {
		dim?: [number, number]
		caption?: string
	}
}

export function GalleryApp() {
	const { t } = useTranslation()
	const { api } = useContextAwareApi()
	const [auth] = useAuth()
	const contextIdTag = useCurrentContextIdTag()

	// Filter state with URL sync
	const {
		filters,
		setViewMode,
		setTimeFilter,
		setLayout,
		setSort,
		toggleTag,
		clearTags,
		clearAll,
		hasActiveFilters,
		apiQueryParams
	} = useGalleryFilters()

	// UI state
	const [showFilter, setShowFilter] = React.useState(false)
	const [files, setFiles] = React.useState<Photo[] | undefined>()
	const [totalCount, setTotalCount] = React.useState<number | undefined>()

	// Convert files to photo format for the grid
	const photos = React.useMemo(
		() =>
			files?.map((f) => {
				const idTag = contextIdTag || auth?.idTag || ''
				const fileId = f.fileId
				return {
					// Grid preview: use vis.sd (640px) for good quality thumbnails
					src: getFileUrl(idTag, fileId, 'vis.sd'),
					// Lightbox fullscreen: use vis.hd (1920px) for high quality
					fullSrc: getFileUrl(idTag, fileId, 'vis.hd'),
					width: f.x?.dim?.[0] || 100,
					height: f.x?.dim?.[1] || 100,
					title: f.x?.caption || f.fileName
				}
			}),
		[files, contextIdTag, auth?.idTag]
	)

	// Load images when filters change
	React.useEffect(
		function loadImageList() {
			if (!api) return

			;(async function () {
				try {
					// Get all files to calculate total count
					const allFiles = await api.files.list({
						contentType: 'image/*'
					})
					setTotalCount(allFiles.length)

					// Get filtered files
					const filteredFiles = await api.files.list({
						contentType: 'image/*',
						...apiQueryParams
					})

					setFiles(
						filteredFiles.map((f: FileResponse) => ({
							fileId: f.fileId,
							variantId: undefined,
							fileName: f.fileName,
							contentType: f.contentType,
							createdAt:
								typeof f.createdAt === 'string'
									? f.createdAt
									: f.createdAt.toISOString(),
							preset: f.preset || '',
							tags: f.tags,
							x: f.x
						}))
					)
				} catch {
					setFiles([])
				}
			})()
		},
		[api, apiQueryParams]
	)

	// Render content based on state
	const renderContent = () => {
		// Loading state
		if (!photos) {
			return (
				<div className="d-flex align-items-center justify-content-center h-100">
					<LoadingSpinner size="lg" label={t('Loading gallery...')} />
				</div>
			)
		}

		// Empty state (no photos at all)
		if (photos.length === 0 && !hasActiveFilters) {
			return (
				<EmptyState
					icon={<IcImage style={{ fontSize: '2.5rem' }} />}
					title={t('No images found')}
					description={t('Upload some images to see them here')}
				/>
			)
		}

		// Empty state (filters applied but no results)
		if (photos.length === 0 && hasActiveFilters) {
			return (
				<EmptyState
					icon={<IcImage style={{ fontSize: '2.5rem' }} />}
					title={t('No photos match your filters')}
					description={t('Try adjusting your filters to see more photos')}
				/>
			)
		}

		// Photo grid - FcdContent handles scrolling, just add padding
		return <GalleryGrid photos={photos} layout={filters.layout} className="p-3" />
	}

	return (
		<Fcd.Container className="fluid overflow-hidden">
			<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
				<GallerySidebar
					viewMode={filters.viewMode}
					onViewModeChange={setViewMode}
					timeFilter={filters.timeFilter}
					onTimeFilterChange={setTimeFilter}
					selectedTags={filters.selectedTags}
					onTagToggle={toggleTag}
					onClearTags={clearTags}
				/>
			</Fcd.Filter>

			<Fcd.Content
				fluid
				header={
					<GalleryToolbar
						layout={filters.layout}
						onLayoutChange={setLayout}
						sort={filters.sort}
						sortDir={filters.sortDir}
						onSortChange={setSort}
						onFilterToggle={() => setShowFilter((v) => !v)}
					/>
				}
			>
				{photos && (
					<ActiveFilters
						viewMode={filters.viewMode}
						selectedTags={filters.selectedTags}
						timeFilter={filters.timeFilter}
						onRemoveTag={toggleTag}
						onClearTimeFilter={() => setTimeFilter('all')}
						onClearViewMode={() => setViewMode('all')}
						onClearAll={clearAll}
						totalCount={totalCount}
						filteredCount={photos.length}
					/>
				)}

				{renderContent()}
			</Fcd.Content>

			{/* No Fcd.Details - gallery uses fluid width */}
		</Fcd.Container>
	)
}

// vim: ts=4
