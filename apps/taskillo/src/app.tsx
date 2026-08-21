// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	AppDocBar,
	EmptyState,
	LoadingSpinner,
	Panel,
	PresenceProvider,
	Toasts,
	usePresence,
	useRtdbDocument
} from '@cloudillo/react'
import { buildPresenceUser, type RtdbClient } from '@cloudillo/rtdb'
import * as React from 'react'
import { PiTrashBold as IcDelete, PiPlusBold as IcPlus } from 'react-icons/pi'

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
import '@cloudillo/react/components.css'
import './style.css'

import type { Task, TaskFilter } from './types.js'

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Hook: useTaskillo
 *
 * Handles Cloudillo app initialization and RTDB client setup.
 * This demonstrates the complete initialization flow:
 * 1. Parse document ID from URL hash
 * 2. Initialize cloudillo SDK (get auth token from parent shell)
 * 3. Create RTDB client with WebSocket connection
 * 4. Connect to the real-time database
 * 5. Join the presence roster so collaborators can see each other
 */
function useTaskillo() {
	return useRtdbDocument('taskillo', {
		presence: true,
		onInit: (bus, _state, feed) =>
			// A corrective `auth:init.push` can land after `bus.init()` resolves on a
			// share-link mount, which would leave a stale name in every peer's roster.
			bus.onIdentityChange(() => feed?.setUser(buildPresenceUser(bus)))
	})
}

/**
 * Hook: useTasks
 *
 * Manages task CRUD operations and filtering.
 * This demonstrates the core pattern for using Cloudillo's real-time database:
 * 1. Subscribe to a collection with onSnapshot()
 * 2. Receive automatic updates when data changes
 * 3. Perform CRUD operations using the RTDB client
 */
function useTasks(client: RtdbClient | undefined, fileId: string, _idTag: string | undefined) {
	const [tasks, setTasks] = React.useState<Task[]>([])
	const [loading, setLoading] = React.useState(true)
	const [error, setError] = React.useState<Error | undefined>()
	const [filter, setFilter] = React.useState<TaskFilter>('all')

	// Subscribe to task updates from the real-time database
	// This is the key to collaborative editing - all clients get notified of changes!
	React.useEffect(() => {
		if (!client || !fileId) {
			setLoading(false)
			return
		}

		setLoading(true)
		setError(undefined)

		const collectionRef = client.collection<Task>('tasks')

		// onSnapshot creates a real-time subscription
		// The callback fires whenever ANY client creates, updates, or deletes a task
		const unsubscribe = collectionRef.onSnapshot(
			(snapshot) => {
				const taskList = snapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data()
				})) as Task[]
				setTasks(taskList)
				setLoading(false)
			},
			(err) => {
				console.error('[useTasks] Subscription error:', err)
				setError(err as Error)
				setLoading(false)
			}
		)

		// Cleanup: unsubscribe when component unmounts
		return () => {
			unsubscribe()
		}
	}, [client, fileId])

	// Create a new task
	const createTask = React.useCallback(
		async (text: string) => {
			if (!client || !fileId) return

			await client.collection('tasks').create({
				text,
				completed: false,
				createdAt: new Date().toISOString()
			})
		},
		[client, fileId]
	)

	// Update task properties
	const updateTask = React.useCallback(
		async (id: string, updates: Partial<Task>) => {
			if (!client || !fileId) return

			await client.ref(`tasks/${id}`).update(updates)
		},
		[client, fileId]
	)

	// Delete a task
	const deleteTask = React.useCallback(
		async (id: string) => {
			if (!client || !fileId) return

			await client.ref(`tasks/${id}`).delete()
		},
		[client, fileId]
	)

	// Toggle task completion status
	const toggleTask = React.useCallback(
		async (id: string) => {
			const task = tasks.find((t) => t.id === id)
			if (!task) return

			await updateTask(id, { completed: !task.completed })
		},
		[tasks, updateTask]
	)

	// Apply filter to tasks
	const filteredTasks = React.useMemo(() => {
		switch (filter) {
			case 'active':
				return tasks.filter((t) => !t.completed)
			case 'completed':
				return tasks.filter((t) => t.completed)
			default:
				return tasks
		}
	}, [tasks, filter])

	// Calculate simple statistics
	const stats = React.useMemo(
		() => ({
			totalCount: tasks.length,
			activeCount: tasks.filter((t) => !t.completed).length,
			completedCount: tasks.filter((t) => t.completed).length
		}),
		[tasks]
	)

	return {
		tasks: filteredTasks,
		loading,
		error,
		createTask,
		updateTask,
		deleteTask,
		toggleTask,
		filter,
		setFilter,
		...stats
	}
}

// =============================================================================
// COMPONENTS
// =============================================================================

/**
 * Component: Header
 *
 * Displays app title, task statistics, and connection status
 */
