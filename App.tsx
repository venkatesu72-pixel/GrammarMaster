
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { Speaker, TranscriptMessage } from './types';

const GRAMMAR_TOPICS = [
    "Random", "General", "Nouns", "Verbs", "Adjectives", "Adverbs",
    "Prepositions", "Tenses", "Active Voice", "Passive Voice",
    "Direct Speech", "Indirect Speech", "Clauses", "Degrees of Comparison",
    "Advice", "Synonyms", "Antonyms", "Articles", "Conjunctions",
    "Interchanging Sentences", "Jumbled Sentences", "Questions and Auxiliary verbs"
];
const DIFFICULTY_LEVELS = ["Easy", "Medium", "Hard"];
const TOTAL_QUESTIONS = 10;

// Fallback questions to use when API quota is exceeded
const FALLBACK_QUESTIONS: QuizQuestion[] = [
    {
        question: "Identify the Noun in the sentence: 'The sun shines brightly.'",
        options: ["The", "Sun", "Shines", "Brightly"],
        answer: "Sun",
        explanation: "A noun is a naming word. 'Sun' is the name of the star.",
        topic: "Nouns"
    },
    {
        question: "Which word is a Verb?",
        options: ["Run", "Happy", "Table", "Green"],
        answer: "Run",
        explanation: "A verb indicates an action. 'Run' is an action.",
        topic: "Verbs"
    },
    {
        question: "Select the Adjective: 'She has a red car.'",
        options: ["She", "Has", "Red", "Car"],
        answer: "Red",
        explanation: "An adjective describes a noun. 'Red' describes the car.",
        topic: "Adjectives"
    },
    {
        question: "Fill in the blank: 'He is ___ honest man.'",
        options: ["A", "An", "The", "No article"],
        answer: "An",
        explanation: "We use 'an' before words starting with a vowel sound. 'Honest' starts with a vowel sound.",
        topic: "Articles"
    },
    {
        question: "What is the plural of 'Child'?",
        options: ["Childs", "Children", "Childrens", "Childes"],
        answer: "Children",
        explanation: "'Child' is an irregular noun. Its plural is 'Children'.",
        topic: "Nouns"
    }
];

// Sound Effect Utility
const playSound = (type: 'correct' | 'incorrect' | 'start' | 'finish') => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const gainNode = ctx.createGain();
    gainNode.connect(ctx.destination);
    const now = ctx.currentTime;

    if (type === 'correct') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now); 
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1); 
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.connect(gainNode);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (type === 'incorrect') {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth'; 
      osc.frequency.setValueAtTime(400, now); 
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.3); 
      gainNode.gain.setValueAtTime(0.15, now); 
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.connect(gainNode);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'start') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.4);
      gainNode.gain.setValueAtTime(0.05, now);
      gainNode.gain.linearRampToValueAtTime(0.1, now + 0.1);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
      osc.connect(gainNode);
      osc.start(now);
      osc.stop(now + 1.0);
    } else if (type === 'finish') {
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.1);
        const gn = ctx.createGain();
        gn.connect(ctx.destination);
        gn.gain.setValueAtTime(0.05, now + i * 0.1);
        gn.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 1.0);
        osc.connect(gn);
        osc.start(now + i * 0.1);
        osc.stop(now + i * 0.1 + 1.0);
      });
    }
    setTimeout(() => { if(ctx.state !== 'closed') ctx.close(); }, 2000);
  } catch (e) {}
};

interface QuizQuestion {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
  topic: string;
}

interface QuizHistoryItem {
  question: QuizQuestion;
  userAnswer: string;
  isCorrect: boolean;
}

interface WelcomeMessageProps {
  selectedTopic: string;
  onTopicSelect: (topic: string) => void;
  selectedDifficulty: string;
  onDifficultySelect: (difficulty: string) => void;
  onStart: () => void;
  userName: string;
  onUserNameChange: (name: string) => void;
  userClass: string;
  onUserClassChange: (cls: string) => void;
  userCount: number;
  viewsCount: number;
}

