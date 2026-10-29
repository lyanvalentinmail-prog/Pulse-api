// Conserva los hosts de la petición para reconocer nuestras propias subidas sin
// volver a pedirlas por red ni abrir acceso a URLs internas arbitrarias.
const { AsyncLocalStorage } = require('async_hooks');
const storage = new AsyncLocalStorage();

function requestContext(req, res, next) {
  const hosts = [req.get('host'), String(req.headers['x-forwarded-host'] || '').split(',')[0].trim()]
    .filter(Boolean).map(host => host.toLowerCase());
  storage.run({ hosts }, next);
}

module.exports = { requestContext, currentRequest: () => storage.getStore() };
