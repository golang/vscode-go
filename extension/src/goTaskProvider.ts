/*---------------------------------------------------------
 * Copyright 2023 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';
import { getGoConfig } from './config';
import { toolExecutionEnvironment } from './goEnv';
import { getBinPath } from './util';

const TASK_TYPE = 'go';
type GoCommand = 'build' | 'test'; // TODO(hyangah): run, install?

interface GoTaskDefinition extends vscode.TaskDefinition {
	label?: string;

	command: GoCommand;
	args?: string[];

	options?: vscode.ProcessExecutionOptions;
	// TODO(hyangah): plumb go.testFlags and go.buildFlags
}

type Workspace = Pick<typeof vscode.workspace, 'workspaceFolders' | 'getWorkspaceFolder'>;

// GoTaskProvider provides default tasks
//   - build/test the current package
//   - build/test all packages in the current workspace
// This default task provider can be disabled by `go.tasks.provideDefault`.
//
// Note that these tasks run from the workspace root folder. If the workspace root
// folder and the package to test are not in the same module nor in the same workspace
// defined by a go.work file, the build/test task will fail because the tested package
// is not visible from the workspace root folder.
export class GoTaskProvider implements vscode.TaskProvider {
	private constructor(private workspace: Workspace) {}

	static setup(ctx: vscode.ExtensionContext, workspace: Workspace): GoTaskProvider | undefined {
		if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
			const provider = new GoTaskProvider(workspace);
			ctx.subscriptions.push(vscode.tasks.registerTaskProvider('go', provider));
			return provider;
		}
		return undefined;
	}

	// provides the default tasks.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	provideTasks(_: vscode.CancellationToken): vscode.ProviderResult<vscode.Task[]> {
		const folders = this.workspace.workspaceFolders;
		if (!folders || !folders.length) {
			// zero workspace folder setup.
			// In zero-workspace folder setup, vscode.TaskScope.Workspace doesn't seem to work.
			// The task API does not implement vscode.TaskScope.Global yet.
			// Once Global scope is supported, we can consider to add tasks like `go build ${fileDirname}`.
			return undefined;
		}

		const opened = vscode.window.activeTextEditor?.document?.uri;
		const goCfg = getGoConfig(opened);
		if (!goCfg.get('tasks.provideDefault')) {
			return undefined;
		}

		// Explicitly specify the workspace folder directory based on the current open file.
		// Behavior of tasks constructed with vscode.TaskScope.Workspace as scope
		// is not well-defined when handling multiple folder workspace.
		const folder = (opened && this.workspace.getWorkspaceFolder(opened)) || folders[0];
		return [
			// all tasks run from the chosen workspace root folder.
			buildGoTask(folder, {
				type: TASK_TYPE,
				label: 'build package',
				command: 'build',
				args: ['${fileDirname}']
			}),
			buildGoTask(folder, { type: TASK_TYPE, label: 'test package', command: 'test', args: ['${fileDirname}'] }),
			buildGoTask(folder, { type: TASK_TYPE, label: 'build workspace', command: 'build', args: ['./...'] }),
			buildGoTask(folder, { type: TASK_TYPE, label: 'test workspace', command: 'test', args: ['./...'] })
		];
	}

	// fill an incomplete task definition ('tasks.json') whose type is "go".
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	resolveTask(_task: vscode.Task, _: vscode.CancellationToken): vscode.ProviderResult<vscode.Task> {
		// vscode calls resolveTask for every 'go' type task in tasks.json.
		const def = _task.definition;
		if (def && def.type === TASK_TYPE) {
			if (!def.command) {
				def.command = 'build';
			}
			return buildGoTask(_task.scope ?? vscode.TaskScope.Workspace, def as GoTaskDefinition);
		}
		return undefined;
	}
}

function buildGoTask(scope: vscode.WorkspaceFolder | vscode.TaskScope, definition: GoTaskDefinition): vscode.Task {
	const cwd = definition.options?.cwd ?? (isWorkspaceFolder(scope) ? scope.uri.fsPath : undefined);
	const task = new vscode.Task(
		definition,
		scope,
		definition.label ?? defaultTaskName(definition),
		TASK_TYPE,
		new vscode.ProcessExecution(getBinPath('go'), [definition.command, ...(definition.args ?? [])], {
			cwd,
			env: mergedToolExecutionEnv(scope, definition.options?.env)
		}),
		['$go']
	);

	task.group = taskGroup(definition.command);
	task.detail = defaultTaskDetail(definition, cwd);
	task.runOptions = { reevaluateOnRerun: true };
	task.isBackground = false;
	task.presentationOptions.clear = true;
	task.presentationOptions.echo = true;
	task.presentationOptions.showReuseMessage = true;
	task.presentationOptions.panel = vscode.TaskPanelKind.Dedicated;
	return task;
}

function defaultTaskName({ command, args }: GoTaskDefinition): string {
	return `go ${command} ${(args ?? []).join(' ')}`;
}

function defaultTaskDetail(def: GoTaskDefinition, cwd: string | undefined): string {
	const cd = cwd ? `cd ${cwd}; ` : '';
	return `${cd}${defaultTaskName(def)}`;
}

function taskGroup(command: GoCommand): vscode.TaskGroup | undefined {
	switch (command) {
		case 'build':
			return vscode.TaskGroup.Build;
		case 'test':
			return vscode.TaskGroup.Test;
		default:
			return undefined;
	}
}

function isWorkspaceFolder(scope: vscode.WorkspaceFolder | vscode.TaskScope): scope is vscode.WorkspaceFolder {
	return typeof scope !== 'number' && 'uri' in scope;
}

function mergedToolExecutionEnv(
	scope: vscode.WorkspaceFolder | vscode.TaskScope,
	toAdd: { [key: string]: string } = {}
): { [key: string]: string } {
	const env = toolExecutionEnvironment(isWorkspaceFolder(scope) ? scope.uri : undefined, /* addProcessEnv: */ false);
	Object.keys(env).forEach((key) => {
		if (env[key] === undefined) {
			env[key] = '';
		}
	}); // unset
	return Object.assign(env, toAdd);
}
