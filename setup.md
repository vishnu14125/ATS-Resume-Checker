# ATS Resume Checker - Setup Guide

## ✨ Quick Start

### Prerequisites

* Node.js (v16 or higher)
* npm or yarn
* **Groq API Key** (instead of OpenAI)

### 1. Clone the Repository & Install Dependencies

```bash
# Clone the repository
git clone <your-repo-url>
cd ats-resume-checker

# Install all dependencies
npm run install-all
```

### 2. Environment Configuration

```bash
# Copy environment file
type env.example > server/.env

# Edit .env and add your Groq API key
# GROQ_API_KEY=your_groq_api_key_here
# GROQ_MODEL=gpt-4-turbo
```

### 3. Get Groq API Key

1. Go to [Groq Console](https://console.groq.com)
2. Sign up or log in
3. Generate a new API key
4. Paste it in your `.env` file under `server/`

### 4. Start Development Servers

```bash
# Run both client and server
npm run dev
```

Access URLs:

* Frontend: [http://localhost:3000](http://localhost:3000)
* Backend: [http://localhost:5000](http://localhost:5000)

---

## 📁 Project Structure

```
ats-resume-checker/
├── client/                 # React frontend
│   ├── public/
│   ├── components/         # Reusable components
│   ├── pages/              # Page components
│   ├── App.js              # Main app component
│   └── index.js            # Entry point
│   ├── tailwind.config.js
│   └── package.json
├── server/                 # Node.js backend
│   ├── routes/             # API endpoints
│   ├── services/           # Business logic
│   ├── middleware/         # Auth & error handlers
│   ├── index.js            # Server entry point
│   └── package.json
├── README.md
├── setup.md
├── package.json            # Root config (if used)
└── .env (ignored)          # Environment variables
```

---

## 🔧 Environment Variables

| Variable       | Description                         | Required |
| -------------- | ----------------------------------- | -------- |
| `GROQ_API_KEY` | Groq API key                        | Yes      |
| `GROQ_MODEL`   | Model to use (e.g., gpt-4-turbo)    | Yes      |
| `PORT`         | Backend server port (default: 5000) | No       |
| `CLIENT_URL`   | URL for frontend (CORS support)     | No       |

---

## 🛠️ Development Commands

### At Project Root

```bash
npm run dev           # Run both client and server
npm run install-all   # Install dependencies for all
npm run server        # Start backend only
npm run client        # Start frontend only
```

### Frontend (`client/`)

```bash
npm start             # Start dev server
npm run build         # Build for production
```

### Backend (`server/`)

```bash
npm run dev           # Dev mode with nodemon
npm start             # Start production server
```

---

## 🔮 Core API Endpoints

| Method | Endpoint                        | Description                  |
| ------ | ------------------------------- | ---------------------------- |
| GET    | `/api/health`                   | Health check                 |
| POST   | `/api/upload`                   | Upload resume file           |
| POST   | `/api/analyze`                  | Analyze resume vs JD         |
| GET    | `/api/upload/supported-formats` | Fetch allowed upload formats |

---

## 📊 Example Analyze API

**POST** `/api/analyze`

Request:

```json
{
  "resumeText": "Your resume text...",
  "jobDescription": "JD text...",
  "fileName": "resume.pdf"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "overallScore": 85,
    "breakdown": {
      "atsCompatibility": 90,
      "keywordMatch": 85,
      "contentQuality": 80,
      "sectionCompleteness": 95,
      "overallReadability": 88
    },
    "keywordAnalysis": {
      "matched": ["javascript", "react"],
      "missing": ["python", "django"]
    },
    "structureAnalysis": {
      "sections": {
        "contact": true,
        "summary": true,
        "experience": true,
        "education": true,
        "skills": true
      },
      "issues": [],
      "recommendations": []
    },
    "aiSuggestions": {
      "general": ["Add quantifiable achievements"],
      "specific": ["Include Python experience"],
      "actionVerbs": ["Implemented", "Led"],
      "powerPhrases": ["Reduced processing time by 30%"]
    }
  }
}
```

---

## 🚪 Deployment

### Frontend (Netlify / Vercel)

```bash
cd client
npm run build
# Deploy /build directory
```

### Backend (Railway / Render / Cyclic)

```bash
cd server
npm start
```

Set the following variables on your deployment dashboard:

* `GROQ_API_KEY`
* `GROQ_MODEL=gpt-4-turbo`
* `NODE_ENV=production`
* `CLIENT_URL` = your frontend deployed URL

---

## 🛡️ Troubleshooting

| Issue               | Solution                                        |
| ------------------- | ----------------------------------------------- |
| API key errors      | Double-check your Groq API key & permissions    |
| CORS error          | Confirm `CLIENT_URL` is set correctly in `.env` |
| Resume upload fails | Use supported file types under 10MB             |
| Server not starting | Check if port 5000 is available                 |

---

## 📂 Contributing

1. Fork the project
2. Create a feature branch
3. Make your changes
4. Push and open a PR

---

## 📄 License

MIT License — see LICENSE file for details.
