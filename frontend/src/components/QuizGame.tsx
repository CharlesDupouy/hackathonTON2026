import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchQuiz, submitQuizAnswer, endQuiz } from '../api/client';
import { useTelegram } from '../hooks/useTelegram';

interface Question {
  id: number;
  question: string;
  options: string[];
}

interface QuizState {
  questions: Question[];
  currentIndex: number;
  timePerQuestion: number; // seconds (may vary by spender advantage)
  scores: Array<{ username: string; score: number }>;
  finished: boolean;
  results?: Array<{
    username: string;
    score: number;
    payout_delta: number;
  }>;
}

function QuizGame() {
  const { user } = useTelegram();
  const [searchParams] = useSearchParams();
  const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  const tripId = parseInt(searchParams.get('tripId') || startParam || '0', 10);
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState<number | null>(null);
  const [answering, setAnswering] = useState(false);

  useEffect(() => {
    fetchQuiz(tripId)
      .then((data) => {
        setQuiz(data);
        setTimeLeft(data.timePerQuestion);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Timer countdown
  useEffect(() => {
    if (!quiz || quiz.finished || selectedAnswer !== null) return;
    if (timeLeft <= 0) {
      // Auto-skip on timeout
      handleNextQuestion();
      return;
    }
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, quiz, selectedAnswer]);

  const handleAnswer = async (answerIndex: number) => {
    if (!user || !quiz || answering) return;
    setAnswering(true);
    setSelectedAnswer(answerIndex);

    try {
      const result = await submitQuizAnswer({
        tripId,
        memberTelegramId: user.id,
        questionId: quiz.questions[quiz.currentIndex].id,
        answerIndex,
      });
      setCorrectAnswer(result.correctIndex);

      // Auto-advance after 1.5s
      setTimeout(() => handleNextQuestion(), 1500);
    } catch (err) {
      console.error('Failed to submit answer:', err);
    } finally {
      setAnswering(false);
    }
  };

  const handleNextQuestion = useCallback(() => {
    if (!quiz) return;
    const nextIndex = quiz.currentIndex + 1;
    if (nextIndex >= quiz.questions.length) {
      setQuiz((prev) => prev ? { ...prev, finished: true } : prev);
    } else {
      setQuiz((prev) => prev ? { ...prev, currentIndex: nextIndex } : prev);
      setTimeLeft(quiz.timePerQuestion);
      setSelectedAnswer(null);
      setCorrectAnswer(null);
    }
  }, [quiz]);

  // When quiz is finished, call backend to end quiz and get results
  useEffect(() => {
    if (!quiz?.finished || quiz.results) return;
    endQuiz(tripId)
      .then((data) => {
        setQuiz((prev) => prev ? { ...prev, results: data.results } : prev);
      })
      .catch(console.error);
  }, [quiz?.finished]);

  if (loading) {
    return <div className="loading">Loading quiz...</div>;
  }

  if (!quiz) {
    return (
      <div className="page-header">
        <h1>🎮 Quiz</h1>
        <p>No quiz available yet</p>
      </div>
    );
  }

  // Show results
  if (quiz.finished && quiz.results) {
    return (
      <div>
        <div className="page-header">
          <h1>🏆 Results</h1>
          <p>Payouts are being sent to your wallets</p>
        </div>
        <div className="card">
          {quiz.results.map((r, i) => (
            <div key={i} className="balance-item">
              <div>
                <span style={{ fontSize: '1.25rem', marginRight: '8px' }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </span>
                <span>{r.username}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600 }}>{r.score} pts</div>
                <div className={r.payout_delta > 0 ? 'balance-positive' : ''}>
                  {r.payout_delta > 0 ? `Payout: ${r.payout_delta.toFixed(9)} TON` : 'No payout'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Show current question
  const currentQ = quiz.questions[quiz.currentIndex];

  return (
    <div>
      <div className="page-header">
        <h1>🎮 Quiz</h1>
        <p>Question {quiz.currentIndex + 1} of {quiz.questions.length}</p>
      </div>

      <div className={`timer ${timeLeft <= 5 ? 'urgent' : ''}`}>
        {timeLeft}s
      </div>

      <div className="quiz-question">{currentQ.question}</div>

      <div className="quiz-options">
        {currentQ.options.map((opt, i) => {
          let className = 'quiz-option';
          if (selectedAnswer !== null) {
            if (i === correctAnswer) className += ' correct';
            else if (i === selectedAnswer && i !== correctAnswer) className += ' incorrect';
          }
          return (
            <button
              key={i}
              className={className}
              onClick={() => handleAnswer(i)}
              disabled={selectedAnswer !== null}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default QuizGame;
