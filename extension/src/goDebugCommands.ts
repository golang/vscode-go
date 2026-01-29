/*---------------------------------------------------------
 * Copyright 2026 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Registers commands to improve the debugging experience for Go.
 *
 * Currently, it adds a command to open a variable in a new text document.
 */
export function registerGoDebugCommands(ctx: vscode.ExtensionContext) {
	// Track sessions since vscode doesn't provide a list of them.
	const sessions = new Map<string, vscode.DebugSession>();

	ctx.subscriptions.push(
		vscode.debug.onDidStartDebugSession((s) => sessions.set(s.id, s)),
		vscode.debug.onDidTerminateDebugSession((s) => sessions.delete(s.id)),
		vscode.workspace.registerTextDocumentContentProvider('go-debug-variable', new VariableContentProvider(sessions)),
		vscode.commands.registerCommand('go.debug.openVariableAsDoc', async (ref: VariableRef) => {
			const uri = VariableContentProvider.uriForRef(ref);
			const doc = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(doc);
		})
	);
}

class VariableContentProvider implements vscode.TextDocumentContentProvider {
	sessions: Map<string, vscode.DebugSession>

	constructor(sessionsSet: Map<string, vscode.DebugSession>) {
		this.sessions = sessionsSet;
	}

	static uriForRef(ref: VariableRef) {
		return vscode.Uri.from({
			scheme: 'go-debug-variable',
			authority: `${ref.container.variablesReference}@${ref.sessionId}`,
			path: `/${ref.variable.name}`
		});
	}

	async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
		const name = uri.path.replace(/^\//, '');
		const [container, sessionId] = uri.authority.split('@', 2);
		if (!container || !sessionId) {
			throw new Error('Invalid URI');
		}

		const session = this.sessions.get(sessionId);
		if (!session) return 'Debug session has been terminated';

		const { variables } = await session.customRequest('variables', {
			variablesReference: parseInt(container, 10)
		}) as { variables: Variable[] };

		const v = variables.find(v => v.name === name);
		if (!v) return `Cannot resolve variable ${name}`;

		if (!v.memoryReference) {
			const { result } = await session.customRequest('evaluate', {
				expression: v.evaluateName,
				context: 'clipboard'
			}) as { result: string };

			v.value = result ?? v.value;

			return parseVariable(v);
		}

		const chunk = 1 << 14;
		let offset = 0;
		const full: Uint8Array[] = [];

		while (true) {
			const resp = await session.customRequest('readMemory', {
				memoryReference: v.memoryReference,
				offset,
				count: chunk
			}) as { address: string; data: string; unreadableBytes: number };

			if (!resp.data) break;
			full.push(Buffer.from(resp.data, 'base64'));

			if (resp.unreadableBytes === 0) break;
			offset += chunk;
		}

		return Buffer.concat(full).toString('utf-8');
	}
}

/**
 * A reference to a variable, used to pass data between commands.
 */
interface VariableRef {
	sessionId: string;
	container: Container;
	variable: Variable;
}

/**
 * A container for variables, used to pass data between commands.
 */
interface Container {
	name: string;
	variablesReference: number;
	expensive: boolean;
}

/**
 * A variable, used to pass data between commands.
 */
interface Variable {
	name: string;
	value: string;
	evaluateName: string;
	variablesReference: number;
	memoryReference?: string;
}

const escapeCodes: Record<string, string> = {
	r: '\r',
	n: '\n',
	t: '\t'
};

/**
 * Parses a variable value, unescaping special characters.
 */
function parseVariable(variable: Variable) {
	const raw = variable.value.trim();

	try {
		return JSON.parse(raw);
	} catch (_) {
		return raw.replace(/\\[nrt\\"'`]/, (_, s) => (s in escapeCodes ? escapeCodes[s] : s));
	}
}
