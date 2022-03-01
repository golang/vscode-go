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
import { getGoConfig, getGoplsConfig } from './config';
import { getBinPath, getGoVersion } from './util';
import { toolExecutionEnvironment } from './goEnv';
import { getConfiguredTools } from './goTools';
import { inspectGoToolVersion } from './goInstallTools';

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

	private toolTree() {
		return new ToolTree();
	}

	private async toolTreeItems() {
		const goVersion = await getGoVersion();
		const allTools = getConfiguredTools(goVersion, getGoConfig(), getGoplsConfig());
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
	contextValue = 'go:explorer:env';
	collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
	iconPath = new vscode.ThemeIcon('folder-opened');
	constructor(public description = '', public workspace?: vscode.Uri) {}
}

function isEnvTree(item?: vscode.TreeItem): item is EnvTree {
	return item?.contextValue === 'go:explorer:env';
}

class EnvTreeItem implements vscode.TreeItem {
	file?: vscode.Uri;
	label: string;
	contextValue?: string;
	tooltip?: string;
	constructor(public key: string, public value: string) {
		this.label = `${key}=${replaceHome(value)}`;
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

class ToolTree implements vscode.TreeItem {
	label = 'tools';
	contextValue = 'go:explorer:tools';
	collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
	iconPath = new vscode.ThemeIcon('package');
}

function isToolTree(item?: vscode.TreeItem): item is ToolTree {
	return item?.contextValue === 'go:explorer:tools';
}

class ToolTreeItem implements vscode.TreeItem {
	contextValue = 'go:explorer:toolitem';
	description = 'not installed';
	label: string;
	children: vscode.TreeItem[];
	collapsibleState?: vscode.TreeItemCollapsibleState;
	tooltip: string;
	constructor({ name, version, goVersion, binPath, error }: ToolDetail) {
		this.label = name;
		if (binPath) {
			this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
			this.children = [new ToolDetailTreeItem(binPath, goVersion)];
			this.description = version;
			this.tooltip = `${name}@${version}`;
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

class ToolDetailTreeItem implements vscode.TreeItem {
	contextValue = 'go:explorer:tooldetail';
	label: string;
	description: string;
	tooltip: string;
	constructor(bin: string, goVersion: string) {
		this.label = replaceHome(bin);
		this.description = goVersion;
		this.tooltip = `${bin} ${goVersion}`;
	}
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
		return { name: name, error: e };
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
