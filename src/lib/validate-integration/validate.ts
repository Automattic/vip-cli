/**
 * Conformance checker for WordPress VIP partner integrations.
 *
 * Encodes the VIP integration conformance checklist as automated, static checks
 * a partner can run locally and in CI to get an objective
 * conformant / not-conformant answer before submitting.
 *
 * The checks here are deliberately static (file and config inspection). Some
 * rules can only be partially verified this way; those return `warn` and say
 * so rather than pretending a clean pass. Two items — the plugin/platform
 * config-schema match and the security review — are not automatable at all and
 * are surfaced separately as human-review, never as an automated pass/fail.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'not_applicable';

export interface CheckResult {
	/** Stable machine identifier for the rule. */
	id: string;
	/** Checklist number (1-9) this rule maps to. */
	rule: number;
	title: string;
	status: CheckStatus;
	/** One-line explanation of the verdict. */
	message: string;
	/** Optional supporting evidence lines. */
	details?: string[];
}

export interface HumanReviewItem {
	title: string;
	reason: string;
}

export interface ValidationReport {
	path: string;
	results: CheckResult[];
	humanReview: HumanReviewItem[];
	/** True when no check failed. Warnings do not break conformance. */
	conformant: boolean;
}

interface ComposerJson {
	type?: string;
	autoload?: Record< string, unknown >;
	scripts?: Record< string, unknown >;
	require?: Record< string, string >;
}

interface Context {
	root: string;
	composer: ComposerJson | null;
	/** True when composer.json is present, even if it failed to parse. */
	composerExists: boolean;
	/** npm scripts, so a `composer test` that shells to `npm test` can be resolved. */
	packageScripts: Record< string, unknown > | null;
	/** Concatenated markdown from README plus every file under docs/. */
	docsText: string;
	/** Concatenated PHP source, excluding vendor/ and node_modules/. */
	phpSource: string;
	/** Concatenated YAML from .github/workflows/. */
	workflowsText: string;
	/** The runtime config constant referenced by the integration, if any. */
	configConstant: string | null;
	/** Root-level plugin entry file (with a "Plugin Name:" header), if any. */
	entryFile: string | null;
}

const SKIP_DIRS = new Set( [ 'vendor', 'node_modules', '.git', 'dist', 'coverage' ] );

function readFileSafe( filePath: string ): string {
	try {
		return readFileSync( filePath, 'utf8' );
	} catch {
		return '';
	}
}

function parseComposer( root: string ): ComposerJson | null {
	const composerPath = join( root, 'composer.json' );
	if ( ! existsSync( composerPath ) ) {
		return null;
	}
	try {
		return JSON.parse( readFileSafe( composerPath ) ) as ComposerJson;
	} catch {
		return null;
	}
}

function parsePackageScripts( root: string ): Record< string, unknown > | null {
	const packagePath = join( root, 'package.json' );
	if ( ! existsSync( packagePath ) ) {
		return null;
	}
	try {
		const parsed = JSON.parse( readFileSafe( packagePath ) ) as {
			scripts?: Record< string, unknown >;
		};
		return parsed.scripts ?? null;
	} catch {
		return null;
	}
}

/**
 * Collect files with one of the given extensions, skipping dependency and build
 * directories. Bounded to a shallow-ish walk so a stray large tree can't hang.
 */
function collectFiles( root: string, extensions: string[], maxDepth = 6 ): string[] {
	const found: string[] = [];

	const walk = ( dir: string, depth: number ): void => {
		if ( depth > maxDepth ) {
			return;
		}
		let entries: string[];
		try {
			entries = readdirSync( dir );
		} catch {
			return;
		}
		for ( const entry of entries ) {
			const full = join( dir, entry );
			let isDir = false;
			try {
				isDir = statSync( full ).isDirectory();
			} catch {
				continue;
			}
			if ( isDir ) {
				if ( ! SKIP_DIRS.has( entry ) && ! entry.startsWith( '.' ) ) {
					walk( full, depth + 1 );
				}
				continue;
			}
			if ( extensions.includes( extname( entry ).toLowerCase() ) ) {
				found.push( full );
			}
		}
	};

	walk( root, 0 );
	return found;
}

