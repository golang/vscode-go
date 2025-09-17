# Commands

In addition to integrated editing features, this extension offers a number of commands, which can be executed manually through the [Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) (Ctrl+Shift+P on Linux/Windows or Cmd+Shift+P on Mac OS).

Some of these commands are also available in the VS Code context menu (right-click). To control which of these commands show up in the editor context menu, update the [`"go.editorContextMenuCommands"`](settings.md#go.editorContextMenuCommands) setting.

All commands provided by this extension have the prefix `Go:`.

## Latest changes

The commands described below are up-to-date as of June 2020. We do our best to keep documentation current, but if a command is missing, you can always consult the full list in the Extensions view.

To view this list:

1. Navigate to the Extensions view (Ctrl+Shift+X).
2. Find the Go extension and click on it to open the Extension Editor.
3. Click on the `Feature Contributions` tab.
4. Scroll through the list under `Commands`.

Finally, you can also see a full list by using a meta command: `Go: Show All Commands...`.

## Detailed list

<!-- Everything below this line is generated. DO NOT EDIT. -->

### `Go: Open in new Document`

Open selected variable in a new document.

### `Go: Current GOPATH`

See the currently set GOPATH.

### `Go: Current GOROOT`

See the currently set GOROOT.

### `Go: Locate Configured Go Tools`

List all the Go tools being used by this extension along with their locations.

### `Go: Test Function At Cursor`

Runs a unit test at the cursor.

### `Go: Test Function At Cursor or Test Previous`

Runs a unit test at the cursor if one is found, otherwise re-runs the last executed test.

### `Go: Subtest At Cursor`

Runs a sub test at the cursor.

### `Go: Debug Subtest At Cursor`

Debug a sub test at the cursor.

### `Go: Benchmark Function At Cursor`

Runs a benchmark at the cursor.

### `Go: Debug Test At Cursor`

Debug test at the cursor.

### `Go: Test File`

Runs all unit tests in the current file.

### `Go: Test Package`

Runs all unit tests in the package of the current file.

### `Go: Toggle Hide System Goroutines`

Toggles hiding the system goroutines from the active debug session call stack view.

### `Go Test: Refresh`

Refresh a test in the test explorer. Only available as a context menu option in the test explorer.

### `Go Test: Show Last Profile`

Show last captured profile

### `Go Test: Profile`

Run a test and capture a profile

### `Go Test: Delete Profile`

Delete selected profile

### `Go: Show pprof file`

Internal use. Open a pprof profile file.

### `Go: Benchmark Package`

Runs all benchmarks in the package of the current file.

### `Go: Benchmark File`

Runs all benchmarks in the current file.

### `Go: Test All Packages In Workspace`

Runs all unit tests from all packages in the current workspace.

### `Go: Test Previous`

Re-runs the last executed test.

### `Go: Debug Previous`

Re-runs the last debugged test run through a codelens or "Go: Debug Test at Cursor" command.

### `Go: Toggle Test Coverage In Current Package`

Displays test coverage in the current package.

### `Go: Generate Unit Tests For Package`

Generates unit tests for the current package using gotests

### `Go: Generate Unit Tests For File`

Generates unit tests for the current file using gotests

### `Go: Generate Unit Tests For Function`

Generates unit tests for the selected function in the current file using gopls

### `Go: Generate Unit Tests For Function (legacy)`

Generates unit tests for the selected function in the current file using gotests

### `Go: Generate Interface Stubs`

Generates method stub for implementing the provided interface and inserts at the cursor.

### `Go: Extract Language Server Logs To Editor`

Extract logs in the `gopls (server)` output channel to the editor.

### `Go: Welcome`

Open the welcome page for the Go extension.

### `Go: Toggle compiler optimization details`

Toggle the per-package flag that causes compiler optimization details to be reported as diagnostics

### `Go: Add Import`

Add an import declaration

### `Go: Add Package to Workspace`

Add a package from the imports list to the workspace.

### `Go: Install/Update Tools`

install/update the required go packages

### `Go: Toggle Test File`

Toggles between file in current active editor and the corresponding test file.

### `Go: Toggle Vulncheck`

Toggle the display of vulnerability analysis in dependencies.

### `Go: Start language server's maintainer interface`

Start the Go language server's maintainer interface (a web server).

### `Go: Add Tags To Struct Fields`

Add tags configured in go.addTags setting to selected struct using gomodifytags (via gopls)

### `Go: Remove Tags From Struct Fields`

Remove tags configured in go.removeTags setting from selected struct using gomodifytags (via gopls)

### `Go: Show All Commands...`

Shows all commands from the Go extension in the quick pick

### `Go: Browse Packages`

Browse packages and Go files inside the packages.

### `Go: Get Package`

Run `go get -v` on the package on the current line.

### `Go: Run on Go Playground`

Upload the current selection or file to the Go Playground

### `Go: Lint Current Package`

Run linter in the package of the current file.

### `Go: Lint Workspace`

Run linter in the current workspace.

### `Go: Vet Current Package`

Run go vet in the package of the current file.

### `Go: Vet Workspace`

Run go vet in the current workspace.

### `Go: Build Current Package`

Build the package of the current file.

### `Go: Build Workspace`

Build the current workspace.

### `Go: Install Current Package`

Install the current package.

### `Go: Initialize go.mod`

Run `go mod init` in the workspace folder.

### `Go: Cancel Running Tests`

Cancels running tests.

### `Go: Apply Cover Profile`

Applies existing cover profile.

### `Go: Restart Language Server`

Restart the running instance of the language server

### `Go: Choose Go Environment`

Choose a different Go version or binary for this project. (WIP)

### `Go: Show Survey Configuration`

Show the current Go survey configuration

### `Go: Reset Survey Configuration`

Reset the current Go survey configuration history

### `Go: Reset Workspace State`

Reset keys in workspace state to undefined.

### `Go: Reset Global State`

Reset keys in global state to undefined.

### `Go Explorer: Refresh`

Refresh the Go explorer. Only available as a menu item in the explorer.

### `Go Explorer: Open File`

Open a file from the Go explorer. Only available as a menu item in the explorer.

### `Go: Edit Workspace Env`

Edit the Go Env for the active workspace.

### `Go: Reset Workspace Env`

Reset the Go Env for the active workspace.
