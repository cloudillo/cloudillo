import * as React from 'react'
import { Story, Variant } from './storybook.js'
import {
	Sidebar,
	SidebarContent,
	SidebarHeader,
	SidebarFooter,
	SidebarNav,
	SidebarSection,
	SidebarBackdrop,
	SidebarToggle,
	useSidebar,
	NavItem,
	Button,
	HBox
} from '@cloudillo/react'
import {
	LuMenu as IcMenu,
	LuHouse as IcHome,
	LuUser as IcUser,
	LuSettings as IcSettings,
	LuFolder as IcFolder,
	LuPin as IcPin,
	LuPinOff as IcPinOff
} from 'react-icons/lu'

function SidebarDemo() {
	const sidebar = useSidebar({ id: 'demo', defaultWidth: 240 })

	return (
		<div
			className="pos-relative"
			style={{ height: '400px', border: '1px solid var(--col-border)' }}
		>
			<SidebarBackdrop show={sidebar.isOpen && !sidebar.isPinned} onClick={sidebar.close} />
			<Sidebar sidebar={sidebar} side="left">
				<SidebarContent>
					<SidebarHeader className="p-3">
						<HBox className="justify-content-between align-items-center">
							<h4 className="m-0">Menu</h4>
							<Button
								link
								onClick={sidebar.togglePin}
								title={sidebar.isPinned ? 'Unpin' : 'Pin'}
							>
								{sidebar.isPinned ? <IcPinOff /> : <IcPin />}
							</Button>
						</HBox>
					</SidebarHeader>
					<SidebarNav>
						<NavItem gap={2}>
							<IcHome /> Home
						</NavItem>
						<NavItem gap={2}>
							<IcUser /> Profile
						</NavItem>
						<NavItem gap={2}>
							<IcFolder /> Files
						</NavItem>
					</SidebarNav>
					<SidebarSection title="Settings">
						<SidebarNav>
							<NavItem gap={2}>
								<IcSettings /> Preferences
							</NavItem>
						</SidebarNav>
					</SidebarSection>
					<SidebarFooter className="p-3">
						<div className="text-disabled">Footer content</div>
					</SidebarFooter>
				</SidebarContent>
			</Sidebar>
			<div
				className="p-3"
				style={{ marginLeft: sidebar.isPinned ? '240px' : 0, transition: 'margin 0.3s' }}
			>
				<HBox gap={2} className="mb-3">
					<Button onClick={sidebar.toggle}>
						<IcMenu />
					</Button>
					<span>Click the menu button to toggle sidebar</span>
				</HBox>
				<p>
					Status: {sidebar.isOpen ? 'Open' : 'Closed'},{' '}
					{sidebar.isPinned ? 'Pinned' : 'Unpinned'}
				</p>
				<p>
					Main content area. The sidebar can overlay this content or push it aside when
					pinned.
				</p>
			</div>
		</div>
	)
}

export function SidebarStory() {
	return (
		<Story
			name="Sidebar"
			description="Sidebar navigation system with responsive behavior, pinning, and state management via useSidebar hook."
			props={[
				{ name: 'side', type: '"left" | "right"', descr: 'Sidebar position' },
				{ name: 'open', type: 'boolean', descr: 'Whether sidebar is open' },
				{
					name: 'pinned',
					type: 'boolean',
					descr: 'Whether sidebar is pinned (pushes content)'
				},
				{ name: 'collapsed', type: 'boolean', descr: 'Icon-only collapsed state' },
				{ name: 'width', type: 'number', descr: 'Sidebar width in pixels' },
				{ name: 'sidebar', type: 'UseSidebarReturn', descr: 'State from useSidebar hook' }
			]}
		>
			<Variant name="Interactive Sidebar">
				<SidebarDemo />
			</Variant>

			<Variant name="useSidebar Hook">
				<div className="c-panel p-3">
					<pre>{`const sidebar = useSidebar({
  id: 'my-sidebar',
  defaultOpen: false,
  defaultPinned: false,
  defaultWidth: 256,
  minWidth: 192,
  maxWidth: 384
})

// Returns:
// - isOpen, isPinned, isCollapsed, width
// - open(), close(), toggle()
// - pin(), unpin(), togglePin()
// - collapse(), expand(), toggleCollapse()
// - setWidth(width)`}</pre>
				</div>
			</Variant>

			<Variant name="Sidebar Components">
				<div className="c-panel p-3">
					<ul>
						<li>
							<code>Sidebar</code> - Main container
						</li>
						<li>
							<code>SidebarContent</code> - Content wrapper
						</li>
						<li>
							<code>SidebarHeader</code> - Header section
						</li>
						<li>
							<code>SidebarFooter</code> - Footer section
						</li>
						<li>
							<code>SidebarNav</code> - Navigation list
						</li>
						<li>
							<code>SidebarSection</code> - Grouped section with title
						</li>
						<li>
							<code>SidebarBackdrop</code> - Overlay backdrop
						</li>
						<li>
							<code>SidebarToggle</code> - Toggle button
						</li>
						<li>
							<code>SidebarResizeHandle</code> - Drag to resize
						</li>
					</ul>
				</div>
			</Variant>
		</Story>
	)
}

// vim: ts=4
