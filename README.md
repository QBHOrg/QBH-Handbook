# Policy Hub (Static) — Main Headings → Sub-policies → Content

## What this is
A static handbook website:
- Employees: read-only
- Admin: edit via `/admin.html`
- Structure: Main heading → sub-policy → content (paragraphs + bullet points)

## Important: Saving on a static website
Because GitHub Pages is static, the admin editor **cannot** write to the server.
So it works like this:
- **Save**: stores your edits in your browser (local draft) so you can continue later on that same computer.
- **Export handbook.json**: creates a file you upload to GitHub to publish to employees.

## Run locally (recommended)
Use VS Code + Live Server:
- Open folder in VS Code
- Right-click `index.html` → Open with Live Server

## Deploy to GitHub Pages
- Upload the folder to a GitHub repo
- Settings → Pages → Branch: main /root
- Share the Pages URL with employees

## Change Admin Password
Edit `js/config.js` and replace `ADMIN_PASSWORD_HASH` with SHA-256 of your password.
(You can generate a hash in your browser console or ask ChatGPT for a generator snippet.)


## Using your QBH PDFs
- This build includes a structured handbook (Main heading → Sub-policy) generated from your PDFs.
- Put the PDFs into the `/pdf` folder with the same filenames referenced in `data/handbook.json` so the Download/Print button works.

## Logo
- Put your logo at `assets/logo.png`.
- If the logo file is missing, the site automatically falls back to the gradient icon.
