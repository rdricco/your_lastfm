function errorHandler(err, req, res, next) {
  console.error("🔥 Global Error Handler:", err);

  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    error: message,
    // Only show stack trace in dev mode if needed, but for now we keep it simple
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

module.exports = errorHandler;
