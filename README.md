# route2postman

Framework-agnostic CLI that scans a backend project, detects its API framework, extracts route definitions, enriches them with request details, and generates an importable Postman collection.

## What It Solves

Backend teams often define API routes directly in framework code, but then manually recreate those same routes in Postman for testing, QA, demos, or onboarding. That creates duplicated work and the collection quickly becomes stale.

`route2postman` reduces that manual step. It reads your backend source code, finds API endpoints, infers useful request metadata, and writes a Postman collection you can import immediately.

It is especially useful when:

- You inherit a backend and need to understand available endpoints.
- You want a fast Postman collection without writing OpenAPI first.
- You are prototyping and routes change often.
- You want API testing to start from the source code instead of from manual documentation.

## Current Capabilities

- Auto-detect supported backend frameworks.
- Parse route methods and paths.
- Generate Postman collection JSON.
- Add `base_url` collection variable.
- Convert framework-specific path params into Postman variables.
- Infer request metadata where possible:
  - Path params
  - Query params
  - JSON request bodies
  - Headers
  - Auth headers
- Group generated requests into Postman folders by resource.
- Allow forcing a framework parser when auto-detection is not enough.

## Supported Frameworks

| Framework | Detection | Route Parsing | Request Inference |
| --- | --- | --- | --- |
| Express.js | `package.json` and source signatures | Yes | Body, query, params, headers, auth |
| Hono | `package.json` and source signatures | Yes | Body, query, params, headers, auth |
| FastAPI | Python dependency files and source signatures | Yes | Pydantic body models, query, headers, auth |
| Flask | Python dependency files and source signatures | Yes | Body, query, headers, auth |
| Django | Python dependency files, `manage.py`, `urls.py` | Basic | Path params |
| Gin | `go.mod` and source signatures | Yes | Body tags, query, params, headers, auth |

## Installation

For local development:

```bash
npm install
npm run build
```

Run from the project root:

```bash
node dist/index.js <backend-project-path>
```

After publishing as a package, the intended CLI usage is:

```bash
route2postman <backend-project-path>
```

## Usage

Scan the current directory:

```bash
node dist/index.js .
```

Scan another backend project:

```bash
node dist/index.js ../my-api
```

Choose an output file:

```bash
node dist/index.js ../my-api --output my_api.postman_collection.json
```

Set the Postman `base_url` variable:

```bash
node dist/index.js ../my-api --base-url http://localhost:8000
```

Force a parser:

```bash
node dist/index.js ../my-api --framework FastAPI
```

List supported frameworks:

```bash
node dist/index.js --list-frameworks
```

## Importing Into Postman

1. Run `route2postman` or `node dist/index.js` to generate the collection JSON.
2. Open Postman.
3. Click `Import`.
4. Choose the generated file, usually `postman_collection.json`.
5. Confirm the import.
6. Open the collection variables and set values like:
   - `base_url`
   - `token`
   - `api_key`
7. Run or edit the generated requests.

Generated requests use `{{base_url}}`, so you can switch between local, staging, and production by changing one variable.

## Example Output

For an Express route like:

```ts
app.post('/users/:id', requireAuth, (req, res) => {
  const { name, email, password } = req.body;
  const page = req.query.page;
  const traceId = req.get('x-trace-id');

  res.json({ ok: true });
});
```

The generated Postman request can include:

- Method: `POST`
- URL: `{{base_url}}/users/:id?page=`
- Headers:
  - `Authorization: Bearer {{token}}`
  - `X-Trace-Id: {{x_trace_id}}`
  - `Content-Type: application/json`
- Body:

```json
{
  "name": "Example Name",
  "email": "user@example.com",
  "password": "password123"
}
```

## Architecture

The project is organized around a small pipeline:

```text
CLI
 |
 v
Framework Detection
 |
 v
Route Parser
 |
 v
Route Enrichment
 |
 v
Postman Collection Generator
 |
 v
postman_collection.json
```

### 1. CLI Layer

File: `src/index.ts`

The CLI handles user input, command options, framework selection, route printing, and writing the generated collection file.

Responsibilities:

- Read the target project directory.
- Accept options like `--output`, `--base-url`, and `--framework`.
- Run framework detection or use the forced parser.
- Print a route summary.
- Write the final Postman JSON.

### 2. Framework Detection

