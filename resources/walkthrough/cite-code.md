# Cite a paper in your code

Put the cursor on an empty line **directly above a function** and type a trigger:

| Language | Type |
| --- | --- |
| Python, Julia | `"""` |
| R | `#'` |
| JavaScript, TypeScript | `/**` |
| Typst | `//` on its own line above a `#let` |
| Quarto, inside a code chunk | the chunk language's trigger above a function |
| Quarto, in the text | `<!--` on its own line |

Pick a paper from the list. A reference comment is inserted with the title, authors, year, DOI and Zotero key.

You can also press **Ctrl+Alt+C** (**Cmd+Alt+C** on Mac), or hover a paper in the Zotero view and click **Insert**.

**One rule for every way of citing:** the cursor decides. In code and Quarto code chunks you get a reference comment. In Quarto or Typst text you get `@key` and the paper is added to your `.bib`. The trigger, the sidebar, the Command Palette and Add manual citation all follow it.
