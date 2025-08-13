/**
 * Validate analysis request
 */
function validateAnalysisRequest(req, res, next) {
  const { resumeText, jobDescription } = req.body;

  // Check if required fields exist
  if (!resumeText || !jobDescription) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'Both resume text and job description are required'
    });
  }

  // Validate text lengths
  if (typeof resumeText !== 'string' || resumeText.trim().length < 50) {
    return res.status(400).json({
      error: 'Invalid resume text',
      message: 'Resume text must be at least 50 characters long'
    });
  }

  if (typeof jobDescription !== 'string' || jobDescription.trim().length < 20) {
    return res.status(400).json({
      error: 'Invalid job description',
      message: 'Job description must be at least 20 characters long'
    });
  }

  next();
}

module.exports = {
  validateAnalysisRequest
};
