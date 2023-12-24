/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import vscode = require('vscode');
import vscodeUri = require('vscode-uri');
import os = require('os');
import path = require('path');
import { getGoConfig, getGoplsConfig } from './config';
import { getBinPath } from './util';
import { getConfiguredTools } from './goTools';
import { inspectGoToolVersion } from './goInstallTools';
import { runGoEnv } from './goModules';

/**
 * GoExplorerProvider provides data for the Go tree view in the Explorer
 * Tree View Container.
 */
export class GoExplorerProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private goEnvCache = new Cache((uri) => GoEnv.get(uri ? vscode.Uri.parse(uri) : undefined), Time.MINUTE);
	private toolDetailCache = new Cache((name) => getToolDetail(name), Time.HOUR);
	private activeFolder?: vscode.WorkspaceFolder;
	private activeDocument?: vscode.TextDocument;

	static setup(ctx: vscode.ExtensionContext) {
		const provider = new this(ctx);
		const {
			window: { registerTreeDataProvider },
			commands: { registerCommand, executeCommand }
		} = vscode;
		ctx.subscriptions.push(
			registerTreeDataProvider('go.explorer', provider),
			registerCommand('go.explorer.refresh', () => provider.update(true)),
			registerCommand('go.explorer.open', (item) => provider.open(item)),
			registerCommand('go.workspace.editEnv', (item) => provider.editEnv(item)),
			registerCommand('go.workspace.resetEnv', (item) => provider.resetEnv(item))
		);
		executeCommand('setContext', 'go.showExplorer', true);
		return provider;
	}

	private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(ctx: vscode.ExtensionContext) {
		this.update();
		ctx.subscriptions.push(
			vscode.window.onDidChangeActiveTextEditor(() => this.update()),
			vscode.workspace.onDidChangeWorkspaceFolders(() => this.update()),
			vscode.workspace.onDidChangeConfiguration(() => this.update(true)),
			vscode.workspace.onDidCloseTextDocument((doc) => {
				if (!this.activeFolder) {
					this.goEnvCache.delete(vscodeUri.Utils.dirname(doc.uri).toString());
				}
			})
		);
	}

	getTreeItem(element: vscode.TreeItem) {
		return element;
	}

	getChildren(element?: vscode.TreeItem) {
		if (!element) {
			return [this.envTree(), this.toolTree()];
		}
		if (isEnvTree(element)) {
			return this.envTreeItems(element.workspace);
		}
		if (isToolTree(element)) {
			return this.toolTreeItems();
		}
		if (isToolTreeItem(element)) {
			return element.children;
		}
	}

	private update(clearCache = false) {
		if (clearCache) {
			this.goEnvCache.clear();
			this.toolDetailCache.clear();
		}
		const { activeTextEditor } = vscode.window;
		const { getWorkspaceFolder, workspaceFolders } = vscode.workspace;
		this.activeDocument = activeTextEditor?.document;
		this.activeFolder = activeTextEditor?.document
			? getWorkspaceFolder(activeTextEditor.document.uri) || workspaceFolders?.[0]
			: workspaceFolders?.[0];
		this._onDidChangeTreeData.fire();
	}

	private async open(item: EnvTreeItem) {
		if (typeof item.file === 'undefined') return;
		const edit = new vscode.WorkspaceEdit();
		edit.createFile(item.file, { ignoreIfExists: true });
		await vscode.workspace.applyEdit(edit);
		const doc = await vscode.workspace.openTextDocument(item.file);
		await vscode.window.showTextDocument(doc);
	}

	private async editEnv(item?: EnvTreeItem) {
		const uri = this.activeFolder?.uri;
		if (!uri) {
			return;
		}
		let pick: { label?: string; description?: string } | undefined;
		if (isEnvTreeItem(item)) {
			pick = { label: item.key, description: item.value };
		} else {
			const items = Object.entries<string>(await runGoEnv(uri))
				.filter(([label]) => !GoEnv.readonlyVars.has(label))
				.map(([label, description]) => ({
					label,
					description
				}));
			pick = await vscode.window.showQuickPick(items, { title: 'Go: Edit Workspace Env' });
		}
		if (!pick) return;
		const { label, description } = pick;
		const value = await vscode.window.showInputBox({ title: label, value: description });
		if (label && typeof value !== 'undefined') {
			await GoEnv.edit({ [label]: value });
		}
	}

	private async resetEnv(item?: EnvTreeItem) {
		if (item?.key) {
			await GoEnv.reset([item.key]);
			return;
		}
		await GoEnv.reset();
	}

	private envTree() {
		if (this.activeFolder) {
			const { name, uri } = this.activeFolder;
			return new EnvTree(name, uri);
		}
		if (this.activeDocument) {
			const { fileName, uri } = this.activeDocument;
			return new EnvTree(path.basename(fileName), vscodeUri.Utils.dirname(uri));
		}
		return new EnvTree();
	}

	private async envTreeItems(uri?: vscode.Uri) {
		const env = await this.goEnvCache.get(uri?.toString() ?? '');
		const items = [];
		for (const [k, v] of Object.entries(env)) {
			if (v !== '') {
				items.push(new EnvTreeItem(k, v));
			}
		}
		return items;
	}

	private toolTree() {
		return new ToolTree();
	}

	private async toolTreeItems() {
		const allTools = getConfiguredTools(getGoConfig(), getGoplsConfig());
		const toolsInfo = await Promise.all(allTools.map((tool) => this.toolDetailCache.get(tool.name)));
		const items = [];
		for (const t of toolsInfo) {
			items.push(new ToolTreeItem(t));
		}
		return items;
	}
}

class EnvTree implements vscode.TreeItem {
	label = 'env';
	contextValue = 'go:explorer:envtree';
	collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
	iconPath = new vscode.ThemeIcon('symbol-folder');
	constructor(public description = '', public workspace?: vscode.Uri) {}
}

