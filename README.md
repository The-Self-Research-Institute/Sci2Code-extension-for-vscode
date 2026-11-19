# Sci2Code

<p align="center">
  <img src="https://raw.githubusercontent.com/The-Self-Research-Institute/links/main/Sci2CodeLogo.png" alt="Sci2Code Logo" width="128"/>
</p>

<p align="center">
  <b>Integrate your Zotero library directly into your Research and Development workflow.</b>
</p>

<p align="center">
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=SelfResearchInstitute.sci2code"><img src="https://vsmarketplacebadges.dev/version-short/SelfResearchInstitute.sci2code.svg?label=VS%20Code%20Marketplace&color=blue" alt="Marketplace Version"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=SelfResearchInstitute.sci2code"><img src="https://vsmarketplacebadges.dev/installs-short/SelfResearchInstitute.sci2code.svg?label=installs&color=brightgreen" alt="Installs"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=SelfResearchInstitute.sci2code"><img src="https://vsmarketplacebadges.dev/downloads-short/SelfResearchInstitute.sci2code.svg?label=downloads&color=green" alt="Downloads"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=SelfResearchInstitute.sci2code&ssr=false#review-details"><img src="https://vsmarketplacebadges.dev/rating-short/SelfResearchInstitute.sci2code.svg?label=rating&color=gold" alt="Rating"></a>
</p>

<p align="center">
  <a href="https://github.com/sponsors/The-Self-Research-Institute"><img src="https://img.shields.io/badge/Sponsor-%E2%9D%A4-red" alt="Sponsor"></a>
  <a href="https://selfresearch.org/donate"><img src="https://img.shields.io/badge/Donate-selfresearch.org-blueviolet" alt="Donate"></a>
</p>

---

> **Cite once. Keep your code, your paper and your `.bib` in step.**
> Pick a paper from Zotero, and Sci2Code writes the citation into your code, then adds the matching entry to the `.bib` file your **Quarto** or **Typst** document already uses. No export step, no copy and paste, no broken build.

