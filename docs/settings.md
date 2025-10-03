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

This extension runs a few [third-party command-line tools](tools.md) found from the locations determined by the `PATH` or `Path` environment variable, and the settings such as `"go.alternateTools"` or `"go.toolsGopath"`. Configuring them in workspace settings allows users to conveniently select a different set of tools based on project's need, but also allows attackers to run arbitrary binaries on your machine if they successfully convince you to open a random repository. In order to reduce the security risk, the extension reads those settings from user settings by default. If the repository can be trusted and workspace settings must be used, you can mark the workspace as a trusted workspace using the `"Go: Toggle Workspace Trust Flag"` command.

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
| `substitutePath` | An array of mappings from a local path to the remote path that is used by the debuggee. The debug adapter will replace the local path with the remote path in all of the calls. Overridden by `remotePath` (in attach request). |
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
### `go.experiments`

Disable experimental features. These features are only available in the pre-release version.
| Properties | Description |
| --- | --- |
| `testExplorer` | Prefer the experimental test explorer <br/> Default: `true` |

Default:
```
{
	"testExplorer" :	true,
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
* `goformat`: Configurable gofmt, see https://github.com/mbenkmann/goformat. (Deprecated due to the lack of generics support)
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

`"assignVariableTypes"` controls inlay hints for variable types in assign statements:
```go
	i/* int*/, j/* int*/ := 0, len(r)-1
```


Default: `false`
### `go.inlayHints.compositeLiteralFields`

`"compositeLiteralFields"` inlay hints for composite literal field names:
```go
	{/*in: */"Hello, world", /*want: */"dlrow ,olleH"}
```


Default: `false`
### `go.inlayHints.compositeLiteralTypes`

`"compositeLiteralTypes"` controls inlay hints for composite literal types:
```go
	for _, c := range []struct {
		in, want string
	}{
		/*struct{ in string; want string }*/{"Hello, world", "dlrow ,olleH"},
	}
```


Default: `false`
### `go.inlayHints.constantValues`

`"constantValues"` controls inlay hints for constant values:
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

`"functionTypeParameters"` inlay hints for implicit type parameters on generic functions:
```go
	myFoo/*[int, string]*/(1, "hello")
```


Default: `false`
### `go.inlayHints.ignoredError`

`"ignoredError"` inlay hints for implicitly discarded errors:
```go
	f.Close() // ignore error
```
This check inserts an `// ignore error` hint following any
statement that is a function call whose error result is
implicitly ignored.

To suppress the hint, write an actual comment containing
"ignore error" following the call statement, or explictly
assign the result to a blank variable. A handful of common
functions such as `fmt.Println` are excluded from the
check.


Default: `false`
### `go.inlayHints.parameterNames`

`"parameterNames"` controls inlay hints for parameter names:
```go
	parseInt(/* str: */ "123", /* radix: */ 8)
```


Default: `false`
### `go.inlayHints.rangeVariableTypes`

`"rangeVariableTypes"` controls inlay hints for variable types in range statements:
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

Specifies an additional client-side linting tool that should be run by the Go extension. By default (unset), no additional linter is run. This feature is additional to diagnostics reported by the language server, gopls. Since Gopls incorporates the entire staticcheck analyzer suite, it is typically unnecessary to run the staticcheck tool as well. To configure gopls's linting, see the 'gopls.ui.diagnostic' settings.<br/>
Allowed Options:

* `staticcheck`: Run `staticcheck`.
* `golint`: Run `golint`.
* `golangci-lint`: Run `golangci-lint` v1.
* `golangci-lint-v2`: Run `golangci-lint` v2.
* `revive`: Run `revive`.

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

Vets code on file save using 'go tool vet'. Not applicable when using the language server's diagnostics.<br/>
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

templateExtensions gives the extensions of file names that are treated
as template files. (The extension
is the part of the file name after the final dot.)

### `build.workspaceFiles`

workspaceFiles configures the set of globs that match files defining the
logical build of the current workspace. Any on-disk changes to any files
matching a glob specified here will trigger a reload of the workspace.

This setting need only be customized in environments with a custom
GOPACKAGESDRIVER.

### `formatting.gofumpt`

gofumpt indicates if we should run gofumpt formatting.


Default: `false`
### `formatting.local`

local is the equivalent of the `goimports -local` flag, which puts
imports beginning with this string after third-party packages. It should
be the prefix of the import path whose imports should be grouped
separately.

It is used when tidying imports (during an LSP Organize
Imports request) or when inserting new ones (for example,
during completion); an LSP Formatting request merely sorts the
existing imports.


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
  }
