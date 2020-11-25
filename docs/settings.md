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


### `go.alternateTools`

Alternate tools or alternate paths for the same tools used by the Go extension. Provide either absolute path or the name of the binary in GOPATH/bin, GOROOT/bin or PATH. Useful when you want to use wrapper script for the Go tools or versioned tools from https://gopkg.in.

### `go.autocompleteUnimportedPackages`

Include unimported packages in auto-complete suggestions. Not applicable when using the language server.

Default: `false`

### `go.buildFlags`

Flags to `go build`/`go test` used during build-on-save or running tests. (e.g. ["-ldflags='-s'"])

### `go.buildOnSave`

Compiles code on file save using 'go build -i' or 'go test -c -i'. Options are 'workspace', 'package', or 'off'.

Allowed Values:`[package workspace off]`

Default: `package`

### `go.buildTags`

The Go build tags to use for all commands, that support a `-tags '...'` argument. When running tests, go.testTags will be used instead if it was set.

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


### `go.docsTool`

Pick 'godoc' or 'gogetdoc' to get documentation. Not applicable when using the language server.

Allowed Values:`[godoc gogetdoc guru]`

Default: `godoc`

### `go.editorContextMenuCommands`

Experimental Feature: Enable/Disable entries from the context menu in the editor.

Default:{<br/>
&nbsp;&nbsp;`"addImport": true`,<br/>
&nbsp;&nbsp;`"addTags": true`,<br/>
&nbsp;&nbsp;`"debugTestAtCursor": true`,<br/>
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


### `go.enableCodeLens`

Feature level setting to enable/disable code lens for references and run/debug tests

Default:{<br/>
&nbsp;&nbsp;`"references": false`,<br/>
&nbsp;&nbsp;`"runtest": true`,<br/>
    }


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

### `go.languageServerExperimentalFeatures`

Use this setting to enable/disable experimental features from the language server.

Default:{<br/>
&nbsp;&nbsp;`"diagnostics": true`,<br/>
&nbsp;&nbsp;`"documentLink": true`,<br/>
    }


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


### `go.logging.level`

The logging level the extension logs at, defaults to 'error'

Allowed Values:`[off error info verbose]`

Default: `error`

### `go.overwriteGoplsMiddleware`

This option provides a set of flags which determine if vscode-go should intercept certain commands from gopls. These flags assume the `gopls` settings, which enable codelens from gopls, are also present.

### `go.playground`

The flags configured here will be passed through to command `goplay`

Default:{<br/>
&nbsp;&nbsp;`"openbrowser": true`,<br/>
&nbsp;&nbsp;`"run": true`,<br/>
&nbsp;&nbsp;`"share": true`,<br/>
    }


### `go.removeTags`

Tags and options configured here will be used by the Remove Tags command to remove tags to struct fields. If promptForTags is true, then user will be prompted for tags and options. By default, all tags and options will be removed.

Default:{<br/>
&nbsp;&nbsp;`"options": ""`,<br/>
&nbsp;&nbsp;`"promptForTags": false`,<br/>
&nbsp;&nbsp;`"tags": ""`,<br/>
    }


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

### `go.useGoProxyToCheckForToolUpdates`

When enabled, the extension automatically checks the Go proxy if there are updates available for Go and the Go tools (at present, only gopls) it depends on and prompts the user accordingly

Default: `true`

### `go.useLanguageServer`

Use the Go language server "gopls" from Google for powering language features like code navigation, completion, refactoring, formatting & diagnostics.

Default: `false`

### `go.vetFlags`

Flags to pass to `go tool vet` (e.g. ["-all", "-shadow"])

### `go.vetOnSave`

Vets code on file save using 'go tool vet'.

Allowed Values:`[package workspace off]`

Default: `package`

### `gopls.analyses`

(Experimental) analyses specify analyses that the user would like to enable or disable.
A map of the names of analysis passes that should be enabled/disabled.
A full list of analyzers that gopls uses can be found [here](analyzers.md)

Example Usage:
```json5
...
"analyses": {
  "unreachable": false, // Disable the unreachable analyzer.
  "unusedparams": true  // Enable the unusedparams analyzer.
}
...
```


### `gopls.annotations`

(Experimental) annotations suppress various kinds of optimization diagnostics
that would be reported by the gc_details command.
 * noNilcheck suppresses display of nilchecks.
 * noEscape suppresses escape choices.
 * noInline suppresses inlining choices.
 * noBounds suppresses bounds checking diagnostics.


### `gopls.buildFlags`

buildFlags is the set of flags passed on to the build system when invoked.
It is applied to queries like `go list`, which is used when discovering files.
The most common use is to set `-tags`.


### `gopls.codelens`

(Experimental) codelens overrides the enabled/disabled state of code lenses. See the "Code Lenses"
section of settings.md for the list of supported lenses.

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


Default:{<br/>
&nbsp;&nbsp;`"gc_details": false`,<br/>
&nbsp;&nbsp;`"generate": true`,<br/>
&nbsp;&nbsp;`"regenerate_cgo": true`,<br/>
&nbsp;&nbsp;`"tidy": true`,<br/>
&nbsp;&nbsp;`"upgrade_dependency": true`,<br/>
&nbsp;&nbsp;`"vendor": true`,<br/>
    }


### `gopls.completeUnimported`

(Experimental) completeUnimported enables completion for packages that you do not currently import.


Default: `true`

### `gopls.completionBudget`

(For Debugging) completionBudget is the soft latency goal for completion requests. Most
requests finish in a couple milliseconds, but in some cases deep
completions can take much longer. As we use up our budget we
dynamically reduce the search scope to ensure we return timely
results. Zero means unlimited.


Default: `100ms`

### `gopls.completionDocumentation`

(Experimental) completionDocumentation enables documentation with completion results.


Default: `true`

### `gopls.deepCompletion`

(Experimental) deepCompletion enables the ability to return completions from deep inside relevant entities, rather than just the locally accessible ones.

Consider this example:

```go
package main

import "fmt"

type wrapString struct {
    str string
}

func main() {
    x := wrapString{"hello world"}
    fmt.Printf(<>)
}
```

At the location of the `<>` in this program, deep completion would suggest the result `x.str`.


Default: `true`

### `gopls.env`

env adds environment variables to external commands run by `gopls`, most notably `go list`.


### `gopls.expandWorkspaceToModule`

(Experimental) expandWorkspaceToModule instructs `gopls` to adjust the scope of the
workspace to find the best available module root. `gopls` first looks for
a go.mod file in any parent directory of the workspace folder, expanding
the scope to that directory if it exists. If no viable parent directory is
found, gopls will check if there is exactly one child directory containing
a go.mod file, narrowing the scope to that directory if it exists.


Default: `true`

### `gopls.experimentalDiagnosticsDelay`

(Experimental) experimentalDiagnosticsDelay controls the amount of time that gopls waits
after the most recent file modification before computing deep diagnostics.
Simple diagnostics (parsing and type-checking) are always run immediately
on recently modified packages.

This option must be set to a valid duration string, for example `"250ms"`.


Default: `0s`

### `gopls.experimentalPackageCacheKey`

(Experimental) experimentalPackageCacheKey controls whether to use a coarser cache key
for package type information to increase cache hits. This setting removes
the user's environment, build flags, and working directory from the cache
key, which should be a safe change as all relevant inputs into the type
checking pass are already hashed into the key. This is temporarily guarded
by an experiment because caching behavior is subtle and difficult to
comprehensively test.


Default: `true`

### `gopls.experimentalWorkspaceModule`

(Experimental) experimentalWorkspaceModule opts a user into the experimental support
for multi-module workspaces.


Default: `false`

### `gopls.gofumpt`

gofumpt indicates if we should run gofumpt formatting.


Default: `false`

### `gopls.hoverKind`

hoverKind controls the information that appears in the hover text.
SingleLine and Structured are intended for use only by authors of editor plugins.


Allowed Values:`[FullDocumentation NoDocumentation SingleLine Structured SynopsisDocumentation]`

Default: `FullDocumentation`

### `gopls.importShortcut`

(Experimental) importShortcut specifies whether import statements should link to
documentation or go to definitions.


Allowed Values:`[Both Definition Link]`

Default: `Both`

### `gopls.linkTarget`

linkTarget controls where documentation links go.
It might be one of:

* `"godoc.org"`
* `"pkg.go.dev"`

If company chooses to use its own `godoc.org`, its address can be used as well.


Default: `pkg.go.dev`

### `gopls.linksInHover`

(Experimental) linksInHover toggles the presence of links to documentation in hover.


Default: `true`

### `gopls.local`

local is the equivalent of the `goimports -local` flag, which puts imports beginning with this string after 3rd-party packages.
It should be the prefix of the import path whose imports should be grouped separately.


Default: ``

### `gopls.matcher`

(Experimental) matcher sets the algorithm that is used when calculating completion candidates.


Allowed Values:`[CaseInsensitive CaseSensitive Fuzzy]`

Default: `Fuzzy`

### `gopls.semanticTokens`

(Experimental) semanticTokens controls whether the LSP server will send
semantic tokens to the client.


Default: `false`

### `gopls.staticcheck`

(Experimental) staticcheck enables additional analyses from staticcheck.io.


Default: `false`

### `gopls.symbolMatcher`

(Experimental) symbolMatcher sets the algorithm that is used when finding workspace symbols.


Allowed Values:`[CaseInsensitive CaseSensitive Fuzzy]`

Default: `Fuzzy`

### `gopls.symbolStyle`

(Experimental) symbolStyle controls how symbols are qualified in symbol responses.

Example Usage:
```json5
"gopls": {
...
  "symbolStyle": "dynamic",
...
}
```


Allowed Values:`[Dynamic Full Package]`

Default: `Package`

### `gopls.tempModfile`

(Experimental) tempModfile controls the use of the -modfile flag in Go 1.14.


Default: `true`

### `gopls.usePlaceholders`

placeholders enables placeholders for function parameters or struct fields in completion responses.


Default: `false`

### `gopls.verboseOutput`

(For Debugging) verboseOutput enables additional debug logging.


Default: `false`

### `gopls.verboseWorkDoneProgress`

(Experimental) verboseWorkDoneProgress controls whether the LSP server should send
progress reports for all work done outside the scope of an RPC.


Default: `false`
