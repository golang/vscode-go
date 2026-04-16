/*---------------------------------------------------------
 * Copyright 2025 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import vscode = require('vscode');
import { SymbolKind } from 'vscode-languageserver-protocol';

interface PackageSymbolsCommandResult {
	PackageName: string;
	Files: string[];
	Symbols: PackageSymbolData[];
}

enum PackageOutlineSortOrder {
	Position = 'position',
	Name = 'name'
}

export class GoPackageOutlineProvider implements vscode.TreeDataProvider<PackageSymbol> {
	private _onDidChangeTreeData: vscode.EventEmitter<PackageSymbol | undefined> = new vscode.EventEmitter<
		PackageSymbol | undefined
	>();

	readonly onDidChangeTreeData: vscode.Event<PackageSymbol | undefined> = this._onDidChangeTreeData.event;

	public result?: PackageSymbolsCommandResult;
	public activeDocument?: vscode.TextDocument;
	public view?: vscode.TreeView<PackageSymbol>;

	private readonly collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
	private packageSymbols: PackageSymbol[] = [];
	private packageItem = this.createPackageItem();
	private sortOrder = PackageOutlineSortOrder.Position;
	private lastRevealedSymbol?: PackageSymbol;

	static setup(ctx: vscode.ExtensionContext) {
		const provider = new this(ctx);
		provider.view = vscode.window.createTreeView('go.package.outline', {
			treeDataProvider: provider,
			showCollapseAll: true
		});
		ctx.subscriptions.push(provider.view);
		ctx.subscriptions.push(
			vscode.commands.registerCommand('go.packageOutline.sortByName', () =>
				provider.setSortOrder(PackageOutlineSortOrder.Name)
			),
			vscode.commands.registerCommand('go.packageOutline.sortByPosition', () =>
				provider.setSortOrder(PackageOutlineSortOrder.Position)
			)
		);
		provider.updateContextKeys();
		return provider;
	}

	constructor(ctx: vscode.ExtensionContext) {
		this.reload(vscode.window.activeTextEditor?.document);
		let previousVersion: number | undefined;
		// Reload package symbol data on saving active document with changes.
		ctx.subscriptions.push(
			vscode.workspace.onDidSaveTextDocument((d) => {
				if (d.uri === vscode.window.activeTextEditor?.document.uri) {
					if (d.version !== previousVersion) {
						this.reload(d);
						previousVersion = d.version;
					}
				}
			})
		);
		// Reload package symbol data when switching active file.
		ctx.subscriptions.push(
			vscode.window.onDidChangeActiveTextEditor((e) => {
				this.reload(e?.document);
			})
		);
		ctx.subscriptions.push(
			vscode.window.onDidChangeTextEditorSelection((e) => {
				void this.revealActiveSymbol(e.textEditor);
			})
		);
	}

	getTreeItem(element: PackageSymbol) {
		return element;
	}

	// TreeView.reveal uses getParent to expand the path to nested symbols.
	getParent(element: PackageSymbol): PackageSymbol | undefined {
		return element.parent;
	}

	rootItems(): Promise<PackageSymbol[]> {
		return Promise.resolve([this.packageItem, ...this.sortSymbols(this.packageSymbols)]);
	}

	getChildren(element?: PackageSymbol): Thenable<PackageSymbol[] | undefined> {
		// getChildren is called with null element when TreeDataProvider first loads
		if (!element) {
			return this.rootItems();
		}
		return Promise.resolve(this.sortSymbols(element.children));
	}

	async reload(e?: vscode.TextDocument) {
		if (e?.languageId !== 'go' || e?.uri?.scheme !== 'file') {
			this.result = undefined;
			this.activeDocument = undefined;
			this.packageSymbols = [];
			this.packageItem = this.createPackageItem();
			this.lastRevealedSymbol = undefined;
			vscode.commands.executeCommand('setContext', 'go.showPackageOutline', false);
			this._onDidChangeTreeData.fire(undefined);
			return;
		}
		this.activeDocument = e;
		try {
			const res = (await vscode.commands.executeCommand('gopls.package_symbols', {
				URI: e.uri.toString()
			})) as PackageSymbolsCommandResult;
			this.result = res;
			this.packageSymbols = this.createPackageSymbols(res);
			this.packageItem = this.createPackageItem(res.PackageName);
			this.lastRevealedSymbol = undefined;
			// Show the Package Outline explorer if the request returned symbols for the current package
			vscode.commands.executeCommand('setContext', 'go.showPackageOutline', res?.Symbols?.length > 0);
			this._onDidChangeTreeData.fire(undefined);
			await this.revealActiveSymbol(vscode.window.activeTextEditor);
		} catch (e) {
			this.result = undefined;
			this.packageSymbols = [];
			this.packageItem = this.createPackageItem();
			this.lastRevealedSymbol = undefined;
			// Hide the Package Outline explorer
			vscode.commands.executeCommand('setContext', 'go.showPackageOutline', false);
			this._onDidChangeTreeData.fire(undefined);
			console.log('ERROR', e);
		}
	}

	private createPackageSymbols(res: PackageSymbolsCommandResult): PackageSymbol[] {
		return (res.Symbols ?? []).map(
			(symbol) =>
				new PackageSymbol(
					symbol,
					res.Files ?? [],
					symbol.children?.length > 0
						? vscode.TreeItemCollapsibleState.Collapsed
						: vscode.TreeItemCollapsibleState.None
				)
		);
	}

	private createPackageItem(packageName?: string): PackageSymbol {
		return new PackageSymbol(
			{
				name: packageName ? 'Current Package: ' + packageName : '',
				detail: '',
				kind: 0,
				range: new vscode.Range(0, 0, 0, 0),
				selectionRange: new vscode.Range(0, 0, 0, 0),
				children: [],
				file: 0
			},
			[],
			vscode.TreeItemCollapsibleState.None
		);
	}

	private sortSymbols(symbols: readonly PackageSymbol[]): PackageSymbol[] {
		return [...symbols].sort((a, b) => this.compareSymbols(a, b));
	}

	// Sort alphabetically when requested, otherwise preserve source order.
	private compareSymbols(a: PackageSymbol, b: PackageSymbol): number {
		if (this.sortOrder === PackageOutlineSortOrder.Name) {
			const byName = this.collator.compare(a.symbolName, b.symbolName);
			if (byName !== 0) {
				return byName;
			}
			return this.compareByPosition(a, b);
		}
		const byPosition = this.compareByPosition(a, b);
		if (byPosition !== 0) {
			return byPosition;
		}
		return this.collator.compare(a.symbolName, b.symbolName);
	}

	private compareByPosition(a: PackageSymbol, b: PackageSymbol): number {
		if (a.fileIndex !== b.fileIndex) {
			return a.fileIndex - b.fileIndex;
		}
		if (a.range.start.line !== b.range.start.line) {
			return a.range.start.line - b.range.start.line;
		}
		return a.range.start.character - b.range.start.character;
	}

	private setSortOrder(sortOrder: PackageOutlineSortOrder) {
		if (this.sortOrder === sortOrder) {
			return;
		}
		this.sortOrder = sortOrder;
		vscode.commands.executeCommand('setContext', 'go.packageOutline.sortOrder', sortOrder);
		this.lastRevealedSymbol = undefined;
		this._onDidChangeTreeData.fire(undefined);
		void this.revealActiveSymbol(vscode.window.activeTextEditor);
	}

	private updateContextKeys() {
		vscode.commands.executeCommand('setContext', 'go.packageOutline.sortOrder', this.sortOrder);
	}

	private async revealActiveSymbol(editor?: vscode.TextEditor) {
		if (!this.view || !editor || editor.document !== this.activeDocument) {
			return;
		}
		const symbol = this.findSymbolAtPosition(this.packageSymbols, editor.document.uri, editor.selection.active);
		if (!symbol) {
			this.lastRevealedSymbol = undefined;
			return;
		}
		if (symbol === this.lastRevealedSymbol) {
			return;
		}
		this.lastRevealedSymbol = symbol;
		try {
			await this.view.reveal(symbol, { expand: true, select: true });
		} catch (e) {
			console.log('ERROR', e);
		}
	}

	private findSymbolAtPosition(
		symbols: readonly PackageSymbol[],
		uri: vscode.Uri,
		position: vscode.Position
	): PackageSymbol | undefined {
		for (const symbol of symbols) {
			const childMatch = this.findSymbolAtPosition(symbol.children, uri, position);
			if (childMatch) {
				return childMatch;
			}
			if (symbol.contains(uri, position)) {
				return symbol;
			}
		}
		return undefined;
	}
}

interface PackageSymbolData {
	/**
	 * The name of this symbol.
	 */
	name: string;

	/**
	 * More detail for this symbol, e.g. the signature of a function.
	 */
	detail: string;

	/**
	 * The kind of this symbol.
	 */
	kind: number;

	/**
	 * Tags for this symbol.
	 */
	tags?: ReadonlyArray<vscode.SymbolTag>;

	/**
	 * The range enclosing this symbol not including leading/trailing whitespace but everything else, e.g. comments and code.
	 */
	range: vscode.Range;

	/**
	 * The range that should be selected and reveal when this symbol is being picked, e.g. the name of a function.
	 * Must be contained by the [`range`](#DocumentSymbol.range).
	 */
	selectionRange: vscode.Range;

	/**
	 * Children of this symbol, e.g. properties of a class.
	 */
	children: PackageSymbolData[];

	/**
	 * Index of this symbol's file in PackageSymbolsCommandResult.Files
	 */
	file: number;
}

