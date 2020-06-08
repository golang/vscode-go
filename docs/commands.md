# Commands

In addition to integrated editing features, this extension offers a number of commands, which can be executed manually through the [Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) (Ctrl+Shift+P).

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

### `Go: Current GOPATH`

See the currently set GOPATH.

### `Go: Locate Configured Go Tools`

List all the Go tools being used by this extension along with their locations.

### `Go: Test Function At Cursor`

Runs a unit test at the cursor.

### `Go: Subtest At Cursor`

Runs a sub test at the cursor.

### `Go: Benchmark Function At Cursor`

Runs a benchmark at the cursor.

### `Go: Debug Test At Cursor`

Debug test at the cursor.

### `Go: Test File`

Runs all unit tests in the current file.

### `Go: Test Package`

Runs all unit tests in the package of the current file.

### `Go: Benchmark Package`

Runs all benchmarks in the package of the current file.

### `Go: Benchmark File`

Runs all benchmarks in the current file.

### `Go: Test All Packages In Workspace`

Runs all unit tests from all packages in the current workspace.

### `Go: Test Previous`

Re-runs the last executed test.

### `Go: Toggle Test Coverage In Current Package`

Displays test coverage in the current package.

### `Go: Generate Unit Tests For Package`

Generates unit tests for the current package

### `Go: Generate Unit Tests For File`

Generates unit tests for the current file

### `Go: Generate Unit Tests For Function`

Generates unit tests for the selected function in the current file

### `Go: Generate Interface Stubs`

Generates method stub for implementing the provided interface and inserts at the cursor.

### `Go: Add Import`

Add an import declaration

### `Go: Add Package to Workspace`

Add a package from the imports list to the workspace.

### `Go: Install/Update Tools`

install/update the required go packages

### `Go: Toggle Test File`

Toggles between file in current active editor and the corresponding test file.

### `Go: Add Tags To Struct Fields`

Add tags configured in go.addTags setting to selected struct using gomodifytags

### `Go: Remove Tags From Struct Fields`

Remove tags configured in go.removeTags setting from selected struct using gomodifytags

### `Go: Fill struct`

Fill a struct literal with default values

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

### `Go: Cancel Running Tests`

Cancels running tests.

### `Go: Apply Cover Profile`

Applies existing cover profile.

### `Go: Extract to function`

Extract to function using godoctor.

### `Go: Extract to variable`

Extract to variable using godoctor.

### `Go: Restart Language Server`

Restart the running instance of the language server
