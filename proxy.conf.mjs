// `ng serve` proxy. Both routes forward only to start.gg's website GraphQL endpoint.
const startggHeaders = { Origin: 'https://www.start.gg', Referer: 'https://www.start.gg/' };

export default {
  // Token-less experimental reads.
  '/sgg-public': {
    target: 'https://www.start.gg',
    secure: true,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/sgg-public/, '/api/-/gql'),
    headers: startggHeaders,
  },
  // Attendee admin (add / rename / remove): the app sends the website session in X-Startgg-Session, and the
  // browser cannot set Cookie itself, so it is turned into the gg_session cookie here. Nothing is logged.
  '/sgg-web': {
    target: 'https://www.start.gg',
    secure: true,
    changeOrigin: true,
    rewrite: () => '/api/-/gql',
    headers: startggHeaders,
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq, req) => {
        const session = req.headers['x-startgg-session'];
        proxyReq.removeHeader('x-startgg-session');
        proxyReq.removeHeader('cookie');
        if (typeof session === 'string' && /^[\w.%-]+$/.test(session)) {
          proxyReq.setHeader('cookie', `gg_session=${session}`);
        }
      });
    },
  },
};
