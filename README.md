# route2postman

Generate a Postman collection from backend routes.

`route2postman` scans your API project, detects the framework, finds routes, adds useful request details, and saves a `postman_collection.json` file that you can import into Postman.

## Install

Run without installing:

```bash
npx route2postman .
```

Or install globally:

```bash
npm install -g route2postman
route2postman .
```

## Quick Start

From inside your backend project:

```bash
route2postman .
```

This creates:

```text
postman_collection.json
```

Import that file into Postman.

## Common Usage

Scan another project:

```bash
route2postman ../my-api
```

Set the Postman collection name:

```bash
route2postman ../my-api --name "Billing API"
```

Write to a custom file:

```bash
route2postman ../my-api --output billing.postman_collection.json
```

Override the detected base URL:

```bash
route2postman ../my-api --base-url http://localhost:8000
```

Force a framework:

```bash
route2postman ../my-api --framework FastAPI
```

Choose folder grouping:

```bash
route2postman ../my-api --grouping path
route2postman ../my-api --grouping smart
route2postman ../my-api --grouping none
```

Use guided prompts:

```bash
route2postman --interactive
```

List supported frameworks:

```bash
route2postman --list-frameworks
```

## What It Generates

The generated Postman collection can include:

- Route method and path
- Postman folders by path, custom config, or smart grouping
- `base_url` collection variable
- Path variables like `:id`
- Query params
- JSON body examples when body fields are detected
- Headers such as `Authorization`, `Content-Type`, and API keys
- Auth variables like `token` and `api_key`

Example:

```text
POST {{base_url}}/users/:id?page=
```

Headers:

```text
Authorization: Bearer {{token}}
Content-Type: application/json
```

Body:

```json
{
  "name": "Example Name",
  "email": "user@example.com"
}
```

## Import Into Postman

1. Run `route2postman`.
2. Open Postman.
3. Click `Import`.
4. Select `postman_collection.json`.
5. Open the collection variables.
6. Set values like `base_url`, `token`, or `api_key`.

## Project Config

Use a config file when you do not want to type the same options every time, or when your team wants consistent Postman folder names.

Create `route2postman.config.json` in your backend project:

```json
{
  "collectionName": "Billing API",
  "baseUrl": "http://localhost:8000",
  "output": "billing.postman_collection.json",
  "framework": "Express.js",
  "grouping": "path",
  "groups": {
    "Auth": ["/login", "/register", "/logout", "/refresh-token"],
    "Users": ["/users", "/profile", "/me"],
    "Admin": ["/admin/*"]
  }
}
```

Then run:

```bash
route2postman .
```

CLI flags override config values.

Config options:

| Option | What it does |
| --- | --- |
| `collectionName` | Name shown inside Postman. |
| `baseUrl` | Value for the `{{base_url}}` collection variable. |
| `output` | Where to save the generated collection JSON. |
| `framework` | Force a parser, useful when auto-detection is unsure. |
| `grouping` | Folder mode: `path`, `smart`, or `none`. |
| `groups` | Your custom folder rules. These always run before automatic grouping. |

Grouping modes:

| Mode | Behavior |
| --- | --- |
| `path` | Default. Groups by the first path segment, such as `/users` -> `Users`. Custom config groups still apply first. |
| `smart` | Uses custom groups first, then groups by the first meaningful path segment. For example, `/api/v1/users` -> `Users`. |
| `none` | Does not create folders. Requests are written at the collection root. |

Custom groups are useful because every project names routes differently. For example:

```json
{
  "groups": {
    "Identity": ["/login", "/signup", "/sessions/*"],
    "Customers": ["/clients", "/customers", "/accounts/:id"],
    "Internal Tools": ["/internal/*", "/admin/*"]
  }
}
```

This keeps the tool flexible instead of forcing fixed folder names.

## Supported Frameworks

| Framework | Route Detection | Request Inference |
| --- | --- | --- |
| Express.js | Yes | Body, query, params, headers, auth |
| Hono | Yes | Body, query, params, headers, auth |
| FastAPI | Yes | Pydantic models, query, headers, auth |
| Flask | Yes | Body, query, headers, auth |
| Django | Basic | Path params |
| Gin | Yes | JSON tags, query, params, headers, auth |

## Base URL Detection

If you do not pass `--base-url`, the CLI tries to detect it from:

- `.env` files
- `BASE_URL`, `API_URL`, `SERVER_URL`, `APP_URL`
- `HOST` and `PORT`
- package scripts with `--port`
- `app.listen(...)`
- Flask `app.run(port=...)`
- Uvicorn or FastAPI run config
- Gin `Run(":8080")`

Fallback:

```text
http://localhost:3000
```

## Architecture

```text
Backend project
   |
   v
Framework detector
   |
   v
Framework parser
   |
   v
Route inference
   |
   v
Postman generator
   |
   v
postman_collection.json
```

Core folders:

```text
src/
  detectors/    framework detection
  parsers/      route extraction
  utils/        inference and project scanning
  generators/   Postman JSON generation
  index.ts      CLI entry
```

## How It Works

1. Detects the framework using dependency files and source-code signals.
2. Parses routes into a shared `RouteInfo` format.
3. Infers request details from handler code.
4. Converts the normalized routes into Postman Collection v2.1 JSON.

The analysis is static. It does not run your backend.

## Limitations

- Very dynamic routes may be missed.
- Deeply nested routers may need better parser support.
- Inference is best-effort, not a guaranteed API contract.
- Django REST Framework support is still basic.
- OpenAPI export is not available yet.

## Development

```bash
git clone https://github.com/ishivamgaur/route2postman.git
cd route2postman
npm install
npm run build
node dist/index.js .
```

Run a package dry run:

```bash
npm run pack:dry-run
```

## License

MIT
