# Settings and Commands

To view a complete list of the commands and settings for this extension:

1. Navigate to the Extensions view (Ctrl+Shift+X).
2. Find the Go extension, click on it to open the Extension Editor.
3. Click on the `Feature Contributions` tab.
4. Scroll away.

<!--TODO(rstambler): This image needs to be updated.-->
![ext](https://user-images.githubusercontent.com/16890566/30246497-9d6cc588-95b0-11e7-87dd-4bd1b18b139f.gif)

## Settings

You can configure your settings by modifying your [User or Workspace Settings](https://code.visualstudio.com/docs/getstarted/settings). To navigate to your settings, open the Command Palette (Ctrl+Shift+P) and search for "settings". The simplest way to modify your settings is through "Preferences: Open Settings (UI)".

**NOTE: Most of these settings don't apply if you are using [`gopls`](gopls.md). Learn more about `gopls`-specific settings in this [documentation](https://github.com/golang/tools/blob/master/gopls/doc/settings.md).**

A list of popular and notable settings can be found below.

### docsTool

One of `"godoc"`, `"gogetdoc"`, or `"guru"` (`gogetdoc` is the default). This is the tool used by the [go to definition](features.md#go-to-definition), [signature help](features.md#signature-help), and [quick info on hover](features.md#quick-info-on-hover) features. See more information about each of these tools in the [Documentation](tools.md#Documentation) section.

### formatTool

One of `"gofmt"`, `"goimports"`, `"goreturns"`, and `"goformat"` (`goreturns` is the default). This is the tool used by the [formatting and import organization](features.md#formatting-and-import-organization) features. See more information about each of these tools in the [Formatting](tools.md#Formatting) section.

### lintTool

One of `"golint"`, `"staticcheck"`, `"golangci-lint"`, and `"revive"` (`golint` is the default). This is the tool used by the [lint-on-save](features.md#lint-on-save) feature. See more information about each of these tools in the [Diagnostics](tools.md#Diagnostics) section.

### lintFlags

This setting can be used to pass additional flags to your lint tool of choice.

Most linters can be configured via special configuration files, but you may still need to pass command-line flags. The configuration documentation for each supported linter is listed here:

* [`staticcheck`](https://staticcheck.io/docs/#configuration)
* [`golangci-lint`](https://golangci-lint.run/usage/configuration/)
* [`revive`](https://github.com/mgechev/revive#command-line-flags)

#### Examples

Enable all [`golangci-lint`] linters and only show errors in new code:

```json5
"go.lintFlags": ["--enable-all", "--new"]
```

Configure `revive` to exclude `vendor` directories and apply extra configuration with a `config.toml` file:

```json5
"go.lintFlags": [
    "-exclude=vendor/...",
    "-config=${workspaceFolder}/config.toml"
]
```

### Commands

In addition to integrated editing features, the extension also provides several commands in the Command Palette for working with Go files:

* `Go: Add Import` to add an import from the list of packages in your Go context
* `Go: Current GOPATH` to see your currently configured GOPATH
* `Go: Test at cursor` to run a test at the current cursor position in the active document
* `Go: Test Package` to run all tests in the package containing the active document
* `Go: Test File` to run all tests in the current active document
* `Go: Test Previous` to run the previously run test command
* `Go: Test All Packages in Workspace` to run all tests in the current workspace
* `Go: Generate Unit Tests For Package` Generates unit tests for the current package
* `Go: Generate Unit Tests For File` Generates unit tests for the current file
* `Go: Generate Unit Tests For Function` Generates unit tests for the selected function in the current file
* `Go: Install Tools` Installs/updates all the Go tools that the extension depends on
* `Go: Add Tags` Adds configured tags to selected struct fields.
* `Go: Remove Tags` Removes configured tags from selected struct fields.
* `Go: Generate Interface Stubs` Generates method stubs for given interface
* `Go: Fill Struct` Fills struct literal with default values
* `Go: Run on Go Playground` Upload the current selection or file to the Go Playground

You can access all of the above commands from the command palette (`Cmd+Shift+P` or `Ctrl+Shift+P`).

A few of these are available in the editor context menu as an experimental feature as well. To control which of these commands show up in the editor context menu, update the setting `go.editorContextMenuCommands`.

[`golint`]: https://pkg.go.dev/golang.org/x/lint/golint?tab=overview
[`staticcheck`]: https://pkg.go.dev/honnef.co/go/tools/staticcheck?tab=overview
[`golangci-lint`]: https://golangci-lint.run/
[`revive`]: https://pkg.go.dev/github.com/mgechev/revive?tab=overview