# [`gopls`], the Go language server

[`gopls`] is the official Go [language server](https://langserver.org/) developed by the Go team. It was developed in response to the release of [Go modules], and it is the recommended approach when working with [Go modules] in VS Code. [`gopls`] is not enabled by default yet and users have to opt in by changing from [their settings](#enable-the-language-server). We plan to switch the default and enable it by default early 2021.

[`gopls`] has its own [documentation pages](https://github.com/golang/tools/tree/master/gopls/doc), and they should be treated as the source of truth for how to use [`gopls` in VS Code](https://github.com/golang/tools/blob/master/gopls/doc/vscode.md).

## Overview

* [Background](#background)
* [Enable the language server](#enable-the-language-server)
  * [Automatic updates](#automatic-updates)
* [Configuration](#configuration)
  * [Ignored settings](#ignored-settings)
  * [`gopls` settings block](#gopls-settings-block)
* [Troubleshooting](https://github.com/golang/tools/blob/master/gopls/doc/troubleshooting.md)
* [Additional resources](#additional-resources)

## Background

This extension functions by shelling out to a number of command-line tools. This introduces complexity, as each feature is provided by a different tool. Language servers enable all editors to support all programming languages without these individualized tools. They also provide speed improvements, as they can cache and reuse results.

[`gopls`] is the official Go language server. Using [`gopls`] will enable the VS Code Go extension to provide high-quality Go support as the language evolves.

To learn more about the context behind [`gopls`], you can watch the [Go pls, stop breaking my editor](https://www.youtube.com/watch?v=EFJfdWzBHwE) talk at GopherCon 2019.

## Enable the language server

To start using the language server, set [`"go.useLanguageServer": true`](settings.md#go.useLanguageServer) in your VS Code Go settings.

You should see a prompt to install `gopls`. If you do not see a prompt, please run the [`Go: Install/Update Tools`](commands.md#go-installupdate-tools) command and select `gopls`.

### Automatic updates

The `gopls` team releases new versions of `gopls` approximately once a month ([release notes](https://github.com/golang/go/issues/33030)). The Go extension will automatically detect that a new version has been released, and a pop-up will appear prompting you to update.

If you would like to opt-out of these updates, set [`"go.useGoProxyToCheckForToolUpdates"`](settings.md#go.useGoProxyToCheckForToolUpdates) to `false`.

## Configuration

There are a number of VS Code Go settings for controlling the language server.

* [`"go.toolsEnvVars"`](settings.md#go.toolsEnvVars) is used when launching `gopls` for the workspace.
* [`"go.buildFlags"`](settings.md#go.buildFlags) and [`"go.buildTags"`](settings.md#go.buildTags) are propagated to `gopls`.
* [`"go.languageServerExperimentalFeatures"`](settings.md#go.languageServerExperimentalFeatures) allows you to disable certain features.
  * `"diagnostics": false` disables diagnostic warnings from `gopls`. You might want to disable these if you don't like the diagnostics changing as you type.
  * `"documentLink": false` is deprecated by `"gopls": { "importShortcut": false }` setting. It was originally meant to disable document links. The reason to disable these is explained in [golang/go#39065](https://github.com/golang/go/issues/39065): the Ctrl+Click shortcut for clicking on a link collides with the Ctrl+Click shortcut for go-to-definition.
* [`"go.languageServerFlags"`](settings.md#go.languageServerFlags) allows you to pass flags to the `gopls` process.
  * The `-rpc.trace` flag enables verbose debug logging.
* [`"gopls"`](settings.md#gopls) allows to fine-tune gopls behavior or override the settings propagated from the extension settings (e.g. `"go.buildFlags"`, `"go.toolsEnvVars"`) as shown in the [`gopls` VS Code user guide](https://github.com/golang/tools/blob/master/gopls/doc/vscode.md). The sets of settings recognized by the extension and the gopls may differ if you use an old version or a pre-release version of `gopls`. In that case, the source of truth is in [the documentation](https://github.com/golang/tools/tree/master/gopls/doc/settings.md) in the `gopls` project.

### Ignored settings

Some of the extension's settings are irrelevant when `gopls` is enabled. For example, the extension no longer uses `gocode` or `guru`, so the corresponding settings are no longer applicable. We are trying to document that in the settings' description and the [settings documentation](settings.md). When you find incompelete documentation, please file an issue or send a PR!

## Additional resources

If you encounter an issue while using [`gopls`], take a look at these resources:

* [VS Code user guide](https://github.com/golang/tools/blob/master/gopls/doc/vscode.md)
* [Known issues](https://github.com/golang/tools/blob/master/gopls/doc/status.md#known-issues)
* [Troubleshooting](https://github.com/golang/tools/blob/master/gopls/doc/troubleshooting.md)
* [`gopls` issue tracker](https://github.com/golang/go/issues?q=is%3Aissue+is%3Aopen+label%3Agopls)

If you are unable to resolve your issue, please ask for help. Make sure to mention that you are using `gopls`. Here's how to ask for guidance:

* [File a VS Code Go issue](https://github.com/golang/vscode-go/issues/new/choose). If it is a bug in `gopls`, we will transfer your issue to the [`gopls` issue tracker](https://github.com/golang/go/issues).
* [File a `gopls` issue](https://github.com/golang/go/issues/new) directly.
* Ask a question in the `#gopls` channel on [Gophers Slack].
* Ask a question in the `#vscode` channel on [Gophers Slack].

[Go modules]: https://blog.golang.org/using-go-modules
[`gopls`]: https://golang.org/s/gopls
[Gophers Slack]: https:/gophers.slack.com/
