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

Default:{<br/>
&nbsp;&nbsp;`"options": "json=omitempty"`,<br/>
&nbsp;&nbsp;`"promptForTags": false`,<br/>
&nbsp;&nbsp;`"tags": "json"`,<br/>
&nbsp;&nbsp;`"template": ""`,<br/>
&nbsp;&nbsp;`"transform": "snakecase"`,<br/>
    }


#### `options`
Comma separated tag=options pairs to be used by Go: Add Tags command

#### `promptForTags`
If true, Go: Add Tags command will prompt the user to provide tags, options, transform values instead of using the configured values

#### `tags`
Comma separated tags to be used by Go: Add Tags command

#### `template`
Custom format used by Go: Add Tags command for the tag value to be applied

#### `transform`
Transformation rule used by Go: Add Tags command to add tags

### `go.alternateTools`

Alternate tools or alternate paths for the same tools used by the Go extension. Provide either absolute path or the name of the binary in GOPATH/bin, GOROOT/bin or PATH. Useful when you want to use wrapper script for the Go tools or versioned tools from https://gopkg.in.

#### `go`
Alternate tool to use instead of the go binary or alternate path to use for the go binary.

#### `go-outline`
Alternate tool to use instead of the go-outline binary or alternate path to use for the go-outline binary.

#### `gocode`
Alternate tool to use instead of the gocode binary or alternate path to use for the gocode binary.

#### `gopkgs`
Alternate tool to use instead of the gopkgs binary or alternate path to use for the gopkgs binary.

#### `gopls`
Alternate tool to use instead of the gopls binary or alternate path to use for the gopls binary.

#### `guru`
Alternate tool to use instead of the guru binary or alternate path to use for the guru binary.

### `go.autocompleteUnimportedPackages`

Include unimported packages in auto-complete suggestions. Not applicable when using the language server.

Default: `false`

### `go.buildFlags`

Flags to `go build`/`go test` used during build-on-save or running tests. (e.g. ["-ldflags='-s'"]) This is propagated to the language server if `gopls.build.buildFlags` is not specified.

### `go.buildOnSave`

Compiles code on file save using 'go build -i' or 'go test -c -i'. Options are 'workspace', 'package', or 'off'.

Allowed Values:`[package workspace off]`

Default: `package`

### `go.buildTags`

The Go build tags to use for all commands, that support a `-tags '...'` argument. When running tests, go.testTags will be used instead if it was set. This is propagated to the language server if `gopls.build.buildFlags` is not specified.

Default: ``

### `go.coverMode`

When generating code coverage, the value for -covermode. 'default' is the default value chosen by the 'go test' command.

Allowed Values:`[default set count atomic]`

Default: `default`

### `go.coverOnSave`

If true, runs 'go test -coverprofile' on save and shows test coverage.

Default: `false`

### `go.coverOnSingleTest`

If true, shows test coverage when Go: Test Function at cursor command is run.

Default: `false`

### `go.coverOnSingleTestFile`

If true, shows test coverage when Go: Test Single File command is run.

Default: `false`

### `go.coverOnTestPackage`

If true, shows test coverage when Go: Test Package command is run.

Default: `true`

### `go.coverShowCounts`

When generating code coverage, should counts be shown as --374--

Default: `false`

### `go.coverageDecorator`

This option lets you choose the way to display code coverage. Choose either to highlight the complete line or to show a decorator in the gutter. You can customize the colors and borders for the former and the style for the latter.

Default:{<br/>
&nbsp;&nbsp;`"coveredBorderColor": "rgba(64,128,128,0.5)"`,<br/>
&nbsp;&nbsp;`"coveredGutterStyle": "blockblue"`,<br/>
&nbsp;&nbsp;`"coveredHighlightColor": "rgba(64,128,128,0.5)"`,<br/>
&nbsp;&nbsp;`"type": "highlight"`,<br/>
&nbsp;&nbsp;`"uncoveredBorderColor": "rgba(128,64,64,0.25)"`,<br/>
&nbsp;&nbsp;`"uncoveredGutterStyle": "slashyellow"`,<br/>
&nbsp;&nbsp;`"uncoveredHighlightColor": "rgba(128,64,64,0.25)"`,<br/>
    }


#### `coveredBorderColor`
Color to use for the border of covered code.

#### `coveredGutterStyle`
Gutter style to indicate covered code.

#### `coveredHighlightColor`
Color in the rgba format to use to highlight covered code.

