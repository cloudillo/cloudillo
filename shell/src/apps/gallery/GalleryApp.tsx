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

import { useAuth, LoadingSpinner, EmptyState, Fcd, LoadMoreTrigger } from '@cloudillo/react'
import { getFileUrl } from '@cloudillo/base'

import { useCurrentContextIdTag } from '../../context/index.js'
import { useGalleryFilters } from './hooks/useGalleryFilters.js'
import { useGalleryImages } from './hooks/useGalleryImages.js'
import { GallerySidebar } from './components/GallerySidebar.js'
import { ActiveFilters } from './components/ActiveFilters.js'
import { GalleryToolbar } from './components/GalleryToolbar.js'
import { GalleryGrid } from './components/GalleryGrid.js'

export function GalleryApp() {
	const { t } = useTranslation()
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

	// Use infinite scroll hook for images
	const {
		photos: files,
		isLoading,
		isLoadingMore,
		error,
		hasMore,
		loadMore,
		sentinelRef
	} = useGalleryImages({
		apiQueryParams
	})

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

	// Render content based on state
	const renderContent = () => {
		// Loading state (initial load only)
		if (isLoading && files.length === 0) {
			return (
				<div className="d-flex align-items-center justify-content-center h-100">
					<LoadingSpinner size="lg" label={t('Loading gallery...')} />
				</div>
			)
		}

		// Empty state (no photos at all)
		if (files.length === 0 && !hasActiveFilters) {
			return (
				<EmptyState
					icon={<IcImage style={{ fontSize: '2.5rem' }} />}
					title={t('No images found')}
					description={t('Upload some images to see them here')}
				/>
			)
		}

		// Empty state (filters applied but no results)
		if (files.length === 0 && hasActiveFilters) {
			return (
				<EmptyState
					icon={<IcImage style={{ fontSize: '2.5rem' }} />}
					title={t('No photos match your filters')}
					description={t('Try adjusting your filters to see more photos')}
				/>
			)
		}

		// Photo grid with LoadMoreTrigger - FcdContent handles scrolling
		return (
			<>
				<GalleryGrid photos={photos || []} layout={filters.layout} className="p-3" />
				<LoadMoreTrigger
					ref={sentinelRef}
					isLoading={isLoadingMore}
					hasMore={hasMore}
					error={error}
					onRetry={loadMore}
					loadingLabel={t('Loading more images...')}
					retryLabel={t('Retry')}
					errorPrefix={t('Failed to load:')}
				/>
			</>
		)
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
				{files.length > 0 && (
					<ActiveFilters
						viewMode={filters.viewMode}
						selectedTags={filters.selectedTags}
						timeFilter={filters.timeFilter}
						onRemoveTag={toggleTag}
						onClearTimeFilter={() => setTimeFilter('all')}
						onClearViewMode={() => setViewMode('all')}
						onClearAll={clearAll}
						totalCount={undefined}
						filteredCount={files.length}
					/>
				)}

				{renderContent()}
			</Fcd.Content>

			{/* No Fcd.Details - gallery uses fluid width */}
		</Fcd.Container>
	)
}

// vim: ts=4
