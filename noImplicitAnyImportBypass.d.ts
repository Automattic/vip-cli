// This file allows us to bypass the noImplicitAny rule for importing modules
// noImplicitAny is too good of a rule to fully disable, so we provide this file to ensure that we can still import modules without types.
// as that seems to have been a big pain point for everyone.
// reference: https://www.typescriptlang.org/docs/handbook/modules.html#shorthand-ambient-modules

declare module '*';
