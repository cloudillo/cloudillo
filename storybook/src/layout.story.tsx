import * as React from 'react'
import { Story, Variant } from './storybook.js'
import { Fcb, Button } from '@cloudillo/react'

export function FcbStory() {
	const [showFilter, setShowFilter] = React.useState(false)
	const [showDetails, setShowDetails] = React.useState(false)

	return <Story
		name="Fcb"
		description="Filter-Content-Browse layout component. Responsive three-column layout with collapsible filter and details panels. Commonly used for list/detail views."
		props={[
			{ name: 'Fcb.Container', type: 'Component', descr: 'Main container for FCB layout' },
			{ name: 'Fcb.Filter', type: 'Component', descr: 'Left sidebar for filters (collapsible on mobile)' },
			{ name: 'Fcb.Content', type: 'Component', descr: 'Main content area (always visible)' },
			{ name: 'Fcb.Details', type: 'Component', descr: 'Right sidebar for details (collapsible on mobile/tablet)' }
		]}
	>
		<Variant name='Complete FCB Layout'>
			<div style={{ height: '400px', border: '1px solid #ccc' }}>
				<Fcb.Container>
					<Fcb.Filter
						isVisible={showFilter}
						hide={() => setShowFilter(false)}
					>
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
					</Fcb.Filter>

					<Fcb.Content
						header={
							<div className="c-hbox p-2" style={{ borderBottom: '1px solid #eee' }}>
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
					</Fcb.Content>

					<Fcb.Details
						isVisible={showDetails}
						hide={() => setShowDetails(false)}
					>
						<div className="p-3">
							<h4>Details</h4>
							<p>This panel shows details about the selected item.</p>
							<p>On mobile and tablet, it appears as an overlay.</p>
							<p>On desktop, it's a fixed right column.</p>
						</div>
					</Fcb.Details>
				</Fcb.Container>
			</div>
		</Variant>

		<Variant name='Content Only'>
			<div style={{ height: '200px', border: '1px solid #ccc' }}>
				<Fcb.Container>
					<Fcb.Content>
						<div className="p-3">
							<h3>Simple Content</h3>
							<p>FCB layout works with just the Content component too.</p>
						</div>
					</Fcb.Content>
				</Fcb.Container>
			</div>
		</Variant>
	</Story>
}

// vim: ts=4
