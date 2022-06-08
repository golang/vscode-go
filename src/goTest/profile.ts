/* eslint-disable node/no-unsupported-features/node-builtins */
/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import {
	EventEmitter,
	Memento,
	Range,
	TestItem,
	TextDocumentShowOptions,
	TreeDataProvider,
	TreeItem,
	TreeItemCollapsibleState,
	Uri,
	ViewColumn
} from 'vscode';
import vscode = require('vscode');
import { promises as fs } from 'fs';
import { ChildProcess, spawn } from 'child_process';
import { getBinPath, getTempFilePath } from '../util';
import { GoTestResolver } from './resolve';
import { killProcessTree } from '../utils/processUtils';
import { correctBinname } from '../utils/pathUtils';

export type ProfilingOptions = { kind?: Kind['id'] };

const optionsMemento = 'testProfilingOptions';
const defaultOptions: ProfilingOptions = { kind: 'cpu' };
const pprofProcesses = new Set<ChildProcess>();

export function killRunningPprof() {
	return new Promise<boolean>((resolve) => {
		pprofProcesses.forEach((proc) => killProcessTree(proc));
		pprofProcesses.clear();
		resolve(true);
	});
}

export class GoTestProfiler {
	public readonly view = new ProfileTreeDataProvider(this);

	// Maps test IDs to profile files. See docs/test-explorer.md for details.
	private readonly runs = new Map<string, File[]>();

	constructor(private readonly resolver: GoTestResolver, private readonly workspaceState: Memento) {}

	get options() {
		return this.workspaceState.get<ProfilingOptions>(optionsMemento) || defaultOptions;
	}
	set options(v: ProfilingOptions) {
		this.workspaceState.update(optionsMemento, v);
	}

	preRun(options: ProfilingOptions, item: TestItem): string[] {
		const kind = options.kind && Kind.get(options.kind);
		if (!kind) return [];

		const run = new File(kind, item);
		const flags = [...run.flags];
		if (this.runs.has(item.id)) this.runs.get(item.id)?.unshift(run);
		else this.runs.set(item.id, [run]);
		return flags;
	}

	postRun() {
		// Update the list of tests that have profiles.
		vscode.commands.executeCommand('setContext', 'go.profiledTests', Array.from(this.runs.keys()));
		vscode.commands.executeCommand('setContext', 'go.hasProfiles', this.runs.size > 0);

		this.view.fireDidChange();
	}

	hasProfileFor(id: string): boolean {
		return this.runs.has(id);
	}

	async configure(): Promise<ProfilingOptions | undefined> {
		const { profilekind } =
			(await vscode.window.showQuickPick(
				Kind.all.map((x) => ({ label: x.label, profilekind: x })),
				{
					title: 'Profile'
				}
			)) ?? {};
		if (!profilekind) return;

		return {
			kind: profilekind.id
		};
	}

	async delete(file: File) {
		await file.delete();

		const runs = this.runs.get(file.target.id);
		if (!runs) return;

		const i = runs.findIndex((x) => x === file);
		if (i < 0) return;

		runs.splice(i, 1);
		if (runs.length === 0) {
			this.runs.delete(file.target.id);
		}
		this.view.fireDidChange();
	}

	async show(item: TestItem) {
		const { query: kind, fragment: name } = Uri.parse(item.id);
		if (kind !== 'test' && kind !== 'benchmark' && kind !== 'example') {
			await vscode.window.showErrorMessage('Selected item is not a test, benchmark, or example');
			return;
		}

		const runs = this.runs.get(item.id);
		if (!runs || runs.length === 0) {
			await vscode.window.showErrorMessage(`${name} has not been profiled`);
			return;
		}

		await runs[0].show();
	}

	// Tests that have been profiled
	get tests() {
		const items = Array.from(this.runs.keys());
		items.sort((a: string, b: string) => {
			const aWhen = this.runs.get(a)?.[0].when.getTime() ?? 0;
			const bWhen = this.runs.get(b)?.[0].when.getTime() ?? 0;
			return bWhen - aWhen;
		});

		// Filter out any tests that no longer exist
		return items.map((x) => this.resolver.all.get(x)).filter((x): x is TestItem => !!x);
	}

	// Profiles associated with the given test
	get(item: TestItem) {
		return this.runs.get(item.id) || [];
	}
}

