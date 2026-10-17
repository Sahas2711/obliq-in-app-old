# Dashboard LLD

## File responsibilities

```text
src/
  app/
    layout.tsx              Persistent dashboard instance and page metadata
    page.tsx                Home route
    [section]/page.tsx      Section validation and 404 handling
    api/                    Route handlers: health, workspace, records, time
    globals.css             Stylesheet imports
  components/
    dashboard-app.tsx       Navigation, search, dialogs, and screen selection
    dashboard/
      home.tsx              Home composition
      home-widgets.tsx      Metrics, activity, and quick actions
      sidebar.tsx           Navigation links and mobile menu
      search.tsx            Search results
      earnings-chart.tsx    Chart and CSV download
      project-table.tsx     Project list shared by home and projects
      ui.tsx                Headings, status badges, and filters
      contracts.ts          Shared callback types
      workspace-modal.tsx   Record form and input validation
      project-drawer.tsx    Project details
      pages/                One component per workspace screen
  data/dashboard.ts         Typed design fixtures
  types/workspace.ts        Frontend record types
  lib/
    routes.ts               Route names, labels, and URL helper
    format.ts               Money, date, and duration formatting
    storage-validation.ts  Runtime checks for stored record fields
    workspace-source.ts    Async data source, browser implementation, source switch
    api-workspace-source.ts WorkspaceSource that calls /api/workspace
    use-workspace.ts        Workspace state, loading, and request results
    timer-state.ts          Timer snapshot validation, persistence, and duration
    use-timer.ts            Selected project and running or stopped session
    use-dialog.ts           Focus trap, Escape, and focus restoration
  styles/                   Base, shell, home, shared UI, pages, dialogs, breakpoints
  server/                   Server code; never import it from a client component
    http.ts                 Session check and JSON errors for route handlers
    auth/session.ts         Current user and firm (development stub until #10)
    db/client.ts            Lazy Postgres connection pool
    db/schema.ts            Tables and enums; source for drizzle/*.sql
    db/seed.ts              Demo firm from the design fixtures
    workspace/input.ts      Request validation for each record kind
    workspace/mappers.ts    Database rows to frontend records
    workspace/service.ts    Firm-scoped queries and writes
drizzle/                    Generated SQL migrations; commit with schema changes
tests/
  client/                   Browser-side state; run with npm run test:client
    timer-state.test.mjs
  server/                   Data, validation, and API; run with npm run test:server
    api-workspace-source.test.mjs
    storage-validation.test.mjs
    workspace-input.test.mjs
    workspace-source.test.mjs
```

The root layout keeps the dashboard mounted across routes. Route pages validate the URL; the dashboard selects the corresponding screen from the pathname. Unknown sections render Next.js's 404 page. This lets the v1 timer continue during navigation without a context provider or state library.

## Data flow

`useWorkspace` loads records through `WorkspaceSource`. The local implementation reads each browser collection only after its record validator passes. Invalid storage falls back to the design fixtures. Writes update memory before storage, so the preview still works when the browser denies storage access.

Screens receive records and callbacks through props. Forms collect input, then await `useWorkspace.create`. The source owns persistence and returns the updated workspace. `DashboardApp` closes the form and navigates after success. Failed submissions retain the form and show an error.

The timer stores its selected project and session in `obliq-preview-timer-v1`. A session captures the project's ID and name when started, plus a Unix timestamp in milliseconds. Elapsed time is calculated from that timestamp, including time while the page was closed. Selection stays fixed until the session is saved. A stopped session stores its stop time before the save request, so a failed save can be retried after reload. Successful saves clear only the session and retain the project for next time. Invalid timer storage falls back to an empty selection; unavailable storage shows a warning.

## Adding a screen

Add its route in `routes.ts`, its icon in `sidebar.tsx`, and its component under `dashboard/pages`. Add its render branch in `dashboard-app.tsx`. Keep screen-specific state in that screen. Put a shared component in `ui.tsx` only when more than one screen needs it.

## Backend

The source contract is defined in `src/types/workspace.ts`:

```ts
type WorkspaceSource = {
  load: () => Promise<WorkspaceData>;
  create: (kind: ModalKind, values: FormValues) => Promise<WorkspaceData>;
  saveTime: (project: string, seconds: number) => Promise<WorkspaceData>;
};
```

