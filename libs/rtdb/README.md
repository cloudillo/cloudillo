# @cloudillo/rtdb

A Firebase-like real-time database client library for Cloudillo. Provides TypeScript-first API for real-time data synchronization, transactions, and subscriptions over WebSocket.

## Features

- **Firebase-like API** - Familiar patterns for developers coming from Firebase
- **Real-time Subscriptions** - Live updates via WebSocket using `onSnapshot()`
- **TypeScript-first** - Full type safety with runtime validation
- **Transaction Support** - Atomic batch operations with reference substitution
- **Automatic Reconnection** - Exponential backoff on connection failures
- **Error Handling** - Custom error classes for different failure scenarios
- **Computed Values** - Support for field operations ($op), queries ($query), and functions ($fn)

## Installation

```bash
pnpm add @cloudillo/rtdb @cloudillo/core
```

## Quick Start

```typescript
import { createRtdbClient } from '@cloudillo/rtdb'
import { accessToken } from '@cloudillo/core'

// Create client
const db = createRtdbClient({
	dbId: 'my-database',
	auth: {
		getToken: () => accessToken
	},
	serverUrl: 'wss://cl-o.alice.example.com',
	options: {
		debug: true
	}
})

// Connect
await db.connect()

// Create document
const ref = await db.collection('posts').create({
	title: 'Hello World',
	author: 'alice',
	published: true
})

console.log('Created post:', ref.id)

// Read document
const doc = await ref.get()
if (doc.exists) {
	console.log('Post:', doc.data())
}

// Subscribe to changes
const unsubscribe = ref.onSnapshot((doc) => {
	console.log('Post updated:', doc.data())
})

// Update document
await ref.update({
	title: 'Updated Title',
	views: { $op: 'increment', by: 1 }
})

// Delete document
await ref.delete()

// Cleanup
unsubscribe()
await db.disconnect()
```

## API Reference

### Client

#### `createRtdbClient(options)`

Creates a new RTDB client instance.

**Parameters:**

