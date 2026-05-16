# @cloudillo/rtdb

Real-time, queryable database client for [Cloudillo](https://cloudillo.org) — Firestore-style API with subscriptions, write batches, aggregations, and document locking.

## Install

    npm install @cloudillo/rtdb

## Usage

```ts
import { RtdbClient } from '@cloudillo/rtdb'

const client = new RtdbClient({
    dbId: 'my-database',
    auth: { getToken: () => accessToken },
    serverUrl: 'wss://example.cloudillo.org/ws/rtdb',
})
await client.connect()

const unsubscribe = client.collection('items')
    .where('status', '==', 'active')
    .onSnapshot((snapshot) => {
        // snapshot.docs is the live result set
    })
```

## Links

- Website: https://cloudillo.org
- Source: https://github.com/cloudillo/cloudillo/tree/main/libs/rtdb
- Issues: https://github.com/cloudillo/cloudillo/issues

## License

LGPL-3.0-or-later
