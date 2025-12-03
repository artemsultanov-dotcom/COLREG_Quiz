import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI, Type } from "@google/genai";

// Define the interface for our Quiz Question
interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

// Define the interface for User Profile
interface UserProfile {
  name: string;
  rank: string;
  vessel: string;
}

// Global definition for jsPDF loaded via CDN
declare global {
  interface Window {
    jspdf: any;
  }
}

// CLdN Logo Component
const CldnLogo = ({ className = "h-12" }: { className?: string }) => (
  <svg viewBox="0 0 200 80" className={className} xmlns="http://www.w3.org/2000/svg">
    <text x="10" y="60" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="60" fill="#003366" letterSpacing="-2">CLdN</text>
  </svg>
);

const App = () => {
  const [step, setStep] = useState<"profile" | "loading" | "quiz" | "results">("profile");
  const [profile, setProfile] = useState<UserProfile>({ name: "", rank: "", vessel: "" });
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]); // Stores user's selected indices
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(600); // 600 seconds = 10 minutes

  // Initialize GenAI
  // Note: apiKey is injected via process.env.API_KEY
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Timer Logic
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (step === "quiz" && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (step === "quiz" && timeLeft === 0) {
      // Time is up, complete the test
      setStep("results");
    }
    return () => clearInterval(timer);
  }, [step, timeLeft]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.name || !profile.rank || !profile.vessel) {
      setError("Please fill in all fields.");
      return;
    }
    setError(null);
    setStep("loading");
    await generateQuiz();
  };

  const generateQuiz = async () => {
    try {
      const model = "gemini-2.5-flash";
      const prompt = `Generate 10 challenging multiple-choice questions based on the International Regulations for Preventing Collisions at Sea (COLREGs). 
      Focus on practical scenarios involving lights, shapes, sound signals, and steering/sailing rules between vessels.
      Each question must have exactly 4 options, with only 1 correct answer.
      Provide a brief explanation for the correct answer citing the relevant Rule if possible.`;

      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                correctAnswerIndex: { 
                  type: Type.INTEGER, 
                  description: "Zero-based index of the correct option (0, 1, 2, or 3)" 
                },
                explanation: { type: Type.STRING }
              },
              required: ["question", "options", "correctAnswerIndex", "explanation"],
            },
          },
        },
      });

      if (response.text) {
        const generatedQuestions = JSON.parse(response.text);
        setQuestions(generatedQuestions);
        setTimeLeft(600); // Reset timer to 10 minutes
        setStep("quiz");
      } else {
        throw new Error("No data returned from AI");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to generate quiz. Please try again or check your connection.");
      setStep("profile");
    }
  };

  const handleAnswer = (optionIndex: number) => {
    const newAnswers = [...answers, optionIndex];
    setAnswers(newAnswers);

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      setStep("results");
    }
  };

  const calculateScore = () => {
    let score = 0;
    questions.forEach((q, i) => {
      // Check if user answered (index exists in answers array) and if it's correct
      if (answers[i] !== undefined && answers[i] === q.correctAnswerIndex) score++;
    });
    return score;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const generatePDF = () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const score = calculateScore();
    const total = questions.length;
    const date = new Date().toLocaleDateString();

    // -- Header / Letterhead --
    
    // CLdN Logo (simulated with text for PDF reliability)
    doc.setTextColor(0, 51, 102); // Navy Blue
    doc.setFont("helvetica", "bold");
    doc.setFontSize(40);
    doc.text("CLdN", 15, 25);
    
    // Title
    doc.setFontSize(22);
    doc.setTextColor(0, 51, 102);
    doc.text("COLREGs Competency Report", 200, 25, { align: "right" });
    
    // Separator Line
    doc.setDrawColor(0, 51, 102);
    doc.setLineWidth(1);
    doc.line(15, 35, 200, 35);

    // User Details Box
    doc.setFillColor(245, 247, 250);
    doc.rect(15, 45, 185, 45, 'F');
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    
    doc.text(`Date:`, 25, 55);
    doc.setFont("helvetica", "bold");
    doc.text(date, 55, 55);
    
    doc.setFont("helvetica", "normal");
    doc.text(`Name:`, 25, 65);
    doc.setFont("helvetica", "bold");
    doc.text(profile.name, 55, 65);
    
    doc.setFont("helvetica", "normal");
    doc.text(`Rank:`, 25, 75);
    doc.setFont("helvetica", "bold");
    doc.text(profile.rank, 55, 75);
    
    doc.setFont("helvetica", "normal");
    doc.text(`Vessel:`, 25, 85);
    doc.setFont("helvetica", "bold");
    doc.text(profile.vessel, 55, 85);

    // Score Box
    doc.setFontSize(14);
    doc.setTextColor(0, 51, 102);
    doc.text(`Final Score: ${score} / ${total} (${Math.round((score/total)*100)}%)`, 130, 65);
    
    const passed = score >= 7;
    doc.setTextColor(passed ? 0 : 200, passed ? 128 : 0, 0); // Green or Red
    doc.setFontSize(16);
    doc.text(passed ? "RESULT: PASS" : "RESULT: FAIL", 130, 75);

    // Questions Review
    let yPos = 110;
    doc.setTextColor(0, 51, 102);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Detailed Assessment:", 15, 100);

    questions.forEach((q, i) => {
      // Check if page break is needed
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      const hasAnswered = answers[i] !== undefined;
      const isCorrect = hasAnswered && answers[i] === q.correctAnswerIndex;
      const userAnswer = hasAnswered ? q.options[answers[i]] : "No Answer (Time expired)";
      const correctAnswer = q.options[q.correctAnswerIndex];

      // Question Number
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      
      // Split long question text
      const splitQuestion = doc.splitTextToSize(`Q${i + 1}: ${q.question}`, 180);
      doc.text(splitQuestion, 15, yPos);
      yPos += (splitQuestion.length * 5) + 2;

      // Status
      doc.setFont("helvetica", "normal");
      doc.setTextColor(isCorrect ? 0 : 200, isCorrect ? 150 : 0, 0); // Green if correct, Red if wrong
      doc.text(isCorrect ? "Result: CORRECT" : "Result: INCORRECT", 15, yPos);
      yPos += 7;

      // Details
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(10);
      
      if (!isCorrect) {
        doc.text(`Your Answer: ${userAnswer}`, 15, yPos);
        yPos += 5;
      }
      doc.text(`Correct Answer: ${correctAnswer}`, 15, yPos);
      yPos += 6;

      // Explanation
      const splitExplanation = doc.splitTextToSize(`Note: ${q.explanation}`, 170);
      doc.setTextColor(100, 100, 100);
      doc.text(splitExplanation, 20, yPos);
      yPos += (splitExplanation.length * 4) + 10; // Extra spacing between questions
    });

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        doc.text("CLdN Competency Assurance System", 105, 290, { align: "center" });
    }

    doc.save(`${profile.name.replace(/\s+/g, '_')}_CLdN_COLREG_Report.pdf`);
  };

  const restartQuiz = () => {
    setStep("profile");
    setQuestions([]);
    setAnswers([]);
    setCurrentQuestionIndex(0);
    setError(null);
    setTimeLeft(600); // 10 minutes
  };

  // --- Render Components ---

  if (step === "profile") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full fade-in border-t-8 border-blue-900">
          <div className="flex flex-col items-center mb-8">
            <CldnLogo className="h-16 mb-4" />
            <h1 className="text-3xl font-bold text-gray-800">COLREGs Master</h1>
            <p className="text-gray-500 mt-2">Competency Assessment System</p>
          </div>
          
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input 
                type="text" 
                value={profile.name}
                onChange={(e) => setProfile({...profile, name: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-900 focus:outline-none"
                placeholder="e.g. John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rank</label>
              <input 
                type="text" 
                value={profile.rank}
                onChange={(e) => setProfile({...profile, rank: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-900 focus:outline-none"
                placeholder="e.g. Chief Officer"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vessel Name</label>
              <input 
                type="text" 
                value={profile.vessel}
                onChange={(e) => setProfile({...profile, vessel: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-900 focus:outline-none"
                placeholder="e.g. MV Pacific Star"
              />
            </div>

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800">
              <p><i className="fas fa-clock mr-2"></i><strong>Time Limit:</strong> 10 Minutes</p>
              <p><i className="fas fa-list-ol mr-2"></i><strong>Questions:</strong> 10 Scenarios</p>
            </div>

            <button 
              type="submit" 
              className="w-full bg-blue-900 hover:bg-blue-800 text-white font-bold py-3 rounded-lg transition duration-200 mt-4 shadow-lg"
            >
              Start Assessment
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (step === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-blue-50">
        <CldnLogo className="h-20 mb-8 opacity-50" />
        <div className="animate-spin text-blue-900 text-6xl mb-4">
          <i className="fas fa-compass"></i>
        </div>
        <h2 className="text-xl font-semibold text-blue-900">Generating Scenarios...</h2>
        <p className="text-gray-500 mt-2">Consulting Rule of the Road database</p>
      </div>
    );
  }

  if (step === "quiz" && questions.length > 0) {
    const question = questions[currentQuestionIndex];
    return (
      <div className="min-h-screen py-6 px-4 flex justify-center bg-gray-100">
        <div className="max-w-4xl w-full">
          {/* Header */}
          <div className="bg-white rounded-t-xl p-4 shadow-sm border-b flex justify-between items-center">
             <CldnLogo className="h-8" />
             <div className="flex items-center gap-4">
               <div className="text-right hidden sm:block">
                  <div className="text-sm font-bold text-gray-800">{profile.name}</div>
                  <div className="text-xs text-gray-500">{profile.rank} - {profile.vessel}</div>
               </div>
               <div className={`text-xl font-mono font-bold px-3 py-1 rounded ${timeLeft < 120 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-blue-50 text-blue-900'}`}>
                 {formatTime(timeLeft)}
               </div>
             </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 h-2">
            <div 
              className="bg-blue-900 h-2 transition-all duration-300"
              style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
            ></div>
          </div>

          {/* Question Card */}
          <div className="bg-white rounded-b-xl shadow-lg overflow-hidden p-6 md:p-8 min-h-[500px] flex flex-col">
            <div className="mb-6">
              <span className="text-sm font-semibold text-blue-600 tracking-wider uppercase">Question {currentQuestionIndex + 1} of {questions.length}</span>
              <h3 className="text-2xl font-medium text-gray-800 mt-2 leading-relaxed">{question.question}</h3>
            </div>
            
            <div className="grid gap-4 flex-grow">
              {question.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAnswer(idx)}
                  className={`w-full text-left p-5 rounded-lg border-2 transition-all group ${
                    answers[currentQuestionIndex] === idx 
                      ? "bg-blue-50 border-blue-600" 
                      : "hover:bg-gray-50 border-gray-200 hover:border-blue-300"
                  }`}
                >
                  <div className="flex items-start">
                    <span className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full text-sm font-bold mr-4 transition-colors ${
                      answers[currentQuestionIndex] === idx 
                        ? "bg-blue-600 text-white" 
                        : "bg-gray-100 text-gray-500 group-hover:bg-blue-200 group-hover:text-blue-800"
                    }`}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="text-lg text-gray-700">{option}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === "results") {
    const score = calculateScore();
    const passed = score >= 7; // 70% pass mark

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-lg w-full text-center fade-in relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-blue-900"></div>
          
          <CldnLogo className="h-12 mx-auto mb-6" />
          
          <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-6 border-4 ${passed ? 'bg-green-50 border-green-500 text-green-600' : 'bg-red-50 border-red-500 text-red-600'}`}>
            <i className={`fas ${passed ? 'fa-check' : 'fa-times'} text-5xl`}></i>
          </div>
          
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Assessment Complete</h2>
          <p className="text-gray-600 mb-8">Thank you, {profile.name}.</p>
          
          <div className="mb-8 bg-gray-50 rounded-lg p-6">
            <div className="text-sm text-gray-500 uppercase tracking-wider mb-1">Final Score</div>
            <div className="text-6xl font-bold text-blue-900 mb-2">{score}<span className="text-2xl text-gray-400">/{questions.length}</span></div>
            <div className={`text-xl font-bold ${passed ? 'text-green-600' : 'text-red-600'}`}>
              {passed ? "COMPETENT" : "NOT YET COMPETENT"}
            </div>
          </div>

          <div className="space-y-3">
            <button 
              onClick={generatePDF}
              className="w-full bg-blue-900 hover:bg-blue-800 text-white font-bold py-4 rounded-lg transition duration-200 flex items-center justify-center gap-2 shadow-lg"
            >
              <i className="fas fa-file-pdf text-xl"></i> Download Official Report
            </button>
            
            <button 
              onClick={restartQuiz}
              className="w-full bg-white border-2 border-gray-200 hover:bg-gray-50 text-gray-700 font-bold py-3 rounded-lg transition duration-200"
            >
              Retake Assessment
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);