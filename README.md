# 🧠 AI-Powered ATS Resume Checker

An intelligent resume analysis tool designed to evaluate resumes against job descriptions using AI. It offers ATS (Applicant Tracking System) compliance checks, keyword optimization, section validation, and a downloadable feedback report — helping job seekers craft powerful, tailored resumes.

---

## ✨ What This Project Does

- 🔍 Upload your resume and job description
- 🤖 Uses AI to analyze semantic and keyword match
- 📊 Produces a section-by-section breakdown (skills, education, experience, etc.)
- ✅ Checks ATS-friendly formatting and structure
- 💡 Suggests improvements for better job alignment
- 📥 Allows exporting feedback as a professional PDF report

---

## 🚀 Features in Detail

### 📁 Resume Analysis
- Parses `.pdf`, `.docx`, and `.txt` files
- Converts to plain text while preserving logical sections

### 💼 Job Description Matching
- Compares resume against JD using AI embeddings
- Identifies skill match, missing skills, and relevance

### 🔍 Keyword Intelligence
- Shows matched and missing keywords in separate buckets
- Detects action verbs and job-specific terms

### 📐 Structure Validation
- Checks for presence of key sections:
  - Objective / Summary
  - Education
  - Experience
  - Projects
  - Skills
- Flags common formatting issues that hurt ATS readability

### 📑 PDF Report Export
- Section-wise score breakdown
- Lists matched vs. missing keywords
- Suggestions and final verdict
- Exportable with 1-click

---

## ⚙️ Tech Stack

### Frontend
- ✅ React.js
- 🎨 Tailwind CSS
- 🎞 Framer Motion
- 📤 React Dropzone (File Upload)
- 🔄 Axios (API calls)

### Backend
- 🧠 Groq API (for LLM & Embedding-based comparisons)
- 📝 Express.js
- 🗃️ MongoDB with Mongoose
- 🧾 PDF kit (for exporting analysis report)
- 🌐 CORS / Middleware / Logging

---

## 🔑 Why Groq?

Groq delivers ultra-fast inference with OpenAI-compatible APIs. This project leverages:
- `gpt-4-turbo` via Groq for faster semantic matching
- Compatibility with OpenAI-style embeddings
- Seamless backend switch without API redesign

> 💡 Example endpoint: `https://api.groq.com/openai/v1/chat/completions`

---

## 🛠 Local Setup Guide

### 1. 📦 Clone and Install
```bash
git clone https://github.com/yourusername/ats-resume-checker.git
cd ats-resume-checker
npm run install-all   # Installs both client and server dependencies
