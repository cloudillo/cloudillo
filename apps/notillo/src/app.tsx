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
import { usePageTree } from './hooks/usePageTree.js'
import { usePageBlocks } from './hooks/usePageBlocks.js'
import { useTags } from './hooks/useTags.js'
import { NotilloEditor } from './editor/NotilloEditor.js'
import { PageSidebar } from './pages/PageSidebar.js'
import { PageHeader } from './pages/PageHeader.js'

export function NotilloApp() {
	const notillo = useNotillo()
	const isReadOnly = notillo.access === 'read'
	const pages = usePageTree(notillo.client)
	const { tags, tagPages } = useTags(notillo.client)
	const [activePageId, setActivePageId] = React.useState<string | undefined>()
	const [showFilter, setShowFilter] = React.useState(false)
	const [activeTag, setActiveTag] = React.useState<string | null>(null)

	// Auto-select first page when pages load and none is selected
	React.useEffect(() => {
		if (!activePageId && pages.size > 0) {
			// Find the first root page by order
			let firstPage: { id: string; order: number } | undefined
			for (const page of pages.values()) {
				if (!page.parentPageId && (!firstPage || page.order < firstPage.order)) {
					firstPage = { id: page.id, order: page.order }
				}
			}
			if (firstPage) {
				setActivePageId(firstPage.id)
			}
		}
	}, [pages, activePageId])

	const handleSelectPage = React.useCallback((pageId: string) => {
		setActivePageId(pageId)
		setShowFilter(false)
	}, [])

	const handleTagClick = React.useCallback((tag: string) => {
		setActiveTag(tag)
		setShowFilter(true)
	}, [])

	const activePage = activePageId ? pages.get(activePageId) : undefined
	const {
		blocks,
		loading: blocksLoading,
		loadedPageId,
		knownBlockIds,
		knownBlockOrders
	} = usePageBlocks(notillo.client, activePageId)

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

	if (!notillo.client || !notillo.idTag) return null

	return (
		<Fcd.Container>
			<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
				<Panel elevation="mid" className="c-vbox fill">
					<PageSidebar
						client={notillo.client}
						pages={pages}
						activePageId={activePageId}
						onSelectPage={handleSelectPage}
						userId={notillo.idTag}
						readOnly={isReadOnly}
						tags={tags}
						tagPages={tagPages}
						activeTag={activeTag}
						onSelectTag={handleTagClick}
						onClearTag={() => setActiveTag(null)}
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
							darkMode={notillo.darkMode}
							pages={pages}
							onSelectPage={handleSelectPage}
							onTagClick={handleTagClick}
							tags={tags}
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
