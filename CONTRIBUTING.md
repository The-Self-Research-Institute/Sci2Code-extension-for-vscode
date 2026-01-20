# Contributing

>_If you believe you have discovered a security vulnerability, please **do not** open an issue or make a pull request.  Follow the instructions in the [SECURITY.md](SECURITY.md) file in this repository._

Thank you for your interest in contributing to a Sci2Code repository!  We encourage contributions large and small to this repository.  

**Contributions do not have to be code!** If you see a way to explain things more clearly or a great example of how to use something, please contribute it (or a link to your content).  We welcome issues even if you don't code the solution.  We also welcome pull requests to resolve issues that we haven't gotten to yet!

## How to contribute

* **Open an issue:** Start by [creating an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/creating-an-issue) in the repository that you're interested in.  That will start a conversation with the maintainer.  When you are creating a bug report, please include as many details as possible.  Please remember that other people do not have your background or understanding of the issue; make sure you are clear and complete in your description.
* **Work in your own public fork:** If you choose to make a contribution, you should [fork the repository](https://docs.github.com/en/get-started/quickstart/fork-a-repo).  This creates an editable copy on GitHub where you can write, test, and refine your changes.  We suggest that you keep your changes small and focused on the issue you submitted.
* **Sign a Contributor License Agreement (CLA):** We require that all outside contributors sign a [CLA](https://en.wikipedia.org/wiki/Contributor_License_Agreement) before we can accept your contribution.  When you create a pull request (see below), we'll reach out to you if you do not already have one on file.  Essentially, the CLA gives us permission to publish your contribution as part of the repository.
* **Make a pull request:** "[Pull Request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests)" is a confusing term, but it means exactly what it says:  You're requesting that the maintainers of the repository pull your changes in.  If you don't have a CLA on file, we'll reach out to you.  Your contribution will be reviewed, and we may ask you to revise your pull request based on our feedback.  Once everyone is satisfied, we'll merge your pull request into the repository.

**Again, thanks for contributing, and we look forward to your issues and pull requests!**

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

