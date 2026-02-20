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

import { Fcd, Panel, Button, DialogContainer } from '@cloudillo/react'

import { LuPanelLeft as IcSidebar } from 'react-icons/lu'

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
import './style.css'

import { useNotillo } from './hooks/useNotillo.js'
import { useLazyPageTree } from './hooks/useLazyPageTree.js'
import { usePageBlocks } from './hooks/usePageBlocks.js'
import { useTags } from './hooks/useTags.js'
import { useAllPages } from './hooks/useAllPages.js'
import { NotilloEditor } from './editor/NotilloEditor.js'
import { PageSidebar } from './pages/PageSidebar.js'
import { PageHeader } from './pages/PageHeader.js'

export function NotilloApp() {
	const notillo = useNotillo()
	const isReadOnly = notillo.access === 'read'
	const {
		pages,
		pagesWithChildren,
		expanded,
		loadingChildren,
		rootsLoaded,
		orphanPage,
		expand,
		collapse,
		toggleExpand,
		navigateToPage
	} = useLazyPageTree(notillo.client)
	const { tags, tagCounts } = useTags(notillo.client)
	const { allPages } = useAllPages(notillo.client)
	const [activePageId, setActivePageId] = React.useState<string | undefined>()
	const [showFilter, setShowFilter] = React.useState(false)
	const [activeTag, setActiveTag] = React.useState<string | null>(null)
	const [searchQuery, setSearchQuery] = React.useState('')

	// Create indexes for queries
	React.useEffect(() => {
		if (!notillo.client) return
		notillo.client.createIndex('p', 'pp').catch(console.error)
		notillo.client.createIndex('p', 'tg').catch(console.error)
	}, [notillo.client])

	// Auto-select first root page when roots load and none is selected
	React.useEffect(() => {
		if (!activePageId && rootsLoaded && pages.size > 0) {
			let firstPage: { id: string; order: number } | undefined
			for (const page of pages.values()) {
				if (
					page.parentPageId === '__root__' &&
					(!firstPage || page.order < firstPage.order)
				) {
					firstPage = { id: page.id, order: page.order }
				}
			}
			if (firstPage) {
				setActivePageId(firstPage.id)
			}
		}
	}, [pages, activePageId, rootsLoaded])

	const handleSelectPage = React.useCallback(
		async (pageId: string) => {
			setActivePageId(pageId)
			setShowFilter(false)
			await navigateToPage(pageId)
		},
		[navigateToPage]
	)

	const handleTagClick = React.useCallback((tag: string) => {
		setActiveTag(tag)
		setShowFilter(true)
	}, [])

	const isFiltering = !!searchQuery || !!activeTag

	const filteredResults = React.useMemo(() => {
		if (!searchQuery && !activeTag) return []
		const query = searchQuery.toLowerCase()
		const results: Array<{ id: string; title: string; icon?: string; tags?: string[] }> = []
		for (const page of allPages.values()) {
			if (activeTag && !page.tags?.includes(activeTag)) continue
			if (query && !page.title.toLowerCase().includes(query)) continue
			results.push({ id: page.id, title: page.title, icon: page.icon, tags: page.tags })
		}
		return results.sort((a, b) => {
			if (query) {
				const aPrefix = a.title.toLowerCase().startsWith(query)
				const bPrefix = b.title.toLowerCase().startsWith(query)
				if (aPrefix && !bPrefix) return -1
				if (!aPrefix && bPrefix) return 1
			}
			return a.title.localeCompare(b.title)
		})
	}, [searchQuery, activeTag, allPages])

	const activePage = activePageId ? pages.get(activePageId) : undefined
	const {
		blocks,
		loading: blocksLoading,
		loadedPageId,
		knownBlockIds,
		knownBlockOrders
	} = usePageBlocks(notillo.client, activePageId, notillo.ownerTag)

	// Loading state
	if (notillo.loading) {
		return (
			<div className="c-vbox w-100 h-100 justify-center align-center">
				<Panel className="c-vbox align-center p-2">
					<div className="c-spinner large" />
					<p className="mt-2">Connecting to Notillo...</p>
				</Panel>
			</div>
		)
	}

	// Error state
	if (notillo.error) {
		return (
			<div className="c-vbox w-100 h-100 justify-center align-center">
				<Panel className="c-alert error">
					<h3>Connection Error</h3>
					<p>{notillo.error.message}</p>
				</Panel>
			</div>
		)
	}

	if (!notillo.client || !notillo.idTag || !notillo.ownerTag) return null

	return (
		<Fcd.Container>
			<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
				<Panel elevation="mid" className="c-vbox fill">
					<PageSidebar
						client={notillo.client}
						pages={pages}
						pagesWithChildren={pagesWithChildren}
						expanded={expanded}
						loadingChildren={loadingChildren}
						orphanPage={orphanPage}
						onExpand={expand}
						onCollapse={collapse}
						onToggleExpand={toggleExpand}
						activePageId={activePageId}
						onSelectPage={handleSelectPage}
						userId={notillo.idTag}
						readOnly={isReadOnly}
						tags={tags}
						tagCounts={tagCounts}
						activeTag={activeTag}
						onSelectTag={handleTagClick}
						onClearTag={() => setActiveTag(null)}
						searchQuery={searchQuery}
						onSearchChange={setSearchQuery}
						filteredResults={filteredResults}
						isFiltering={isFiltering}
					/>
				</Panel>
			</Fcd.Filter>
			<Fcd.Content
				fluid
				header={
					activePage ? (
						<PageHeader
							client={notillo.client}
							page={activePage}
							readOnly={isReadOnly}
							onToggleSidebar={() => setShowFilter(true)}
						/>
					) : (
						<nav
							className="c-nav px-4 py-2 g-2 md-hide lg-hide"
							style={{ borderBottom: '1px solid var(--col-outline)' }}
						>
							<Button
								link
								mode="icon"
								size="small"
								onClick={() => setShowFilter(true)}
								title="Open sidebar"
							>
								<IcSidebar />
							</Button>
							<span className="font-semibold flex-fill">Notillo</span>
						</nav>
					)
				}
			>
				{activePage ? (
					blocksLoading || loadedPageId !== activePageId ? (
						<div className="c-vbox fill align-items-center justify-content-center">
							<div className="c-spinner" />
						</div>
					) : (
						<NotilloEditor
							key={activePageId}
							client={notillo.client}
							pageId={activePage.id}
							initialBlocks={blocks}
							knownBlockIds={knownBlockIds}
							knownBlockOrders={knownBlockOrders}
							readOnly={isReadOnly}
							userId={notillo.idTag}
							ownerTag={notillo.ownerTag}
							darkMode={notillo.darkMode}
							fileId={notillo.fileId}
							pages={pages}
							onSelectPage={handleSelectPage}
							onTagClick={handleTagClick}
							tags={tags}
							pageTags={activePage.tags}
						/>
					)
				) : (
					<div className="c-vbox fill align-items-center justify-content-center text-center p-4">
						{pages.size === 0 ? (
							<>
								<div className="text-3xl opacity-50 mb-3">📝</div>
								<p>No pages yet.</p>
								{!isReadOnly && (
									<p>Create a page from the sidebar to get started.</p>
								)}
							</>
						) : (
							<p>Select a page from the sidebar.</p>
						)}
					</div>
				)}
			</Fcd.Content>
			<DialogContainer />
		</Fcd.Container>
	)
}

// vim: ts=4
