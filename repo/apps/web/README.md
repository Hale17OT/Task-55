# StudioOps Web — Angular Frontend

Role-based Angular app for the StudioOps offline photo & video service platform. Provides desktop and tablet layouts for Guest, Client, Merchant, Operations, and Administrator users.

## Roles & Routes

| Role | Routes | Key Features |
|------|--------|-------------|
| Guest | `/`, `/offerings` | View public offerings |
| Client | `/events`, `/` | Register for events, view restricted offerings |
| Merchant | `/offerings`, `/portfolio`, `/events` | Manage packages/add-ons, upload media, create events |
| Operations | `/dashboard`, `/data-quality` | Analytics dashboards, data quality review, dedup |
| Administrator | `/admin` | Roles, rules, config, sessions, whitelist, org members |

## Development

```bash
cd apps/web
npx ng serve
```

The dev server proxies `/api` to `http://localhost:3100` via `proxy.conf.json`. Requires the API to be running.

## Production Build

```bash
npx ng build --configuration=production
```

Output goes to `dist/web/browser/`, served by nginx in Docker.

## Offline Constraints

- No external CDN/API dependencies
- File System Access API used for export-to-folder (Chrome/Edge only)
- All data served from local network API
