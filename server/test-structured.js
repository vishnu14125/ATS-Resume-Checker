require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({});

async function test() {
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: 'Return {"status": "OK"} in JSON.',
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    });
    console.log('JSON RESPONSE:', res.text);
  } catch (e) {
    console.error(e);
  }
}
test();
