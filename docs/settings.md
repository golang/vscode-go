# Settings

This extension is highly configurable, and as such, offers a number of settings. These can be configured by modifying your [User or Workspace Settings](https://code.visualstudio.com/docs/getstarted/settings).

To navigate to your settings, open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P) and search for "settings". The simplest way to modify your settings is through "Preferences: Open Settings (UI)".

For tuning the features provided by `gopls`, see the [section](settings.md#settings-for-gopls) for `gopls` settings.

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

Alternate tools or alternate paths for the same tools used by the Go extension. Provide either absolute path or the name of the binary in GOPATH/bin, GOROOT/bin or PATH. Useful when you want to use wrapper script for the Go tools.
| Properties | Description |
| --- | --- |
| `customFormatter` | Custom formatter to use instead of the language server. This should be used with the `custom` option in `#go.formatTool#`. <br/> Default: `""` |
| `dlv` | Alternate tool to use instead of the dlv binary or alternate path to use for the dlv binary. <br/> Default: `"dlv"` |
| `go` | Alternate tool to use instead of the go binary or alternate path to use for the go binary. <br/> Default: `"go"` |
| `gopls` | Alternate tool to use instead of the gopls binary or alternate path to use for the gopls binary. <br/> Default: `"gopls"` |
### `go.buildFlags`

Flags to `go build`/`go test` used during build-on-save or running tests. (e.g. ["-ldflags='-s'"]) This is propagated to the language server if `gopls.build.buildFlags` is not specified.
### `go.buildOnSave (deprecated)`

Enable the Go language server (`#go.useLanguageServer#`) to diagnose compile errors.
Compiles code on file save using 'go build' or 'go test -c'. Not applicable when using the language server.<br/>
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
### `go.diagnostic.vulncheck`

(Experimental) vulncheck enables vulnerability scanning.
<br/>
Allowed Options:

* `Imports`: `"Imports"`: In Imports mode, `gopls` will report vulnerabilities that affect packages
directly and indirectly used by the analyzed main module.
* `Off`: `"Off"`: Disable vulnerability analysis.


Default: `"Off"`
### `go.disableConcurrentTests`

If true, tests will not run concurrently. When a new test run is started, the previous will be cancelled.

Default: `false`
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
| `generateTestForPackage` | If true, adds command to generate unit tests for current package to the editor context menu <br/> Default: `true` |
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
| `runtest` | If true, enables code lens for running and debugging tests <br/> Default: `true` |

Default:
```
{
	"runtest" :	true,
}
```
### `go.formatFlags`

Flags to pass to format tool (e.g. ["-s"]). Not applicable when using the language server.
### `go.formatTool`

When the language server is enabled and one of `default`/`gofmt`/`goimports`/`gofumpt` is chosen, the language server will handle formatting. If `custom` tool is selected, the extension will use the `customFormatter` tool in the `#go.alternateTools#` section.<br/>
Allowed Options:

* `default`: If the language server is enabled, format via the language server, which already supports gofmt, goimports, goreturns, and gofumpt. Otherwise, goimports.
* `gofmt`: Formats the file according to the standard Go style. (not applicable when the language server is enabled)
* `goimports`: Organizes imports and formats the file with gofmt. (not applicable when the language server is enabled)
* `goformat`: Configurable gofmt, see https://github.com/mbenkmann/goformat.
* `gofumpt`: Stricter version of gofmt, see https://github.com/mvdan/gofumpt. . Use `#gopls.format.gofumpt#` instead)
* `custom`: Formats using the custom tool specified as `customFormatter` in the `#go.alternateTools#` setting. The tool should take the input as STDIN and output the formatted code as STDOUT.


Default: `"default"`
### `go.generateTestsFlags`

Additional command line flags to pass to `gotests` for generating tests.
### `go.gopath`

Specify GOPATH here to override the one that is set as environment variable. The inferred GOPATH from workspace root overrides this, if go.inferGopath is set to true.
### `go.goroot`

Specifies the GOROOT to use when no environment variable is set.
### `go.inferGopath`

Infer GOPATH from the workspace root. This is ignored when using Go Modules.

Default: `false`
### `go.inlayHints.assignVariableTypes`

Enable/disable inlay hints for variable types in assign statements:
```go
	i/* int*/, j/* int*/ := 0, len(r)-1
```

Default: `false`
### `go.inlayHints.compositeLiteralFields`

Enable/disable inlay hints for composite literal field names:
```go
	{/*in: */"Hello, world", /*want: */"dlrow ,olleH"}
```

Default: `false`
### `go.inlayHints.compositeLiteralTypes`

Enable/disable inlay hints for composite literal types:
```go
	for _, c := range []struct {
		in, want string
	}{
		/*struct{ in string; want string }*/{"Hello, world", "dlrow ,olleH"},
	}
```

Default: `false`
### `go.inlayHints.constantValues`

Enable/disable inlay hints for constant values:
```go
	const (
		KindNone   Kind = iota/* = 0*/
		KindPrint/*  = 1*/
		KindPrintf/* = 2*/
		KindErrorf/* = 3*/
	)
```

Default: `false`
### `go.inlayHints.functionTypeParameters`

Enable/disable inlay hints for implicit type parameters on generic functions:
```go
	myFoo/*[int, string]*/(1, "hello")
```

Default: `false`
### `go.inlayHints.parameterNames`

Enable/disable inlay hints for parameter names:
```go
	parseInt(/* str: */ "123", /* radix: */ 8)
```

Default: `false`
### `go.inlayHints.rangeVariableTypes`

Enable/disable inlay hints for variable types in range statements:
```go
	for k/* int*/, v/* string*/ := range []string{} {
		fmt.Println(k, v)
	}
```

Default: `false`
### `go.installDependenciesWhenBuilding`

If true, then `-i` flag will be passed to `go build` everytime the code is compiled. Since Go 1.10, setting this may be unnecessary unless you are in GOPATH mode and do not use the language server.

Default: `false`
### `go.languageServerFlags`

Flags like -rpc.trace and -logfile to be used while running the language server.
### `go.lintFlags`

Flags to pass to Lint tool (e.g. ["-min_confidence=.8"])
### `go.lintOnSave`

Lints code on file save using the configured Lint tool. Options are 'file', 'package', 'workspace' or 'off'.<br/>
Allowed Options:

* `file`: lint the current file on file saving
* `package`: lint the current package on file saving
* `workspace`: lint all the packages in the current workspace root folder on file saving
* `off`: do not run lint automatically


Default: `"package"`
### `go.lintTool`

Specifies Lint tool name.<br/>
Allowed Options: `staticcheck`, `golint`, `golangci-lint`, `revive`

Default: `"staticcheck"`
### `go.logging.level (deprecated)`

This setting is deprecated. Use 'Developer: Set Log Level...' command to control logging level instead.

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
### `go.showWelcome`

Specifies whether to show the Welcome experience on first install

Default: `true`
### `go.survey.prompt`

Prompt for surveys, including the gopls survey and the Go developer survey.

Default: `true`
### `go.tasks.provideDefault`

enable the default go build/test task provider.

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

Environment variables that will be passed to the tools that run the Go tools (e.g. CGO_CFLAGS) and debuggee process launched by Delve. Format as string key:value pairs. When debugging, merged with `envFile` and `env` values with precedence `env` > `envFile` > `go.toolsEnvVars`.
### `go.toolsGopath`

Location to install the Go tools that the extension depends on if you don't want them in your GOPATH.
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
### `go.toolsManagement.go`

The path to the `go` binary used to install the Go tools. If it's empty, the same `go` binary chosen for the project will be used for tool installation.

Default: `""`
### `go.trace.server`

Trace the communication between VS Code and the Go language server.<br/>
Allowed Options: `off`, `messages`, `verbose`

Default: `"off"`
### `go.useLanguageServer`

Enable intellisense, code navigation, refactoring, formatting & diagnostics for Go. The features are powered by the Go language server "gopls".

Default: `true`
### `go.vetFlags`

Flags to pass to `go tool vet` (e.g. ["-all", "-shadow"]). Not applicable when using the language server's diagnostics.
### `go.vetOnSave`

Vets code on file save using 'go tool vet'. Not applicable when using the language server's diagnostics. See 'go.languageServerExperimentalFeatures.diagnostics' setting.<br/>
Allowed Options:

* `package`: vet the current package on file saving
* `workspace`: vet all the packages in the current workspace root folder on file saving
* `off`: do not run vet automatically


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

DirectoryFilters also supports the `**` operator to match 0 or more directories.

Examples:

Exclude node_modules at current depth: `-node_modules`

Exclude node_modules at any depth: `-**/node_modules`

Include only project_a: `-` (exclude everything), `+project_a`

Include only project_a, but not node_modules inside it: `-`, `+project_a`, `-project_a/node_modules`


Default: `["-**/node_modules"]`
### `build.env`

env adds environment variables to external commands run by `gopls`, most notably `go list`.

### `build.expandWorkspaceToModule`

(Experimental) expandWorkspaceToModule determines which packages are considered
"workspace packages" when the workspace is using modules.

Workspace packages affect the scope of workspace-wide operations. Notably,
gopls diagnoses all packages considered to be part of the workspace after
every keystroke, so by setting "ExpandWorkspaceToModule" to false, and
opening a nested workspace directory, you can reduce the amount of work
gopls has to do to keep your workspace up to date.


Default: `true`
### `build.memoryMode`

(Experimental) obsolete, no effect


Default: `""`
### `build.standaloneTags`

standaloneTags specifies a set of build constraints that identify
individual Go source files that make up the entire main package of an
executable.

A common example of standalone main files is the convention of using the
directive `//go:build ignore` to denote files that are not intended to be
included in any package, for example because they are invoked directly by
the developer using `go run`.

Gopls considers a file to be a standalone main file if and only if it has
package name "main" and has a build directive of the exact form
"//go:build tag" or "// +build tag", where tag is among the list of tags
configured by this setting. Notably, if the build constraint is more
complicated than a simple tag (such as the composite constraint
`//go:build tag && go1.18`), the file is not considered to be a standalone
main file.

This setting is only supported when gopls is built with Go 1.16 or later.


Default: `["ignore"]`
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

codelenses overrides the enabled/disabled state of each of gopls'
sources of [Code Lenses](codelenses.md).

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
| `gc_details` | `"gc_details"`: Toggle display of Go compiler optimization decisions <br/> This codelens source causes the `package` declaration of each file to be annotated with a command to toggle the state of the per-session variable that controls whether optimization decisions from the Go compiler (formerly known as "gc") should be displayed as diagnostics. <br/> Optimization decisions include: - whether a variable escapes, and how escape is inferred; - whether a nil-pointer check is implied or eliminated; - whether a function can be inlined. <br/> TODO(adonovan): this source is off by default because the annotation is annoying and because VS Code has a separate "Toggle gc details" command. Replace it with a Code Action ("Source action..."). <br/> <br/> Default: `false` |
| `generate` | `"generate"`: Run `go generate` <br/> This codelens source annotates any `//go:generate` comments with commands to run `go generate` in this directory, on all directories recursively beneath this one. <br/> See [Generating code](https://go.dev/blog/generate) for more details. <br/> <br/> Default: `true` |
| `regenerate_cgo` | `"regenerate_cgo"`: Re-generate cgo declarations <br/> This codelens source annotates an `import "C"` declaration with a command to re-run the [cgo command](https://pkg.go.dev/cmd/cgo) to regenerate the corresponding Go declarations. <br/> Use this after editing the C code in comments attached to the import, or in C header files included by it. <br/> <br/> Default: `true` |
| `run_govulncheck` | `"run_govulncheck"`: Run govulncheck <br/> This codelens source annotates the `module` directive in a go.mod file with a command to run Govulncheck. <br/> [Govulncheck](https://go.dev/blog/vuln) is a static analysis tool that computes the set of functions reachable within your application, including dependencies; queries a database of known security vulnerabilities; and reports any potential problems it finds. <br/> <br/> Default: `false` |
| `test` | `"test"`: Run tests and benchmarks <br/> This codelens source annotates each `Test` and `Benchmark` function in a `*_test.go` file with a command to run it. <br/> This source is off by default because VS Code has a client-side custom UI for testing, and because progress notifications are not a great UX for streamed test output. See: - golang/go#67400 for a discussion of this feature. - https://github.com/joaotavora/eglot/discussions/1402   for an alternative approach. <br/> <br/> Default: `false` |
| `tidy` | `"tidy"`: Tidy go.mod file <br/> This codelens source annotates the `module` directive in a go.mod file with a command to run [`go mod tidy`](https://go.dev/ref/mod#go-mod-tidy), which ensures that the go.mod file matches the source code in the module. <br/> <br/> Default: `true` |
| `upgrade_dependency` | `"upgrade_dependency"`: Update dependencies <br/> This codelens source annotates the `module` directive in a go.mod file with commands to: <br/> - check for available upgrades, - upgrade direct dependencies, and - upgrade all dependencies transitively. <br/> <br/> Default: `true` |
| `vendor` | `"vendor"`: Update vendor directory <br/> This codelens source annotates the `module` directive in a go.mod file with a command to run [`go mod vendor`](https://go.dev/ref/mod#go-mod-vendor), which creates or updates the directory named `vendor` in the module root so that it contains an up-to-date copy of all necessary package dependencies. <br/> <br/> Default: `true` |
### `ui.completion.completeFunctionCalls`

completeFunctionCalls enables function call completion.

When completing a statement, or when a function return type matches the
expected of the expression being completed, completion may suggest call
expressions (i.e. may include parentheses).


Default: `true`
### `ui.completion.completionBudget`

(For Debugging) completionBudget is the soft latency goal for completion requests. Most
requests finish in a couple milliseconds, but in some cases deep
completions can take much longer. As we use up our budget we
dynamically reduce the search scope to ensure we return timely
results. Zero means unlimited.


Default: `"100ms"`
### `ui.completion.experimentalPostfixCompletions`

(Experimental) experimentalPostfixCompletions enables artificial method snippets
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
A full list of analyzers that gopls uses can be found in
[analyzers.md](https://github.com/golang/tools/blob/master/gopls/doc/analyzers.md).

Example Usage:

```json5
...
"analyses": {
  "unreachable": false, // Disable the unreachable analyzer.
  "unusedvariable": true  // Enable the unusedvariable analyzer.
}
...
```

| Properties | Description |
| --- | --- |
| `appends` | check for missing values after append <br/> This checker reports calls to append that pass no values to be appended to the slice. <br/> <pre>s := []string{"a", "b", "c"}<br/>_ = append(s)</pre><br/> Such calls are always no-ops and often indicate an underlying mistake. <br/> Default: `true` |
| `asmdecl` | report mismatches between assembly files and Go declarations <br/> Default: `true` |
| `assign` | check for useless assignments <br/> This checker reports assignments of the form x = x or a[i] = a[i]. These are almost always useless, and even when they aren't they are usually a mistake. <br/> Default: `true` |
| `atomic` | check for common mistakes using the sync/atomic package <br/> The atomic checker looks for assignment statements of the form: <br/> <pre>x = atomic.AddUint64(&x, 1)</pre><br/> which are not atomic. <br/> Default: `true` |
| `atomicalign` | check for non-64-bits-aligned arguments to sync/atomic functions <br/> Default: `true` |
| `bools` | check for common mistakes involving boolean operators <br/> Default: `true` |
| `buildtag` | check //go:build and // +build directives <br/> Default: `true` |
| `cgocall` | detect some violations of the cgo pointer passing rules <br/> Check for invalid cgo pointer passing. This looks for code that uses cgo to call C code passing values whose types are almost always invalid according to the cgo pointer sharing rules. Specifically, it warns about attempts to pass a Go chan, map, func, or slice to C, either directly, or via a pointer, array, or struct. <br/> Default: `true` |
| `composites` | check for unkeyed composite literals <br/> This analyzer reports a diagnostic for composite literals of struct types imported from another package that do not use the field-keyed syntax. Such literals are fragile because the addition of a new field (even if unexported) to the struct will cause compilation to fail. <br/> As an example, <br/> <pre>err = &net.DNSConfigError{err}</pre><br/> should be replaced by: <br/> <pre>err = &net.DNSConfigError{Err: err}</pre><br/> <br/> Default: `true` |
| `copylocks` | check for locks erroneously passed by value <br/> Inadvertently copying a value containing a lock, such as sync.Mutex or sync.WaitGroup, may cause both copies to malfunction. Generally such values should be referred to through a pointer. <br/> Default: `true` |
| `deepequalerrors` | check for calls of reflect.DeepEqual on error values <br/> The deepequalerrors checker looks for calls of the form: <br/>     reflect.DeepEqual(err1, err2) <br/> where err1 and err2 are errors. Using reflect.DeepEqual to compare errors is discouraged. <br/> Default: `true` |
| `defers` | report common mistakes in defer statements <br/> The defers analyzer reports a diagnostic when a defer statement would result in a non-deferred call to time.Since, as experience has shown that this is nearly always a mistake. <br/> For example: <br/> <pre>start := time.Now()<br/>...<br/>defer recordLatency(time.Since(start)) // error: call to time.Since is not deferred</pre><br/> The correct code is: <br/> <pre>defer func() { recordLatency(time.Since(start)) }()</pre><br/> Default: `true` |
| `deprecated` | check for use of deprecated identifiers <br/> The deprecated analyzer looks for deprecated symbols and package imports. <br/> See https://go.dev/wiki/Deprecated to learn about Go's convention for documenting and signaling deprecated identifiers. <br/> Default: `true` |
| `directive` | check Go toolchain directives such as //go:debug <br/> This analyzer checks for problems with known Go toolchain directives in all Go source files in a package directory, even those excluded by //go:build constraints, and all non-Go source files too. <br/> For //go:debug (see https://go.dev/doc/godebug), the analyzer checks that the directives are placed only in Go source files, only above the package comment, and only in package main or *_test.go files. <br/> Support for other known directives may be added in the future. <br/> This analyzer does not check //go:build, which is handled by the buildtag analyzer. <br/> <br/> Default: `true` |
| `embed` | check //go:embed directive usage <br/> This analyzer checks that the embed package is imported if //go:embed directives are present, providing a suggested fix to add the import if it is missing. <br/> This analyzer also checks that //go:embed directives precede the declaration of a single variable. <br/> Default: `true` |
| `errorsas` | report passing non-pointer or non-error values to errors.As <br/> The errorsas analysis reports calls to errors.As where the type of the second argument is not a pointer to a type implementing error. <br/> Default: `true` |
| `fieldalignment` | find structs that would use less memory if their fields were sorted <br/> This analyzer find structs that can be rearranged to use less memory, and provides a suggested edit with the most compact order. <br/> Note that there are two different diagnostics reported. One checks struct size, and the other reports "pointer bytes" used. Pointer bytes is how many bytes of the object that the garbage collector has to potentially scan for pointers, for example: <br/> <pre>struct { uint32; string }</pre><br/> have 16 pointer bytes because the garbage collector has to scan up through the string's inner pointer. <br/> <pre>struct { string; *uint32 }</pre><br/> has 24 pointer bytes because it has to scan further through the *uint32. <br/> <pre>struct { string; uint32 }</pre><br/> has 8 because it can stop immediately after the string pointer. <br/> Be aware that the most compact order is not always the most efficient. In rare cases it may cause two variables each updated by its own goroutine to occupy the same CPU cache line, inducing a form of memory contention known as "false sharing" that slows down both goroutines. <br/> <br/> Default: `false` |
| `fillreturns` | suggest fixes for errors due to an incorrect number of return values <br/> This checker provides suggested fixes for type errors of the type "wrong number of return values (want %d, got %d)". For example: <br/> <pre>func m() (int, string, *bool, error) {<br/>	return<br/>}</pre><br/> will turn into <br/> <pre>func m() (int, string, *bool, error) {<br/>	return 0, "", nil, nil<br/>}</pre><br/> This functionality is similar to https://github.com/sqs/goreturns. <br/> Default: `true` |
| `framepointer` | report assembly that clobbers the frame pointer before saving it <br/> Default: `true` |
| `httpresponse` | check for mistakes using HTTP responses <br/> A common mistake when using the net/http package is to defer a function call to close the http.Response Body before checking the error that determines whether the response is valid: <br/> <pre>resp, err := http.Head(url)<br/>defer resp.Body.Close()<br/>if err != nil {<br/>	log.Fatal(err)<br/>}<br/>// (defer statement belongs here)</pre><br/> This checker helps uncover latent nil dereference bugs by reporting a diagnostic for such mistakes. <br/> Default: `true` |
| `ifaceassert` | detect impossible interface-to-interface type assertions <br/> This checker flags type assertions v.(T) and corresponding type-switch cases in which the static type V of v is an interface that cannot possibly implement the target interface T. This occurs when V and T contain methods with the same name but different signatures. Example: <br/> <pre>var v interface {<br/>	Read()<br/>}<br/>_ = v.(io.Reader)</pre><br/> The Read method in v has a different signature than the Read method in io.Reader, so this assertion cannot succeed. <br/> Default: `true` |
| `infertypeargs` | check for unnecessary type arguments in call expressions <br/> Explicit type arguments may be omitted from call expressions if they can be inferred from function arguments, or from other type arguments: <br/> <pre>func f[T any](T) {}<br/><br/><br/>func _() {<br/>	f[string]("foo") // string could be inferred<br/>}</pre><br/> <br/> Default: `true` |
| `loopclosure` | check references to loop variables from within nested functions <br/> This analyzer reports places where a function literal references the iteration variable of an enclosing loop, and the loop calls the function in such a way (e.g. with go or defer) that it may outlive the loop iteration and possibly observe the wrong value of the variable. <br/> Note: An iteration variable can only outlive a loop iteration in Go versions <=1.21. In Go 1.22 and later, the loop variable lifetimes changed to create a new iteration variable per loop iteration. (See go.dev/issue/60078.) <br/> In this example, all the deferred functions run after the loop has completed, so all observe the final value of v [<go1.22]. <br/> <pre>for _, v := range list {<br/>    defer func() {<br/>        use(v) // incorrect<br/>    }()<br/>}</pre><br/> One fix is to create a new variable for each iteration of the loop: <br/> <pre>for _, v := range list {<br/>    v := v // new var per iteration<br/>    defer func() {<br/>        use(v) // ok<br/>    }()<br/>}</pre><br/> After Go version 1.22, the previous two for loops are equivalent and both are correct. <br/> The next example uses a go statement and has a similar problem [<go1.22]. In addition, it has a data race because the loop updates v concurrent with the goroutines accessing it. <br/> <pre>for _, v := range elem {<br/>    go func() {<br/>        use(v)  // incorrect, and a data race<br/>    }()<br/>}</pre><br/> A fix is the same as before. The checker also reports problems in goroutines started by golang.org/x/sync/errgroup.Group. A hard-to-spot variant of this form is common in parallel tests: <br/> <pre>func Test(t *testing.T) {<br/>    for _, test := range tests {<br/>        t.Run(test.name, func(t *testing.T) {<br/>            t.Parallel()<br/>            use(test) // incorrect, and a data race<br/>        })<br/>    }<br/>}</pre><br/> The t.Parallel() call causes the rest of the function to execute concurrent with the loop [<go1.22]. <br/> The analyzer reports references only in the last statement, as it is not deep enough to understand the effects of subsequent statements that might render the reference benign. ("Last statement" is defined recursively in compound statements such as if, switch, and select.) <br/> See: https://golang.org/doc/go_faq.html#closures_and_goroutines <br/> Default: `true` |
| `lostcancel` | check cancel func returned by context.WithCancel is called <br/> The cancellation function returned by context.WithCancel, WithTimeout, and WithDeadline must be called or the new context will remain live until its parent context is cancelled. (The background context is never cancelled.) <br/> Default: `true` |
| `nilfunc` | check for useless comparisons between functions and nil <br/> A useless comparison is one like f == nil as opposed to f() == nil. <br/> Default: `true` |
| `nilness` | check for redundant or impossible nil comparisons <br/> The nilness checker inspects the control-flow graph of each function in a package and reports nil pointer dereferences, degenerate nil pointers, and panics with nil values. A degenerate comparison is of the form x==nil or x!=nil where x is statically known to be nil or non-nil. These are often a mistake, especially in control flow related to errors. Panics with nil values are checked because they are not detectable by <br/> <pre>if r := recover(); r != nil {</pre><br/> This check reports conditions such as: <br/> <pre>if f == nil { // impossible condition (f is a function)<br/>}</pre><br/> and: <br/> <pre>p := &v<br/>...<br/>if p != nil { // tautological condition<br/>}</pre><br/> and: <br/> <pre>if p == nil {<br/>	print(*p) // nil dereference<br/>}</pre><br/> and: <br/> <pre>if p == nil {<br/>	panic(p)<br/>}</pre><br/> Sometimes the control flow may be quite complex, making bugs hard to spot. In the example below, the err.Error expression is guaranteed to panic because, after the first return, err must be nil. The intervening loop is just a distraction. <br/> <pre>...<br/>err := g.Wait()<br/>if err != nil {<br/>	return err<br/>}<br/>partialSuccess := false<br/>for _, err := range errs {<br/>	if err == nil {<br/>		partialSuccess = true<br/>		break<br/>	}<br/>}<br/>if partialSuccess {<br/>	reportStatus(StatusMessage{<br/>		Code:   code.ERROR,<br/>		Detail: err.Error(), // "nil dereference in dynamic method call"<br/>	})<br/>	return nil<br/>}</pre><br/> ... <br/> Default: `true` |
| `nonewvars` | suggested fixes for "no new vars on left side of :=" <br/> This checker provides suggested fixes for type errors of the type "no new vars on left side of :=". For example: <br/> <pre>z := 1<br/>z := 2</pre><br/> will turn into <br/> <pre>z := 1<br/>z = 2</pre><br/> Default: `true` |
| `noresultvalues` | suggested fixes for unexpected return values <br/> This checker provides suggested fixes for type errors of the type "no result values expected" or "too many return values". For example: <br/> <pre>func z() { return nil }</pre><br/> will turn into <br/> <pre>func z() { return }</pre><br/> Default: `true` |
| `printf` | check consistency of Printf format strings and arguments <br/> The check applies to calls of the formatting functions such as [fmt.Printf] and [fmt.Sprintf], as well as any detected wrappers of those functions such as [log.Printf]. It reports a variety of mistakes such as syntax errors in the format string and mismatches (of number and type) between the verbs and their arguments. <br/> See the documentation of the fmt package for the complete set of format operators and their operand types. <br/> Default: `true` |
| `shadow` | check for possible unintended shadowing of variables <br/> This analyzer check for shadowed variables. A shadowed variable is a variable declared in an inner scope with the same name and type as a variable in an outer scope, and where the outer variable is mentioned after the inner one is declared. <br/> (This definition can be refined; the module generates too many false positives and is not yet enabled by default.) <br/> For example: <br/> <pre>func BadRead(f *os.File, buf []byte) error {<br/>	var err error<br/>	for {<br/>		n, err := f.Read(buf) // shadows the function variable 'err'<br/>		if err != nil {<br/>			break // causes return of wrong value<br/>		}<br/>		foo(buf)<br/>	}<br/>	return err<br/>}</pre><br/> Default: `false` |
| `shift` | check for shifts that equal or exceed the width of the integer <br/> Default: `true` |
| `sigchanyzer` | check for unbuffered channel of os.Signal <br/> This checker reports call expression of the form <br/> <pre>signal.Notify(c <-chan os.Signal, sig ...os.Signal),</pre><br/> where c is an unbuffered channel, which can be at risk of missing the signal. <br/> Default: `true` |
| `simplifycompositelit` | check for composite literal simplifications <br/> An array, slice, or map composite literal of the form: <br/> <pre>[]T{T{}, T{}}</pre><br/> will be simplified to: <br/> <pre>[]T{{}, {}}</pre><br/> This is one of the simplifications that "gofmt -s" applies. <br/> Default: `true` |
| `simplifyrange` | check for range statement simplifications <br/> A range of the form: <br/> <pre>for x, _ = range v {...}</pre><br/> will be simplified to: <br/> <pre>for x = range v {...}</pre><br/> A range of the form: <br/> <pre>for _ = range v {...}</pre><br/> will be simplified to: <br/> <pre>for range v {...}</pre><br/> This is one of the simplifications that "gofmt -s" applies. <br/> Default: `true` |
| `simplifyslice` | check for slice simplifications <br/> A slice expression of the form: <br/> <pre>s[a:len(s)]</pre><br/> will be simplified to: <br/> <pre>s[a:]</pre><br/> This is one of the simplifications that "gofmt -s" applies. <br/> Default: `true` |
| `slog` | check for invalid structured logging calls <br/> The slog checker looks for calls to functions from the log/slog package that take alternating key-value pairs. It reports calls where an argument in a key position is neither a string nor a slog.Attr, and where a final key is missing its value. For example,it would report <br/> <pre>slog.Warn("message", 11, "k") // slog.Warn arg "11" should be a string or a slog.Attr</pre><br/> and <br/> <pre>slog.Info("message", "k1", v1, "k2") // call to slog.Info missing a final value</pre><br/> Default: `true` |
| `sortslice` | check the argument type of sort.Slice <br/> sort.Slice requires an argument of a slice type. Check that the interface{} value passed to sort.Slice is actually a slice. <br/> Default: `true` |
| `stdmethods` | check signature of methods of well-known interfaces <br/> Sometimes a type may be intended to satisfy an interface but may fail to do so because of a mistake in its method signature. For example, the result of this WriteTo method should be (int64, error), not error, to satisfy io.WriterTo: <br/> <pre>type myWriterTo struct{...}<br/>func (myWriterTo) WriteTo(w io.Writer) error { ... }</pre><br/> This check ensures that each method whose name matches one of several well-known interface methods from the standard library has the correct signature for that interface. <br/> Checked method names include: <br/> <pre>Format GobEncode GobDecode MarshalJSON MarshalXML<br/>Peek ReadByte ReadFrom ReadRune Scan Seek<br/>UnmarshalJSON UnreadByte UnreadRune WriteByte<br/>WriteTo</pre><br/> Default: `true` |
| `stdversion` | report uses of too-new standard library symbols <br/> The stdversion analyzer reports references to symbols in the standard library that were introduced by a Go release higher than the one in force in the referring file. (Recall that the file's Go version is defined by the 'go' directive its module's go.mod file, or by a "//go:build go1.X" build tag at the top of the file.) <br/> The analyzer does not report a diagnostic for a reference to a "too new" field or method of a type that is itself "too new", as this may have false positives, for example if fields or methods are accessed through a type alias that is guarded by a Go version constraint. <br/> <br/> Default: `true` |
| `stringintconv` | check for string(int) conversions <br/> This checker flags conversions of the form string(x) where x is an integer (but not byte or rune) type. Such conversions are discouraged because they return the UTF-8 representation of the Unicode code point x, and not a decimal string representation of x as one might expect. Furthermore, if x denotes an invalid code point, the conversion cannot be statically rejected. <br/> For conversions that intend on using the code point, consider replacing them with string(rune(x)). Otherwise, strconv.Itoa and its equivalents return the string representation of the value in the desired base. <br/> Default: `true` |
| `structtag` | check that struct field tags conform to reflect.StructTag.Get <br/> Also report certain struct tags (json, xml) used with unexported fields. <br/> Default: `true` |
| `stubmethods` | detect missing methods and fix with stub implementations <br/> This analyzer detects type-checking errors due to missing methods in assignments from concrete types to interface types, and offers a suggested fix that will create a set of stub methods so that the concrete type satisfies the interface. <br/> For example, this function will not compile because the value NegativeErr{} does not implement the "error" interface: <br/> <pre>func sqrt(x float64) (float64, error) {<br/>	if x < 0 {<br/>		return 0, NegativeErr{} // error: missing method<br/>	}<br/>	...<br/>}</pre><br/> <pre>type NegativeErr struct{}</pre><br/> This analyzer will suggest a fix to declare this method: <br/> <pre>// Error implements error.Error.<br/>func (NegativeErr) Error() string {<br/>	panic("unimplemented")<br/>}</pre><br/> (At least, it appears to behave that way, but technically it doesn't use the SuggestedFix mechanism and the stub is created by logic in gopls's golang.stub function.) <br/> Default: `true` |
| `testinggoroutine` | report calls to (*testing.T).Fatal from goroutines started by a test <br/> Functions that abruptly terminate a test, such as the Fatal, Fatalf, FailNow, and Skip{,f,Now} methods of *testing.T, must be called from the test goroutine itself. This checker detects calls to these functions that occur within a goroutine started by the test. For example: <br/> <pre>func TestFoo(t *testing.T) {<br/>    go func() {<br/>        t.Fatal("oops") // error: (*T).Fatal called from non-test goroutine<br/>    }()<br/>}</pre><br/> Default: `true` |
| `tests` | check for common mistaken usages of tests and examples <br/> The tests checker walks Test, Benchmark, Fuzzing and Example functions checking malformed names, wrong signatures and examples documenting non-existent identifiers. <br/> Please see the documentation for package testing in golang.org/pkg/testing for the conventions that are enforced for Tests, Benchmarks, and Examples. <br/> Default: `true` |
| `timeformat` | check for calls of (time.Time).Format or time.Parse with 2006-02-01 <br/> The timeformat checker looks for time formats with the 2006-02-01 (yyyy-dd-mm) format. Internationally, "yyyy-dd-mm" does not occur in common calendar date standards, and so it is more likely that 2006-01-02 (yyyy-mm-dd) was intended. <br/> Default: `true` |
| `undeclaredname` | suggested fixes for "undeclared name: <>" <br/> This checker provides suggested fixes for type errors of the type "undeclared name: <>". It will either insert a new statement, such as: <br/> <pre><> :=</pre><br/> or a new function declaration, such as: <br/> <pre>func <>(inferred parameters) {<br/>	panic("implement me!")<br/>}</pre><br/> Default: `true` |
| `unmarshal` | report passing non-pointer or non-interface values to unmarshal <br/> The unmarshal analysis reports calls to functions such as json.Unmarshal in which the argument type is not a pointer or an interface. <br/> Default: `true` |
| `unreachable` | check for unreachable code <br/> The unreachable analyzer finds statements that execution can never reach because they are preceded by an return statement, a call to panic, an infinite loop, or similar constructs. <br/> Default: `true` |
| `unsafeptr` | check for invalid conversions of uintptr to unsafe.Pointer <br/> The unsafeptr analyzer reports likely incorrect uses of unsafe.Pointer to convert integers to pointers. A conversion from uintptr to unsafe.Pointer is invalid if it implies that there is a uintptr-typed word in memory that holds a pointer value, because that word will be invisible to stack copying and to the garbage collector. <br/> Default: `true` |
| `unusedparams` | check for unused parameters of functions <br/> The unusedparams analyzer checks functions to see if there are any parameters that are not being used. <br/> To ensure soundness, it ignores:   - "address-taken" functions, that is, functions that are used as     a value rather than being called directly; their signatures may     be required to conform to a func type.   - exported functions or methods, since they may be address-taken     in another package.   - unexported methods whose name matches an interface method     declared in the same package, since the method's signature     may be required to conform to the interface type.   - functions with empty bodies, or containing just a call to panic.   - parameters that are unnamed, or named "_", the blank identifier. <br/> The analyzer suggests a fix of replacing the parameter name by "_", but in such cases a deeper fix can be obtained by invoking the "Refactor: remove unused parameter" code action, which will eliminate the parameter entirely, along with all corresponding arguments at call sites, while taking care to preserve any side effects in the argument expressions; see https://github.com/golang/tools/releases/tag/gopls%2Fv0.14. <br/> Default: `true` |
| `unusedresult` | check for unused results of calls to some functions <br/> Some functions like fmt.Errorf return a result and have no side effects, so it is always a mistake to discard the result. Other functions may return an error that must not be ignored, or a cleanup operation that must be called. This analyzer reports calls to functions like these when the result of the call is ignored. <br/> The set of functions may be controlled using flags. <br/> Default: `true` |
| `unusedvariable` | check for unused variables and suggest fixes <br/> Default: `false` |
| `unusedwrite` | checks for unused writes <br/> The analyzer reports instances of writes to struct fields and arrays that are never read. Specifically, when a struct object or an array is copied, its elements are copied implicitly by the compiler, and any element write to this copy does nothing with the original object. <br/> For example: <br/> <pre>type T struct { x int }</pre><br/> <pre>func f(input []T) {<br/>	for i, v := range input {  // v is a copy<br/>		v.x = i  // unused write to field x<br/>	}<br/>}</pre><br/> Another example is about non-pointer receiver: <br/> <pre>type T struct { x int }</pre><br/> <pre>func (t T) f() {  // t is a copy<br/>	t.x = i  // unused write to field x<br/>}</pre><br/> Default: `true` |
| `useany` | check for constraints that could be simplified to "any" <br/> Default: `false` |
### `ui.diagnostic.analysisProgressReporting`

analysisProgressReporting controls whether gopls sends progress
notifications when construction of its index of analysis facts is taking a
long time. Cancelling these notifications will cancel the indexing task,
though it will restart after the next change in the workspace.

When a package is opened for the first time and heavyweight analyses such as
staticcheck are enabled, it can take a while to construct the index of
analysis facts for all its dependencies. The index is cached in the
filesystem, so subsequent analysis should be faster.


Default: `true`
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


Default: `"1s"`
### `ui.diagnostic.diagnosticsTrigger`

(Experimental) diagnosticsTrigger controls when to run diagnostics.
<br/>
Allowed Options:

* `Edit`: `"Edit"`: Trigger diagnostics on file edit and save. (default)
* `Save`: `"Save"`: Trigger diagnostics only on file save. Events like initial workspace load
or configuration change will still trigger diagnostics.


Default: `"Edit"`
### `ui.diagnostic.staticcheck`

(Experimental) staticcheck enables additional analyses from staticcheck.io.
These analyses are documented on
[Staticcheck's website](https://staticcheck.io/docs/checks/).


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

Modules matching the GOPRIVATE environment variable will not have
documentation links in hover.


Default: `"pkg.go.dev"`
### `ui.documentation.linksInHover`

linksInHover controls the presence of documentation links
in hover markdown.

Its legal values are:
- `false`, for no links;
- `true`, for links to the `linkTarget` domain; or
- `"gopls"`, for links to gopls' internal documentation viewer.


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

Default: `"FastFuzzy"`
### `ui.navigation.symbolScope`

symbolScope controls which packages are searched for workspace/symbol
requests. When the scope is "workspace", gopls searches only workspace
packages. When the scope is "all", gopls searches all loaded packages,
including dependencies and the standard library.
<br/>
Allowed Options:

* `all`: `"all"` matches symbols in any loaded package, including
dependencies.
* `workspace`: `"workspace"` matches symbols in workspace packages only.


Default: `"all"`
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
### `ui.noSemanticNumber`

(Experimental) noSemanticNumber  turns off the sending of the semantic token 'number'


Default: `false`
### `ui.noSemanticString`

(Experimental) noSemanticString turns off the sending of the semantic token 'string'


Default: `false`
### `ui.semanticTokens`

(Experimental) semanticTokens controls whether the LSP server will send
semantic tokens to the client.


Default: `false`
### `verboseOutput`

(For Debugging) verboseOutput enables additional debug logging.


Default: `false`

