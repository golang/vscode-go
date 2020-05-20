# Contributing

We welcome your contributions and thank you for working to improve the Go development experience in VS Code.

This guide will explain the process of setting up your development environment to work on the VS Code Go extension, as well as the process of sending out your change for review. If you're interested in testing the master branch or pre-releases of the extension, please see the [Go Nightly documentation](nightly.md).

* [Before you start coding](#before-you-start-coding)
  * [Ask for help](#ask-for-help)
* [Developing](#developing)
  * [Setup](#setup)
  * [Run](#run)
  * [Test](#test)
  * [Sideload](#sideload)
* [Mail your change](#mail-your-change)

## Before you start coding

If you are interested in fixing a bug or contributing a feature, please [file an issue](https://github.com/golang/vscode-go/issues/new/choose) first. Wait for a project maintainer to respond before you spend time coding.

If you wish to work on an existing issue, please add a comment saying so, as someone may already be working on it. A project maintainer may respond with advice on how to get started. If you're not sure which issues are available, search from issues with the [help wanted label](https://github.com/golang/vscode-go/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).

### Ask for help

The VS Code Go maintainers are reachable via the issue tracker and the [#vscode-dev](https://gophers.slack.com/archives/CUWGEKH5Z) channel on the [Gophers Slack](https://invite.slack.golangbridge.org/). Please reach out on Slack with questions, suggestions, or ideas. If you have trouble getting started on an issue, we'd be happy to give pointers and advice.

## Developing

### Setup

1) Install [node](https://nodejs.org/en/).
2) Clone the repository, run `npm install` and open VS Code:

    ```bash
    git clone https://github.com/golang/vscode-go
    cd vscode-go
    npm install
    code .
    ```

3) Make sure the `window.ope
nFoldersInNewWindow` setting is not `"on"`. <!--TODO(rstambler): Confirm that this is still required.-->

### Run

To run the extension with your patch, open the Run view (`Ctrl+Shift+D`), select `Launch Extension`, and click the Play button (`F5`).

This will open a new VS Code window with the title `[Extension Development Host]`. You can then open a folder that contains Go code and try out your changes.

You can also set breakpoints, which will work as you run the extension.

If you make further edits in the codebase, you can reload (`Ctrl+R`) the `[Extension Development Host]` instance of VS Code, which will load the new code. The debugging instance will automatically reattach.

To debug the Go debugger, see the [debugAdapter README](../src/debugAdapter/README.md).

## Test

To run the tests locally, open the Debug viewlet (`Ctrl+Shift+D`), select `Launch Tests`, then hit run (`F5`)

## Sideload

After making changes to the extension, you may want to test it end-to-end instead of running it in debug mode. To do this, you can sideload the extension.

1. Install the [vsce](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#vsce) tool for packaging extensions (`npm install -g vsce`).
2. `cd` into your `vscode-go` directory.
3. Install all dependencies by running `npm install`.
4. Run `vsce package` to build the package. This will generate a file a `.vsix` extension in your current directory.

    ```bash
    npm install -g vsce
    cd vscode-go
    npm install
    vsce package
    ```

5. Open a VS Code window, navigate to the Extensions view, and disable or uninstall the default Go extension.
6. Click on the "..." in the top-right corner, select "Install
from VSIX...", and choose the generated VSIX file. Alternatively, you can run `code --install-extension path/to/go.vsix` or open the Command Palette and run the "Extensions: Install from VSIX..." command.

## Mail your change

Once you have coded, built, and tested your change, it's ready for review!