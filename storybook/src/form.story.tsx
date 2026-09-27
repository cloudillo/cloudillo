import {
	Button,
	Checkbox,
	DateTimePicker,
	Field,
	Fieldset,
	Input,
	InputGroup,
	Kbd,
	NativeSelect,
	PasswordInput,
	PasswordStrengthBar,
	RadioGroup,
	SearchInput,
	Segmented,
	SegmentedItem,
	Slider,
	TextArea,
	Toggle,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import {
	LuAlignCenter as IcAlignCenter,
	LuAlignLeft as IcAlignLeft,
	LuAlignRight as IcAlignRight,
	LuBold as IcBold,
	LuGlobe as IcGlobe,
	LuItalic as IcItalic,
	LuLock as IcLock,
	LuMail as IcMail,
	LuSearch as IcSearch,
	LuStar as IcStar,
	LuUnderline as IcUnderline,
	LuUsers as IcUsers
} from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

function PasswordDemo() {
	const [password, setPassword] = React.useState('')
	return (
		<Field label="Password">
			<PasswordInput
				leading={<IcLock />}
				value={password}
				onChange={(e) => setPassword(e.target.value)}
			/>
			<PasswordStrengthBar password={password} align="right" />
		</Field>
	)
}

export function FormStory() {
	const [toggleValue, setToggleValue] = React.useState(false)
	const [email, setEmail] = React.useState('not-an-email')
	const [communities, setCommunities] = React.useState<string[]>(['Photography'])
	const [visibility, setVisibility] = React.useState<'P' | 'C' | 'F'>('C')
	const [view, setView] = React.useState('week')
	const [align, setAlign] = React.useState('left')
	const [marks, setMarks] = React.useState<string[]>(['bold'])
	const [query, setQuery] = React.useState('')
	const [lastSearch, setLastSearch] = React.useState('')
	const [volume, setVolume] = React.useState(40)
	const [when, setWhen] = React.useState('2026-09-26T09:00')
	const [since, setSince] = React.useState('2021-03')

	return (
		<Story
			name="Form"
			description="Form components: Field wires a label, hint and error into Input, TextArea and NativeSelect; plus InputGroup, Fieldset, choice controls, Segmented, SearchInput, Kbd and Slider."
			props={[
				{ name: 'className', type: 'string', descr: 'Additional CSS classes' },
				{ name: 'Segmented.size', type: "'sm' | 'md' | 'lg'", descr: 'Control size' },
				{
					name: 'Segmented.fill',
					type: 'boolean',
					descr: 'Stretch to the container width'
				},
				{
					name: 'Segmented.multiple',
					type: 'boolean',
					descr: 'Multi-toggle; value/onChange take string[]'
				},
				{
					name: 'Segmented.layout',
					type: "'row' | 'grid'",
					descr: 'grid = auto-fill columns (--segmented-min)'
				},
				{
					name: 'SegmentedItem.icon',
					type: 'ComponentType',
					descr: 'Icon; icon-only items require label'
				},
				{
					name: 'SearchInput.shortcut',
					type: 'ReactNode',
					descr: 'Kbd hint while empty, hidden on touch'
				},
				{
					name: 'SearchInput.onSearch',
					type: '(query: string) => void',
					descr: 'Query callback, debounced by debounce ms'
				},
				{
					name: 'Slider.format',
					type: '(value: number) => ReactNode',
					descr: 'Value readout formatter'
				},
				{ name: 'label', type: 'React.ReactNode', descr: 'Field / Toggle: label text' },
				{ name: 'hint', type: 'React.ReactNode', descr: 'Field only: helper text below' },
				{
					name: 'error',
					type: 'React.ReactNode',
					descr: 'Field only: error text; marks the control aria-invalid'
				},
				{ name: 'required', type: 'boolean', descr: 'Field only: required marker' },
				{
					name: 'orientation',
					type: "'vertical' | 'horizontal'",
					descr: 'Field only: label above or left of the control'
				},
				{
					name: 'size',
					type: "'sm' | 'md' | 'lg'",
					descr: 'Field, Input, NativeSelect: control size'
				},
				{
					name: 'leading / trailing',
					type: 'React.ReactNode',
					descr: 'Input only: slots inside the border'
				},
				{ name: 'resize', type: 'boolean', descr: 'TextArea only: allow resize' },
				{ name: 'legend', type: 'React.ReactNode', descr: 'Fieldset only: legend text' },
				{ name: 'variant', type: "'inset'", descr: 'Fieldset only: indented nested group' },
				{ name: 'color', type: 'ColorVariant', descr: 'Toggle only: color' },
				{
					name: 'description',
					type: 'React.ReactNode',
					descr: 'Toggle, Checkbox: muted line under the label'
				},
				{
					name: 'variant',
					type: "'card'",
					descr: 'Checkbox, RadioGroup: bordered tile with leading, title, description'
				},
				{
					name: 'options',
					type: 'RadioOption[]',
					descr: 'RadioGroup: { value, label, description?, leading?, disabled? }'
				},
				{
					name: 'value / onChange',
					type: 'V / (value: V) => void',
					descr: 'RadioGroup: selected value'
				},
				{
					name: 'orientation',
					type: "'vertical' | 'horizontal'",
					descr: 'RadioGroup: stack direction'
				}
			]}
		>
			<Variant name="Field">
				<VBox gap={3}>
					<Field label="Full name">
						<Input placeholder="Jane Doe" />
					</Field>
					<Field label="Display name" hint="Shown to people you share with" required>
						<Input />
					</Field>
					<Field
						label="Email"
						error={email.includes('@') ? undefined : 'Enter a valid email address'}
					>
						<Input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
					</Field>
					<Field label="Bio" hint="A few words about you">
						<TextArea rows={3} />
					</Field>
				</VBox>
			</Variant>

			<Variant name="Field (horizontal)">
				<VBox gap={2}>
					<Field label="Language" orientation="horizontal">
						<NativeSelect>
							<option>English</option>
							<option>Magyar</option>
						</NativeSelect>
					</Field>
					<Field
						label="Session timeout"
						orientation="horizontal"
						hint="Minutes of inactivity before sign-out"
					>
						<Input type="number" defaultValue={30} trailing="min" />
					</Field>
					<Field label="Width" orientation="horizontal" size="sm">
						<Input type="number" defaultValue={120} />
					</Field>
				</VBox>
			</Variant>

			<Variant name="Input slots">
				<VBox gap={2}>
					<Input aria-label="Search" leading={<IcSearch />} placeholder="Search" />
					<Input aria-label="Website" leading="https://" placeholder="example.com" />
					<Input aria-label="Email" leading={<IcMail />} trailing="@cloudillo.org" />
					<Input
						aria-label="Invite code"
						trailing={
							<Button size="sm" variant="ghost">
								Paste
							</Button>
						}
					/>
				</VBox>
			</Variant>

			<Variant name="Sizes">
				<VBox gap={2}>
					<Input aria-label="Small" size="sm" placeholder="Small" />
					<Input aria-label="Medium" placeholder="Medium (default)" />
					<Input aria-label="Large" size="lg" placeholder="Large" />
					<NativeSelect aria-label="Small select" size="sm">
						<option>Small select</option>
					</NativeSelect>
					<NativeSelect aria-label="Large select" size="lg">
						<option>Large select</option>
					</NativeSelect>
				</VBox>
			</Variant>

			<Variant name="Input">
				<VBox gap={2}>
					<Input aria-label="Text" placeholder="Text input" />
					<Input aria-label="Email" type="email" placeholder="Email input" />
					<Input aria-label="Password" type="password" placeholder="Password input" />
					<Input aria-label="Number" type="number" placeholder="Number input" />
					<Input aria-label="Disabled" disabled placeholder="Disabled input" />
				</VBox>
			</Variant>

			<Variant name="NativeSelect">
				<VBox gap={2}>
					<NativeSelect aria-label="Option">
						<option value="">Select an option</option>
						<option value="1">Option 1</option>
						<option value="2">Option 2</option>
						<option value="3">Option 3</option>
					</NativeSelect>
					<NativeSelect aria-label="Disabled" disabled>
						<option>Disabled select</option>
					</NativeSelect>
				</VBox>
			</Variant>

			<Variant name="InputGroup">
				<InputGroup>
					<Input aria-label="Username" placeholder="Username" />
					<Button color="primary">Submit</Button>
				</InputGroup>
			</Variant>

			<Variant name="Fieldset">
				<Fieldset legend="User Information">
					<Field label="Full name">
						<Input />
					</Field>
					<Fieldset legend="Contact" variant="inset">
						<Field label="Email">
							<Input type="email" />
						</Field>
						<Field label="Phone">
							<Input type="tel" />
						</Field>
					</Fieldset>
				</Fieldset>
			</Variant>

			<Variant name="Toggle">
				<VBox gap={2}>
					<Toggle label="Default toggle" />
					<Toggle color="primary" label="Primary toggle" />
					<Toggle color="success" label="Success toggle" />
					<Toggle color="error" label="Error toggle" />
					<Toggle
						label="Email notifications"
						description="Send a digest when someone mentions you"
					/>
					<Toggle
						checked={toggleValue}
						onChange={(e) => setToggleValue(e.target.checked)}
						label={`Toggle is ${toggleValue ? 'ON' : 'OFF'}`}
					/>
				</VBox>
			</Variant>

			<Variant name="Checkbox">
				<VBox gap={2}>
					<Checkbox label="I agree to the terms" />
					<Checkbox
						label="Include archived items"
						description="Archived items are hidden by default"
						defaultChecked
					/>
					<Checkbox label="Disabled" disabled />
					<Checkbox aria-label="Select row" />
				</VBox>
			</Variant>

			<Variant name="Checkbox card">
				<VBox gap={2}>
					{['Photography', 'Open source'].map((name) => (
						<Checkbox
							key={name}
							variant="card"
							leading={<IcUsers />}
							label={name}
							description="Community · 120 members"
							checked={communities.includes(name)}
							onChange={(e) =>
								setCommunities(
									e.target.checked
										? [...communities, name]
										: communities.filter((c) => c !== name)
								)
							}
						/>
					))}
				</VBox>
			</Variant>

			<Variant name="RadioGroup">
				<Field label="Who can see this" hint="You can change it later">
					<RadioGroup
						value={visibility}
						onChange={setVisibility}
						options={[
							{ value: 'P', label: 'Public', description: 'Anyone on the internet' },
							{
								value: 'C',
								label: 'Connections',
								description: 'People you are connected to'
							},
							{ value: 'F', label: 'Followers', description: 'People who follow you' }
						]}
					/>
				</Field>
			</Variant>

			<Variant name="RadioGroup card">
				<RadioGroup
					aria-label="Plan"
					variant="card"
					orientation="horizontal"
					value={visibility}
					onChange={setVisibility}
					options={[
						{
							value: 'P',
							label: 'Public',
							description: 'Anyone',
							leading: <IcGlobe />
						},
						{
							value: 'C',
							label: 'Connections',
							description: 'Your network',
							leading: <IcUsers />
						},
						{
							value: 'F',
							label: 'Followers',
							description: 'Your audience',
							leading: <IcMail />,
							disabled: true
						}
					]}
				/>
			</Variant>

			<Variant name="Segmented">
				<VBox gap={3}>
					<Segmented aria-label="View" value={view} onChange={setView}>
						<SegmentedItem value="day">Day</SegmentedItem>
						<SegmentedItem value="week">Week</SegmentedItem>
						<SegmentedItem value="month">Month</SegmentedItem>
					</Segmented>
					<Segmented aria-label="View" size="sm" value={view} onChange={setView}>
						<SegmentedItem value="day">Day</SegmentedItem>
						<SegmentedItem value="week">Week</SegmentedItem>
						<SegmentedItem value="month">Month</SegmentedItem>
					</Segmented>
					<Segmented aria-label="View" fill value={view} onChange={setView}>
						<SegmentedItem value="day">Day</SegmentedItem>
						<SegmentedItem value="week">Week</SegmentedItem>
						<SegmentedItem value="month">Month</SegmentedItem>
					</Segmented>
				</VBox>
			</Variant>

			<Variant name="Segmented icon-only + multiple">
				<VBox gap={3}>
					<Segmented aria-label="Alignment" value={align} onChange={setAlign}>
						<SegmentedItem value="left" icon={IcAlignLeft} label="Align left" />
						<SegmentedItem value="center" icon={IcAlignCenter} label="Align center" />
						<SegmentedItem value="right" icon={IcAlignRight} label="Align right" />
					</Segmented>
					<Segmented aria-label="Text style" multiple value={marks} onChange={setMarks}>
						<SegmentedItem value="bold" icon={IcBold} label="Bold" />
						<SegmentedItem value="italic" icon={IcItalic} label="Italic" />
						<SegmentedItem value="underline" icon={IcUnderline} label="Underline" />
					</Segmented>
				</VBox>
			</Variant>

			<Variant name="Segmented grid">
				<Segmented
					aria-label="Icon"
					layout="grid"
					value={align}
					onChange={setAlign}
					style={{ maxWidth: '12rem' }}
				>
					{[
						IcStar,
						IcGlobe,
						IcMail,
						IcUsers,
						IcSearch,
						IcBold,
						IcItalic,
						IcUnderline
					].map((ic, i) => (
						<SegmentedItem
							key={i}
							value={String(i)}
							icon={ic}
							label={`Icon ${i + 1}`}
						/>
					))}
				</Segmented>
			</Variant>

			<Variant name="SearchInput">
				<VBox gap={2}>
					<SearchInput
						placeholder="Search files…"
						shortcut="/"
						debounce={300}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onSearch={setLastSearch}
					/>
					<span>Last search: {lastSearch || '—'}</span>
					<Field label="Filter members">
						<SearchInput size="sm" />
					</Field>
				</VBox>
			</Variant>

			<Variant name="Kbd">
				<span>
					Press <Kbd>Ctrl</Kbd> + <Kbd>K</Kbd> to open the command palette
				</span>
			</Variant>

			<Variant name="Slider">
				<VBox gap={2}>
					<Field label="Volume">
						<Slider
							min={0}
							max={100}
							value={volume}
							onChange={(e) => setVolume(Number(e.target.value))}
							format={(v) => `${v}%`}
						/>
					</Field>
					<Slider aria-label="Opacity" min={0} max={1} step={0.05} defaultValue={0.5} />
				</VBox>
			</Variant>

			<Variant name="DateTimePicker">
				<VBox gap={2}>
					<Field label="Starts">
						<DateTimePicker value={when} onChange={setWhen} />
					</Field>
					<Field label="Since (month mode)">
						<DateTimePicker mode="month" value={since} onChange={setSince} />
					</Field>
				</VBox>
			</Variant>

			<Variant name="PasswordInput">
				<PasswordDemo />
			</Variant>
		</Story>
	)
}

// vim: ts=4
