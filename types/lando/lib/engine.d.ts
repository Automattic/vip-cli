export = Engine;

export interface LandoService {
    id: string;
    service: string;
    name: string;
    app: string;
    src: string[];
    kind: string;
    lando: boolean;
    instance: string;
    status: string;
}

declare class Engine {
    constructor(daemon?: LandoDaemon, docker?: Landerode, compose?: () => void, config?: {});
    docker: Landerode;
    daemon: LandoDaemon;
    compose: () => void;
    engineCmd: (name: any, data: any, run?: () => any) => any;
    composeInstalled: boolean;
    dockerInstalled: boolean;
    supportedVersions: any;
    /**
     * Event that allows you to do some things before a `compose` object's containers are
     * built
     *
     * @since 3.0.0
     * @alias lando.events:pre-engine-build
     * @event pre_engine_build
     */
    /**
     * Event that allows you to do some things after a `compose` object's containers are
     * built
     *
     * @since 3.0.0
     * @alias lando.events:post-engine-build
     * @event post_engine_build
     */
    /**
     * Tries to pull the services for a `compose` object, and then tries to build them if they are found
     * locally. This is a wrapper around `docker pull` and `docker build`.
     *
     * **NOTE:** Generally an instantiated `App` instance is a valid `compose` object
     *
     * @since 3.0.0
     * @alias lando.engine.build
     * @fires pre_engine_build
     * @fires post_engine_build
     * @param {Object} data A `compose` Object or an Array of `compose` Objects if you want to build more than one set of services.
     * @param {Array} data.compose An Array of paths to Docker compose files
     * @param {String} data.project A String of the project name (Usually this is the same as the app name)
     * @param {Object} [data.opts] Options on how to build the `compose` objects containers.
     * @param {Array} [data.opts.services='all services'] The services to build.
     * @param {Boolean} [data.opts.nocache=true] Ignore the build cache.
     * @param {Boolean} [data.opts.pull=true] Try to pull first.
     * @return {Promise} A Promise.
     * @example
     * return lando.engine.build(app);
     */
    build(data: {
        compose: any[];
        project: string;
        opts?: {
            services?: any[];
            nocache?: boolean;
            pull?: boolean;
        };
    }): Promise<any>;
    /**
     * Creates a Docker network
     *
     * @since 3.0.0.
     * @function
     * @alias lando.engine.createNetwork
     * @see [docker api network docs](https://docs.docker.com/engine/api/v1.35/#operation/NetworkCreate) for info on opts.
     * @param {String} name The name of the networks
     * @return {Promise} A Promise with inspect data.
     * @example
     * return lando.engine.createNetwork('mynetwork')
     */
    createNetwork(name: string): Promise<any>;
    /**
     * Event that allows you to do some things before some containers are destroyed.
     *
     * @since 3.0.0
     * @alias lando.events:pre-engine-destroy
     * @event pre_engine_destroy
     */
    /**
     * Event that allows you to do some things after some containers are destroyed.
     *
     * @since 3.0.0
     * @alias lando.events:post-engine-destroy
     * @event post_engine_destroy
     */
    /**
     * Removes containers for a `compose` object or a particular container.
     *
     * There are two ways to remove containers:
     *
     *  1. Using an object with `{id: id}` where `id` is a docker recognizable id
     *  2. Using a `compose` object with `{compose: compose, project: project, opts: opts}`
     *
     * These are detailed more below.
     *
     * **NOTE:** Generally an instantiated `App` instance is a valid `compose` object
     *
     * @since 3.0.0
     * @alias lando.engine.destroy
     * @fires pre_engine_destroy
     * @fires post_engine_destroy
     * @param {Object} data Remove criteria, Need eithers an ID or a service within a compose context
     * @param {String} data.id An id that docker can recognize such as a container hash or name. Can also use `data.name` or `data.cid`.
     * @param {Array} data.compose An Array of paths to Docker compose files
     * @param {String} data.project A String of the project name (Usually this is the same as the app name)
     * @param {Object} [data.opts] Options on what services to remove.
     * @param {Array} [data.opts.services='all services'] An Array of services to remove.
     * @param {Boolean} [data.opts.volumes=true] Also remove volumes associated with the container(s).
     * @param {Boolean} [data.opts.force=false] Force remove the containers.
     * @param {Boolean} [data.opts.purge=false] Implies `volumes` and `force`.
     * @return {Promise} A Promise.
     * @example
     * return lando.engine.destroy(app);
     *
     */
    destroy(data: {
        id: string;
        compose: any[];
        project: string;
        opts?: {
            services?: any[];
            volumes?: boolean;
            force?: boolean;
            purge?: boolean;
        };
    }): Promise<any>;
    /**
     * Checks whether a specific service exists or not.
     *
     * There are two ways to check whether a container exists:
     *
     *  1. Using an object with `{id: id}` where `id` is a docker recognizable id
     *  2. Using a `compose` object with `{compose: compose, project: project, opts: opts}`
     *
     * These are detailed more below.
     *
     * **NOTE:** Generally an instantiated `app` instance is a valid `compose` object
     *
     * @since 3.0.0
     * @alias lando.engine.exists
     * @param {Object} data Search criteria, Need eithers an ID or a service within a compose context
     * @param {String} data.id An id that docker can recognize such as a container hash or name. Can also use `data.name` or `data.cid`.
     * @param {Array} data.compose An Array of paths to Docker compose files
     * @param {String} data.project A String of the project name (Usually this is the same as the app name)
     * @param {Object} data.opts Options on what service to check
     * @param {Array} data.opts.services An Array of services to check
     * @return {Promise} A Promise with a Boolean of whether the service exists or not.
     * @example
     * return lando.engine.exists(compose);
     */
    exists(data: {
        id: string;
        compose: any[];
        project: string;
        opts: {
            services: any[];
        };
    }): Promise<any>;
    /**
     * Gets a Docker network
     *
     * @since 3.0.0.
     * @function
     * @alias lando.engine.getNetwork
     * @param {String} id The id of the network
     * @return {Object} A Dockerode Network object .
     * @example
     * const network = lando.engine.getNetwork('mynetwork')
     */
    getNetwork(id: string): Dockerode.Network;
    /**
     * Gets the docker networks.
     *
     * @since 3.0.0
     * @function
     * @alias lando.engine.getNetworks
     * @see [docker api network docs](https://docs.docker.com/engine/api/v1.27/#operation/NetworkList) for info on filters option.
     * @param {Object} [opts] Options to pass into the docker networks call
     * @param {Object} [opts.filters] Filters options
     * @return {Promise} A Promise with an array of network objects.
     */
    getNetworks(opts?: {
        filters?: any;
    }): Promise<any>;
    /**
     * Determines whether a container is running or not
     *
     * @since 3.0.0
     * @alias lando.engine.isRunning
     * @param {String} data An ID that docker can recognize such as the container id or name.
     * @return {Promise} A Promise with a boolean of whether the container is running or not
     * @example
     *
     * // Check to see if our app's web service is running
     * return lando.engine.isRunning('myapp_web_1').then(isRunning) {
     *   lando.log.info('Container %s is running: %s', 'myapp_web_1', isRunning);
     * });
     */
    isRunning(data: string): Promise<any>;
    /**
     * Lists all the Lando containers. Optionally filter by app name.
     *
     * @since 3.0.0
     * @alias lando.engine.list
     * @param {Object} [options] Options to filter the list.
     * @param {Boolean} [options.all=false] Show even stopped containers
     * @param {String} [options.app] Show containers for only a certain app
     * @param {Array} [options.filter] Filter by additional key=value pairs
     * @return {Promise} A Promise with an Array of container Objects.
     * @example
     * return lando.engine.list().each(function(container) {
     *   lando.log.info(container);
     * });
     */
    list(options?: {
        all?: boolean;
        app?: string;
        project?: string;
        filter?: any[];
    }): Promise<LandoService[]>;
    /**
     * Returns logs for a given `compose` object
     *
     * **NOTE:** Generally an instantiated `app` instance is a valid `compose` object
     *
     * @since 3.0.0
     * @alias lando.engine.logs
     * @param {Object} data A `compose` Object or an Array of `compose` Objects if you want to get logs for more than one set of services.
     * @param {Array} data.compose An Array of paths to Docker compose files
     * @param {String} data.project A String of the project name (Usually this is the same as the app name)
     * @param {Object} [data.opts] Options on how to build the `compose` objects containers.
     * @param {Boolean} [data.opts.follow=false] Whether to follow the log. Works like `tail -f`.
     * @param {Boolean} [data.opts.timestamps=true] Show timestamps in log.
     * @return {Promise} A Promise.
     * @example
     *
     * // Get logs for an app
     * return lando.engine.logs(app);
     */
    logs(data: {
        compose: any[];
        project: string;
        opts?: {
            follow?: boolean;
            timestamps?: boolean;
        };
    }): Promise<any>;
    /**
     * Event that allows you to do some things before a command is run on a particular
     * container.
     *
     * @since 3.0.0
     * @alias lando.events:pre-engine-run
     * @event pre_engine_run
     */
    /**
     * Event that allows you to do some things after a command is run on a particular
     * container.
     *
     * @since 3.0.0
     * @alias lando.events:post-engine-run
     * @event post_engine_run
     */
    /**
     * Runs a command on a given service/container. This is a wrapper around `docker exec`.
     *
     * UNTIL the resolution of https://github.com/apocas/docker-modem/issues/83 data needs to also be or be an
     * array of compose objects for this to work correctly on Windows as well. See some of the other engine
     * documentation for what a compose object looks like.
     *
     * @since 3.0.0
     * @alias lando.engine.run
     * @fires pre_engine_run
     * @fires post_engine_run
     * @param {Object} data A run Object or an Array of run Objects if you want to run more than one command.
     * @param {String} data.id The container to run the command on. Must be an id that docker can recognize such as a container hash or name.
     * @param {String} data.cmd A String of a command or an Array whose elements are the parts of the command.
     * @param {Object} [data.opts] Options on how to run the command.
     * @param {String} [data.opts.mode='collect'] Either `collect` or `attach`. Attach will connect to the run `stdin`.
     * @param {String} [data.opts.pre] A String or Array of additional arguments or options to append to the `cmd` before the user specified args and options are added.
     * @param {Array} [data.opts.env=[]] Additional environmental variables to set for the cmd. Must be in the form `KEY=VALUE`.
     * @param {String} [data.opts.user='root'] The user to run the command as. Can also be `user:group` or `uid` or `uid:gid`.
     * @param {String} [data.opts.detach=false] Run the process in the background
     * @param {String} [data.opts.autoRemove=false] Automatically removes the container
     * @return {Promise} A Promise with a string containing the command's output.
     * @example
     *
     * // Run composer install on the appserver container for an app called myapp
     * return lando.engine.run({id: 'myapp_appserver_1', cmd: ['composer', 'install']});
     *
     * // Drop into an interactive bash shell on the database continer for an app called myapp
     * return lando.engine.run({
     *   id: 'myapp_database_1',
     *   cmd: ['bash'],
     *   opts: {
     *     mode: 'attach'
     *   }
     * });
     */
    run(data: {
        id: string;
        cmd: string;
        opts?: {
            mode?: string;
            pre?: string;
            env?: any[];
            user?: string;
            detach?: string;
            autoRemove?: string;
        };
    }): Promise<any>;
    /**
     * Returns comprehensive service metadata. This is a wrapper around `docker inspect`.
     *
     * There are two ways to get container metadata:
     *
     *  1. Using an object with `{id: id}` where `id` is a docker recognizable id
     *  2. Using a `compose` object with `{compose: compose, project: project, opts: opts}`
     *
     * These are detailed more below.
     *
     * **NOTE:** Generally an instantiated `app` instance is a valid `compose` object
     *
     * @since 3.0.0
     * @alias lando.engine.scan
     * @param {Object} data Search criteria, Need eithers an ID or a service within a compose context
     * @param {String} data.id An id that docker can recognize such as a container hash or name. Can also use `data.name` or `data.cid`.
     * @param {Array} data.compose An Array of paths to Docker compose files
     * @param {String} data.project A String of the project name (Usually this is the same as the app name)
     * @param {Object} data.opts Options on what service to scan
     * @param {Array} data.opts.services An Array of services to scan.
     * @return {Promise} A Promise with an Object of service metadata.
     * @example
     * // Log scan data using an id
     * return lando.engine.scan({id: '146d321f212d'}).then(function(data) {
     *   lando.log.info('Container data is %j', data);
     * });
     */
    scan(data: {
        id: string;
        compose: any[];
        project: string;
        opts: {
            services: any[];
        };
    }): Promise<any>;
    /**
     * Event that allows you to do some things before a `compose` Objects containers are
     * started
     *
     * @since 3.0.0
     * @alias lando.events:pre-engine-start
     * @event pre_engine_start
     */
    /**
     * Event that allows you to do some things after a `compose` Objects containers are
     * started
     *
     * @since 3.0.0
     * @alias lando.events:post-engine-start
     * @event post_engine_start
     */
    /**
     * Starts the containers/services for the specified `compose` object.
     *
     * **NOTE:** Generally an instantiated `app` instance is a valid `compose` object
     *
     * @since 3.0.0
     * @alias lando.engine.start
     * @fires pre_engine_start
     * @fires post_engine_start
     * @param {Object} data A `compose` Object or an Array of `compose` Objects if you want to start more than one set of services.
     * @param {Array} data.compose An Array of paths to Docker compose files
     * @param {String} data.project A String of the project name (Usually this is the same as the app name)
     * @param {Object} [data.opts] Options on how to start the `compose` Objects containers.
     * @param {Array} [data.opts.services='all services'] The services to start.
     * @param {Boolean} [data.opts.background=true] Start the services in the background.
     * @param {Boolean} [data.opts.recreate=false] Recreate the services.
     * @param {Boolean} [data.opts.removeOrphans=true] Remove orphaned containers.
     * @return {Promise} A Promise.
     * @example
     * return lando.engine.start(app);
     */
    start(data: {
        compose: any[];
        project: string;
        opts?: {
            services?: any[];
            background?: boolean;
            recreate?: boolean;
            removeOrphans?: boolean;
        };
    }): Promise<any>;
    /**
     * Event that allows you to do some things before some containers are stopped.
     *
     * @since 3.0.0
     * @alias lando.events:pre-engine-stop
     * @event pre_engine_stop
     */
    /**
     * Event that allows you to do some things after some containers are stopped.
     *
     * @since 3.0.0
     * @alias lando.events:post-engine-stop
     * @event post_engine_stop
     */
    /**
     * Stops containers for a `compose` object or a particular container.
     *
     * There are two ways to stop containers:
     *
     *  1. Using an object with `{id: id}` where `id` is a docker recognizable id
     *  2. Using a `compose` object with `{compose: compose, project: project, opts: opts}`
     *
     * These are detailed more below.
     *
     * **NOTE:** Generally an instantiated `app` instance is a valid `compose` object
     *
     * @since 3.0.0
     * @alias lando.engine.stop
     * @fires pre_engine_stop
     * @fires post_engine_stop
     * @param {Object} data Stop criteria, Need eithers an ID or a service within a compose context
     * @param {String} data.id An id that docker can recognize such as a container hash or name. Can also use `data.name` or `data.cid`.
     * @param {Array} data.compose An Array of paths to Docker compose files
     * @param {String} data.project A String of the project name (Usually this is the same as the app name)
     * @param {Object} [data.opts] Options on what services to setop
     * @param {Array} [data.opts.services='all services'] An Array of services to stop.
     * @return {Promise} A Promise.
     * @example
     * return lando.engine.stop(app);
     */
    stop(data: {
        id: string;
        compose: any[];
        project: string;
        opts?: {
            services?: any[];
        };
    }): Promise<any>;
}
import Landerode = require("lando/lib/docker");
import LandoDaemon = require("lando/lib/daemon");
import Dockerode = require("dockerode");
