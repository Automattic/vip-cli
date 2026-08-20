// Minimal socket.io v4 server implementing a fake /wp-cli namespace for the
// Go wpstream e2e tests. Reads the cmd payload, streams scripted stdout via
// socket.io-stream, optionally kills the connection mid-stream (offset resume),
// then emits exit. Configured via env:
//   PORT          (required) — listen port
//   SCRIPT_STDOUT — bytes to stream to stdout
//   EXIT_CODE     — exit code to emit (default 0)
//   EXIT_MESSAGE  — optional exit message
//   KILL_AFTER    — if set, destroy the connection after N stdout bytes
//   KILL_TIMES    — how many times to kill (default: 1 when KILL_AFTER set,
//                   else 0); use KILL_TIMES=2 to force two reconnects
const http = require('http');
const { Server } = require('socket.io');
const ss = require('socket.io-stream');

const server = http.createServer();
const io = new Server(server, { /* default EIO4 */ });

const STDOUT = Buffer.from(process.env.SCRIPT_STDOUT || '');
const EXIT_CODE = Number(process.env.EXIT_CODE || 0);
const EXIT_MESSAGE = process.env.EXIT_MESSAGE || '';
const KILL_AFTER = process.env.KILL_AFTER ? Number(process.env.KILL_AFTER) : -1;

// Default KILL_TIMES to 1 when KILL_AFTER is set and KILL_TIMES is not
// explicitly provided, so the existing single-kill test is unaffected.
let killsRemaining = KILL_AFTER >= 0
  ? (process.env.KILL_TIMES !== undefined ? Number(process.env.KILL_TIMES) : 1)
  : 0;

io.of('/wp-cli').on('connection', socket => {
  ss(socket).on('cmd', (data, stdinStream, stdoutStream) => {
    const offset = data.offset || 0;
    let slice = STDOUT.slice(offset);

    if (KILL_AFTER >= 0 && killsRemaining > 0 && slice.length > KILL_AFTER) {
      killsRemaining--;
      stdoutStream.write(slice.slice(0, KILL_AFTER));
      // Drop the connection mid-stream to force a Go-side reconnect+resume.
      setImmediate(() => socket.client.conn.close());
      return;
    }

    stdoutStream.end(slice);
    // Drain any stdin the client sends (echo not required for these tests).
    stdinStream.resume();
    stdoutStream.on('end', () => {
      socket.emit('exit', { exitCode: EXIT_CODE, message: EXIT_MESSAGE });
    });
  });
});

server.listen(Number(process.env.PORT), '127.0.0.1', () => {
  process.stdout.write('LISTENING\n'); // handshake for the Go test
});
