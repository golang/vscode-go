# Features

This document describes the features supported by this extension.

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
* [Syntax Highlighting](#syntax-highlighting)
* [Inlay Hints](#inlay-hints)
* [Code Editing](#code-editing)
  * [Snippets](#snippets)
  * [Format and organize imports](#format-and-organize-imports)
    * [Add import](#add-import)
  * [Rename symbol](#rename-symbol)
  * [Refactor](#refactor)
* [Code Generation](#code-generation)
  * [Add or remove struct tags](#add-or-remove-struct-tags)
  * [Generate interface implementation](#generate-interface-implementation)
  * [Generate unit tests](#generate-unit-tests)
  * [Fill struct literals](#fill-struct-literals)
* [Diagnostics](#diagnostics)
  * [Build errors](#build-errors)
  * [Vet and extra analyses](#vet-and-extra-analyses)
  * [Lint errors](#lint-errors)
  * [Vulnerabilities in dependencies](#analyze-vulnerabilities-in-dependencies)
* [Code Lenses](#code-lenses)
* [Run and test in the editor](#run-and-test-in-the-editor)
  * [Run your code](#run-your-code)
  * [Test and benchmark](#test-and-benchmark)
  * [Code coverage](#code-coverage)
  * [Profiling](#profiling)
* [Debug your code](#debugging)
* [Other](#other)
  * [Go Playground](#go-playground)

## [IntelliSense](https://code.visualstudio.com/docs/editor/intellisense)

### Code completion

Completion results appear for symbols as you type. You can trigger this manually with the Ctrl+Space shortcut.

Autocompletion is also supported for packages you have not yet imported into your program.

<div style="text-align: center;"><img src="images/completion-signature-help.gif" alt="Code completion and signature help"  style="width: 75%"> </div>

### Signature help

Information about the signature of a function pops up as you type in its parameters.
### Quick info on hover

Documentation appears when you hover over a symbol.

## [Code Navigation](https://code.visualstudio.com/docs/editor/editingevolved)

### Go to definition

Jump to or peek a symbol's declaration.

<div style="text-align: center;"><img src="images/gotodefinition.gif" alt="Go to definition using the context menu" style="width: 75%"> </div>

### Find references

Find or go to the references of a symbol.

This feature is not available if you are using Go modules **without** [`gopls`](gopls.md), the Go language server.

<div style="text-align: center;"><img src="images/findallreferences.gif" alt="Find references using the context menu" style="width: 75%"> </div>

### Find interface implementations

Find the concrete types that implement a given interface.

This feature is not available if you are using Go modules **without** [`gopls`](gopls.md), the Go language server.

<div style="text-align: center;"><img src="images/implementations.gif" alt="Go to implementations for Server that implements http.Handler and then finds all implementations of http.Handler in the workspace" style="width: 75%"> </div>

### [Go to symbol](https://code.visualstudio.com/docs/editor/editingevolved#_go-to-symbol)

Search for symbols in your file or workspace by opening the Command Palette (Ctrl+Shift+P) and typing `@` for symbols in the current file or `#` for symbols in the entire workspace.

<div style="text-align: center;"><img src="images/workspace-symbols.gif" alt="Use Workspace Symbols to locate Hello in the workspace" style="width: 75%"> </div>

### Call hierarchy

Show all calls from or to a function.

<div style="text-align: center;"><img src="images/callhierarchy.gif" alt="Show call hierarchy and investigate callers of a function" style="width: 75%"> </div>

### Document outline

See all the symbols in the current file in the VS Code's [Outline view](https://code.visualstudio.com/docs/getstarted/userinterface#_outline-view).

<div style="text-align: center;"><img src="images/outline.png" alt="Outline of a Go file" style="width: 75%"> </div>

### Toggle between code and tests

Quickly toggle between a file and its corresponding test file by using the [`Go: Toggle Test File`](commands.md#go-toggle-test-file) command.

<div style="text-align: center;"><img src="images/toggletestfile.gif" alt="Toggle between reverse.go and reverse_test.go" style="width: 75%"> </div>

## Syntax Highlighting

The default syntax highlighting for Go files is implemented in Visual Studio Code using TextMate grammar, not by this extension.

If you are using `gopls`, you can enable [Semantic Highlighting](https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide) for more accurate syntax highlighting based on semantic tokenization using this setting:

```
"gopls": {
  "ui.semanticTokens": true,

  // you can optionally turn on these features for more colors
  // see https://go.dev/issue/45753 and https://go.dev/issue/45792 
  "ui.noSemanticString": true,  // delegates string syntax highlighting to vscode
  "ui.noSemanticNumber": true,  // delegates number syntax highlighting to vscode
}
```

### Go template syntax highlighting

When `gopls`'s semantic tokens feature is enabled, `gopls` also provides semantic tokens for Go template files (language identifier: `gotmpl`). By default, the extension associates all `*.tmpl` or `*.gotmpl` files in the workspace with `gotmpl` language. Users can override the language mode by using Visual Studio Code's UI or the `"files.associations"` setting. See [Visual Studio Code's doc](https://code.visualstudio.com/docs/languages/overview#_changing-the-language-for-the-selected-file) for more details.

<div style="text-align: center;"><img src="images/gotmpl.gif" alt="Enable Go template language support by changing the language ID" style="width: 75%"> </div>

## Inlay Hints

Inlay hints render additional inline information to source code to help you understand what the code does.
They can be enabled/disabled with the `editor.inlayHints.enabled` setting in combination with `go.inlayHints` [settings](settings.md#go.inlayHints.assignVariableTypes) to enable inlay hints types.

### Variable types in assign statements

```go
	i/* int*/, j/* int*/ := 0, len(r)-1
```

### Variable types in range statements
```go
	for k/* int*/, v/* string*/ := range []string{} {
		fmt.Println(k, v)
	}
```
### Composite literal field names
```go
	{/*in: */"Hello, world", /*want: */"dlrow ,olleH"}
```

### Composite literal types
```go
	for _, c := range []struct {
		in, want string
	}{
		/*struct{ in string; want string }*/{"Hello, world", "dlrow ,olleH"},
	}
```
### Constant values
```go
	const (
		KindNone   Kind = iota/* = 0*/
		KindPrint/*  = 1*/
		KindPrintf/* = 2*/
		KindErrorf/* = 3*/
	)
```
### Function type parameters
```go
	myFoo/*[int, string]*/(1, "hello")
```

### Parameter names
```go
	parseInt(/* str: */ "123", /* radix: */ 8)
```

## Code Editing

### [Snippets](https://code.visualstudio.com/docs/editor/userdefinedsnippets)

Predefined snippets for quick coding. These snippets will appear as completion suggestions when you type. Users can also define their own custom snippets (see [Snippets in Visual Studio Code](https://code.visualstudio.com/docs/editor/userdefinedsnippets#_create-your-own-snippets)).

<div style="text-align: center;"><img src="images/snippets-tys.gif" alt="Use the struct type snippet" style="width: 75%"> </div>

### Format and organize imports

Format code and organize imports, either manually or on save.

The extension formats Go code, organizes imports, and removes unused imports by default. For different behavior, please override per-language default settings following [the instruction](advanced.md#formatting-code-and-organizing-imports).

When organizing imports, the imported packages are grouped in the default `goimports` style. In order to group some packages after 3rd-party packages, use [`"gopls": { "formatting.local": <comma-separated imports prefix>}`](settings.md#formattinglocal).

#### Add import

The extension organizes imports automatically and can add missing imports if the package is present in your module cache already. However, you can also manually add a new import to your file through the [`Go: Add Import`](commands.md#go-add-import) command. Available packages are offered from module cache (or from your `GOPATH` in GOPATH mode).

<div style="text-align: center;"><img src="images/addimport.gif" alt="Add byte import to Go file" style="width: 75%"> </div>

#### Custom formatter

In addition to the default `gofmt`-style formatter, the Go language server supports `gofumpt`-style formatting. You can enable `gofumpt` formatting by setting `"gopls.formatting.gofumpt"`.
You can  also configure to use other custom formatter by using the `"go.formatTool"` setting. The custom formatter must operate on file contents from STDIN, and output the formatted result to STDOUT.

### [Rename symbol](https://code.visualstudio.com/docs/editor/refactoring#_rename-symbol)

Rename all occurrences of a symbol in your workspace.

**Note**: For undo after rename to work on Windows, you need to have `diff` tool on your `PATH`.

This feature is not available if you are using Go modules **without** [`gopls`](gopls.md), the Go language server.

<div style="text-align: center;"><img src="images/rename.gif" alt="Rename an exported variable in Go workspace" style="width: 75%"> </div>


### Refactor

Select the area for refactoring (e.g. variable, function body, etc). Click on the Code Action light bulb icon
that appears in the selected area, or select "Refactoring..." or "Rename Symbol" from the VS Code Context menu.
For known issues with this feature see [golang/go#37170](https://github.com/golang/go/issues/37170).

<div style="text-align: center;"><img src="images/extract-variable.gif" alt="Extract to variable followed by a rename" style="width: 75%"> </div>

## Code Generation

### Add or remove struct tags

Use the [`Go: Add Tags to Struct Fields`](commands.md#go-add-tags-to-struct-fields) command to automatically generate or remove [tags](https://pkg.go.dev/reflect?tab=doc#StructTag) for your struct. This feature is provided by the [`gomodifytags`](tools.md#gomodifytags) tool.

<div style="text-align: center;"><img src="images/addtagstostructfields.gif" alt="Add tags to struct fields" style="width: 75%"> </div>

### Generate interface implementation

Use the [`Go: Generate Interface Stubs`](commands.md#go-generate-interface-stubs) command to automatically generate method stubs for a given interface. This feature is provided by the [`impl`](tools.md#impl) tool.

<div style="text-align: center;"><img src="images/generateinterfaceimplementation.gif" alt="Generate functions to implement an interface" style="width: 75%"> </div>

### Generate unit tests

Easily generate unit tests for your project by running one of the [`Go: Generate Unit Tests for ...`](commands.md#go-generate-unit-tests-for-file) commands. This can be done at a function, file, or package level. This feature is provided by the [`gotests`](tools.md#gotests) tool.

<div style="text-align: center;"><img src="images/generateunittestsforfunction.gif" alt="Generate unit tests for a function" style="width: 75%"> </div>

### Fill struct literals

Use the [Code Action](https://code.visualstudio.com/docs/editor/refactoring#_code-actions-quick-fixes-and-refactorings) to automatically fill a struct literal with its default values. The Go language server provides this capability as a `refactor.rewrite` type code action.

<div style="text-align: center;"><img src="images/fillstruct.png" alt="Fill struct literals"> </div>

  **Note**: The old "Go: Fill struct" command was removed in v0.40.0 in favor of the Code Action.

## Diagnostics 

The extension, powered by the Go language server (`gopls`), offers various diagnostics and analyses features,
and often with quick fixes to address detected issues.

### Build errors

Compile and type errors are shown as you type by default. This works not only Go source code, but also `go.mod`, `go.work`, and Go template files.

### Vet and extra analyses

The Go language server (`gopls`) reports [`vet`](https://pkg.go.dev/cmd/vet) errors and runs many useful analyzers as you type. A full list of analyzers that `gopls` uses can be found in the [analyses  settings section](https://github.com/golang/vscode-go/wiki/settings#uidiagnosticanalyses).

### Lint errors

You can configure an extra linter to run on file save. This behavior is configurable through the [`"go.lintOnSave"`](settings.md#go.lintOnSave) setting.

The default lint tool is [`staticcheck`]. Popular alternative linters such as [`golint`], [`golangci-lint`] and [`revive`] can be used instead by configuring the [`"go.lintTool"`](settings.md#go.lintTool) setting. For a complete overview of linter options, see the [documentation for diagnostic tools](tools.md#diagnostics).

### Analyze vulnerabilities in dependencies

The extension checks the 3rd party dependencies in your code and surfaces vulnerabilities known to the [Go vulnerability database](https://vuln.go.dev). There are two modes that complement each other.

* Import-based analysis: this can be enabled using the [`"go.diagnostic.vulncheck": "Imports"`](settings.md#go.diagnostic.vulncheck) setting. You can turn on and off this analysis conveniently with the ["Go: Toggle Vulncheck"](commands.md#go-toggle-vulncheck) command. In this mode, `gopls` reports vulnerabilities that affect packages directly and indirectly used by your code. The diagnostics are reported in the `go.mod` file along with quick fixes to help upgrading vulnerable modules.

* `Govulncheck` analysis: this is based on the [`golang.org/x/vuln/cmd/govulncheck`](https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck) tool, which is embedded in `gopls`. This provides a low-noise, reliable way to inspect known vulnerabilities. This only surfaces vulnerabilities that actually affect your code, based on which functions in your code are transitively calling vulnerable functions. This can be accessible by the `gopls` [`run_govulncheck`](settings.md#uicodelenses) code lens. The import-based analysis result also provides the `"Run govulncheck to verify"` option as a quick fix. 

<div style="text-align: center;"><img src="images/vulncheck.gif" alt="Vulncheck">
<em>Go: Toggle Vulncheck</em> <a href="https://user-images.githubusercontent.com/4999471/206977512-a821107d-9ffb-4456-9b27-6a6a4f900ba6.mp4">(vulncheck.mp4)</a> </div>

These features require _`gopls` v0.11.0 or newer_.

Please share your feedback at https://go.dev/s/vsc-vulncheck-feedback.
Report a bug and feature request in [our issue tracker](https://github.com/golang/vscode-go/issues/new).

**Notes and Caveats**

- The import-based analysis uses the list of packages in the workspace modules, which may be different from what you see from `go.mod` files if `go.work` or module `replace`/`exclude` is used.
- The govulncheck analysis result can become stale as you modify code or the Go vulnerability database is updated. In order to invalidate the analysis results manually, use the [`"Reset go.mod diagnostics"`] codelens shown on the top of the `go.mod` file. Otherwise, the result will be automatically invalidated after an hour.
- These features currently don't report vulnerabilities in the standard libraries or tool chains. We are still investigating UX on where to surface the findings and how to help users handle the issues.
- The extension does not scan private packages nor send any information on private modules. All the analysis is done by pulling a list of known vulnerable modules from the Go vulnerability database and then computing the intersection locally.

## Run and test in the editor

### Run your code

To run your code without debugging, use the keyboard shortcut `Ctrl+F5` or run the command `Debug: Start without Debugging`. To debug, see [Debugging](#debugging) below.

This command requires you to have a [launch configuration](debugging.md#launch-configuration) in a `launch.json` file. To open or create your `launch.json`, run the `Debug: Open launch.json` command. Use the default `Go: Launch file` configuration.

Behind the scenes, the `Debug: Start without Debugging` command calls `go run`. `go run` usually requires the path to the file to run, so your `launch.json` should contain `"program": "${file}"`.

### Test and benchmark

[Test UI](https://code.visualstudio.com/api/extension-guides/testing) and [Code lenses](https://code.visualstudio.com/blogs/2017/02/12/code-lens-roundup) allow users to easily run tests, benchmarks, and profiles for a given function, file, package, or workspace.

Alternatively, the same functionality is available through a set of commands: [`Go: Test Function At Cursor`](commands.md#go-test-function-at-cursor), [`Go: Test File`](commands.md#go-test-file), [`Go: Test Package`](commands.md#go-test-package), and [`Go: Test All Packages in Workspace`](commands.md#go-test-all-packages-in-workspace).

<div style="text-align: center;"><img src="images/testexplorer.gif" alt="Testing UI" style="width: 75%"> </div>

### Code Coverage

Show code coverage in the editor, either after running a test or on-demand. This can be done via the commands: [`Go: Apply Cover Profile`](commands.md#go-apply-cover-profile) and [`Go: Toggle Test Coverage in Current Package`](commands.md#go-toggle-test-coverage-in-current-package).

### Profiling

"Go Test: Profile" menu in [Test UI](https://code.visualstudio.com/api/extension-guides/testing) collects CPU/Memory/Mutex profiles and allows visualizing them using pprof (`go tool pprof`).

<div style="text-align: center;"><img src="images/testexplorer-pprof.gif" alt="Profiling" style="width: 75%"> </div>

## [Debugging](debugging.md)

This extension offers debugging of Go programs. See the [debugging documentation](debugging.md) for more information.

## Other

### Go Playground

Export your current file to the [Go Playground](https://play.golang.org) via the [`Go: Run On Go Playground`](settings.md#go-run-on-go-playground) command. This is useful for quickly creating a piece of sample code.

[`gopls`]: gopls.md
[`staticcheck`]: https://staticcheck.io/
[`golint`]: https://pkg.go.dev/golang.org/x/lint/golint?tab=overview
[`golangci-lint`]: https://golangci-lint.run/
[`revive`]: https://github.com/mgechev/revive
