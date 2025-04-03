# sci-2-code README

VsCode Extension to connect with [Zotero](https://www.zotero.org/).

## Features

- This extension allows to connect VsCode with Zotero.
- Cite Reference from Zotero to Source Code.
- This extension works in Javascript(.js), Typescript(.ts), JavascriptReact(.jsx) and TypescriptReact(.tsx) files.
- The suggestions for zotero document triggers when pressing /\*\*
- After choosing the document from suggestion the extension generate a unique codeId and create a jsDoc comment for the function with the details about zotero document:

```
/**
 * @ZoteroArticleIDs: ZOTERO_ARTICLE_ID
 * @ZoteroArticleNames: ZOTERO_ARTICLE_NAME
 * @ZoteroArticleURLs: ZOTERO_ARTICLE_URL
 * @CodeID: CODE_ID
 */
async function calculateDifference(c,b){

}
```

- After creating the jsDoc comment the extension adds a new tag to document in zotero with the information containing codeId and functionName: 
```
{"codeId":CODE_ID,"functionName":"calculateDifference"}
```

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

- or to run the extension in watch mode, use the command below:

```
pnpm run compile
```

- Select Run -> Start Debugging from VsCode Navbar

- The Extension will start in a new VsCode Window in Debugging Mode

## For more information

- [Visual Studio Code's Extension API ](https://code.visualstudio.com/api)
- [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
