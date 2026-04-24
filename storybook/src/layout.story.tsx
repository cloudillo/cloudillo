import * as React from 'react'
import { Story, Variant } from './storybook.js'
import { Fcd, Button } from '@cloudillo/react'

export function FcdStory() {
	const [showFilter, setShowFilter] = React.useState(false)
	const [showDetails, setShowDetails] = React.useState(false)
	const [showOverlay, setShowOverlay] = React.useState(false)
	const [showAdaptive, setShowAdaptive] = React.useState(false)
	const [showFluidAdaptive, setShowFluidAdaptive] = React.useState(false)

	return (
		<Story
			name="Fcd"
			description="Filter-Content-Details layout component. Responsive three-column layout with collapsible filter and details panels. Commonly used for list/detail views."
			props={[
				{
					name: 'Fcd.Container',
					type: 'Component',
					descr: 'Main container for FCD layout'
				},
				{
					name: 'Fcd.Filter',
					type: 'Component',
					descr: 'Left sidebar for filters (collapsible on mobile)'
				},
				{
					name: 'Fcd.Content',
					type: 'Component',
					descr: 'Main content area (always visible)'
				},
				{
					name: 'Fcd.Details',
					type: 'Component',
					descr: 'Right sidebar for details (collapsible on mobile/tablet)'
				}
			]}
		>
			<Variant name="Complete FCD Layout">
				<div style={{ height: '400px', border: '1px solid #ccc' }}>
					<Fcd.Container>
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

						<Fcd.Content
							header={
								<div
									className="c-hbox p-2"
									style={{ borderBottom: '1px solid #eee' }}
								>
									<Button onClick={() => setShowFilter(!showFilter)}>
										{showFilter ? 'Hide' : 'Show'} Filters
									</Button>
									<h3 className="fill m-0">Content Area</h3>
									<Button onClick={() => setShowDetails(!showDetails)}>
										{showDetails ? 'Hide' : 'Show'} Details
									</Button>
								</div>
							}
						>
							<div className="p-3">
								<div className="mb-3 p-3" style={{ background: '#f5f5f5' }}>
									Item 1
								</div>
								<div className="mb-3 p-3" style={{ background: '#f5f5f5' }}>
									Item 2
								</div>
								<div className="mb-3 p-3" style={{ background: '#f5f5f5' }}>
									Item 3
								</div>
								<div className="mb-3 p-3" style={{ background: '#f5f5f5' }}>
									Item 4
								</div>
							</div>
						</Fcd.Content>

						<Fcd.Details isVisible={showDetails} hide={() => setShowDetails(false)}>
							<div className="p-3">
								<h4>Details</h4>
								<p>This panel shows details about the selected item.</p>
								<p>On mobile and tablet, it appears as an overlay.</p>
								<p>On desktop, it's a fixed right column.</p>
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

			<Variant name="detailsMode='overlay' (fluid, full-bleed)">
				<div>
					<p className="c-hint mb-2">
						Calendar-style layout: container is fluid, details slides in as an overlay
						at every breakpoint. Content width never changes when details toggles.
					</p>
					<div style={{ height: '400px', border: '1px solid #ccc' }}>
						<Fcd.Container fluid detailsMode="overlay">
							<Fcd.Filter>
								<div className="p-3">
									<h4>Always-visible sidebar</h4>
									<p>Filter column (stays put)</p>
								</div>
							</Fcd.Filter>
							<Fcd.Content
								header={
									<div
										className="c-hbox p-2"
										style={{ borderBottom: '1px solid #eee' }}
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
									<p>
										Always an overlay. At lg+ you still get a close button
										because the panel isn't a real sibling column.
									</p>
								</div>
							</Fcd.Details>
						</Fcd.Container>
					</div>
				</div>
			</Variant>

			<Variant name="detailsMode='adaptive' (editor-style)">
				<div>
					<p className="c-hint mb-2">
						Notillo-style layout: container keeps the 1200px cap. Details is an overlay
						below xl (100em ≈ 1600px); at xl+ it docks in the viewport's right gutter,
						outside the container, so content width and position stay fixed. Dock width
						scales with the gutter up to 20rem (full width at 1840px+).
					</p>
					<div style={{ height: '400px', border: '1px solid #ccc' }}>
						<Fcd.Container detailsMode="adaptive">
							<Fcd.Filter>
								<div className="p-3">
									<h4>Sidebar</h4>
								</div>
							</Fcd.Filter>
							<Fcd.Content
								header={
									<div
										className="c-hbox p-2"
										style={{ borderBottom: '1px solid #eee' }}
									>
										<h3 className="fill m-0">Editor content (~900px at lg+)</h3>
										<Button onClick={() => setShowAdaptive((s) => !s)}>
											{showAdaptive ? 'Hide' : 'Show'} Comments
										</Button>
									</div>
								}
							>
								<div className="p-3">
									<p>
										Try this at ≥1600px viewport: details docks in the right
										gutter; this content doesn't shift. Below 1600px it behaves
										like overlay.
									</p>
								</div>
							</Fcd.Content>
							<Fcd.Details
								isVisible={showAdaptive}
								hide={() => setShowAdaptive(false)}
								header={
									<>
										<span className="fill font-semibold">Comments</span>
										<Button link size="small">
											+
										</Button>
									</>
								}
							>
								<div className="p-3">
									<p>
										Docked at xl+, overlay below xl. The title row + "+" button
										sit in the new <code>header</code> slot so they don't
										collide with the close button.
									</p>
								</div>
							</Fcd.Details>
						</Fcd.Container>
					</div>
				</div>
			</Variant>

			<Variant name="fluid + detailsMode='adaptive' (fallback to overlay)">
				<div>
					<p className="c-hint mb-2">
						Edge case: when the container is fluid, there's no viewport gutter to dock
						into, so <code>adaptive</code> falls back to <code>overlay</code> at every
						breakpoint.
					</p>
					<div style={{ height: '300px', border: '1px solid #ccc' }}>
						<Fcd.Container fluid detailsMode="adaptive">
							<Fcd.Content
								header={
									<div
										className="c-hbox p-2"
										style={{ borderBottom: '1px solid #eee' }}
									>
										<h3 className="fill m-0">Full-bleed content</h3>
										<Button onClick={() => setShowFluidAdaptive((s) => !s)}>
											{showFluidAdaptive ? 'Hide' : 'Show'} Details
										</Button>
									</div>
								}
							>
								<div className="p-3">
									<p>No gutter to dock into → overlay at every breakpoint.</p>
								</div>
							</Fcd.Content>
							<Fcd.Details
								isVisible={showFluidAdaptive}
								hide={() => setShowFluidAdaptive(false)}
							>
								<div className="p-3">
									<h4>Details</h4>
									<p>Overlay at all widths.</p>
								</div>
							</Fcd.Details>
						</Fcd.Container>
					</div>
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
