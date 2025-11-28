import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import { Page, Story } from './storybook.js'
import { ThemeSwitcher } from './theme-switcher.js'

// Initialize i18next for DialogContainer
i18next
	.use(initReactI18next)
	.init({
		lng: 'en',
		fallbackLng: 'en',
		resources: {
			en: {
				translation: {
					'OK': 'OK',
					'Cancel': 'Cancel',
					'Yes': 'Yes',
					'No': 'No'
				}
			}
		},
		interpolation: {
			escapeValue: false
		}
	})

// Import all story components
import { ButtonStory, PopperStory, ContainerStory } from './button.story.js'
import {
	ProfilePictureStory,
	IdentityTagStory,
	ProfileCardStory,
	ProfileAudienceCardStory
} from './profile.story.js'
import { DialogStory, UseDialogStory } from './dialog.story.js'
import { SelectStory } from './select.story.js'
import { FcdStory } from './layout.story.js'

// New OpalUI component stories
import { AvatarStory } from './avatar.story.js'
import { BoxStory } from './box.story.js'
import { PanelStory } from './panel.story.js'
import { BadgeStory } from './badge.story.js'
import { ProgressStory } from './progress.story.js'
import { TagStory } from './tag.story.js'
import { FormStory } from './form.story.js'
import { NavStory } from './nav.story.js'
import { TabStory } from './tab.story.js'
import { DropdownStory } from './dropdown.story.js'
import { ModalStory } from './modal.story.js'
import { SidebarStory } from './sidebar.story.js'
import { ToastStory } from './toast.story.js'

// CSS is loaded via HTML link tags in index.html, not imported here
// to allow proper bundling via separate CSS build

///////////////
// StoryBook //
///////////////
function Contents() {
	return <Page>
		<Story name="" title="Cloudillo Component Library">
			<p>
				Welcome to the Cloudillo Component Storybook!
			</p>
			<p>
				This storybook showcases the React components available in the <code>@cloudillo/react</code> library.
				These components are used throughout the Cloudillo platform for building user interfaces.
			</p>
			<p>
				Navigate through the components using the menu on the left.
			</p>
			<h3>Component Categories</h3>
			<ul>
				<li><strong>Layout:</strong> Box (HBox, VBox, Group), Panel, Container, Fcd, Modal, Sidebar</li>
				<li><strong>Navigation:</strong> Nav, Tab, Dropdown</li>
				<li><strong>Data Display:</strong> Avatar, Badge, Tag, Progress</li>
				<li><strong>Forms:</strong> Input, TextArea, Select, Toggle, Fieldset</li>
				<li><strong>Feedback:</strong> Toast, Dialog</li>
				<li><strong>Buttons:</strong> Button, LinkButton, IconButton, Popper</li>
				<li><strong>Profile:</strong> ProfilePicture, ProfileCard, IdentityTag</li>
			</ul>
		</Story>

		{/* Layout Components */}
		<BoxStory/>
		<PanelStory/>
		<ContainerStory/>
		<FcdStory/>
		<ModalStory/>
		<SidebarStory/>

		{/* Navigation Components */}
		<NavStory/>
		<TabStory/>
		<DropdownStory/>

		{/* Data Display Components */}
		<AvatarStory/>
		<BadgeStory/>
		<TagStory/>
		<ProgressStory/>

		{/* Form Components */}
		<FormStory/>
		<SelectStory/>

		{/* Feedback Components */}
		<ToastStory/>
		<DialogStory/>
		<UseDialogStory/>

		{/* Button Components */}
		<ButtonStory/>
		<PopperStory/>

		{/* Profile Components */}
		<ProfilePictureStory/>
		<IdentityTagStory/>
		<ProfileCardStory/>
		<ProfileAudienceCardStory/>
	</Page>
}

function App() {
	return <HashRouter>
		<ThemeSwitcher/>
		<Contents/>
	</HashRouter>
}

const app = document.getElementById('app')
const root = createRoot(app!)

root.render(<React.StrictMode><App/></React.StrictMode>)

// vim: ts=4
