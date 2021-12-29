# Settings

This extension is highly configurable, and as such, offers a number of settings. These can be configured by modifying your [User or Workspace Settings](https://code.visualstudio.com/docs/getstarted/settings).

To navigate to your settings, open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P) and search for "settings". The simplest way to modify your settings is through "Preferences: Open Settings (UI)".

For tuning the features provided by `gopls`, see the [section](https://github.com/golang/vscode-go/blob/master/docs/settings.md#settings-for-gopls) for `gopls` settings.

## Latest changes

The settings described below are up-to-date as of January 2021. We do our best to keep documentation current, but if a setting is missing, you can always consult the full list in the Extensions view. Documentation for each setting should also be visible in the Settings UI.

To view the list of settings:

1. Navigate to the Extensions view (Ctrl+Shift+X).
2. Find the Go extension and click on it to open the Extension Editor.
3. Click on the `Feature Contributions` tab.
4. Scroll through the list under `Settings`.

## Security

This extension runs a few [third-party command-line tools](tools.md) found from the locations determined by the `PATH` or `Path` environment variable, and the settings such as `"go.alternateTools"` or `"go.toolsGopath"`. Configuring them in workspace settings allows users to conveniently select a different set of tools based on project's need, but also allows attackers to run arbitrary binaries on your machine if they successfuly convince you to open a random repository. In order to reduce the security risk, the extension reads those settings from user settings by default. If the repository can be trusted and workspace settings must be used, you can mark the workspace as a trusted workspace using the `"Go: Toggle Workspace Trust Flag"` command.

## Detailed list

<!-- Everything below this line is generated. DO NOT EDIT. -->

### `go.addTags`

Tags and options configured here will be used by the Add Tags command to add tags to struct fields. If promptForTags is true, then user will be prompted for tags and options. By default, json tags are added.
| Properties | Description |
| --- | --- |
| `options` | Comma separated tag=options pairs to be used by Go: Add Tags command <br/> Default: `"json=omitempty"` |
| `promptForTags` | If true, Go: Add Tags command will prompt the user to provide tags, options, transform values instead of using the configured values <br/> Default: `false` |
| `tags` | Comma separated tags to be used by Go: Add Tags command <br/> Default: `"json"` |
| `template` | Custom format used by Go: Add Tags command for the tag value to be applied <br/> Default: `""` |
| `transform` | Transformation rule used by Go: Add Tags command to add tags <br/> Allowed Options: `snakecase`, `camelcase`, `lispcase`, `pascalcase`, `keep` <br/> Default: `"snakecase"` |

Default:
```
{
	"options" :	"json=omitempty",
	"promptForTags" :	false,
	"tags" :	"json",
	"template" :	"",
	"transform" :	"snakecase",
}
```
### `go.alternateTools`

Alternate tools or alternate paths for the same tools used by the Go extension. Provide either absolute path or the name of the binary in GOPATH/bin, GOROOT/bin or PATH. Useful when you want to use wrapper script for the Go tools or versioned tools from https://gopkg.in. When specified as a workspace setting, the setting is used only when the workspace is marked trusted with "Go: Toggle Workspace Trust Flag".
| Properties | Description |
| --- | --- |
| `dlv` | Alternate tool to use instead of the dlv binary or alternate path to use for the dlv binary. <br/> Default: `"dlv"` |
| `go` | Alternate tool to use instead of the go binary or alternate path to use for the go binary. <br/> Default: `"go"` |
| `go-outline` | Alternate tool to use instead of the go-outline binary or alternate path to use for the go-outline binary. <br/> Default: `"go-outline"` |
| `gopkgs` | Alternate tool to use instead of the gopkgs binary or alternate path to use for the gopkgs binary. <br/> Default: `"gopkgs"` |
| `gopls` | Alternate tool to use instead of the gopls binary or alternate path to use for the gopls binary. <br/> Default: `"gopls"` |
### `go.autocompleteUnimportedPackages`

Include unimported packages in auto-complete suggestions. Not applicable when using the language server.

Default: `false`
### `go.buildFlags`

Flags to `go build`/`go test` used during build-on-save or running tests. (e.g. ["-ldflags='-s'"]) This is propagated to the language server if `gopls.build.buildFlags` is not specified.
### `go.buildOnSave`

Compiles code on file save using 'go build' or 'go test -c'. Options are 'workspace', 'package', or 'off'.  Not applicable when using the language server's diagnostics. See 'go.languageServerExperimentalFeatures.diagnostics' setting.<br/>
Allowed Options: `package`, `workspace`, `off`

Default: `"package"`
### `go.buildTags`

The Go build tags to use for all commands, that support a `-tags '...'` argument. When running tests, go.testTags will be used instead if it was set. This is propagated to the language server if `gopls.build.buildFlags` is not specified.

Default: `""`
### `go.coverMode`

When generating code coverage, the value for -covermode. 'default' is the default value chosen by the 'go test' command.<br/>
Allowed Options: `default`, `set`, `count`, `atomic`

Default: `"default"`
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
| Properties | Description |
| --- | --- |
| `coveredBorderColor` | Color to use for the border of covered code. |
| `coveredGutterStyle` | Gutter style to indicate covered code. <br/> Allowed Options: `blockblue`, `blockred`, `blockgreen`, `blockyellow`, `slashred`, `slashgreen`, `slashblue`, `slashyellow`, `verticalred`, `verticalgreen`, `verticalblue`, `verticalyellow` |
| `coveredHighlightColor` | Color in the rgba format to use to highlight covered code. |
| `type` | <br/> <br/> Allowed Options: `highlight`, `gutter` |
| `uncoveredBorderColor` | Color to use for the border of uncovered code. |
| `uncoveredGutterStyle` | Gutter style to indicate covered code. <br/> Allowed Options: `blockblue`, `blockred`, `blockgreen`, `blockyellow`, `slashred`, `slashgreen`, `slashblue`, `slashyellow`, `verticalred`, `verticalgreen`, `verticalblue`, `verticalyellow` |
| `uncoveredHighlightColor` | Color in the rgba format to use to highlight uncovered code. |

Default:
```
{
	"coveredBorderColor" :	"rgba(64,128,128,0.5)",
	"coveredGutterStyle" :	"blockblue",
	"coveredHighlightColor" :	"rgba(64,128,128,0.5)",
	"type" :	"highlight",
	"uncoveredBorderColor" :	"rgba(128,64,64,0.25)",
	"uncoveredGutterStyle" :	"slashyellow",
	"uncoveredHighlightColor" :	"rgba(128,64,64,0.25)",
}
```
### `go.coverageOptions`

Use these options to control whether only covered or only uncovered code or both should be highlighted after running test coverage<br/>
Allowed Options: `showCoveredCodeOnly`, `showUncoveredCodeOnly`, `showBothCoveredAndUncoveredCode`

Default: `"showBothCoveredAndUncoveredCode"`
### `go.delveConfig`

Delve settings that applies to all debugging sessions. Debug configuration in the launch.json file will override these values.
| Properties | Description |
| --- | --- |
| `apiVersion` | Delve Api Version to use. Default value is 2. This applies only when using the 'legacy' debug adapter. <br/> Allowed Options: `1`, `2` <br/> Default: `2` |
| `debugAdapter` | Select which debug adapter to use by default. This is also used for choosing which debug adapter to use when no launch.json is present and with codelenses. <br/> Allowed Options: `legacy`, `dlv-dap` <br/> Default: `"dlv-dap"` |
| `dlvFlags` | Extra flags for `dlv`. See `dlv help` for the full list of supported. Flags such as `--log-output`, `--log`, `--log-dest`, `--api-version`, `--output`, `--backend` already have corresponding properties in the debug configuration, and flags such as `--listen` and `--headless` are used internally. If they are specified in `dlvFlags`, they may be ignored or cause an error. |
| `dlvLoadConfig` | LoadConfig describes to delve, how to load values from target's memory. Ignored by 'dlv-dap'. <br/> Default: ``` { <pre>"followPointers" :	true,<br/>"maxArrayValues" :	64,<br/>"maxStringLen" :	64,<br/>"maxStructFields" :	-1,<br/>"maxVariableRecurse" :	1,</pre>} ``` |
| `hideSystemGoroutines` | Boolean value to indicate whether system goroutines should be hidden from call stack view. <br/> Default: `false` |
| `logOutput` | Comma separated list of components that should produce debug output. Maps to dlv's `--log-output` flag. Check `dlv log` for details. <br/> Allowed Options: `debugger`, `gdbwire`, `lldbout`, `debuglineerr`, `rpc`, `dap` <br/> Default: `"debugger"` |
| `showGlobalVariables` | Boolean value to indicate whether global package variables should be shown in the variables pane or not. <br/> Default: `false` |
| `showLog` | Show log output from the delve debugger. Maps to dlv's `--log` flag. <br/> Default: `false` |
| `showRegisters` | Boolean value to indicate whether register variables should be shown in the variables pane or not. <br/> Default: `false` |
| `substitutePath` | An array of mappings from a local path to the remote path that is used by the debuggee. The debug adapter will replace the local path with the remote path in all of the calls. Overriden by `remotePath` (in attach request). |
### `go.disableConcurrentTests`

If true, tests will not run concurrently. When a new test run is started, the previous will be cancelled.

Default: `false`
### `go.docsTool`

Pick 'godoc' or 'gogetdoc' to get documentation. Not applicable when using the language server.<br/>
Allowed Options: `godoc`, `gogetdoc`, `guru`

Default: `"godoc"`
### `go.editorContextMenuCommands`

Experimental Feature: Enable/Disable entries from the context menu in the editor.
| Properties | Description |
| --- | --- |
| `addImport` | If true, adds command to import a package to the editor context menu <br/> Default: `true` |
| `addTags` | If true, adds command to add configured tags from struct fields to the editor context menu <br/> Default: `true` |
| `benchmarkAtCursor` | If true, adds command to benchmark the test under the cursor to the editor context menu <br/> Default: `false` |
| `debugTestAtCursor` | If true, adds command to debug the test under the cursor to the editor context menu <br/> Default: `false` |
| `fillStruct` | If true, adds command to fill struct literal with default values to the editor context menu <br/> Default: `true` |
| `generateTestForFile` | If true, adds command to generate unit tests for current file to the editor context menu <br/> Default: `true` |
| `generateTestForFunction` | If true, adds command to generate unit tests for function under the cursor to the editor context menu <br/> Default: `true` |
| `generateTestForPackage` | If true, adds command to generate unit tests for currnt package to the editor context menu <br/> Default: `true` |
| `playground` | If true, adds command to upload the current file or selection to the Go Playground <br/> Default: `true` |
| `removeTags` | If true, adds command to remove configured tags from struct fields to the editor context menu <br/> Default: `true` |
| `testAtCursor` | If true, adds command to run the test under the cursor to the editor context menu <br/> Default: `false` |
| `testCoverage` | If true, adds command to run test coverage to the editor context menu <br/> Default: `true` |
| `testFile` | If true, adds command to run all tests in the current file to the editor context menu <br/> Default: `true` |
| `testPackage` | If true, adds command to run all tests in the current package to the editor context menu <br/> Default: `true` |
| `toggleTestFile` | If true, adds command to toggle between a Go file and its test file to the editor context menu <br/> Default: `true` |

Default:
```
{
	"addImport" :	true,
	"addTags" :	true,
	"benchmarkAtCursor" :	false,
	"debugTestAtCursor" :	true,
	"fillStruct" :	false,
	"generateTestForFile" :	false,
	"generateTestForFunction" :	true,
	"generateTestForPackage" :	false,
	"playground" :	true,
	"removeTags" :	false,
	"testAtCursor" :	true,
	"testCoverage" :	true,
	"testFile" :	false,
	"testPackage" :	false,
	"toggleTestFile" :	true,
}
```
### `go.enableCodeLens`

Feature level setting to enable/disable code lens for references and run/debug tests
| Properties | Description |
| --- | --- |
| `references` | If true, enables the references code lens. Uses guru. Recalculates when there is change to the document followed by scrolling. Unnecessary when using the language server; use the call graph feature instead. <br/> Default: `false` |
| `runtest` | If true, enables code lens for running and debugging tests <br/> Default: `true` |

Default:
```
{
	"references" :	false,
	"runtest" :	true,
}
```
### `go.formatFlags`

Flags to pass to format tool (e.g. ["-s"]). Not applicable when using the language server.
### `go.formatTool`

Not applicable when using the language server. Choosing 'goimports', 'goreturns', or 'gofumports' will add missing imports and remove unused imports.<br/>
Allowed Options:

* `default`: If the language server is enabled, format via the language server, which already supports gofmt, goimports, goreturns, and gofumpt. Otherwise, goimports.
* `gofmt`: Formats the file according to the standard Go style.
* `goimports`: Organizes imports and formats the file with gofmt.
* `goformat`: Configurable gofmt, see https://github.com/mbenkmann/goformat.
* `gofumpt`: Stricter version of gofmt, see https://github.com/mvdan/gofumpt.
* `gofumports`: Applies gofumpt formatting and organizes imports.


Default: `"default"`
### `go.generateTestsFlags`

Additional command line flags to pass to `gotests` for generating tests.
### `go.gocodeAutoBuild`

Enable gocode's autobuild feature. Not applicable when using the language server.

Default: `false`
### `go.gocodeFlags`

Additional flags to pass to gocode. Not applicable when using the language server.

Default: `[-builtin -ignore-case -unimported-packages]`
### `go.gocodePackageLookupMode`

Used to determine the Go package lookup rules for completions by gocode. Only applies when using nsf/gocode. Latest versions of the Go extension uses mdempsky/gocode by default. Not applicable when using the language server.<br/>
Allowed Options: `go`, `gb`, `bzl`

Default: `"go"`
### `go.gopath`

Specify GOPATH here to override the one that is set as environment variable. The inferred GOPATH from workspace root overrides this, if go.inferGopath is set to true. When specified as a workspace setting, the setting is used only when the workspace is marked trusted with "Go: Toggle Workspace Trust Flag".
### `go.goroot`

Specifies the GOROOT to use when no environment variable is set. When specified as a workspace setting, the setting is used only when the workspace is marked trusted with "Go: Toggle Workspace Trust Flag".
### `go.gotoSymbol.ignoreFolders`

Folder names (not paths) to ignore while using Go to Symbol in Workspace feature. Not applicable when using the language server.
### `go.gotoSymbol.includeGoroot`

If false, the standard library located at $GOROOT will be excluded while using the Go to Symbol in File feature. Not applicable when using the language server.

Default: `false`
### `go.gotoSymbol.includeImports`

If false, the import statements will be excluded while using the Go to Symbol in File feature. Not applicable when using the language server.

Default: `false`
### `go.inferGopath`

Infer GOPATH from the workspace root. This is ignored when using Go Modules. When specified as a workspace setting, the setting is used only when the workspace is marked trusted with "Go: Toggle Workspace Trust Flag".

Default: `false`
### `go.installDependenciesWhenBuilding`

If true, then `-i` flag will be passed to `go build` everytime the code is compiled. Since Go 1.10, setting this may be unnecessary unless you are in GOPATH mode and do not use the language server.

Default: `false`
### `go.languageServerExperimentalFeatures`

Temporary flag to enable/disable diagnostics from the language server. This setting will be deprecated soon. Please see and response to [Issue 50](https://github.com/golang/vscode-go/issues/50).
| Properties | Description |
| --- | --- |
| `diagnostics` | If true, the language server will provide build, vet errors and the extension will ignore the `buildOnSave`, `vetOnSave` settings. <br/> Default: `true` |

Default:
```
{
	"diagnostics" :	true,
}
```
### `go.languageServerFlags`

Flags like -rpc.trace and -logfile to be used while running the language server.
### `go.lintFlags`

Flags to pass to Lint tool (e.g. ["-min_confidence=.8"])
### `go.lintOnSave`

Lints code on file save using the configured Lint tool. Options are 'file', 'package', 'workspace' or 'off'.<br/>
Allowed Options: `file`, `package`, `workspace`, `off`

Default: `"package"`
### `go.lintTool`

Specifies Lint tool name.<br/>
Allowed Options: `staticcheck`, `golint`, `golangci-lint`, `revive`

Default: `"staticcheck"`
### `go.liveErrors`

Use gotype on the file currently being edited and report any semantic or syntactic errors found after configured delay. Not applicable when using the language server.
| Properties | Description |
| --- | --- |
| `delay` | The number of milliseconds to delay before execution. Resets with each keystroke. <br/> Default: `500` |
| `enabled` | If true, runs gotype on the file currently being edited and reports any semantic or syntactic errors found. Disabled when the language server is enabled. <br/> Default: `false` |

Default:
```
{
	"delay" :	500,
	"enabled" :	false,
}
```
### `go.logging.level`

The logging level the extension logs at, defaults to 'error'<br/>
Allowed Options: `off`, `error`, `info`, `verbose`

Default: `"error"`
### `go.playground`

The flags configured here will be passed through to command `goplay`
| Properties | Description |
| --- | --- |
| `openbrowser` | Whether to open the created Go Playground in the default browser <br/> Default: `true` |
| `run` | Whether to run the created Go Playground after creation <br/> Default: `true` |
| `share` | Whether to make the created Go Playground shareable <br/> Default: `true` |

Default:
```
{
	"openbrowser" :	true,
	"run" :	true,
	"share" :	true,
}
```
### `go.removeTags`

Tags and options configured here will be used by the Remove Tags command to remove tags to struct fields. If promptForTags is true, then user will be prompted for tags and options. By default, all tags and options will be removed.
| Properties | Description |
| --- | --- |
| `options` | Comma separated tag=options pairs to be used by Go: Remove Tags command <br/> Default: `"json=omitempty"` |
| `promptForTags` | If true, Go: Remove Tags command will prompt the user to provide tags and options instead of using the configured values <br/> Default: `false` |
| `tags` | Comma separated tags to be used by Go: Remove Tags command <br/> Default: `"json"` |

Default:
```
{
	"options" :	"",
	"promptForTags" :	false,
	"tags" :	"",
}
```
### `go.survey.prompt`

Prompt for surveys, including the gopls survey and the Go developer survey.

Default: `true`
### `go.terminal.activateEnvironment`

Apply the Go & PATH environment variables used by the extension to all integrated terminals.

Default: `true`
### `go.testEnvFile`

Absolute path to a file containing environment variables definitions. File contents should be of the form key=value.
### `go.testEnvVars`

Environment variables that will be passed to the process that runs the Go tests
### `go.testExplorer.alwaysRunBenchmarks`

Run benchmarks when running all tests in a file or folder.

Default: `false`
### `go.testExplorer.concatenateMessages`

Concatenate all test log messages for a given location into a single message.

Default: `true`
### `go.testExplorer.enable`

Enable the Go test explorer

Default: `true`
### `go.testExplorer.packageDisplayMode`

Present packages in the test explorer flat or nested.<br/>
Allowed Options: `flat`, `nested`

Default: `"flat"`
### `go.testExplorer.showDynamicSubtestsInEditor`

Set the source location of dynamically discovered subtests to the location of the containing function. As a result, dynamically discovered subtests will be added to the gutter test widget of the containing function.

Default: `false`
### `go.testExplorer.showOutput`

Open the test output terminal when a test run is started.

Default: `true`
### `go.testFlags`

Flags to pass to `go test`. If null, then buildFlags will be used. This is not propagated to the language server.
### `go.testOnSave`

Run 'go test' on save for current package. It is not advised to set this to `true` when you have Auto Save enabled.

Default: `false`
### `go.testTags`

The Go build tags to use for when running tests. If null, then buildTags will be used.
### `go.testTimeout`

Specifies the timeout for go test in ParseDuration format.

Default: `"30s"`
### `go.toolsEnvVars`

Environment variables that will be passed to the tools that run the Go tools (e.g. CGO_CFLAGS)
### `go.toolsGopath`

Location to install the Go tools that the extension depends on if you don't want them in your GOPATH. When specified as a workspace setting, the setting is used only when the workspace is marked trusted with "Go: Toggle Workspace Trust Flag".
### `go.toolsManagement.autoUpdate`

Automatically update the tools used by the extension, without prompting the user.

Default: `false`
### `go.toolsManagement.checkForUpdates`

Specify whether to prompt about new versions of Go and the Go tools (currently, only `gopls`) the extension depends on<br/>
Allowed Options:

* `proxy`: keeps notified of new releases by checking the Go module proxy (GOPROXY)
* `local`: checks only the minimum tools versions required by the extension
* `off`: completely disables version check (not recommended)


Default: `"proxy"`
### `go.trace.server`

Trace the communication between VS Code and the Go language server.<br/>
Allowed Options: `off`, `messages`, `verbose`

Default: `"off"`
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

Default: `true`
### `go.vetFlags`

Flags to pass to `go tool vet` (e.g. ["-all", "-shadow"])
### `go.vetOnSave`

Vets code on file save using 'go tool vet'. Not applicable when using the language server's diagnostics. See 'go.languageServerExperimentalFeatures.diagnostics' setting.<br/>
Allowed Options: `package`, `workspace`, `off`

Default: `"package"`
### `gopls`

Customize `gopls` behavior by specifying the gopls' settings in this section. For example, 
```
"gopls" : {
	"build.directoryFilters": ["-node_modules"]
	...
}
```
This section is directly read by `gopls`. See the [`gopls` section](#settings-for-gopls) section for the full list of `gopls` settings.

## Settings for `gopls`

Configure the default Go language server ('gopls'). In most cases, configuring this section is unnecessary. See [the documentation](https://github.com/golang/tools/blob/master/gopls/doc/settings.md) for all available settings.

### `build.allowImplicitNetworkAccess`

(Experimental) allowImplicitNetworkAccess disables GOPROXY=off, allowing implicit module
downloads rather than requiring user action. This option will eventually
be removed.


Default: `false`
### `build.allowModfileModifications`

(Experimental) allowModfileModifications disables -mod=readonly, allowing imports from
out-of-scope modules. This option will eventually be removed.


Default: `false`
### `build.buildFlags`

buildFlags is the set of flags passed on to the build system when invoked.
It is applied to queries like `go list`, which is used when discovering files.
The most common use is to set `-tags`.

If unspecified, values of `go.buildFlags, go.buildTags` will be propagated.

### `build.directoryFilters`

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

### `build.env`

env adds environment variables to external commands run by `gopls`, most notably `go list`.

### `build.expandWorkspaceToModule`

(Experimental) expandWorkspaceToModule instructs `gopls` to adjust the scope of the
workspace to find the best available module root. `gopls` first looks for
a go.mod file in any parent directory of the workspace folder, expanding
the scope to that directory if it exists. If no viable parent directory is
found, gopls will check if there is exactly one child directory containing
a go.mod file, narrowing the scope to that directory if it exists.


Default: `true`
### `build.experimentalPackageCacheKey`

(Experimental) experimentalPackageCacheKey controls whether to use a coarser cache key
for package type information to increase cache hits. This setting removes
the user's environment, build flags, and working directory from the cache
key, which should be a safe change as all relevant inputs into the type
checking pass are already hashed into the key. This is temporarily guarded
by an experiment because caching behavior is subtle and difficult to
comprehensively test.


Default: `true`
### `build.experimentalUseInvalidMetadata`

(Experimental) experimentalUseInvalidMetadata enables gopls to fall back on outdated
package metadata to provide editor features if the go command fails to
load packages for some reason (like an invalid go.mod file). This will
eventually be the default behavior, and this setting will be removed.


Default: `false`
### `build.experimentalWorkspaceModule`

(Experimental) experimentalWorkspaceModule opts a user into the experimental support
for multi-module workspaces.


Default: `false`
### `build.memoryMode`

(Experimental) memoryMode controls the tradeoff `gopls` makes between memory usage and
correctness.

Values other than `Normal` are untested and may break in surprising ways.
<br/>
Allowed Options:

* `DegradeClosed`: `"DegradeClosed"`: In DegradeClosed mode, `gopls` will collect less information about
packages without open files. As a result, features like Find
References and Rename will miss results in such packages.
* `Normal`


Default: `"Normal"`
### `build.templateExtensions`

templateExtensions gives the extensions of file names that are treateed
as template files. (The extension
is the part of the file name after the final dot.)

### `formatting.gofumpt`

gofumpt indicates if we should run gofumpt formatting.


Default: `false`
### `formatting.local`

local is the equivalent of the `goimports -local` flag, which puts
imports beginning with this string after third-party packages. It should
be the prefix of the import path whose imports should be grouped
separately.


Default: `""`
### `ui.codelenses`

codelenses overrides the enabled/disabled state of code lenses. See the
"Code Lenses" section of the
[Settings page](https://github.com/golang/tools/blob/master/gopls/doc/settings.md)
for the list of supported lenses.

Example Usage:

```json5
"gopls": {
...
  "codelenses": {
    "generate": false,  // Don't show the `go generate` lens.
    "gc_details": true  // Show a code lens toggling the display of gc's choices.
  }
...
}
```

| Properties | Description |
| --- | --- |
| `gc_details` | Toggle the calculation of gc annotations. <br/> Default: `false` |
| `generate` | Runs `go generate` for a given directory. <br/> Default: `true` |
| `regenerate_cgo` | Regenerates cgo definitions. <br/> Default: `true` |
| `test` | Runs `go test` for a specific set of test or benchmark functions. <br/> Default: `false` |
| `tidy` | Runs `go mod tidy` for a module. <br/> Default: `true` |
| `upgrade_dependency` | Upgrades a dependency in the go.mod file for a module. <br/> Default: `true` |
| `vendor` | Runs `go mod vendor` for a module. <br/> Default: `true` |
### `ui.completion.completionBudget`

(For Debugging) completionBudget is the soft latency goal for completion requests. Most
requests finish in a couple milliseconds, but in some cases deep
completions can take much longer. As we use up our budget we
dynamically reduce the search scope to ensure we return timely
results. Zero means unlimited.


Default: `"100ms"`
### `ui.completion.experimentalPostfixCompletions`

(Experimental) experimentalPostfixCompletions enables artifical method snippets
such as "someSlice.sort!".


Default: `true`
### `ui.completion.matcher`

(Advanced) matcher sets the algorithm that is used when calculating completion
candidates.
<br/>
Allowed Options: `CaseInsensitive`, `CaseSensitive`, `Fuzzy`

Default: `"Fuzzy"`
### `ui.completion.usePlaceholders`

placeholders enables placeholders for function parameters or struct
fields in completion responses.


Default: `false`
### `ui.diagnostic.analyses`

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

| Properties | Description |
| --- | --- |
| `asmdecl` | report mismatches between assembly files and Go declarations <br/> Default: `true` |
| `assign` | check for useless assignments <br/> This checker reports assignments of the form x = x or a[i] = a[i]. These are almost always useless, and even when they aren't they are usually a mistake. <br/> Default: `true` |
| `atomic` | check for common mistakes using the sync/atomic package <br/> The atomic checker looks for assignment statements of the form: <br/> <pre>x = atomic.AddUint64(&x, 1)</pre><br/> which are not atomic. <br/> Default: `true` |
| `atomicalign` | check for non-64-bits-aligned arguments to sync/atomic functions <br/> Default: `true` |
| `bools` | check for common mistakes involving boolean operators <br/> Default: `true` |
| `buildtag` | check that +build tags are well-formed and correctly located <br/> Default: `true` |
| `cgocall` | detect some violations of the cgo pointer passing rules <br/> Check for invalid cgo pointer passing. This looks for code that uses cgo to call C code passing values whose types are almost always invalid according to the cgo pointer sharing rules. Specifically, it warns about attempts to pass a Go chan, map, func, or slice to C, either directly, or via a pointer, array, or struct. <br/> Default: `true` |
| `composites` | check for unkeyed composite literals <br/> This analyzer reports a diagnostic for composite literals of struct types imported from another package that do not use the field-keyed syntax. Such literals are fragile because the addition of a new field (even if unexported) to the struct will cause compilation to fail. <br/> As an example, <br/> <pre>err = &net.DNSConfigError{err}</pre><br/> should be replaced by: <br/> <pre>err = &net.DNSConfigError{Err: err}</pre><br/> <br/> Default: `true` |
| `copylocks` | check for locks erroneously passed by value <br/> Inadvertently copying a value containing a lock, such as sync.Mutex or sync.WaitGroup, may cause both copies to malfunction. Generally such values should be referred to through a pointer. <br/> Default: `true` |
| `deepequalerrors` | check for calls of reflect.DeepEqual on error values <br/> The deepequalerrors checker looks for calls of the form: <br/>     reflect.DeepEqual(err1, err2) <br/> where err1 and err2 are errors. Using reflect.DeepEqual to compare errors is discouraged. <br/> Default: `true` |
| `errorsas` | report passing non-pointer or non-error values to errors.As <br/> The errorsas analysis reports calls to errors.As where the type of the second argument is not a pointer to a type implementing error. <br/> Default: `true` |
| `fieldalignment` | find structs that would use less memory if their fields were sorted <br/> This analyzer find structs that can be rearranged to use less memory, and provides a suggested edit with the optimal order. <br/> Note that there are two different diagnostics reported. One checks struct size, and the other reports "pointer bytes" used. Pointer bytes is how many bytes of the object that the garbage collector has to potentially scan for pointers, for example: <br/> <pre>struct { uint32; string }</pre><br/> have 16 pointer bytes because the garbage collector has to scan up through the string's inner pointer. <br/> <pre>struct { string; *uint32 }</pre><br/> has 24 pointer bytes because it has to scan further through the *uint32. <br/> <pre>struct { string; uint32 }</pre><br/> has 8 because it can stop immediately after the string pointer. <br/> <br/> Default: `false` |
| `fillreturns` | suggest fixes for errors due to an incorrect number of return values <br/> This checker provides suggested fixes for type errors of the type "wrong number of return values (want %d, got %d)". For example: <pre>func m() (int, string, *bool, error) {<br/>	return<br/>}</pre>will turn into <pre>func m() (int, string, *bool, error) {<br/>	return 0, "", nil, nil<br/>}</pre><br/> This functionality is similar to https://github.com/sqs/goreturns. <br/> <br/> Default: `true` |
| `fillstruct` | note incomplete struct initializations <br/> This analyzer provides diagnostics for any struct literals that do not have any fields initialized. Because the suggested fix for this analysis is expensive to compute, callers should compute it separately, using the SuggestedFix function below. <br/> <br/> Default: `true` |
| `httpresponse` | check for mistakes using HTTP responses <br/> A common mistake when using the net/http package is to defer a function call to close the http.Response Body before checking the error that determines whether the response is valid: <br/> <pre>resp, err := http.Head(url)<br/>defer resp.Body.Close()<br/>if err != nil {<br/>	log.Fatal(err)<br/>}<br/>// (defer statement belongs here)</pre><br/> This checker helps uncover latent nil dereference bugs by reporting a diagnostic for such mistakes. <br/> Default: `true` |
| `ifaceassert` | detect impossible interface-to-interface type assertions <br/> This checker flags type assertions v.(T) and corresponding type-switch cases in which the static type V of v is an interface that cannot possibly implement the target interface T. This occurs when V and T contain methods with the same name but different signatures. Example: <br/> <pre>var v interface {<br/>	Read()<br/>}<br/>_ = v.(io.Reader)</pre><br/> The Read method in v has a different signature than the Read method in io.Reader, so this assertion cannot succeed. <br/> <br/> Default: `true` |
| `infertypeargs` | check for unnecessary type arguments in call expressions <br/> Explicit type arguments may be omitted from call expressions if they can be inferred from function arguments, or from other type arguments: <br/> <pre>func f[T any](T) {}<br/><br/><br/>func _() {<br/>	f[string]("foo") // string could be inferred<br/>}</pre><br/> <br/> Default: `true` |
| `loopclosure` | check references to loop variables from within nested functions <br/> This analyzer checks for references to loop variables from within a function literal inside the loop body. It checks only instances where the function literal is called in a defer or go statement that is the last statement in the loop body, as otherwise we would need whole program analysis. <br/> For example: <br/> <pre>for i, v := range s {<br/>	go func() {<br/>		println(i, v) // not what you might expect<br/>	}()<br/>}</pre><br/> See: https://golang.org/doc/go_faq.html#closures_and_goroutines <br/> Default: `true` |
| `lostcancel` | check cancel func returned by context.WithCancel is called <br/> The cancellation function returned by context.WithCancel, WithTimeout, and WithDeadline must be called or the new context will remain live until its parent context is cancelled. (The background context is never cancelled.) <br/> Default: `true` |
| `nilfunc` | check for useless comparisons between functions and nil <br/> A useless comparison is one like f == nil as opposed to f() == nil. <br/> Default: `true` |
| `nilness` | check for redundant or impossible nil comparisons <br/> The nilness checker inspects the control-flow graph of each function in a package and reports nil pointer dereferences, degenerate nil pointers, and panics with nil values. A degenerate comparison is of the form x==nil or x!=nil where x is statically known to be nil or non-nil. These are often a mistake, especially in control flow related to errors. Panics with nil values are checked because they are not detectable by <br/> <pre>if r := recover(); r != nil {</pre><br/> This check reports conditions such as: <br/> <pre>if f == nil { // impossible condition (f is a function)<br/>}</pre><br/> and: <br/> <pre>p := &v<br/>...<br/>if p != nil { // tautological condition<br/>}</pre><br/> and: <br/> <pre>if p == nil {<br/>	print(*p) // nil dereference<br/>}</pre><br/> and: <br/> <pre>if p == nil {<br/>	panic(p)<br/>}</pre><br/> <br/> Default: `false` |
| `nonewvars` | suggested fixes for "no new vars on left side of :=" <br/> This checker provides suggested fixes for type errors of the type "no new vars on left side of :=". For example: <pre>z := 1<br/>z := 2</pre>will turn into <pre>z := 1<br/>z = 2</pre><br/> <br/> Default: `true` |
| `noresultvalues` | suggested fixes for "no result values expected" <br/> This checker provides suggested fixes for type errors of the type "no result values expected". For example: <pre>func z() { return nil }</pre>will turn into <pre>func z() { return }</pre><br/> <br/> Default: `true` |
| `printf` | check consistency of Printf format strings and arguments <br/> The check applies to known functions (for example, those in package fmt) as well as any detected wrappers of known functions. <br/> A function that wants to avail itself of printf checking but is not found by this analyzer's heuristics (for example, due to use of dynamic calls) can insert a bogus call: <br/> <pre>if false {<br/>	_ = fmt.Sprintf(format, args...) // enable printf checking<br/>}</pre><br/> The -funcs flag specifies a comma-separated list of names of additional known formatting functions or methods. If the name contains a period, it must denote a specific function using one of the following forms: <br/> <pre>dir/pkg.Function<br/>dir/pkg.Type.Method<br/>(*dir/pkg.Type).Method</pre><br/> Otherwise the name is interpreted as a case-insensitive unqualified identifier such as "errorf". Either way, if a listed name ends in f, the function is assumed to be Printf-like, taking a format string before the argument list. Otherwise it is assumed to be Print-like, taking a list of arguments with no format string. <br/> <br/> Default: `true` |
| `shadow` | check for possible unintended shadowing of variables <br/> This analyzer check for shadowed variables. A shadowed variable is a variable declared in an inner scope with the same name and type as a variable in an outer scope, and where the outer variable is mentioned after the inner one is declared. <br/> (This definition can be refined; the module generates too many false positives and is not yet enabled by default.) <br/> For example: <br/> <pre>func BadRead(f *os.File, buf []byte) error {<br/>	var err error<br/>	for {<br/>		n, err := f.Read(buf) // shadows the function variable 'err'<br/>		if err != nil {<br/>			break // causes return of wrong value<br/>		}<br/>		foo(buf)<br/>	}<br/>	return err<br/>}</pre><br/> <br/> Default: `false` |
| `shift` | check for shifts that equal or exceed the width of the integer <br/> Default: `true` |
| `simplifycompositelit` | check for composite literal simplifications <br/> An array, slice, or map composite literal of the form: <pre>[]T{T{}, T{}}</pre>will be simplified to: <pre>[]T{{}, {}}</pre><br/> This is one of the simplifications that "gofmt -s" applies. <br/> Default: `true` |
| `simplifyrange` | check for range statement simplifications <br/> A range of the form: <pre>for x, _ = range v {...}</pre>will be simplified to: <pre>for x = range v {...}</pre><br/> A range of the form: <pre>for _ = range v {...}</pre>will be simplified to: <pre>for range v {...}</pre><br/> This is one of the simplifications that "gofmt -s" applies. <br/> Default: `true` |
| `simplifyslice` | check for slice simplifications <br/> A slice expression of the form: <pre>s[a:len(s)]</pre>will be simplified to: <pre>s[a:]</pre><br/> This is one of the simplifications that "gofmt -s" applies. <br/> Default: `true` |
| `sortslice` | check the argument type of sort.Slice <br/> sort.Slice requires an argument of a slice type. Check that the interface{} value passed to sort.Slice is actually a slice. <br/> Default: `true` |
| `stdmethods` | check signature of methods of well-known interfaces <br/> Sometimes a type may be intended to satisfy an interface but may fail to do so because of a mistake in its method signature. For example, the result of this WriteTo method should be (int64, error), not error, to satisfy io.WriterTo: <br/> <pre>type myWriterTo struct{...}</pre>        func (myWriterTo) WriteTo(w io.Writer) error { ... } <br/> This check ensures that each method whose name matches one of several well-known interface methods from the standard library has the correct signature for that interface. <br/> Checked method names include: <pre>Format GobEncode GobDecode MarshalJSON MarshalXML<br/>Peek ReadByte ReadFrom ReadRune Scan Seek<br/>UnmarshalJSON UnreadByte UnreadRune WriteByte<br/>WriteTo</pre><br/> <br/> Default: `true` |
| `stringintconv` | check for string(int) conversions <br/> This checker flags conversions of the form string(x) where x is an integer (but not byte or rune) type. Such conversions are discouraged because they return the UTF-8 representation of the Unicode code point x, and not a decimal string representation of x as one might expect. Furthermore, if x denotes an invalid code point, the conversion cannot be statically rejected. <br/> For conversions that intend on using the code point, consider replacing them with string(rune(x)). Otherwise, strconv.Itoa and its equivalents return the string representation of the value in the desired base. <br/> <br/> Default: `true` |
| `structtag` | check that struct field tags conform to reflect.StructTag.Get <br/> Also report certain struct tags (json, xml) used with unexported fields. <br/> Default: `true` |
| `testinggoroutine` | report calls to (*testing.T).Fatal from goroutines started by a test. <br/> Functions that abruptly terminate a test, such as the Fatal, Fatalf, FailNow, and Skip{,f,Now} methods of *testing.T, must be called from the test goroutine itself. This checker detects calls to these functions that occur within a goroutine started by the test. For example: <br/> func TestFoo(t *testing.T) {     go func() {         t.Fatal("oops") // error: (*T).Fatal called from non-test goroutine     }() } <br/> <br/> Default: `true` |
| `tests` | check for common mistaken usages of tests and examples <br/> The tests checker walks Test, Benchmark and Example functions checking malformed names, wrong signatures and examples documenting non-existent identifiers. <br/> Please see the documentation for package testing in golang.org/pkg/testing for the conventions that are enforced for Tests, Benchmarks, and Examples. <br/> Default: `true` |
| `undeclaredname` | suggested fixes for "undeclared name: <>" <br/> This checker provides suggested fixes for type errors of the type "undeclared name: <>". It will either insert a new statement, such as: <br/> "<> := " <br/> or a new function declaration, such as: <br/> func <>(inferred parameters) { <pre>panic("implement me!")</pre>} <br/> <br/> Default: `true` |
| `unmarshal` | report passing non-pointer or non-interface values to unmarshal <br/> The unmarshal analysis reports calls to functions such as json.Unmarshal in which the argument type is not a pointer or an interface. <br/> Default: `true` |
| `unreachable` | check for unreachable code <br/> The unreachable analyzer finds statements that execution can never reach because they are preceded by an return statement, a call to panic, an infinite loop, or similar constructs. <br/> Default: `true` |
| `unsafeptr` | check for invalid conversions of uintptr to unsafe.Pointer <br/> The unsafeptr analyzer reports likely incorrect uses of unsafe.Pointer to convert integers to pointers. A conversion from uintptr to unsafe.Pointer is invalid if it implies that there is a uintptr-typed word in memory that holds a pointer value, because that word will be invisible to stack copying and to the garbage collector. <br/> Default: `true` |
| `unusedparams` | check for unused parameters of functions <br/> The unusedparams analyzer checks functions to see if there are any parameters that are not being used. <br/> To reduce false positives it ignores: - methods - parameters that do not have a name or are underscored - functions in test files - functions with empty bodies or those with just a return stmt <br/> Default: `false` |
| `unusedresult` | check for unused results of calls to some functions <br/> Some functions like fmt.Errorf return a result and have no side effects, so it is always a mistake to discard the result. This analyzer reports calls to certain functions in which the result of the call is ignored. <br/> The set of functions may be controlled using flags. <br/> Default: `true` |
| `unusedwrite` | checks for unused writes <br/> The analyzer reports instances of writes to struct fields and arrays that are never read. Specifically, when a struct object or an array is copied, its elements are copied implicitly by the compiler, and any element write to this copy does nothing with the original object. <br/> For example: <br/> <pre>type T struct { x int }<br/>func f(input []T) {<br/>	for i, v := range input {  // v is a copy<br/>		v.x = i  // unused write to field x<br/>	}<br/>}</pre><br/> Another example is about non-pointer receiver: <br/> <pre>type T struct { x int }<br/>func (t T) f() {  // t is a copy<br/>	t.x = i  // unused write to field x<br/>}</pre><br/> <br/> Default: `false` |
| `useany` | check for constraints that could be simplified to "any" <br/> Default: `true` |
### `ui.diagnostic.annotations`

(Experimental) annotations specifies the various kinds of optimization diagnostics
that should be reported by the gc_details command.

| Properties | Description |
| --- | --- |
| `bounds` | `"bounds"` controls bounds checking diagnostics. <br/> <br/> Default: `true` |
| `escape` | `"escape"` controls diagnostics about escape choices. <br/> <br/> Default: `true` |
| `inline` | `"inline"` controls diagnostics about inlining choices. <br/> <br/> Default: `true` |
| `nil` | `"nil"` controls nil checks. <br/> <br/> Default: `true` |
### `ui.diagnostic.diagnosticsDelay`

(Advanced) diagnosticsDelay controls the amount of time that gopls waits
after the most recent file modification before computing deep diagnostics.
Simple diagnostics (parsing and type-checking) are always run immediately
on recently modified packages.

This option must be set to a valid duration string, for example `"250ms"`.


Default: `"250ms"`
### `ui.diagnostic.experimentalWatchedFileDelay`

(Experimental) experimentalWatchedFileDelay controls the amount of time that gopls waits
for additional workspace/didChangeWatchedFiles notifications to arrive,
before processing all such notifications in a single batch. This is
intended for use by LSP clients that don't support their own batching of
file system notifications.

This option must be set to a valid duration string, for example `"100ms"`.


Default: `"0s"`
### `ui.diagnostic.staticcheck`

(Experimental) staticcheck enables additional analyses from staticcheck.io.


Default: `false`
### `ui.documentation.hoverKind`

hoverKind controls the information that appears in the hover text.
SingleLine and Structured are intended for use only by authors of editor plugins.
<br/>
Allowed Options:

* `FullDocumentation`
* `NoDocumentation`
* `SingleLine`
* `Structured`: `"Structured"` is an experimental setting that returns a structured hover format.
This format separates the signature from the documentation, so that the client
can do more manipulation of these fields.<br/>This should only be used by clients that support this behavior.
* `SynopsisDocumentation`


Default: `"FullDocumentation"`
### `ui.documentation.linkTarget`

linkTarget controls where documentation links go.
It might be one of:

* `"godoc.org"`
* `"pkg.go.dev"`

If company chooses to use its own `godoc.org`, its address can be used as well.


Default: `"pkg.go.dev"`
### `ui.documentation.linksInHover`

linksInHover toggles the presence of links to documentation in hover.


Default: `true`
### `ui.navigation.importShortcut`

importShortcut specifies whether import statements should link to
documentation or go to definitions.
<br/>
Allowed Options: `Both`, `Definition`, `Link`

Default: `"Both"`
### `ui.navigation.symbolMatcher`

(Advanced) symbolMatcher sets the algorithm that is used when finding workspace symbols.
<br/>
Allowed Options: `CaseInsensitive`, `CaseSensitive`, `FastFuzzy`, `Fuzzy`

Default: `"Fuzzy"`
### `ui.navigation.symbolStyle`

(Advanced) symbolStyle controls how symbols are qualified in symbol responses.

Example Usage:

```json5
"gopls": {
...
  "symbolStyle": "Dynamic",
...
}
```
<br/>
Allowed Options:

* `Dynamic`: `"Dynamic"` uses whichever qualifier results in the highest scoring
match for the given symbol query. Here a "qualifier" is any "/" or "."
delimited suffix of the fully qualified symbol. i.e. "to/pkg.Foo.Field" or
just "Foo.Field".
* `Full`: `"Full"` is fully qualified symbols, i.e.
"path/to/pkg.Foo.Field".
* `Package`: `"Package"` is package qualified symbols i.e.
"pkg.Foo.Field".


Default: `"Dynamic"`
### `ui.semanticTokens`

(Experimental) semanticTokens controls whether the LSP server will send
semantic tokens to the client.


Default: `false`
### `verboseOutput`

(For Debugging) verboseOutput enables additional debug logging.


Default: `false`

