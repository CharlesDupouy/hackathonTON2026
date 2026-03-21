import { QuizQuestion } from '../types';

const QUESTIONS: QuizQuestion[] = [
  { id: 1, question: "What is the capital of France?", options: ["London", "Berlin", "Paris", "Madrid"], correctIndex: 2 },
  { id: 2, question: "Which planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Saturn"], correctIndex: 1 },
  { id: 3, question: "What is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], correctIndex: 3 },
  { id: 4, question: "Who painted the Mona Lisa?", options: ["Michelangelo", "Da Vinci", "Raphael", "Donatello"], correctIndex: 1 },
  { id: 5, question: "What is the chemical symbol for gold?", options: ["Go", "Gd", "Au", "Ag"], correctIndex: 2 },
  { id: 6, question: "Which country has the most people?", options: ["USA", "India", "China", "Indonesia"], correctIndex: 1 },
  { id: 7, question: "How many continents are there?", options: ["5", "6", "7", "8"], correctIndex: 2 },
  { id: 8, question: "What year did World War II end?", options: ["1943", "1944", "1945", "1946"], correctIndex: 2 },
  { id: 9, question: "What is the speed of light?", options: ["300,000 km/s", "150,000 km/s", "1,000,000 km/s", "30,000 km/s"], correctIndex: 0 },
  { id: 10, question: "Which gas do plants absorb?", options: ["Oxygen", "Nitrogen", "CO2", "Hydrogen"], correctIndex: 2 },
  { id: 11, question: "What is the tallest mountain?", options: ["K2", "Kangchenjunga", "Everest", "Lhotse"], correctIndex: 2 },
  { id: 12, question: "Who wrote Romeo and Juliet?", options: ["Dickens", "Shakespeare", "Austen", "Hemingway"], correctIndex: 1 },
  { id: 13, question: "What is the smallest country?", options: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"], correctIndex: 1 },
  { id: 14, question: "How many bones in the human body?", options: ["186", "206", "226", "256"], correctIndex: 1 },
  { id: 15, question: "Which element has atomic number 1?", options: ["Helium", "Hydrogen", "Lithium", "Carbon"], correctIndex: 1 },
  { id: 16, question: "What is the longest river?", options: ["Amazon", "Nile", "Yangtze", "Mississippi"], correctIndex: 1 },
  { id: 17, question: "What currency does Japan use?", options: ["Won", "Yuan", "Yen", "Ringgit"], correctIndex: 2 },
  { id: 18, question: "Who invented the telephone?", options: ["Edison", "Tesla", "Bell", "Marconi"], correctIndex: 2 },
  { id: 19, question: "What is the hardest natural substance?", options: ["Titanium", "Diamond", "Quartz", "Sapphire"], correctIndex: 1 },
  { id: 20, question: "Which planet has the most moons?", options: ["Jupiter", "Saturn", "Uranus", "Neptune"], correctIndex: 1 },
  { id: 21, question: "What is the boiling point of water?", options: ["90°C", "95°C", "100°C", "105°C"], correctIndex: 2 },
  { id: 22, question: "Which blood type is universal donor?", options: ["A", "B", "AB", "O-"], correctIndex: 3 },
  { id: 23, question: "What is the largest desert?", options: ["Sahara", "Arabian", "Antarctic", "Gobi"], correctIndex: 2 },
  { id: 24, question: "Who discovered penicillin?", options: ["Pasteur", "Fleming", "Koch", "Jenner"], correctIndex: 1 },
  { id: 25, question: "What does DNA stand for?", options: ["Deoxyribonucleic acid", "Dynamic nucleic acid", "Dual nitrogen acid", "Dense nucleotide acid"], correctIndex: 0 },
  { id: 26, question: "Which is the largest mammal?", options: ["Elephant", "Blue whale", "Giraffe", "Hippo"], correctIndex: 1 },
  { id: 27, question: "How many strings on a standard guitar?", options: ["4", "5", "6", "8"], correctIndex: 2 },
  { id: 28, question: "What is Pi approximately equal to?", options: ["2.14", "3.14", "4.14", "3.41"], correctIndex: 1 },
  { id: 29, question: "Which planet is closest to the Sun?", options: ["Venus", "Mercury", "Mars", "Earth"], correctIndex: 1 },
  { id: 30, question: "What year was the first iPhone released?", options: ["2005", "2006", "2007", "2008"], correctIndex: 2 },
];

export function getRandomQuestions(count: number = 10): QuizQuestion[] {
  const shuffled = [...QUESTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, QUESTIONS.length));
}

export function getQuestionById(id: number): QuizQuestion | undefined {
  return QUESTIONS.find((q) => q.id === id);
}
