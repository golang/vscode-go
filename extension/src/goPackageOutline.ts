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

export class GoPackageOutlineProvider implements vscode.TreeDataProvider<PackageSymbol> {
	private _onDidChangeTreeData: vscode.EventEmitter<PackageSymbol | undefined> = new vscode.EventEmitter<
		PackageSymbol | undefined
	>();

	readonly onDidChangeTreeData: vscode.Event<PackageSymbol | undefined> = this._onDidChangeTreeData.event;

	public result?: PackageSymbolsCommandResult;
	public activeDocument?: vscode.TextDocument;

	static setup(ctx: vscode.ExtensionContext) {
		const provider = new this(ctx);
		const {
			window: { registerTreeDataProvider }
		} = vscode;
		ctx.subscriptions.push(registerTreeDataProvider('go.package.outline', provider));
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
	}

	getTreeItem(element: PackageSymbol) {
		return element;
	}

	rootItems(): Promise<PackageSymbol[]> {
		const list = Array<PackageSymbol>();
		// Add a tree item to display the current package name. Its "command" value will be undefined and thus
		// will not link anywhere when clicked
		list.push(
			new PackageSymbol(
				{
					name: this.result?.PackageName ? 'Current Package: ' + this.result.PackageName : '',
					detail: '',
					kind: 0,
					range: new vscode.Range(0, 0, 0, 0),
					selectionRange: new vscode.Range(0, 0, 0, 0),
					children: [],
					file: 0
				},
				[],
				vscode.TreeItemCollapsibleState.None
			)
		);
		const res = this.result;
		if (res) {
			res.Symbols?.forEach((d) =>
				list.push(
					new PackageSymbol(
						d,
						res.Files ?? [],
						d.children?.length > 0
							? vscode.TreeItemCollapsibleState.Collapsed
							: vscode.TreeItemCollapsibleState.None
					)
				)
			);
		}
		return new Promise((resolve) => resolve(list));
	}

	getChildren(element?: PackageSymbol): Thenable<PackageSymbol[] | undefined> {
		// getChildren is called with null element when TreeDataProvider first loads
		if (!element) {
			return this.rootItems();
		}
		return Promise.resolve(element.children);
	}

	async reload(e?: vscode.TextDocument) {
		if (e?.languageId !== 'go' || e?.uri?.scheme !== 'file') {
			this.result = undefined;
			this.activeDocument = undefined;
			return;
		}
		this.activeDocument = e;
		try {
			const res = (await vscode.commands.executeCommand('gopls.package_symbols', {
				URI: e.uri.toString()
			})) as PackageSymbolsCommandResult;
			this.result = res;
			// Show the Package Outline explorer if the request returned symbols for the current package
			vscode.commands.executeCommand('setContext', 'go.showPackageOutline', res?.Symbols?.length > 0);
			this._onDidChangeTreeData.fire(undefined);
		} catch (e) {
			// Hide the Package Outline explorer
			vscode.commands.executeCommand('setContext', 'go.showPackageOutline', false);
			console.log('ERROR', e);
		}
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

class PackageSymbol extends vscode.TreeItem {
	constructor(
		private readonly data: PackageSymbolData,
		private readonly files: string[],
		public readonly collapsibleState: vscode.TreeItemCollapsibleState
	) {
		super(data.name, collapsibleState);
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

	get children(): PackageSymbol[] | undefined {
		return this.data.children?.map(
			(c) =>
				new PackageSymbol(
					c,
					this.files,
					c.children?.length > 0
						? vscode.TreeItemCollapsibleState.Collapsed
						: vscode.TreeItemCollapsibleState.None
				)
		);
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