**Sci2Code** bridges the gap between your research library and your code. Seamlessly integrate [Zotero](https://www.zotero.org/), your trusted reference manager, directly into **Visual Studio Code**. Easily link academic articles, papers, and other resources from your Zotero library as inline citations in your code using JSDoc, PyDoc, and other documentation standards.

In **Quarto** and **Typst** documents, Sci2Code also cites a paper right in your text (`[@key]` or `@key`) and adds the entry to your `.bib` file for you, so the document renders.

Search your library from the sidebar, hover a citation to see its details and a clickable DOI link, and generate a bibliography in APA, MLA, numbered or BibTeX style.

## 🚀 Features

<p align="center">
  <img src="https://raw.githubusercontent.com/The-Self-Research-Institute/links/main/Sci2Code.gif" alt="Sci2Code animated demo" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/The-Self-Research-Institute/links/raw/main/Sci2code-demo.mp4">
    ▶ <b>Watch the full HD demo (MP4)</b>
  </a>
</p>

- **Link Zotero items** directly into your code as references.
- **Insert citations** into JavaScript, TypeScript, Python, R, Julia, Quarto, and Typst documentation comments — including inside **Jupyter Notebook** (`.ipynb`) cells.
- **Manual citations**: Add citations for sources not in your Zotero library.
- **Browse and search** your Zotero library from within VS Code.
- **Context-Aware Suggestions**: Type comment triggers like `"""` or `/**` to get instant citation suggestions.
- **Sync your `.bib` file**: One command appends the references you cited to the `.bib` file your Quarto or Typst document actually declares. It never rewrites your file, skips papers already in it, and never reuses an existing key.
- **Generate a Bibliography**: Collect every citation you've inserted across a file or the whole workspace into a formatted reference list — APA, MLA, Numbered, or BibTeX.
- **Hover to preview citations**: Hover over a citation key in your code to see the title, authors, and DOI, and open it in Zotero.
- **Clickable DOI in the hover**: The preview also shows the DOI as a link that opens doi.org.
- **Cite in text (Quarto and Typst)**: Pick a paper and Sci2Code adds it to your `.bib` and inserts `[@key]` or `@key` at the cursor in one step, from a command, a sidebar button, or by typing `@`.
- **One-click sidebar**: Search, filter by collection or tag, switch to "Cited in file", and click a reference to insert its citation.
- **Cite in text and Insert buttons**: Hover a paper in the sidebar to use the **Cite in text** (Quarto and Typst) or **Insert** button, and click a paper to open its details. "Cited in file" jumps to each citation.

## ✍️ Write the paper and the code in one place

Researchers who write in **Quarto** or **Typst** usually keep a `.bib` file in sync by hand. Sci2Code does it for you:

1.  Cite a paper from your Zotero library in your code, in a `.qmd` or `.typ` file.
2.  Run **Sci2Code: Sync BibTeX File**.
3.  Cite it in your prose with the key it shows, for example `[@smith2024]` in Quarto or `@smith2024` in Typst.

**Cite in text, in one step.** In a Quarto or Typst document, run **Sci2Code: Cite in Text** (or click **Cite in text** on a paper in the sidebar, or type `@` in the prose and pick a paper). Sci2Code adds the paper to the document's `.bib` file if it is not there yet, then inserts `[@key]` (Quarto) or `@key` (Typst) at the cursor, so you do not have to sync or copy a key first. If the paper is already in the bibliography, its existing key is reused. Inside a code chunk the usual reference comment is inserted instead.

If something goes wrong the manuscript is never left half-edited: a cancelled prompt or a failed write changes nothing, a document that changed while saving is not edited, and if the editor rejects the citation the saved reference is kept and its key is reused when you try again.

**Requirements.** Quarto and Typst files get Sci2Code's completions only when VS Code recognises them as `quarto` and `typst` files, which needs the [Quarto](https://marketplace.visualstudio.com/items?itemName=quarto.quarto) and [Tinymist Typst](https://marketplace.visualstudio.com/items?itemName=myriad-dreamer.tinymist) extensions. Typst files normally use the `.typ` extension; `.typst` files are scanned for citations too. The Quarto extension has its own `@` suggestions from your `.bib`; Sci2Code's list shows your Zotero library, so the two can appear side by side.

What makes it safe to run on a real project:

- **It finds the right file.** It reads `bibliography:` from your front matter or `_quarto.yml`, or `#bibliography(...)` from Typst. It creates `references.bib` only when you haven't declared one, and then offers to add the declaration for you.
- **It only appends.** Your formatting, ordering and hand-edited entries stay exactly as they are, so your git diff shows only the new references.
- **No duplicates.** Papers already in the file are matched by DOI (or title and year) and skipped. Running it twice changes nothing.
- **Readable keys.** It uses your Better BibTeX key when the item has one, otherwise `authorYear` such as `smith2024`.

## 🖼 Screenshots

A step-by-step walkthrough of what Sci2Code looks like in action.

**1. Install from the VS Code Marketplace**

<p align="center">
  <img src="https://raw.githubusercontent.com/The-Self-Research-Institute/links/main/screenshots/01-marketplace-install.png" alt="Marketplace install" width="100%"/>
</p>

**2. Works across Python, JS/TS, R, Julia, Quarto, Typst and more**

<p align="center">
  <img src="https://raw.githubusercontent.com/The-Self-Research-Institute/links/main/screenshots/02-readme-languages.png" alt="Supported languages" width="100%"/>
</p>

**3. Your Zotero library, right in the sidebar**

<p align="center">
  <img src="https://raw.githubusercontent.com/The-Self-Research-Institute/links/main/screenshots/03-library-sidebar.png" alt="Library sidebar" width="100%"/>
</p>

**4. Type a comment trigger → QuickPick opens**

<p align="center">
  <img src="https://raw.githubusercontent.com/The-Self-Research-Institute/links/main/screenshots/04-quickpick-trigger.png" alt="QuickPick on trigger" width="100%"/>
</p>

**5. Pick a reference — citation is inserted**

<p align="center">
  <img src="https://raw.githubusercontent.com/The-Self-Research-Institute/links/main/screenshots/05-citation-inserted.png" alt="Citation inserted" width="100%"/>
</p>

**6. Or insert via the Command Palette**

<p align="center">
  <img src="https://raw.githubusercontent.com/The-Self-Research-Institute/links/main/screenshots/06-command-palette-search.png" alt="Command Palette search" width="100%"/>
</p>

**7. Or single-click from the sidebar**

<p align="center">
  <img src="https://raw.githubusercontent.com/The-Self-Research-Institute/links/main/screenshots/07-sidebar-click-insert.png" alt="Sidebar click insert" width="100%"/>
</p>

**8. Multi-language templates out of the box**

<p align="center">
  <img src="https://raw.githubusercontent.com/The-Self-Research-Institute/links/main/screenshots/08-multi-language.png" alt="Multi-language templates" width="100%"/>
</p>

**9. Configure everything from the Settings UI**

<p align="center">
  <img src="https://raw.githubusercontent.com/The-Self-Research-Institute/links/main/screenshots/09-settings-ui.png" alt="Settings UI" width="100%"/>
</p>

**10. Define your own citation template**

<p align="center">
  <img src="https://raw.githubusercontent.com/The-Self-Research-Institute/links/main/screenshots/10-custom-template.png" alt="Custom template" width="100%"/>
</p>

**11. See your custom template in the inserted block**

<p align="center">
  <img src="https://raw.githubusercontent.com/The-Self-Research-Institute/links/main/screenshots/11-custom-result.png" alt="Custom template result" width="100%"/>
</p>

## 📦 Installation

You can install the extension from within Visual Studio Code or download it from the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=SelfResearchInstitute.sci2code).

