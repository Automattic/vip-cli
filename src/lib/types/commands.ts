export interface CommandExample {
	description: string;
	usage: string;
}

export interface CommandOption {
	name: string;
	alias?: string;
	description: string;
	type: string;
	required?: boolean;
}

export interface CommandArgument {
	name: string;
	description: string;
	type: string;
	required: boolean;
}

export interface CommandUsage {
	description: string;
	examples: CommandExample[];
}
