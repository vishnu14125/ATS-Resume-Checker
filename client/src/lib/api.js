import axios from 'axios';

/** Authorization header for the signed-in user. */
export const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

/** The most specific message in the API's error envelope, or a fallback. */
export const errorMessage = (error, fallback) => {
  const envelope = error.response?.data?.error;
  return envelope?.details?.issues?.[0]?.message || envelope?.message || fallback;
};

/** Both auth endpoints resolve with the access token. */
export const loginUser = async (credentials) => (await axios.post('/api/v1/auth/login', credentials)).data.data.accessToken;

export const registerUser = async (details) => (await axios.post('/api/v1/auth/register', details)).data.data.accessToken;

/** The signed-in user: { id, name, email }. */
export const getMe = async () => (await axios.get('/api/v1/me', { headers: authHeaders() })).data.data.user;

export const listAnalyses = async () => (await axios.get('/api/v1/analyses', { params: { limit: 50 }, headers: authHeaders() })).data.data.items;

export const getAnalysis = async (id) => (await axios.get(`/api/v1/analyses/${id}`, { headers: authHeaders() })).data.data.analysis;

export const deleteAnalysis = (id) => axios.delete(`/api/v1/analyses/${id}`, { headers: authHeaders() });

/** Sends the resume as a file or as text, with an optional pasted job description. */
export const createAnalysis = async ({ resumeFile, resumeText, jobText }) => {
  const form = new FormData();
  if (resumeFile) form.append('resume', resumeFile);
  else form.append('resumeText', resumeText);
  if (jobText && jobText.trim()) form.append('jobText', jobText);
  return (await axios.post('/api/v1/analyses', form, { headers: authHeaders() })).data.data.analysis;
};

/** Runs (or returns the stored result of) one AI task. Always resolves with a task status. */
export const runAiTask = async (id, task, regenerate = false) =>
  (await axios.post(`/api/v1/analyses/${id}/ai`, { task, regenerate }, { headers: authHeaders() })).data.data.ai;
