// eslint-disable-next-line import/no-extraneous-dependencies
import { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
	schema: './schema.gql',
	ignoreNoDocuments: true, // for better experience with the watcher
	hooks: { afterAllFileWrite: [ 'prettier --write' ] },
	generates: {
		'./src/graphqlTypes.d.ts': {
			plugins: [ 'typescript' ],
		},
		'./src/': {
			documents: [ 'src/**/*.js', 'src/**/*.ts' ],
			preset: 'near-operation-file',
			presetConfig: {
				extension: '.generated.d.ts',
				baseTypesPath: 'graphqlTypes.ts',
			},
			plugins: [ 'typescript-operations' ],
		},
	},
};

export default config;
