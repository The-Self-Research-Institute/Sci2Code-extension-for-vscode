# Sci2Code

VsCode Extension to connect with [Zotero](https://www.zotero.org/).

**Sci2Code** bridges the gap between your research library and your code. This extension allows seamless integration of **Zotero**, your trusted reference manager, directly into **Visual Studio Code**. Easily link academic articles, papers, and other resources from your Zotero library as inline citations in your code using **JSDoc** and **PyDoc** comments.

- 🔗 **Link Zotero items** directly into your code as references  
- ✍️ **Insert citations** into JavaScript and Python documentation comments (JSDoc / PyDoc)  
- 📚 **Browse and search** your Zotero library from within VS Code  
- 🔄 **Sync your code** with your research for better traceability

---

**Ideal for** researchers, students, and developers working on scientific or data-driven projects who want to keep references organized, accessible, and close to their code.

## Installation
You can install the extension from within Visual Studio Code or download it from [Visual Studio Code Marketplace]().

## Get Started
To get started using the extension, open any Javascript(.js), Typescript(.ts), JavascriptXML(.jsx), TypescriptXML(.tsx), python(.py), Julia(.jl), and R(.r) file.

## Key Features

Sci2Code has been updated to be more powerful and intuitive:

- **Multiple Ways to Cite**: Insert citations however you prefer.
    - **Command Palette**: Trigger a searchable list of your Zotero items anytime.
    - **Interactive Sidebar**: Browse, search, and filter your entire Zotero library and insert citations with a single click.
    - **Comment Triggers**: For rapid citation, type a comment prefix (like `"""` or `/**`) to get intelligent suggestions.
- **Context-Aware Help**: The status bar now tells you if your Zotero API key is configured correctly and provides quick access to settings or the citation picker.
- **Fully Configurable**:
    - **Custom Triggers**: Don't like the default comment triggers? Change them or add your own for any language in the settings.
    - **Custom Templates**: Take full control over the citation format. Use placeholders to include any data from your Zotero item, such as title, authors, DOI, or abstract note, and format it to match any documentation standard (JSDoc, Doxygen, etc.).

## How to Use

1.  **Install** the extension from the [Visual Studio Code Marketplace]().
2.  **Configure your API Key**:
    - Open your Zotero settings on the web and create a new private API key with read/write access.
    - In VS Code, open Settings (`Ctrl+,`), search for "Sci2Code", and paste your key into the `sci2code.apiKey` field.
    - The status bar icon will update to `$(zap) Zotero: Ready`.
3.  **Insert a Citation**: Choose your preferred method.

    - **Option A: Using the Command Palette**
        1. Open the Command Palette (`Ctrl+Shift+P`).
        2. Type and select **"Sci2Code: Insert Zotero Citation"**.
        3. Search for and select the reference you wish to cite.

    - **Option B: Using the Zotero Sidebar**
        1. Click the Zotero icon in the Activity Bar.
        2. Use the search and filter tools to find your reference.
        3. Click the "insert citation" icon next to the item in the list.

    - **Option C: Using Comment Triggers**
        1. In a supported file (e.g., Python, JavaScript, R), type a trigger prefix like `"""`, `/**`, or `#'` above a function.
        2. A suggestion list of your Zotero items will appear. Select one to insert the citation.

## Citation Example

After choosing a document, the extension generates a unique `CodeID` and inserts a comment block using your configured template. 

## Requirements

- This extension runs on VsCode only.
- This extension requires API Key from Zotero to work. You can get the API key from [here](https://www.zotero.org/settings/keys).
- NodeJs
- Pnpm (Package Manager)

## Running Extension locally

#### Follow the steps below to run the extension locally:

- Install the dependencies

```
pnpm i
```

- Compile project

```
pnpm run compile
```

- To run the extension in watch mode, use the command below:

```
pnpm run compile
```

- Select Run -> Start Debugging from VsCode Navbar

- The Extension will start in a new VsCode Window in Debugging Mode

## For more information

- [Visual Studio Code's Extension API ](https://code.visualstudio.com/api)
- [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Contact Us
We encourage all feedback. If you encounter a technical issue or have an enhancement request, create an issue here or contact The Self Research Institute at [support@selfresearch.org](mailto:support@selfresearch.org).

## Release Notes

### 1.0.0
Release date: 2025-04-09

* Initial release.