const WelcomeMessage: React.FC<WelcomeMessageProps> = ({ 
    selectedTopic, onTopicSelect, 
    selectedDifficulty, onDifficultySelect, 
    onStart, userName, onUserNameChange,
    userClass, onUserClassChange,
    userCount, viewsCount
}) => {
    const [showInstallHelp, setShowInstallHelp] = useState(false);

    return (
      <div className="flex-grow overflow-y-auto w-full relative pt-[safe-area-inset-top] bg-slate-950">
        {/* Stats Badges */}
        <div className="absolute top-4 right-4 z-10 flex flex-col items-end space-y-2 md:space-y-4">
            <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700 text-cyan-400 px-3 py-1.5 rounded-full shadow-lg flex items-center space-x-2 text-xs md:text-sm">
                <i className="fa-solid fa-users"></i>
                <span className="font-bold">{userCount.toLocaleString()} Users</span>
            </div>
            <button 
                onClick={() => setShowInstallHelp(true)}
                className="bg-indigo-600/90 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-full shadow-lg flex items-center space-x-2 text-xs transition-all active:scale-95"
            >
                <i className="fa-brands fa-android text-sm"></i>
                <span className="font-bold">Get APK</span>
            </button>
        </div>

        <div className="min-h-full flex flex-col items-center justify-center p-4 md:p-8">
           <div className="flex flex-col items-center justify-center w-full max-w-xl mx-auto py-10">
              <div className="bg-slate-900/50 backdrop-blur-xl p-6 md:p-10 rounded-[2.5rem] shadow-2xl border border-slate-800 w-full text-center">
                <div className="flex flex-col items-center mb-8">
                  <div className="relative">
                      <img 
                        src="https://i.postimg.cc/xTXJ57Zt/venkatesu-removebg-preview.png" 
                        alt="Creator" 
                        className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-cyan-500/50 object-cover mb-4 shadow-2xl shadow-cyan-500/20"
                      />
                      <div className="absolute bottom-4 right-0 bg-green-500 w-6 h-6 rounded-full border-4 border-slate-900"></div>
                  </div>
                  <h2 className="text-2xl font-black text-white tracking-tight">Kambham Venkatesu</h2>
                  <p className="text-slate-400 text-sm font-medium">National ICT Award Winner 2016</p>
                  <div className="mt-2 inline-block px-3 py-1 bg-cyan-500/10 rounded-full border border-cyan-500/20">
                    <span className="text-cyan-400 font-bold text-[10px] uppercase tracking-[0.2em]">Quiz Developer</span>
                  </div>
                </div>

                <h1 className="text-4xl md:text-5xl font-black mb-3 text-white tracking-tighter">
                    Grammar <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Master</span>
                </h1>
                
                <div className="space-y-4 mb-8">
                    <div className="text-left">
                      <input
                          type="text"
                          value={userName}
                          onChange={(e) => onUserNameChange(e.target.value)}
                          placeholder="Student Name"
                          className="bg-slate-800/50 border-2 border-slate-700 text-white text-lg rounded-2xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 block w-full px-5 py-4 outline-none transition-all placeholder:text-slate-500"
                      />
                    </div>
                    <div className="text-left">
                      <input
                          type="text"
                          value={userClass}
                          onChange={(e) => onUserClassChange(e.target.value)}
                          placeholder="Class / Grade"
                          className="bg-slate-800/50 border-2 border-slate-700 text-white text-lg rounded-2xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 block w-full px-5 py-4 outline-none transition-all placeholder:text-slate-500"
                      />
                    </div>
                </div>
          
                <div className="grid grid-cols-2 gap-3 mb-8">
                  <div className="relative">
                    <select
                      value={selectedTopic}
                      onChange={(e) => onTopicSelect(e.target.value)}
                      className="bg-slate-800/50 border border-slate-700 text-white text-sm font-bold rounded-2xl focus:ring-2 focus:ring-cyan-500 block w-full px-4 py-4 appearance-none outline-none"
                    >
                      {GRAMMAR_TOPICS.map(topic => <option key={topic} value={topic}>{topic}</option>)}
                    </select>
                    <i className="fa-solid fa-book-open absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"></i>
                  </div>
                   <div className="relative">
                    <select
                      value={selectedDifficulty}
                      onChange={(e) => onDifficultySelect(e.target.value)}
                      className="bg-slate-800/50 border border-slate-700 text-white text-sm font-bold rounded-2xl focus:ring-2 focus:ring-cyan-500 block w-full px-4 py-4 appearance-none outline-none"
                    >
                      {DIFFICULTY_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
                    </select>
                    <i className="fa-solid fa-gauge-high absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"></i>
                  </div>
                </div>

                 <button
                    onClick={onStart}
                    disabled={!userName.trim() || !userClass.trim()}
                    className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-800 disabled:cursor-not-allowed text-white font-black py-5 rounded-2xl shadow-2xl shadow-cyan-500/20 transition-all transform active:scale-95 text-xl flex items-center justify-center group"
                  >
                    <span>START QUIZ</span>
                    <i className="fa-solid fa-arrow-right ml-3 group-hover:translate-x-1 transition-transform"></i>
                  </button>
              </div>
           </div>
        </div>

        {/* APK / Install Modal */}
        {showInstallHelp && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm animate-fade-in">
                <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl">
                    <div className="flex justify-between items-start mb-6">
                        <i className="fa-brands fa-android text-5xl text-green-500"></i>
                        <button onClick={() => setShowInstallHelp(false)} className="text-slate-500 hover:text-white p-2">
                            <i className="fa-solid fa-xmark text-2xl"></i>
                        </button>
                    </div>
                    <h3 className="text-2xl font-black text-white mb-4">Install as App</h3>
                    <div className="space-y-6 text-slate-300">
                        <div className="flex gap-4">
                            <div className="bg-slate-800 w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-cyan-400">1</div>
                            <p>Open this page in <b>Google Chrome</b> on your Android device.</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="bg-slate-800 w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-cyan-400">2</div>
                            <p>Tap the <b>three dots (⋮)</b> in the top-right corner.</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="bg-slate-800 w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-cyan-400">3</div>
                            <p>Select <b>"Install App"</b> or <b>"Add to Home screen"</b>.</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setShowInstallHelp(false)}
                        className="w-full mt-8 bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-2xl transition-all"
                    >
                        Got it!
                    </button>
                    <p className="mt-4 text-[10px] text-slate-500 text-center uppercase tracking-widest font-black">Powered by Venkatesu Gemini AI</p>
                </div>
            </div>
        )}
      </div>
    );
};

