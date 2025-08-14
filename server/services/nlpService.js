const natural = require('natural');
const stopwords = require('stopword');

const tokenizer = new natural.WordTokenizer();

function extractKeywords(text, maxKeywords = 30) {
  try {
    const cleanedText = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const tokens = tokenizer.tokenize(cleanedText);
    const filteredTokens = stopwords.removeStopwords(tokens);
    
    const wordFreq = {};
    filteredTokens.forEach(token => {
      if (token.length > 2) {
        wordFreq[token] = (wordFreq[token] || 0) + 1;
      }
    });

    return Object.entries(wordFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, maxKeywords)
      .map(([word]) => word);

  } catch (error) {
    console.error('Keyword extraction error:', error);
    return extractBasicKeywords(text, maxKeywords);
  }
}

function extractBasicKeywords(text, maxKeywords = 20) {
  const cleanedText = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = tokenizer.tokenize(cleanedText);
  const filteredTokens = stopwords.removeStopwords(tokens);
  
  const wordFreq = {};
  filteredTokens.forEach(token => {
    if (token.length > 2) {
      wordFreq[token] = (wordFreq[token] || 0) + 1;
    }
  });

  return Object.entries(wordFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

module.exports = {
  extractKeywords
};
