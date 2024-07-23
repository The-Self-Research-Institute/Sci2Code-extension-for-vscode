# zotero-plugin README

VsCode Extension to connect with [Zotero](https://www.zotero.org/).

## Features

- This extension allows to connect VsCode with Zotero.
- Cite Reference from Zotero to Source Code.
- This extension works in Javascript(.js), Typescript(.ts), JavascriptReact(.jsx) and TypescriptReact(.tsx) files.

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
