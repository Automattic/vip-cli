import { fetch, MockAgent, setGlobalDispatcher } from 'undici';

process.env.API_HOST = 'http://localhost:4000';

delete process.env.VIP_PROXY;
delete process.env.vip_proxy;
delete process.env.SOCKS_PROXY;
delete process.env.socks_proxy;
delete process.env.HTTPS_PROXY;
delete process.env.https_proxy;
delete process.env.HTTP_PROXY;
delete process.env.http_proxy;
delete process.env.ALL_PROXY;
delete process.env.all_proxy;
delete process.env.NO_PROXY;
delete process.env.no_proxy;
delete process.env.VIP_USE_SYSTEM_PROXY;

// Don't let tests talk to the outside world for undici-backed fetch.
const mockAgent = new MockAgent();
mockAgent.disableNetConnect();
setGlobalDispatcher( mockAgent );
globalThis.fetch = fetch;

global.__UNDICI_MOCK_AGENT__ = mockAgent;