function Header({
	connected,
	totalCount,
	activeCount,
	completedCount
}: {
	connected: boolean
	totalCount: number
	activeCount: number
	completedCount: number
}) {
	return (
		<Panel className="taskillo-header">
			{/* No title here — the DocBar names the document. */}
			<div className="header-stats">
				<span title="Total tasks">{totalCount} total</span>
				<span title="Active tasks">{activeCount} active</span>
				<span title="Completed tasks">{completedCount} done</span>
			</div>

			<div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
				<div className="status-indicator" />
				<span>{connected ? 'Connected' : 'Disconnected'}</span>
			</div>
		</Panel>
	)
}

/**
 * Component: FilterBar
 *
 * Simple filter buttons for All/Active/Completed views.
 * In a real-time collaborative app, filtering happens locally for each user.
 */
function FilterBar({
	filter,
	onFilterChange
}: {
	filter: TaskFilter
	onFilterChange: (filter: TaskFilter) => void
}) {
	return (
		<Panel className="filter-bar flex-row g-1 flex-wrap">
			<button
				className={`filter-button ${filter === 'all' ? 'active' : ''}`}
				onClick={() => onFilterChange('all')}
			>
				All
			</button>
			<button
				className={`filter-button ${filter === 'active' ? 'active' : ''}`}
				onClick={() => onFilterChange('active')}
			>
				Active
			</button>
			<button
				className={`filter-button ${filter === 'completed' ? 'active' : ''}`}
				onClick={() => onFilterChange('completed')}
			>
				Completed
			</button>
		</Panel>
	)
}

/**
 * Component: TaskInput
 *
 * Input form for creating new tasks.
 *
 * It also reports whether this user is mid-sentence, which the app publishes as
 * presence state. Note that nothing about "composing" exists in the protocol: it
 * is an ordinary field of the free-form state, filtered client-side — which is how
 * per-item presence is built without any server support.
 */
function TaskInput({
	onCreateTask,
	onComposingChange,
	disabled
}: {
	onCreateTask: (text: string) => Promise<void>
	onComposingChange?: (composing: boolean) => void
	disabled?: boolean
}) {
	const [text, setText] = React.useState('')
	const [loading, setLoading] = React.useState(false)
	const [focused, setFocused] = React.useState(false)

	// Focused AND non-empty: a parked caret in an empty box is not composing.
	// Submitting clears `text`, so the flag drops without a separate handler.
	const composing = focused && !!text.trim()
	React.useEffect(() => {
		onComposingChange?.(composing)
	}, [composing, onComposingChange])

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!text.trim() || disabled || loading) return

		try {
			setLoading(true)
			await onCreateTask(text)
			setText('')
		} catch (err) {
			console.error('Failed to create task:', err)
		} finally {
			setLoading(false)
		}
	}

	const handleKeyPress = async (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			await handleSubmit(e as unknown as React.FormEvent)
		}
	}

	return (
		<Panel className="task-input-panel">
			<form onSubmit={handleSubmit} className="task-input-container">
				<input
					type="text"
					className="task-input"
					placeholder={
						disabled && !loading
							? 'View-only mode'
							: 'Add a new task... (press Enter to add)'
					}
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={handleKeyPress}
					onFocus={() => setFocused(true)}
					onBlur={() => setFocused(false)}
					disabled={disabled || loading}
				/>

				<button
					type="submit"
					disabled={!text.trim() || disabled || loading}
					className="c-button primary"
					style={{ padding: '0.5rem 1rem' }}
				>
					<IcPlus /> {loading ? 'Adding...' : 'Add'}
				</button>
			</form>
		</Panel>
	)
}

/**
 * Component: ComposingHint
 *
 * "Someone else is typing", read straight off the presence roster.
 *
 * Reads `entries` — one per connection — rather than the deduplicated `users` the
 * avatar stack shows, because it is a connection that is composing, not a person:
 * the same user in two tabs is typing in only one of them.
 */
function ComposingHint() {
	const { entries } = usePresence()
	const others = entries.filter((entry) => !entry.self && entry.state?.composing)
	if (!others.length) return null

	return (
		<div className="text-muted text-sm px-2">
			{others.length === 1
				? `${others[0].name} is adding a task…`
				: `${others.length} others are adding tasks…`}
		</div>
	)
}

/**
 * Component: TaskItem
 *
 * Individual task with checkbox and delete button
 */
function TaskItem({
	task,
	onToggle,
	onDelete,
	readOnly
}: {
	task: Task
	onToggle: (id: string) => Promise<void>
	onDelete: (id: string) => Promise<void>
	readOnly?: boolean
}) {
	const [loading, setLoading] = React.useState(false)
	const [deleting, setDeleting] = React.useState(false)
	const [confirming, setConfirming] = React.useState(false)

	const handleToggle = async () => {
		try {
			setLoading(true)
			await onToggle(task.id)
		} catch (err) {
			console.error('Failed to toggle task:', err)
		} finally {
			setLoading(false)
		}
	}

	const handleDelete = async () => {
		if (!confirming) {
			setConfirming(true)
			setTimeout(() => setConfirming(false), 3000)
			return
		}

		try {
			setDeleting(true)
			await onDelete(task.id)
		} catch (err) {
			console.error('Failed to delete task:', err)
		} finally {
			setDeleting(false)
			setConfirming(false)
		}
	}

	return (
		<div className={`task-item ${task.completed ? 'completed' : ''}`}>
			<input
				type="checkbox"
				className="task-checkbox"
				checked={task.completed}
				onChange={handleToggle}
				disabled={loading || readOnly}
				aria-label={`Mark "${task.text}" as ${task.completed ? 'incomplete' : 'complete'}`}
			/>

			<span className="task-title">{task.text}</span>

			{!readOnly && (
				<div className="task-actions" style={confirming ? { opacity: 1 } : undefined}>
					{confirming ? (
						<button
							onClick={handleDelete}
							disabled={deleting}
							className="c-button error small"
							aria-label={`Confirm delete "${task.text}"`}
						>
							<IcDelete /> Delete?
						</button>
					) : (
						<button
							onClick={handleDelete}
							disabled={deleting}
							className="c-button icon small"
							title="Delete task"
							aria-label={`Delete "${task.text}"`}
						>
							<IcDelete />
						</button>
					)}
				</div>
			)}
		</div>
	)
}

