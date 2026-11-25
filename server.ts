import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize GoogleGenAI instance if API key is present
const geminiApiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;

if (geminiApiKey) {
  aiClient = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// API Health & Status check
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    appName: 'StudySphere',
    hasApiKey: !!geminiApiKey,
    timestamp: new Date().toISOString(),
  });
});

// 1. AI Tutor Endpoint
app.post('/api/gemini/tutor', async (req, res) => {
  try {
    const { message, style = 'detailed', subject = 'General', history = [], educationLevel = 'University' } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!aiClient) {
      // High-fidelity fallback tutor response if key is not yet set
      const fallbackResponses: Record<string, string> = {
        socratic: `That's an insightful question about ${subject}! Before diving straight into the conclusion, let's break it down together.\n\n1. What do you already know about the core mechanism here?\n2. What would happen if one of the foundational variables increased or decreased?\n\nThink about this step, and tell me what you deduce!`,
        simple: `Here is the key idea explained simply for ${subject} (${educationLevel} level):\n\nImagine ${subject} concepts like building blocks. When you have "${message}", the fundamental principle is that each component relies on balance and energy flow. In short: it works by connecting cause and effect in a structured cycle!\n\nWould you like a real-world analogy?`,
        exam_prep: `### High-Yield Exam Summary: ${subject}\n\n**Core Concept Target:** ${message}\n\n1. **Key Definition:** Crucial term tested on standard exams.\n2. **High-Yield Formula / Mechanism:** Step 1 -> Step 2 -> Step 3.\n3. **Common Trap:** Examiners frequently try to confuse this with the inverse relationship.\n4. **Quick Check Question:** If condition X changes, what is the immediate impact?`,
        detailed: `Here is a structured explanation for **${subject}** (${educationLevel} level):\n\n### Concept Breakdown\n${message} is a central topic because it integrates fundamental theories with practical problem-solving.\n\n### Step-by-Step Walkthrough\n1. **Foundations**: Establish the key variables and assumptions.\n2. **Mechanics**: Trace how inputs transform into outputs.\n3. **Application**: Apply this in realistic problem sets.\n\n*Tip: Connect this concept with your notes for rapid retention!*`,
      };

      const reply = fallbackResponses[style] || fallbackResponses.detailed;
      return res.json({
        reply: `${reply}\n\n*(Note: Live Gemini model will be engaged when GEMINI_API_KEY secret is configured.)*`,
        isFallback: true,
      });
    }

    // Build system instructions based on style
    let styleInstruction = 'Provide clear, encouraging, step-by-step academic guidance.';
    if (style === 'socratic') {
      styleInstruction = 'You are a Socratic tutor. Do NOT immediately reveal answers. Instead, ask guiding questions, prompt the student to think through the steps, and nurture their deduction skills.';
    } else if (style === 'simple') {
      styleInstruction = 'Explain the topic simply, using everyday analogies, minimal jargon, and intuitive examples suitable for quick grasp.';
    } else if (style === 'exam_prep') {
      styleInstruction = 'Format your answer like a top exam revision sheet: highlight high-yield facts, common exam traps, key formulas/definitions, and provide a 1-question practice check.';
    } else if (style === 'detailed') {
      styleInstruction = 'Provide a thorough, university-grade academic breakdown with definitions, mechanisms, real-world examples, and study advice.';
    }

    const systemInstruction = `You are StudySphere AI, a premier AI tutor designed for students at the ${educationLevel} level studying ${subject}.
${styleInstruction}
Keep the formatting clean using markdown headings, bullet points, and bold terms where helpful. Be supportive and intellectually rigorous.`;

    // Construct conversation payload
    const formattedContents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    // Append up to last 6 history messages
    if (Array.isArray(history)) {
      const recentHistory = history.slice(-6);
      for (const h of recentHistory) {
        if (h.sender === 'user' && h.text) {
          formattedContents.push({ role: 'user', parts: [{ text: h.text }] });
        } else if (h.sender === 'ai' && h.text) {
          formattedContents.push({ role: 'model', parts: [{ text: h.text }] });
        }
      }
    }

    formattedContents.push({ role: 'user', parts: [{ text: message }] });

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: formattedContents,
      config: {
        systemInstruction,
        temperature: style === 'socratic' ? 0.7 : 0.4,
      },
    });

    const replyText = response.text || 'I processed your request, but received an empty response. Could you rephrase your question?';
    return res.json({ reply: replyText, isFallback: false });
  } catch (err: unknown) {
    console.error('Error in /api/gemini/tutor:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown AI error';
    return res.status(500).json({
      error: 'Failed to generate tutor response',
      details: errorMessage,
    });
  }
});