#### `type`


#### `uncoveredBorderColor`
Color to use for the border of uncovered code.

#### `uncoveredGutterStyle`
Gutter style to indicate covered code.

#### `uncoveredHighlightColor`
Color in the rgba format to use to highlight uncovered code.

### `go.coverageOptions`

Use these options to control whether only covered or only uncovered code or both should be highlighted after running test coverage

Allowed Values:`[showCoveredCodeOnly showUncoveredCodeOnly showBothCoveredAndUncoveredCode]`

Default: `showBothCoveredAndUncoveredCode`

### `go.delveConfig`

Delve settings that applies to all debugging sessions. Debug configuration in the launch.json file will override these values.

Default:{<br/>
&nbsp;&nbsp;`"apiVersion": 2`,<br/>
&nbsp;&nbsp;`"dlvLoadConfig": map[followPointers:true maxArrayValues:64 maxStringLen:64 maxStructFields:-1 maxVariableRecurse:1]`,<br/>
&nbsp;&nbsp;`"showGlobalVariables": false`,<br/>
    }


#### `apiVersion`
Delve Api Version to use. Default value is 2.

#### `dlvLoadConfig`
LoadConfig describes to delve, how to load values from target's memory

#### `showGlobalVariables`
Boolean value to indicate whether global package variables should be shown in the variables pane or not.

### `go.docsTool`

Pick 'godoc' or 'gogetdoc' to get documentation. Not applicable when using the language server.

Allowed Values:`[godoc gogetdoc guru]`

Default: `godoc`

### `go.editorContextMenuCommands`

Experimental Feature: Enable/Disable entries from the context menu in the editor.

Default:{<br/>
&nbsp;&nbsp;`"addImport": true`,<br/>
&nbsp;&nbsp;`"addTags": true`,<br/>
&nbsp;&nbsp;`"benchmarkAtCursor": false`,<br/>
&nbsp;&nbsp;`"debugTestAtCursor": true`,<br/>
&nbsp;&nbsp;`"fillStruct": false`,<br/>
&nbsp;&nbsp;`"generateTestForFile": false`,<br/>
&nbsp;&nbsp;`"generateTestForFunction": true`,<br/>
&nbsp;&nbsp;`"generateTestForPackage": false`,<br/>
&nbsp;&nbsp;`"playground": true`,<br/>
&nbsp;&nbsp;`"removeTags": false`,<br/>
&nbsp;&nbsp;`"testAtCursor": true`,<br/>
&nbsp;&nbsp;`"testCoverage": true`,<br/>
&nbsp;&nbsp;`"testFile": false`,<br/>
&nbsp;&nbsp;`"testPackage": false`,<br/>
&nbsp;&nbsp;`"toggleTestFile": true`,<br/>
    }


#### `addImport`
If true, adds command to import a package to the editor context menu

#### `addTags`
If true, adds command to add configured tags from struct fields to the editor context menu

#### `benchmarkAtCursor`
If true, adds command to benchmark the test under the cursor to the editor context menu

#### `debugTestAtCursor`
If true, adds command to debug the test under the cursor to the editor context menu

#### `fillStruct`
If true, adds command to fill struct literal with default values to the editor context menu

#### `generateTestForFile`
If true, adds command to generate unit tests for current file to the editor context menu

#### `generateTestForFunction`
If true, adds command to generate unit tests for function under the cursor to the editor context menu

#### `generateTestForPackage`
If true, adds command to generate unit tests for currnt package to the editor context menu

#### `playground`
If true, adds command to upload the current file or selection to the Go Playground

#### `removeTags`
If true, adds command to remove configured tags from struct fields to the editor context menu

#### `testAtCursor`
If true, adds command to run the test under the cursor to the editor context menu

#### `testCoverage`
If true, adds command to run test coverage to the editor context menu

#### `testFile`
If true, adds command to run all tests in the current file to the editor context menu

#### `testPackage`
If true, adds command to run all tests in the current package to the editor context menu

#### `toggleTestFile`
If true, adds command to toggle between a Go file and its test file to the editor context menu

### `go.enableCodeLens`

Feature level setting to enable/disable code lens for references and run/debug tests

Default:{<br/>
&nbsp;&nbsp;`"references": false`,<br/>
&nbsp;&nbsp;`"runtest": true`,<br/>
    }


#### `references`
If true, enables the references code lens. Uses guru. Recalculates when there is change to the document followed by scrolling. Unnecessary when using the language server; use the call graph feature instead.

