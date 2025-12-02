# Todollo Testing Guide

## Manual Testing Checklist

### Connection & Initialization

- [ ] App loads without errors
- [ ] "Connecting to Todollo..." message appears briefly
- [ ] Connection status indicator shows "Connected" (green)
- [ ] No errors in browser console
- [ ] App title "Todollo" displays correctly

### Task Creation

- [ ] Can type task title in input field
- [ ] Can select priority (Low/Medium/High/Critical)
- [ ] Pressing Enter creates task
- [ ] New task appears in list immediately
- [ ] Input field clears after task creation
- [ ] Task appears with correct priority indicator
- [ ] Multiple tasks can be created in sequence
- [ ] Long titles are displayed correctly

### Task Display

- [ ] Tasks display in correct order
- [ ] Priority dot shows correct color:
    - Low: Green
    - Medium: Yellow
    - High: Orange
    - Critical: Red with glow
- [ ] Task completion checkbox is clickable
- [ ] Delete button appears on hover
- [ ] Due date badge shows when set

### Task Completion

- [ ] Clicking checkbox toggles completed state
- [ ] Completed tasks show strikethrough
- [ ] Completed tasks appear lighter (opacity)
- [ ] Toggling back removes strikethrough
- [ ] Completion state syncs to other clients

### Task Deletion

- [ ] Delete button appears on task hover
- [ ] Clicking delete shows confirmation dialog
- [ ] Confirming delete removes task from list
- [ ] Canceling keeps task in list
- [ ] Deletion syncs to other clients immediately

### Filtering

- [ ] "All" button shows all tasks
- [ ] "Active" button shows only incomplete tasks
- [ ] "Completed" button shows only completed tasks
- [ ] Active filter button is highlighted
- [ ] Filter state persists while browsing
- [ ] Task count updates reflect filter

### Searching

- [ ] Can type in search input
- [ ] Tasks are filtered by title match
- [ ] Tasks are filtered by description match
- [ ] Search is case-insensitive
- [ ] Clearing search shows all tasks
- [ ] Search works with filter combined

### Sorting

- [ ] Dropdown has all sort options:
    - Order
    - Priority
    - Due Date
    - Newest First
    - Title (A-Z)
- [ ] Tasks reorder when sort changes
- [ ] Sort by priority shows Critical > High > Medium > Low
- [ ] Sort by due date shows earliest first
- [ ] Sort works with filter and search

### Task Statistics

- [ ] "Total tasks" count is accurate
- [ ] "Active tasks" count excludes completed
- [ ] "Done tasks" count shows completed only
- [ ] Stats update when tasks change

### Connection Status

- [ ] Status indicator is visible
- [ ] Shows "Connected" when online
- [ ] Shows "Disconnected" when offline
- [ ] Status updates when connection changes
- [ ] Indicator pulses smoothly

### Error Handling

- [ ] Network error shows alert message
- [ ] Error message is readable and helpful
- [ ] App remains functional during errors
- [ ] Retry works after connection restored
- [ ] No unhandled console errors

### Bulk Operations (Future)

- [ ] Complete all button completes all active tasks
- [ ] Delete completed button removes all completed tasks
- [ ] Confirmation shown before bulk delete
- [ ] Stats update after bulk operations

### Real-time Collaboration

- [ ] Open app in two browser windows
- [ ] Create task in window 1
- [ ] Task appears immediately in window 2
- [ ] Update task in window 2
- [ ] Update appears immediately in window 1
- [ ] Delete task in window 1
- [ ] Deletion syncs to window 2
- [ ] No duplicate tasks created

### Keyboard Shortcuts

- [ ] Enter key in input creates task
- [ ] Tab navigation works through elements
- [ ] Escape can cancel input (when implemented)

### Responsive Design

- [ ] Works on desktop (1920px+)
- [ ] Works on laptop (1366px)
- [ ] Works on tablet (768px)
- [ ] Works on mobile (375px)
- [ ] Touch interactions work on mobile
- [ ] Text is readable at all sizes
- [ ] Buttons are clickable on mobile

### Performance

- [ ] Initial load < 2 seconds
- [ ] Task creation response < 100ms
- [ ] Search/filter instant
- [ ] Smooth scrolling on long task lists
- [ ] No lag with 100+ tasks
- [ ] No memory leaks (check DevTools)