/**
 * Component: TaskList
 *
 * Renders the list of tasks or an empty state
 */
function TaskList({
	tasks,
	loading,
	onToggleTask,
	onDeleteTask,
	readOnly
}: {
	tasks: Task[]
	loading: boolean
	onToggleTask: (id: string) => Promise<void>
	onUpdateTask: (id: string, updates: Partial<Task>) => Promise<void>
	onDeleteTask: (id: string) => Promise<void>
	readOnly?: boolean
}) {
	if (loading && tasks.length === 0) {
		return <LoadingSpinner label="Loading tasks…" />
	}

	if (tasks.length === 0) {
		return (
			<EmptyState
				icon={<span style={{ fontSize: '2.5rem' }}>📭</span>}
				title="No tasks here!"
				description="Add a task above to get started."
			/>
		)
	}

	return (
		<div>
			{tasks.map((task) => (
				<TaskItem
					key={task.id}
					task={task}
					onToggle={onToggleTask}
					onDelete={onDeleteTask}
					readOnly={readOnly}
				/>
			))}
		</div>
	)
}

// =============================================================================
// MAIN APP
// =============================================================================

/**
 * Taskillo Main App Component
 *
 * This is a simple tutorial demonstrating Cloudillo's real-time database (RTDB).
 * It shows the essential patterns for building collaborative applications:
 *
 * 1. Initialize connection (useTaskillo hook)
 * 2. Subscribe to data changes (useTasks hook)
 * 3. Perform CRUD operations (create, update, delete)
 * 4. Display real-time updates from other users
 * 5. Show who else is here, and what they are doing (presence)
 *
 * The entire app is in this single file for easy learning!
 */
export function TaskilloApp() {
	// Initialize Cloudillo connection and RTDB client
	const taskillo = useTaskillo()
	const isReadOnly = taskillo.access !== 'write'

	// Subscribe to tasks and get CRUD operations
	const tasks = useTasks(taskillo.client, taskillo.fileId, taskillo.idTag)

	// A replace, not a merge: `setState({})` is how a field is cleared. `user` is
	// added on publish and cannot be set from here.
	const presence = taskillo.presence
	const handleComposingChange = React.useCallback(
		(composing: boolean) => presence?.setState(composing ? { composing: true } : {}),
		[presence]
	)

	// Loading state - shown while connecting to RTDB
	if (taskillo.loading) {
		return (
			<div className="c-vbox w-100 h-100 justify-center align-center">
				<Panel className="c-vbox align-center p-2">
					<LoadingSpinner size="lg" label="Connecting to Taskillo…" />
				</Panel>
			</div>
		)
	}

	// Error state - shown if connection fails
	if (taskillo.error) {
		return (
			<div className="c-vbox w-100 h-100 justify-center align-center">
				<Panel className="c-alert error">
					<h3>Connection Error</h3>
					<p>{taskillo.error.message}</p>
				</Panel>
			</div>
		)
	}

	// Main UI - header, filter, input, and task list
	// The provider computes the roster once for the whole app: `<AppDocBar />` picks
	// the avatar stack off the context with no prop of its own, and `ComposingHint`
	// reads the same entries instead of subscribing a second time.
	return (
		<PresenceProvider source={presence}>
			<div className="taskillo-app c-vbox w-100 h-100">
				<AppDocBar />

				<Header
					connected={taskillo.connected}
					totalCount={tasks.totalCount}
					activeCount={tasks.activeCount}
					completedCount={tasks.completedCount}
				/>

				<FilterBar filter={tasks.filter} onFilterChange={tasks.setFilter} />

				<TaskInput
					onCreateTask={tasks.createTask}
					onComposingChange={handleComposingChange}
					disabled={!taskillo.connected || isReadOnly}
				/>

				<ComposingHint />

				<Panel className="task-list-container">
					<TaskList
						tasks={tasks.tasks}
						loading={tasks.loading}
						onToggleTask={tasks.toggleTask}
						onUpdateTask={tasks.updateTask}
						onDeleteTask={tasks.deleteTask}
						readOnly={isReadOnly}
					/>
				</Panel>
				<Toasts />
			</div>
		</PresenceProvider>
	)
}

// vim: ts=4
