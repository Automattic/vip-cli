module.exports = {
	assumptions: { constantReexports: true, enumerableModuleMeta: true },
	plugins: [ '@babel/plugin-transform-modules-commonjs' ],
	presets: [ [ '@babel/preset-typescript', { onlyRemoveTypeImports: false } ] ],
	ignore: [ '**/*.d.ts' ],
};
