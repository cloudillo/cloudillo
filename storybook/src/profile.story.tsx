import * as React from 'react'
import { Story, Variant } from './storybook.js'
import {
	ProfilePicture,
	ProfileCard,
	ProfileAudienceCard,
	IdentityTag,
	UnknownProfilePicture
} from '@cloudillo/react'

// Mock profile data for examples
const mockProfile = {
	idTag: 'alice.example',
	name: 'Alice Anderson',
	profilePic: undefined
}

const mockProfileWithPic = {
	idTag: 'bob.example',
	name: 'Bob Builder',
	profilePic: 'profile-pic-url'
}

const mockAudience = {
	idTag: 'group.community',
	name: 'Community Group'
}

export function ProfilePictureStory() {
	return <Story
		name="ProfilePicture"
		description="Displays user profile picture or default avatar. Supports tiny, small and regular sizes."
		props={[
			{ name: 'className', type: 'string', descr: 'Additional CSS classes' },
			{ name: 'profile', type: '{ profilePic?: string }', descr: 'Profile object with optional picture URL', required: true },
			{ name: 'small', type: 'boolean', descr: 'Render small version' },
			{ name: 'tiny', type: 'boolean', descr: 'Render tiny version (smaller than small)' },
			{ name: 'srcTag', type: 'string', descr: 'Source tag for fetching image' }
		]}
	>
		<Variant name='Profile Picture (Regular)'>
			<ProfilePicture profile={mockProfile} />
		</Variant>

		<Variant name='Profile Picture (Small)'>
			<ProfilePicture profile={mockProfile} small />
		</Variant>

		<Variant name='Profile Picture (Tiny)'>
			<ProfilePicture profile={mockProfile} tiny />
		</Variant>

		<Variant name='Unknown Profile Picture (Standalone)'>
			<div className="c-profile-card">
				<UnknownProfilePicture />
			</div>
		</Variant>

		<Variant name='Unknown Profile Picture (Small)'>
			<div className="c-profile-card">
				<UnknownProfilePicture small />
			</div>
		</Variant>

		<Variant name='Unknown Profile Picture (Tiny)'>
			<div className="c-profile-card">
				<UnknownProfilePicture tiny />
			</div>
		</Variant>
	</Story>
}

export function IdentityTagStory() {
	return <Story
		name="IdentityTag"
		description="Displays Cloudillo identity tag with @ symbol. Highlights invalid characters in warning color."
		props={[
			{ name: 'className', type: 'string', descr: 'Additional CSS classes' },
			{ name: 'idTag', type: 'string', descr: 'Identity tag to display' }
		]}
	>
		<Variant name='Valid Identity Tag'>
			<IdentityTag idTag="alice.example" />
		</Variant>

		<Variant name='Identity Tag with Subdomain'>
			<IdentityTag idTag="bob.team.company" />
		</Variant>

		<Variant name='Identity Tag with Invalid Characters'>
			<IdentityTag idTag="user_name@domain" />
		</Variant>

		<Variant name='Default (Dash)'>
			<IdentityTag />
		</Variant>
	</Story>
}

export function ProfileCardStory() {
	return <Story
		name="ProfileCard"
		description="Complete profile card with picture, name, and identity tag."
		props={[
			{ name: 'className', type: 'string', descr: 'Additional CSS classes' },
			{ name: 'profile', type: 'Profile', descr: 'Profile object with name, idTag, profilePic', required: true },
			{ name: 'srcTag', type: 'string', descr: 'Source tag for fetching image' }
		]}
	>
		<Variant name='Profile Card (No Picture)'>
			<ProfileCard profile={mockProfile} />
		</Variant>

		<Variant name='Profile Card with Different Name'>
			<ProfileCard profile={{
				idTag: 'charlie.dev',
				name: 'Charlie Developer'
			}} />
		</Variant>
	</Story>
}

export function ProfileAudienceCardStory() {
	return <Story
		name="ProfileAudienceCard"
		description="Profile card showing both audience and profile with overlapping pictures."
		props={[
			{ name: 'className', type: 'string', descr: 'Additional CSS classes' },
			{ name: 'audience', type: 'Profile', descr: 'Audience profile', required: true },
			{ name: 'profile', type: 'Profile', descr: 'User profile', required: true },
			{ name: 'srcTag', type: 'string', descr: 'Source tag for fetching image' }
		]}
	>
		<Variant name='Profile Audience Card'>
			<ProfileAudienceCard
				audience={mockAudience}
				profile={mockProfile}
			/>
		</Variant>

		<Variant name='Profile Audience Card with Different Profiles'>
			<ProfileAudienceCard
				audience={{
					idTag: 'team.engineering',
					name: 'Engineering Team'
				}}
				profile={{
					idTag: 'dana.engineer',
					name: 'Dana Engineer'
				}}
			/>
		</Variant>
	</Story>
}

// vim: ts=4
