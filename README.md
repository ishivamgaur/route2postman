# route2postman

Generate a ready-to-import Postman collection from backend route definitions.

`route2postman` is a framework-aware TypeScript CLI that scans a backend project, detects the API framework, extracts routes, enriches each endpoint with request metadata, and writes a Postman Collection JSON file.

It is designed for developers who want a fast API testing collection without manually rebuilding every route in Postman.

## Table of Contents

- [Why This Exists](#why-this-exists)
- [What It Does](#what-it-does)
- [Supported Frameworks](#supported-frameworks)
- [Quick Start](#quick-start)
- [CLI Usage](#cli-usage)
- [Import Into Postman](#import-into-postman)
- [Example](#example)
- [Architecture](#architecture)
- [Data Flow](#data-flow)
- [Project Structure](#project-structure)
- [How Route Inference Works](#how-route-inference-works)
- [Core Data Model](#core-data-model)
- [Development](#development)
- [Limitations](#limitations)
- [Roadmap](#roadmap)

## Why This Exists

Backend routes usually live in source code, while Postman collections are often maintained by hand. That creates a common problem:

- Routes change, but the Postman collection does not.
- Developers repeat the same API setup work again and again.
- New team members need to inspect code manually before testing endpoints.
- API collections become incomplete, outdated, or inconsistent.

`route2postman` solves this by using the backend code as the source of truth. It reads route declarations directly from the project and generates a Postman collection that can be imported and used immediately.

## What It Does

`route2postman` can:

- Detect the backend framework automatically.
- Extract route methods and paths.
- Convert framework-specific path params into Postman variables.
- Infer query params, headers, auth, and JSON request bodies where possible.
- Generate useful sample body values from field names.
- Group endpoints into Postman folders by resource.
- Generate collection variables such as `base_url`, `token`, and `api_key`.
- Let you force a framework parser when auto-detection is not enough.

The output is a standard Postman Collection v2.1 JSON file.

## Supported Frameworks

| Framework | Detection Signals | Route Extraction | Inference Support |
| --- | --- | --- | --- |
| Express.js | `package.json`, imports, `express()`, routers | Good | Body, query, params, headers, auth |
| Hono | `package.json`, imports, `new Hono()` | Good | Body, query, params, headers, auth |
| FastAPI | `requirements.txt`, `pyproject.toml`, imports, decorators | Good | Pydantic models, query, headers, auth |
| Flask | Python dependency files, imports, decorators | Good | Body, query, headers, auth |
| Django | Python dependency files, `manage.py`, `urls.py` | Basic | Path params |
| Gin | `go.mod`, imports, router calls | Good | JSON tags, query, params, headers, auth |

## Quick Start

Install dependencies:

```bash
npm install
```

Build the CLI:

```bash
npm run build
```

Generate a Postman collection from a backend project:

```bash
node dist/index.js ../my-api
```

By default, the collection is written to:

```text
../my-api/postman_collection.json
```

## CLI Usage

Scan the current directory:

```bash
node dist/index.js .
```

Scan a different project:

```bash
node dist/index.js ../my-api
```

Write the collection to a custom file:

```bash
node dist/index.js ../my-api --output my-api.postman_collection.json
```

Set the default Postman base URL:

```bash
node dist/index.js ../my-api --base-url http://localhost:8000
```

Force a specific framework parser:

```bash
node dist/index.js ../my-api --framework FastAPI
```

List supported frameworks:

```bash
node dist/index.js --list-frameworks
```

After the package is published, the intended command will be:

```bash
route2postman ../my-api
```

## Import Into Postman

1. Generate the collection:

```bash
node dist/index.js ../my-api
```

2. Open Postman.
3. Click `Import`.
4. Select the generated `postman_collection.json` file.
5. Confirm the import.
6. Open the imported collection.
7. Go to the collection `Variables` tab.
8. Set values for variables such as:

| Variable | Purpose |
| --- | --- |
| `base_url` | API server URL, for example `http://localhost:3000` |
| `token` | Bearer token for protected endpoints |
| `api_key` | API key used by inferred API key headers |

Generated request URLs use `{{base_url}}`, so you can switch environments by changing one collection variable.

## Example

Given this Express route:

```ts
app.post('/users/:id', requireAuth, (req, res) => {
  const { name, email, password } = req.body;
  const page = req.query.page;
  const traceId = req.get('x-trace-id');

  res.json({ ok: true });
});
```

`route2postman` can generate a Postman request like this:

```text
POST {{base_url}}/users/:id?page=
```

Headers:

```text
Authorization: Bearer {{token}}
X-Trace-Id: {{x_trace_id}}
Content-Type: application/json
```

Body:

```json
{
  "name": "Example Name",
  "email": "user@example.com",
  "password": "password123"
}
```

The route is also placed inside a `Users` folder in the generated Postman collection.

## Architecture

`route2postman` uses a small pipeline architecture. Each stage has one clear responsibility.

```text
            Target backend project
                     |
                     v
        +--------------------------+
        | CLI entry point          |
        | src/index.ts             |
        +--------------------------+
                     |
                     v
        +--------------------------+
        | Framework detection      |
        | src/detectors/*          |
        +--------------------------+
                     |
                     v
        +--------------------------+
        | Framework route parser   |
        | src/parsers/*            |
        +--------------------------+
                     |
                     v
        +--------------------------+
        | Route inference          |
        | src/utils/inference.ts   |
        +--------------------------+
                     |
                     v
        +--------------------------+
        | Postman generator        |
        | src/generators/postman.ts|
        +--------------------------+
                     |
                     v
          postman_collection.json
```

### 1. CLI Layer

File: `src/index.ts`

The CLI is the orchestration layer. It parses command-line options, resolves the target directory, chooses a framework, prints a route summary, and writes the final collection file.

Responsibilities:

- Read CLI arguments.
- Resolve the backend project path.
- Run framework detection unless `--framework` is provided.
- Call the selected route parser.
- Pass parsed routes into the Postman generator.
- Write the final JSON file.

### 2. Framework Detection Layer

Folder: `src/detectors`

Each framework has a detector that returns a confidence score. The framework with the highest score is selected.

Detection uses two signal types:

| Signal Type | Examples |
| --- | --- |
| Dependency files | `package.json`, `requirements.txt`, `pyproject.toml`, `go.mod` |
| Source signatures | `express()`, `FastAPI()`, `@app.route`, `urlpatterns`, `gin.Default()` |

This makes detection work even when dependency files are incomplete but source code clearly shows the framework.

### 3. Parser Layer

Folder: `src/parsers`

Each parser understands one framework's route syntax and converts it into a shared `RouteInfo` shape.

Examples:

| Framework | Route Syntax |
| --- | --- |
| Express | `app.get('/users', handler)` |
| Hono | `app.post('/users', handler)` |
| FastAPI | `@app.post("/users")` |
| Flask | `@app.route("/users", methods=["POST"])` |
| Django | `path("users/", views.users)` |
| Gin | `router.POST("/users", handler)` |

Parsers do not generate Postman JSON directly. They only produce normalized route data.

### 4. Inference Layer

File: `src/utils/inference.ts`

The inference layer enriches each route with request details. It is intentionally framework-aware but output-agnostic.

It can infer:

- Path params
- Query params
- Request body fields
- Headers
- Auth requirements
- Sample values

This layer keeps parser files smaller and makes inference behavior reusable across frameworks.

### 5. Generator Layer

File: `src/generators/postman.ts`

The generator converts normalized routes into a Postman Collection v2.1 document.

It handles:

- Collection metadata
- Request URLs
- Path variables
- Query parameters
- Headers
- JSON request bodies
- Collection variables
- Folder grouping

## Data Flow

The internal data flow looks like this:

```text
Backend source files
        |
        v
FrameworkDetector.detect(projectDir)
        |
        v
RouteParser.parse(projectDir)
        |
        v
RouteInfo[]
        |
        v
generatePostmanCollection(routes, frameworkName, baseUrl)
        |
        v
Postman Collection JSON
```

The important design decision is that every parser returns the same `RouteInfo` interface. This allows new frameworks to be added without changing the Postman generator.

## Project Structure

```text
route2postman/
  src/
    detectors/
      django.ts
      express.ts
      fastapi.ts
      flask.ts
      gin.ts
      hono.ts
      index.ts
    parsers/
      django.ts
      express.ts
      fastapi.ts
      flask.ts
      gin.ts
      hono.ts
      index.ts
    generators/
      postman.ts
    utils/
      inference.ts
      project.ts
    index.ts
    types.ts
  package.json
  tsconfig.json
  README.md
```

## How Route Inference Works

The first implementation uses static source-code analysis with framework-specific patterns. It does not run the target backend.

### Express.js

| Code Pattern | Inferred Postman Data |
| --- | --- |
| `req.body.email` | JSON body field `email` |
| `{ name } = req.body` | JSON body field `name` |
| `req.query.page` | Query param `page` |
| `req.params.id` | Path param `id` |
| `req.get('x-api-key')` | Header `X-Api-Key` |
| `auth`, `jwt`, `token` usage | `Authorization` header |

### FastAPI

| Code Pattern | Inferred Postman Data |
| --- | --- |
| `class User(BaseModel)` | JSON body model |
| `email: str` | Body field `email` |
| `age: int` | Body field `age` with numeric example |
| `Header(...)` | Header |
| `Depends(...)` | Possible auth |
| `/users/{user_id}` | Path variable `user_id` |

### Flask

| Code Pattern | Inferred Postman Data |
| --- | --- |
| `request.json.get("email")` | JSON body field `email` |
| `request.args.get("page")` | Query param `page` |
| `request.headers.get("Authorization")` | Header |

### Gin

| Code Pattern | Inferred Postman Data |
| --- | --- |
| `` json:"email" `` | JSON body field `email` |
| `c.Query("page")` | Query param `page` |
| `c.Param("id")` | Path param `id` |
| `c.GetHeader("Authorization")` | Header |

### Sample Value Generation

Sample values are generated from field names and types:

| Field | Example |
| --- | --- |
| `email` | `user@example.com` |
| `password` | `password123` |
| `name` | `Example Name` |
| `age` | `1` |
| `isActive` | `true` |
| `description` | `Example description` |

## Core Data Model

All framework parsers return this shared shape:

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

This model separates framework parsing from collection generation. A parser only needs to produce `RouteInfo`; the generator handles the Postman-specific output.

## Development

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Run in watch mode:

```bash
npm run dev
```

Run the compiled CLI:

```bash
node dist/index.js .
```

Run against another backend:

```bash
node dist/index.js ../my-api --base-url http://localhost:3000
```

## Adding a New Framework

To add another framework:

1. Add a detector in `src/detectors/<framework>.ts`.
2. Add a parser in `src/parsers/<framework>.ts`.
3. Register both in `src/detectors/index.ts`.
4. Register the parser in `src/parsers/index.ts` if needed by future APIs.
5. Return normalized `RouteInfo[]` from the parser.
6. Add inference helpers in `src/utils/inference.ts` if the framework has request metadata patterns.

The Postman generator should not need framework-specific changes.

## Limitations

`route2postman` is currently a static analyzer. That gives it speed and portability, but it also means:

- Highly dynamic routes may be missed.
- Deeply abstracted routers may need extra parser support.
- Inference is best-effort, not a guaranteed API contract.
- Django support is currently basic and should be improved for Django REST Framework.
- Response schemas and status codes are not inferred yet.
- OpenAPI export is not implemented yet.

Generated collections should be treated as a strong starting point that developers can refine in Postman.

## Roadmap

Planned improvements:

- Add fixture-based tests for every supported framework.
- Add OpenAPI 3.1 export.
- Add AST-based parsing for JavaScript, TypeScript, Python, and Go where useful.
- Improve nested router support.
- Improve Django REST Framework serializer and viewset support.
- Infer response examples and status codes.
- Generate optional Postman environments.
- Generate optional Postman test scripts.
- Add route filtering by method, path, or framework.
- Add `--format postman|openapi`.

## Status

This project is in an early but working stage. The core pipeline is implemented:

```text
detect framework -> parse routes -> infer request details -> generate Postman collection
```

The next priority is improving accuracy with real fixture projects and tests for each supported framework.
