import chalk from 'chalk';
import { prompt } from 'enquirer';
import gql from 'graphql-tag';
import { Command } from '../base';
import { formatData } from '../../lib/cli/format';

/**
 * App List command - Lists all VIP applications
 */
export default class AppListCommand extends Command {
  constructor() {
    super('list');
    this.description('List your VIP applications');
    
    // Add command options
    this.option('-f, --format <format>', 'Output format (table, json, csv)', 'table');
    
    // Set the action handler
    this.action(async (options) => {
      await this.listApps(options);
    });
  }

  /**
   * List all VIP applications
   */
  private async listApps({ format }): Promise<void> {
    const api = await this.getAPI();
    
    try {
      // Fetch apps with GraphQL
      const res = await api.query({
        query: gql`
          query Apps($first: Int, $after: String) {
            apps(first: $first, after: $after) {
              total
              nextCursor
              edges {
                id
                name
                repo
                environments {
                  id
                  name
                  type
                  primaryDomain {
                    name
                  }
                }
              }
            }
          }
        `,
        variables: {
          first: 100,
          after: null,
        },
      });
      
      if (!res?.data?.apps?.edges?.length) {
        console.log(chalk.yellow('No applications found'));
        return;
      }
      
      // Format data for output
      const apps = res.data.apps.edges.map(app => ({
        ID: app.id,
        Name: app.name,
        Repo: app.repo || 'N/A',
        Environments: app.environments?.length || 0,
      }));
      
      // Output the result
      console.log(formatData(apps, format));
      
    } catch (error) {
      console.error(chalk.red('Failed to list applications:'), error.message);
      throw error;
    }
  }
} 