# Image URL Workflow

Images in Cursed Arena are **URL-only**. Direct file uploads to Supabase Storage are disabled.

## How to set an image

1. Upload your image to an external host (Imgur, Cloudinary, GitHub raw, etc.)
2. Copy the **direct image URL** — not the page link, the actual image file URL
3. Paste it into the relevant field in the ACP, Settings, or Clan Panel

## Accepted URL formats

| Type | Example | Notes |
|------|---------|-------|
| Imgur direct link | `https://i.imgur.com/abc123.png` | Must be `i.imgur.com`, not `imgur.com` |
| Any direct image URL | `https://example.com/image.webp?v=2` | Must end in `.png`, `.jpg`, `.jpeg`, `.webp`, or `.gif` |
| Local repo path | `/portraits/yuji.png` | For built-in game assets only |
| Public Supabase URL | `https://*.supabase.co/storage/v1/object/public/...` | Existing public URLs still work |

## Rejected URL formats

| Type | Example | Reason |
|------|---------|--------|
| Imgur page link | `https://imgur.com/abc123` | Not a direct image; use `i.imgur.com` |
| Imgur album | `https://imgur.com/a/abc123` | Not a direct image |
| `blob:` URL | `blob:http://localhost/...` | Temporary, not persistent |
| `data:` URL | `data:image/png;base64,...` | Too large for storage |
| `javascript:` URL | `javascript:alert(1)` | Unsafe |
| Non-public Supabase URL | `/storage/v1/object/game-assets/...` | Missing `/public/` — will 400 |
| Non-image URL | `https://example.com/page` | No image extension |

## Imgur guide

1. Go to [imgur.com](https://imgur.com) and upload your image
2. Open the image (click it)
3. Right-click the image → **Copy image address**
4. The URL should look like: `https://i.imgur.com/XXXXXXX.png`
5. Paste that URL into Cursed Arena

**Do not paste the Imgur page URL** (`https://imgur.com/XXXXXXX`) — that is a web page, not the image itself.

## ACP game assets

Fighter portraits, ability icons, and passive icons are set by pasting a direct image URL into the field in the Admin Control Panel. After editing, click **Publish** to push to all users.

- Portrait: square crop, recommended 512×512
- Ability/passive icon: square, recommended 256×256

## Player avatars

Set in **Settings → Avatar**. Paste a direct image URL. Avatars display as 100×100px squares outside battle.

## Clan emblems

Set in **Clan Panel → Clan Emblem** (leader/officer only). Paste a direct image URL. Emblems display as 100×100px squares.