function collectDocsText( root: string ): string {
	const parts: string[] = [];
	const readme = join( root, 'README.md' );
	if ( existsSync( readme ) ) {
		parts.push( readFileSafe( readme ) );
	}
	const docsDir = join( root, 'docs' );
	if ( existsSync( docsDir ) ) {
		for ( const file of collectFiles( docsDir, [ '.md' ] ) ) {
			parts.push( readFileSafe( file ) );
		}
	}
	return parts.join( '\n\n' );
}

function collectWorkflowsText( root: string ): string {
	const dir = join( root, '.github', 'workflows' );
	if ( ! existsSync( dir ) ) {
		return '';
	}
	return collectFiles( dir, [ '.yml', '.yaml' ], 2 ).map( readFileSafe ).join( '\n\n' );
}

function detectConfigConstant( phpSource: string ): string | null {
	// Prefer the Starter Kit pattern: a Config class declaring
	// `const CONSTANT_NAME = '<CONSTANT>'`. This catches integrations that follow
	// the convention even if they don't use the VIP_*_CONFIG suffix.
	const declared = /CONSTANT_NAME\s*=\s*'([A-Z_][A-Z0-9_]*)'/.exec( phpSource );
	if ( declared ) {
		return declared[ 1 ];
	}
	// Fall back to a VIP_<NAME>_CONFIG constant referenced anywhere.
	const referenced = /\bVIP_[A-Z0-9_]+_CONFIG\b/.exec( phpSource );
	return referenced ? referenced[ 0 ] : null;
}

function detectEntryFile( root: string ): string | null {
	// The plugin entry file lives at the repo root and carries a plugin header.
	let entries: string[];
	try {
		entries = readdirSync( root );
	} catch {
		return null;
	}
	for ( const entry of entries ) {
		if ( extname( entry ).toLowerCase() !== '.php' ) {
			continue;
		}
		const contents = readFileSafe( join( root, entry ) );
		if ( /Plugin Name:/i.test( contents ) ) {
			return entry;
		}
	}
	return null;
}

function buildContext( root: string ): Context {
	const composer = parseComposer( root );
	const phpFiles = collectFiles( root, [ '.php' ] );
	const phpSource = phpFiles.map( readFileSafe ).join( '\n\n' );

	return {
		root,
		composer,
		composerExists: existsSync( join( root, 'composer.json' ) ),
		packageScripts: parsePackageScripts( root ),
		docsText: collectDocsText( root ),
		phpSource,
		workflowsText: collectWorkflowsText( root ),
		configConstant: detectConfigConstant( phpSource ),
		entryFile: detectEntryFile( root ),
	};
}

/**
 * Expand a Composer script into the concrete commands it runs, following
 * `@other-script` references. `@php ...` and other non-script `@` calls are
 * kept as literal commands.
 */
function resolveComposerScript(
	scripts: Record< string, unknown >,
	name: string,
	seen: Set< string > = new Set()
): string[] {
	if ( seen.has( name ) ) {
		return [];
	}
	seen.add( name );

	const raw = scripts[ name ];
	if ( raw === undefined || raw === null ) {
		return [];
	}

	// Composer script values are a command string or an array of them.
	const rawEntries: unknown[] = Array.isArray( raw ) ? raw : [ raw ];
	const entries = rawEntries.filter( ( item ): item is string => typeof item === 'string' );
	const commands: string[] = [];

	for ( const entry of entries ) {
		const trimmed = entry.trim();
		if ( trimmed.startsWith( '@' ) ) {
			const refName = trimmed.slice( 1 ).split( /\s+/ )[ 0 ];
			if ( Object.hasOwn( scripts, refName ) ) {
				commands.push( ...resolveComposerScript( scripts, refName, seen ) );
				continue;
			}
		}
		commands.push( trimmed );
	}

	return commands;
}

/**
 * Expand `npm test` / `npm run <script>` commands into the package.json script
 * body they run, so a `composer test` that delegates to npm is judged by what
 * npm actually runs (e.g. `playwright test`), not by the word "test".
 */
