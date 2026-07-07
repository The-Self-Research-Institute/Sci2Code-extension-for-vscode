# Change Log

All notable changes to the "Sci2Code" extension will be documented in this file.

## [Unreleased]

### Changed
- **License**: Changed from GPL-3.0-or-later to AGPL-3.0-or-later.

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