// ... Rest of the components (TranscriptView, OptionsView, ResetButton, Confetti, QuizSummary) stay the same as previous logic but with SLATE-900 based styling ...
const TranscriptView: React.FC<{ transcripts: TranscriptMessage[] }> = ({ transcripts }) => {
    const endRef = useRef<HTMLDivElement>(null);
    useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [transcripts]);
    return (
        <div className="space-y-4">
            {transcripts.map((msg, i) => (
                <div key={i} className={`flex items-end gap-2 ${msg.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.speaker === 'gemini' && <div className="bg-cyan-500/20 p-2 rounded-full mb-1"><i className="fa-solid fa-robot text-cyan-400"></i></div>}
                    <div className={`max-w-[85%] px-4 py-3 rounded-2xl ${msg.speaker === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-100 rounded-bl-none border border-slate-700'}`}>
                        <p className="text-sm md:text-lg font-medium">{msg.text}</p>
                    </div>
                </div>
            ))}
            <div ref={endRef} />
        </div>
    );
};

const OptionsView: React.FC<{ question: QuizQuestion, questionNumber: number, totalQuestions: number, isAnswered: boolean, selectedAnswer: string | null, onSelectAnswer: (o: string) => void }> = ({ question, questionNumber, totalQuestions, isAnswered, selectedAnswer, onSelectAnswer }) => (
    <div className="w-full max-w-2xl mx-auto py-4">
        <div className="flex justify-between items-center mb-6">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Quiz Progress</span>
            <span className="text-cyan-400 font-black text-sm">{questionNumber} / {totalQuestions}</span>
        </div>
        <div className="w-full bg-slate-800 h-1.5 rounded-full mb-8 overflow-hidden">
            <div className="bg-cyan-500 h-full transition-all duration-500" style={{ width: `${(questionNumber/totalQuestions)*100}%` }}></div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-[2rem] shadow-xl mb-8">
            <h2 className="text-xl md:text-3xl font-bold text-white leading-snug text-center">{question.question}</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 md:gap-4">
            {question.options.map((opt, i) => {
                const isCorrect = opt === question.answer;
                const isSelected = opt === selectedAnswer;
                const btnClass = !isAnswered ? "bg-slate-800 border-slate-700 hover:border-cyan-500/50" : 
                                 isCorrect ? "bg-green-600/20 border-green-500 text-green-400" :
                                 isSelected ? "bg-red-600/20 border-red-500 text-red-400" : "bg-slate-900/50 border-slate-800 opacity-40";
                return (
                    <button key={i} onClick={() => onSelectAnswer(opt)} disabled={isAnswered}
                        className={`p-5 rounded-2xl border-2 font-bold text-base md:text-xl transition-all text-left flex justify-between items-center ${btnClass} ${!isAnswered && 'active:scale-[0.98]'}`}>
                        <span>{opt}</span>
                        {isAnswered && isCorrect && <i className="fa-solid fa-check-circle"></i>}
                        {isAnswered && isSelected && !isCorrect && <i className="fa-solid fa-times-circle"></i>}
                    </button>
                );
            })}
        </div>
        
        {isAnswered && (
            <div className="mt-8 p-6 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl animate-fade-in">
                <div className="flex items-center gap-3 mb-2">
                    <i className="fa-solid fa-lightbulb text-yellow-400"></i>
                    <h3 className="text-sm font-black uppercase text-cyan-400 tracking-widest">Why?</h3>
                </div>
                <p className="text-slate-300 text-sm md:text-base leading-relaxed">{question.explanation}</p>
            </div>
        )}
    </div>
);

const QuizSummary: React.FC<{ score: number, total: number, onRestart: () => void, onDownload: () => void, topicStats: any }> = ({ score, total, onRestart, onDownload, topicStats }) => {
    const pct = Math.round((score/total)*100);
    return (
        <div className="flex flex-col items-center justify-center py-10 animate-fade-in w-full max-w-md mx-auto">
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] w-full text-center shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-cyan-500 to-blue-600"></div>
                <div className="mb-6">
                    <div className="inline-block p-6 bg-slate-800 rounded-full mb-4">
                        <i className={`fa-solid ${pct >= 70 ? 'fa-crown text-yellow-400' : 'fa-graduation-cap text-cyan-400'} text-5xl`}></i>
                    </div>
                    <h2 className="text-3xl font-black text-white">Quiz Finished!</h2>
                </div>
                
                <div className="mb-8">
                    <div className="text-6xl font-black text-white mb-1">{score}<span className="text-slate-500 text-3xl">/{total}</span></div>
                    <div className="text-sm font-bold text-slate-500 uppercase tracking-widest">Final Score</div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-8">
                    <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                        <div className="text-2xl font-black text-cyan-400">{pct}%</div>
                        <div className="text-[10px] text-slate-500 uppercase font-black">Accuracy</div>
                    </div>
                    <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                        <div className="text-2xl font-black text-green-400">{score}</div>
                        <div className="text-[10px] text-slate-500 uppercase font-black">Correct</div>
                    </div>
                </div>

                <div className="space-y-3">
                    <button onClick={onRestart} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-cyan-500/20 active:scale-95 flex items-center justify-center gap-3">
                        <i className="fa-solid fa-rotate-right"></i> Play Again
                    </button>
                    <button onClick={onDownload} className="w-full bg-slate-800 hover:bg-slate-700 text-white font-black py-4 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-3">
                        <i className="fa-solid fa-file-arrow-down"></i> Download Report
                    </button>
                </div>
                <p className="mt-6 text-[9px] text-slate-600 uppercase tracking-widest font-black">Developed by Kambham Venkatesu</p>
            </div>
        </div>
    );
};

