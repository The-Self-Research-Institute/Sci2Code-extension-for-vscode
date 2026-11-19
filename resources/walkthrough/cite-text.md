# Cite a paper in your text

For Quarto (`.qmd`) and Typst (`.typ`) documents. You need the **Quarto** and **Tinymist Typst** extensions installed, so VS Code recognises these files.

1. Click in the middle of a sentence.
2. Run **Sci2Code: Cite in Text**, or hover a paper in the Zotero view and click **Cite in text**, or type `@` and pick a paper.

Sci2Code adds the paper to the `.bib` file your document declares (or asks to create one), then inserts `[@key]` in Quarto or `@key` in Typst. If the paper is already in the file, its existing key is reused.

If something goes wrong, your document is left unchanged.

You can also set your own trigger, such as `&&`, in **Sci2Code: Triggers**. In Quarto or Typst text it lists your papers and cites the one you pick.
