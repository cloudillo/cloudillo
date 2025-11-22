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
import { FcbStory } from './layout.story.js'

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
				<li><strong>Buttons:</strong> Button, Popper</li>
				<li><strong>Layout:</strong> Container, Fcb (Filter-Content-Browse)</li>
				<li><strong>Profile:</strong> ProfilePicture, ProfileCard, IdentityTag</li>
				<li><strong>Dialogs:</strong> Dialog, useDialog hook</li>
				<li><strong>Forms:</strong> Select (autocomplete)</li>
			</ul>
		</Story>

		{/* Button Components */}
		<ButtonStory/>
		<PopperStory/>
		<ContainerStory/>

		{/* Layout Components */}
		<FcbStory/>

		{/* Profile Components */}
		<ProfilePictureStory/>
		<IdentityTagStory/>
		<ProfileCardStory/>
		<ProfileAudienceCardStory/>

		{/* Dialog Components */}
		<DialogStory/>
		<UseDialogStory/>

		{/* Form Components */}
		<SelectStory/>
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
