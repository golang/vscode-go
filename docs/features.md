# Features

This document describes the features supported by this extension.

If you are using the Go language server, `gopls`, please the [gopls documentation](gopls.md) instead. (You can check if you are using `gopls` by opening your VS Code settings and checking if `go.useLanguageServer` is set to `true`.)

If you are using Go modules without the language server, some of the below features will not be available.

Please see the [Tools](tools.md) documentation for details on how to troubleshoot and adjust your settings.

## Table of Contents

* [IntelliSense](#intellisense)
  * [Code completion](#code-completion)
  * [Signature help](#signature-help)
  * [Quick info on hover](#quick-info-on-hover)
* [Code Navigation](#code-navigation)
  * [Go to definition](#go-to-definition)
  * [Go to symbol](#go-to-symbol)
  * [Find references](#find-references)
  * [Find interface implementations](#find-interface-implementations)
  * [Document outline](#document-outline)
  * [Toggle between code and tests](#toggle-between-code-and-tests)
* [Code Editing](#code-editing)
  * [Snippets](#snippets)
  * [Format and organize imports](#format-and-organize-imports)
    * [Add import](#add-import)
  * [Rename symbol](#rename-symbol)
* [Code Generation](#code-generation)
  * [Add struct tags](#add-struct-tags)
  * [Generate unit tests](#generate-unit-tests)
  * [Generate interface implementation](#generate-interface-implementation)
  * [Fill struct with default values](#fill-struct)
* [Diagnostics](#diagnostics)
  * [Build on save](#build-on-save)
  * [Vet on save](#vet-on-save)
  * [Lint on save](#lint-on-save)
* [Testing](#testing)
  * [Test and benchmark in the editor](#test-and-benchmark-in-the-editor)
  * [Code coverage](#code-coverage)

## [IntelliSense](https://code.visualstudio.com/docs/editor/intellisense)

This extension supports the following IntelliSense features:

### Code completion

Completion results appear for symbols as you type. You can trigger this manually with the Ctrl+Space shortcut. This feature is provided by the [`gocode`](tools.md#gocode) tool.

Autocompletion is also supported for packages you have not imported into your program. This feature is provided by the [`gopkgs`](#tools.md#gopkgs) tool.

### Signature help

Information about the signature of a function pops up as you type in its parameters. This feature is provided by the [`gogetdoc`](tools.md#gogetdoc) tool, but it can also be provided by a combination of [`godef`](tools.md#godef) and [`godoc`](tools.md#godoc) (configured via the [`"go.docsTool"`](commands.md#docs-tool) setting).

### Quick info on hover

Documentation appears when you hover over a symbol. This feature is provided by the [`gogetdoc`](tools.md#gogetdoc) tool, but it can also be provided by a combination of [`godef`](tools.md#godef) and [`godoc`](tools.md#godoc) (configured via the [`"go.docsTool"`](commands.md#docs-tool) setting).

## [Code Navigation](https://code.visualstudio.com/docs/editor/editingevolved)

### Go to definition

Jump to or peek a symbol's declaration. This feature is provided by the [`gogetdoc`](tools.md#gogetdoc) tool, but it can also be provided by a combination of [`godef`](tools.md#godef) and [`godoc`](tools.md#godoc) (configured via the [`"go.docsTool"`](commands.md#docs-tool) setting).

### Find references

Find or go to the references of a symbol. This feature is provided the [`guru`](tools.md#guru) tool.

This feature is not available if you are using Go modules without `gopls`, the Go language server.

### Find interface implementations

Find the concrete types that implement a given interface. This feature is provided by the [`guru`](tools.md#guru) tool.

This feature is not available if you are using Go modules without `gopls`, the Go language server.

### [Go to symbol](https://code.visualstudio.com/docs/editor/editingevolved#_go-to-symbol)

Search for symbols in your file or workspace by opening the Command Palette (Ctrl+Shift+P) and typing `@` for symbols in the current file or `#` for symbols in the entire workspace.

This feature is provided by the [`go-outline`](tools.md#go-outline) and [`go-symbols`](tools.md#go-symbols) tools.

### Document outline

See all the symbols in the current file in the VS Code's [Outline view](https://code.visualstudio.com/docs/getstarted/userinterface#_outline-view).

This feature is provided by the [`go-outline`](tools.md#go-outline) tool.

### Toggle between code and tests

Quickly toggle between a file and its corresponding test file by using the "Go: Toggle Test File" command.

## Code Editing

### [Snippets](https://code.visualstudio.com/docs/editor/userdefinedsnippets)

Predefined snippets for quick coding. These snippets will pop up as completion suggestions as you type. Users can also define their own custom snippets (see [these instructions](https://code.visualstudio.com/docs/editor/userdefinedsnippets#_create-your-own-snippets)).

### Format and organize imports

Format code and organize imports, either manually or on save. The code is formatted by the [`gofmt`](tools.md#gofmt) tool, which is the standard for Go code. Imports are added automatically to your file via the [`goimports`](tools.md#goimports) tool, which is also an industry standard. By default, this extension also uses the [`goreturns`](tools.md#goreturns) tool, which automatically fills in default return values for functions.

The behavior of the formatter can be configured via the [`"go.formatTool"`](#commands#format-tool) tool setting. Formatting can also be turned off by adding the following setting to your `settings.json` file:

```json5
"[go]": {
    "editor.formatOnSave": false
}
```

#### Add import to file (Go: Add Import)

Manually add a new import to your file through the `Go: Add Import` command.

### [Rename symbol](https://code.visualstudio.com/docs/editor/refactoring#_rename-symbol)

Rename all occurrences of a symbol in your workspace. This feature is provided by the [`gorename`](tools.md#gorename) tool.

This feature is not available if you are using Go modules without `gopls`, the Go language server.

## Code Generation

### Add or remove tags on struct fields

Use the `Go: Add Tags to Struct Fields` command to automatically generate [tags](https://pkg.go.dev/reflect?tab=doc#StructTag) for your struct. This feature is provided by the [`gomodifytags`](tools.md#gomodifytags) tool.

### Generate method stubs for interfaces

Use the `Go: Generate Interface Stubs` command to automatically generate method stubs for a given interface. This feature is provided by the [`impl`](tools.md#impl) tool.

### Fill struct literals

Use the `Go: Fill struct` command to automatically fill a struct literal with its default values. This command is provided by the [`fillstruct`](tools.md#fillstruct).

## Diagnostics

### Build errors

Build errors can be shown as you type or on save. Configure this behavior through the [`"go.buildOnSave"`](commands.md#buildOnSave) setting.

By default, code is compiled using the `go` command (`go build`), but build errors as you type are provided by the [`gotype-live`](tools.md#gotype-live) tool.

### Vet errors on save

Vet errors can be shown on save. The vet-on-save behavior can also be configured through the [`"go.vetOnSave"`](commands.md#vetOnSave) setting.

The vet tool used is the one provided by the `go` command: `go vet`.

### Lint errors on save

Much like vet errors, lint errors can also be shown on save. This behavior is configurable through the [`"go.lintOnSave"`](commands.md#lintOnSave) setting.

The default lint tool is the one provided by the `go` command: `go lint`. However, custom lint tools can be easily used instead by configuring the [`"go.lintTool"`](tools.md#lintTool) setting.

## Testing

### Test and benchmark in the editor

[Code lenses](https://code.visualstudio.com/blogs/2017/02/12/code-lens-roundup) allow users to easily run tests and benchmarks for a given function, file, package, or workspace. Alternatively, the same functionality is available through a set of commands: `"Go: Test Function At Cursor"`, `"Go: Test File"`, `"Go: Test Package"`, and `"Go: Test All Packages in Workspace"`.

### Code Coverage

Show code coverage in the editor, either after running a test or on-demand. This can be done via the commands: `"Go: Apply Cover Profile"` and `"Go: Toggle Test Coverage in Current Package"`.