#### `runtest`
If true, enables code lens for running and debugging tests

### `go.formatFlags`

Flags to pass to format tool (e.g. ["-s"]). Not applicable when using the language server.

### `go.formatTool`

Not applicable when using the language server. Choosing 'goimports', 'goreturns', or 'gofumports' will add missing imports and remove unused imports.

Allowed Values:`[gofmt goimports goreturns goformat gofumpt gofumports]`

Default: `goreturns`

### `go.generateTestsFlags`

Additional command line flags to pass to `gotests` for generating tests.

### `go.gocodeAutoBuild`

Enable gocode's autobuild feature. Not applicable when using the language server.

Default: `false`

### `go.gocodeFlags`

Additional flags to pass to gocode. Not applicable when using the language server.

Default: `[-builtin -ignore-case -unimported-packages]`

### `go.gocodePackageLookupMode`

Used to determine the Go package lookup rules for completions by gocode. Only applies when using nsf/gocode. Latest versions of the Go extension uses mdempsky/gocode by default. Not applicable when using the language server.

Allowed Values:`[go gb bzl]`

Default: `go`

### `go.gopath`

Specify GOPATH here to override the one that is set as environment variable. The inferred GOPATH from workspace root overrides this, if go.inferGopath is set to true.

efault: `<nil>`

### `go.goroot`

Specifies the GOROOT to use when no environment variable is set.

efault: `<nil>`

### `go.gotoSymbol.ignoreFolders`

Folder names (not paths) to ignore while using Go to Symbol in Workspace feature. Not applicable when using the language server.

### `go.gotoSymbol.includeGoroot`

If false, the standard library located at $GOROOT will be excluded while using the Go to Symbol in File feature. Not applicable when using the language server.

Default: `false`

### `go.gotoSymbol.includeImports`

If false, the import statements will be excluded while using the Go to Symbol in File feature. Not applicable when using the language server.

Default: `false`

### `go.inferGopath`

Infer GOPATH from the workspace root.

Default: `false`

### `go.installDependenciesWhenBuilding`

If true, then `-i` flag will be passed to `go build` everytime the code is compiled. Since Go 1.10, setting this may be unnecessary unless you are in GOPATH mode and do not use the language server.

Default: `false`

### `go.languageServerFlags`

Flags like -rpc.trace and -logfile to be used while running the language server.

### `go.lintFlags`

Flags to pass to Lint tool (e.g. ["-min_confidence=.8"])

### `go.lintOnSave`

Lints code on file save using the configured Lint tool. Options are 'file', 'package', 'workspace' or 'off'.

Allowed Values:`[file package workspace off]`

Default: `package`

### `go.lintTool`

Specifies Lint tool name.

Allowed Values:`[golint golangci-lint revive staticcheck]`

Default: `golint`

### `go.liveErrors`

Use gotype on the file currently being edited and report any semantic or syntactic errors found after configured delay. Not applicable when using the language server.

Default:{<br/>
&nbsp;&nbsp;`"delay": 500`,<br/>
&nbsp;&nbsp;`"enabled": false`,<br/>
    }


#### `delay`
The number of milliseconds to delay before execution. Resets with each keystroke.

#### `enabled`
If true, runs gotype on the file currently being edited and reports any semantic or syntactic errors found. Disabled when the language server is enabled.

### `go.logging.level`

The logging level the extension logs at, defaults to 'error'

Allowed Values:`[off error info verbose]`

Default: `error`

### `go.overwriteGoplsMiddleware (deprecated)`

This option is deprecated.
This option provides a set of flags which determine if vscode-go should intercept certain commands from gopls. These flags assume the `gopls` settings, which enable codelens from gopls, are also present.

#### `codelens`


#### `default`


### `go.playground`

The flags configured here will be passed through to command `goplay`

Default:{<br/>
&nbsp;&nbsp;`"openbrowser": true`,<br/>
&nbsp;&nbsp;`"run": true`,<br/>
&nbsp;&nbsp;`"share": true`,<br/>
    }


#### `openbrowser`
Whether to open the created Go Playground in the default browser

#### `run`
Whether to run the created Go Playground after creation

#### `share`
Whether to make the created Go Playground shareable

### `go.removeTags`

Tags and options configured here will be used by the Remove Tags command to remove tags to struct fields. If promptForTags is true, then user will be prompted for tags and options. By default, all tags and options will be removed.

