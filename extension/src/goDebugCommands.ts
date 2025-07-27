import * as vscode from 'vscode';

// Track sessions since vscode doesn't provide a list of them.
const sessions = new Map<string, vscode.DebugSession>();
vscode.debug.onDidStartDebugSession((s) => sessions.set(s.id, s));
vscode.debug.onDidTerminateDebugSession((s) => sessions.delete(s.id));

export function registerGoDebugCommands(ctx: vscode.ExtensionContext) {
	class VariableContentProvider implements vscode.TextDocumentContentProvider {
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

			const session = sessions.get(sessionId);
			if (!session) return 'Debug session has been terminated';

			const r: { variables: Variable[] } = await session.customRequest('variables', {
				variablesReference: parseInt(container, 10)
			});

			const v = r.variables.find((v) => v.name === name);
			if (!v) return `Cannot resolve variable ${name}`;

			const { result } = await session.customRequest('evaluate', {
				expression: v.evaluateName,
				context: 'clipboard'
			});

			v.value = result ?? v.value;

			return parseVariable(v);
		}
	}

	ctx.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider('go-debug-variable', new VariableContentProvider())
	);

	ctx.subscriptions.push(
		vscode.commands.registerCommand('go.debug.openVariableAsDoc', async (ref: VariableRef) => {
			const uri = VariableContentProvider.uriForRef(ref);
			const doc = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(doc);
		})
	);

	interface VariableRef {
		sessionId: string;
		container: Container;
		variable: Variable;
	}

	interface Container {
		name: string;
		variablesReference: number;
		expensive: boolean;
	}

	interface Variable {
		name: string;
		value: string;
		evaluateName: string;
		variablesReference: number;
	}

	const escapeCodes: Record<string, string> = {
		r: '\r',
		n: '\n',
		t: '\t'
	};

	function parseVariable(variable: Variable) {
		let raw = variable.value.trim();
		try {
			// Attempt to parse as JSON
			return JSON.parse(raw);
		} catch (_) {
			// Fall back to manual unescaping
			raw = raw.slice(1, -1);
		}

		// Manually unescape
		return raw.replace(/\\[nrt\\"'`]/, (_, s) => (s in escapeCodes ? escapeCodes[s] : s));
	}
}