// 2. AI Notes Summary & Flashcard Extraction
app.post('/api/gemini/generate-notes-summary', async (req, res) => {
  try {
    const { noteTitle, noteContent, subject } = req.body;

    if (!noteContent) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    if (!aiClient) {
      // Fallback summary
      return res.json({
        summary: `### Executive Summary: ${noteTitle || 'Study Notes'}\nThese notes focus on core principles of ${subject || 'the curriculum'}. Key concepts revolve around foundational definitions, structural mechanisms, and applied problem solving.\n\n**Key Takeaways:**\n- Core understanding of principles\n- Systematic analysis of related topics\n- Direct relevance for upcoming exams`,
        keyPoints: [
          'Master the fundamental definitions',
          'Review the sequence of actions and relationships',
          'Practice active recall before the test',
        ],
        flashcards: [
          { question: `What is the primary focus of "${noteTitle || 'this topic'}"?`, answer: 'The fundamental mechanisms and their applications in problem sets.' },
          { question: `How should one apply these concepts in examinations?`, answer: 'By structuring answers systematically and avoiding common misconceptions.' },
        ],
        isFallback: true,
      });
    }

    const prompt = `Analyze the following student study notes for the subject "${subject || 'General'}" with title "${noteTitle || 'Untitled'}":

---
${noteContent.slice(0, 4000)}
---

Generate a response in JSON format with this exact structure:
{
  "summary": "A concise, well-structured 2-paragraph summary in markdown with bullet points",
  "keyPoints": ["Key takeaway 1", "Key takeaway 2", "Key takeaway 3", "Key takeaway 4"],
  "flashcards": [
    {"question": "Front of card question", "answer": "Back of card concise answer"},
    {"question": "Front of card question 2", "answer": "Back of card concise answer 2"},
    {"question": "Front of card question 3", "answer": "Back of card concise answer 3"}
  ]
}`;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ ...parsed, isFallback: false });
  } catch (err: unknown) {
    console.error('Error in /api/gemini/generate-notes-summary:', err);
    return res.status(500).json({ error: 'Failed to summarize notes' });
  }
});

// 3. AI Quiz Generator
app.post('/api/gemini/generate-quiz', async (req, res) => {
  try {
    const { topic, difficulty = 'medium', count = 5, subject = 'General' } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    if (!aiClient) {
      return res.json({
        topic,
        questions: [
          {
            id: 'q1',
            question: `In ${subject}, what is the foundational principle underlying ${topic}?`,
            options: [
              'System equilibrium and continuous feedback',
              'Static independent variables',
              'Discontinuous entropy collapse',
              'Random uncoordinated reactions'
            ],
            correctIndex: 0,
            explanation: 'Systems maintain stability through continuous equilibrium and feedback mechanisms.',
          },
          {
            id: 'q2',
            question: `Which approach is most effective when preparing for an exam on ${topic}?`,
            options: [
              'Passive reading the night before',
              'Spaced repetition and active retrieval practice',
              'Memorizing answers without context',
              'Skipping foundational definitions'
            ],
            correctIndex: 1,
            explanation: 'Spaced repetition and active retrieval drastically enhance long-term memory consolidation.',
          },
          {
            id: 'q3',
            question: `What is a common pitfall students encounter with ${topic}?`,
            options: [
              'Confusing correlation with causation',
              'Studying too early',
              'Taking organized digital notes',
              'Reviewing formulas multiple times'
            ],
            correctIndex: 0,
            explanation: 'A frequent error is assuming that two correlated phenomena directly cause one another without verifying the mechanism.',
          }
        ],
        isFallback: true,
      });
    }

    const prompt = `Generate a ${count}-question multiple-choice quiz on the topic "${topic}" in "${subject}". Difficulty: ${difficulty}.
Return ONLY JSON format adhering to:
{
  "topic": "${topic}",
  "questions": [
    {
      "id": "q1",
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Clear explanation of why this answer is correct and why other options are incorrect."
    }
  ]
}`;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ ...parsed, isFallback: false });
  } catch (err: unknown) {
    console.error('Error in /api/gemini/generate-quiz:', err);
    return res.status(500).json({ error: 'Failed to generate quiz' });
  }
});

