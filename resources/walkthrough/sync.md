# Keep your .bib file in step

Run **Sci2Code: Sync BibTeX File** in a Quarto or Typst document.

It checks the reference comments and the `[@key]` / `@key` citations in the current file, and:

- finds the `.bib` file your document really uses (front matter, `_quarto.yml` or `#bibliography`),
- adds the papers that are missing, at the end of the file,
- never rewrites what is already there, and
- tells you the key of every paper so you can cite it.

Use **Sci2Code: Generate Bibliography** when you want a formatted reference list (APA, MLA, numbered or BibTeX).