export default function App() {
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>('Random');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('Medium');
  const [isThinking, setIsThinking] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [userCount, setUserCount] = useState(2850);
  const [viewsCount, setViewsCount] = useState(14200);

  const [userName, setUserName] = useState('');
  const [userClass, setUserClass] = useState('');

  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [topicStats, setTopicStats] = useState<Record<string, { correct: number; total: number }>>({});
  const [quizHistory, setQuizHistory] = useState<QuizHistoryItem[]>([]);
  const [fetchError, setFetchError] = useState(false);
  
  const seenQuestionsRef = useRef<Set<string>>(new Set());
  const aiRef = useRef<GoogleGenAI | null>(null);

  const updateTranscript = useCallback((speaker: Speaker, text: string, isFinal: boolean) => {
    setTranscripts(prev => [...prev, { speaker, text, isFinal }]);
  }, []);

  const resetQuiz = useCallback(() => {
    setTranscripts([]);
    setIsThinking(false);
    setQuizStarted(false);
    setQuizFinished(false);
    setCurrentQuestion(null);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setScore(0);
    setQuestionNumber(0);
    setTopicStats({});
    setQuizHistory([]);
    setFetchError(false);
  }, []);

  const fetchAndSetQuestion = useCallback(async () => {
    if (!aiRef.current) return;
    setIsThinking(true);
    setFetchError(false);
    setSelectedAnswer(null);
    setIsAnswered(false);

    try {
        const response = await aiRef.current!.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [{ text: `Generate unique ${selectedDifficulty} question on ${selectedTopic}. [id:${Math.random().toString(36)}]` }] },
            config: {
                systemInstruction: `Return JSON: {question, options[4], answer, explanation, topic}. No extra text.`,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        question: {type: Type.STRING},
                        options: {type: Type.ARRAY, items: {type: Type.STRING}},
                        answer: {type: Type.STRING},
                        explanation: {type: Type.STRING},
                        topic: {type: Type.STRING},
                    },
                    required: ['question', 'options', 'answer', 'explanation', 'topic']
                }
            }
        });
        const data = JSON.parse(response.text?.trim() || "{}");
        setCurrentQuestion(data);
    } catch (e) {
        console.error(e);
        const fallback = FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
        setCurrentQuestion(fallback);
    } finally {
        setIsThinking(false);
    }
  }, [selectedTopic, selectedDifficulty]);

  const startQuiz = useCallback(async () => {
    playSound('start');
    setQuizStarted(true);
    setQuestionNumber(1);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    aiRef.current = ai;
    await fetchAndSetQuestion();
  }, [fetchAndSetQuestion]);

  const handleSelectAnswer = (option: string) => {
    if (!currentQuestion) return;
    setIsAnswered(true);
    setSelectedAnswer(option);
    const isCorrect = option === currentQuestion.answer;
    if(isCorrect) { setScore(s => s + 1); playSound('correct'); } else { playSound('incorrect'); }
    setQuizHistory(h => [...h, { question: currentQuestion, userAnswer: option, isCorrect }]);
    updateTranscript(Speaker.User, option, true);
    setTimeout(() => updateTranscript(Speaker.Gemini, isCorrect ? "Correct! Well done." : "Not quite. Check the explanation.", true), 500);
  };

  const handleNext = () => {
    if (questionNumber < TOTAL_QUESTIONS) {
        setQuestionNumber(n => n + 1);
        fetchAndSetQuestion();
    } else {
        setQuizFinished(true);
        playSound('finish');
    }
  };

  const downloadResults = () => {
    const content = `<html><body style="font-family:sans-serif;padding:40px"><h1>Results: ${userName}</h1><h2>Score: ${score}/${TOTAL_QUESTIONS}</h2></body></html>`;
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Report_${userName}.html`;
    a.click();
  };

  return (
    <div className="w-full h-[100dvh] bg-slate-950 text-white overflow-hidden flex flex-col">
      {!quizStarted ? (
        <WelcomeMessage 
            selectedTopic={selectedTopic} onTopicSelect={setSelectedTopic}
            selectedDifficulty={selectedDifficulty} onDifficultySelect={setSelectedDifficulty}
            onStart={startQuiz} userName={userName} onUserNameChange={setUserName}
            userClass={userClass} onUserClassChange={setUserClass}
            userCount={userCount} viewsCount={viewsCount}
        />
      ) : (
        <div className="h-full flex flex-col pt-[safe-area-inset-top]">
            <header className="px-6 py-4 flex justify-between items-center bg-slate-900/50 backdrop-blur-md border-b border-slate-800">
                <div className="flex items-center gap-3">
                    <img src="https://i.postimg.cc/xTXJ57Zt/venkatesu-removebg-preview.png" className="w-8 h-8 rounded-full" alt="V"/>
                    <div className="flex flex-col">
                        <span className="text-xs font-black text-white">{userName}</span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{selectedTopic}</span>
                    </div>
                </div>
                <button onClick={resetQuiz} className="text-slate-500 hover:text-white transition-colors">
                    <i className="fa-solid fa-house"></i>
                </button>
            </header>

            <main className="flex-grow overflow-y-auto p-6">
                {quizFinished ? (
                    <QuizSummary score={score} total={TOTAL_QUESTIONS} onRestart={resetQuiz} onDownload={downloadResults} topicStats={topicStats}/>
                ) : isThinking ? (
                    <div className="flex flex-col items-center justify-center py-20 animate-pulse">
                        <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                        <p className="text-cyan-400 font-black uppercase tracking-widest text-sm">Preparing Next Task...</p>
                    </div>
                ) : currentQuestion && (
                    <div className="space-y-8">
                        <TranscriptView transcripts={transcripts} />
                        <OptionsView question={currentQuestion} questionNumber={questionNumber} totalQuestions={TOTAL_QUESTIONS} isAnswered={isAnswered} selectedAnswer={selectedAnswer} onSelectAnswer={handleSelectAnswer} />
                    </div>
                )}
            </main>

            <footer className="p-6 bg-slate-900/80 border-t border-slate-800 safe-area-pb">
                {isAnswered && !quizFinished && (
                    <button onClick={handleNext} className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-black py-4 rounded-2xl shadow-xl active:scale-95 transition-all text-lg flex items-center justify-center gap-3">
                        <span>{questionNumber === TOTAL_QUESTIONS ? "Finish Quiz" : "Next Question"}</span>
                        <i className="fa-solid fa-chevron-right text-sm"></i>
                    </button>
                )}
                {!isAnswered && !quizFinished && (
                    <div className="text-center text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                        Select an answer to continue
                    </div>
                )}
            </footer>
        </div>
      )}
    </div>
  );
}