`NEXT_PUBLIC_WORKSPACE_SOURCE=api` selects `createApiWorkspace`, which calls these routes. Each returns the full `WorkspaceData`, so the screens stay unchanged.

| Method     | Route                         | Body                   | Service         |
| ---------- | ----------------------------- | ---------------------- | --------------- |
| `load`     | `GET /api/workspace`          |                        | `loadWorkspace` |
| `create`   | `POST /api/workspace/records` | `{ kind, values }`     | `createRecord`  |
| `saveTime` | `POST /api/workspace/time`    | `{ project, seconds }` | `saveTime`      |

A request goes through three layers:

1. The route file in `src/app/api` wraps its handler in `route()` from `src/server/http.ts`. `route()` loads the session, returns 401 without one, and turns validation errors into 400 responses.
2. The handler parses the body with a Zod schema from `workspace/input.ts`. Each record kind accepts only the fields its form shows.
3. The service runs firm-scoped queries in `workspace/service.ts` and maps rows to frontend records in `workspace/mappers.ts`.

### Data model

`users` hold the email (unique, ignoring case), the user type (client or firm, set by onboarding in #11), and when onboarding finished. How a user signs in lives in `user_identities` (`provider`, `provider_user_id`), so Auth0 (#10) can later be replaced by passwords without changing `users`. A `firm_members` row links a user to a firm with the role `owner` or `article_assistant`. `firm_invites` hold the codes owners give assistants (#12).

Every other table has a `firm_id`, and the service takes it from the session, never from the request. Records link to clients and projects by ID. Statuses and document types are Postgres enums whose values match the strings the screens filter on. Activity stores a user ID and a timestamp; the label ("You", "2 hours ago") is worked out when it is read. Dates use India time.

The screens still send client and project names (see #7). The service looks them up within the firm and returns 400 for an unknown name. When the forms send IDs, change `input.ts` and the two lookups in `service.ts`.

### Sessions

`getSession()` in `src/server/auth/session.ts` is the only place that knows who is signed in. Until Auth0 is added (#10), development uses the `dev` identity named by `DEV_AUTH_ID`, and production returns no session, so the workspace routes return 401. A signed-in user who has no firm yet gets a session with `firmId: null`, and the workspace routes return 403 with `code: "onboarding_required"` so the client can send them to onboarding (#11). Auth0 calls `findSession("auth0", sub)` from `getSession()`; routes and services do not change.

### Adding an endpoint

1. Add the input schema to `src/server/<area>/input.ts` and the queries to `service.ts`. Filter every query by `session.firmId`.
2. Add `src/app/api/<area>/route.ts` that exports `GET` or `POST = route(...)`.
3. Change the schema only in `db/schema.ts`, then run `npm run db:generate` and commit the SQL file.
4. Add tests for input and mapping. They run without a database.

Keep credentials on the server and never put secrets in `NEXT_PUBLIC_*` variables. The database client, session, route helper, and services import `server-only`, so importing them from a client component fails the build. When collections become large, fetch and paginate them by screen rather than loading every record.

## Working rules

- Keep route definitions in one place. Use Next.js links for navigation.
- Keep record creation out of screen components and formatting out of JSX.
- Use strict TypeScript and typed fixtures. Check stored JSON at runtime.
- Keep styles grouped by responsibility and put breakpoint rules in `responsive.css`.
- Add a helper when it removes repeated behavior. Avoid wrappers that only rename a call.
- Run `npm run check` and verify the affected browser journey before sharing a change.

## References

- [Next.js project structure](https://nextjs.org/docs/app/getting-started/project-structure) allows several organization approaches. This preview uses routes in `app`, UI in `components`, and browser logic in `lib`.
- [Next.js server and client components](https://nextjs.org/docs/app/getting-started/server-and-client-components) explains the client boundary. The local preview needs client state; backend integration can move record fetching into server route pages.
- [TypeScript strict checking](https://www.typescriptlang.org/tsconfig/strict) catches type errors during development. Runtime storage validation handles values the compiler cannot check.
- [Husky setup](https://typicode.github.io/husky/get-started.html) and [lint-staged](https://github.com/lint-staged/lint-staged) describe installing hooks and formatting staged files.
- [Martin Fowler on YAGNI](https://martinfowler.com/bliki/Yagni.html) supports deferring speculative features while keeping existing code easy to change. V1 uses props and small hooks rather than an extra state library or service layer.
