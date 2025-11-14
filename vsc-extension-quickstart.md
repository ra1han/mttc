# MCP Tools Token Counter Extension

## What's in the folder

* This folder contains all of the files necessary for your extension.
* `package.json` - this is the manifest file that declares the extension, its view container, webview, and commands.
  * The extension registers a custom view container in the activity bar with a webview that displays MCP server tools and their token counts.
* `src/extension.ts` - this is the main file where the extension implementation lives.
  * The file exports the `activate` function, which is called when the extension is activated.
  * It implements a `tokenCounteViewProvider` class that provides the webview content and functionality.
  * Uses `tiktoken` library with `cl100k_base` encoding to calculate accurate token counts for tool descriptions.

## Get up and running straight away

* Press `F5` to open a new window with your extension loaded.
* Look for the MCP Tools Token Counter icon in the activity bar (left sidebar).
* Click the icon to open the Token Counter view.
* The view will display all available MCP servers, the number of tools each has, and the total token count of their descriptions.
* Click the "Refresh" button to update the counts after adding or removing MCP servers.
* Set breakpoints in your code inside `src/extension.ts` to debug your extension.
* Find output from your extension in the debug console.

## Make changes

* You can relaunch the extension from the debug toolbar after changing code in `src/extension.ts`.
* You can also reload (`Ctrl+R` or `Cmd+R` on Mac) the VS Code window with your extension to load your changes.
* The webview content is generated dynamically, so refreshing the view will show your changes.

## Key Implementation Details

### Webview View Provider
The extension uses `vscode.window.registerWebviewViewProvider` to create a persistent view in the activity bar.

### Token Counting
- Uses `tiktoken` library with `cl100k_base` encoding (same as GPT-4/GPT-3.5-turbo)
- Encodes each tool description and counts the tokens
- Displays accurate token counts instead of character counts

### MCP Server Detection
- Reads all available language model tools via `vscode.lm.tools`
- Groups tools by server name (extracted from tool name patterns like `mcp_servername_toolname`)
- Calculates aggregate statistics per server

### UI Features
- Professional header with uppercase title styling
- Compact refresh button with minimal design
- Server cards showing tool count and total token count
- Responsive hover effects and VS Code theme integration

## Explore the API

* You can open the full set of our API when you open the file `node_modules/@types/vscode/index.d.ts`.

## Run tests

* Install the [Extension Test Runner](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner)
* Run the "watch" task via the **Tasks: Run Task** command. Make sure this is running, or tests might not be discovered.
* Open the Testing view from the activity bar and click the Run Test" button, or use the hotkey `Ctrl/Cmd + ; A`
* See the output of the test result in the Test Results view.
* Make changes to `src/test/extension.test.ts` or create new test files inside the `test` folder.
  * The provided test runner will only consider files matching the name pattern `**.test.ts`.
  * You can create folders inside the `test` folder to structure your tests any way you want.

## Go further

* [Follow UX guidelines](https://code.visualstudio.com/api/ux-guidelines/overview) to create extensions that seamlessly integrate with VS Code's native interface and patterns.
* Reduce the extension size and improve the startup time by [bundling your extension](https://code.visualstudio.com/api/working-with-extensions/bundling-extension).
* [Publish your extension](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) on the VS Code extension marketplace.
* Automate builds by setting up [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration).
* Integrate to the [report issue](https://code.visualstudio.com/api/get-started/wrapping-up#issue-reporting) flow to get issue and feature requests reported by users.