export class PackageSymbol extends vscode.TreeItem {
	public readonly children: PackageSymbol[];

	constructor(
		private readonly data: PackageSymbolData,
		private readonly files: string[],
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly parent?: PackageSymbol
	) {
		super(data.name, collapsibleState);
		this.children = (data.children ?? []).map(
			(child) =>
				new PackageSymbol(
					child,
					files,
					child.children?.length > 0
						? vscode.TreeItemCollapsibleState.Collapsed
						: vscode.TreeItemCollapsibleState.None,
					this
				)
		);
		const file = files[data.file ?? 0];
		this.resourceUri = files && files.length > 0 ? vscode.Uri.parse(file) : undefined;
		const [icon, kind] = this.getSymbolInfo();
		this.iconPath = icon;
		this.description = data.detail;
		this.tooltip = data.name + ' (' + kind + ')';
		this.command = this.resourceUri
			? {
					command: 'vscode.openWith',
					title: '',
					arguments: [
						this.resourceUri,
						'default',
						{
							selection: new vscode.Range(data.range.start, data.range.start)
						}
					]
			  }
			: undefined;
	}

	get range(): vscode.Range {
		return this.data.range;
	}

	get fileIndex(): number {
		return this.data.file ?? 0;
	}

	get symbolName(): string {
		return this.data.name;
	}

