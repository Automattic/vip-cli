import { LandoConfig } from "./lando";

export = App;

export interface ServiceInfo {
	service: string;
	urls: string[];
	type: string;
	healthy: boolean;
}

interface ScanResult {
	url: string;
	status: boolean;
	color: 'green' | 'yellow' | 'red';
}

declare class App {
	constructor( name: any, config: any, lando?: {} );
	/**
	 * The apps name
	 *
	 * @since 3.0.0
	 * @alias app.name
	 */
	name: string;
	project: string;
	_config: any;
	_dir: string;
	_lando: {};
	_name: any;
	/**
	 * The apps logger
	 *
	 * @since 3.0.0
	 * @alias app.log
	 */
	/**
	 * The apps engine
	 *
	 * @since 3.0.0
	 * @alias app.engine
	 */
	/**
	 * The apps event emitter
	 *
	 * @since 3.0.0
	 * @alias app.events
	 */
	/**
	 * The apps metric reporter
	 *
	 * @since 3.0.0
	 * @alias app.metrics
	 */
	/**
	 * The apps url scanner
	 *
	 * @since 3.0.0
	 * @alias app.scanUrl
	 */
	/**
	 * The apps shell
	 *
	 * @since 3.0.0
	 * @alias app.shell
	 */
	log: any;
	shell: any;
	engine: any;
	metrics: any;
	Promise: any;
	events: import("lando/lib/events");
	scanUrls: (urls: string[], options?: { max?: number, waitCodes?: number[] }) => Promise<ScanResult[]>;
	/**
	 * The apps configuration
	 *
	 * @since 3.0.0
	 * @alias app.config
	 */
	config: LandoConfig;
	configFiles: any;
	configHash: any;
	ComposeService: any;
	env: any;
	/**
	 * Information about this app
	 *
	 * @since 3.0.0
	 * @alias app.info
	 */
	info: ServiceInfo[];
	labels: any;
	opts: Record<string, any>;
	plugins: any;
	metaCache: string;
	meta: any;
	nonRoot: any[];
	/**
	 * The apps root directory
	 *
	 * @since 3.0.0
	 * @alias app.root
	 */
	root: string;
	/**
	 * Tasks and commands the app can run
	 *
	 * @since 3.0.0
	 * @alias app.tasks
	 */
	tasks: any[];
	warnings: any[];
	id: any;
	add( data: any, front?: boolean ): void;
	addWarning( message: any, error?: any ): void;
	/**
	 * Hard removes all app services, volumes, networks, etc.
	 *
	 * This differs from `uninstall` in that uninstall will only soft remove all app
	 * services, while maintaining things like volumes, networks, etc.
	 *
	 * That said this DOES call both `stop` and `uninstall` under the hood.
	 *
	 * @since 3.0.0
	 * @alias app.destroy
	 * @fires pre_destroy
	 * @fires pre_stop
	 * @fires post_stop
	 * @fires pre_uninstall
	 * @fires post_uninstall
	 * @fires post_destroy
	 * @return {Promise} A Promise
	 */
	destroy(): Promise< void >;
	/**
	 * Initializes the app
	 *
	 * You will want to run this to get the app ready for lando.engine. This will
	 * load in relevant app plugins, build the docker compose files and get them ready to go
	 *
	 * @since 3.0.0
	 * @alias app.init
	 * @fires pre_init
	 * @fires post_init
	 * @fires ready
	 * @return {Promise} A Promise.
	 */
	init(): Promise< void >;
	composeData: any[];
	envFiles: any;
	services: any;
	compose: any;
	initialized: boolean;
	/**
	 * Rebuilds an app.
	 *
	 * This will stop an app, soft remove its services, rebuild those services and
	 * then, finally, start the app back up again. This is useful for developers who
	 * might want to tweak Dockerfiles or compose yamls.
	 *
	 * @since 3.0.0
	 * @alias app.rebuild
	 * @fires pre_stop
	 * @fires post_stop
	 * @fires pre_rebuild
	 * @fires pre_uninstall
	 * @fires post_uninstall
	 * @fires post_rebuild
	 * @fires pre_start
	 * @fires post_start
	 * @return {Promise} A Promise.
	 */
	rebuild(): Promise< void >;
	reset(): void;
	/**
	 * Stops and then starts an app.
	 *
	 * This just runs `app.stop` and `app.start` in succession.
	 *
	 * @since 3.0.0
	 * @alias app.restart
	 * @fires pre_stop
	 * @fires post_stop
	 * @fires pre_start
	 * @fires post_start
	 * @param {Object} app - A fully instantiated app object
	 * @return {Promise} A Promise.
	 */
	restart(): Promise< void >;
	/**
	 * Starts an app.
	 *
	 * This will start up all services/containers that have been defined for this app.
	 *
	 * @since 3.0.0
	 * @alias app.start
	 * @fires pre_start
	 * @fires post_start
	 * @return {Promise} A Promise.
	 *
	 */
	start(): Promise< void >;
	/**
	 * Stops an app.
	 *
	 * This will stop all services/containers that have been defined for this app.
	 *
	 * @since 3.0.0
	 * @alias app.stop
	 * @fires pre_stop
	 * @fires post_stop
	 * @return {Promise} A Promise.
	 */
	stop(): Promise< void >;
	/**
	 * Soft removes the apps services but maintains persistent data like app volumes.
	 *
	 * This differs from `destroy` in that destroy will hard remove all app services,
	 * volumes, networks, etc as well as remove the app from the appRegistry.
	 *
	 * @since 3.0.0
	 * @alias app.uninstall
	 * @fires pre_uninstall
	 * @fires post_uninstall
	 * @param {Boolean} purge - A fully instantiated app object
	 * @return {Promise} A Promise.
	 */
	uninstall( purge?: boolean ): Promise< void >;
	getServiceContainerId( service: any ): string;
	getServiceFromContainerId( id: any ): any;
}
