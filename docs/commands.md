# Commands

In addition to the integrated editing features, this extension offers a number of commands, which can be executed manually through the [Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) (Ctrl+Shift+P).

Some of these commands are also available in the VS Code context menu (right click). To control which of these commands show up in the editor context menu, update the [`"go.editorContextMenuCommands"`](settings.md#editorContextMenuCommands) setting.

All commands provided by this extension have the prefix "`Go:` ".

## Latest changes

The commands described below are up-to-date as of June 2020. We do our best to keep documentation current, but if a command is missing, you can always consult the full list in the Extensions view.

To view this list:

1. Navigate to the Extensions view (Ctrl+Shift+X).
2. Find the Go extension and click on it to open the Extension Editor.
3. Click on the `Feature Contributions` tab.
4. Scroll through the list under `Commands`.

Finally, you can also see a full list by using a meta command: `Go: Show All Commands...`.

## Detailed list

<!--TODO(rstambler): Automatically generate this list using the package.json.-->

Below is a detailed list of commands. They are categorized into [code editing and generation](#code-editing-and-generation), [testing and benchmarking](#testing-and-benchmarking), [build, lint, and vet](#build-lint-and-vet), [miscellaneous](#miscellaneous), and [troubleshooting](#troubleshooting). You will find the [troubleshooting](#troubleshooting) commands helpful when diagnosing an issue with the extension (learn more in the [Troubleshooting documentation](troubleshooting.md)).

### Code editing and generation

<!--Note: Try to keep this list in roughly alphabetical/logical order.-->

#### [`Go: Add Import`](features.md#add-import)

<!--TODO(rstambler): Confirm exactly how this works.-->
Manually add an import to your file. See [Add import](features.md#add-import).

#### [`Go: Add Package to Workspace`]

Add a package to the current workspace.

<!--TODO(rstambler): Figure out how this command works, its use cases, and how it fits into modules.-->

#### [`Go: Add Tags to Struct Fields`](features.md#add-struct-tags)

Automatically generate [tags](https://pkg.go.dev/reflect?tab=doc#StructTag) for your struct. See [Add or remove struct tags](features.md#add-or-remove-struct-tags).

#### [`Go: Remove Tags From Struct Fields`](features.md#add-struct-tags)

Removes [tags](https://pkg.go.dev/reflect?tab=doc#StructTag) from the selected struct fields. See [Add or remove struct tags](features.md#add-or-remove-struct-tags).

#### [`Go: Fill struct`](features.md#fill-struct-literals)

Fill a struct literal with default values. See [Fill struct](features.md#fill-struct-literals).

#### [`Go: Generate Interface Stubs`](features.md#generate-interface-implementation)

Generate method stubs for given interface. See [Generate interface implementation](features.md#generate-interface-implementation).

#### [`Go: Generate Unit Tests For Function`](features.md#generate-unit-tests)

Generate unit tests for the selected function in the current file. See [Generate unit tests](features.md#generate-unit-tests).

#### [`Go: Generate Unit Tests For File`](features.md#generate-unit-tests)

Generate unit tests for the current file. See [Generate unit tests](features.md#generate-unit-tests).

#### [`Go: Generate Unit Tests For Package`](features.md#generate-unit-tests)

Generate unit tests for the current package. See [Generate unit tests](features.md#generate-unit-tests).

#### [`Go: Extract to function`](features.md#refactor)

Extract the highlighted code to a function. Provided by the [`godoctor`](tools.md#godoctor) tool. Learn more about [refactoring](features.md#refactoring).

#### [`Go: Extract to variable`](features.md#refactor)

Extract the highlighted code to a local variable. Provided by the [`godoctor`](tools.md#godoctor) tool. Learn more about [refactoring](features.md#refactoring).

### Testing and benchmarking

#### [`Go: Test Function at Cursor`](features.md#test-and-benchmark-in-the-editor)

Run the test function at the current cursor position in the file.

#### [`Go: Subtest at Cursor`](features.md#test-and-benchmark-in-the-editor)

Run the subtest (`t.Run`) at the current cursor position in the file.

#### [`Go: Benchmark Function At Cursor`](features.md#test-and-benchmark-in-the-editor)

Run the benchmark at the current cursor position in the file.

#### [`Go: Debug Test At Cursor`](features.md#debugging)

Debug the test at the current cursor position.

#### [`Go: Test File`](features.md#test-and-benchmark-in-the-editor)

Run all of the tests in the current file.

#### [`Go: Benchmark File`](features.md#test-and-benchmark-in-the-editor)

Run all of the benchmarks in the current file.

#### [`Go: Test Package`](features.md#test-and-benchmark-in-the-editor)

Run all of the tests in the current package.

#### [`Go: Benchmark Package`](features.md#test-and-benchmark-in-the-editor)

Run all of the benchmarks in the current package.

#### [`Go: Test Previous`](features.md#test-and-benchmark-in-the-editor)

Re-run the most recently executed test command.

#### [`Go: Test All Packages In Workspace`](features.md#test-and-benchmark-in-the-editor)

Run all of the tests in the current workspace.

#### [`Go: Cancel Running Tests`](features.md#test-and-benchmark-in-the-editor)

Cancel currently running tests.

#### [`Go: Toggle Test File`](features.md#toggle-between-code-and-tests)

Toggle between a file and its corresponding test file.

#### [`Go: Apply Cover Profile`](features.md#code-coverage)

Apply a given [cover profile](https://blog.golang.org/cover) to the current file.

#### [`Go: Toggle Test Coverage In Current Package`](features.md#code-coverage)

Show [code coverage](features.md#code-coverage) in the current file.

### Build, lint, and vet

#### [`Go: Build Current Package`](features.md#build-errors)

Build the current package and show build errors.

#### [`Go: Vet Current Package`](features.md#vet-errors)

Show vet errors for the current package.

#### [`Go: Lint Current Package`](features.md#lint-errors)

Show lint errors for the current package.

#### [`Go: Build Workspace`](features.md#build-errors)

Build all of the packages in the current workspace and show build errors.

#### [`Go: Vet Workspace`](features.md#vet-errors)

Show vet errors for all of the packages in the current workspace.

#### [`Go: Lint Workspace`](features.md#lint-errors)

Show lint errors for all of the packages in the current workspace.

#### `Go: Install Current Package`

Install the current package and its dependencies.

### Miscellaneous

#### [`Go: Restart Language Server`](gopls.md)

Use this command to restart the [language server](gopls.md) without reloading the VS Code window. This can be helpful if something seems goes wrong with the language server (for example, if you see incorrect error messages).

#### [`Go: Run on Go Playground`](features.md#go-playground)

Upload the current selection or file to the Go Playground ([play.golang.org](https://play.golang.org)). See [Go Playground](features.md#go-playground).

### Troubleshooting

#### `Go: Current GOPATH`

See the current value of GOPATH. This is not equivalent to `go env GOPATH`, as your VS Code settings may have altered the value of `GOPATH` used by the extension. This command is helpful when [troubleshooting](troubleshooting.md) the extension.

#### [`Go: Install/Update Tools`](tools.md)

Install or update the Go tools on which the extension depends. Tools can be installed or updated all at once, or individual tools can be selected.

#### [`Go: Locate Configured Go Tools`](troubleshooting.md#check-your-set-up)

This command is helpful when [troubleshooting](troubleshooting.md) the extension. It prints out the environment variables and paths to the tools used by the extension. See an example of the command's output in the [troubleshooting documentation](troubleshooting.md#check-your-set-up).

[`golint`]: https://pkg.go.dev/golang.org/x/lint/golint?tab=overview
[`staticcheck`]: https://pkg.go.dev/honnef.co/go/tools/staticcheck?tab=overview
[`golangci-lint`]: https://golangci-lint.run/
[`revive`]: https://pkg.go.dev/github.com/mgechev/revive?tab=overview
[`gomodifytags`]: tools.md#gomodifytags
