import ProxyAgent from 'socks-proxy-agent';

export default function createSocksProxyAgent() {
    if ( ! process.env.hasOwnProperty( 'VIP_PROXY' ) ) {
        return null;
    }
    
    return new ProxyAgent( process.env.VIP_PROXY );
}