# Settings

This extension is highly configurable, and as such, offers a number of settings. These can be configured by modifying your [User or Workspace Settings](https://code.visualstudio.com/docs/getstarted/settings).

To navigate to your settings, open the Command Palette (Ctrl+Shift+P) and search for "settings". The simplest way to modify your settings is through "Preferences: Open Settings (UI)".

**NOTE: Many of these settings don't apply if you are using [`gopls`](gopls.md). Learn more about [`gopls`-specific settings](gopls.md#ignored-settings).**

## Latest changes

The settings described below are up-to-date as of June 2020. We do our best to keep documentation current, but if a setting is missing, you can always consult the full list in the Extensions view. Documentation for each setting should also be visible in the Settings UI.

To view the list of settings:

1. Navigate to the Extensions view (Ctrl+Shift+X).
2. Find the Go extension and click on it to open the Extension Editor.
3. Click on the `Feature Contributions` tab.
4. Scroll through the list under `Settings`.

## Detailed list

<!-- Everything below this line is generated. DO NOT EDIT. -->

### `go.addTags`

Tags and options configured here will be used by the Add Tags command to add tags to struct fields. If promptForTags is true, then user will be prompted for tags and options. By default, json tags are added.

### `go.alternateTools`

Alternate tools or alternate paths for the same tools used by the Go extension. Provide either absolute path or the name of the binary in GOPATH/bin, GOROOT/bin or PATH. Useful when you want to use wrapper script for the Go tools or versioned tools from https://gopkg.in.

### `go.autocompleteUnimportedPackages`

Include unimported packages in auto-complete suggestions.

### `go.buildFlags`

Flags to `go build`/`go test` used during build-on-save or running tests. (e.g. ["-ldflags='-s'"])

### `go.buildOnSave`

Compiles code on file save using 'go build -i' or 'go test -c -i'. Options are 'workspace', 'package', or 'off'.

### `go.buildTags`

The Go build tags to use for all commands, that support a `-tags '...'` argument. When running tests, go.testTags will be used instead if it was set.

### `go.coverOnSave`

If true, runs 'go test -coverprofile' on save and shows test coverage.

### `go.coverOnSingleTest`

If true, shows test coverage when Go: Test Function at cursor command is run.

### `go.coverOnSingleTestFile`

If true, shows test coverage when Go: Test Single File command is run.

### `go.coverOnTestPackage`

If true, shows test coverage when Go: Test Package command is run.

### `go.coverageDecorator`

This option lets you choose the way to display code coverage. Choose either to highlight the complete line or to show a decorator in the gutter. You can customize the color for the former and the style for the latter.

### `go.coverageOptions`

Use these options to control whether only covered or only uncovered code or both should be highlighted after running test coverage

### `go.delveConfig`

Delve settings that applies to all debugging sessions. Debug configuration in the launch.json file will override these values.

### `go.docsTool`

Pick 'godoc' or 'gogetdoc' to get documentation. Not applicable when using the language server.

### `go.editorContextMenuCommands`

Experimental Feature: Enable/Disable entries from the context menu in the editor.

### `go.enableCodeLens`

Feature level setting to enable/disable code lens for references and run/debug tests

### `go.formatFlags`

Flags to pass to format tool (e.g. ["-s"])

### `go.formatTool`

Pick 'gofmt', 'goimports', 'goreturns' or 'goformat' to run on format. Not applicable when using the language server. Choosing 'goimports' or 'goreturns' will add missing imports and remove unused imports.

### `go.generateTestsFlags`

Additional command line flags to pass to `gotests` for generating tests.

### `go.gocodeAutoBuild`

Enable gocode's autobuild feature. Not applicable when using the language server.

### `go.gocodeFlags`

Additional flags to pass to gocode. Not applicable when using the language server.

### `go.gocodePackageLookupMode`

Used to determine the Go package lookup rules for completions by gocode. Only applies when using nsf/gocode. Latest versions of the Go extension uses mdempsky/gocode by default. Not applicable when using the language server.

### `go.gopath`

Specify GOPATH here to override the one that is set as environment variable. The inferred GOPATH from workspace root overrides this, if go.inferGopath is set to true.

### `go.goroot`

Specifies the GOROOT to use when no environment variable is set.

### `go.gotoSymbol.ignoreFolders`

Folder names (not paths) to ignore while using Go to Symbol in Workspace feature

### `go.gotoSymbol.includeGoroot`

If false, the standard library located at $GOROOT will be excluded while using the Go to Symbol in File feature

### `go.gotoSymbol.includeImports`

If false, the import statements will be excluded while using the Go to Symbol in File feature

### `go.inferGopath`

Infer GOPATH from the workspace root.

### `go.installDependenciesWhenBuilding`

If true, then `-i` flag will be passed to `go build` everytime the code is compiled.

### `go.languageServerExperimentalFeatures`

Use this setting to enable/disable experimental features from the language server.

### `go.languageServerFlags`

Flags like -rpc.trace and -logfile to be used while running the language server.

### `go.lintFlags`

Flags to pass to Lint tool (e.g. ["-min_confidence=.8"])

### `go.lintOnSave`

Lints code on file save using the configured Lint tool. Options are 'file', 'package', 'workspace' or 'off'.

### `go.lintTool`

Specifies Lint tool name.

### `go.liveErrors`

Use gotype on the file currently being edited and report any semantic or syntactic errors found after configured delay.

### `go.playground`



### `go.removeTags`

Tags and options configured here will be used by the Remove Tags command to remove tags to struct fields. If promptForTags is true, then user will be prompted for tags and options. By default, all tags and options will be removed.

### `go.testEnvFile`

Absolute path to a file containing environment variables definitions. File contents should be of the form key=value.

### `go.testEnvVars`

Environment variables that will passed to the process that runs the Go tests

### `go.testFlags`

Flags to pass to `go test`. If null, then buildFlags will be used.

### `go.testOnSave`

Run 'go test' on save for current package. It is not advised to set this to `true` when you have Auto Save enabled.

### `go.testTags`

The Go build tags to use for when running tests. If null, then buildTags will be used.

### `go.testTimeout`

Specifies the timeout for go test in ParseDuration format.

### `go.toolsEnvVars`

Environment variables that will passed to the processes that run the Go tools (e.g. CGO_CFLAGS)

### `go.toolsGopath`

Location to install the Go tools that the extension depends on if you don't want them in your GOPATH.

### `go.trace.server`

Trace the communication between VS Code and the Go language server.

### `go.useCodeSnippetsOnFunctionSuggest`

Complete functions with their parameter signature, including the variable types

### `go.useCodeSnippetsOnFunctionSuggestWithoutType`

Complete functions with their parameter signature, excluding the variable types

### `go.useGoProxyToCheckForToolUpdates`

When enabled, the extension automatically checks the Go proxy if there are updates available for the Go tools (at present, only gopls) it depends on and prompts the user accordingly

### `go.useLanguageServer`

Use the Go language server "gopls" from Google for powering language features like code navigation, completion, formatting & diagnostics.

### `go.vetFlags`

Flags to pass to `go tool vet` (e.g. ["-all", "-shadow"])

### `go.vetOnSave`

Vets code on file save using 'go tool vet'. Options are 'workspace', 'package or 'off'.
