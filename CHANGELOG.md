# Change Log

All notable changes to the "Sci2Code" extension will be documented in this file.

## [Unreleased]

## [1.0.11] - 2026-10-23

### Added
- **Citation hover**: Hover over a Zotero key in a citation comment (JS/TS, Python, R, Julia, including notebook cells) to see the item's title, authors, year, publication and DOI, with "Open" and "Copy key" actions.
- **One-click Sci2Code sidebar**: The Zotero view is now a single panel. Click a reference to insert its citation straight into the editor. Hover a row for quick actions (open in Zotero, copy key, preview details). It has live search (Ctrl/Cmd+F, with a clear button) across your whole library, results paged 5 at a time, Library and "Cited in file" tabs with count badges, sorting by year, title, author or type, and per-type icons with a file-type badge for attachments. Filters for collection (subcollections included) and tag sit under the search box behind the sliders button. "Add manual citation" is in the header, and the status line under the list is a button that opens your citation template. A sync button sits next to the status. "Generate bibliography" has a menu for inserting at the cursor, copying to the clipboard, writing to a file, or scanning the workspace. Items with no title are flagged for review, and the panel follows your VS Code theme.
- **Instant, always-current library.** Your library is cached on disk, so the sidebar opens immediately with your last synced references, even offline, while it syncs in the background. Sync is incremental: Zotero's library version is checked first, nothing is downloaded if it has not changed, and otherwise only changed items are fetched and deletions and trashed items are removed. It re-checks every 5 minutes and when the window regains focus, so changes made in Zotero Desktop show up on their own. The cache is cleared on logout or when the API key changes, and a changed or rejected key never reuses another account's data.
- **Search also asks Zotero.** Typing a search queries your whole library locally and Zotero's own search, including text inside notes and attachments, and merges the results (with a "searching Zotero..." indicator). If Zotero cannot be reached it falls back to your library only and says so.
- **Progressive loading.** On a first sync the list fills in as pages arrive instead of waiting for the whole library. Pages that have not loaded yet show placeholder rows and the pager shows "loading...", so jumping ahead never shows a blank list. Search shows the matches you already have immediately, with a "Searching Zotero..." row until Zotero's results are merged in.

### Fixed
- **Logout now sticks.** Logging out left the API key in `sci2code.apiKey`, and the next session check silently re-adopted it, so you were logged back in after a reload. Logout now clears that setting as well. The sidebar header has a logout button (with a confirmation), since the command was previously only in the Command Palette.
- **"Cited in file" now counts every citation in the file.** Citations whose key is not in your Zotero library (manual citations made before saving to Zotero, or items deleted from it) were silently ignored, so a file with two citations showed 1. They now appear with a "Not in your Zotero library" flag, and an "Add to Zotero" button creates the item and relinks the comment to its new key. Generate bibliography now warns about any citations it has to leave out.
- **Manual citations are now saved to Zotero.** "Insert Manual Citation" previously only wrote a comment with a throwaway `MANUAL_` key, so the reference never reached your library and could not appear under "Cited in file" or in a bibliography. It now creates the item in your Zotero library (this needs an API key with write access), uses its real key, and shows it in the sidebar immediately. If saving fails (read-only key, offline, not logged in), you get a warning and the citation is inserted locally as before.
- **Libraries with more than 25 items now load completely.** The library was fetched in a single request, which Zotero caps at 25 items, so larger libraries were silently truncated in the sidebar, completions, hover and bibliography. Items are now loaded in pages of 100 with a progress indicator, skipping child notes and attachments. Rate limits and transient network errors are retried, a library that changes mid-load is reloaded, and a partial load shows a warning instead of failing silently.

### Changed
- The old Zotero Account and Zotero Documents tree views and their commands (Search Library, Clear Search, Sort Zotero Documents, Copy DOI, Copy Zotero Key, Open on zotero.org) are replaced by the new panel; open and copy actions are in the reference details.
- **License**: Relicensed from AGPL-3.0-or-later to the MIT License.

## [1.0.10] - 2026-07-07

### Added
- **Jupyter Notebook support**: Citation completions and inserts now work inside `.ipynb` cells (Python, R, Julia, JS/TS), not just plain files. Previously the completion provider only matched `scheme: "file"`, so notebook cells (`scheme: "vscode-notebook-cell"`) were silently unsupported.
- **Generate Bibliography**: New "Sci2Code: Generate Bibliography" command. Scans the current file or the whole workspace for citations already inserted by Sci2Code, matches them against your Zotero library, and produces a formatted reference list in APA, MLA, Numbered, or BibTeX style — written to `REFERENCES.md`/`references.bib` or inserted at the cursor.

### Changed
- **License**: Changed from GPL-3.0-or-later to AGPL-3.0-or-later.

