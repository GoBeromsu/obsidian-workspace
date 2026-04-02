export class Plugin {
	app: App;
	manifest: any;
	loadData() { return Promise.resolve({}); }
	saveData(_data: any) { return Promise.resolve(); }
	addCommand(_cmd: any) {}
	addSettingTab(_tab: any) {}
	registerEvent(_ref: any) {}
	registerInterval(_id: number) { return _id; }
}
export class Modal {
	app: App;
	constructor(_app: App) { this.app = _app; }
	open() {}
	close() {}
	onOpen() {}
	onClose() {}
}
export class FuzzySuggestModal<T> extends Modal {
	setPlaceholder(_text: string) {}
	getItems(): T[] { return []; }
	getItemText(_item: T): string { return ''; }
	onChooseItem(_item: T): void {}
}
export class PluginSettingTab {
	app: App;
	plugin: any;
	containerEl: HTMLElement = document.createElement('div');
	constructor(_app: App, _plugin: any) { this.app = _app; }
	display() {}
}
export class Setting {
	constructor(_el: HTMLElement) {}
	setName(_name: string) { return this; }
	setDesc(_desc: string) { return this; }
	addText(_cb: any) { return this; }
	addToggle(_cb: any) { return this; }
	addButton(_cb: any) { return this; }
}
export class Notice {
	constructor(_msg: string | DocumentFragment, _timeout?: number) {}
	setMessage(_msg: string | DocumentFragment) {}
	hide() {}
}
export function setIcon(_el: HTMLElement, _icon: string) {}
export function requestUrl(_opts: any): Promise<any> {
	return Promise.resolve({ text: '{}', headers: {}, status: 200 });
}
export declare class App {
	vault: any;
	workspace: any;
}
export const Platform = { isDesktop: true, isMobile: false };
