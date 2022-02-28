/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import vscode = require('vscode');
import vscodeUri = require('vscode-uri');
import cp = require('child_process');
import util = require('util');
import os = require('os');
import path = require('path');
import { getGoConfig } from './config';
import { getBinPath } from './util';
import { toolExecutionEnvironment } from './goEnv';

/**
 * GoExplorerProvider provides data for the Go tree view in the Explorer
 * Tree View Container.
 */
export class GoExplorerProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private goEnvCache = new Cache((uri) => GoEnv.get(uri ? vscode.Uri.parse(uri) : undefined), 1000 * 60);
	private activeFolder?: vscode.WorkspaceFolder;
	private activeDocument?: vscode.TextDocument;

	static setup(ctx: vscode.ExtensionContext) {
		const provider = new this();
		ctx.subscriptions.push(vscode.window.registerTreeDataProvider('go.explorer', provider));
		ctx.subscriptions.push(vscode.commands.registerCommand('go.explorer.refresh', () => provider.update(true)));
		ctx.subscriptions.push(
			vscode.commands.registerCommand('go.explorer.open', (item: EnvTreeItem) => provider.open(item))
		);
		return provider;
	}

	private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor() {
		this.update();
		vscode.window.onDidChangeActiveTextEditor(() => this.update());
		vscode.workspace.onDidChangeWorkspaceFolders(() => this.update());
		vscode.workspace.onDidChangeConfiguration(() => this.update(true));
		vscode.workspace.onDidCloseTextDocument((doc) => {
			if (!this.activeFolder) {
				this.goEnvCache.delete(vscodeUri.Utils.dirname(doc.uri).toString());
			}
		});
	}

	getTreeItem(element: vscode.TreeItem) {
		return element;
	}

	getChildren(element?: vscode.TreeItem) {
		if (isEnvTree(element)) {
			return this.envTreeItems(element.workspace);
		}
		return [this.envTree()];
	}

	private update(clearCache = false) {
		if (clearCache) {
			this.goEnvCache.clear();
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
		const doc = await vscode.workspace.openTextDocument(item.file);
		await vscode.window.showTextDocument(doc);
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
		let env: Record<string, string>;
		try {
			env = await this.goEnvCache.get(uri?.toString());
		} catch (e) {
			vscode.window.showErrorMessage(`Failed to run "go env": ${e.message}`);
			return;
		}
		const items = [];
		for (const [k, v] of Object.entries(env)) {
			if (v !== '') {
				items.push(new EnvTreeItem(k, v));
			}
		}
		return items;
	}
}

function isEnvTree(item?: vscode.TreeItem): item is EnvTree {
	return item?.contextValue === 'go:explorer:env';
}

class EnvTree implements vscode.TreeItem {
	label = 'env';
	contextValue = 'go:explorer:env';
	collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
	iconPath = new vscode.ThemeIcon('folder-opened');
	constructor(public description = '', public workspace?: vscode.Uri) {}
}

class EnvTreeItem implements vscode.TreeItem {
	file?: vscode.Uri;
	label: string;
	contextValue?: string;
	tooltip?: string;
	constructor(public key: string, public value: string) {
		this.label = `${key}=${value.replace(new RegExp(`^${os.homedir()}`), '~')}`;
		this.contextValue = 'go:explorer:envitem';
		if (GoEnv.fileVars.includes(key)) {
			this.contextValue = 'go:explorer:envitem:file';
			this.file = vscode.Uri.file(value);
		}
		this.tooltip = `${key}=${value}`;
	}
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
		const output = await this.go(['env', '-json', ...this.vars, ...Object.keys(toolsEnv)], uri);
		return JSON.parse(output) as Record<string, string>;
	}

	/**
	 * update writes to toolsEnvVars in the go workspace config.
	 * @param vars a record of env vars to update.
	 */
	static async update(vars: Record<string, string>) {
		const config = getGoConfig();
		await config.update('toolsEnvVars', { ...config['toolsEnvVars'], ...vars });
	}

	/**
	 * reset removes entries from toolsEnvVars in the go workspace config.
	 * @param vars env vars to reset.
	 */
	static async reset(vars: string[]) {
		const config = getGoConfig();
		const env = { ...config['toolsEnvVars'] };
		for (const v of vars) {
			delete env[v];
		}
		await config.update('toolsEnvVars', env);
	}

	/** A list of env vars that point to files. */
	static fileVars = ['GOMOD', 'GOWORK', 'GOENV'];

	/** The list of env vars that should always be visible if they contain a value. */
	private static vars = ['GOPRIVATE', 'GOMOD', 'GOWORK', 'GOENV'];

	private static async go(args: string[], uri?: vscode.Uri) {
		const exec = util.promisify(cp.execFile);
		const goBin = getBinPath('go');
		const env = toolExecutionEnvironment(uri);
		const cwd = uri?.fsPath;
		const { stdout, stderr } = await exec(goBin, args, { env, cwd });
		if (stderr) {
			throw new Error(stderr);
		}
		return stdout;
	}
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
