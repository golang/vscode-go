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

Below is a detailed list of commands. They are categorized into [code editing and generation](#code-editing-and-generation), [testing and benchmarking](#testing-and-benchmarking), [build, lint, and vet](#build-lint-and-vet), [miscellaneous](#miscellaneous), and [troubleshooting](#troubleshooting). You will find the [troubleshooting](#troubleshooting) commands helpful when diagnosing an issue with the extension (learn more in the [Troubleshooting documentation](troubleshooting.md)).

### Code editing and generation

<!--Note: Try to keep this list in roughly alphabetical/logical order.-->

#### [`Go: Add Import`](features.md#add-import)

<!--TODO(rstambler): Confirm exactly how this works.-->
Manually add an import to your file. See [Add import](features.md#add-import).

#### [`Go: Add Package to Workspace`]()

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

#### [`Go: Extract to function`]()

#### [`Go: Extract to variable`]()

### Testing and benchmarking

#### [`Go: Test Function at Cursor`](features.md#test-and-benchmark-in-the-editor)

Run the test function at the current cursor position in the file.

#### [`Go: Subtest at Cursor`]()

#### [`Go: Benchmark Function At Cursor`]()

#### [`Go: Debug Test At Cursor`]()

#### [`Go: Test File`](features.md#test-and-benchmark-in-the-editor)

Run all of the tests in the current file.

#### [`Go: Benchmark File`]()

#### [`Go: Test Package`](features.md#test-and-benchmark-in-the-editor)

Run all of tests in the current package.

#### [`Go: Benchmark Package`]()

#### [`Go: Test Previous`](features.md#test-and-benchmark-in-the-editor)

Re-run the most recently executed test command.

#### [`Go: Test All Packages In Workspace`](features.md#test-and-benchmark-in-the-editor)

Run all of the tests in the current workspace.

#### [`Go: Cancel Running Tests]()

#### [`Go: Toggle Test File`]()

#### [`Go: Apply Cover Profile]()

#### [`Go: Toggle Test Coverage In Current Package`]()

### Build, lint, and vet

#### [`Go: Build Current Package`]()

#### [`Go: Lint Current Package`]()

#### [`Go: Vet Current Package`]()

#### [`Go: Build Workspace`]()

#### [`Go: Lint Workspace`]()

#### [`Go: Vet Workspace`]()

#### [`Go: Install Current Package`]()

### Miscellaneous

#### [`Go: Restart Language Server`]()

#### [`Go: Run on Go Playground`](features.md#go-playground)

Upload the current selection or file to the Go Playground ([play.golang.org](https://play.golang.org)). See [Go Playground](features.md#go-playground).

### Troubleshooting

#### `Go: Current GOPATH`

See the current value of GOPATH. This is not equivalent to `go env GOPATH`, as your VS Code settings may have altered the value of `GOPATH` used by the extension.

#### [`Go: Install/Update Tools`](tools.md)

Install or update the Go tools on which the extension depends. Tools can be installed or updated all at once, or individual tools can be selected.

#### [`Go: Locate Configured Go Tools`]()

[`golint`]: https://pkg.go.dev/golang.org/x/lint/golint?tab=overview
[`staticcheck`]: https://pkg.go.dev/honnef.co/go/tools/staticcheck?tab=overview
[`golangci-lint`]: https://golangci-lint.run/
[`revive`]: https://pkg.go.dev/github.com/mgechev/revive?tab=overview
[`gomodifytags`]: tools.md#gomodifytags
