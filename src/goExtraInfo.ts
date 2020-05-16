/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import { CancellationToken, Hover, HoverProvider, Position, TextDocument, WorkspaceConfiguration } from 'vscode';
import { definitionLocation } from './goDeclaration';
import { getGoConfig } from './util';

export class GoHoverProvider implements HoverProvider {
	private goConfig: WorkspaceConfiguration | undefined;

	constructor(goConfig?: WorkspaceConfiguration) {
		this.goConfig = goConfig;
	}

	public async provideHover(document: TextDocument, position: Position, token: CancellationToken): Promise<Hover|null> {
		if (!this.goConfig) {
			this.goConfig = getGoConfig(document.uri);
		}
		let goConfig = this.goConfig;

		// Temporary fix to fall back to godoc if guru is the set docsTool
		if (goConfig['docsTool'] === 'guru') {
			goConfig = Object.assign({}, goConfig, { docsTool: 'godoc' });
		}
		const definitionInfo = await definitionLocation(document, position, goConfig, true, token);
		if (!definitionInfo) {
			return null;
		}
		const lines = definitionInfo.declarationlines
			.filter((line) => line !== '')
			.map((line) => line.replace(/\t/g, '    '));
		const text = lines.join('\n').replace(/\n+$/, '');
		const hoverTexts = new vscode.MarkdownString();
		hoverTexts.appendCodeblock(text, 'go');
		if (definitionInfo.doc != null) {
			hoverTexts.appendMarkdown(definitionInfo.doc);
		}
		return new Hover(hoverTexts);
	}
}
