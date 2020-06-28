# Modules

This extension mostly supports [Go modules]. However, certain features have not been ported to work with modules. The reason for this is that the Go team is developing a language server, [`gopls`](gopls.md). This provides a comprehensive solution for [Go modules] support in all editors.

However, as described in the [language server documentation](gopls.md), `gopls` is still in an alpha state, so it is **not yet** the default in VS Code Go. We understand that many users will not want to use alpha software, so this document describes how this extension works with [Go modules], **without the language server**.

To learn how to use the language server with modules in VS Code, read our [`gopls` documentation](gopls.md).

## Overview

* [Missing features](#missing-features)
  * [Formatting](#formatting)
  * [References and rename](#references-and-rename)
* [Performance](#performance)

## Missing features

As mentioned above, not all Go tools have been ported to work with modules. **Many tools will never be ported, as they are being replaced by [`gopls`](gopls.md).** [golang/go#24661](https://golang.org/issues/24661) contains up-to-date information about modules support in various Go tools.

### Formatting

The default [formatting](features.md#format-and-organize-imports) tool, [`goreturns`](tools.md#formatting), has not been ported to work with modules. As a result, you will need to change your [`"go.formatTool"`](settings.md#go.formatTool) setting for [formatting and import organization support](features.md#format-and-organize-imports). We recommend changing the value to `"goimports"` instead. Other options are also available, and you can read about them in the [format tools documentation](tools.md#formatting).

### [References](features.md#find-references) and [rename](features.md#rename-symbol)

The tools that provide these two features, [`guru`](tools.md#guru) and [`gorename`](tools.md#gorename), have not been updated for Go modules. Instead, they will be replaced by [`gopls`](gopls.md).

## Performance

[Go modules] introduced additional complexity to Go tooling. As a result, the performance of a number of tools is worse with modules enabled. Hopefully, you will not notice this too frequently.

One case in which you may notice this is autocompletion. The best solution to this is to switch to [`gopls`](gopls.md), which makes use of an in-memory cache to provide results quickly.

[Go modules]: https://blog.golang.org/using-go-modules