Folder: `src/detectors`

Each detector returns a confidence score. The detector with the highest score is selected.

Detection uses two kinds of signals:

- Manifest/dependency signals, such as `package.json`, `requirements.txt`, `pyproject.toml`, or `go.mod`.
- Source-code signatures, such as `FastAPI()`, `express()`, `new Hono()`, `urlpatterns`, or `gin.Default()`.

Main entry:

```ts
detectFramework(projectDir)
```

### 3. Route Parsers

Folder: `src/parsers`

Each parser understands the common route syntax for one framework.

Examples:

- Express: `app.get('/users', handler)`
- FastAPI: `@app.get("/users")`
- Flask: `@app.route("/users", methods=["GET"])`
- Django: `path("users/", views.users)`
- Hono: `app.get('/users', handler)`
- Gin: `router.GET("/users", handler)`

Parsers return a normalized `RouteInfo` object so the generator does not need to know framework-specific syntax.

### 4. Route Enrichment

File: `src/utils/inference.ts`

This layer tries to infer request details from handler code.

It can infer:

- `params`: path variables and framework param access.
- `queryParams`: values read from query objects.
- `body`: sample JSON request body.
- `headers`: headers read by the route.
- `auth`: auth-like middleware, dependencies, or token usage.

This is intentionally heuristic. It does not fully execute or compile the target backend. That keeps it fast and framework-agnostic, but it means generated metadata should be treated as a strong starting point, not a perfect contract.

### 5. Postman Generator

File: `src/generators/postman.ts`

The generator converts `RouteInfo[]` into a Postman Collection v2.1 JSON document.

It handles:

- Collection metadata.
- Request URL construction.
- Postman path variables.
- Query params.
- Headers.
- JSON bodies.
- Collection variables.
- Folder grouping by route resource.

## Core Data Model

File: `src/types.ts`

```ts
export interface RouteInfo {
  method: string;
  path: string;
  name?: string;
  description?: string;
  params?: { name: string; type: string; required: boolean }[];
  queryParams?: { name: string; type: string; required: boolean }[];
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
}
```

Every framework parser maps its native route style into this common structure.

## How Inference Works

The first version uses source-code pattern matching. For example:

- Express:
  - `req.body.email` becomes a JSON body field.
  - `req.query.page` becomes a query param.
  - `req.headers.authorization` becomes an auth header.
- FastAPI:
  - Pydantic `BaseModel` fields become JSON body examples.
  - `Header(...)` parameters become headers.
  - `Depends(...)` can mark a route as auth-protected.
- Flask:
  - `request.json.get("email")` becomes a JSON body field.
  - `request.args.get("page")` becomes a query param.
- Gin:
  - `json:"email"` struct tags become JSON body fields.
  - `c.Query("page")` becomes a query param.

Sample values are generated from field names:

- `email` -> `user@example.com`
- `password` -> `password123`
- `age` or `id` -> `1`
- `isActive` -> `true`

## Limitations

- It is static analysis, not runtime introspection.
- Very dynamic route definitions may not be detected.
- Deeply abstracted routers may need better parser support.
- Request inference is best-effort.
- Django support is currently route-focused and should be expanded for DRF serializers/views.
- It does not yet generate OpenAPI.

## Future Improvements

- Add OpenAPI 3.1 export.
- Add stronger AST-based parsing for JavaScript/TypeScript and Python.
- Improve Django REST Framework serializer detection.
- Support nested Express routers more deeply.
- Detect response examples and status codes.
- Generate Postman test scripts.
- Generate Postman environments separately.
- Add a `--format postman|openapi` option.
- Add route filtering by method, path, or tag.
- Add CI tests with fixture projects for each framework.

## Development

Build:

```bash
npm run build
```

Watch TypeScript:

```bash
npm run dev
```

Run the CLI after building:

```bash
node dist/index.js .
```

## Project Structure

```text
src/
  detectors/       Framework detection logic
  parsers/         Framework-specific route parsers
  generators/      Postman collection generator
  utils/           Shared project scanning and inference helpers
  index.ts         CLI entry point
  types.ts         Shared interfaces
```

## Status

This is an early version of the project. The foundation is in place: detection, parsing, inference, and Postman output. The next big step is improving parser accuracy with fixture-based tests and AST parsing where regex patterns become too limited.
