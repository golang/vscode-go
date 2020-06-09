# Troubleshooting

Read this document when you encounter a problem with this extension. It can provide guidance, but many cases are not covered here.

If you are unable to resolve the problem after following the advice on this page, please take a look at the current [open issues](https://github.com/golang/vscode-go/issues) to see if your issue has already been reported. If not, please do not hesitate to [ask for help](#ask-for-help).

**NOTE: [Debugging](debugging.md#troubleshooting) and [`gopls`](gopls.md) also have their own troubleshooting documentation.**

## Overview

* [Check known issues](#check-known-issues)
* [Check your setup](#check-your-setup)
  * [Environment variables](#environment-variables)
* [Update tools](#update-tools)
  * [If tools fail to install or update](#if-tools-fail-to-install-or-update)
* [Look for error messages](#look-for-error-messages)
* [Investigate](#investigate)
  * [Debugging](debugging.md#troubleshooting)
  * [Language server](gopls.md)
  * [Autocompletion](#autocompletion)
  * [Formatting](#formatting)
  * [Diagnostics](#diagnostics)
* [Known Issues](#known-issues)
* [Ask for help](#ask-for-help)

### Check [known issues](#known-issues)

A [list of known issues](#known-issues) is available at the bottom of this page. Take a look and see if you've encountered one of these.

### Check your setup

First, make sure you understand the difference between [`GOPATH`](gopath.md) and [module](modules.md) modes and know which mode you are using. Run `go version` and `go env` in the [integrated terminal] to check that your environment is configured as you expect.

This extension supports a few meta-commands that can be used for investigation. Try running [`Go: Locate Configured Go Tools`](commands.md#go-locate-configured-go-tools). The output should look like:

```bash
Checking configured tools....
GOBIN: undefined
toolsGopath:
gopath: /path/to/gopath
GOROOT: /path/to/go
PATH: /path/to/:/another/path:/some/path

   gocode: /path/to/gocode installed
   gopkgs: /path/to/bin/gopkgs installed
   go-outline: /path/to/bin/go-outline installed
   go-symbols: /path/to/bin/go-symbols installed
   guru: /path/to/bin/guru installed
   gorename: /path/to/bin/gorename installed
   gotests: /path/to/bin/gotests installed
   gomodifytags: /path/to/bin/gomodifytags installed
   impl: /path/to/bin/impl installed
   fillstruct: /path/to/bin/fillstruct installed
   goplay: /path/to/bin/goplay installed
   godoctor: /path/to/bin/godoctor installed
   dlv: /path/to/bin/dlv installed
   gocode-gomod: /path/to/bin/gocode-gomod installed
   godef: /path/to/bin/godef installed
   goreturns: /path/to/bin/goreturns installed
   golint: /path/to/bin/golint installed
   gopls: /path/to/bin/gopls installed
```

If your `GOPATH` or `GOROOT` is undefined, that may indicate a problem. Read more about [setting up your `GOPATH`](gopath.md#setting-gopath). A missing `GOROOT` means that you haven't installed Go correctly. This topic is covered in the [getting started guide](../README.md#install-go).

If one of the tools (`gocode`, `gopkgs`, etc.) is not installed, this may also indicate a problem. Take a look at the [list of tools](tools.md) required by this extension. If the missing tool provides the feature you're looking for, that might be the issue. You can install or update tools by running the [`Go: Install/Update Tools`](commands.md#go-installupdate-tools) command.

Finally, take a look at your settings in the JSON form (Ctrl+Shift+P -> Preferences: Open Settings (JSON)). This is an easier way to quickly grasp what non-default configurations you have.

Common culprits include:

* [`go.inferGopath`](settings.md#go.inferGopath)
* [`go.toolsGopath`](settings.md#go.toolsGopath)
* [`go.alternateTools`](settings.md#go.alternateTools)
* [`go.useLanguageServer`](settings.md#go.useLanguageServer)

Read up on those settings, as well as all of the other [available settings](settings.md).

If you are using the language server, please see the language server's [troubleshooting guide](gopls.md).

#### Environment variables

Note that extensions run in a separate process from the [integrated terminal] and the rest of the VS Code window. Therefore, environment variables set specifically in the [integrated terminal] are not visible to the extensions.

Instead, set the environment variables in your terminal before you launch VS Code. Or, set environment variables globally in your configuration (in a `.bash_profile`, for example). You can also set environment variables for only the Go extension by adding them to [`go.toolsEnvVars`](settings.md#go.toolsEnvVars). Other settings are available to override specific variables, like your `GOPATH`, which can be set through the [`go.gopath`](settings.md#go.gopath) setting as well.

### Look for error messages

Start off by opening the Output pane (Ctrl+Shift+U). On the right side, open the drop-down titled "Tasks". Any item that starts with "Go" is related to this extension. Browse through these output channels and make note of any error messages.

You can also look directly in the logs of the Extension Host by selecting `Log (Extension Host)`. These may contain a lot of unrelated information, but they may prove useful. If you are trying to get the logs for a specific operation, like go to definition, clear the logs (Clear Output button on the right side), and perform the operation.

Errors may also be logged to the Developer Tools console. These errors may be more difficult to parse, but you can take a look at them by running the `Developer: Toggle Developer Tools` command from the Command Palette (Ctrl+Shift+P).

### Update tools

It's possible that you are using an outdated version of a tool, so the bug you are encountering may have already been fixed. You can update all tools at once by running the [`Go: Install/Update Tools`](commands.md#go-installupdate-tools) command.

If you would prefer to update only a single tool, you can use the same command, but pick the correct tool. To learn which tool corresponds to the broken feature, read the [Features](features.md) and [Tools](tools.md) documentation pages. [Features](features.md) describes functionality in detail and lists which tool provides that functionality, while [Tools](tools.md) is the reverse, describing each tool and then listing which features it provides.

### If tools fail to install or update

It's possible that the tool installation or update will itself fail. Error messages should be printed in the output, which will hopefully guide you.

Try cleaning your module cache (`go clean -modcache`) and installing once again.

If you are using Go 1.10 or below, something may have gone wrong with the repository that contains the tool on your machine. Try deleting the directory that contains the tool and installing again. The directory will be in your `$GOPATH/src/`. The name of the directory will be the name of the repository in which the tool is hosted; it's usually something like `github.com/stamblerre/gocode`. Note that, if you have configured the [`go.toolsGopath`](settings.md#go.toolsGopath), you should look in that directory.

If that doesn't work, there may be a problem with the tool itself. Check if there are any issues filed in the tool's repository. If not, please file an issue in that repository and let us know by [filing an issue](https:/github.com/golang/vscode-go/issues/new/choose) in the VS Code Go repository as well.

## Investigate

Issues in certain parts of the extension, specifically [debugging](debugging.md#troubleshooting) and the [language server](gopls.md), are described in more depth on other pages. Please take a look at those specific guides.

Other issues may be caused by other command-line tools. As mentioned above, to learn which tool corresponds to the broken feature, read the [Features](features.md) and [Tools](tools.md) documentation pages. [Features](features.md) describes functionality in detail and lists which tool provides that functionality, while [Tools](tools.md) is the reverse, describing each tool and then listing which features it provides.

Once you've identified the correct tool, make sure it works for you on the command-line. Read the documentation and usage guide for the tool and try running it manually. Most tools may require you to provide a line and column number or byte offset in a file.

If the tool works correctly on the command-line, then the issue is in this extension. In that case, please [file an issue].

If the tool does not work correctly on the command-line, that means there is an issue in the tool. In that case, please file an issue in the GitHub repository of the tool itself.

### Autocompletion

Autocompletion is one of the most complicated features. Troubleshooting it can be tricky, but doable.

The following only applies if you are **not** using the language server. If you are, see [the `gopls` troubleshooting guide](gopls.md).

The tool that provides autocompletion is called [`gocode`](tools.md#gocode), so try checking error logs and updating [`gocode`](tools.md#gocode). If you are using [Go modules], the binary on your machine will be called `gocode-gomod`, not `gocode`, as the extension uses a different version of `gocode` for modules.

Next, make sure that the package you are trying to complete has been built at least once. You can do this by either running [`Go: Build Current Package`](commands.md#go-build-current-package) or by running `go install` on the command-line. If you have enabled [`go.buildOnSave`](settings.md#go.buildOnSave) or [`go.gocodeAutobuild`](settings.md#go.gocodeAutobuild), this should happen automatically.

If you have noticed that your autocompletion results are not missing, but simply out-of date, check the value of your [`"go.buildOnSave"`](settings.md#buildOnSave) setting. If it is `"off"`, then you may not get fresh results your dependencies. You can rebuild your dependencies manually by running `go install`.

If that doesn't work, try running `gocode close` on the command-line. If you are using [Go modules], run `gocode-gomod close`.

Finally, try exiting VS Code Go and running:

```bash
gocode close
gocode -s -debug
```

This will start a `gocode` debug server, which will print output as you trigger completions. Reopen VS Code and try to complete. You can trigger completion manually using Ctrl+Space. Make note of the debug output. If you can determine the issue from the output, you can correct it yourself. Otherwise, please [file an issue] and include this output in your report, if you are able to do so.

### Formatting

By default, this extension formats your code and organizes your imports on file save. New imports will be added and unused imports will be removed automatically. This is [standard Go style](https://golang.org/cmd/gofmt/). Learn more about the different [formatting tools](tools.md#formatting) to get a better understanding.

If necessary, it is possible to disable the formatting behaviors. You will still be able to trigger formatting manually (right-click, Format Document).

#### Disable formatting

If you are **NOT using the language server** (`"go.useLanguageServer": false`, which is the default):

* Format on save, but **do not** organize imports on save:

  ```json5
  "go.formatTool": "gofmt"
  ```

* Do not format or organize imports on save:

  ```json5
  "[go]": {
    "editor.formatOnSave": false
  }
  ```

If you **are using the language server** (`"go.useLanguageServer": true`):

* Format on save, but **do not** organize imports on save:

  ```json5
  "[go]": {
    "editor.codeActionsOnSave": {
      "source.organizeImports": false
    }
  }
  ```

* Do not format or organize imports on save:

  ```json5
  "[go]": {
    "editor.formatOnSave": false,
    "editor.codeActionsOnSave": {
      "source.organizeImports": false
    }
  }
  ```

Learn more in the [language server documentation](gopls.md).

#### Use spaces instead of tabs

The default Go formatting tools use tabs over spaces, and this have become an industry standard for Go. Read more about [Effective Go](https://golang.org/doc/effective_go.html#formatting). The only way to switch from tabs to spaces is by also disabling formatting.

#### Change tab size

The default tab size in VS Code is 4. You can change this only for Go files by adding the following to your settings.

```json5
"[go]": {
  "editor.tabSize": 8
}
```

### Diagnostics

This extension provides a number of [diagnostic features](features.md#diagnostics) to improve your code quality and alert you to build errors. These will appear as red or yellow squiggly underlines, and they will also appear in the Problems pane at the bottom of the screen. Learn more about the different [diagnostic tools](tools.md#diagnostics) to understand which ones you are using.

#### Build errors

Any errors marked by red squiggles are build errors. These indicate that your code will not compile. If you think these errors are incorrect, try checking on the command-line by running `go build` or `go test`.

If the build commands succeed, try copying the exact command used by VS Code Go. You can find it by navigating to the output pane (Ctrl+Shift+P -> `View: Toggle Output`). Choose the `Go` output channel from the Tasks drop-down in the top-right corner. This will show the exact command VS Code ran. Copy and run it.

If you see the same errors, you may have misconfigured your project. Learn more about how to do this correctly in [set up your environment](../README.md#set-up-your-environment).

If the command runs fine on the command-line, it's possible you've misconfigured something in your VS Code Go environment, such as your [`GOPATH`](gopath.md). Review [check your set-up](#check-your-set-up), and if the issue still persists, please [file an issue].

## Ask for help

It's possible that after following these steps, you still will not have found a solution to your problem. In this case, please ask for help!

Reach out to the VS Code Go maintainers by:

* [Filing an issue](https://github.com/golang/vscode-go/issues/new/choose)
* Asking a question on the `#vscode` channel of the [Gophers Slack]

## Known Issues

**I keep seeing a "Running save participants..." pop-up when I save my file.**

Take a look at the suggestions on [Microsoft/vscode-go#3179](https://github.com/microsoft/vscode-go/issues/3179#issue-600430641). If you still cannot resolve the problem, please [file an issue].

[Gophers Slack]: https://gophers.slack.com/
[file an issue]: https://github.com/golang/vscode-go/issues/new/choose
[Go modules]: https://blog.golang.org/using-go-modules
[integrated terminal]: https://code.visualstudio.com/docs/editor/integrated-terminal
