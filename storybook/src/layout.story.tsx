import { Button, DocBar, Fcd, List, ListItem, PageHeader } from '@cloudillo/react'
import * as React from 'react'

import { Story, Variant } from './storybook.js'

export function FcdStory() {
	const [showFilter, setShowFilter] = React.useState(false)
	const [showDetails, setShowDetails] = React.useState(false)
	const [showOverlay, setShowOverlay] = React.useState(false)
	const [showDocked, setShowDocked] = React.useState(false)
	const [filterCollapsed, setFilterCollapsed] = React.useState(false)

	return (
		<Story
			name="Fcd"
			description="Filter-Content-Details layout component. Full-width grid: a fixed filter rail pinned left, a capped content column centred in symmetric slack, and a details panel that slides, shrinks, then overlays. Commonly used for list/detail views."
			props={[
				{
					name: 'Fcd.Container',
					type: 'Component',
					descr: 'Main container (always full width). `bar` renders a full-width DocBar slot above the grid; `detailsMode="overlay"` never docks details; `detailsWidth` sets the details width'
				},
				{
					name: 'Fcd.Filter',
					type: 'Component',
					descr: 'Left filter rail (fixed width, drawer below md); `collapsed` removes the rail track'
				},
				{
					name: 'Fcd.Content',
					type: 'Component',
					descr: 'Main content column. `width`: reading | form (default) | wide | fluid; `surface="raised"` paints one L1 column'
				},
				{
					name: 'Fcd.Details',
					type: 'Component',
					descr: 'Right details panel: docks when there is room, overlays below the content floor, phone sheet below md'
				}
			]}
		>
			<Variant name="bar + width='wide' surface='raised' (Files-style)">
				<div style={{ height: '400px', border: '1px solid #ccc' }}>
					<Fcd.Container
						bar={
							<DocBar
								title="Files"
								state="ready"
								start={
									<Button onClick={() => setShowFilter(!showFilter)}>
										Filters
									</Button>
								}
							>
								<Button onClick={() => setShowDetails(!showDetails)}>
									{showDetails ? 'Hide' : 'Show'} Details
								</Button>
							</DocBar>
						}
					>
						<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
							<div className="p-3">
								<h4>Filters</h4>
								<div className="mt-2">
									<label>
										<input type="checkbox" /> Option 1
									</label>
								</div>
								<div>
									<label>
										<input type="checkbox" /> Option 2
									</label>
								</div>
								<div>
									<label>
										<input type="checkbox" /> Option 3
									</label>
								</div>
							</div>
						</Fcd.Filter>

						<Fcd.Content width="wide" surface="raised">
							<List variant="divided">
								<ListItem title="Item 1" subtitle="Rows sit on one raised column" />
								<ListItem title="Item 2" />
								<ListItem title="Item 3" />
								<ListItem title="Item 4" />
							</List>
						</Fcd.Content>

						<Fcd.Details isVisible={showDetails} hide={() => setShowDetails(false)}>
							<div className="p-3">
								<h4>Details</h4>
								<p>This panel shows details about the selected item.</p>
								<p>
									Docked (raised, no ✕) when the Fcd is wide enough, an overlay
									below that, a full-bleed sheet on phones.
								</p>
							</div>
						</Fcd.Details>
					</Fcd.Container>
				</div>
			</Variant>

			<Variant name="Content Only">
				<div style={{ height: '200px', border: '1px solid #ccc' }}>
					<Fcd.Container>
						<Fcd.Content>
							<div className="p-3">
								<h3>Simple Content</h3>
								<p>FCD layout works with just the Content component too.</p>
							</div>
						</Fcd.Content>
					</Fcd.Container>
				</div>
			</Variant>

			<Variant name="detailsMode='overlay' (Calendar-style)">
				<div>
					<p className="c-hint mb-2">
						Calendar-style layout: details slides in as an overlay at every width and
						never docks. Content width never changes when details toggles.
					</p>
					<div style={{ height: '400px', border: '1px solid #ccc' }}>
						<Fcd.Container detailsMode="overlay">
							<Fcd.Filter>
								<div className="p-3">
									<h4>Always-visible sidebar</h4>
									<p>Filter column (stays put)</p>
								</div>
							</Fcd.Filter>
							<Fcd.Content
								width="fluid"
								surface="raised"
								header={
									<div
										className="c-hbox g-2 p-2"
										style={{ borderBottom: '1px solid var(--col-outline)' }}
									>
										<h3 className="fill m-0">Full-bleed content</h3>
										<Button onClick={() => setShowOverlay((s) => !s)}>
											{showOverlay ? 'Hide' : 'Show'} Details overlay
										</Button>
									</div>
								}
							>
								<div className="p-3">
									<p>Toggle details — this content does not reflow.</p>
								</div>
							</Fcd.Content>
							<Fcd.Details isVisible={showOverlay} hide={() => setShowOverlay(false)}>
								<div className="p-3">
									<h4>Details (overlay)</h4>
									<p>Always an overlay, so the close button is always shown.</p>
								</div>
							</Fcd.Details>
						</Fcd.Container>
					</div>
				</div>
			</Variant>

			<Variant name="Default details docking (slide → shrink → overlay)">
				<div>
					<p className="c-hint mb-2">
						Notillo-style layout. While details is shown, content first slides left into
						the slack, then narrows; once it would drop below 36rem, details overlays
						instead. Resize the window to see all three.
					</p>
					<div style={{ height: '400px', border: '1px solid #ccc' }}>
						<Fcd.Container>
							<Fcd.Filter>
								<div className="p-3">
									<h4>Sidebar</h4>
								</div>
							</Fcd.Filter>
							<Fcd.Content
								header={
									<div
										className="c-hbox g-2 p-2"
										style={{ borderBottom: '1px solid var(--col-outline)' }}
									>
										<h3 className="fill m-0">Editor content (form width)</h3>
										<Button onClick={() => setShowDocked((s) => !s)}>
											{showDocked ? 'Hide' : 'Show'} Comments
										</Button>
									</div>
								}
							>
								<div className="p-3">
									<p>Content keeps its width as long as the slack allows.</p>
								</div>
							</Fcd.Content>
							<Fcd.Details
								isVisible={showDocked}
								hide={() => setShowDocked(false)}
								header={
									<>
										<span className="fill font-semibold">Comments</span>
										<Button variant="link" size="sm">
											+
										</Button>
									</>
								}
							>
								<div className="p-3">
									<p>
										The title row + "+" button sit in the <code>header</code>{' '}
										slot so they don't collide with the close button.
									</p>
								</div>
							</Fcd.Details>
						</Fcd.Container>
					</div>
				</div>
			</Variant>

			<Variant name="filterLabel (built-in mobile toggle), collapsible filter, detailsWidth">
				<div style={{ height: '300px', border: '1px solid #ccc' }}>
					<Fcd.Container filterLabel="Filters" detailsWidth="28rem">
						<Fcd.Filter collapsed={filterCollapsed}>
							<div className="p-3">
								<h4>Filters</h4>
								<p>Below md, the toggle row in Content opens this drawer.</p>
							</div>
						</Fcd.Filter>
						<Fcd.Content>
							<div className="p-3">
								<Button onClick={() => setFilterCollapsed(!filterCollapsed)}>
									{filterCollapsed ? 'Show filter rail' : 'Collapse filter rail'}
								</Button>
								<p>No isVisible/hide state needed on Fcd.Filter.</p>
							</div>
						</Fcd.Content>
					</Fcd.Container>
				</div>
			</Variant>

			<Variant name="Content width='reading' | 'form' | 'wide' | 'fluid', divided List">
				{(['reading', 'form', 'wide', 'fluid'] as const).map((width) => (
					<div key={width} style={{ height: '220px', border: '1px solid #ccc' }}>
						<Fcd.Container filterLabel="Filters">
							<Fcd.Filter>
								<p>
									Padded rail; below md a capped drawer with backdrop and ✕ row.
								</p>
							</Fcd.Filter>
							<Fcd.Content width={width}>
								<List variant="divided">
									<ListItem
										title={`width="${width}"`}
										subtitle="One surface, divided rows"
									/>
									<ListItem
										size="sm"
										title='size="sm"'
										subtitle="36px on fine pointers"
									/>
								</List>
							</Fcd.Content>
						</Fcd.Container>
					</div>
				))}
			</Variant>

			<Variant name="Content layout='column'">
				<div style={{ height: '200px', border: '1px solid #ccc' }}>
					<Fcd.Container>
						<Fcd.Content width="fluid" layout="column">
							<div className="fill overflow-y-auto p-3">
								<p>The child owns scrolling; no mobile scroll padding.</p>
							</div>
						</Fcd.Content>
					</Fcd.Container>
				</div>
			</Variant>
		</Story>
	)
}

export function PageHeaderStory() {
	return (
		<Story
			name="PageHeader"
			description="The page's own title (h1 by default) with subtitle, leading, actions and back link"
		>
			<Variant name="Basic">
				<PageHeader title="Settings" subtitle="Manage your account" />
			</Variant>
			<Variant name="With back, leading and actions">
				<PageHeader
					back="/"
					leading={<span className="c-badge">AB</span>}
					title="Alice Bob"
					subtitle="alice.example.org"
					actions={<Button variant="soft">Edit</Button>}
				/>
			</Variant>
			<Variant name="level=2">
				<PageHeader level={2} title="Section page" />
			</Variant>
		</Story>
	)
}

// vim: ts=4
