import type { OutputFormat } from '../lib/cli/format';
import type { InstanceOptions } from '../lib/dev-environment/types';

/** Values supplied by the dev-env command parser before environment resolution. */
export interface DevEnvCommandOptions extends InstanceOptions {
	slug?: string;
	app?: string;
	env?: string;
	all?: boolean;
	soft?: boolean;
	force?: boolean;
	quiet?: boolean;
	format?: OutputFormat;
	follow?: boolean;
	service?: string | false;
	root?: boolean;
	fromFile?: string;
	skipRebuild?: boolean;
	skipWpVersionsCheck?: boolean;
	vscode?: boolean;
	editor?: string;
	searchReplace?: string | string[];
	inPlace?: boolean;
	skipValidate?: boolean;
	skipReindex?: string | boolean;
}
