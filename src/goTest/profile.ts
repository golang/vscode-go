/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import { Memento, TestItem, Uri } from 'vscode';
import vscode = require('vscode');
import { getTempFilePath } from '../util';
import { GoTestResolver } from './resolve';

export type ProfilingOptions = { kind?: Kind['id'] };

const optionsMemento = 'testProfilingOptions';
const defaultOptions: ProfilingOptions = { kind: 'cpu' };

export class GoTestProfiler {
	private readonly lastRunFor = new Map<string, Run>();

	constructor(private readonly resolver: GoTestResolver, private readonly workspaceState: Memento) {}

	get options() {
		return this.workspaceState.get<ProfilingOptions>(optionsMemento) || defaultOptions;
	}
	set options(v: ProfilingOptions) {
		this.workspaceState.update(optionsMemento, v);
	}

	preRun(options: ProfilingOptions, items: TestItem[]): string[] {
		const kind = Kind.get(options.kind);
		if (!kind) {
			items.forEach((x) => this.lastRunFor.delete(x.id));
			return [];
		}

		const flags = [];
		const run = new Run(items, kind);
		flags.push(run.file.flag);
		items.forEach((x) => this.lastRunFor.set(x.id, run));
		return flags;
	}

	postRun() {
		// Update the list of tests that have profiles.
		vscode.commands.executeCommand('setContext', 'go.profiledTests', Array.from(this.lastRunFor.keys()));
	}

	hasProfileFor(id: string): boolean {
		return this.lastRunFor.has(id);
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

		const run = this.lastRunFor.get(item.id);
		if (!run) {
			await vscode.window.showErrorMessage(`${name} was not profiled the last time it was run`);
			return;
		}

		await run.file.show();
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

class Run {
	private static nextID = 0;

	public readonly when = new Date();
	public readonly id = Run.nextID++;
	public readonly file: File;

	constructor(public readonly targets: TestItem[], kind: Kind) {
		this.file = new File(this, kind);
	}
}

class File {
	constructor(public readonly run: Run, public readonly kind: Kind) {}

	get name() {
		return `profile-${this.run.id}.${this.kind.id}.prof`;
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
