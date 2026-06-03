import i18next from 'i18next'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { initReactI18next } from 'react-i18next'
import { HashRouter } from 'react-router-dom'

// CSS imports
import '@symbion/opalui/dist/opalui.css'
import '@cloudillo/react/components.css'
import '../.cache/themes.css'
import './storybook.css'

import { Page, Story } from './storybook.js'
import { ThemeSwitcher } from './theme-switcher.js'

// Initialize i18next for DialogContainer
i18next.use(initReactI18next).init({
	lng: 'en',
	fallbackLng: 'en',
	resources: {
		en: {
			translation: {
				OK: 'OK',
				Cancel: 'Cancel',
				Yes: 'Yes',
				No: 'No'
			}
		}
	},
	interpolation: {
		escapeValue: false
	}
})

import { AccordionStory } from './accordion.story.js'
import { ActionSheetStory } from './action-sheet.story.js'
// New OpalUI component stories
import { AvatarStory } from './avatar.story.js'
import { BadgeStory } from './badge.story.js'
import { BottomSheetStory } from './bottom-sheet.story.js'
import { BoxStory } from './box.story.js'
// Import all story components
import { ButtonStory, ContainerStory, PopperStory } from './button.story.js'
import { DialogStory, UseDialogStory } from './dialog.story.js'
import { DropdownStory } from './dropdown.story.js'
import { EmptyStateStory } from './empty-state.story.js'
import { FilterBarStory } from './filter-bar.story.js'
import { FormStory } from './form.story.js'
import { InlineEditFormStory } from './inline-edit.story.js'
import { FcdStory } from './layout.story.js'
// New component stories
import {
	LoadingSpinnerStory,
	SkeletonCardStory,
	SkeletonListStory,
	SkeletonStory,
	SkeletonTextStory
} from './loading.story.js'
import { MenuStory } from './menu.story.js'
import { ModalStory } from './modal.story.js'
import { NavStory } from './nav.story.js'
import { PanelStory } from './panel.story.js'
import {
	IdentityTagStory,
	ProfileAudienceCardStory,
	ProfileCardStory,
	ProfilePictureStory
} from './profile.story.js'
import { ProgressStory } from './progress.story.js'
import { PropertyPanelStory } from './property-panel.story.js'
import { SelectStory } from './select.story.js'
import { SidebarStory } from './sidebar.story.js'
import { TabStory } from './tab.story.js'
import { TagStory } from './tag.story.js'
import { ToastStory } from './toast.story.js'
// Design system documentation
import { ColorsStory, TokensStory } from './tokens.story.js'
import { ToolbarStory } from './toolbar.story.js'
import { TreeViewStory } from './tree-view.story.js'

///////////////
// StoryBook //
///////////////
function Contents() {
	return (
		<Page>
			<Story name="" title="Cloudillo Component Library">
				<p>Welcome to the Cloudillo Component Storybook!</p>
				<p>
					This storybook showcases the React components available in the{' '}
					<code>@cloudillo/react</code> library. These components are used throughout the
					Cloudillo platform for building user interfaces.
				</p>
				<p>Navigate through the components using the menu on the left.</p>
				<h3>Component Categories</h3>
				<ul>
					<li>
						<strong>Design System:</strong> Design Tokens, Color System
					</li>
					<li>
						<strong>Layout:</strong> Box (HBox, VBox, Group), Panel, Container, Fcd,
						Modal, Sidebar
					</li>
					<li>
						<strong>Navigation:</strong> Nav, Tab, Dropdown, FilterBar
					</li>
					<li>
						<strong>Data Display:</strong> Avatar, Badge, Tag, Progress, EmptyState
					</li>
					<li>
						<strong>Forms:</strong> Input, TextArea, Select, Toggle, Fieldset,
						InlineEditForm
					</li>
					<li>
						<strong>Feedback:</strong> Toast, Dialog, LoadingSpinner, Skeleton
					</li>
					<li>
						<strong>Buttons:</strong> Button, LinkButton, Popper
					</li>
					<li>
						<strong>Profile:</strong> ProfilePicture, ProfileCard, IdentityTag
					</li>
				</ul>
			</Story>

			{/* Design System Documentation */}
			<TokensStory />
			<ColorsStory />

			{/* Layout Components */}
			<BoxStory />
			<PanelStory />
			<ContainerStory />
			<FcdStory />
			<ModalStory />
			<SidebarStory />

			{/* Navigation Components */}
			<NavStory />
			<TabStory />
			<DropdownStory />
			<FilterBarStory />
			<ToolbarStory />
			<MenuStory />
			<ActionSheetStory />
			<BottomSheetStory />
			<AccordionStory />

			{/* Data Display Components */}
			<AvatarStory />
			<BadgeStory />
			<TagStory />
			<ProgressStory />
			<EmptyStateStory />
			<TreeViewStory />

			{/* Form Components */}
			<FormStory />
			<SelectStory />
			<InlineEditFormStory />
			<PropertyPanelStory />

			{/* Feedback Components */}
			<ToastStory />
			<DialogStory />
			<UseDialogStory />
			<LoadingSpinnerStory />
			<SkeletonStory />
			<SkeletonTextStory />
			<SkeletonCardStory />
			<SkeletonListStory />

			{/* Button Components */}
			<ButtonStory />
			<PopperStory />

			{/* Profile Components */}
			<ProfilePictureStory />
			<IdentityTagStory />
			<ProfileCardStory />
			<ProfileAudienceCardStory />
		</Page>
	)
}

function App() {
	return (
		<HashRouter>
			<ThemeSwitcher />
			<Contents />
		</HashRouter>
	)
}

const app = document.getElementById('app')
const root = createRoot(app!)

root.render(
	<React.StrictMode>
		<App />
	</React.StrictMode>
)

// vim: ts=4
