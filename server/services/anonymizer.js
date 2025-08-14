function anonymizeResume(text) {
  return text
    .replace(/([A-Z][a-z]+ [A-Z][a-z]+)/g, '[NAME]') // names
    .replace(/\b(male|female|he|she|his|her|mr|mrs|ms)\b/gi, '[GENDER]') // gender
    .replace(/[\w\.-]+@[\w\.-]+/g, '[EMAIL]') // email
    .replace(/\+?[0-9]{7,}/g, '[PHONE]'); // phone
}

module.exports = anonymizeResume;