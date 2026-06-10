/**
 * Shared constants for the AssemblyScript toolchain. Kept in one place so a
 * version bump or an SDK rename is a single-line change that flows into both the
 * scaffolded templates and the scaffold/compile logic.
 */

export const SDK_PACKAGE = '@automattic/vip-edge-workers-sdk';
export const SDK_VERSION = '^0.2.0';
export const ASSEMBLYSCRIPT_VERSION = '^0.27.0';
export const DEFAULT_ENTRY = 'assembly/index.ts';
export const BUILD_DIR = 'build';
