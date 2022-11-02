# Contributing

We welcome your contributions and thank you for working to improve the Go development experience in VS Code.

This guide will explain the process of setting up your development environment to work on the VS Code Go extension, as well as the process of sending out your change for review. If you're interested in testing the master branch or pre-releases of the extension, please see the [Go Nightly documentation](nightly.md).

Our canonical Git repository is located at https://go.googlesource.com/vscode-go and https://github.com/golang/vscode-go is a mirror.

* [Before you start coding](#before-you-start-coding)
  * [Ask for help](#ask-for-help)
  * [Debug Adapter](#debug-adapter)
* [Developing](#developing)
  * [Setup](#setup)
  * [Run](#run)
  * [Test](#test)
  * [Sideload](#sideload)
* [Mail your change for review](#mail-your-change-for-review)
  * [Presubmit test in CI](#presubmit-test-in-ci)

## Before you start coding

If you are interested in fixing a bug or contributing a feature, please [file an issue](https://github.com/golang/vscode-go/issues/new/choose) first. Wait for a project maintainer to respond before you spend time coding.

If you wish to work on an existing issue, please add a comment saying so, as someone may already be working on it. A project maintainer may respond with advice on how to get started. If you're not sure which issues are available, search for issues with the [help wanted label](https://github.com/golang/vscode-go/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).

### Ask for help

The VS Code Go maintainers are reachable via the issue tracker and the [#vscode-dev] channel in the [Gophers Slack]. Please reach out on Slack with questions, suggestions, or ideas. If you have trouble getting started on an issue, we'd be happy to give pointers and advice.

### Language Server (`gopls`)

Many of the language features like auto-completion, documentation, diagnostics are implemented
by the Go language server ([`gopls`](https://pkg.go.dev/golang.org/x/tools/gopls)).
This extension communicates with `gopls` using [vscode LSP client library](https://github.com/microsoft/vscode-languageserver-node) from [`language/goLanguageServer.ts`](https://github.com/golang/vscode-go/tree/master/src/language).

For extending the language features or fixing bugs, please follow `gopls`'s
[contribution guide](https://github.com/golang/tools/blob/master/gopls/doc/contributing.md).

### Debug Adapter (`dlv dap`)

Debugging features are implemented by Delve (`dlv`) and its native DAP implementation 
([`dlv dap`](https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md)).

* goDebugConfiguration.ts: where launch configuration massaging occurs.
* goDebugFactory.ts: where a thin adapter that communicates with the `dlv dap` process is defined.
* [github.com/go-delve/delve](https://github.com/go-delve/delve/tree/master/service/dap): where native DAP implementation in Delve exists.

For extending the features of Delve, please follow `Delve` project's [contribution guide](https://github.com/go-delve/delve/blob/master/CONTRIBUTING.md).

The debugging feature documentation has a dedicated section for tips for development (See ["Developing"](https://github.com/golang/vscode-go/blob/master/docs/debugging.md#developing) section).

## Developing

### Setup

1) Install [node](https://nodejs.org/en/). Note: make sure that you are using `npm v7` or higher. The file format for `package-lock.json` (changed significantly)[https://docs.npmjs.com/cli/v7/configuring-npm/package-lock-json#file-format] in `npm v7`.
2) Clone the repository, run `npm ci`, and open VS Code:

    ```bash
    git clone https://go.googlesource.com/vscode-go
    cd vscode-go
    npm ci
    code .
    ```

#### Lint

You can run `npm run lint` on the command-line to check for lint errors in your program. You can also use the [TSLint](https://marketplace.visualstudio.com/items?itemName=ms-vscode.vscode-typescript-tslint-plugin) plugin to see errors as you code.

### Run

To run the extension with your patch, open the Run view (`Ctrl+Shift+D` or `⌘+⇧+D`), select `Launch Extension`, and click the Play button (`F5`).

This will open a new VS Code window with the title `[Extension Development Host]`. You can then open a folder that contains Go code and try out your changes.

You can also set breakpoints to debug your change.

If you make subsequent edits in the codebase, you can reload (`Ctrl+R` or `⌘+R`) the `[Extension Development Host]` instance of VS Code, which will load the new code. The debugger will automatically reattach.

## Test

**note**: Unfortunately, VS Code test framework inherits your user settings when running tests [Issue 43](https://github.com/golang/vscode-go/issues/43). Make sure VS Code user settings do not contain any go related configuration, except `go.gopath` or `go.toolsGopath` in case you installed the tools for testing in a different `GOPATH`.


1. `export GOPATH=/path/to/gopath/for/test`
2. `go run tools/installtools/main.go` -- this will install all tools in the `GOPATH/bin` built from master/main.
3. There are currently two different types of tests in this repo:
  - `npm run unit-test`: this runs unit tests defined in `test/unit`. They are light-weight tests that don't require `vscode` APIs.
  - `npm run test`: this runs the integration tests defined in `test/integration` and `test/gopls`. They test logic that involve `vscode` APIs - which requires actually downloading & running Visual Studio Code (`code`) and loading the compiled extension/test code in it.
4. Before sending a CL, make sure to run
  - `npm run lint`: this runs linter.
  - `go run tools/generate.go -w=false -gopls=true`: this checks generated documentations are up-to-date.

### Testing Tips

#### (1) Running only a subset of integration or unit tests:
When running them from terminal:
  - Option 1: Utilize `MOCHA_GREP` environment variable. That is equivalent with [`mocha --grep` flag](https://mochajs.org/#command-line-usage) that runs tests matching the given string or regexp. E.g. `MOCHA_GREP=gopls npm run test` which runs all integration tests whose suite/test names contain `"gopls"`.
  - Option 2: modify the test source code and set the [`only`](https://mochajs.org/#exclusive-tests) or [`skip`](https://mochajs.org/#inclusive-tests) depending on your need. If necessary, you can also modify `test/integration/index.ts` or `test/gopls/index.ts` to include only the test files you want to focus on. Make sure to revert them before sending the changes for review.

#### (2) Debugging tests from VS Code: 
`.vscode/launch.json` defines test launch configurations. To run the tests locally, open the Run view (`Ctrl+Shift+D`), select the relevant launch configuration, and hit the Play button (`F5`). Output and results of the tests, including any logging written with `console.log` will appear in the `DEBUG CONSOLE` tab.
You can supply environment variables (e.g. `MOCHA_GREP`) by modifying the launch configuration entry's `env` property.
  - `Launch Unit Tests`: runs unit tests in `test/unit` (same as `npm run unit-test`)
  - `Launch Extension Tests`: runs tests in `test/integration` directory (similar to `npm run test` but runs only tests under `test/integration` directory)
  - `Launch Extension Tests with Gopls`: runs tests in `test/gopls directory (similar to `npm run test` but runs only tests under `test/gopls` directory)

When you want to filter tests while debugging, utilize the `MOCAH_GREP` environment variable discussed previously - i.e., set the environment variable in the `env` property of the launch configuration.

#### (3) Another way to run all tests:
`build/all.bash test` is the script used by a CI (Linux).

#### (4) Using different versions of tools.
The tests will pick tools found from `GOPATH/bin` first. So, install the versions you want there.

## Running/Debugging the Extension

Select the [`Launch Extension`](https://github.com/golang/vscode-go/blob/e2a7fb523acffea3427ad7e369c3b2abc30b775b/.vscode/launch.json#L13) configuration, and hit the Play button (`F5`). This will build the extension and start a new VS Code window with the title `"[Extension Development Host]"` that uses the newly built extension. This instance has the node.js debugger attached automatically. You can debug using the VS Code Debug UI of the main window (e.g. set breakpoints, inspect variables, step, etc)

The VS Code window may have the folder or file used during your previous testing. If you want to change the folder during testing, close the folder by using "File > Close Folder", and open a new folder from the VS Code window under test.

### Debugging interaction with `gopls`

When developing features in `gopls`, you may need to attach a debugger to `gopls` and configure the extension to connect to the `gopls` instance using [the gopls deamon mode](https://github.com/golang/tools/blob/master/gopls/doc/daemon.md).

1. Start a gopls in deamon mode:
```
gopls -listen=:37374" -logfile=auto -debug=:0 serve
```

Or, if you use vscode for gopls development, you can configure `launch.json` of the `x/tools/gopls` project:

```
...
  {
    "name": "Launch Gopls",
    "type": "go",
    "request": "launch",
    "mode": "auto",
    "program": "${workspaceFolder}/gopls",
    "args": ["-listen=:37374", "-logfile=auto", "-debug=:0"],
    "cwd": "<... directory where you want to run your gopls from ...",
  }
...
```

2. Start the extension debug session using the `Launch Extension` configuration.

3. Configure the settings.json of the project open in the `"[Extension Development Host]"` window to start `gopls` that connects to the gopls we started in the step 1.

```
  "go.languageServerFlags": ["-remote=:37374", "-rpc.trace"]
```

## Sideload

After making changes to the extension, you may want to test it end-to-end instead of running it in debug mode. To do this, you can sideload the extension.

1. Install the [vsce](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#vsce) tool for packaging extensions (`npm install -g vsce`).
2. `cd` into your `vscode-go` directory.
3. Install all dependencies by running `npm ci`.
4. Run `vsce package`. This will generate a file with a `.vsix` extension in your current directory.

    ```bash
    npm install -g vsce
    cd vscode-go
    npm ci
    vsce package
    ```

5. Open a VS Code window, navigate to the Extensions view, and disable or uninstall the default Go extension.
6. Click on the "..." in the top-right corner, select "Install
from VSIX...", and choose the generated VSIX file. Alternatively, you can run `code --install-extension path/to/go.vsix` or open the Command Palette and run the `Extensions: Install from VSIX...` command.

## Mail your change for review

Once you have coded, built, and tested your change, it's ready for review! There are two ways to mail your change: (1) through [a GitHub pull request (PR)](https://golang.org/doc/contribute.html#sending_a_change_github), or (2) through a [Gerrit code review](https://golang.org/doc/contribute.html#sending_a_change_gerrit).

In either case, code review will happen in [Gerrit](https://www.gerritcodereview.com/), which is used for all repositories in the Go project. We strongly recommend the Gerrit code review if you plan to send many changes. GitHub pull requests will be mirrored into Gerrit, so you can follow a more traditional GitHub workflow, but you will still have to look at Gerrit to read comments.

The easiest way to start is by reading this [detailed guide for contributing to the Go project](https://golang.org/doc/contribute.html). Important things to note are:

* You will need to sign the [Google CLA](https://golang.org/doc/contribute.html#cla).
* Your commit message should follow the standards described on the [Commit Message Wiki](https://github.com/golang/go/wiki/CommitMessage).
* Your change should include tests (if possible).

Once you've sent out your change, a maintainer will take a look at your contribution within a few weeks. If you don't hear back, feel free to ping the issue or send a message to the [#vscode-dev] channel of the [Gophers Slack].

### Presubmit Test in CI

When you mail your CL or upload a new patch to an existing CL, *AND*
you or a fellow contributor assigns the `Run-TryBot=+1` label in Gerrit, the test command defined in 
`build/all.bash` will run by `Kokoro`, which is Jenkins-like Google infrastructure
for running Dockerized tests. `Kokoro` will post the result as a comment, and add its `TryBot-Result`
vote after each test run completes.

To force a re-run of the Kokoro CI,
  * Remove `TryBot-Result` vote (hover over the label, and click the trashcan icon).
  * Reply in Gerrit with the comment "kokoro rerun". Make sure to keep the `Run-TryBot` +1 vote.


[#vscode-dev]: https://gophers.slack.com/archives/CUWGEKH5Z
[Gophers Slack]: https://invite.slack.golangbridge.org/