### Accessibility

- [ ] Can navigate with keyboard only
- [ ] Tab order makes sense
- [ ] Labels associated with inputs
- [ ] Color not only indicator (text+color for priority)
- [ ] Focus indicators visible

### Browser Compatibility

- [ ] Works in Chrome/Chromium
- [ ] Works in Firefox
- [ ] Works in Safari
- [ ] Works in Edge
- [ ] Local storage works
- [ ] WebSocket works

### Offline Behavior (Future Phase)

- [ ] Tasks load from cache
- [ ] Can add tasks offline (queued)
- [ ] Can complete tasks offline
- [ ] Changes sync when online
- [ ] No data loss on reconnect

## Edge Cases to Test

1. **Empty State**
    - [ ] Empty message shows when no tasks
    - [ ] Empty message updates on first task add

2. **Very Long Titles**
    - [ ] Long titles wrap or truncate nicely
    - [ ] Don't break layout

3. **Special Characters**
    - [ ] Emoji in titles display correctly
    - [ ] Unicode characters handled
    - [ ] HTML entities not escaped incorrectly

4. **Date Edge Cases**
    - [ ] Past due dates show correctly
    - [ ] Today's date is highlighted
    - [ ] Future dates display properly

5. **Rapid Actions**
    - [ ] Creating tasks rapidly works
    - [ ] Quick deletes don't cause issues
    - [ ] Rapid toggling works smoothly

6. **Large Data Sets**
    - [ ] 100+ tasks load smoothly
    - [ ] Search works with large datasets
    - [ ] Sorting performs well
    - [ ] No UI freezing

7. **Network Issues**
    - [ ] Graceful handling of slow network
    - [ ] Reconnection works
    - [ ] No duplicate tasks on retry

## Performance Benchmarks

| Operation      | Target  | Acceptable |
| -------------- | ------- | ---------- |
| Initial Load   | < 1s    | < 2s       |
| Task Create    | < 50ms  | < 100ms    |
| Task Update    | < 50ms  | < 100ms    |
| Task Delete    | < 50ms  | < 100ms    |
| Search/Filter  | < 100ms | < 200ms    |
| Sort           | < 100ms | < 200ms    |
| Real-time Sync | < 100ms | < 200ms    |

## Regression Testing

After each update, verify:

1. App still builds without errors
2. All core features work
3. No new console errors
4. No memory leaks
5. Real-time sync still works
6. Performance hasn't degraded

## Automated Testing (Future)

When unit tests are added:

```bash
pnpm test
pnpm test:watch
pnpm test:coverage
```

Test categories to add:

- [ ] Hook behavior (useTodollo, useTasks)
- [ ] Component rendering
- [ ] Task filtering logic
- [ ] Task sorting logic
- [ ] Date utilities
- [ ] Error handling
- [ ] Real-time updates

## Test Scenarios

### Scenario 1: Basic Workflow

1. Create "Buy groceries" (Medium priority)
2. Create "Write report" (High priority)
3. Create "Exercise" (Low priority)
4. Sort by priority
5. Mark "Exercise" complete
6. Filter to "Active"
7. Search for "buy"
8. Should see only "Buy groceries"

### Scenario 2: Multi-Client Sync

1. Open app in window A and B
2. In A: Create "Task from A"
3. Should appear in B within 100ms
4. In B: Complete the task
5. Should be marked done in A within 100ms
6. In A: Delete the task
7. Should disappear from B within 100ms

### Scenario 3: Filter & Sort

1. Create 5 tasks with mixed priorities
2. Create 3 of them as completed
3. Filter to "Active" - should show 2
4. Sort by "Priority"
5. Should order by Critical > High > Medium > Low
6. Filter to "Completed"
7. Should show the 3 completed tasks

### Scenario 4: Search

1. Create tasks: "Buy milk", "Buy bread", "Write email"
2. Search "buy"
3. Should show "Buy milk" and "Buy bread"
4. Clear search
5. Should show all 3 tasks
6. Search "email"
7. Should show only "Write email"

## Known Issues & Limitations

- [ ] None currently documented

## Issue Reporting

When filing a bug, include:

- Browser and version
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots/video if applicable
- Browser console errors

---

**Last Updated**: October 25, 2024
**Status**: Ready for Manual Testing