Default:{<br/>
&nbsp;&nbsp;`"options": ""`,<br/>
&nbsp;&nbsp;`"promptForTags": false`,<br/>
&nbsp;&nbsp;`"tags": ""`,<br/>
    }


#### `options`
Comma separated tag=options pairs to be used by Go: Remove Tags command

#### `promptForTags`
If true, Go: Remove Tags command will prompt the user to provide tags and options instead of using the configured values

#### `tags`
Comma separated tags to be used by Go: Remove Tags command

### `go.testEnvFile`

Absolute path to a file containing environment variables definitions. File contents should be of the form key=value.

Default: `<nil>`

### `go.testEnvVars`

Environment variables that will passed to the process that runs the Go tests

### `go.testFlags`

Flags to pass to `go test`. If null, then buildFlags will be used. This is not propagated to the language server.

efault: `<nil>`

### `go.testOnSave`

Run 'go test' on save for current package. It is not advised to set this to `true` when you have Auto Save enabled.

Default: `false`

### `go.testTags`

The Go build tags to use for when running tests. If null, then buildTags will be used.

efault: `<nil>`

### `go.testTimeout`

Specifies the timeout for go test in ParseDuration format.

Default: `30s`

### `go.toolsEnvVars`

Environment variables that will passed to the tools that run the Go tools (e.g. CGO_CFLAGS)

### `go.toolsGopath`

Location to install the Go tools that the extension depends on if you don't want them in your GOPATH.

Default: ``

### `go.toolsManagement.checkForUpdates`

Specify whether to prompt about new versions of Go and the Go tools (currently, only `gopls`) the extension depends on

Allowed Values:`[proxy local off]`

Default: `proxy`

### `go.trace.server`

Trace the communication between VS Code and the Go language server.

Allowed Values:`[off messages verbose]`

Default: `off`

### `go.useCodeSnippetsOnFunctionSuggest`

Complete functions with their parameter signature, including the variable type. Not propagated to the language server.

Default: `false`

### `go.useCodeSnippetsOnFunctionSuggestWithoutType`

Complete functions with their parameter signature, excluding the variable types. Use `gopls.usePlaceholders` when using the language server.

Default: `false`

### `go.useGoProxyToCheckForToolUpdates (deprecated)`

Use `go.toolsManagement.checkForUpdates` instead.
When enabled, the extension automatically checks the Go proxy if there are updates available for Go and the Go tools (at present, only gopls) it depends on and prompts the user accordingly

Default: `true`

### `go.useLanguageServer`

Use the Go language server "gopls" from Google for powering language features like code navigation, completion, refactoring, formatting & diagnostics.

Default: `false`

### `go.vetFlags`

Flags to pass to `go tool vet` (e.g. ["-all", "-shadow"])

### `go.vetOnSave`

Vets code on file save using 'go tool vet'. Not applicable when using the language server.

Allowed Values:`[package workspace off]`

Default: `package`

### `gopls`