	contains(uri: vscode.Uri, position: vscode.Position): boolean {
		if (this.resourceUri?.toString() !== uri.toString()) {
			return false;
		}
		const { start, end } = this.range;
		const afterStart =
			start.line < position.line || (start.line === position.line && start.character <= position.character);
		const beforeEnd =
			end.line > position.line || (end.line === position.line && end.character >= position.character);
		return afterStart && beforeEnd;
	}

	private getSymbolInfo(): [vscode.ThemeIcon | undefined, string] {
		switch (this.data.kind) {
			case SymbolKind.File:
				return [new vscode.ThemeIcon('symbol-file'), 'file'];
			case SymbolKind.Module:
				return [new vscode.ThemeIcon('symbol-module'), 'module'];
			case SymbolKind.Namespace:
				return [new vscode.ThemeIcon('symbol-namespace'), 'namespace'];
			case SymbolKind.Package:
				return [new vscode.ThemeIcon('symbol-package'), 'package'];
			case SymbolKind.Class:
				return [new vscode.ThemeIcon('symbol-class'), 'class'];
			case SymbolKind.Method:
				return [new vscode.ThemeIcon('symbol-method'), 'method'];
			case SymbolKind.Property:
				return [new vscode.ThemeIcon('symbol-property'), 'property'];
			case SymbolKind.Field:
				return [new vscode.ThemeIcon('symbol-field'), 'field'];
			case SymbolKind.Constructor:
				return [new vscode.ThemeIcon('symbol-constructor'), 'constructor'];
			case SymbolKind.Enum:
				return [new vscode.ThemeIcon('symbol-enum'), 'enum'];
			case SymbolKind.Interface:
				return [new vscode.ThemeIcon('symbol-interface'), 'interface'];
			case SymbolKind.Function:
				return [new vscode.ThemeIcon('symbol-function'), 'function'];
			case SymbolKind.Variable:
				return [new vscode.ThemeIcon('symbol-variable'), 'variable'];
			case SymbolKind.Constant:
				return [new vscode.ThemeIcon('symbol-constant'), 'constant'];
			case SymbolKind.String:
				return [new vscode.ThemeIcon('symbol-string'), 'string'];
			case SymbolKind.Number:
				return [new vscode.ThemeIcon('symbol-number'), 'number'];
			case SymbolKind.Boolean:
				return [new vscode.ThemeIcon('symbol-boolean'), 'boolean'];
			case SymbolKind.Array:
				return [new vscode.ThemeIcon('symbol-array'), 'array'];
			case SymbolKind.Object:
				return [new vscode.ThemeIcon('symbol-object'), 'object'];
			case SymbolKind.Key:
				return [new vscode.ThemeIcon('symbol-key'), 'key'];
			case SymbolKind.Null:
				return [new vscode.ThemeIcon('symbol-null'), 'null'];
			case SymbolKind.EnumMember:
				return [new vscode.ThemeIcon('symbol-enum-member'), 'enum member'];
			case SymbolKind.Struct:
				return [new vscode.ThemeIcon('symbol-struct'), 'struct'];
			case SymbolKind.Event:
				return [new vscode.ThemeIcon('symbol-event'), 'event'];
			case SymbolKind.Operator:
				return [new vscode.ThemeIcon('symbol-operator'), 'operator'];
			case SymbolKind.TypeParameter:
				return [new vscode.ThemeIcon('symbol-type-parameter'), 'type parameter'];
			default:
				return [undefined, 'unknown'];
		}
	}
}
