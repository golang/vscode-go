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
	Uri
} from 'vscode';
import vscode = require('vscode');
import { getTempFilePath } from '../util';
import { GoTestResolver } from './resolve';

export type ProfilingOptions = { kind?: Kind['id'] };

const optionsMemento = 'testProfilingOptions';
const defaultOptions: ProfilingOptions = { kind: 'cpu' };

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
		const kind = Kind.get(options.kind);
		if (!kind) return [];

		const flags = [];
		const run = new File(kind, item);
		flags.push(run.flag);
		if (this.runs.has(item.id)) this.runs.get(item.id).unshift(run);
		else this.runs.set(item.id, [run]);
		return flags;
	}

	postRun() {
		// Update the list of tests that have profiles.
		vscode.commands.executeCommand('setContext', 'go.profiledTests', Array.from(this.runs.keys()));
		vscode.commands.executeCommand('setContext', 'go.hasProfiles', this.runs.size > 0);

		this.view.didRun();
	}

	hasProfileFor(id: string): boolean {
		return this.runs.has(id);
	}

	async configure(): Promise<ProfilingOptions | undefined> {
		const { kind } = await vscode.window.showQuickPick(
			Kind.all.map((x) => ({ label: x.label, kind: x })),
			{
				title: 'Profile'
			}
		);
		if (!kind) return;

		return {
			kind: kind.id
		};
	}

	async showProfiles(item: TestItem) {
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
			const aWhen = this.runs.get(a)[0].when.getTime();
			const bWhen = this.runs.get(b)[0].when.getTime();
			return bWhen - aWhen;
		});

		// Filter out any tests that no longer exist
		return items.map((x) => this.resolver.all.get(x)).filter((x) => x);
	}

	// Profiles associated with the given test
	get(item: TestItem) {
		return this.runs.get(item.id) || [];
	}
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

	get label() {
		return `${this.kind.label} @ ${this.when.toTimeString()}`;
	}

	get name() {
		return `profile-${this.id}.${this.kind.id}.prof`;
	}

	get flag(): string {
		return `${this.kind.flag}=${getTempFilePath(this.name)}`;
	}

	get uri(): Uri {
		return Uri.from({ scheme: 'go-tool-pprof', path: getTempFilePath(this.name) });
	}

	async show() {
		await vscode.window.showTextDocument(this.uri);
	}
}

type TreeElement = TestItem | File;

class ProfileTreeDataProvider implements TreeDataProvider<TreeElement> {
	private readonly didChangeTreeData = new EventEmitter<void | TreeElement>();
	public readonly onDidChangeTreeData = this.didChangeTreeData.event;

	constructor(private readonly profiler: GoTestProfiler) {}

	didRun() {
		this.didChangeTreeData.fire();
	}

	getTreeItem(element: TreeElement): TreeItem {
		if (element instanceof File) {
			const item = new TreeItem(element.label);
			item.contextValue = 'file';
			item.command = {
				title: 'Open',
				command: 'vscode.open',
				arguments: [element.uri]
			};
			return item;
		}

		const item = new TreeItem(element.label, TreeItemCollapsibleState.Collapsed);
		item.contextValue = 'test';
		const options: TextDocumentShowOptions = {
			preserveFocus: false,
			selection: new Range(element.range.start, element.range.start)
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
