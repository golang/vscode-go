/*---------------------------------------------------------
 * Copyright 2026 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import { FeatureState, StaticFeature } from 'vscode-languageclient';
import { ClientCapabilities } from 'vscode-languageserver-protocol';

/**
 * Custom semantic token types defined by gopls that are not part of the standard
 * LSP specification (see x/tools/gopls/internal/protocol/semtok/semtok.go).
 *
 * Maintenance notes:
 * 1. If new custom types are introduced in gopls in the future, gopls will update
 *    its internal list first, and vscode-go should update this list right after.
 * 2. If a new LSP version standardizes a type currently in this custom set,
 *    gopls will remove it from its custom set first, and vscode-go should remove
 *    it here later after bumping the LSP library version.
 */
const GOPLS_CUSTOM_TOKEN_TYPES: string[] = [];

/**
 * Custom semantic token modifiers defined by gopls that are not part of the standard
 * LSP specification (see x/tools/gopls/internal/protocol/semtok/semtok.go).
 *
 * Maintenance notes:
 * 1. If new custom modifiers are introduced in gopls in the future, gopls will update
 *    its internal list first, and vscode-go should update this list right after.
 * 2. If a new LSP version standardizes a modifier currently in this custom set,
 *    gopls will remove it from its custom set first, and vscode-go should remove
 *    it here later after bumping the LSP library version.
 */
const GOPLS_CUSTOM_TOKEN_MODIFIERS = [
	'array',
	'bool',
	'chan',
	'format',
	'interface',
	'map',
	'number',
	'pointer',
	'signature',
	'slice',
	'string',
	'struct',
	'shadowing'
];

/**
 * GoSemanticTokensFeature extends the client capabilities sent during LSP initialization.
 *
 * Starting in gopls v0.24.0 (golang/go#80309, golang/go#80736), gopls strictly respects
 * client capabilities and filters out any semantic token types and modifiers not explicitly
 * advertised by the client in initialize params.
 *
 * Because vscode-languageclient by default only populates standard LSP token types and modifiers,
 * this feature appends gopls's custom token types and modifiers so gopls will return them.
 */
export class GoSemanticTokensFeature implements StaticFeature {
	public fillClientCapabilities(capabilities: ClientCapabilities): void {
		const semanticTokens = capabilities.textDocument?.semanticTokens;
		if (semanticTokens) {
			if (!semanticTokens.tokenTypes) {
				semanticTokens.tokenTypes = [];
			}
			semanticTokens.tokenTypes.push(...GOPLS_CUSTOM_TOKEN_TYPES);
			if (!semanticTokens.tokenModifiers) {
				semanticTokens.tokenModifiers = [];
			}
			semanticTokens.tokenModifiers.push(...GOPLS_CUSTOM_TOKEN_MODIFIERS);
		}
	}

	public clear(): void {}

	public getState(): FeatureState {
		return { kind: 'static' };
	}

	public initialize(): void {}
}
