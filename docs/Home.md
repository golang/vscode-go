Welcome to the VSCode Go Wiki!

### 📣 News and Upcoming Changes

[Remote attach debugging](./debugging#connecting-to-headless-delve-with-target-specified-at-server-start-up) is now available via Delve's native DAP implementation with Delve v1.7.3 or newer.
We plan to enable this as the default in 2022 H1 to enhance remote debugging with the same
[debugging features](./debugging.md) that are already in use for local debugging.
We recommend switching your remote attach configurations in `launch.json` to use
`"debugAdapter":"dlv-dap"` now to verify that this works for you.
Please [file a new issue](https://github.com/golang/vscode-go/issues/new/choose) if you encounter any problems.

### User Documentation

* [Overview of Extension Features](features.md)

* [Debugging Feature](debugging)
* [Diagnostics](https://github.com/golang/tools/blob/master/gopls/doc/analyzers.md)
* [Setting Up Your Workspace](https://github.com/golang/tools/blob/master/gopls/doc/workspace.md)

* [Available Settings](settings.md)
* [List of Extension Commands](commands.md)
* [Commonly Used `tasks.json` Setup](tasks.md)
* [3rd-party Tools Used By Extension](tools.md)
* [User Interface](ui.md)
* [FAQs](faq.md)
* [Troubleshooting](troubleshooting.md)
* [Advanced Topics](advanced.md)
* [How to Contribute](contributing.md)