### Fixed
- **Login validates the API key before saving it.** Previously "Sci2Code: Login to Zotero" accepted any non-empty text and only surfaced a confusing error later, after the sidebar tried to load. Now the key is checked against the Zotero API right away — an invalid key re-prompts immediately with a clear reason (bad key, no library access, or a network problem) and your previous entry pre-filled so you can fix a typo instead of retyping the whole key.
- **"Sci2Code: Login to Zotero" now always re-prompts and re-validates**, even if a previous (possibly invalid) key is already cached — clicking Login no longer silently reuses a stale session and fails downstream.
- **A stale `sci2code.apiKey` setting no longer permanently overrides a working login.** Previously, any non-empty value left in that setting was re-synced over the stored token on every single session check, so a bad leftover setting value could clobber a freshly validated login indefinitely. It's now only adopted when no token is stored yet (first-run/settings.json setup); explicit edits to the setting are still picked up via the existing configuration-change handler.

## [1.0.9] - 2026-04-25

### Changed
- Enlarged README screenshots to full width for better legibility on the Marketplace listing.
- Added a "Watch the full HD demo (MP4)" link under the animated GIF for higher-fidelity preview.

## [1.0.8] - 2026-04-22

### Fixed
- Swapped all README badges from the deprecated shields.io `vscode-marketplace` endpoint (which renders as "retired badge") to `vsmarketplacebadges.dev`, which works against the current Marketplace API.

## [1.0.7] - 2026-04-22

### Fixed
- Replaced the deprecated Marketplace version badge (was showing "retired badge") with the current `vscode-marketplace` endpoint.

### Added
- Downloads, installs and rating badges at the top of the README.

## [1.0.6] - 2026-04-22

### Fixed
- Logo now renders correctly on the Marketplace listing and in external README viewers (served from an absolute URL).

## [1.0.5] - 2026-04-22

### Added
- Friendlier Zotero sidebar — icons for each item type, clearer labels, and search that looks across title, authors, DOI, year and more.
- Right-click any paper in the sidebar to copy its DOI or Zotero key, or open it on zotero.org.
- Sort your library by type, title, author or date.
- New examples folder with ready-to-try files for Python, JavaScript, TypeScript, R and Julia.
- A quick “Show Logs” option and one-click “Reset to default template” for when things go wrong.

### Changed
- Citations now pop up as soon as you start typing a trigger like `/**` or `"""`, not only after the last character.
- The default citation style is now neutral so it looks right in any language before you customize it.
- Your Zotero API key is kept private to this machine — it will not sync across devices by accident.
- Refreshed README with new screenshots and a short demo.

### Fixed
- “Show Logs” now actually opens the log.
- Clicking the status-bar indicator takes you to the right settings page.
- A few small hiccups that could make citations fail silently.

## [1.0.4] - 2026-04-22

### Added
- Friendlier Zotero sidebar — icons for each item type, clearer labels, and search that looks across title, authors, DOI, year and more.
- Right-click any paper in the sidebar to copy its DOI or Zotero key, or open it on zotero.org.
- Sort your library by type, title, author or date.
- New examples folder with ready-to-try files for Python, JavaScript, TypeScript, R and Julia.
- A quick “Show Logs” option and one-click “Reset to default template” for when things go wrong.

### Changed
- Citations now pop up as soon as you start typing a trigger like `/**` or `"""`, not only after the last character.
- The default citation style is now neutral so it looks right in any language before you customize it.
- Your Zotero API key is kept private to this machine — it will not sync across devices by accident.
- Refreshed README with new screenshots and a short demo.

### Fixed
- “Show Logs” now actually opens the log.
- Clicking the status-bar indicator takes you to the right settings page.
- A few small hiccups that could make citations fail silently.

## [1.0.3] - 2025-10-13

### Changed
- **License**: Changed from MIT to GPL-3.0-or-later.
- **Default Template**: Updated the default citation template to a more structured format.

### Added
- **Command Palette Integration**: Added a "Sci2Code: Insert Zotero Citation" command for easy access.
- **Zotero Sidebar View**: Implemented an interactive sidebar to browse, search, and insert citations directly from the Zotero library.
- **Status Bar Indicator**: Added a status bar item to show Zotero connection status and provide quick access.
- **Enhanced Configuration**: Citation triggers and documentation templates are now fully customizable via VS Code settings.

## [1.0.2] - 2025-05-29

### Added
- vscode.dev Support: Use the sci2code extension directly in your web browser.

## [1.0.1] - 2025-05-08

### Added
- Logo added

## [1.0.0] - 2025-04-09

- Initial release

### Added
- Integration with zotero
- JsDoc & PyDoc comments with zotero citations