Configure the default Go language server ('gopls'). In most cases, configuring this section is unnecessary. See [the documentation](https://github.com/golang/tools/blob/master/gopls/doc/settings.md) for all available settings.

#### `build.allowImplicitNetworkAccess`
(Experimental) allowImplicitNetworkAccess disables GOPROXY=off, allowing implicit module
downloads rather than requiring user action. This option will eventually
be removed.


#### `build.allowModfileModifications`
(Experimental) allowModfileModifications disables -mod=readonly, allowing imports from
out-of-scope modules. This option will eventually be removed.


#### `build.buildFlags`
buildFlags is the set of flags passed on to the build system when invoked.
It is applied to queries like `go list`, which is used when discovering files.
The most common use is to set `-tags`.

If unspecified, values of `go.buildFlags, go.buildTags` will be propagated.


#### `build.directoryFilters`
directoryFilters can be used to exclude unwanted directories from the
workspace. By default, all directories are included. Filters are an
operator, `+` to include and `-` to exclude, followed by a path prefix
relative to the workspace folder. They are evaluated in order, and
the last filter that applies to a path controls whether it is included.
The path prefix can be empty, so an initial `-` excludes everything.

Examples:
Exclude node_modules: `-node_modules`
Include only project_a: `-` (exclude everything), `+project_a`
Include only project_a, but not node_modules inside it: `-`, `+project_a`, `-project_a/node_modules`


#### `build.env`
env adds environment variables to external commands run by `gopls`, most notably `go list`.


#### `build.expandWorkspaceToModule`
(Experimental) expandWorkspaceToModule instructs `gopls` to adjust the scope of the
workspace to find the best available module root. `gopls` first looks for
a go.mod file in any parent directory of the workspace folder, expanding
the scope to that directory if it exists. If no viable parent directory is
found, gopls will check if there is exactly one child directory containing
a go.mod file, narrowing the scope to that directory if it exists.


#### `build.experimentalPackageCacheKey`
(Experimental) experimentalPackageCacheKey controls whether to use a coarser cache key
for package type information to increase cache hits. This setting removes
the user's environment, build flags, and working directory from the cache
key, which should be a safe change as all relevant inputs into the type
checking pass are already hashed into the key. This is temporarily guarded
by an experiment because caching behavior is subtle and difficult to
comprehensively test.


#### `build.experimentalWorkspaceModule`
(Experimental) experimentalWorkspaceModule opts a user into the experimental support
for multi-module workspaces.


#### `formatting.gofumpt`
gofumpt indicates if we should run gofumpt formatting.


#### `formatting.local`
local is the equivalent of the `goimports -local` flag, which puts
imports beginning with this string after third-party packages. It should
be the prefix of the import path whose imports should be grouped
separately.


#### `ui.codelenses`
codelenses overrides the enabled/disabled state of code lenses. See the
"Code Lenses" section of the
[Settings page](https://github.com/golang/tools/blob/master/gopls/doc/settings.md)
for the list of supported lenses.

Example Usage:

```json5
"gopls": {
...
  "codelens": {
    "generate": false,  // Don't show the `go generate` lens.
    "gc_details": true  // Show a code lens toggling the display of gc's choices.
  }
...
}
```


#### `ui.completion.completionBudget`
(For Debugging) completionBudget is the soft latency goal for completion requests. Most
requests finish in a couple milliseconds, but in some cases deep
completions can take much longer. As we use up our budget we
dynamically reduce the search scope to ensure we return timely
results. Zero means unlimited.


#### `ui.completion.matcher`
(Advanced) matcher sets the algorithm that is used when calculating completion
candidates.


#### `ui.completion.usePlaceholders`
placeholders enables placeholders for function parameters or struct
fields in completion responses.


#### `ui.diagnostic.analyses`
analyses specify analyses that the user would like to enable or disable.
A map of the names of analysis passes that should be enabled/disabled.
A full list of analyzers that gopls uses can be found
[here](https://github.com/golang/tools/blob/master/gopls/doc/analyzers.md).

Example Usage:

```json5
...
"analyses": {
  "unreachable": false, // Disable the unreachable analyzer.
  "unusedparams": true  // Enable the unusedparams analyzer.
}
...
```


#### `ui.diagnostic.annotations`
(Experimental) annotations specifies the various kinds of optimization diagnostics
that should be reported by the gc_details command.


#### `ui.diagnostic.experimentalDiagnosticsDelay`
(Experimental) experimentalDiagnosticsDelay controls the amount of time that gopls waits
after the most recent file modification before computing deep diagnostics.
Simple diagnostics (parsing and type-checking) are always run immediately
on recently modified packages.

This option must be set to a valid duration string, for example `"250ms"`.


#### `ui.diagnostic.staticcheck`
(Experimental) staticcheck enables additional analyses from staticcheck.io.


#### `ui.documentation.hoverKind`
hoverKind controls the information that appears in the hover text.
SingleLine and Structured are intended for use only by authors of editor plugins.


#### `ui.documentation.linkTarget`
linkTarget controls where documentation links go.
It might be one of:

* `"godoc.org"`
* `"pkg.go.dev"`

If company chooses to use its own `godoc.org`, its address can be used as well.


#### `ui.documentation.linksInHover`
linksInHover toggles the presence of links to documentation in hover.


#### `ui.navigation.importShortcut`
importShortcut specifies whether import statements should link to
documentation or go to definitions.


#### `ui.navigation.symbolMatcher`
(Advanced) symbolMatcher sets the algorithm that is used when finding workspace symbols.


#### `ui.navigation.symbolStyle`
(Advanced) symbolStyle controls how symbols are qualified in symbol responses.

Example Usage:

```json5
"gopls": {
...
  "symbolStyle": "dynamic",
...
}
```


#### `ui.semanticTokens`
(Experimental) semanticTokens controls whether the LSP server will send
semantic tokens to the client.


#### `verboseOutput`
(For Debugging) verboseOutput enables additional debug logging.

