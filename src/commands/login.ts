import opn from 'opn';
import { prompt } from 'enquirer';
import chalk from 'chalk';
import debugLib from 'debug';
import { Command } from './base';
import Token from '../lib/token';
import { trackEvent, aliasUser } from '../lib/tracker';
import UserError from '../lib/user-error';

const debug = debugLib('@automattic/vip:commands:login');
const tokenURL = 'https://dashboard.wpvip.com/me/cli/token';

/**
 * Login command - authenticates the user
 */
export default class LoginCommand extends Command {
  constructor() {
    super('login');
    this.description('Authenticate with VIP');
    this.requiresAuth = false;
  
    this.action(async () => {
      await this.loginFlow();
    });
  }

  /**
   * Execute login flow
   */
  private async loginFlow(): Promise<void> {
    console.log();
    console.log('   _    __ ________         ________    ____');
    console.log('  | |  / //  _/ __        / ____/ /   /  _/');
    console.log('  | | / / / // /_/ /______/ /   / /    / /  ');
    console.log('  | |/ /_/ // ____//_____/ /___/ /____/ /   ');
    console.log('  |___//___/_/           ____/_____/___/   ');
    console.log();
    console.log(
      '  VIP-CLI is your tool for interacting with and managing your VIP applications.'
    );
    console.log();

    console.log(
      '  Authenticate your installation of VIP-CLI with your Personal Access Token. This URL will be opened in your web browser automatically so that you can retrieve your token: ' +
        tokenURL
    );
    console.log();

    await trackEvent('login_command_execute');

    const answer = await prompt({
      type: 'confirm',
      name: 'continue',
      message: 'Ready to authenticate?',
    });

    if (!answer.continue) {
      await trackEvent('login_command_browser_cancelled');
      return;
    }

    opn(tokenURL, { wait: false });

    await trackEvent('login_command_browser_opened');

    const { token: tokenInput } = await prompt({
      type: 'password',
      name: 'token',
      message: 'Access Token:',
    });

    let token;
    try {
      token = new Token(tokenInput);
    } catch (err) {
      await trackEvent('login_command_token_submit_error', { error: err.message });
      throw new UserError('The token provided is malformed. Please check the token and try again.');
    }

    if (token.expired()) {
      await trackEvent('login_command_token_submit_error', { error: 'expired' });
      throw new UserError('The token provided is expired. Please log in again to refresh the token.');
    }

    if (!token.valid()) {
      await trackEvent('login_command_token_submit_error', { error: 'invalid' });
      throw new UserError('The provided token is not valid. Please log in again to refresh the token.');
    }

    try {
      await Token.set(token.raw);
    } catch (err) {
      await trackEvent('login_command_token_submit_error', {
        error: err.message,
      });
      throw err;
    }

    // De-anonymize user for tracking
    await aliasUser(token.id);

    await trackEvent('login_command_token_submit_success');
    console.log('You are now logged in - see `vip -h` for a list of available commands.');
  }
} 