## ⚡ Get Started

1.  **Open a Supported File**: Works with Javascript (`.js`), Typescript (`.ts`), Python (`.py`), Julia (`.jl`), R (`.r`), Quarto (`.qmd`), Typst (`.typ`) and more — including Jupyter Notebook (`.ipynb`) cells.
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

**The cursor decides what you get**, whether you use a trigger, the sidebar, the Command Palette or Add manual citation:

- **In code and Quarto code chunks**: a reference comment above the function.
- **In Quarto or Typst text**: `@key`, and the paper is added to your `.bib`. Type `@`, or set your own trigger such as `&&`.
- **A comment marker on its own line in a document**: `//` above a `#let` in Typst, or `<!--` in Quarto text, inserts the reference comment.

### **5. Generating a Bibliography**

Once you've cited a few sources in your code, turn them into a reference list:

1.  Open the Command Palette (`Ctrl+Shift+P`).
2.  Run **"Sci2Code: Generate Bibliography"**.
3.  Choose a scope (current file or the whole workspace), then a citation style — **APA**, **MLA**, **Numbered**, or **BibTeX**.
4.  Choose where it goes — inserted at your cursor, or written out to `REFERENCES.md` / `references.bib`.

Sci2Code only includes items it can match back to your Zotero library, so the list always stays in sync with what's actually cited.

In a Quarto or Typst file it also includes the papers you cited with `@key` in the text.

### **6. Syncing a `.bib` File (Quarto and Typst)**

1.  Open your `.qmd` or `.typ` document.
2.  Run **"Sci2Code: Sync BibTeX File (Append Missing References)"**.
3.  Choose the current file or the whole workspace. The new entries are added to the end of the `.bib` file your document declares, and you can **Copy Keys** to paste them into your text.

Sync checks two things in the current file: the Sci2Code reference comments, and the `[@key]` / `@key` citations in your text (cross-references such as `@fig-plot`, code, comments and email addresses are ignored). A citation whose key is already in the `.bib` is confirmed, one that is missing but matches exactly one paper in your library is added, and any it cannot match is listed in the message. Scanning the text for `@key` citations only applies to the current file, not to the whole workspace.

## ⚙️ Configuration

Customize the extension to fit your workflow in **Settings** (`Ctrl+,` > Sci2Code).

- **Custom Triggers**: changing the default comment triggers.
- **Templates**: Define how citations appear using placeholders like:
  - `${zotero.title}` - Article/book title
  - `${zotero.creators}` - Authors
  - `${zotero.date}` - Publication year
  - `${zotero.year}` - Four-digit publication year
  - `${zotero.DOI}` - Digital Object Identifier
  - `${zotero.doiUrl}` - The DOI as a link (`https://doi.org/...`); the line is left out when there is no DOI. The default templates use the plain DOI, and the hover popup already shows a clickable DOI link
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

This project is licensed under the [MIT License](LICENSE.md).

## 📬 Contact

If you encounter issues or have feature requests, please [Open an Issue](https://github.com/The-Self-Research-Institute/Sci2Code-extension-for-vscode/issues) or contact **The Self Research Institute** at [support@selfresearch.org](mailto:support@selfresearch.org).
