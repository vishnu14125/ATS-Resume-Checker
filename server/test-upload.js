const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

async function testPipeline() {
  try {
    const ts = Date.now();
    console.log('1. Registering...');
    const registerRes = await axios.post('http://127.0.0.1:5000/api/auth/signup', {
      name: `Test User ${ts}`,
      email: `test${ts}@example.com`,
      password: 'password123'
    });
    const token = registerRes.data.data.token;
    console.log('Registered successfully! Token:', token.slice(0, 15) + '...');

    console.log('2. Uploading dummy.pdf...');
    const form = new FormData();
    form.append('resume', fs.createReadStream('dummy.pdf'));

    // Note: form.getHeaders() provides the boundary to axios!
    const uploadRes = await axios.post('http://127.0.0.1:5000/api/upload', form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`
      }
    });
    console.log('Upload successful! Extracted text:', uploadRes.data.data.text);
    
    console.log('3. Analyzing...');
    const analyzeRes = await axios.post('http://127.0.0.1:5000/api/analyze', {
      resumeText: uploadRes.data.data.text,
      jobDescription: 'Looking for a software engineer with React and Node.js.',
      fileName: 'test-resume.txt'
    }, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    console.log('Analysis successful! Mongo ID:', analyzeRes.data.data.id);
  } catch (error) {
    console.error('Error in pipeline:', error.response ? error.response.data : error.message);
  }
}
testPipeline();
