/* eslint-disable valid-jsdoc */
const Sequencer = require( '@jest/test-sequencer' ).default;

/**
 * @typedef {import('@jest/test-sequencer').ShardOptions} ShardOptions
 * @typedef {import('@jest/test-result').Test} Test
 */

class TestSequencer extends Sequencer {
	/**
	 * @param {Test[]} tests All tests
	 * @param {ShardOptions} options Sharding options
	 * @returns {Test[]} Chunk
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
	 * @param {Test[]} tests Tests
	 * @returns {Test[]} Sorted tests
	 */
	sort( tests ) {
		return tests.sort( ( testA, testB ) => ( testA.path > testB.path ? 1 : -1 ) );
	}
}

module.exports = TestSequencer;
