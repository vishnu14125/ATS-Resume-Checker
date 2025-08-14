const natural = require('natural');
const stopwords = require('stopword');
const OpenAI = require('openai');

const tokenizer = new natural.WordTokenizer();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function extractKeywords(text, maxKeywords = 30) {
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

    const sortedKeywords = Object.entries(wordFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, maxKeywords)
      .map(([word]) => word);

    return await enhanceKeywordsWithAI(text, sortedKeywords.slice(0, 15));
  } catch (error) {
    console.error('Keyword extraction error:', error);
    return extractBasicKeywords(text, maxKeywords);
  }
}

async function enhanceKeywordsWithAI(text, basicKeywords) {
  try {
    const prompt = `
Extract the most important professional keywords and skills from this text. Focus on:
- Technical skills and technologies
- Professional competencies
- Industry-specific terms
- Action verbs and achievements

Text: ${text.substring(0, 1500)}

Current keywords: ${basicKeywords.join(', ')}

Return only the most relevant keywords as a JSON array, maximum 20 items:
["keyword1", "keyword2", "keyword3"]
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 300
    });

    const response = completion.choices[0].message.content;
    try {
      const enhancedKeywords = JSON.parse(response);
      return Array.isArray(enhancedKeywords) ? enhancedKeywords : basicKeywords;
    } catch {
      return basicKeywords;
    }
  } catch (error) {
    console.error('AI keyword enhancement error:', error);
    return basicKeywords;
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
