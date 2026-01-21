# Peek Server

Webhook server for the Peek mobile app. Receives URLs, texts, tagsets, and images from the mobile app and stores them in SQLite. Built with Hono running on Node.js, designed for deployment on Railway.

## Commands

```bash
# From this directory (backend/server/)
npm install          # Install dependencies
npm start            # Run the production server
npm run dev          # Run with file watching (auto-restart on changes)
npm test             # Run the test suite

# From project root
yarn server:install  # Install server dependencies
yarn server:start    # Run the production server
yarn server:dev      # Run with file watching
yarn server:test     # Run the test suite
```

**Important:** Run tests after making changes to verify nothing is broken.

## Architecture

- **index.js** - Hono HTTP server with API endpoints
- **db.js** - SQLite database module (better-sqlite3)
- **users.js** - Multi-user authentication with API keys

### API Endpoints

- `GET /` - Health check
- `POST /webhook` - Receive items from mobile app (`{ urls: [...], texts: [...], tagsets: [...] }`)

**URLs**
- `GET /urls` - List all saved URLs with tags
- `DELETE /urls/:id` - Delete a URL
- `PATCH /urls/:id/tags` - Update tags for a URL

**Texts**
- `POST /texts` - Create a text item
- `GET /texts` - List all texts
- `DELETE /texts/:id` - Delete a text
- `PATCH /texts/:id/tags` - Update tags

**Tagsets**
- `POST /tagsets` - Create a tagset
- `GET /tagsets` - List all tagsets
- `DELETE /tagsets/:id` - Delete a tagset
- `PATCH /tagsets/:id/tags` - Update tags

**Images**
- `POST /images` - Upload an image (multipart or base64)
- `GET /images` - List all images
- `GET /images/:id` - Get image file
- `DELETE /images/:id` - Delete an image
- `PATCH /images/:id/tags` - Update tags

**Unified Items**
- `POST /items` - Create any item type
- `GET /items` - List items (optional `?type=` filter)
- `DELETE /items/:id` - Delete an item
- `PATCH /items/:id/tags` - Update tags

**Tags**
- `GET /tags` - List tags sorted by frecency

### Database Schema

Multi-user SQLite databases (one per user):
- `items` - Unified table for URLs, texts, tagsets, images
- `tags` - Tag names with frecency scoring
- `item_tags` - Many-to-many junction table
- `settings` - Key-value configuration

System database:
- `users` - User IDs and hashed API keys

Database stored in `./data/{userId}/peek.db`. Override with `DATA_DIR` env var.

### Authentication

All endpoints except `/` require Bearer token authentication:
```
Authorization: Bearer <api_key>
```

API keys are hashed with SHA-256 and stored in the system database.

## Deployment

Configured for Railway (`railway.json`) using Nixpacks builder with automatic restart on failure.

> **For detailed Railway deployment guide** including step-by-step workflow, user/API key management, production testing, and troubleshooting, see `CLAUDE.md` in the project root.

**Quick setup:**
1. Connect your Railway project to this subdirectory (`backend/server/`)
2. Attach a volume and set `DATA_DIR` to the mount path for persistent storage
3. Create users and their API keys (see CLAUDE.md for commands)

## Environment Variables

- `PORT` - Server port (default: 3000)
- `DATA_DIR` - Data directory for SQLite databases (default: `./data`)
- `API_KEY` - Legacy single-user API key (auto-migrates to multi-user system)