...
}
```

| Properties | Description |
| --- | --- |
| `generate` | `"generate"`: Run `go generate` <br/> This codelens source annotates any `//go:generate` comments with commands to run `go generate` in this directory, on all directories recursively beneath this one. <br/> See [Generating code](https://go.dev/blog/generate) for more details. <br/> <br/> Default: `true` |
| `regenerate_cgo` | `"regenerate_cgo"`: Re-generate cgo declarations <br/> This codelens source annotates an `import "C"` declaration with a command to re-run the [cgo command](https://pkg.go.dev/cmd/cgo) to regenerate the corresponding Go declarations. <br/> Use this after editing the C code in comments attached to the import, or in C header files included by it. <br/> <br/> Default: `true` |
| `run_govulncheck` | (Experimental) `"run_govulncheck"`: Run govulncheck (legacy) <br/> This codelens source annotates the `module` directive in a go.mod file with a command to run Govulncheck asynchronously. <br/> [Govulncheck](https://go.dev/blog/vuln) is a static analysis tool that computes the set of functions reachable within your application, including dependencies; queries a database of known security vulnerabilities; and reports any potential problems it finds. <br/> <br/> Default: `false` |
| `test` | `"test"`: Run tests and benchmarks <br/> This codelens source annotates each `Test` and `Benchmark` function in a `*_test.go` file with a command to run it. <br/> This source is off by default because VS Code has a client-side custom UI for testing, and because progress notifications are not a great UX for streamed test output. See: - golang/go#67400 for a discussion of this feature. - https://github.com/joaotavora/eglot/discussions/1402   for an alternative approach. <br/> <br/> Default: `false` |
| `tidy` | `"tidy"`: Tidy go.mod file <br/> This codelens source annotates the `module` directive in a go.mod file with a command to run [`go mod tidy`](https://go.dev/ref/mod#go-mod-tidy), which ensures that the go.mod file matches the source code in the module. <br/> <br/> Default: `true` |
| `upgrade_dependency` | `"upgrade_dependency"`: Update dependencies <br/> This codelens source annotates the `module` directive in a go.mod file with commands to: <br/> - check for available upgrades, - upgrade direct dependencies, and - upgrade all dependencies transitively. <br/> <br/> Default: `true` |
| `vendor` | `"vendor"`: Update vendor directory <br/> This codelens source annotates the `module` directive in a go.mod file with a command to run [`go mod vendor`](https://go.dev/ref/mod#go-mod-vendor), which creates or updates the directory named `vendor` in the module root so that it contains an up-to-date copy of all necessary package dependencies. <br/> <br/> Default: `true` |
| `vulncheck` | (Experimental) `"vulncheck"`: Run govulncheck <br/> This codelens source annotates the `module` directive in a go.mod file with a command to run govulncheck synchronously. <br/> [Govulncheck](https://go.dev/blog/vuln) is a static analysis tool that computes the set of functions reachable within your application, including dependencies; queries a database of known security vulnerabilities; and reports any potential problems it finds. <br/> <br/> Default: `false` |
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
| `QF1001` | Apply De Morgan's law <br/> Available since     2021.1 <br/> <br/> Default: `false` |
| `QF1002` | Convert untagged switch to tagged switch <br/> An untagged switch that compares a single variable against a series of values can be replaced with a tagged switch. <br/> Before: <br/>     switch {     case x == 1 || x == 2, x == 3:         ...     case x == 4:         ...     default:         ...     } <br/> After: <br/>     switch x {     case 1, 2, 3:         ...     case 4:         ...     default:         ...     } <br/> Available since     2021.1 <br/> <br/> Default: `true` |
| `QF1003` | Convert if/else-if chain to tagged switch <br/> A series of if/else-if checks comparing the same variable against values can be replaced with a tagged switch. <br/> Before: <br/>     if x == 1 || x == 2 {         ...     } else if x == 3 {         ...     } else {         ...     } <br/> After: <br/>     switch x {     case 1, 2:         ...     case 3:         ...     default:         ...     } <br/> Available since     2021.1 <br/> <br/> Default: `true` |
| `QF1004` | Use strings.ReplaceAll instead of strings.Replace with n == -1 <br/> Available since     2021.1 <br/> <br/> Default: `true` |
| `QF1005` | Expand call to math.Pow <br/> Some uses of math.Pow can be simplified to basic multiplication. <br/> Before: <br/>     math.Pow(x, 2) <br/> After: <br/>     x * x <br/> Available since     2021.1 <br/> <br/> Default: `false` |
| `QF1006` | Lift if+break into loop condition <br/> Before: <br/>     for {         if done {             break         }         ...     } <br/> After: <br/>     for !done {         ...     } <br/> Available since     2021.1 <br/> <br/> Default: `false` |
| `QF1007` | Merge conditional assignment into variable declaration <br/> Before: <br/>     x := false     if someCondition {         x = true     } <br/> After: <br/>     x := someCondition <br/> Available since     2021.1 <br/> <br/> Default: `false` |
| `QF1008` | Omit embedded fields from selector expression <br/> Available since     2021.1 <br/> <br/> Default: `false` |
| `QF1009` | Use time.Time.Equal instead of == operator <br/> Available since     2021.1 <br/> <br/> Default: `true` |
| `QF1010` | Convert slice of bytes to string when printing it <br/> Available since     2021.1 <br/> <br/> Default: `true` |
| `QF1011` | Omit redundant type from variable declaration <br/> Available since     2021.1 <br/> <br/> Default: `false` |
| `QF1012` | Use fmt.Fprintf(x, ...) instead of x.Write(fmt.Sprintf(...)) <br/> Available since     2022.1 <br/> <br/> Default: `true` |
| `S1000` | Use plain channel send or receive instead of single-case select <br/> Select statements with a single case can be replaced with a simple send or receive. <br/> Before: <br/>     select {     case x := <-ch:         fmt.Println(x)     } <br/> After: <br/>     x := <-ch     fmt.Println(x) <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `S1001` | Replace for loop with call to copy <br/> Use copy() for copying elements from one slice to another. For arrays of identical size, you can use simple assignment. <br/> Before: <br/>     for i, x := range src {         dst[i] = x     } <br/> After: <br/>     copy(dst, src) <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `S1002` | Omit comparison with boolean constant <br/> Before: <br/>     if x == true {} <br/> After: <br/>     if x {} <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `S1003` | Replace call to strings.Index with strings.Contains <br/> Before: <br/>     if strings.Index(x, y) != -1 {} <br/> After: <br/>     if strings.Contains(x, y) {} <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `S1004` | Replace call to bytes.Compare with bytes.Equal <br/> Before: <br/>     if bytes.Compare(x, y) == 0 {} <br/> After: <br/>     if bytes.Equal(x, y) {} <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `S1005` | Drop unnecessary use of the blank identifier <br/> In many cases, assigning to the blank identifier is unnecessary. <br/> Before: <br/>     for _ = range s {}     x, _ = someMap[key]     _ = <-ch <br/> After: <br/>     for range s{}     x = someMap[key]     <-ch <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `S1006` | Use 'for { ... }' for infinite loops <br/> For infinite loops, using for { ... } is the most idiomatic choice. <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `S1007` | Simplify regular expression by using raw string literal <br/> Raw string literals use backticks instead of quotation marks and do not support any escape sequences. This means that the backslash can be used freely, without the need of escaping. <br/> Since regular expressions have their own escape sequences, raw strings can improve their readability. <br/> Before: <br/>     regexp.Compile("\\A(\\w+) profile: total \\d+\\n\\z") <br/> After: <br/>     regexp.Compile(`\A(\w+) profile: total \d+\n\z`) <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `S1008` | Simplify returning boolean expression <br/> Before: <br/>     if <expr> {         return true     }     return false <br/> After: <br/>     return <expr> <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `S1009` | Omit redundant nil check on slices, maps, and channels <br/> The len function is defined for all slices, maps, and channels, even nil ones, which have a length of zero. It is not necessary to check for nil before checking that their length is not zero. <br/> Before: <br/>     if x != nil && len(x) != 0 {} <br/> After: <br/>     if len(x) != 0 {} <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `S1010` | Omit default slice index <br/> When slicing, the second index defaults to the length of the value, making s[n:len(s)] and s[n:] equivalent. <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `S1011` | Use a single append to concatenate two slices <br/> Before: <br/>     for _, e := range y {         x = append(x, e)     }          for i := range y {         x = append(x, y[i])     }          for i := range y {         v := y[i]         x = append(x, v)     } <br/> After: <br/>     x = append(x, y...)     x = append(x, y...)     x = append(x, y...) <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `S1012` | Replace time.Now().Sub(x) with time.Since(x) <br/> The time.Since helper has the same effect as using time.Now().Sub(x) but is easier to read. <br/> Before: <br/>     time.Now().Sub(x) <br/> After: <br/>     time.Since(x) <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `S1016` | Use a type conversion instead of manually copying struct fields <br/> Two struct types with identical fields can be converted between each other. In older versions of Go, the fields had to have identical struct tags. Since Go 1.8, however, struct tags are ignored during conversions. It is thus not necessary to manually copy every field individually. <br/> Before: <br/>     var x T1     y := T2{         Field1: x.Field1,         Field2: x.Field2,     } <br/> After: <br/>     var x T1     y := T2(x) <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `S1017` | Replace manual trimming with strings.TrimPrefix <br/> Instead of using strings.HasPrefix and manual slicing, use the strings.TrimPrefix function. If the string doesn't start with the prefix, the original string will be returned. Using strings.TrimPrefix reduces complexity, and avoids common bugs, such as off-by-one mistakes. <br/> Before: <br/>     if strings.HasPrefix(str, prefix) {         str = str[len(prefix):]     } <br/> After: <br/>     str = strings.TrimPrefix(str, prefix) <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `S1018` | Use 'copy' for sliding elements <br/> copy() permits using the same source and destination slice, even with overlapping ranges. This makes it ideal for sliding elements in a slice. <br/> Before: <br/>     for i := 0; i < n; i++ {         bs[i] = bs[offset+i]     } <br/> After: <br/>     copy(bs[:n], bs[offset:]) <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `S1019` | Simplify 'make' call by omitting redundant arguments <br/> The 'make' function has default values for the length and capacity arguments. For channels, the length defaults to zero, and for slices, the capacity defaults to the length. <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `S1020` | Omit redundant nil check in type assertion <br/> Before: <br/>     if _, ok := i.(T); ok && i != nil {} <br/> After: <br/>     if _, ok := i.(T); ok {} <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `S1021` | Merge variable declaration and assignment <br/> Before: <br/>     var x uint     x = 1 <br/> After: <br/>     var x uint = 1 <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `S1023` | Omit redundant control flow <br/> Functions that have no return value do not need a return statement as the final statement of the function. <br/> Switches in Go do not have automatic fallthrough, unlike languages like C. It is not necessary to have a break statement as the final statement in a case block. <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `S1024` | Replace x.Sub(time.Now()) with time.Until(x) <br/> The time.Until helper has the same effect as using x.Sub(time.Now()) but is easier to read. <br/> Before: <br/>     x.Sub(time.Now()) <br/> After: <br/>     time.Until(x) <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `S1025` | Don't use fmt.Sprintf("%s", x) unnecessarily <br/> In many instances, there are easier and more efficient ways of getting a value's string representation. Whenever a value's underlying type is a string already, or the type has a String method, they should be used directly. <br/> Given the following shared definitions <br/>     type T1 string     type T2 int <br/>     func (T2) String() string { return "Hello, world" } <br/>     var x string     var y T1     var z T2 <br/> we can simplify <br/>     fmt.Sprintf("%s", x)     fmt.Sprintf("%s", y)     fmt.Sprintf("%s", z) <br/> to <br/>     x     string(y)     z.String() <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `S1028` | Simplify error construction with fmt.Errorf <br/> Before: <br/>     errors.New(fmt.Sprintf(...)) <br/> After: <br/>     fmt.Errorf(...) <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `S1029` | Range over the string directly <br/> Ranging over a string will yield byte offsets and runes. If the offset isn't used, this is functionally equivalent to converting the string to a slice of runes and ranging over that. Ranging directly over the string will be more performant, however, as it avoids allocating a new slice, the size of which depends on the length of the string. <br/> Before: <br/>     for _, r := range []rune(s) {} <br/> After: <br/>     for _, r := range s {} <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `S1030` | Use bytes.Buffer.String or bytes.Buffer.Bytes <br/> bytes.Buffer has both a String and a Bytes method. It is almost never necessary to use string(buf.Bytes()) or []byte(buf.String()) – simply use the other method. <br/> The only exception to this are map lookups. Due to a compiler optimization, m[string(buf.Bytes())] is more efficient than m[buf.String()]. <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `S1031` | Omit redundant nil check around loop <br/> You can use range on nil slices and maps, the loop will simply never execute. This makes an additional nil check around the loop unnecessary. <br/> Before: <br/>     if s != nil {         for _, x := range s {             ...         }     } <br/> After: <br/>     for _, x := range s {         ...     } <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `S1032` | Use sort.Ints(x), sort.Float64s(x), and sort.Strings(x) <br/> The sort.Ints, sort.Float64s and sort.Strings functions are easier to read than sort.Sort(sort.IntSlice(x)), sort.Sort(sort.Float64Slice(x)) and sort.Sort(sort.StringSlice(x)). <br/> Before: <br/>     sort.Sort(sort.StringSlice(x)) <br/> After: <br/>     sort.Strings(x) <br/> Available since     2019.1 <br/> <br/> Default: `true` |
| `S1033` | Unnecessary guard around call to 'delete' <br/> Calling delete on a nil map is a no-op. <br/> Available since     2019.2 <br/> <br/> Default: `true` |
| `S1034` | Use result of type assertion to simplify cases <br/> Available since     2019.2 <br/> <br/> Default: `true` |
| `S1035` | Redundant call to net/http.CanonicalHeaderKey in method call on net/http.Header <br/> The methods on net/http.Header, namely Add, Del, Get and Set, already canonicalize the given header name. <br/> Available since     2020.1 <br/> <br/> Default: `true` |
| `S1036` | Unnecessary guard around map access <br/> When accessing a map key that doesn't exist yet, one receives a zero value. Often, the zero value is a suitable value, for example when using append or doing integer math. <br/> The following <br/>     if _, ok := m["foo"]; ok {         m["foo"] = append(m["foo"], "bar")     } else {         m["foo"] = []string{"bar"}     } <br/> can be simplified to <br/>     m["foo"] = append(m["foo"], "bar") <br/> and <br/>     if _, ok := m2["k"]; ok {         m2["k"] += 4     } else {         m2["k"] = 4     } <br/> can be simplified to <br/>     m["k"] += 4 <br/> Available since     2020.1 <br/> <br/> Default: `true` |
| `S1037` | Elaborate way of sleeping <br/> Using a select statement with a single case receiving from the result of time.After is a very elaborate way of sleeping that can much simpler be expressed with a simple call to time.Sleep. <br/> Available since     2020.1 <br/> <br/> Default: `true` |
| `S1038` | Unnecessarily complex way of printing formatted string <br/> Instead of using fmt.Print(fmt.Sprintf(...)), one can use fmt.Printf(...). <br/> Available since     2020.1 <br/> <br/> Default: `true` |
| `S1039` | Unnecessary use of fmt.Sprint <br/> Calling fmt.Sprint with a single string argument is unnecessary and identical to using the string directly. <br/> Available since     2020.1 <br/> <br/> Default: `true` |
| `S1040` | Type assertion to current type <br/> The type assertion x.(SomeInterface), when x already has type SomeInterface, can only fail if x is nil. Usually, this is left-over code from when x had a different type and you can safely delete the type assertion. If you want to check that x is not nil, consider being explicit and using an actual if x == nil comparison instead of relying on the type assertion panicking. <br/> Available since     2021.1 <br/> <br/> Default: `true` |
| `SA1000` | Invalid regular expression <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA1001` | Invalid template <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA1002` | Invalid format in time.Parse <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA1003` | Unsupported argument to functions in encoding/binary <br/> The encoding/binary package can only serialize types with known sizes. This precludes the use of the int and uint types, as their sizes differ on different architectures. Furthermore, it doesn't support serializing maps, channels, strings, or functions. <br/> Before Go 1.8, bool wasn't supported, either. <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA1004` | Suspiciously small untyped constant in time.Sleep <br/> The time.Sleep function takes a time.Duration as its only argument. Durations are expressed in nanoseconds. Thus, calling time.Sleep(1) will sleep for 1 nanosecond. This is a common source of bugs, as sleep functions in other languages often accept seconds or milliseconds. <br/> The time package provides constants such as time.Second to express large durations. These can be combined with arithmetic to express arbitrary durations, for example 5 * time.Second for 5 seconds. <br/> If you truly meant to sleep for a tiny amount of time, use n * time.Nanosecond to signal to Staticcheck that you did mean to sleep for some amount of nanoseconds. <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA1005` | Invalid first argument to exec.Command <br/> os/exec runs programs directly (using variants of the fork and exec system calls on Unix systems). This shouldn't be confused with running a command in a shell. The shell will allow for features such as input redirection, pipes, and general scripting. The shell is also responsible for splitting the user's input into a program name and its arguments. For example, the equivalent to <br/>     ls / /tmp <br/> would be <br/>     exec.Command("ls", "/", "/tmp") <br/> If you want to run a command in a shell, consider using something like the following – but be aware that not all systems, particularly Windows, will have a /bin/sh program: <br/>     exec.Command("/bin/sh", "-c", "ls | grep Awesome") <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA1007` | Invalid URL in net/url.Parse <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA1008` | Non-canonical key in http.Header map <br/> Keys in http.Header maps are canonical, meaning they follow a specific combination of uppercase and lowercase letters. Methods such as http.Header.Add and http.Header.Del convert inputs into this canonical form before manipulating the map. <br/> When manipulating http.Header maps directly, as opposed to using the provided methods, care should be taken to stick to canonical form in order to avoid inconsistencies. The following piece of code demonstrates one such inconsistency: <br/>     h := http.Header{}     h["etag"] = []string{"1234"}     h.Add("etag", "5678")     fmt.Println(h) <br/>     // Output:     // map[Etag:[5678] etag:[1234]] <br/> The easiest way of obtaining the canonical form of a key is to use http.CanonicalHeaderKey. <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA1010` | (*regexp.Regexp).FindAll called with n == 0, which will always return zero results <br/> If n >= 0, the function returns at most n matches/submatches. To return all results, specify a negative number. <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA1011` | Various methods in the 'strings' package expect valid UTF-8, but invalid input is provided <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA1012` | A nil context.Context is being passed to a function, consider using context.TODO instead <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA1013` | io.Seeker.Seek is being called with the whence constant as the first argument, but it should be the second <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA1014` | Non-pointer value passed to Unmarshal or Decode <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA1015` | Using time.Tick in a way that will leak. Consider using time.NewTicker, and only use time.Tick in tests, commands and endless functions <br/> Before Go 1.23, time.Tickers had to be closed to be able to be garbage collected. Since time.Tick doesn't make it possible to close the underlying ticker, using it repeatedly would leak memory. <br/> Go 1.23 fixes this by allowing tickers to be collected even if they weren't closed. <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA1016` | Trapping a signal that cannot be trapped <br/> Not all signals can be intercepted by a process. Specifically, on UNIX-like systems, the syscall.SIGKILL and syscall.SIGSTOP signals are never passed to the process, but instead handled directly by the kernel. It is therefore pointless to try and handle these signals. <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA1017` | Channels used with os/signal.Notify should be buffered <br/> The os/signal package uses non-blocking channel sends when delivering signals. If the receiving end of the channel isn't ready and the channel is either unbuffered or full, the signal will be dropped. To avoid missing signals, the channel should be buffered and of the appropriate size. For a channel used for notification of just one signal value, a buffer of size 1 is sufficient. <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA1018` | strings.Replace called with n == 0, which does nothing <br/> With n == 0, zero instances will be replaced. To replace all instances, use a negative number, or use strings.ReplaceAll. <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA1020` | Using an invalid host:port pair with a net.Listen-related function <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA1021` | Using bytes.Equal to compare two net.IP <br/> A net.IP stores an IPv4 or IPv6 address as a slice of bytes. The length of the slice for an IPv4 address, however, can be either 4 or 16 bytes long, using different ways of representing IPv4 addresses. In order to correctly compare two net.IPs, the net.IP.Equal method should be used, as it takes both representations into account. <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA1023` | Modifying the buffer in an io.Writer implementation <br/> Write must not modify the slice data, even temporarily. <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA1024` | A string cutset contains duplicate characters <br/> The strings.TrimLeft and strings.TrimRight functions take cutsets, not prefixes. A cutset is treated as a set of characters to remove from a string. For example, <br/>     strings.TrimLeft("42133word", "1234") <br/> will result in the string "word" – any characters that are 1, 2, 3 or 4 are cut from the left of the string. <br/> In order to remove one string from another, use strings.TrimPrefix instead. <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA1025` | It is not possible to use (*time.Timer).Reset's return value correctly <br/> Available since     2019.1 <br/> <br/> Default: `false` |
| `SA1026` | Cannot marshal channels or functions <br/> Available since     2019.2 <br/> <br/> Default: `false` |
| `SA1027` | Atomic access to 64-bit variable must be 64-bit aligned <br/> On ARM, x86-32, and 32-bit MIPS, it is the caller's responsibility to arrange for 64-bit alignment of 64-bit words accessed atomically. The first word in a variable or in an allocated struct, array, or slice can be relied upon to be 64-bit aligned. <br/> You can use the structlayout tool to inspect the alignment of fields in a struct. <br/> Available since     2019.2 <br/> <br/> Default: `false` |
| `SA1028` | sort.Slice can only be used on slices <br/> The first argument of sort.Slice must be a slice. <br/> Available since     2020.1 <br/> <br/> Default: `false` |
| `SA1029` | Inappropriate key in call to context.WithValue <br/> The provided key must be comparable and should not be of type string or any other built-in type to avoid collisions between packages using context. Users of WithValue should define their own types for keys. <br/> To avoid allocating when assigning to an interface{}, context keys often have concrete type struct{}. Alternatively, exported context key variables' static type should be a pointer or interface. <br/> Available since     2020.1 <br/> <br/> Default: `false` |
| `SA1030` | Invalid argument in call to a strconv function <br/> This check validates the format, number base and bit size arguments of the various parsing and formatting functions in strconv. <br/> Available since     2021.1 <br/> <br/> Default: `false` |
| `SA1031` | Overlapping byte slices passed to an encoder <br/> In an encoding function of the form Encode(dst, src), dst and src were found to reference the same memory. This can result in src bytes being overwritten before they are read, when the encoder writes more than one byte per src byte. <br/> Available since     2024.1 <br/> <br/> Default: `false` |
| `SA1032` | Wrong order of arguments to errors.Is <br/> The first argument of the function errors.Is is the error that we have and the second argument is the error we're trying to match against. For example: <br/> <pre>if errors.Is(err, io.EOF) { ... }</pre><br/> This check detects some cases where the two arguments have been swapped. It flags any calls where the first argument is referring to a package-level error variable, such as <br/> <pre>if errors.Is(io.EOF, err) { /* this is wrong */ }</pre><br/> Available since     2024.1 <br/> <br/> Default: `false` |
| `SA2001` | Empty critical section, did you mean to defer the unlock? <br/> Empty critical sections of the kind <br/>     mu.Lock()     mu.Unlock() <br/> are very often a typo, and the following was intended instead: <br/>     mu.Lock()     defer mu.Unlock() <br/> Do note that sometimes empty critical sections can be useful, as a form of signaling to wait on another goroutine. Many times, there are simpler ways of achieving the same effect. When that isn't the case, the code should be amply commented to avoid confusion. Combining such comments with a //lint:ignore directive can be used to suppress this rare false positive. <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA2002` | Called testing.T.FailNow or SkipNow in a goroutine, which isn't allowed <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA2003` | Deferred Lock right after locking, likely meant to defer Unlock instead <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA3000` | TestMain doesn't call os.Exit, hiding test failures <br/> Test executables (and in turn 'go test') exit with a non-zero status code if any tests failed. When specifying your own TestMain function, it is your responsibility to arrange for this, by calling os.Exit with the correct code. The correct code is returned by (*testing.M).Run, so the usual way of implementing TestMain is to end it with os.Exit(m.Run()). <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA3001` | Assigning to b.N in benchmarks distorts the results <br/> The testing package dynamically sets b.N to improve the reliability of benchmarks and uses it in computations to determine the duration of a single operation. Benchmark code must not alter b.N as this would falsify results. <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA4000` | Binary operator has identical expressions on both sides <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA4001` | &*x gets simplified to x, it does not copy x <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA4003` | Comparing unsigned values against negative values is pointless <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA4004` | The loop exits unconditionally after one iteration <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA4005` | Field assignment that will never be observed. Did you mean to use a pointer receiver? <br/> Available since     2021.1 <br/> <br/> Default: `false` |
| `SA4006` | A value assigned to a variable is never read before being overwritten. Forgotten error check or dead code? <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA4008` | The variable in the loop condition never changes, are you incrementing the wrong variable? <br/> For example: <br/> <pre>for i := 0; i < 10; j++ { ... }</pre><br/> This may also occur when a loop can only execute once because of unconditional control flow that terminates the loop. For example, when a loop body contains an unconditional break, return, or panic: <br/> <pre>func f() {<br/>	panic("oops")<br/>}<br/>func g() {<br/>	for i := 0; i < 10; i++ {<br/>		// f unconditionally calls panic, which means "i" is<br/>		// never incremented.<br/>		f()<br/>	}<br/>}</pre><br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA4009` | A function argument is overwritten before its first use <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA4010` | The result of append will never be observed anywhere <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA4011` | Break statement with no effect. Did you mean to break out of an outer loop? <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA4012` | Comparing a value against NaN even though no value is equal to NaN <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA4013` | Negating a boolean twice (!!b) is the same as writing b. This is either redundant, or a typo. <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA4014` | An if/else if chain has repeated conditions and no side-effects; if the condition didn't match the first time, it won't match the second time, either <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA4015` | Calling functions like math.Ceil on floats converted from integers doesn't do anything useful <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA4016` | Certain bitwise operations, such as x ^ 0, do not do anything useful <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA4017` | Discarding the return values of a function without side effects, making the call pointless <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA4018` | Self-assignment of variables <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA4019` | Multiple, identical build constraints in the same file <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA4020` | Unreachable case clause in a type switch <br/> In a type switch like the following <br/>     type T struct{}     func (T) Read(b []byte) (int, error) { return 0, nil } <br/>     var v any = T{} <br/>     switch v.(type) {     case io.Reader:         // ...     case T:         // unreachable     } <br/> the second case clause can never be reached because T implements io.Reader and case clauses are evaluated in source order. <br/> Another example: <br/>     type T struct{}     func (T) Read(b []byte) (int, error) { return 0, nil }     func (T) Close() error { return nil } <br/>     var v any = T{} <br/>     switch v.(type) {     case io.Reader:         // ...     case io.ReadCloser:         // unreachable     } <br/> Even though T has a Close method and thus implements io.ReadCloser, io.Reader will always match first. The method set of io.Reader is a subset of io.ReadCloser. Thus it is impossible to match the second case without matching the first case. <br/> <br/> Structurally equivalent interfaces <br/> A special case of the previous example are structurally identical interfaces. Given these declarations <br/>     type T error     type V error <br/>     func doSomething() error {         err, ok := doAnotherThing()         if ok {             return T(err)         } <br/>         return U(err)     } <br/> the following type switch will have an unreachable case clause: <br/>     switch doSomething().(type) {     case T:         // ...     case V:         // unreachable     } <br/> T will always match before V because they are structurally equivalent and therefore doSomething()'s return value implements both. <br/> Available since     2019.2 <br/> <br/> Default: `true` |
| `SA4022` | Comparing the address of a variable against nil <br/> Code such as 'if &x == nil' is meaningless, because taking the address of a variable always yields a non-nil pointer. <br/> Available since     2020.1 <br/> <br/> Default: `true` |
| `SA4023` | Impossible comparison of interface value with untyped nil <br/> Under the covers, interfaces are implemented as two elements, a type T and a value V. V is a concrete value such as an int, struct or pointer, never an interface itself, and has type T. For instance, if we store the int value 3 in an interface, the resulting interface value has, schematically, (T=int, V=3). The value V is also known as the interface's dynamic value, since a given interface variable might hold different values V (and corresponding types T) during the execution of the program. <br/> An interface value is nil only if the V and T are both unset, (T=nil, V is not set), In particular, a nil interface will always hold a nil type. If we store a nil pointer of type *int inside an interface value, the inner type will be *int regardless of the value of the pointer: (T=*int, V=nil). Such an interface value will therefore be non-nil even when the pointer value V inside is nil. <br/> This situation can be confusing, and arises when a nil value is stored inside an interface value such as an error return: <br/>     func returnsError() error {         var p *MyError = nil         if bad() {             p = ErrBad         }         return p // Will always return a non-nil error.     } <br/> If all goes well, the function returns a nil p, so the return value is an error interface value holding (T=*MyError, V=nil). This means that if the caller compares the returned error to nil, it will always look as if there was an error even if nothing bad happened. To return a proper nil error to the caller, the function must return an explicit nil: <br/>     func returnsError() error {         if bad() {             return ErrBad         }         return nil     } <br/> It's a good idea for functions that return errors always to use the error type in their signature (as we did above) rather than a concrete type such as *MyError, to help guarantee the error is created correctly. As an example, os.Open returns an error even though, if not nil, it's always of concrete type *os.PathError. <br/> Similar situations to those described here can arise whenever interfaces are used. Just keep in mind that if any concrete value has been stored in the interface, the interface will not be nil. For more information, see The Laws of Reflection at https://golang.org/doc/articles/laws_of_reflection.html. <br/> This text has been copied from https://golang.org/doc/faq#nil_error, licensed under the Creative Commons Attribution 3.0 License. <br/> Available since     2020.2 <br/> <br/> Default: `false` |
| `SA4024` | Checking for impossible return value from a builtin function <br/> Return values of the len and cap builtins cannot be negative. <br/> See https://golang.org/pkg/builtin/#len and https://golang.org/pkg/builtin/#cap. <br/> Example: <br/>     if len(slice) < 0 {         fmt.Println("unreachable code")     } <br/> Available since     2021.1 <br/> <br/> Default: `true` |
| `SA4025` | Integer division of literals that results in zero <br/> When dividing two integer constants, the result will also be an integer. Thus, a division such as 2 / 3 results in 0. This is true for all of the following examples: <br/> <pre>_ = 2 / 3<br/>const _ = 2 / 3<br/>const _ float64 = 2 / 3<br/>_ = float64(2 / 3)</pre><br/> Staticcheck will flag such divisions if both sides of the division are integer literals, as it is highly unlikely that the division was intended to truncate to zero. Staticcheck will not flag integer division involving named constants, to avoid noisy positives. <br/> Available since     2021.1 <br/> <br/> Default: `true` |
| `SA4026` | Go constants cannot express negative zero <br/> In IEEE 754 floating point math, zero has a sign and can be positive or negative. This can be useful in certain numerical code. <br/> Go constants, however, cannot express negative zero. This means that the literals -0.0 and 0.0 have the same ideal value (zero) and will both represent positive zero at runtime. <br/> To explicitly and reliably create a negative zero, you can use the math.Copysign function: math.Copysign(0, -1). <br/> Available since     2021.1 <br/> <br/> Default: `true` |
| `SA4027` | (*net/url.URL).Query returns a copy, modifying it doesn't change the URL <br/> (*net/url.URL).Query parses the current value of net/url.URL.RawQuery and returns it as a map of type net/url.Values. Subsequent changes to this map will not affect the URL unless the map gets encoded and assigned to the URL's RawQuery. <br/> As a consequence, the following code pattern is an expensive no-op: u.Query().Add(key, value). <br/> Available since     2021.1 <br/> <br/> Default: `true` |
| `SA4028` | x % 1 is always zero <br/> Available since     2022.1 <br/> <br/> Default: `true` |
| `SA4029` | Ineffective attempt at sorting slice <br/> sort.Float64Slice, sort.IntSlice, and sort.StringSlice are types, not functions. Doing x = sort.StringSlice(x) does nothing, especially not sort any values. The correct usage is sort.Sort(sort.StringSlice(x)) or sort.StringSlice(x).Sort(), but there are more convenient helpers, namely sort.Float64s, sort.Ints, and sort.Strings. <br/> Available since     2022.1 <br/> <br/> Default: `true` |
| `SA4030` | Ineffective attempt at generating random number <br/> Functions in the math/rand package that accept upper limits, such as Intn, generate random numbers in the half-open interval [0,n). In other words, the generated numbers will be >= 0 and < n – they don't include n. rand.Intn(1) therefore doesn't generate 0 or 1, it always generates 0. <br/> Available since     2022.1 <br/> <br/> Default: `true` |
| `SA4031` | Checking never-nil value against nil <br/> Available since     2022.1 <br/> <br/> Default: `false` |
| `SA4032` | Comparing runtime.GOOS or runtime.GOARCH against impossible value <br/> Available since     2024.1 <br/> <br/> Default: `true` |
| `SA5000` | Assignment to nil map <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA5001` | Deferring Close before checking for a possible error <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA5002` | The empty for loop ('for {}') spins and can block the scheduler <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA5003` | Defers in infinite loops will never execute <br/> Defers are scoped to the surrounding function, not the surrounding block. In a function that never returns, i.e. one containing an infinite loop, defers will never execute. <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA5004` | 'for { select { ...' with an empty default branch spins <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA5005` | The finalizer references the finalized object, preventing garbage collection <br/> A finalizer is a function associated with an object that runs when the garbage collector is ready to collect said object, that is when the object is no longer referenced by anything. <br/> If the finalizer references the object, however, it will always remain as the final reference to that object, preventing the garbage collector from collecting the object. The finalizer will never run, and the object will never be collected, leading to a memory leak. That is why the finalizer should instead use its first argument to operate on the object. That way, the number of references can temporarily go to zero before the object is being passed to the finalizer. <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA5007` | Infinite recursive call <br/> A function that calls itself recursively needs to have an exit condition. Otherwise it will recurse forever, until the system runs out of memory. <br/> This issue can be caused by simple bugs such as forgetting to add an exit condition. It can also happen "on purpose". Some languages have tail call optimization which makes certain infinite recursive calls safe to use. Go, however, does not implement TCO, and as such a loop should be used instead. <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA5008` | Invalid struct tag <br/> Available since     2019.2 <br/> <br/> Default: `true` |
| `SA5010` | Impossible type assertion <br/> Some type assertions can be statically proven to be impossible. This is the case when the method sets of both arguments of the type assertion conflict with each other, for example by containing the same method with different signatures. <br/> The Go compiler already applies this check when asserting from an interface value to a concrete type. If the concrete type misses methods from the interface, or if function signatures don't match, then the type assertion can never succeed. <br/> This check applies the same logic when asserting from one interface to another. If both interface types contain the same method but with different signatures, then the type assertion can never succeed, either. <br/> Available since     2020.1 <br/> <br/> Default: `false` |
| `SA5011` | Possible nil pointer dereference <br/> A pointer is being dereferenced unconditionally, while also being checked against nil in another place. This suggests that the pointer may be nil and dereferencing it may panic. This is commonly a result of improperly ordered code or missing return statements. Consider the following examples: <br/>     func fn(x *int) {         fmt.Println(*x) <br/>         // This nil check is equally important for the previous dereference         if x != nil {             foo(*x)         }     } <br/>     func TestFoo(t *testing.T) {         x := compute()         if x == nil {             t.Errorf("nil pointer received")         } <br/>         // t.Errorf does not abort the test, so if x is nil, the next line will panic.         foo(*x)     } <br/> Staticcheck tries to deduce which functions abort control flow. For example, it is aware that a function will not continue execution after a call to panic or log.Fatal. However, sometimes this detection fails, in particular in the presence of conditionals. Consider the following example: <br/>     func Log(msg string, level int) {         fmt.Println(msg)         if level == levelFatal {             os.Exit(1)         }     } <br/>     func Fatal(msg string) {         Log(msg, levelFatal)     } <br/>     func fn(x *int) {         if x == nil {             Fatal("unexpected nil pointer")         }         fmt.Println(*x)     } <br/> Staticcheck will flag the dereference of x, even though it is perfectly safe. Staticcheck is not able to deduce that a call to Fatal will exit the program. For the time being, the easiest workaround is to modify the definition of Fatal like so: <br/>     func Fatal(msg string) {         Log(msg, levelFatal)         panic("unreachable")     } <br/> We also hard-code functions from common logging packages such as logrus. Please file an issue if we're missing support for a popular package. <br/> Available since     2020.1 <br/> <br/> Default: `false` |
| `SA5012` | Passing odd-sized slice to function expecting even size <br/> Some functions that take slices as parameters expect the slices to have an even number of elements.  Often, these functions treat elements in a slice as pairs.  For example, strings.NewReplacer takes pairs of old and new strings,  and calling it with an odd number of elements would be an error. <br/> Available since     2020.2 <br/> <br/> Default: `false` |
| `SA6000` | Using regexp.Match or related in a loop, should use regexp.Compile <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA6001` | Missing an optimization opportunity when indexing maps by byte slices <br/> Map keys must be comparable, which precludes the use of byte slices. This usually leads to using string keys and converting byte slices to strings. <br/> Normally, a conversion of a byte slice to a string needs to copy the data and causes allocations. The compiler, however, recognizes m[string(b)] and uses the data of b directly, without copying it, because it knows that the data can't change during the map lookup. This leads to the counter-intuitive situation that <br/>     k := string(b)     println(m[k])     println(m[k]) <br/> will be less efficient than <br/>     println(m[string(b)])     println(m[string(b)]) <br/> because the first version needs to copy and allocate, while the second one does not. <br/> For some history on this optimization, check out commit f5f5a8b6209f84961687d993b93ea0d397f5d5bf in the Go repository. <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA6002` | Storing non-pointer values in sync.Pool allocates memory <br/> A sync.Pool is used to avoid unnecessary allocations and reduce the amount of work the garbage collector has to do. <br/> When passing a value that is not a pointer to a function that accepts an interface, the value needs to be placed on the heap, which means an additional allocation. Slices are a common thing to put in sync.Pools, and they're structs with 3 fields (length, capacity, and a pointer to an array). In order to avoid the extra allocation, one should store a pointer to the slice instead. <br/> See the comments on https://go-review.googlesource.com/c/go/+/24371 that discuss this problem. <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA6003` | Converting a string to a slice of runes before ranging over it <br/> You may want to loop over the runes in a string. Instead of converting the string to a slice of runes and looping over that, you can loop over the string itself. That is, <br/>     for _, r := range s {} <br/> and <br/>     for _, r := range []rune(s) {} <br/> will yield the same values. The first version, however, will be faster and avoid unnecessary memory allocations. <br/> Do note that if you are interested in the indices, ranging over a string and over a slice of runes will yield different indices. The first one yields byte offsets, while the second one yields indices in the slice of runes. <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA6005` | Inefficient string comparison with strings.ToLower or strings.ToUpper <br/> Converting two strings to the same case and comparing them like so <br/>     if strings.ToLower(s1) == strings.ToLower(s2) {         ...     } <br/> is significantly more expensive than comparing them with strings.EqualFold(s1, s2). This is due to memory usage as well as computational complexity. <br/> strings.ToLower will have to allocate memory for the new strings, as well as convert both strings fully, even if they differ on the very first byte. strings.EqualFold, on the other hand, compares the strings one character at a time. It doesn't need to create two intermediate strings and can return as soon as the first non-matching character has been found. <br/> For a more in-depth explanation of this issue, see https://blog.digitalocean.com/how-to-efficiently-compare-strings-in-go/ <br/> Available since     2019.2 <br/> <br/> Default: `true` |
| `SA6006` | Using io.WriteString to write []byte <br/> Using io.WriteString to write a slice of bytes, as in <br/>     io.WriteString(w, string(b)) <br/> is both unnecessary and inefficient. Converting from []byte to string has to allocate and copy the data, and we could simply use w.Write(b) instead. <br/> Available since     2024.1 <br/> <br/> Default: `true` |
| `SA9001` | Defers in range loops may not run when you expect them to <br/> Available since     2017.1 <br/> <br/> Default: `false` |
| `SA9002` | Using a non-octal os.FileMode that looks like it was meant to be in octal. <br/> Available since     2017.1 <br/> <br/> Default: `true` |
| `SA9003` | Empty body in an if or else branch <br/> Available since     2017.1, non-default <br/> <br/> Default: `false` |
| `SA9004` | Only the first constant has an explicit type <br/> In a constant declaration such as the following: <br/>     const (         First byte = 1         Second     = 2     ) <br/> the constant Second does not have the same type as the constant First. This construct shouldn't be confused with <br/>     const (         First byte = iota         Second     ) <br/> where First and Second do indeed have the same type. The type is only passed on when no explicit value is assigned to the constant. <br/> When declaring enumerations with explicit values it is therefore important not to write <br/>     const (           EnumFirst EnumType = 1           EnumSecond         = 2           EnumThird          = 3     ) <br/> This discrepancy in types can cause various confusing behaviors and bugs. <br/> <br/> Wrong type in variable declarations <br/> The most obvious issue with such incorrect enumerations expresses itself as a compile error: <br/>     package pkg <br/>     const (         EnumFirst  uint8 = 1         EnumSecond       = 2     ) <br/>     func fn(useFirst bool) {         x := EnumSecond         if useFirst {             x = EnumFirst         }     } <br/> fails to compile with <br/>     ./const.go:11:5: cannot use EnumFirst (type uint8) as type int in assignment <br/> <br/> Losing method sets <br/> A more subtle issue occurs with types that have methods and optional interfaces. Consider the following: <br/>     package main <br/>     import "fmt" <br/>     type Enum int <br/>     func (e Enum) String() string {         return "an enum"     } <br/>     const (         EnumFirst  Enum = 1         EnumSecond      = 2     ) <br/>     func main() {         fmt.Println(EnumFirst)         fmt.Println(EnumSecond)     } <br/> This code will output <br/>     an enum     2 <br/> as EnumSecond has no explicit type, and thus defaults to int. <br/> Available since     2019.1 <br/> <br/> Default: `true` |
| `SA9005` | Trying to marshal a struct with no public fields nor custom marshaling <br/> The encoding/json and encoding/xml packages only operate on exported fields in structs, not unexported ones. It is usually an error to try to (un)marshal structs that only consist of unexported fields. <br/> This check will not flag calls involving types that define custom marshaling behavior, e.g. via MarshalJSON methods. It will also not flag empty structs. <br/> Available since     2019.2 <br/> <br/> Default: `false` |
| `SA9006` | Dubious bit shifting of a fixed size integer value <br/> Bit shifting a value past its size will always clear the value. <br/> For instance: <br/>     v := int8(42)     v >>= 8 <br/> will always result in 0. <br/> This check flags bit shifting operations on fixed size integer values only. That is, int, uint and uintptr are never flagged to avoid potential false positives in somewhat exotic but valid bit twiddling tricks: <br/>     // Clear any value above 32 bits if integers are more than 32 bits.     func f(i int) int {         v := i >> 32         v = v << 32         return i-v     } <br/> Available since     2020.2 <br/> <br/> Default: `true` |
| `SA9007` | Deleting a directory that shouldn't be deleted <br/> It is virtually never correct to delete system directories such as /tmp or the user's home directory. However, it can be fairly easy to do by mistake, for example by mistakenly using os.TempDir instead of ioutil.TempDir, or by forgetting to add a suffix to the result of os.UserHomeDir. <br/> Writing <br/>     d := os.TempDir()     defer os.RemoveAll(d) <br/> in your unit tests will have a devastating effect on the stability of your system. <br/> This check flags attempts at deleting the following directories: <br/> - os.TempDir - os.UserCacheDir - os.UserConfigDir - os.UserHomeDir <br/> Available since     2022.1 <br/> <br/> Default: `false` |
| `SA9008` | else branch of a type assertion is probably not reading the right value <br/> When declaring variables as part of an if statement (like in 'if foo := ...; foo {'), the same variables will also be in the scope of the else branch. This means that in the following example <br/>     if x, ok := x.(int); ok {         // ...     } else {         fmt.Printf("unexpected type %T", x)     } <br/> x in the else branch will refer to the x from x, ok :=; it will not refer to the x that is being type-asserted. The result of a failed type assertion is the zero value of the type that is being asserted to, so x in the else branch will always have the value 0 and the type int. <br/> Available since     2022.1 <br/> <br/> Default: `false` |
| `SA9009` | Ineffectual Go compiler directive <br/> A potential Go compiler directive was found, but is ineffectual as it begins with whitespace. <br/> Available since     2024.1 <br/> <br/> Default: `true` |
| `ST1000` | Incorrect or missing package comment <br/> Packages must have a package comment that is formatted according to the guidelines laid out in https://go.dev/wiki/CodeReviewComments#package-comments. <br/> Available since     2019.1, non-default <br/> <br/> Default: `false` |
| `ST1001` | Dot imports are discouraged <br/> Dot imports that aren't in external test packages are discouraged. <br/> The dot_import_whitelist option can be used to whitelist certain imports. <br/> Quoting Go Code Review Comments: <br/> > The import . form can be useful in tests that, due to circular > dependencies, cannot be made part of the package being tested: >  >     package foo_test >  >     import ( >         "bar/testutil" // also imports "foo" >         . "foo" >     ) >  > In this case, the test file cannot be in package foo because it > uses bar/testutil, which imports foo. So we use the import . > form to let the file pretend to be part of package foo even though > it is not. Except for this one case, do not use import . in your > programs. It makes the programs much harder to read because it is > unclear whether a name like Quux is a top-level identifier in the > current package or in an imported package. <br/> Available since     2019.1 <br/> Options     dot_import_whitelist <br/> <br/> Default: `false` |
| `ST1003` | Poorly chosen identifier <br/> Identifiers, such as variable and package names, follow certain rules. <br/> See the following links for details: <br/> - https://go.dev/doc/effective_go#package-names - https://go.dev/doc/effective_go#mixed-caps - https://go.dev/wiki/CodeReviewComments#initialisms - https://go.dev/wiki/CodeReviewComments#variable-names <br/> Available since     2019.1, non-default <br/> Options     initialisms <br/> <br/> Default: `false` |
| `ST1005` | Incorrectly formatted error string <br/> Error strings follow a set of guidelines to ensure uniformity and good composability. <br/> Quoting Go Code Review Comments: <br/> > Error strings should not be capitalized (unless beginning with > proper nouns or acronyms) or end with punctuation, since they are > usually printed following other context. That is, use > fmt.Errorf("something bad") not fmt.Errorf("Something bad"), so > that log.Printf("Reading %s: %v", filename, err) formats without a > spurious capital letter mid-message. <br/> Available since     2019.1 <br/> <br/> Default: `false` |
| `ST1006` | Poorly chosen receiver name <br/> Quoting Go Code Review Comments: <br/> > The name of a method's receiver should be a reflection of its > identity; often a one or two letter abbreviation of its type > suffices (such as "c" or "cl" for "Client"). Don't use generic > names such as "me", "this" or "self", identifiers typical of > object-oriented languages that place more emphasis on methods as > opposed to functions. The name need not be as descriptive as that > of a method argument, as its role is obvious and serves no > documentary purpose. It can be very short as it will appear on > almost every line of every method of the type; familiarity admits > brevity. Be consistent, too: if you call the receiver "c" in one > method, don't call it "cl" in another. <br/> Available since     2019.1 <br/> <br/> Default: `false` |
| `ST1008` | A function's error value should be its last return value <br/> A function's error value should be its last return value. <br/> Available since     2019.1 <br/> <br/> Default: `false` |
| `ST1011` | Poorly chosen name for variable of type time.Duration <br/> time.Duration values represent an amount of time, which is represented as a count of nanoseconds. An expression like 5 * time.Microsecond yields the value 5000. It is therefore not appropriate to suffix a variable of type time.Duration with any time unit, such as Msec or Milli. <br/> Available since     2019.1 <br/> <br/> Default: `false` |
| `ST1012` | Poorly chosen name for error variable <br/> Error variables that are part of an API should be called errFoo or ErrFoo. <br/> Available since     2019.1 <br/> <br/> Default: `false` |
| `ST1013` | Should use constants for HTTP error codes, not magic numbers <br/> HTTP has a tremendous number of status codes. While some of those are well known (200, 400, 404, 500), most of them are not. The net/http package provides constants for all status codes that are part of the various specifications. It is recommended to use these constants instead of hard-coding magic numbers, to vastly improve the readability of your code. <br/> Available since     2019.1 <br/> Options     http_status_code_whitelist <br/> <br/> Default: `false` |
| `ST1015` | A switch's default case should be the first or last case <br/> Available since     2019.1 <br/> <br/> Default: `false` |
| `ST1016` | Use consistent method receiver names <br/> Available since     2019.1, non-default <br/> <br/> Default: `false` |
| `ST1017` | Don't use Yoda conditions <br/> Yoda conditions are conditions of the kind 'if 42 == x', where the literal is on the left side of the comparison. These are a common idiom in languages in which assignment is an expression, to avoid bugs of the kind 'if (x = 42)'. In Go, which doesn't allow for this kind of bug, we prefer the more idiomatic 'if x == 42'. <br/> Available since     2019.2 <br/> <br/> Default: `false` |
| `ST1018` | Avoid zero-width and control characters in string literals <br/> Available since     2019.2 <br/> <br/> Default: `false` |
| `ST1019` | Importing the same package multiple times <br/> Go allows importing the same package multiple times, as long as different import aliases are being used. That is, the following bit of code is valid: <br/>     import (         "fmt"         fumpt "fmt"         format "fmt"         _ "fmt"     ) <br/> However, this is very rarely done on purpose. Usually, it is a sign of code that got refactored, accidentally adding duplicate import statements. It is also a rarely known feature, which may contribute to confusion. <br/> Do note that sometimes, this feature may be used intentionally (see for example https://github.com/golang/go/commit/3409ce39bfd7584523b7a8c150a310cea92d879d) – if you want to allow this pattern in your code base, you're advised to disable this check. <br/> Available since     2020.1 <br/> <br/> Default: `false` |
| `ST1020` | The documentation of an exported function should start with the function's name <br/> Doc comments work best as complete sentences, which allow a wide variety of automated presentations. The first sentence should be a one-sentence summary that starts with the name being declared. <br/> If every doc comment begins with the name of the item it describes, you can use the doc subcommand of the go tool and run the output through grep. <br/> See https://go.dev/doc/effective_go#commentary for more information on how to write good documentation. <br/> Available since     2020.1, non-default <br/> <br/> Default: `false` |
| `ST1021` | The documentation of an exported type should start with type's name <br/> Doc comments work best as complete sentences, which allow a wide variety of automated presentations. The first sentence should be a one-sentence summary that starts with the name being declared. <br/> If every doc comment begins with the name of the item it describes, you can use the doc subcommand of the go tool and run the output through grep. <br/> See https://go.dev/doc/effective_go#commentary for more information on how to write good documentation. <br/> Available since     2020.1, non-default <br/> <br/> Default: `false` |
| `ST1022` | The documentation of an exported variable or constant should start with variable's name <br/> Doc comments work best as complete sentences, which allow a wide variety of automated presentations. The first sentence should be a one-sentence summary that starts with the name being declared. <br/> If every doc comment begins with the name of the item it describes, you can use the doc subcommand of the go tool and run the output through grep. <br/> See https://go.dev/doc/effective_go#commentary for more information on how to write good documentation. <br/> Available since     2020.1, non-default <br/> <br/> Default: `false` |
| `ST1023` | Redundant type in variable declaration <br/> Available since     2021.1, non-default <br/> <br/> Default: `false` |
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
| `fillreturns` | suggest fixes for errors due to an incorrect number of return values <br/> This checker provides suggested fixes for type errors of the type "wrong number of return values (want %d, got %d)". For example: <br/> <pre>func m() (int, string, *bool, error) {<br/>	return<br/>}</pre><br/> will turn into <br/> <pre>func m() (int, string, *bool, error) {<br/>	return 0, "", nil, nil<br/>}</pre><br/> This functionality is similar to https://github.com/sqs/goreturns. <br/> Default: `true` |
| `framepointer` | report assembly that clobbers the frame pointer before saving it <br/> Default: `true` |
| `gofix` | apply fixes based on go:fix comment directives <br/> The gofix analyzer inlines functions and constants that are marked for inlining. <br/> ## Functions <br/> Given a function that is marked for inlining, like this one: <br/> <pre>//go:fix inline<br/>func Square(x int) int { return Pow(x, 2) }</pre><br/> this analyzer will recommend that calls to the function elsewhere, in the same or other packages, should be inlined. <br/> Inlining can be used to move off of a deprecated function: <br/> <pre>// Deprecated: prefer Pow(x, 2).<br/>//go:fix inline<br/>func Square(x int) int { return Pow(x, 2) }</pre><br/> It can also be used to move off of an obsolete package, as when the import path has changed or a higher major version is available: <br/> <pre>package pkg</pre><br/> <pre>import pkg2 "pkg/v2"</pre><br/> <pre>//go:fix inline<br/>func F() { pkg2.F(nil) }</pre><br/> Replacing a call pkg.F() by pkg2.F(nil) can have no effect on the program, so this mechanism provides a low-risk way to update large numbers of calls. We recommend, where possible, expressing the old API in terms of the new one to enable automatic migration. <br/> The inliner takes care to avoid behavior changes, even subtle ones, such as changes to the order in which argument expressions are evaluated. When it cannot safely eliminate all parameter variables, it may introduce a "binding declaration" of the form <br/> <pre>var params = args</pre><br/> to evaluate argument expressions in the correct order and bind them to parameter variables. Since the resulting code transformation may be stylistically suboptimal, such inlinings may be disabled by specifying the -gofix.allow_binding_decl=false flag to the analyzer driver. <br/> (In cases where it is not safe to "reduce" a call—that is, to replace a call f(x) by the body of function f, suitably substituted—the inliner machinery is capable of replacing f by a function literal, func(){...}(). However, the gofix analyzer discards all such "literalizations" unconditionally, again on grounds of style.) <br/> ## Constants <br/> Given a constant that is marked for inlining, like this one: <br/> <pre>//go:fix inline<br/>const Ptr = Pointer</pre><br/> this analyzer will recommend that uses of Ptr should be replaced with Pointer. <br/> As with functions, inlining can be used to replace deprecated constants and constants in obsolete packages. <br/> A constant definition can be marked for inlining only if it refers to another named constant. <br/> The "//go:fix inline" comment must appear before a single const declaration on its own, as above; before a const declaration that is part of a group, as in this case: <br/> <pre>const (<br/>   C = 1<br/>   //go:fix inline<br/>   Ptr = Pointer<br/>)</pre><br/> or before a group, applying to every constant in the group: <br/> <pre>//go:fix inline<br/>const (<br/>	Ptr = Pointer<br/>    Val = Value<br/>)</pre><br/> The proposal https://go.dev/issue/32816 introduces the "//go:fix" directives. <br/> You can use this (officially unsupported) command to apply gofix fixes en masse: <br/> <pre>$ go run golang.org/x/tools/internal/gofix/cmd/gofix@latest -test ./...</pre><br/> (Do not use "go get -tool" to add gopls as a dependency of your module; gopls commands must be built from their release branch.) <br/> Default: `true` |
| `hostport` | check format of addresses passed to net.Dial <br/> This analyzer flags code that produce network address strings using fmt.Sprintf, as in this example: <br/>     addr := fmt.Sprintf("%s:%d", host, 12345) // "will not work with IPv6"     ...     conn, err := net.Dial("tcp", addr)       // "when passed to dial here" <br/> The analyzer suggests a fix to use the correct approach, a call to net.JoinHostPort: <br/>     addr := net.JoinHostPort(host, "12345")     ...     conn, err := net.Dial("tcp", addr) <br/> A similar diagnostic and fix are produced for a format string of "%s:%s". <br/> <br/> Default: `true` |
| `httpresponse` | check for mistakes using HTTP responses <br/> A common mistake when using the net/http package is to defer a function call to close the http.Response Body before checking the error that determines whether the response is valid: <br/> <pre>resp, err := http.Head(url)<br/>defer resp.Body.Close()<br/>if err != nil {<br/>	log.Fatal(err)<br/>}<br/>// (defer statement belongs here)</pre><br/> This checker helps uncover latent nil dereference bugs by reporting a diagnostic for such mistakes. <br/> Default: `true` |
| `ifaceassert` | detect impossible interface-to-interface type assertions <br/> This checker flags type assertions v.(T) and corresponding type-switch cases in which the static type V of v is an interface that cannot possibly implement the target interface T. This occurs when V and T contain methods with the same name but different signatures. Example: <br/> <pre>var v interface {<br/>	Read()<br/>}<br/>_ = v.(io.Reader)</pre><br/> The Read method in v has a different signature than the Read method in io.Reader, so this assertion cannot succeed. <br/> Default: `true` |
| `infertypeargs` | check for unnecessary type arguments in call expressions <br/> Explicit type arguments may be omitted from call expressions if they can be inferred from function arguments, or from other type arguments: <br/> <pre>func f[T any](T) {}<br/><br/><br/>func _() {<br/>	f[string]("foo") // string could be inferred<br/>}</pre><br/> <br/> Default: `true` |
| `loopclosure` | check references to loop variables from within nested functions <br/> This analyzer reports places where a function literal references the iteration variable of an enclosing loop, and the loop calls the function in such a way (e.g. with go or defer) that it may outlive the loop iteration and possibly observe the wrong value of the variable. <br/> Note: An iteration variable can only outlive a loop iteration in Go versions <=1.21. In Go 1.22 and later, the loop variable lifetimes changed to create a new iteration variable per loop iteration. (See go.dev/issue/60078.) <br/> In this example, all the deferred functions run after the loop has completed, so all observe the final value of v [<go1.22]. <br/> <pre>for _, v := range list {<br/>    defer func() {<br/>        use(v) // incorrect<br/>    }()<br/>}</pre><br/> One fix is to create a new variable for each iteration of the loop: <br/> <pre>for _, v := range list {<br/>    v := v // new var per iteration<br/>    defer func() {<br/>        use(v) // ok<br/>    }()<br/>}</pre><br/> After Go version 1.22, the previous two for loops are equivalent and both are correct. <br/> The next example uses a go statement and has a similar problem [<go1.22]. In addition, it has a data race because the loop updates v concurrent with the goroutines accessing it. <br/> <pre>for _, v := range elem {<br/>    go func() {<br/>        use(v)  // incorrect, and a data race<br/>    }()<br/>}</pre><br/> A fix is the same as before. The checker also reports problems in goroutines started by golang.org/x/sync/errgroup.Group. A hard-to-spot variant of this form is common in parallel tests: <br/> <pre>func Test(t *testing.T) {<br/>    for _, test := range tests {<br/>        t.Run(test.name, func(t *testing.T) {<br/>            t.Parallel()<br/>            use(test) // incorrect, and a data race<br/>        })<br/>    }<br/>}</pre><br/> The t.Parallel() call causes the rest of the function to execute concurrent with the loop [<go1.22]. <br/> The analyzer reports references only in the last statement, as it is not deep enough to understand the effects of subsequent statements that might render the reference benign. ("Last statement" is defined recursively in compound statements such as if, switch, and select.) <br/> See: https://golang.org/doc/go_faq.html#closures_and_goroutines <br/> Default: `true` |
| `lostcancel` | check cancel func returned by context.WithCancel is called <br/> The cancellation function returned by context.WithCancel, WithTimeout, WithDeadline and variants such as WithCancelCause must be called, or the new context will remain live until its parent context is cancelled. (The background context is never cancelled.) <br/> Default: `true` |
| `maprange` | checks for unnecessary calls to maps.Keys and maps.Values in range statements <br/> Consider a loop written like this: <br/> <pre>for val := range maps.Values(m) {<br/>	fmt.Println(val)<br/>}</pre><br/> This should instead be written without the call to maps.Values: <br/> <pre>for _, val := range m {<br/>	fmt.Println(val)<br/>}</pre><br/> golang.org/x/exp/maps returns slices for Keys/Values instead of iterators, but unnecessary calls should similarly be removed: <br/> <pre>for _, key := range maps.Keys(m) {<br/>	fmt.Println(key)<br/>}</pre><br/> should be rewritten as: <br/> <pre>for key := range m {<br/>	fmt.Println(key)<br/>}</pre><br/> Default: `true` |
| `modernize` | simplify code by using modern constructs <br/> This analyzer reports opportunities for simplifying and clarifying existing code by using more modern features of Go and its standard library. <br/> Each diagnostic provides a fix. Our intent is that these fixes may be safely applied en masse without changing the behavior of your program. In some cases the suggested fixes are imperfect and may lead to (for example) unused imports or unused local variables, causing build breakage. However, these problems are generally trivial to fix. We regard any modernizer whose fix changes program behavior to have a serious bug and will endeavor to fix it. <br/> To apply all modernization fixes en masse, you can use the following command: <br/> <pre>$ go run golang.org/x/tools/gopls/internal/analysis/modernize/cmd/modernize@latest -fix -test ./...</pre><br/> (Do not use "go get -tool" to add gopls as a dependency of your module; gopls commands must be built from their release branch.) <br/> If the tool warns of conflicting fixes, you may need to run it more than once until it has applied all fixes cleanly. This command is not an officially supported interface and may change in the future. <br/> Changes produced by this tool should be reviewed as usual before being merged. In some cases, a loop may be replaced by a simple function call, causing comments within the loop to be discarded. Human judgment may be required to avoid losing comments of value. <br/> Each diagnostic reported by modernize has a specific category. (The categories are listed below.) Diagnostics in some categories, such as "efaceany" (which replaces "interface{}" with "any" where it is safe to do so) are particularly numerous. It may ease the burden of code review to apply fixes in two passes, the first change consisting only of fixes of category "efaceany", the second consisting of all others. This can be achieved using the -category flag: <br/> <pre>$ modernize -category=efaceany  -fix -test ./...<br/>$ modernize -category=-efaceany -fix -test ./...</pre><br/> Categories of modernize diagnostic: <br/>   - forvar: remove x := x variable declarations made unnecessary by the new semantics of loops in go1.22. <br/>   - slicescontains: replace 'for i, elem := range s { if elem == needle { ...; break }'     by a call to slices.Contains, added in go1.21. <br/>   - minmax: replace an if/else conditional assignment by a call to     the built-in min or max functions added in go1.21. <br/>   - sortslice: replace sort.Slice(s, func(i, j int) bool) { return s[i] < s[j] }     by a call to slices.Sort(s), added in go1.21. <br/>   - efaceany: replace interface{} by the 'any' type added in go1.18. <br/>   - mapsloop: replace a loop around an m[k]=v map update by a call     to one of the Collect, Copy, Clone, or Insert functions from     the maps package, added in go1.21. <br/>   - fmtappendf: replace []byte(fmt.Sprintf...) by fmt.Appendf(nil, ...),     added in go1.19. <br/>   - testingcontext: replace uses of context.WithCancel in tests     with t.Context, added in go1.24. <br/>   - omitzero: replace omitempty by omitzero on structs, added in go1.24. <br/>   - bloop: replace "for i := range b.N" or "for range b.N" in a     benchmark with "for b.Loop()", and remove any preceding calls     to b.StopTimer, b.StartTimer, and b.ResetTimer. <br/>     B.Loop intentionally defeats compiler optimizations such as     inlining so that the benchmark is not entirely optimized away.     Currently, however, it may cause benchmarks to become slower     in some cases due to increased allocation; see     https://go.dev/issue/73137. <br/>   - rangeint: replace a 3-clause "for i := 0; i < n; i++" loop by     "for i := range n", added in go1.22. <br/>   - stringsseq: replace Split in "for range strings.Split(...)" by go1.24's     more efficient SplitSeq, or Fields with FieldSeq. <br/>   - stringscutprefix: replace some uses of HasPrefix followed by TrimPrefix with CutPrefix,     added to the strings package in go1.20. <br/>   - waitgroup: replace old complex usages of sync.WaitGroup by less complex WaitGroup.Go method in go1.25. <br/> Default: `true` |
| `nilfunc` | check for useless comparisons between functions and nil <br/> A useless comparison is one like f == nil as opposed to f() == nil. <br/> Default: `true` |
| `nilness` | check for redundant or impossible nil comparisons <br/> The nilness checker inspects the control-flow graph of each function in a package and reports nil pointer dereferences, degenerate nil pointers, and panics with nil values. A degenerate comparison is of the form x==nil or x!=nil where x is statically known to be nil or non-nil. These are often a mistake, especially in control flow related to errors. Panics with nil values are checked because they are not detectable by <br/> <pre>if r := recover(); r != nil {</pre><br/> This check reports conditions such as: <br/> <pre>if f == nil { // impossible condition (f is a function)<br/>}</pre><br/> and: <br/> <pre>p := &v<br/>...<br/>if p != nil { // tautological condition<br/>}</pre><br/> and: <br/> <pre>if p == nil {<br/>	print(*p) // nil dereference<br/>}</pre><br/> and: <br/> <pre>if p == nil {<br/>	panic(p)<br/>}</pre><br/> Sometimes the control flow may be quite complex, making bugs hard to spot. In the example below, the err.Error expression is guaranteed to panic because, after the first return, err must be nil. The intervening loop is just a distraction. <br/> <pre>...<br/>err := g.Wait()<br/>if err != nil {<br/>	return err<br/>}<br/>partialSuccess := false<br/>for _, err := range errs {<br/>	if err == nil {<br/>		partialSuccess = true<br/>		break<br/>	}<br/>}<br/>if partialSuccess {<br/>	reportStatus(StatusMessage{<br/>		Code:   code.ERROR,<br/>		Detail: err.Error(), // "nil dereference in dynamic method call"<br/>	})<br/>	return nil<br/>}</pre><br/> ... <br/> Default: `true` |
| `nonewvars` | suggested fixes for "no new vars on left side of :=" <br/> This checker provides suggested fixes for type errors of the type "no new vars on left side of :=". For example: <br/> <pre>z := 1<br/>z := 2</pre><br/> will turn into <br/> <pre>z := 1<br/>z = 2</pre><br/> Default: `true` |
| `noresultvalues` | suggested fixes for unexpected return values <br/> This checker provides suggested fixes for type errors of the type "no result values expected" or "too many return values". For example: <br/> <pre>func z() { return nil }</pre><br/> will turn into <br/> <pre>func z() { return }</pre><br/> Default: `true` |
| `printf` | check consistency of Printf format strings and arguments <br/> The check applies to calls of the formatting functions such as [fmt.Printf] and [fmt.Sprintf], as well as any detected wrappers of those functions such as [log.Printf]. It reports a variety of mistakes such as syntax errors in the format string and mismatches (of number and type) between the verbs and their arguments. <br/> See the documentation of the fmt package for the complete set of format operators and their operand types. <br/> Default: `true` |
| `recursiveiter` | check for inefficient recursive iterators <br/> This analyzer reports when a function that returns an iterator (iter.Seq or iter.Seq2) calls itself as the operand of a range statement, as this is inefficient. <br/> When implementing an iterator (e.g. iter.Seq[T]) for a recursive data type such as a tree or linked list, it is tempting to recursively range over the iterator for each child element. <br/> Here's an example of a naive iterator over a binary tree: <br/> <pre>type tree struct {<br/>	value       int<br/>	left, right *tree<br/>}</pre><br/> <pre>func (t *tree) All() iter.Seq[int] {<br/>	return func(yield func(int) bool) {<br/>		if t != nil {<br/>			for elem := range t.left.All() { // "inefficient recursive iterator"<br/>				if !yield(elem) {<br/>					return<br/>				}<br/>			}<br/>			if !yield(t.value) {<br/>				return<br/>			}<br/>			for elem := range t.right.All() { // "inefficient recursive iterator"<br/>				if !yield(elem) {<br/>					return<br/>				}<br/>			}<br/>		}<br/>	}<br/>}</pre><br/> Though it correctly enumerates the elements of the tree, it hides a significant performance problem--two, in fact. Consider a balanced tree of N nodes. Iterating the root node will cause All to be called once on every node of the tree. This results in a chain of nested active range-over-func statements when yield(t.value) is called on a leaf node. <br/> The first performance problem is that each range-over-func statement must typically heap-allocate a variable, so iteration of the tree allocates as many variables as there are elements in the tree, for a total of O(N) allocations, all unnecessary. <br/> The second problem is that each call to yield for a leaf of the tree causes each of the enclosing range loops to receive a value, which they then immediately pass on to their respective yield function. This results in a chain of log(N) dynamic yield calls per element, a total of O(N*log N) dynamic calls overall, when only O(N) are necessary. <br/> A better implementation strategy for recursive iterators is to first define the "every" operator for your recursive data type, where every(f) reports whether f(x) is true for every element x in the data type. For our tree, the every function would be: <br/> <pre>func (t *tree) every(f func(int) bool) bool {<br/>	return t == nil ||<br/>		t.left.every(f) && f(t.value) && t.right.every(f)<br/>}</pre><br/> Then the iterator can be simply expressed as a trivial wrapper around this function: <br/> <pre>func (t *tree) All() iter.Seq[int] {<br/>	return func(yield func(int) bool) {<br/>		_ = t.every(yield)<br/>	}<br/>}</pre><br/> In effect, tree.All computes whether yield returns true for each element, short-circuiting if it every returns false, then discards the final boolean result. <br/> This has much better performance characteristics: it makes one dynamic call per element of the tree, and it doesn't heap-allocate anything. It is also clearer. <br/> Default: `true` |
| `shadow` | check for possible unintended shadowing of variables <br/> This analyzer check for shadowed variables. A shadowed variable is a variable declared in an inner scope with the same name and type as a variable in an outer scope, and where the outer variable is mentioned after the inner one is declared. <br/> (This definition can be refined; the module generates too many false positives and is not yet enabled by default.) <br/> For example: <br/> <pre>func BadRead(f *os.File, buf []byte) error {<br/>	var err error<br/>	for {<br/>		n, err := f.Read(buf) // shadows the function variable 'err'<br/>		if err != nil {<br/>			break // causes return of wrong value<br/>		}<br/>		foo(buf)<br/>	}<br/>	return err<br/>}</pre><br/> Default: `false` |
| `shift` | check for shifts that equal or exceed the width of the integer <br/> Default: `true` |
| `sigchanyzer` | check for unbuffered channel of os.Signal <br/> This checker reports call expression of the form <br/> <pre>signal.Notify(c <-chan os.Signal, sig ...os.Signal),</pre><br/> where c is an unbuffered channel, which can be at risk of missing the signal. <br/> Default: `true` |
| `simplifycompositelit` | check for composite literal simplifications <br/> An array, slice, or map composite literal of the form: <br/> <pre>[]T{T{}, T{}}</pre><br/> will be simplified to: <br/> <pre>[]T{{}, {}}</pre><br/> This is one of the simplifications that "gofmt -s" applies. <br/> This analyzer ignores generated code. <br/> Default: `true` |
| `simplifyrange` | check for range statement simplifications <br/> A range of the form: <br/> <pre>for x, _ = range v {...}</pre><br/> will be simplified to: <br/> <pre>for x = range v {...}</pre><br/> A range of the form: <br/> <pre>for _ = range v {...}</pre><br/> will be simplified to: <br/> <pre>for range v {...}</pre><br/> This is one of the simplifications that "gofmt -s" applies. <br/> This analyzer ignores generated code. <br/> Default: `true` |
| `simplifyslice` | check for slice simplifications <br/> A slice expression of the form: <br/> <pre>s[a:len(s)]</pre><br/> will be simplified to: <br/> <pre>s[a:]</pre><br/> This is one of the simplifications that "gofmt -s" applies. <br/> This analyzer ignores generated code. <br/> Default: `true` |
| `slog` | check for invalid structured logging calls <br/> The slog checker looks for calls to functions from the log/slog package that take alternating key-value pairs. It reports calls where an argument in a key position is neither a string nor a slog.Attr, and where a final key is missing its value. For example,it would report <br/> <pre>slog.Warn("message", 11, "k") // slog.Warn arg "11" should be a string or a slog.Attr</pre><br/> and <br/> <pre>slog.Info("message", "k1", v1, "k2") // call to slog.Info missing a final value</pre><br/> Default: `true` |
| `sortslice` | check the argument type of sort.Slice <br/> sort.Slice requires an argument of a slice type. Check that the interface{} value passed to sort.Slice is actually a slice. <br/> Default: `true` |
| `stdmethods` | check signature of methods of well-known interfaces <br/> Sometimes a type may be intended to satisfy an interface but may fail to do so because of a mistake in its method signature. For example, the result of this WriteTo method should be (int64, error), not error, to satisfy io.WriterTo: <br/> <pre>type myWriterTo struct{...}<br/>func (myWriterTo) WriteTo(w io.Writer) error { ... }</pre><br/> This check ensures that each method whose name matches one of several well-known interface methods from the standard library has the correct signature for that interface. <br/> Checked method names include: <br/> <pre>Format GobEncode GobDecode MarshalJSON MarshalXML<br/>Peek ReadByte ReadFrom ReadRune Scan Seek<br/>UnmarshalJSON UnreadByte UnreadRune WriteByte<br/>WriteTo</pre><br/> Default: `true` |
| `stdversion` | report uses of too-new standard library symbols <br/> The stdversion analyzer reports references to symbols in the standard library that were introduced by a Go release higher than the one in force in the referring file. (Recall that the file's Go version is defined by the 'go' directive its module's go.mod file, or by a "//go:build go1.X" build tag at the top of the file.) <br/> The analyzer does not report a diagnostic for a reference to a "too new" field or method of a type that is itself "too new", as this may have false positives, for example if fields or methods are accessed through a type alias that is guarded by a Go version constraint. <br/> <br/> Default: `true` |
| `stringintconv` | check for string(int) conversions <br/> This checker flags conversions of the form string(x) where x is an integer (but not byte or rune) type. Such conversions are discouraged because they return the UTF-8 representation of the Unicode code point x, and not a decimal string representation of x as one might expect. Furthermore, if x denotes an invalid code point, the conversion cannot be statically rejected. <br/> For conversions that intend on using the code point, consider replacing them with string(rune(x)). Otherwise, strconv.Itoa and its equivalents return the string representation of the value in the desired base. <br/> Default: `true` |
| `structtag` | check that struct field tags conform to reflect.StructTag.Get <br/> Also report certain struct tags (json, xml) used with unexported fields. <br/> Default: `true` |
| `testinggoroutine` | report calls to (*testing.T).Fatal from goroutines started by a test <br/> Functions that abruptly terminate a test, such as the Fatal, Fatalf, FailNow, and Skip{,f,Now} methods of *testing.T, must be called from the test goroutine itself. This checker detects calls to these functions that occur within a goroutine started by the test. For example: <br/> <pre>func TestFoo(t *testing.T) {<br/>    go func() {<br/>        t.Fatal("oops") // error: (*T).Fatal called from non-test goroutine<br/>    }()<br/>}</pre><br/> Default: `true` |
| `tests` | check for common mistaken usages of tests and examples <br/> The tests checker walks Test, Benchmark, Fuzzing and Example functions checking malformed names, wrong signatures and examples documenting non-existent identifiers. <br/> Please see the documentation for package testing in golang.org/pkg/testing for the conventions that are enforced for Tests, Benchmarks, and Examples. <br/> Default: `true` |
| `timeformat` | check for calls of (time.Time).Format or time.Parse with 2006-02-01 <br/> The timeformat checker looks for time formats with the 2006-02-01 (yyyy-dd-mm) format. Internationally, "yyyy-dd-mm" does not occur in common calendar date standards, and so it is more likely that 2006-01-02 (yyyy-mm-dd) was intended. <br/> Default: `true` |
| `unmarshal` | report passing non-pointer or non-interface values to unmarshal <br/> The unmarshal analysis reports calls to functions such as json.Unmarshal in which the argument type is not a pointer or an interface. <br/> Default: `true` |
| `unreachable` | check for unreachable code <br/> The unreachable analyzer finds statements that execution can never reach because they are preceded by a return statement, a call to panic, an infinite loop, or similar constructs. <br/> Default: `true` |
| `unsafeptr` | check for invalid conversions of uintptr to unsafe.Pointer <br/> The unsafeptr analyzer reports likely incorrect uses of unsafe.Pointer to convert integers to pointers. A conversion from uintptr to unsafe.Pointer is invalid if it implies that there is a uintptr-typed word in memory that holds a pointer value, because that word will be invisible to stack copying and to the garbage collector. <br/> Default: `true` |
| `unusedfunc` | check for unused functions, methods, etc <br/> The unusedfunc analyzer reports functions and methods that are never referenced outside of their own declaration. <br/> A function is considered unused if it is unexported and not referenced (except within its own declaration). <br/> A method is considered unused if it is unexported, not referenced (except within its own declaration), and its name does not match that of any method of an interface type declared within the same package. <br/> The tool may report false positives in some situations, for example: <br/>   - For a declaration of an unexported function that is referenced     from another package using the go:linkname mechanism, if the     declaration's doc comment does not also have a go:linkname     comment. <br/>     (Such code is in any case strongly discouraged: linkname     annotations, if they must be used at all, should be used on both     the declaration and the alias.) <br/>   - For compiler intrinsics in the "runtime" package that, though     never referenced, are known to the compiler and are called     indirectly by compiled object code. <br/>   - For functions called only from assembly. <br/>   - For functions called only from files whose build tags are not     selected in the current build configuration. <br/> See https://github.com/golang/go/issues/71686 for discussion of these limitations. <br/> The unusedfunc algorithm is not as precise as the golang.org/x/tools/cmd/deadcode tool, but it has the advantage that it runs within the modular analysis framework, enabling near real-time feedback within gopls. <br/> The unusedfunc analyzer also reports unused types, vars, and constants. Enums--constants defined with iota--are ignored since even the unused values must remain present to preserve the logical ordering. <br/> Default: `true` |
| `unusedparams` | check for unused parameters of functions <br/> The unusedparams analyzer checks functions to see if there are any parameters that are not being used. <br/> To ensure soundness, it ignores:   - "address-taken" functions, that is, functions that are used as     a value rather than being called directly; their signatures may     be required to conform to a func type.   - exported functions or methods, since they may be address-taken     in another package.   - unexported methods whose name matches an interface method     declared in the same package, since the method's signature     may be required to conform to the interface type.   - functions with empty bodies, or containing just a call to panic.   - parameters that are unnamed, or named "_", the blank identifier. <br/> The analyzer suggests a fix of replacing the parameter name by "_", but in such cases a deeper fix can be obtained by invoking the "Refactor: remove unused parameter" code action, which will eliminate the parameter entirely, along with all corresponding arguments at call sites, while taking care to preserve any side effects in the argument expressions; see https://github.com/golang/tools/releases/tag/gopls%2Fv0.14. <br/> This analyzer ignores generated code. <br/> Default: `true` |
| `unusedresult` | check for unused results of calls to some functions <br/> Some functions like fmt.Errorf return a result and have no side effects, so it is always a mistake to discard the result. Other functions may return an error that must not be ignored, or a cleanup operation that must be called. This analyzer reports calls to functions like these when the result of the call is ignored. <br/> The set of functions may be controlled using flags. <br/> Default: `true` |
| `unusedvariable` | check for unused variables and suggest fixes <br/> Default: `true` |
| `unusedwrite` | checks for unused writes <br/> The analyzer reports instances of writes to struct fields and arrays that are never read. Specifically, when a struct object or an array is copied, its elements are copied implicitly by the compiler, and any element write to this copy does nothing with the original object. <br/> For example: <br/> <pre>type T struct { x int }</pre><br/> <pre>func f(input []T) {<br/>	for i, v := range input {  // v is a copy<br/>		v.x = i  // unused write to field x<br/>	}<br/>}</pre><br/> Another example is about non-pointer receiver: <br/> <pre>type T struct { x int }</pre><br/> <pre>func (t T) f() {  // t is a copy<br/>	t.x = i  // unused write to field x<br/>}</pre><br/> Default: `true` |
| `waitgroup` | check for misuses of sync.WaitGroup <br/> This analyzer detects mistaken calls to the (*sync.WaitGroup).Add method from inside a new goroutine, causing Add to race with Wait: <br/> <pre>// WRONG<br/>var wg sync.WaitGroup<br/>go func() {<br/>        wg.Add(1) // "WaitGroup.Add called from inside new goroutine"<br/>        defer wg.Done()<br/>        ...<br/>}()<br/>wg.Wait() // (may return prematurely before new goroutine starts)</pre><br/> The correct code calls Add before starting the goroutine: <br/> <pre>// RIGHT<br/>var wg sync.WaitGroup<br/>wg.Add(1)<br/>go func() {<br/>	defer wg.Done()<br/>	...<br/>}()<br/>wg.Wait()</pre><br/> Default: `true` |
| `yield` | report calls to yield where the result is ignored <br/> After a yield function returns false, the caller should not call the yield function again; generally the iterator should return promptly. <br/> This example fails to check the result of the call to yield, causing this analyzer to report a diagnostic: <br/> <pre>yield(1) // yield may be called again (on L2) after returning false<br/>yield(2)</pre><br/> The corrected code is either this: <br/> <pre>if yield(1) { yield(2) }</pre><br/> or simply: <br/> <pre>_ = yield(1) && yield(2)</pre><br/> It is not always a mistake to ignore the result of yield. For example, this is a valid single-element iterator: <br/> <pre>yield(1) // ok to ignore result<br/>return</pre><br/> It is only a mistake when the yield call that returned false may be followed by another call. <br/> Default: `true` |
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

annotations specifies the various kinds of compiler
optimization details that should be reported as diagnostics
when enabled for a package by the "Toggle compiler
optimization details" (`gopls.gc_details`) command.

(Some users care only about one kind of annotation in their
profiling efforts. More importantly, in large packages, the
number of annotations can sometimes overwhelm the user
interface and exceed the per-file diagnostic limit.)

TODO(adonovan): rename this field to CompilerOptDetail.

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

(Experimental) staticcheck configures the default set of analyses staticcheck.io.
These analyses are documented on
[Staticcheck's website](https://staticcheck.io/docs/checks/).

The "staticcheck" option has three values:
- false: disable all staticcheck analyzers
- true: enable all staticcheck analyzers
- unset: enable a subset of staticcheck analyzers
  selected by gopls maintainers for runtime efficiency
  and analytic precision.

Regardless of this setting, individual analyzers can be
selectively enabled or disabled using the `analyses` setting.


Default: `false`
### `ui.diagnostic.staticcheckProvided`

(Experimental) 

Default: `false`
### `ui.documentation.hoverKind`

hoverKind controls the information that appears in the hover text.
SingleLine is intended for use only by authors of editor plugins.
<br/>
Allowed Options:

* `FullDocumentation`
* `NoDocumentation`
* `SingleLine`
* `Structured`: `"Structured"` is a misguided experimental setting that returns a JSON
hover format. This setting should not be used, as it will be removed in a
future release of gopls.
* `SynopsisDocumentation`


Default: `"FullDocumentation"`
### `ui.documentation.linkTarget`

linkTarget is the base URL for links to Go package
documentation returned by LSP operations such as Hover and
DocumentLinks and in the CodeDescription field of each
Diagnostic.

It might be one of:

* `"godoc.org"`
* `"pkg.go.dev"`

If company chooses to use its own `godoc.org`, its address can be used as well.

Modules matching the GOPRIVATE environment variable will not have
documentation links in hover.


Default: `"pkg.go.dev"`
### `ui.documentation.linksInHover`

linksInHover controls the presence of documentation links in hover markdown.
<br/>
Allowed Options:

* `false`: false: do not show links
* `true`: true: show links to the `linkTarget` domain
* `gopls`: `"gopls"`: show links to gopls' internal documentation viewer


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
### `ui.noSemanticNumber (deprecated)`

use SemanticTokenTypes["number"] = false instead. See
golang/vscode-go#3632.

(Experimental) noSemanticNumber turns off the sending of the semantic token 'number'

Deprecated: Use SemanticTokenTypes["number"] = false instead. See
golang/vscode-go#3632.


Default: `false`
### `ui.noSemanticString (deprecated)`

use SemanticTokenTypes["string"] = false instead. See
golang/vscode-go#3632

(Experimental) noSemanticString turns off the sending of the semantic token 'string'

Deprecated: Use SemanticTokenTypes["string"] = false instead. See
golang/vscode-go#3632


Default: `false`
### `ui.semanticTokenModifiers`

(Experimental) semanticTokenModifiers configures the semantic token modifiers. It allows
disabling modifiers by setting each value to false.
By default, all modifiers are enabled.

### `ui.semanticTokenTypes`

(Experimental) semanticTokenTypes configures the semantic token types. It allows
disabling types by setting each value to false.
By default, all types are enabled.

### `ui.semanticTokens`

(Experimental) semanticTokens controls whether the LSP server will send
semantic tokens to the client.


Default: `false`
### `verboseOutput`

(For Debugging) verboseOutput enables additional debug logging.


Default: `false`