function isEnvTree(item?: vscode.TreeItem): item is EnvTree {
	return item?.contextValue === 'go:explorer:envtree';
}

class EnvTreeItem implements vscode.TreeItem {
	file?: vscode.Uri;
	label: string;
	contextValue?: string;
	tooltip?: string;
	constructor(public key: string, public value: string) {
		this.label = `${key}=${replaceHome(value)}`;
		this.contextValue = 'go:explorer:envitem';
		if (GoEnv.fileVars.has(key)) {
			this.contextValue = 'go:explorer:envfile';
			this.file = vscode.Uri.file(value);
		}
		this.tooltip = `${key}=${value}`;
	}
}

function isEnvTreeItem(item?: vscode.TreeItem): item is EnvTreeItem {
	return item?.contextValue === 'go:explorer:envitem';
}

class GoEnv {
	/**
	 * get returns a subset of go env vars, the union of this.vars and values
	 * set with toolsEnvVars in the go workspace config.
	 * @param uri the directory from which to run go env.
	 * @returns the output of running go env -json VAR1 VAR2...
	 */
	static async get(uri?: vscode.Uri) {
		const toolsEnv = await getGoConfig(uri)['toolsEnvVars'];
		const output = await runGoEnv(uri, [...this.vars, ...Object.keys(toolsEnv)]);
		return output as Record<string, string>;
	}

	/**
	 * update writes to toolsEnvVars in the go workspace config.
	 * @param vars a record of env vars to update.
	 */
	static async edit(vars: Record<string, string>) {
		const config = getGoConfig();
		await config.update('toolsEnvVars', { ...config['toolsEnvVars'], ...vars });
	}

	/**
	 * reset removes entries from toolsEnvVars in the go workspace config.
	 * @param vars env vars to reset.
	 */
	static async reset(vars?: string[]) {
		const config = getGoConfig();
		let env: Record<string, string> = {};
		if (vars) {
			env = { ...config['toolsEnvVars'] };
			for (const v of vars) {
				delete env[v];
			}
		}
		await config.update('toolsEnvVars', env);
	}

	/** Vars that point to files. */
	static fileVars = new Set(['GOMOD', 'GOWORK', 'GOENV']);

	/** Vars available from 'go env' but not read from the environment */
	static readonlyVars = new Set([
		'GOEXE',
		'GOGCCFLAGS',
		'GOHOSTARCH',
		'GOHOSTOS',
		'GOMOD',
		'GOTOOLDIR',
		'GOVERSION',
		'GOWORK'
	]);

	/** Vars that should always be visible if they contain a value. */
	private static vars = ['GOPRIVATE', 'GOMOD', 'GOWORK', 'GOENV', 'GOTOOLCHAIN'];
}

class ToolTree implements vscode.TreeItem {
	label = 'tools';
	contextValue = 'go:explorer:tools';
	collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
	iconPath = new vscode.ThemeIcon('tools');
}

function isToolTree(item?: vscode.TreeItem): item is ToolTree {
	return item?.contextValue === 'go:explorer:tools';
}

class ToolTreeItem implements vscode.TreeItem {
	contextValue = 'go:explorer:toolitem';
	description = 'not installed';
	label: string;
	children?: vscode.TreeItem[];
	collapsibleState?: vscode.TreeItemCollapsibleState;
	tooltip?: string;
	constructor({ name, version, goVersion, binPath, error }: ToolDetail) {
		this.label = name;
		if (binPath) {
			this.label = `${name}@${version}`;
			this.description = `${replaceHome(binPath)} ${goVersion}`;
			this.tooltip = `${this.label} ${this.description}`;
		}
		if (error) {
			const msg = `go version -m failed: ${error}`;
			this.description = msg;
			this.tooltip = msg;
		}
	}
}

function isToolTreeItem(item?: vscode.TreeItem): item is ToolTreeItem {
	return item?.contextValue === 'go:explorer:toolitem';
}

interface ToolDetail {
	name: string;
	goVersion?: string;
	version?: string;
	binPath?: string;
	error?: Error;
}

async function getToolDetail(name: string): Promise<ToolDetail> {
	const toolPath = getBinPath(name);
	if (!path.isAbsolute(toolPath)) {
		return { name: name };
	}
	try {
		const { goVersion, moduleVersion } = await inspectGoToolVersion(toolPath);
		return {
			name: name,
			binPath: toolPath,
			goVersion: goVersion,
			version: moduleVersion
		};
	} catch (e) {
		return { name: name, error: e as Error };
	}
}

const enum Time {
	SECOND = 1000,
	MINUTE = SECOND * 60,
	HOUR = MINUTE * 60
}

interface CacheEntry<T> {
	entry: T;
	updatedAt: number;
}

class Cache<T> {
	private cache = new Map<string, CacheEntry<T>>();

	constructor(private fn: (key: string) => Promise<T>, private ttl: number) {}

	async get(key: string, ttl = this.ttl) {
		const cache = this.cache.get(key);
		const useCache = cache && Date.now() - cache.updatedAt < ttl;
		if (useCache) {
			return cache.entry;
		}
		const entry = await this.fn(key);
		this.cache.set(key, { entry, updatedAt: Date.now() });
		return entry;
	}

	clear() {
		return this.cache.clear();
	}

	delete(key: string) {
		return this.cache.delete(key);
	}
}

/**
 * replaceHome replaces the home directory prefix of a string with `~`.
 * @param maybePath a string that might be a file system path.
 * @returns the string with os.homedir() replaced by `~`.
 */
function replaceHome(maybePath: string) {
	return maybePath.replace(new RegExp(`^${os.homedir()}`), '~');
}
