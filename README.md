# Sci2Code

<p align="center">
  <img src="resources/Sci2CodeLogo.png" alt="Sci2Code Logo" width="128"/>
</p>

<p align="center">
  <b>Integrate your Zotero library directly into your Research and Development workflow.</b>
</p>

<p align="center">
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-GPL--3.0-blue.svg" alt="License"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=SelfResearchInstitute.sci2code"><img src="https://img.shields.io/visual-studio-marketplace/v/SelfResearchInstitute.sci2code?color=blue&label=VS%20Code%20Marketplace" alt="Visual Studio Marketplace Version"></a>
</p>

---

**Sci2Code** bridges the gap between your research library and your code. Seamlessly integrate [Zotero](https://www.zotero.org/), your trusted reference manager, directly into **Visual Studio Code**. Easily link academic articles, papers, and other resources from your Zotero library as inline citations in your code using JSDoc, PyDoc, and other documentation standards.

## 🚀 Features

<p align="center">
  <img src="resources/Features.gif" alt="Sci2Code Demo" width="100%" />
</p>

- **Link Zotero items** directly into your code as references.
- **Insert citations** into JavaScript, Python, and R documentation comments.
- **Manual citations**: Add citations for sources not in your Zotero library.
- **Browse and search** your Zotero library from within VS Code.
- **Context-Aware Suggestions**: Type comment triggers like `"""` or `/**` to get instant citation suggestions.

## 📦 Installation

You can install the extension from within Visual Studio Code or download it from the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=SelfResearchInstitute.sci2code).

## ⚡ Get Started

1.  **Open a Supported File**: Works with Javascript (`.js`), Typescript (`.ts`), Python (`.py`), Julia (`.jl`), R (`.r`), and more.
2.  **Configure API Key**:
    - Go to [Zotero API Settings](https://www.zotero.org/settings/keys) and create a new key (Read/Write access).
    - In VS Code, open **Settings** (`Ctrl+,`), search for `sci2code.apiKey`, and paste your key.
    - The status bar will update to `$(zap) Zotero: Ready`.

## 🛠 Usage

### **1. Using the Command Palette**

1.  Open the Command Palette (`Ctrl+Shift+P`).
2.  Run **"Sci2Code: Insert Zotero Citation"**.
3.  Search and select your reference, or choose **"Create Manual Citation"** to enter citation details manually.

### **2. Manual Citations**

If you need to cite a source that's not in your Zotero library:

1.  Open the Command Palette (`Ctrl+Shift+P`).
2.  Run **"Sci2Code: Insert Manual Citation"**.
3.  Enter the citation details (title, authors, year, DOI, URL, etc.).
4.  The citation will be inserted using the same template format as Zotero citations.

**Tip**: Manual citation is also available as the first option when using "Insert Zotero Citation".

### **3. Using the Zotero Sidebar**

1.  Click the **Zotero** icon in the Activity Bar.
2.  Browse or search your library.
3.  Click any item to insert as citation.

### **4. Using Comment Triggers**

Type a trigger (e.g., `"""` in Python, `/**` in JS) above a function to see a searchable list of your Zotero items.

## ⚙️ Configuration

Customize the extension to fit your workflow in **Settings** (`Ctrl+,` > Sci2Code).

- **Custom Triggers**: changing the default comment triggers.
- **Templates**: Define how citations appear using placeholders like:
  - `${zotero.title}` - Article/book title
  - `${zotero.creators}` - Authors
  - `${zotero.date}` - Publication year
  - `${zotero.DOI}` - Digital Object Identifier
  - `${zotero.url}` - Web link to the item
  - `${zotero.key}` - Zotero item key
  - `${zotero.publicationTitle}` - Journal/conference name
  - `${zotero.itemType}` - Type of reference
  - `${code.id}` - Unique code identifier
  - `${code.functionName}` - Associated function name

### Example Template Customization

```json
"sci2code.templates": {
  "python": [
    "\"\"\"",
    "Reference: ${zotero.title}",
    "Authors: ${zotero.creators}",
    "DOI: ${zotero.DOI}",
    "URL: ${zotero.url}",
    "\"\"\""
  ]
}
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on how to set up your development environment, run tests, and open Pull Requests.

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md) and [Governance Model](GOVERNANCE.md).

## 📄 License

This project is licensed under the [GPL-3.0 License](LICENSE.md).

## 📬 Contact

If you encounter issues or have feature requests, please [Open an Issue](https://github.com/The-Self-Research-Institute/zotero_vscode_ext/issues) or contact **The Self Research Institute** at [support@selfresearch.org](mailto:support@selfresearch.org).