async function show(profile: string) {
	const foundDot = await new Promise<boolean>((resolve, reject) => {
		const proc = spawn(correctBinname('dot'), ['-V']);

		proc.on('error', (err) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			if ((err as any).code === 'ENOENT') resolve(false);
			else reject(err);
		});

		proc.on('exit', (code, signal) => {
			if (signal) reject(new Error(`Received signal ${signal}`));
			else if (code) reject(new Error(`Exited with code ${code}`));
			else resolve(true);
		});
	});
	if (!foundDot) {
		const r = await vscode.window.showErrorMessage(
			'Failed to execute dot. Is Graphviz installed?',
			'Open graphviz.org'
		);
		if (r) await vscode.env.openExternal(vscode.Uri.parse('https://graphviz.org/'));
		return;
	}

	const proc = spawn(getBinPath('go'), ['tool', 'pprof', '-http=:', '-no_browser', profile]);
	pprofProcesses.add(proc);

	const port = await new Promise<string | undefined>((resolve, reject) => {
		proc.on('error', (err) => {
			pprofProcesses.delete(proc);
			reject(err);
		});

		proc.on('exit', (code, signal) => {
			pprofProcesses.delete(proc);
			reject(signal || code);
		});

		let stderr = '';
		function captureStdout(b: Buffer) {
			stderr += b.toString('utf-8');

			const m = stderr.match(/^Serving web UI on http:\/\/localhost:(?<port>\d+)\n/);
			if (!m) return;

			resolve(m.groups?.port);
			proc.stdout.off('data', captureStdout);
		}

		proc.stderr.on('data', captureStdout);
	});

	const panel = vscode.window.createWebviewPanel('go.profile', 'Profile', ViewColumn.Active);
	panel.webview.options = { enableScripts: true };
	panel.webview.html = `<html>
		<head>
			<style>
				body {
					padding: 0;
					background: white;
					overflow: hidden;
				}

				iframe {
					border: 0;
					width: 100%;
					height: 100vh;
				}
			</style>
		</head>
		<body>
			<iframe src="http://localhost:${port}"></iframe>
		</body>
	</html>`;

	panel.onDidDispose(() => killProcessTree(proc));
}

class Kind {
	private static byID = new Map<string, Kind>();

	static get(id: string): Kind | undefined {
		return this.byID.get(id);
	}

	static get all() {
		return Array.from(this.byID.values());
	}

	private constructor(
		public readonly id: 'cpu' | 'mem' | 'mutex' | 'block',
		public readonly label: string,
		public readonly flag: string
	) {
		Kind.byID.set(id, this);
	}

	static readonly CPU = new Kind('cpu', 'CPU', '--cpuprofile');
	static readonly Memory = new Kind('mem', 'Memory', '--memprofile');
	static readonly Mutex = new Kind('mutex', 'Mutex', '--mutexprofile');
	static readonly Block = new Kind('block', 'Block', '--blockprofile');
}

class File {
	private static nextID = 0;

	public readonly id = File.nextID++;
	public readonly when = new Date();

	constructor(public readonly kind: Kind, public readonly target: TestItem) {}

	async delete() {
		return Promise.all(
			[getTempFilePath(`${this.name}.prof`), getTempFilePath(`${this.name}.test`)].map((file) => fs.unlink(file))
		);
	}

	get label() {
		return `${this.kind.label} @ ${this.when.toTimeString()}`;
	}

	get name() {
		return `profile-${this.id}.${this.kind.id}`;
	}

	get flags(): string[] {
		return [this.kind.flag, getTempFilePath(`${this.name}.prof`), '-o', getTempFilePath(`${this.name}.test`)];
	}

	get uri() {
		return Uri.file(getTempFilePath(`${this.name}.prof`));
	}

	async show() {
		await show(getTempFilePath(`${this.name}.prof`));
	}
}

type TreeElement = TestItem | File;

class ProfileTreeDataProvider implements TreeDataProvider<TreeElement> {
	private readonly didChangeTreeData = new EventEmitter<void | TreeElement>();
	public readonly onDidChangeTreeData = this.didChangeTreeData.event;

	constructor(private readonly profiler: GoTestProfiler) {}

	fireDidChange() {
		this.didChangeTreeData.fire();
	}

	getTreeItem(element: TreeElement): TreeItem {
		if (element instanceof File) {
			const item = new TreeItem(element.label);
			item.contextValue = 'go:test:file';
			item.command = {
				title: 'Open',
				command: 'vscode.open',
				arguments: [element.uri]
			};
			return item;
		}

		const item = new TreeItem(element.label, TreeItemCollapsibleState.Collapsed);
		item.contextValue = 'go:test:test';
		const options: TextDocumentShowOptions = {
			preserveFocus: false,
			selection: element.range && new Range(element.range.start, element.range.start)
		};
		item.command = {
			title: 'Go to test',
			command: 'vscode.open',
			arguments: [element.uri, options]
		};
		return item;
	}

	getChildren(element?: TreeElement): TreeElement[] {
		if (!element) return this.profiler.tests;
		if (element instanceof File) return [];
		return this.profiler.get(element);
	}
}
