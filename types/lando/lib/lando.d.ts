declare class Lando {
	constructor( options?: {} );
	BOOTSTRAP_LEVELS: {
		config: number;
		tasks: number;
		engine: number;
		app: number;
	};
	config: any;
	Promise: any;
	tasks: any[];
	cache: any;
	cli: any;
	log: any;
	metrics: any;
	error: any;
	events: any;
	user: any;
	/**
	 * Bootstraps Lando, this should
	 *
	 *  1. Emit bootstrap events
	 *  2. Auto detect and then load any plugins
	 *  3. Augment the lando object with additional methods
	 *
	 * You will want to use this after you instantiate `lando` via `new Lando(config)`. There
	 * are four available bootstrap levels and each provides different things. The run in
	 * the order presented.
	 *
	 *      config     Autodetects and loads any plugins and merges their returns into
	 *                 the global config
	 *
	 *      tasks      Autodetects and loads in any tasks along with recipe inits and
	 *                 init sources
	 *
	 *      engine     Autodetects and moves any plugin scripts, adds `engine`, `shell`,
	 *                 `scanUrls` and `utils` to the lando instance
	 *
	 *      app        Autodetects and loads in any `services` and `recipes` and also adds `yaml
	 *                 and `factory` to the lando instance.
	 *
	 * Check out `./bin/lando.js` in this repository for an example of bootstraping
	 * `lando` for usage in a CLI.
	 *
	 * @since 3.0.0
	 * @alias lando.bootstrap
	 * @fires pre_bootstrap_config
	 * @fires pre_bootstrap_tasks
	 * @fires pre_bootstrap_engine
	 * @fires pre_bootstrap_app
	 * @fires post_bootstrap_config
	 * @fires post_bootstrap_tasks
	 * @fires post_bootstrap_engine
	 * @fires post_bootstrap_app
	 * @param {String} [level=app] Level with which to bootstrap Lando
	 * @return {Promise} A Promise
	 * @example
	 * // Bootstrap lando at default level and then exit
	 * lando.bootstrap().then(() => process.exit(0))l
	 */
	bootstrap( level?: string ): Promise< this >;
	_bootstrap: any;
	/**
	 * Gets a fully instantiated App instance.
	 *
	 * Lando will also scan parent directories if no app is found in `startFrom`
	 *
	 * @since 3.0.0
	 * @alias lando.getApp
	 * @param {String} [startFrom=process.cwd()] The directory to start looking for an app
	 * @param {Boolean} [warn=true] Show a warning if we can't find an app
	 * @return {App} Returns an instantiated App instandce.
	 * @example
	 * const app = lando.getApp('/path/to/my/app')
	 */
	getApp( startFrom?: string, warn?: boolean ): import('./app');
}

export = Lando;
