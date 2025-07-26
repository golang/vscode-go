import * as vscode from 'vscode';

export function registerGoDebugCommands(ctx: vscode.ExtensionContext) {
	ctx.subscriptions.push(
		vscode.commands.registerCommand(
			'go.debug.openVariableAsDoc',
			async (args: any) => {
				const variable = args.variable;

				let raw = variable.value.trim();
				if (
					(raw.startsWith('"') && raw.endsWith('"')) ||
					(raw.startsWith('`') && raw.endsWith('`'))
				) {
					raw = raw.slice(1, -1);
				}

				let text: string;
				try {
					text = JSON.parse(`"${raw.replace(/"/g, '\\"')}"`);
				} catch {
					text = raw
						.replace(/\\r/g, '\r')
						.replace(/\\n/g, '\n')
						.replace(/\\t/g, '\t')
						.replace(/\\"/g, '"')
						.replace(/\\\\/g, '\\');
				}

				const doc = await vscode.workspace.openTextDocument({
					language: 'plaintext',
					content: text
				});

				const editor = await vscode.window.showTextDocument(doc);

				await vscode.commands.executeCommand('workbench.action.editor.changeLanguageMode');
			}
		)
	)
}