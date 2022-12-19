/* eslint-disable valid-jsdoc */
/**
 * External dependencies
 */
const Sequencer = require( '@jest/test-sequencer' ).default;

class TestSequencer extends Sequencer {
	/**
	 * @param {import('@jest/test-result').Test[]} tests All tests
	 * @param {import('@jest/test-sequencer').ShardOptions} options Sharding options
	 * @returns {import('@jest/test-result').Test[]} Chunk
	 */
	shard( tests, options ) {
		const { shardIndex, shardCount } = options;
		const shardSize = Math.ceil( tests.length / shardCount );
		const shardStart = shardSize * ( shardIndex - 1 );
		const shardEnd = shardSize * shardIndex;

		return [ ...tests ]
			.sort( ( lhs, rhs ) => ( lhs.path > rhs.path ? 1 : -1 ) )
			.slice( shardStart, shardEnd );
	}

	/**
	 * @param {import('@jest/test-result').Test[]} tests Tests
	 * @returns {import('@jest/test-result').Test[]} Sorted tests
	 */
	sort( tests ) {
		const copyTests = Array.from( tests );
		return copyTests.sort( ( testA, testB ) => ( testA.path > testB.path ? 1 : -1 ) );
	}
}

module.exports = TestSequencer;
