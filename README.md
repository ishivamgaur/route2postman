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
- Postman folders by resource
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