- `dbId` (string) - Database identifier
- `auth.getToken()` (function) - Returns auth token
- `serverUrl` (string) - WebSocket server URL (wss://...)
- `options` (object):
    - `enableCache` (boolean) - Enable IndexedDB caching (default: false)
    - `reconnect` (boolean) - Auto-reconnect on disconnect (default: true)
    - `reconnectDelay` (number) - Initial reconnect delay in ms (default: 1000)
    - `maxReconnectDelay` (number) - Max reconnect delay in ms (default: 30000)
    - `debug` (boolean) - Enable debug logging (default: false)

**Returns:** `RtdbClient` instance

#### `client.connect()`

Connects to the server. Called automatically on first operation.

```typescript
await db.connect()
```

#### `client.disconnect()`

Disconnects from server and cleans up resources.

```typescript
await db.disconnect()
```

#### `client.collection(path)`

Gets a reference to a collection.

```typescript
const posts = db.collection('posts')
const comments = db.collection('posts/abc123/comments')
```

#### `client.ref(path)`

Gets a reference to a document.

```typescript
const post = db.ref('posts/abc123')
```

#### `client.batch()`

Creates a write batch for atomic operations.

```typescript
const batch = db.batch()
batch.create(db.collection('posts'), { title: 'New Post' })
batch.update(db.ref('users/alice'), { postCount: { $op: 'increment', by: 1 } })
await batch.commit()
```

### Collection Reference

#### `collection.doc(id)`

Gets a reference to a document in the collection.

```typescript
const post = db.collection('posts').doc('abc123')
```

#### `collection.create(data)`

Creates a new document with auto-generated ID.

```typescript
const ref = await db.collection('posts').create({
	title: 'Hello',
	author: 'alice'
})
console.log('Created with ID:', ref.id)
```

#### `collection.get()`

Fetches all documents in collection.

```typescript
const snapshot = await db.collection('posts').get()
snapshot.forEach((doc) => {
	console.log(doc.id, doc.data())
})
```

#### `collection.onSnapshot(callback, onError?)`

Subscribes to collection changes.

```typescript
const unsubscribe = db.collection('posts').onSnapshot(
	(snapshot) => {
		snapshot.docChanges().forEach((change) => {
			console.log(change.type, change.doc.data())
		})
	},
	(error) => {
		console.error('Subscription error:', error)
	}
)

// Later: unsubscribe()
```

#### `collection.where(field, op, value)`

Filters collection by field value.

```typescript
const published = db.collection('posts').where('published', '==', true).get()
```

#### `collection.orderBy(field, direction?)`

Sorts results by field.

```typescript
const recent = db.collection('posts').orderBy('createdAt', 'desc').limit(10).get()
```

#### `collection.limit(n)`

Limits number of results.

```typescript
const topPosts = db.collection('posts').limit(10).get()
```

### Document Reference

#### `doc.get()`

Fetches the document.

```typescript
const snapshot = await db.ref('posts/abc123').get()
if (snapshot.exists) {
	console.log(snapshot.data())
}
```

#### `doc.set(data)`

Sets/replaces the entire document.

```typescript
await db.ref('posts/abc123').set({
	title: 'New Title',
	author: 'bob'
})
```

#### `doc.update(data)`

Updates specific fields (partial update).

```typescript
await db.ref('posts/abc123').update({
	title: 'Updated Title',
	views: { $op: 'increment', by: 1 }
})
```

#### `doc.delete()`

Deletes the document.

```typescript
await db.ref('posts/abc123').delete()
```

#### `doc.onSnapshot(callback, onError?)`

Subscribes to document changes.

```typescript
const unsubscribe = db.ref('posts/abc123').onSnapshot(
	(doc) => {
		if (doc.exists) {
			console.log('Updated:', doc.data())
		} else {
			console.log('Deleted')
		}
	},
	(error) => console.error(error)
)
```

#### `doc.collection(name)`

Creates a sub-collection reference.

```typescript
const comments = db.ref('posts/abc123').collection('comments')
```

### Query

#### `query.where(field, op, value)`

Adds a filter condition.

```typescript
query.where('author', '==', 'alice').where('published', '==', true)
```

#### `query.orderBy(field, direction?)`

Adds sort order.

```typescript
query.orderBy('createdAt', 'desc')
```

#### `query.limit(n)`

Limits results to n documents.

```typescript
query.limit(10)
```

#### `query.offset(n)`

Skips first n documents.

```typescript
query.limit(10).offset(20) // Pagination
```

#### `query.get()`

Executes the query.

```typescript
const snapshot = await query.get()
```

#### `query.onSnapshot(callback, onError?)`

Subscribes to query results.

```typescript
const unsubscribe = query.onSnapshot((snapshot) => {
	console.log('Results count:', snapshot.size)
})
```

### Snapshots

#### `DocumentSnapshot`

Result of reading a single document.

```typescript
const doc = await ref.get()
doc.exists // boolean
doc.id // string
doc.data() // T | undefined
doc.get('field') // any
```

#### `QuerySnapshot`

Result of querying a collection.

```typescript
const snapshot = await query.get()
snapshot.docs // DocumentSnapshot[]
snapshot.size // number
snapshot.empty // boolean
snapshot.forEach(fn) // iterate documents
snapshot.docChanges() // DocumentChange[] (in subscriptions)
```

## Computed Values

Update operations support computed values using special operators:

### Field Operations ($op)

```typescript
// Increment number
await doc.update({
	views: { $op: 'increment', by: 1 }
})

// Append to array
await doc.update({
	tags: { $op: 'append', values: ['featured'] }
})

// Set if not exists
await doc.update({
	createdAt: { $op: 'setIfNotExists', value: Date.now() }
})
```

Supported operations: `increment`, `decrement`, `multiply`, `append`, `remove`, `setIfNotExists`, `concat`, `min`, `max`

### Functions ($fn)

```typescript
// Current timestamp
await doc.update({
	updatedAt: { $fn: 'now' }
})

// Generate UUID
await doc.update({
	sessionId: { $fn: 'uuid' }
})

// Slugify
await doc.update({
	slug: { $fn: 'slugify', args: [{ $field: 'title' }] }
})
```

Supported functions: `now`, `uuid`, `slugify`, `hash`, `lowercase`, `uppercase`, `trim`, `parseJson`, `stringifyJson`, `coalesce`, `length`, `substring`, `replace`

### Queries ($query)

```typescript
// Count documents
await doc.update({
	commentCount: { $query: 'count', path: 'posts/abc123/comments' }
})

// Sum field
await doc.update({
	total: { $query: 'sum', path: 'orders/123/items', field: 'price' }
})

// Get max value
await doc.update({
	maxRating: { $query: 'max', path: 'products/xyz/reviews', field: 'rating' }
})
```

Supported queries: `count`, `sum`, `avg`, `min`, `max`, `first`, `last`, `exists`

## Batch Transactions

Execute multiple operations atomically:

```typescript
const batch = db.batch()

// Create post
const postRef = batch.create(
	db.collection('posts'),
	{ title: 'Hello', author: 'alice' },
	{ ref: '$post' } // Assign reference
)

// Create comment referencing the post
batch.create(db.collection('posts/${$post}/comments'), { text: 'First!', author: 'bob' })

// Update user
batch.update(db.ref('users/alice'), { postCount: { $op: 'increment', by: 1 } })

// Commit all atomically
const results = await batch.commit()
console.log('Created post ID:', results[0].id)
```

## Error Handling

```typescript
import {
	RtdbError,
	ConnectionError,
	AuthError,
	PermissionError,
	NotFoundError,
	ValidationError,
	TimeoutError
} from '@cloudillo/rtdb'

try {
	const doc = await db.ref('posts/123').get()
} catch (error) {
	if (error instanceof NotFoundError) {
		console.log('Document not found')
	} else if (error instanceof PermissionError) {
		console.log('Permission denied')
	} else if (error instanceof ConnectionError) {
		console.log('Connection failed, will retry...')
	} else if (error instanceof AuthError) {
		console.log('Authentication failed')
	} else {
		console.error('Unexpected error:', error)
	}
}
```

## Diagnostics

Check client status:

```typescript
console.log('Connected:', db.isConnected())
console.log('Pending requests:', db.getPendingRequests())
console.log('Active subscriptions:', db.getActiveSubscriptions())
```

## Browser Compatibility

- Chrome/Edge 90+
- Firefox 88+
- Safari 15+
- Node.js 18+

## License

LGPL-3.0-or-later

## See Also

- [@cloudillo/core](../core/) - Client initialization and authentication
- [@cloudillo/types](../types/) - Shared type definitions
- [RTDB Architecture](../../claude-docs/rtdb-client-library-plan.md)
