// Vercel loads this function; the build bundles the existing Express app below.
module.exports = require('../deployment/api-bundle.cjs').default;
