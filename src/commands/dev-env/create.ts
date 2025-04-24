import chalk from 'chalk';
import debugLib from 'debug';
import { Command } from '../base';
import {
  createEnvironment,
  printEnvironmentInfo,
  getApplicationInformation,
  doesEnvironmentExist,
  getEnvironmentPath,
} from '../../lib/dev-environment/dev-environment-core';
import {
  DEFAULT_SLUG,
  getEnvironmentName,
  promptForArguments,
  getEnvironmentStartCommand,
  addDevEnvConfigurationOptions,
  getOptionsFromAppInfo,
  handleCLIException,
  validateDependencies,
  processStringOrBooleanOption,
  handleDeprecatedOptions,
} from '../../lib/dev-environment/dev-environment-cli';
import {
  getConfigurationFileOptions,
  printConfigurationFile,
  mergeConfigurationFileOptions,
} from '../../lib/dev-environment/dev-environment-configuration-file';
import type { InstanceOptions } from '../../lib/dev-environment/types';
import { bootstrapLando } from '../../lib/dev-environment/dev-environment-lando';
import UserError from '../../lib/user-error';

const debug = debugLib('@automattic/vip:commands:dev-env:create');

/**
 * Dev Environment Create command - Creates a local development environment
 */
export default class DevEnvCreateCommand extends Command {
  constructor() {
    super('create');
    this.description('Create a new local dev environment');
    
    // Add command options
    this.option('--slug <slug>', 'Custom name of the dev environment');
    this.option('--title <title>', 'Title for the WordPress site');
    this.option('--multisite [type]', 'Enable multisite install', processStringOrBooleanOption);
    
    // Add all dev env configuration options
    this._addDevEnvConfigOptions();
    
    // Set action handler
    this.action(async (options) => {
      await this.createDevEnv(options);
    });
  }
  
  /**
   * Add all dev env configuration options to the command
   */
  private _addDevEnvConfigOptions(): void {
    this.option('--php <version>', 'PHP version');
    this.option('--wordpress <version>', 'WordPress version');
    this.option('--app-code <path>', 'Path to application code');
    this.option('--domain <domain>', 'Local development domain');
    // Add additional options as needed
  }
  
  /**
   * Create a new dev environment
   */
  private async createDevEnv(options): Promise<void> {
    const configurationFileOptions = await getConfigurationFileOptions();

    const environmentNameOptions = {
      slug: options.slug,
      app: options.app,
      env: options.env,
      allowAppEnv: true,
    };

    let slug = DEFAULT_SLUG;

    const hasConfiguration =
      Object.keys(options).length !== 0 || Object.keys(configurationFileOptions).length > 0;
    if (hasConfiguration) {
      slug = await getEnvironmentName(environmentNameOptions);
    }

    const lando = await bootstrapLando();
    await validateDependencies(lando, slug);

    debug('Options:', options);

    handleDeprecatedOptions(options);

    const trackingInfo = {
      slug,
      app: options.app,
      env: options.env,
    };
    await this.trackCommandExecution(trackingInfo);

    const startCommand = chalk.bold(getEnvironmentStartCommand(slug, configurationFileOptions));

    const environmentAlreadyExists = await doesEnvironmentExist(getEnvironmentPath(slug));
    if (environmentAlreadyExists) {
      const messageToShow =
        `Environment already exists\n\n\nTo start the environment run:\n\n${startCommand}\n\n` +
        `To create another environment use ${chalk.bold('--slug')} option with a unique name.\n`;

      throw new UserError(messageToShow);
    }

    let defaultOptions: InstanceOptions = {};

    try {
      if (options.app) {
        const appInfo = await getApplicationInformation(options.app, options.env);
        defaultOptions = getOptionsFromAppInfo(appInfo);
      }
    } catch (error) {
      const message = `failed to fetch application "${options.app}" information`;

      debug(`WARNING: ${message}`, error.message);
      console.log(chalk.yellow('Warning:'), message);
    }

    let preselectedOptions = options;
    let suppressPrompts = false;

    if (Object.keys(configurationFileOptions).length > 0) {
      console.log('\nUsing configuration from file.');
      printConfigurationFile(configurationFileOptions);
      preselectedOptions = mergeConfigurationFileOptions(options, configurationFileOptions);
      suppressPrompts = true;
    }

    const instanceData = await promptForArguments(
      preselectedOptions,
      defaultOptions,
      suppressPrompts
    );
    instanceData.siteSlug = slug;

    try {
      await createEnvironment(instanceData);

      await printEnvironmentInfo(lando, slug, { extended: false, suppressWarnings: true });

      const message =
        '\n' +
        chalk.green('✓') +
        ` environment created.\n\nTo start it please run:\n\n${startCommand}\n`;
      console.log(message);

      await this.trackCommandExecution({ ...trackingInfo, success: true });
    } catch (error) {
      await handleCLIException(error, 'dev_env_create_command_error', trackingInfo);
      throw error;
    }
  }
} 