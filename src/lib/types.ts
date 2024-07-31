/**
 * https://github.com/sindresorhus/type-fest/blob/f361912c779dfb81c10cd5fcf860f60a80358058/source/omit-index-signature.d.ts#L103C1-L107C3
 */
export type OmitIndexSignature< ObjectType > = {
	// eslint-disable-next-line @typescript-eslint/ban-types
	[ KeyType in keyof ObjectType as {} extends Record< KeyType, unknown >
		? never
		: KeyType ]: ObjectType[ KeyType ];
};
