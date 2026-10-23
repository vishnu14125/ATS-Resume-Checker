const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');

const { createLogger } = require('./shared/logger');
const { requestContext } = require('./api/middleware/requestContext');
const { createRateLimiter } = require('./api/middleware/rateLimit');
const { createAuthenticate } = require('./api/middleware/authenticate');
const { createErrorHandler, notFoundHandler } = require('./api/middleware/errorHandler');
const { createHealthRouter } = require('./api/health.routes');
const { createV1Router } = require('./api/v1');
const { createTokenService } = require('./application/auth/tokenService');
const { createAuthService } = require('./application/auth/authService');
const { createUserRepository } = require('./infrastructure/repositories/userRepository');
const { createAnalysisRunner } = require('./application/analysis/runAnalysis');
const { createAnalysisService } = require('./application/analysis/analysisService');
const { createAnalysisRepository } = require('./infrastructure/repositories/analysisRepository');
const { createGroundedAiService } = require('./application/ai/groundedAiService');
const { createAiProvider } = require('./infrastructure/ai/createAiProvider');
const { isDatabaseReady } = require('./infrastructure/db/connection');

/**
 * Builds the Express application without listening or connecting to the
 * database, so tests can exercise the real middleware stack.
 *
 * @param {{ config: object, logger?: object, overrides?: object }} options
 */
function createApp({ config, logger = createLogger({ level: config.logLevel }), overrides = {} }) {
  const tokenService = overrides.tokenService || createTokenService({ secret: config.auth.jwtSecret, expiresIn: config.auth.jwtExpiresIn });
  const userRepository = overrides.userRepository || createUserRepository();
  const authService = overrides.authService || createAuthService({ userRepository, tokenService });
  const analysisRepository = overrides.analysisRepository || createAnalysisRepository();

  // AI is an optional edge service: `aiProvider` is null when it is not configured,
  // and the analysis runner is built without it, so analysis can never depend on AI.
  const aiProvider = overrides.aiProvider !== undefined ? overrides.aiProvider : createAiProvider(config.ai);
  const aiService = overrides.aiService || createGroundedAiService({
    provider: aiProvider,
    analysisRepository,
    logger,
    limits: { maxOutputTokens: config.ai.maxOutputTokens },
  });
  const analysisService = overrides.analysisService || createAnalysisService({
    runAnalysis: overrides.runAnalysis || createAnalysisRunner(),
    analysisRepository,
    describeAi: aiService.describe,
  });
  const deps = {
    authService,
    analysisService,
    aiService,
    authenticate: createAuthenticate(tokenService),
    authRateLimiter: createRateLimiter(config.rateLimits.auth),
    analysisRateLimiter: createRateLimiter(config.rateLimits.analysis),
    aiRateLimiter: createRateLimiter(config.rateLimits.ai),
  };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.http.trustProxy);

  app.use(requestContext(logger));
  app.use(helmet());
  app.use(compression());
  app.use(cors({ origin: [...config.http.corsOrigins], credentials: true }));
  app.use(express.json({ limit: config.http.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: config.http.jsonBodyLimit }));
  app.use('/api/', createRateLimiter(config.rateLimits.global));

  app.use('/api/health', createHealthRouter({ isDatabaseReady: overrides.isDatabaseReady || isDatabaseReady }));
  app.use('/api/v1', createV1Router(deps));

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger, exposeDebug: config.env === 'development' }));
  return app;
}

module.exports = { createApp };