// 4. AI Study Timetable Generator
app.post('/api/gemini/generate-study-plan', async (req, res) => {
  try {
    const { subjects = [], dailyHours = 3, exams = [], targetGoal = 'Top Grades' } = req.body;

    if (!aiClient) {
      return res.json({
        planTitle: 'Optimized High-Performance Study Schedule',
        strategy: `Focused ${dailyHours} hours/day timetable balanced across ${subjects.join(', ') || 'core subjects'}, prioritizing upcoming exam targets.`,
        blocks: [
          { day: 'Monday', focus: subjects[0] || 'Mathematics', duration: '90 mins', activity: 'Concept mastery & textbook problem sets', priority: 'High' },
          { day: 'Monday', focus: subjects[1] || 'Sciences', duration: '60 mins', activity: 'Active recall flashcards & formula sheet', priority: 'Medium' },
          { day: 'Tuesday', focus: subjects[1] || 'Sciences', duration: '90 mins', activity: 'Deep dive into weak topics & past paper questions', priority: 'High' },
          { day: 'Wednesday', focus: subjects[2] || 'Humanities / Coding', duration: '90 mins', activity: 'Essay drafting / project implementation', priority: 'Medium' },
          { day: 'Thursday', focus: subjects[0] || 'Mathematics', duration: '90 mins', activity: 'Timed practice exam section', priority: 'High' },
          { day: 'Friday', focus: 'All Subjects', duration: '60 mins', activity: 'Weekly review & spaced repetition backlog catchup', priority: 'Medium' },
          { day: 'Saturday', focus: 'Exam Simulation', duration: '120 mins', activity: 'Full mock examination under timed conditions', priority: 'High' },
          { day: 'Sunday', focus: 'Rest & Strategic Planning', duration: '45 mins', activity: 'Weekly reflection & setting upcoming goals', priority: 'Low' },
        ],
        recommendations: [
          'Use 25-minute Pomodoro intervals with 5-minute movement breaks',
          'Tackle the most cognitively demanding subject first in your daily block',
          'Review flashcards during transition times or early morning',
        ],
        isFallback: true,
      });
    }

    const prompt = `Create a realistic, scientifically optimized study timetable for a student with these parameters:
- Subjects: ${JSON.stringify(subjects)}
- Daily Available Hours: ${dailyHours} hours
- Upcoming Deadlines / Exams: ${JSON.stringify(exams)}
- Target Goal: ${targetGoal}

Return JSON with this schema:
{
  "planTitle": "string",
  "strategy": "concise description of the cognitive strategy",
  "blocks": [
    {
      "day": "Monday / Tuesday etc.",
      "focus": "Subject name",
      "duration": "e.g. 60 mins",
      "activity": "Specific actionable revision task",
      "priority": "High | Medium | Low"
    }
  ],
  "recommendations": ["Tip 1", "Tip 2", "Tip 3"]
}`;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ ...parsed, isFallback: false });
  } catch (err: unknown) {
    console.error('Error in /api/gemini/generate-study-plan:', err);
    return res.status(500).json({ error: 'Failed to generate study plan' });
  }
});

// Configure Vite middleware in development or serve static in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    // Dynamic import vite in dev
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`StudySphere server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
