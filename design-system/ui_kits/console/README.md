# Kraterion — Storage console UI kit

A click-thru recreation of the Kraterion web console — what a developer sees after they sign in. Closest references in the wild: Supabase Storage, DigitalOcean Spaces, Cloudflare R2.

## Screens

The single `index.html` mounts a small router that flips between four screens:

1. **Buckets** — list of all buckets with size + object count.
2. **Bucket detail** — file browser inside a bucket (folder tree on the left, object list in the middle, object inspector on the right).
3. **Access keys** — list of S3 access keys + create-key dialog.
4. **Usage & billing** — monthly storage / bandwidth stats.

The shell (sidebar + topbar + breadcrumbs) is shared across all four.

## Components

| File | What it is |
|---|---|
| `Shell.jsx` | App shell — sidebar + topbar + content area |
| `Sidebar.jsx` | Left nav with mark, links, account footer |
| `Topbar.jsx` | Breadcrumbs + actions on the right |
| `BucketList.jsx` | Table of buckets |
| `BucketDetail.jsx` | File browser screen |
| `AccessKeys.jsx` | Access key table + create dialog |
| `Usage.jsx` | Stats + chart placeholder |
| `Mark.jsx` | The Kraterion aperture, sized + theme-aware |
| `primitives.jsx` | Button, Input, Pill, Dot, Card, IconButton |
| `extras.jsx` | Drawer, ConfirmModal, OnchainRef, EmptyState, TabbedCode, FormField, Banner |
| `Icon.jsx` | Inline Lucide-style 1.5px stroke icons |

All cosmetic — no real network, no real auth.
