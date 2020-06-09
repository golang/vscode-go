# Contributing

We welcome your contributions and thank you for working to improve the Go development experience in VS Code.

This guide will explain the process of setting up your development environment to work on the VS Code Go extension, as well as the process of sending out your change for review. If you're interested in testing the master branch or pre-releases of the extension, please see the [Go Nightly documentation](nightly.md).

* [Before you start coding](#before-you-start-coding)
  * [Ask for help](#ask-for-help)
  * [Debug Adapter](#debug-adapter)
* [Developing](#developing)
  * [Setup](#setup)
  * [Run](#run)
  * [Test](#test)
  * [Sideload](#sideload)
* [Mail your change for review](#mail-your-change-for-review)

## Before you start coding

If you are interested in fixing a bug or contributing a feature, please [file an issue](https://github.com/golang/vscode-go/issues/new/choose) first. Wait for a project maintainer to respond before you spend time coding.

If you wish to work on an existing issue, please add a comment saying so, as someone may already be working on it. A project maintainer may respond with advice on how to get started. If you're not sure which issues are available, search for issues with the [help wanted label](https://github.com/golang/vscode-go/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).

### Ask for help

The VS Code Go maintainers are reachable via the issue tracker and the [#vscode-dev] channel in the [Gophers Slack]. Please reach out on Slack with questions, suggestions, or ideas. If you have trouble getting started on an issue, we'd be happy to give pointers and advice.

### Debug Adapter

Please note that extra configuration is required to build and run the [Debug Adapter](debug-adapter.md), which controls the debugging features of this extension. Refer to [the documentation for the Debug Adapter](debug-adapter.md) to set that up.

## Developing

### Setup

1) Install [node](https://nodejs.org/en/).
2) Clone the repository, run `npm install`, and open VS Code:

    ```bash
    git clone https://github.com/golang/vscode-go
    cd vscode-go
    npm install
    code .
    ```

3) Make sure the `window.openFoldersInNewWindow` setting is not `"on"`.

#### Lint

You can run `npm run lint` on the command-line to check for lint errors in your program. You can also use the [TSLint](https://marketplace.visualstudio.com/items?itemName=ms-vscode.vscode-typescript-tslint-plugin) plugin to see errors as you code.

### Run

To run the extension with your patch, open the Run view (`Ctrl+Shift+D`), select `Launch Extension`, and click the Play button (`F5`).

This will open a new VS Code window with the title `[Extension Development Host]`. You can then open a folder that contains Go code and try out your changes.

You can also set breakpoints to debug your change.

If you make subsequent edits in the codebase, you can reload (`Ctrl+R`) the `[Extension Development Host]` instance of VS Code, which will load the new code. The debugger will automatically reattach.

## Test

There are currently three test launch configurations: (1) `Launch Extension Tests`, (2) `Launch Extension Tests with Gopls`, and (3) `Launch Unit Tests`. To run the tests locally, open the Run view (`Ctrl+Shift+D`), select the relevant launch configuration, and hit the Play button (`F5`).

## Sideload

After making changes to the extension, you may want to test it end-to-end instead of running it in debug mode. To do this, you can sideload the extension.

1. Install the [vsce](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#vsce) tool for packaging extensions (`npm install -g vsce`).
2. `cd` into your `vscode-go` directory.
3. Install all dependencies by running `npm install`.
4. Run `vsce package`. This will generate a file with a `.vsix` extension in your current directory.

    ```bash
    npm install -g vsce
    cd vscode-go
    npm install
    vsce package
    ```

5. Open a VS Code window, navigate to the Extensions view, and disable or uninstall the default Go extension.
6. Click on the "..." in the top-right corner, select "Install
from VSIX...", and choose the generated VSIX file. Alternatively, you can run `code --install-extension path/to/go.vsix` or open the Command Palette and run the `Extensions: Install from VSIX...` command.

## Mail your change for review

Once you have coded, built, and tested your change, it's ready for review! There are two ways to mail your change: (1) through [a GitHub pull request (PR)](https://golang.org/doc/contribute.html#sending_a_change_github), or (2) through a [Gerrit code review](https://golang.org/doc/contribute.html#sending_a_change_gerrit).

In either case, code review will happen in [Gerrit](https://www.gerritcodereview.com/), which is used for all repositories in the Go project. GitHub pull requests will be mirrored into Gerrit, so you can follow a more traditional GitHub workflow, but you will still have to look at Gerrit to read comments.

The easiest way to start is by reading this [detailed guide for contributing to the Go project](https://golang.org/doc/contribute.html). Important things to note are:

* You will need to sign the [Google CLA](https://golang.org/doc/contribute.html#cla).
* Your commit message should follow the standards described on the [Commit Message Wiki](https://github.com/golang/go/wiki/CommitMessage).
* Your change should include tests (if possible).

Once you've sent out your change, a maintainer will take a look at your contribution within a few weeks. If you don't hear back, feel free to ping the issue or send a message to the [#vscode-dev] channel of the [Gophers Slack].

## [Continuous Integration](testing.md)

The extension's test suite will run on your change once it has been mailed. If you have contributed via a GitHub PR, the test results will be provided via a [GitHub Action](testing.md#testing-via-github-actions) result on the PR. If you have mailed a Gerrit CL directly, tests will run in [Google Cloud Build](testing.md#testing-via-gcb), and the results will be posted back on the CL.

Note that, as of June 2020, the GCB and Gerrit integration is not yet ready, so the results of the CI run **will not** appear on the Gerrit changelist. Instead, if your change fails on GCB, we will notify you and provide you with the relevant logs.

[#vscode-dev]: https://gophers.slack.com/archives/CUWGEKH5Z
[Gophers Slack]: https://invite.slack.golangbridge.org/
