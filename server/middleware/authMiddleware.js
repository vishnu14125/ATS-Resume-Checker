const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const token = req.header('Authorization')?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Access denied. No token provided.'
      }
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (ex) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid token.'
      }
    });
  }
}

function optionalAuth(req, res, next) {
  const token = req.header('Authorization')?.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    } catch (ex) {
      // ignore
    }
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
