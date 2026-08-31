# Contributing to Sci2Code

>_If you believe you have discovered a security vulnerability, please **do not** open an issue or make a pull request. Follow the instructions in the [SECURITY.md](SECURITY.md) file in this repository._

Sci2Code is a **public** repository: anyone can read the code, fork it, and open a pull request. That does not mean write access is open.

**Public visibility ≠ write access.** We cannot fully block forks/PRs on a public repo. We *can* block unsolicited pushes/merges and require approval before someone becomes a real contributor.

Thank you for your interest in contributing! We encourage contributions large and small to this repository.

**Contributions do not have to be code!** If you see a way to explain things more clearly or a great example of how to use something, please contribute it (or a link to your content). We welcome issues even if you don't code the solution. We also welcome pull requests to resolve issues that we haven't gotten to yet!

## Request to contribute

Before large work (or if you need push access):

1. Open an issue titled `Request to contribute`, saying what you want to work on and whether you need collaborator (write) access.
2. Wait for maintainer approval.
3. Then **fork → branch → PR** (usual path), or accept a collaborator invite if granted for ongoing work.

Small fixes (typos, obvious bugs) via fork + PR are fine without a formal request. Large unsolicited PRs may be deferred until approved.

## How to contribute

* **Open an issue:** Start by [creating an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/creating-an-issue) in the repository. That will start a conversation with the maintainer. When you are creating a bug report, please include as many details as possible; other people do not have your background or understanding of the issue, so be clear and complete.
* **Work in your own public fork:** [Fork the repository](https://docs.github.com/en/get-started/quickstart/fork-a-repo). This creates an editable copy on GitHub where you can write, test, and refine your changes. Keep your changes small and focused on the issue you submitted.
* **Sign a Contributor License Agreement (CLA):** We require that all outside contributors sign a [CLA](https://en.wikipedia.org/wiki/Contributor_License_Agreement) before we can accept your contribution. We'll reach out to you when you open a pull request if you don't already have one on file. Essentially, the CLA gives us permission to publish your contribution as part of the repository.
* **Make a pull request:** You're requesting that the maintainers of the repository pull your changes in. Your contribution will be reviewed, and we may ask you to revise your pull request based on our feedback. Once everyone is satisfied, we'll merge your pull request into the repository.

**Again, thanks for contributing, and we look forward to your issues and pull requests!**

## Access model

| Action | Public (no invite) | Collaborator | Maintainer |
|--------|--------------------|--------------|------------|
| Read / fork | Yes | Yes | Yes |
| Open a PR from a fork | Yes | Yes | Yes |
| Push to this repo | No | Yes | Yes |
| Merge to `main` | No | No | Yes |

## Development Setup

If you want to run the extension locally for development:

1.  **Install dependencies**:
    ```bash
    pnpm i
    ```
2.  **Compile the project**:
    ```bash
    pnpm run compile
    ```
3.  **Run in Watch Mode**:
    ```bash
    pnpm run watch
    ```
4.  **Debug**:
    *   Open the project in VS Code.
    *   Press `F5` or select **Run -> Start Debugging**.
    *   A new VS Code window will open with the extension loaded.

## Running Tests

*   Run `pnpm test` to execute the test suite.

## Project Structure

To help you navigate the codebase, here is an overview of the key directories in `src/`:

*   **`src/api/`**: Interaction with external APIs (Zotero).
*   **`src/auth/`**: Authentication services and session management.
*   **`src/features/`**: Core extension logic.
    *   `docCompletion.ts`: Handles JSDoc/PyDoc citation autocompletion triggers.
    *   `insertCitationCommand.ts`: Logic for the "Insert Citation" command palette action.
    *   `templateService.ts`: Manages citation templates and placeholder replacement.
*   **`src/providers/`**: VS Code TreeView and Authentication providers.
    *   `sidebarProvider.ts`: Controls the Zotero Sidebar view.
    *   `authProvider.ts`: Integrates with VS Code's authentication API.
*   **`src/zotero/`**: Zotero-specific data models and types.
*   **`src/utils/`**: Helper functions and utilities.

## Pull Request Process

1.  Ensure that you have added tests that prove your fix is effective or that your feature works.
2.  Update the `README.md` or documentation with details of changes to the interface, if applicable.
3.  Fill out the Pull Request Template with a clear description of your changes.
4.  Address review comments. Only maintainers merge into `main`.

## Reporting issues

Use GitHub Issues for bugs/features. For security-sensitive reports, follow [SECURITY.md](SECURITY.md) instead — do not open a public issue.