function expandNpmDelegations(
	commands: string[],
	packageScripts: Record< string, unknown > | null
): string[] {
	if ( ! packageScripts ) {
		return commands;
	}
	const expanded: string[] = [];
	for ( const cmd of commands ) {
		expanded.push( cmd );
		const match = /\bnpm (?:run )?([a-z0-9:_-]+)/i.exec( cmd );
		if ( match ) {
			const body = packageScripts[ match[ 1 ] ];
			if ( typeof body === 'string' ) {
				expanded.push( body );
			}
		}
	}
	return expanded;
}

/** Drop no-op commands (echo/comment/true) that do not actually run anything. */
function realCommands( commands: string[] ): string[] {
	return commands.filter( cmd => ! /^(echo|:|true|#)\b/.test( cmd.trim() ) );
}

/** Fenced code blocks (```...```) that mention the given needle. */
function codeBlocksMentioning( markdown: string, needle: string ): string[] {
	const blocks = markdown.match( /```[\s\S]*?```/g ) ?? [];
	return blocks.filter( block => block.includes( needle ) );
}

// Precondition stated out loud when the config checks are skipped: detection
// keys off a `Config::CONSTANT_NAME` declaration or a VIP_*_CONFIG constant. An
// integration that uses runtime config under a different pattern is not exempt —
// it must follow the convention or be flagged for human review.
const CONFIG_DETECTION_NOTE =
	'No runtime config constant detected (looked for a `Config::CONSTANT_NAME` declaration or a `VIP_*_CONFIG` constant). If this integration uses runtime config under another name, adopt the convention or flag it for human review — these config checks were skipped, not passed.';

// --- Individual checks -----------------------------------------------------

function checkLoadsThroughStarterKit( ctx: Context ): CheckResult {
	const base = {
		id: 'loads-through-starter-kit',
		rule: 1,
		title: 'Loads through the Starter Kit workflow',
	};
	const details: string[] = [];

	if ( ! ctx.composer ) {
		return {
			...base,
			status: 'fail',
			message: ctx.composerExists
				? 'composer.json is present but is not valid JSON.'
				: 'No composer.json found — VIP loads integrations as Composer wordpress-plugin packages.',
		};
	}
	if ( ! ctx.entryFile ) {
		return {
			...base,
			status: 'fail',
			message: 'No root-level plugin entry file with a "Plugin Name:" header was found.',
		};
	}
	details.push( `Entry file: ${ ctx.entryFile }` );

	// A wrong Composer "type" or a missing autoload both stop the integration
	// from loading through the Starter Kit workflow. These are deterministic, so
	// they fail the gate rather than merely warn.
	const problems: string[] = [];
	if ( ctx.composer.type !== 'wordpress-plugin' ) {
		problems.push(
			`composer.json "type" is "${
				ctx.composer.type ?? 'unset'
			}"; it must be "wordpress-plugin" so VIP loads it as a plugin`
		);
	}
	if ( ! ctx.composer.autoload ) {
		problems.push(
			'composer.json has no "autoload" section, so the integration\'s classes will not load'
		);
	}

	if ( problems.length > 0 ) {
		return { ...base, status: 'fail', message: `${ problems.join( '; ' ) }.`, details };
	}

	details.push( 'composer.json type is "wordpress-plugin" with an autoload section.' );
	return {
		...base,
		status: 'pass',
		message: 'Plugin entry file and Composer wordpress-plugin package are present.',
		details,
	};
}

function checkComposerTest( ctx: Context ): CheckResult {
	const base = {
		id: 'composer-test',
		rule: 2,
		title: '`composer test` runs PHPUnit and e2e tests',
	};
	const scripts = ctx.composer?.scripts;
	if ( ! scripts || ! Object.hasOwn( scripts, 'test' ) ) {
		return { ...base, status: 'fail', message: 'composer.json has no "test" script.' };
	}

	// Resolve @script references, then follow any npm delegation into package.json,
	// then drop no-op (echo/comment) commands so the check reflects what runs.
	const resolved = expandNpmDelegations(
		resolveComposerScript( scripts, 'test' ),
		ctx.packageScripts
	);
	const combined = realCommands( resolved ).join( ' • ' );
	const hasUnit = /\bphpunit\b/i.test( combined );
	const hasE2e = /\b(playwright|cypress|codeception|puppeteer)\b/i.test( combined );

	if ( hasUnit && hasE2e ) {
		return {
			...base,
			status: 'pass',
			message: 'composer test declares a PHPUnit run and an e2e runner (Playwright/Cypress).',
			details: [
				`Resolved commands: ${ combined }`,
				'Static check: it verifies the test commands are wired, not that the tests pass.',
			],
		};
	}

	const missing: string[] = [];
	if ( ! hasUnit ) {
		missing.push( 'PHPUnit (no `phpunit` invocation)' );
	}
	if ( ! hasE2e ) {
		missing.push( 'an e2e runner (no Playwright/Cypress invocation)' );
	}
	return {
		...base,
		status: 'fail',
		message: `composer test does not wire up: ${ missing.join( ' and ' ) }.`,
		details: [ `Resolved commands: ${ combined || '(none)' }` ],
	};
}

function checkValidateIntegrationScript( ctx: Context ): CheckResult {
	const base = {
		id: 'validate-integration-script',
		rule: 3,
		title: '`composer run validate-integration` exists',
	};
	const scripts = ctx.composer?.scripts;
	if ( scripts && Object.hasOwn( scripts, 'validate-integration' ) ) {
		return {
			...base,
			status: 'pass',
			message: 'composer.json defines a "validate-integration" script.',
		};
	}
	return {
		...base,
		status: 'fail',
		message: 'composer.json has no "validate-integration" script.',
	};
}

function checkConfigConstantDocumented( ctx: Context ): CheckResult {
	const base = {
		id: 'config-constant-documented',
		rule: 4,
		title: 'Config constant is documented and referenced in code',
	};
	if ( ! ctx.configConstant ) {
		return { ...base, status: 'not_applicable', message: CONFIG_DETECTION_NOTE };
	}
	if ( ctx.docsText.includes( ctx.configConstant ) ) {
		return {
			...base,
			status: 'pass',
			message: `Config constant ${ ctx.configConstant } is referenced in code and documented.`,
		};
	}
	return {
		...base,
		status: 'fail',
		message: `Config constant ${ ctx.configConstant } is used in code but not documented in README/docs.`,
	};
}

function checkGracefulConfigHandling( ctx: Context ): CheckResult {
	const base = {
		id: 'graceful-config-handling',
		rule: 5,
		title: 'Missing/invalid config is handled without fataling',
	};
	if ( ! ctx.configConstant ) {
		return { ...base, status: 'not_applicable', message: CONFIG_DETECTION_NOTE };
	}

	const guards = [
		{ re: /is_ready\s*\(/, label: 'is_ready()' },
		{ re: /missing_fields\s*\(/, label: 'missing_fields()' },
		{ re: /is_available\s*\(/, label: 'is_available()' },
		{
			// configConstant is matched from source as [A-Z0-9_]+ only, so it is
			// safe to interpolate into a pattern here.
			// eslint-disable-next-line security/detect-non-literal-regexp
			re: new RegExp( String.raw`defined\s*\(\s*(self::CONSTANT_NAME|'${ ctx.configConstant }')` ),
			label: 'defined() guard',
		},
		{ re: /is_array\s*\(/, label: 'is_array() guard' },
	];
	const present = guards
		.filter( guard => guard.re.test( ctx.phpSource ) )
		.map( guard => guard.label );

	if ( present.length > 0 ) {
		return {
			...base,
			status: 'pass',
			message: 'Config access is guarded against a missing or invalid constant.',
			details: [
				`Guards found: ${ present.join( ', ' ) }`,
				"Static signal only — behavioral proof comes from the integration's own tests (rule 2).",
			],
		};
	}

	return {
		...base,
		status: 'warn',
		message:
			'Could not find a static guard (is_ready()/defined()/is_array()) around config access.',
		details: [
			'Verify via tests that missing or invalid config degrades gracefully instead of fataling.',
		],
	};
}

function checkConfigExamplesInDocs( ctx: Context ): CheckResult {
	const base = {
		id: 'config-examples-in-docs',
		rule: 6,
		title: 'Docs include valid and incomplete config examples',
	};
	if ( ! ctx.configConstant ) {
		return { ...base, status: 'not_applicable', message: CONFIG_DETECTION_NOTE };
	}

	const blocks = codeBlocksMentioning( ctx.docsText, ctx.configConstant );
	if ( blocks.length === 0 ) {
		return {
			...base,
			status: 'fail',
			message: `No documented config example references ${ ctx.configConstant }.`,
		};
	}
	if ( blocks.length < 2 ) {
		return {
			...base,
			status: 'fail',
			message:
				'Only one config example is documented; both a valid and an incomplete example are required.',
		};
	}

	// Distinguish a "valid" from an "incomplete" example: either the docs call
	// it out in prose, or one example carries strictly fewer keys than another.
	const keyCounts = blocks.map(
		block => ( block.match( /['"][a-z0-9_]+['"]\s*=>/gi ) ?? [] ).length
	);
	const hasSmallerExample = Math.min( ...keyCounts ) < Math.max( ...keyCounts );
	const mentionsIncomplete = /incomplete|missing (a )?required|setup in progress/i.test(
		ctx.docsText
	);

	if ( hasSmallerExample || mentionsIncomplete ) {
		return {
			...base,
			status: 'pass',
			message: 'Docs include both a valid and an incomplete config example.',
		};
	}
	return {
		...base,
		status: 'warn',
		message:
			'Multiple config examples are documented, but none is clearly an incomplete/missing-field example.',
	};
}

function checkCompatibilityMatrix( ctx: Context ): CheckResult {
	const base = {
		id: 'compatibility-matrix',
		rule: 7,
		title: 'Compatibility evidence covers WP 6.9/7.0 and PHP 8.2-8.5',
	};
	// Evidence must be a real CI matrix (.github/workflows) or an explicit,
	// approved exception note — not a version number that happens to appear in a
	// changelog or prose. Scanning arbitrary docs lets coincidental substrings
	// pass, so only workflows and an explicit exception note count here.
	if (
		/compatibility exception|approved exception/i.test(
			`${ ctx.workflowsText }\n${ ctx.docsText }`
		)
	) {
		return {
			...base,
			status: 'pass',
			message: 'An approved compatibility exception note is documented.',
		};
	}

	if ( ctx.workflowsText.trim() === '' ) {
		return {
			...base,
			status: 'fail',
			message:
				'No CI workflows found to evidence the compatibility matrix (WP 6.9 + 7.0, PHP 8.2-8.5).',
			details: [
				'Add a CI matrix under .github/workflows, or document an approved compatibility exception note.',
			],
		};
	}

	const missing: string[] = [];
	if ( ! /\b6\.9\b/.test( ctx.workflowsText ) ) {
		missing.push( 'WordPress 6.9' );
	}
	// WP 7.0 in CI is often expressed as "latest"; accept either, but only from
	// the workflow matrix.
	if ( ! /\b7\.0\b/.test( ctx.workflowsText ) && ! /\blatest\b/.test( ctx.workflowsText ) ) {
		missing.push( 'WordPress 7.0' );
	}
	for ( const php of [ '8.2', '8.3', '8.4', '8.5' ] ) {
		if ( ! ctx.workflowsText.includes( php ) ) {
			missing.push( `PHP ${ php }` );
		}
	}

	if ( missing.length === 0 ) {
		return {
			...base,
			status: 'pass',
			message: 'CI matrix covers WP 6.9 + 7.0 and PHP 8.2-8.5.',
		};
	}
	return {
		...base,
		status: 'fail',
		message: `CI compatibility matrix is missing: ${ missing.join( ', ' ) }.`,
		details: [
			'Cover the matrix in CI (.github/workflows) or add an approved compatibility exception note.',
		],
	};
}

function checkBuildTestCommandsDocumented( ctx: Context ): CheckResult {
	const base = {
		id: 'build-test-commands-documented',
		rule: 8,
		title: 'Build and test commands are documented',
	};
	const hasTest = /composer (run )?test|phpunit|playwright test/i.test( ctx.docsText );
	const hasBuild = /npm run build|npm ci|composer install|npm install/i.test( ctx.docsText );

	if ( hasTest && hasBuild ) {
		return {
			...base,
			status: 'pass',
			message: 'Docs document both build/install and test commands.',
		};
	}

	const missing: string[] = [];
	if ( ! hasBuild ) {
		missing.push( 'build/install commands' );
	}
	if ( ! hasTest ) {
		missing.push( 'test commands' );
	}
	return { ...base, status: 'fail', message: `Docs are missing: ${ missing.join( ' and ' ) }.` };
}

function checkTelemetryTracksOnly( ctx: Context ): CheckResult {
	const base = {
		id: 'telemetry-tracks-only',
		rule: 9,
		title: 'Telemetry uses the Starter Kit pattern (Tracks only, no secrets)',
	};
	const usesTelemetry = /Telemetry|record_event\s*\(/.test( ctx.phpSource );
	if ( ! usesTelemetry ) {
		return {
			...base,
			status: 'not_applicable',
			message: 'The integration does not record telemetry.',
		};
	}

	const usesVipTelemetryApi = /Automattic\\VIP\\Telemetry/.test( ctx.phpSource );
	const guarded = /class_exists\s*\(/.test( ctx.phpSource );
	const usesStats = /Automattic\\VIP\\Stats|record_pixel|->pixel\b/.test( ctx.phpSource );

	if ( usesStats ) {
		return {
			...base,
			status: 'fail',
			message: 'Telemetry uses Stats/Pixel; VIP integrations must use Tracks events only.',
		};
	}

	// Best-effort scan for obvious secret/PII keys in event properties. This is
	// advisory: real secret review stays in the human-review layer.
	const suspicious = (
		ctx.phpSource.match(
			/record_event\s*\([\s\S]{0,400}?['"](password|secret|api_token|token|credential|email)['"]/gi
		) ?? []
	).length;

	if ( ! usesVipTelemetryApi || ! guarded ) {
		return {
			...base,
			status: 'warn',
			message:
				'Telemetry is recorded, but the VIP Telemetry (Tracks) helper pattern with a class_exists guard was not detected.',
		};
	}
	if ( suspicious > 0 ) {
		return {
			...base,
			status: 'warn',
			message:
				'Telemetry uses the Tracks helper, but event properties may include secret/PII keys — review before submitting.',
		};
	}

	return {
		...base,
		status: 'pass',
		message: 'Telemetry uses the guarded VIP Tracks helper with no obvious secrets in properties.',
	};
}

const HUMAN_REVIEW: HumanReviewItem[] = [
	{
		title: 'Plugin - platform config-schema match',
		reason:
			"Whether the plugin's expected config matches the platform schema is not fully deterministic and is confirmed in human review, not by this checker.",
	},
	{
		title: 'Security review',
		reason:
			'Security posture (input handling, secret storage, capability checks) is assessed in human review, not by this checker.',
	},
];

/**
 * Run every conformance check against an integration directory and return a
 * structured report. `conformant` is false when any check has status `fail`.
 */
export function validateIntegration( root: string ): ValidationReport {
	const ctx = buildContext( root );

	const results: CheckResult[] = [
		checkLoadsThroughStarterKit( ctx ),
		checkComposerTest( ctx ),
		checkValidateIntegrationScript( ctx ),
		checkConfigConstantDocumented( ctx ),
		checkGracefulConfigHandling( ctx ),
		checkConfigExamplesInDocs( ctx ),
		checkCompatibilityMatrix( ctx ),
		checkBuildTestCommandsDocumented( ctx ),
		checkTelemetryTracksOnly( ctx ),
	];

	return {
		path: root,
		results,
		humanReview: HUMAN_REVIEW,
		conformant: ! results.some( result => result.status === 'fail' ),
	};
}

/** Whether the given path looks like an integration we can check at all. */
export function looksLikeIntegration( root: string ): boolean {
	return existsSync( join( root, 'composer.json' ) ) || detectEntryFile( root ) !== null;
}
