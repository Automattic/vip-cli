/**
 * Application Context
 */
export interface AppContext {
  id: string;
  name: string;
  environments?: Array<{
    id: string;
    name: string;
    type: string;
  }>;
}

/**
 * Command Registration Interface
 */
export interface CommandDefinition {
  name: string;
  description: string;
  path: string;
  subcommands?: CommandDefinition[];
} 