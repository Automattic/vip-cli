import { ArrayPromptOptions } from 'enquirer';

// These types are not 100% correct, but they are close enough for now.
declare module 'enquirer' {
	interface ConfirmOption {
		name?: string | (() => string);
		message: string | (() => string);
		initial?: boolean | (() => boolean);
		actions?: {'ctrl': {[key: string]: string}}
	}

	class Confirm extends NodeJS.EventEmitter {
		constructor(option: ConfirmOption);
		run: () => Promise<boolean>;
	}

	class Select extends NodeJS.EventEmitter {
		constructor(option: ArrayPromptOptions);
		run: () => Promise<string>;
	}
}
