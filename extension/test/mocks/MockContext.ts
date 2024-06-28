import { Disposable, ExtensionContext } from 'vscode';

type ExtensionContextPlus = ExtensionContext & Pick<MockExtensionContext, 'teardown'>;

export class MockExtensionContext implements Partial<ExtensionContext> {
	subscriptions: Disposable[] = [];

	static new(): ExtensionContextPlus {
		return (new this() as unknown) as ExtensionContextPlus;
	}

	teardown() {
		this.subscriptions.forEach((x) => x.dispose());
	}
}
