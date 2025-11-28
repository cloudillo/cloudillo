import * as React from 'react'
import { Story, Variant } from './storybook.js'
import {
	useToast,
	ToastContainer,
	Toast,
	ToastIcon,
	ToastContent,
	ToastTitle,
	ToastMessage,
	ToastActions,
	ToastClose,
	ToastProgress,
	Button,
	HBox,
	VBox
} from '@cloudillo/react'
import {
	LuCircleCheck as IcSuccess,
	LuCircleX as IcError,
	LuTriangleAlert as IcWarning,
	LuInfo as IcInfo
} from 'react-icons/lu'

function ToastDemo() {
	const toast = useToast()

	return (
		<VBox gap={2}>
			<HBox gap={2} className="flex-wrap">
				<Button variant="success" onClick={() => toast.success('Operation completed successfully!')}>
					Success Toast
				</Button>
				<Button variant="error" onClick={() => toast.error('An error occurred!')}>
					Error Toast
				</Button>
				<Button variant="warning" onClick={() => toast.warning('Please review your input.')}>
					Warning Toast
				</Button>
				<Button onClick={() => toast.info('Here is some information.')}>
					Info Toast
				</Button>
			</HBox>
			<HBox gap={2}>
				<Button
					onClick={() => toast.toast({
						title: 'Custom Toast',
						message: 'This toast has a custom duration of 10 seconds.',
						duration: 10000,
						variant: 'info'
					})}
				>
					Long Duration (10s)
				</Button>
				<Button onClick={() => toast.dismissAll()}>
					Dismiss All
				</Button>
			</HBox>
			<ToastContainer position="top-right">
				{toast.toasts.map(t => (
					<Toast
						key={t.id}
						toast={t}
						variant={t.variant}
						onDismiss={() => toast.dismiss(t.id)}
						withProgress
					>
						<ToastIcon>
							{t.variant === 'success' && <IcSuccess/>}
							{t.variant === 'error' && <IcError/>}
							{t.variant === 'warning' && <IcWarning/>}
							{t.variant === 'info' && <IcInfo/>}
						</ToastIcon>
						<ToastContent>
							{t.title && <ToastTitle>{t.title}</ToastTitle>}
							<ToastMessage>{t.message}</ToastMessage>
						</ToastContent>
						<ToastClose/>
						<ToastProgress duration={t.duration}/>
					</Toast>
				))}
			</ToastContainer>
		</VBox>
	)
}

export function ToastStory() {
	return <Story
		name="Toast"
		description="Toast notification system with position variants, auto-dismiss, and progress indicator."
		props={[
			{ name: 'position', type: '"top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right"', descr: 'ToastContainer: position on screen' },
			{ name: 'variant', type: '"success" | "error" | "warning" | "info"', descr: 'Toast: color variant' },
			{ name: 'duration', type: 'number', descr: 'Toast: auto-dismiss duration in ms' },
			{ name: 'onDismiss', type: '() => void', descr: 'Toast: dismiss callback' },
			{ name: 'withProgress', type: 'boolean', descr: 'Toast: show progress bar' }
		]}
	>
		<Variant name="Interactive Toast Demo">
			<ToastDemo/>
		</Variant>

		<Variant name="useToast Hook">
			<div className="c-panel p-3">
				<pre>{`const toast = useToast()

// Quick methods:
toast.success('Success message')
toast.error('Error message')
toast.warning('Warning message')
toast.info('Info message')

// Full options:
toast.toast({
  variant: 'success',
  title: 'Title',
  message: 'Message',
  duration: 5000,
  dismissible: true
})

// Management:
toast.dismiss(id)
toast.dismissAll()
toast.toasts // Array of current toasts`}</pre>
			</div>
		</Variant>

		<Variant name="Toast Components">
			<div className="c-panel p-3">
				<ul>
					<li><code>ToastContainer</code> - Positioned container for toasts</li>
					<li><code>Toast</code> - Individual toast wrapper</li>
					<li><code>ToastIcon</code> - Icon area</li>
					<li><code>ToastContent</code> - Content wrapper</li>
					<li><code>ToastTitle</code> - Toast title</li>
					<li><code>ToastMessage</code> - Toast message</li>
					<li><code>ToastActions</code> - Action buttons area</li>
					<li><code>ToastClose</code> - Close button</li>
					<li><code>ToastProgress</code> - Auto-dismiss progress bar</li>
				</ul>
			</div>
		</Variant>

		<Variant name="Position Options">
			<div className="c-panel p-3">
				<p>Available positions for ToastContainer:</p>
				<ul>
					<li>top-left, top-center, top-right</li>
					<li>middle-left, middle-center, middle-right</li>
					<li>bottom-left, bottom-center, bottom-right</li>
				</ul>
			</div>
		</Variant>
	</Story>
}

// vim: ts=4
