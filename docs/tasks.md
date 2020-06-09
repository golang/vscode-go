# Using [VS Code Tasks] with Go

From the [VS Code Tasks] documentation:

> Tasks in VS Code can be configured to run scripts and start processes so that . . . existing tools can be used from within VS Code without having to enter a command line or write new code. Workspace or folder specific tasks are configured from the tasks.json file in the .vscode folder for a workspace.

To begin configuring tasks, run the `Tasks: Configure Task` command from the Command Palette (Ctrl+Shift+P).

This will create a `tasks.json` file in your workspace's `.vscode` folder.

Replace the contents of this file with the following and adjust the tasks as needed.

```json5
{
    "version": "2.0.0",
    "type": "shell",
    "command": "go",
    "cwd": "${workspaceFolder}",
    "tasks": [
        {
            "label": "install",
            "args": ["install", "-v", "./..."],
            "group": "build",
        },
        {
            "label": "run",
            "args": ["run", "${file}"],
            "group": "build",
        },
        {
            "label": "test",
            "args": ["test", "-v", "./..."],
            "group": "test",
        },
    ],
}
```

You can run these tasks via the `Tasks: Run Task` command or by using the Ctrl+Shift+B shortcut.

You can also define additional tasks to run other commands, like `go generate`. Here's an example of a task to run only a specific test (`MyTestFunction`, in this case):

```json5
{
    "label": "MyTestFunction",
    "args": [ "test", "./...", "-test.run", "MyTestFunction"]
}
```

If you want to invoke tools other than `go`, you will have to move the `"command": "go"` setting into the task objects. For example:

```json5
{
    "version": "2.0.0",
    "cwd": "${workspaceFolder}",
    "tasks": [
        {
            "label": "install",
            "command": "go",
            "args": ["install", "-v", "./..."],
            "group": "build",
            "type": "shell",
        },
        {
            "label": "run",
            "command": "go",
            "args": ["run", "${file}"],
            "group": "build"
            "type": "shell",
        },
        {
            "label": "test",
            "command": "go",
            "args": ["test", "-v", "./..."],
            "group": "test",
            "type": "shell",
        },
    ],
}
```

Learn more by reading the [VS Code Tasks] documentation.

[VS Code Tasks]: https://code.visualstudio.com/docs/editor/tasks
