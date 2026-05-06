// ==================== CONSTANTS ====================
const CONFIG = {
    PINCH_THRESHOLD: 50,           // Tăng ngưỡng để dễ bóp hơn
    BUBBLE_SPAWN_INTERVAL: 1800,   // Tăng thời gian spawn để giảm mật độ
    BUBBLE_SPEED_MIN: 1.5,
    BUBBLE_SPEED_MAX: 2.5,
    BUBBLE_SIZE_MIN: 80,
    BUBBLE_SIZE_MAX: 120,
    MAX_BUBBLES: 10,
    MIN_BUBBLE_DISTANCE: 180,      // Khoảng cách tối thiểu giữa các bong bóng
    DEFAULT_TIME_LIMIT: 20,
    STORAGE_KEY: 'ar_bubble_game_data'
};

// ==================== GLOBAL STATE ====================
let gameData = {
    questions: [],
    timeLimit: CONFIG.DEFAULT_TIME_LIMIT
};

let gameState = {
    isPlaying: false,
    score: 0,
    currentQuestionIndex: 0,
    correctCount: 0,
    wrongCount: 0,
    timeRemaining: 0,
    timerInterval: null,
    bubbles: [],
    particles: [],
    hands: [],
    lastSpawnTime: 0,
    questionAnswered: false,
    showHandTracking: true
};

let questionCounter = 0;
let hands, camera;
let audioContext = null;

// ==================== DOM ELEMENTS ====================
const DOM = {
    // Setup screen
    setupScreen: document.getElementById('setup-screen'),
    gameScreen: document.getElementById('game-screen'),
    questionsList: document.getElementById('questions-list'),
    addQuestionBtn: document.getElementById('add-question-btn'),
    timeLimitInput: document.getElementById('time-limit'),
    startGameBtn: document.getElementById('start-game-btn'),
    clearAllBtn: document.getElementById('clear-all-btn'),
    
    // Game screen
    webcam: document.getElementById('webcam'),
    canvas: document.getElementById('game-canvas'),
    questionText: document.getElementById('question-text'),
    timerCircle: document.getElementById('timer-circle-progress'),
    timerText: document.getElementById('timer-text'),
    scoreEl: document.getElementById('score'),
    currentQEl: document.getElementById('current-q'),
    totalQEl: document.getElementById('total-q'),
    homeBtn: document.getElementById('home-btn'),
    toggleHandsBtn: document.getElementById('toggle-hands-btn'),
    
    // Result screen
    resultScreen: document.getElementById('result-screen'),
    finalScore: document.getElementById('final-score'),
    correctCountEl: document.getElementById('correct-count'),
    wrongCountEl: document.getElementById('wrong-count'),
    accuracyEl: document.getElementById('accuracy'),
    playAgainBtn: document.getElementById('play-again-btn'),
    backSetupBtn: document.getElementById('back-setup-btn')
};

const ctx = DOM.canvas.getContext('2d');

// ==================== STORAGE ====================
function saveToStorage() {
    const data = {
        timeLimit: parseInt(DOM.timeLimitInput.value) || CONFIG.DEFAULT_TIME_LIMIT,
        questions: []
    };
    
    document.querySelectorAll('.question-card').forEach(card => {
        const questionInput = card.querySelector('.question-input');
        const questionImagePreview = card.querySelector('.question-input-wrapper .image-preview');
        const answerRows = card.querySelectorAll('.answer-row');
        
        const question = {
            text: questionInput.value.trim(),
            image: questionImagePreview?.dataset.image || null,
            answers: []
        };
        
        let correctAnswer = null;
        answerRows.forEach(row => {
            const radio = row.querySelector('input[type="radio"]');
            const input = row.querySelector('.answer-input');
            const imagePreview = row.querySelector('.image-preview');
            const text = input.value.trim();
            
            if (text) {
                const answerData = {
                    text: text,
                    image: imagePreview?.dataset.image || null
                };
                question.answers.push(answerData);
                if (radio.checked) {
                    correctAnswer = text;
                }
            }
        });
        
        question.correctAnswer = correctAnswer;
        
        if (question.text && question.answers.length >= 2 && correctAnswer) {
            data.questions.push(question);
        }
    });
    
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
}

function loadFromStorage() {
    try {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (!saved) return false;
        
        const data = JSON.parse(saved);
        DOM.timeLimitInput.value = data.timeLimit || CONFIG.DEFAULT_TIME_LIMIT;
        
        if (data.questions && data.questions.length > 0) {
            DOM.questionsList.innerHTML = '';
            questionCounter = 0;
            
            data.questions.forEach(q => {
                createQuestionCard();
                const card = DOM.questionsList.lastElementChild;
                card.querySelector('.question-input').value = q.text;
                
                // Load question image
                if (q.image) {
                    const wrapper = card.querySelector('.question-input-wrapper');
                    const preview = wrapper.querySelector('.image-preview');
                    preview.innerHTML = `
                        <img src="${q.image}" alt="Question image">
                        <button class="btn-remove-image" onclick="removeImage(this, '${card.dataset.qid}', 'question')">✖</button>
                    `;
                    preview.classList.remove('hidden');
                    preview.dataset.image = q.image;
                }
                
                const answersContainer = card.querySelector('.answers-container');
                answersContainer.innerHTML = '';
                
                q.answers.forEach((answer, index) => {
                    addAnswerRow(answersContainer, card.dataset.qid);
                    const row = answersContainer.lastElementChild;
                    
                    // Xử lý cả format cũ (string) và mới (object)
                    const answerText = typeof answer === 'string' ? answer : (answer.text || '');
                    const answerImage = typeof answer === 'object' ? answer.image : null;
                    
                    row.querySelector('.answer-input').value = answerText;
                    
                    // Load answer image
                    if (answerImage) {
                        const preview = row.querySelector('.image-preview');
                        preview.innerHTML = `
                            <img src="${answerImage}" alt="Answer image">
                            <button class="btn-remove-image" onclick="removeAnswerImage(this)">✖</button>
                        `;
                        preview.classList.remove('hidden');
                        preview.dataset.image = answerImage;
                    }
                    
                    // So sánh với correctAnswer (có thể là string hoặc object)
                    const isCorrectAnswer = typeof q.correctAnswer === 'string' 
                        ? answerText === q.correctAnswer
                        : (answerText === q.correctAnswer.text && answerImage === q.correctAnswer.image);
                    
                    if (isCorrectAnswer) {
                        row.querySelector('input[type="radio"]').checked = true;
                    }
                });
            });
            
            return true;
        }
    } catch (e) {
        console.error('Load error:', e);
    }
    return false;
}

// ==================== SETUP SCREEN ====================
function createQuestionCard() {
    questionCounter++;
    const qid = 'q' + questionCounter;
    
    const card = document.createElement('div');
    card.className = 'question-card';
    card.dataset.qid = qid;
    
    card.innerHTML = `
        <div class="question-header">
            <span class="question-number">Câu hỏi ${questionCounter}</span>
            <button class="btn-remove-question" onclick="removeQuestion('${qid}')">🗑️ Xóa</button>
        </div>
        <div class="question-input-wrapper">
            <input type="text" class="question-input" placeholder="Nhập nội dung câu hỏi...">
            <input type="file" class="question-image-input" accept="image/*" style="display:none" data-target="question">
            <button class="btn-upload-image" onclick="uploadImage('${qid}', 'question')">🖼️</button>
            <div class="image-preview hidden"></div>
        </div>
        <div class="answers-container"></div>
        <button class="btn-add-answer" onclick="addAnswer('${qid}')">➕ Thêm đáp án</button>
    `;
    
    DOM.questionsList.appendChild(card);
    
    // Add 4 default answers
    const answersContainer = card.querySelector('.answers-container');
    for (let i = 0; i < 4; i++) {
        addAnswerRow(answersContainer, qid);
    }
}

function addAnswerRow(container, qid) {
    const row = document.createElement('div');
    row.className = 'answer-row';
    
    row.innerHTML = `
        <input type="radio" name="correct-${qid}" title="Đáp án đúng">
        <input type="text" class="answer-input" placeholder="Nhập đáp án...">
        <input type="file" class="answer-image-input" accept="image/*" style="display:none" data-target="answer">
        <button class="btn-upload-image-small" onclick="uploadAnswerImage(this)">🖼️</button>
        <button class="btn-remove-answer" onclick="removeAnswerRow(this)">✖</button>
        <div class="image-preview hidden"></div>
    `;
    
    container.appendChild(row);
}

function addAnswer(qid) {
    const card = document.querySelector(`[data-qid="${qid}"]`);
    const container = card.querySelector('.answers-container');
    addAnswerRow(container, qid);
}

function removeAnswerRow(btn) {
    const container = btn.closest('.answers-container');
    if (container.querySelectorAll('.answer-row').length <= 2) {
        alert('⚠️ Cần ít nhất 2 đáp án!');
        return;
    }
    btn.closest('.answer-row').remove();
}

function removeQuestion(qid) {
    if (document.querySelectorAll('.question-card').length <= 1) {
        alert('⚠️ Cần ít nhất 1 câu hỏi!');
        return;
    }
    
    document.querySelector(`[data-qid="${qid}"]`).remove();
    
    // Renumber questions
    document.querySelectorAll('.question-card').forEach((card, index) => {
        card.querySelector('.question-number').textContent = `Câu hỏi ${index + 1}`;
    });
}

function validateSetup() {
    // Remove old error messages
    document.querySelectorAll('.error-msg').forEach(el => el.remove());
    
    const questions = [];
    let isValid = true;
    
    document.querySelectorAll('.question-card').forEach(card => {
        const questionInput = card.querySelector('.question-input');
        const questionText = questionInput.value.trim();
        const questionImagePreview = card.querySelector('.question-input-wrapper .image-preview');
        const questionImage = questionImagePreview?.dataset.image || null;
        
        // Câu hỏi cần có ít nhất text HOẶC image
        if (!questionText && !questionImage) {
            showError(questionInput, 'Vui lòng nhập câu hỏi hoặc thêm ảnh!');
            isValid = false;
            return;
        }
        
        const answerRows = card.querySelectorAll('.answer-row');
        const answers = [];
        let correctAnswer = null;
        
        answerRows.forEach(row => {
            const radio = row.querySelector('input[type="radio"]');
            const input = row.querySelector('.answer-input');
            const imagePreview = row.querySelector('.image-preview');
            const text = input.value.trim();
            const image = imagePreview?.dataset.image || null;
            
            // Đáp án cần có ít nhất text HOẶC image
            if (text || image) {
                const answerData = {
                    text: text || '',
                    image: image
                };
                answers.push(answerData);
                if (radio.checked) {
                    correctAnswer = answerData;
                }
            }
        });
        
        if (answers.length < 2) {
            showError(card, 'Cần ít nhất 2 đáp án!');
            isValid = false;
            return;
        }
        
        if (!correctAnswer) {
            showError(card, 'Vui lòng chọn đáp án đúng!');
            isValid = false;
            return;
        }
        
        questions.push({
            text: questionText || '',
            image: questionImage,
            answers: answers,
            correctAnswer: correctAnswer
        });
    });
    
    if (isValid && questions.length > 0) {
        gameData.questions = questions;
        gameData.timeLimit = parseInt(DOM.timeLimitInput.value) || CONFIG.DEFAULT_TIME_LIMIT;
        saveToStorage();
        return true;
    }
    
    return false;
}

function showError(element, message) {
    const error = document.createElement('div');
    error.className = 'error-msg';
    error.textContent = message;
    
    if (element.classList.contains('question-card')) {
        element.appendChild(error);
    } else {
        element.parentNode.insertBefore(error, element.nextSibling);
    }
}

function clearAll() {
    if (!confirm('Xóa tất cả câu hỏi?')) return;
    
    DOM.questionsList.innerHTML = '';
    questionCounter = 0;
    localStorage.removeItem(CONFIG.STORAGE_KEY);
    createQuestionCard();
}

// ==================== IMAGE UPLOAD ====================
function uploadImage(qid, target) {
    const card = document.querySelector(`[data-qid="${qid}"]`);
    const input = card.querySelector('.question-image-input');
    input.click();
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const wrapper = card.querySelector('.question-input-wrapper');
            const preview = wrapper.querySelector('.image-preview');
            preview.innerHTML = `
                <img src="${event.target.result}" alt="Question image">
                <button class="btn-remove-image" onclick="removeImage(this, '${qid}', 'question')">✖</button>
            `;
            preview.classList.remove('hidden');
            preview.dataset.image = event.target.result;
        };
        reader.readAsDataURL(file);
    };
}

function uploadAnswerImage(btn) {
    const row = btn.closest('.answer-row');
    const input = row.querySelector('.answer-image-input');
    input.click();
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const preview = row.querySelector('.image-preview');
            preview.innerHTML = `
                <img src="${event.target.result}" alt="Answer image">
                <button class="btn-remove-image" onclick="removeAnswerImage(this)">✖</button>
            `;
            preview.classList.remove('hidden');
            preview.dataset.image = event.target.result;
        };
        reader.readAsDataURL(file);
    };
}

function removeImage(btn, qid, target) {
    const card = document.querySelector(`[data-qid="${qid}"]`);
    const preview = card.querySelector('.question-input-wrapper .image-preview');
    preview.innerHTML = '';
    preview.classList.add('hidden');
    delete preview.dataset.image;
}

function removeAnswerImage(btn) {
    const preview = btn.closest('.image-preview');
    preview.innerHTML = '';
    preview.classList.add('hidden');
    delete preview.dataset.image;
}

// ==================== QUICK ADD ====================
function openQuickAdd() {
    document.getElementById('quick-add-dialog').classList.remove('hidden');
}

function closeQuickAdd() {
    document.getElementById('quick-add-dialog').classList.add('hidden');
    document.getElementById('quick-add-input').value = '';
}

function processQuickAdd() {
    const input = document.getElementById('quick-add-input').value.trim();
    if (!input) {
        alert('⚠️ Vui lòng nhập dữ liệu!');
        return;
    }
    
    const lines = input.split('\n').filter(line => line.trim());
    let addedCount = 0;
    let errorCount = 0;
    
    // Xóa tất cả câu hỏi trống trước khi thêm
    const allCards = Array.from(document.querySelectorAll('.question-card'));
    allCards.forEach(card => {
        const questionText = card.querySelector('.question-input').value.trim();
        const questionImage = card.querySelector('.question-input-wrapper .image-preview')?.dataset.image;
        const answerRows = card.querySelectorAll('.answer-row');
        
        let hasValidAnswer = false;
        answerRows.forEach(row => {
            const answerText = row.querySelector('.answer-input').value.trim();
            const answerImage = row.querySelector('.image-preview')?.dataset.image;
            if (answerText || answerImage) {
                hasValidAnswer = true;
            }
        });
        
        // Xóa nếu câu hỏi trống và không có đáp án hợp lệ
        if (!questionText && !questionImage && !hasValidAnswer) {
            card.remove();
        }
    });
    
    lines.forEach(line => {
        const parts = line.split('|').map(p => p.trim());
        
        if (parts.length < 3) {
            errorCount++;
            return;
        }
        
        const questionText = parts[0];
        const correctAnswerIndex = parts[parts.length - 1].toUpperCase();
        const answers = parts.slice(1, -1);
        
        if (answers.length < 2) {
            errorCount++;
            return;
        }
        
        // Xác định đáp án đúng
        const correctIndexMap = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5 };
        const correctIdx = correctIndexMap[correctAnswerIndex];
        
        if (correctIdx === undefined || correctIdx >= answers.length) {
            errorCount++;
            return;
        }
        
        // Tạo câu hỏi mới
        createQuestionCard();
        const card = DOM.questionsList.lastElementChild;
        card.querySelector('.question-input').value = questionText;
        
        const answersContainer = card.querySelector('.answers-container');
        answersContainer.innerHTML = '';
        
        answers.forEach((answer, index) => {
            addAnswerRow(answersContainer, card.dataset.qid);
            const row = answersContainer.lastElementChild;
            row.querySelector('.answer-input').value = answer;
            if (index === correctIdx) {
                row.querySelector('input[type="radio"]').checked = true;
            }
        });
        
        addedCount++;
    });
    
    // Đảm bảo luôn có ít nhất 1 câu hỏi
    if (document.querySelectorAll('.question-card').length === 0) {
        createQuestionCard();
    }
    
    // Đánh số lại các câu hỏi
    document.querySelectorAll('.question-card').forEach((card, index) => {
        card.querySelector('.question-number').textContent = `Câu hỏi ${index + 1}`;
    });
    
    if (addedCount > 0) {
        alert(`✅ Đã thêm ${addedCount} câu hỏi!${errorCount > 0 ? `\n⚠️ ${errorCount} dòng bị lỗi định dạng.` : ''}`);
        closeQuickAdd();
        saveToStorage();
    } else {
        alert('❌ Không có câu hỏi nào hợp lệ!\nKiểm tra lại định dạng.');
    }
}

// ==================== EXPORT/IMPORT DATA ====================
function exportData() {
    saveToStorage();
    const data = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (!data) {
        alert('⚠️ Không có dữ liệu để xuất!');
        return;
    }
    
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bubble-game-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    alert('✅ Đã xuất dữ liệu thành công!');
}

function importData() {
    const input = document.getElementById('import-file-input');
    input.click();
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                localStorage.setItem(CONFIG.STORAGE_KEY, event.target.result);
                
                if (loadFromStorage()) {
                    alert('✅ Đã nhập dữ liệu thành công!');
                } else {
                    alert('⚠️ Dữ liệu không hợp lệ!');
                }
            } catch (e) {
                alert('❌ Lỗi: File không đúng định dạng!');
            }
        };
        reader.readAsText(file);
    };
}

// ==================== BACKGROUND MUSIC (Web Audio) ====================
let bgMusicNodes = null;
let bgMusicEnabled = true;

// Giai điệu vui nhộn: C D E G A (pentatonic)
const MELODY = [
    // Bar 1
    { note: 523.25, dur: 0.25 }, // C5
    { note: 587.33, dur: 0.25 }, // D5
    { note: 659.25, dur: 0.25 }, // E5
    { note: 783.99, dur: 0.25 }, // G5
    // Bar 2
    { note: 880.00, dur: 0.25 }, // A5
    { note: 783.99, dur: 0.25 }, // G5
    { note: 659.25, dur: 0.25 }, // E5
    { note: 587.33, dur: 0.25 }, // D5
    // Bar 3
    { note: 523.25, dur: 0.25 }, // C5
    { note: 659.25, dur: 0.25 }, // E5
    { note: 783.99, dur: 0.5  }, // G5 (dài hơn)
    // Bar 4
    { note: 880.00, dur: 0.25 }, // A5
    { note: 783.99, dur: 0.25 }, // G5
    { note: 659.25, dur: 0.25 }, // E5
    { note: 523.25, dur: 0.5  }, // C5 (dài hơn)
];

// Bass line
const BASS = [
    { note: 130.81, dur: 0.5 }, // C3
    { note: 164.81, dur: 0.5 }, // E3
    { note: 196.00, dur: 0.5 }, // G3
    { note: 164.81, dur: 0.5 }, // E3
];

function startBgMusic() {
    if (!bgMusicEnabled) return;
    if (bgMusicNodes) return;
    
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContext.state === 'suspended') audioContext.resume();
        
        const masterGain = audioContext.createGain();
        masterGain.gain.value = 0.18;
        masterGain.connect(audioContext.destination);
        
        bgMusicNodes = { masterGain, stopped: false };
        
        scheduleMelody(masterGain);
        scheduleBass(masterGain);
        scheduleDrums(masterGain);
    } catch(e) {
        console.error('BG music error:', e);
    }
}

function scheduleMelody(masterGain) {
    if (!bgMusicNodes || bgMusicNodes.stopped) return;
    
    const totalDur = MELODY.reduce((s, n) => s + n.dur, 0);
    let t = audioContext.currentTime + 0.05;
    
    MELODY.forEach(({ note, dur }) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain); gain.connect(masterGain);
        osc.type = 'triangle';
        osc.frequency.value = note;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.6, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, t + dur * 0.85);
        osc.start(t);
        osc.stop(t + dur);
        t += dur;
    });
    
    // Lặp lại
    bgMusicNodes._melodyTimeout = setTimeout(() => scheduleMelody(masterGain), totalDur * 1000);
}

function scheduleBass(masterGain) {
    if (!bgMusicNodes || bgMusicNodes.stopped) return;
    
    const totalDur = BASS.reduce((s, n) => s + n.dur, 0);
    let t = audioContext.currentTime + 0.05;
    
    BASS.forEach(({ note, dur }) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain); gain.connect(masterGain);
        osc.type = 'sine';
        osc.frequency.value = note;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.5, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.01, t + dur * 0.8);
        osc.start(t);
        osc.stop(t + dur);
        t += dur;
    });
    
    bgMusicNodes._bassTimeout = setTimeout(() => scheduleBass(masterGain), totalDur * 1000);
}

function scheduleDrums(masterGain) {
    if (!bgMusicNodes || bgMusicNodes.stopped) return;
    
    const beatDur = 0.5;
    const beats = 8;
    let t = audioContext.currentTime + 0.05;
    
    for (let i = 0; i < beats; i++) {
        // Kick mỗi 2 beat
        if (i % 2 === 0) {
            const buf = audioContext.createBuffer(1, audioContext.sampleRate * 0.1, audioContext.sampleRate);
            const data = buf.getChannelData(0);
            for (let j = 0; j < data.length; j++) {
                data[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / data.length, 3);
            }
            const src = audioContext.createBufferSource();
            const gain = audioContext.createGain();
            src.buffer = buf;
            src.connect(gain); gain.connect(masterGain);
            gain.gain.setValueAtTime(0.8, t + i * beatDur);
            gain.gain.exponentialRampToValueAtTime(0.01, t + i * beatDur + 0.1);
            src.start(t + i * beatDur);
        }
        // Hi-hat mỗi beat
        const buf2 = audioContext.createBuffer(1, audioContext.sampleRate * 0.05, audioContext.sampleRate);
        const data2 = buf2.getChannelData(0);
        for (let j = 0; j < data2.length; j++) {
            data2[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / data2.length, 2);
        }
        const src2 = audioContext.createBufferSource();
        const gain2 = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 5000;
        src2.buffer = buf2;
        src2.connect(filter); filter.connect(gain2); gain2.connect(masterGain);
        gain2.gain.setValueAtTime(0.3, t + i * beatDur);
        gain2.gain.exponentialRampToValueAtTime(0.01, t + i * beatDur + 0.05);
        src2.start(t + i * beatDur);
    }
    
    bgMusicNodes._drumTimeout = setTimeout(() => scheduleDrums(masterGain), beats * beatDur * 1000);
}

function stopBgMusic() {
    if (!bgMusicNodes) return;
    bgMusicNodes.stopped = true;
    clearTimeout(bgMusicNodes._melodyTimeout);
    clearTimeout(bgMusicNodes._bassTimeout);
    clearTimeout(bgMusicNodes._drumTimeout);
    try {
        bgMusicNodes.masterGain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.3);
    } catch(e) {}
    bgMusicNodes = null;
}

function toggleBgMusic() {
    bgMusicEnabled = !bgMusicEnabled;
    const btn = document.getElementById('toggle-bg-music-btn');
    if (bgMusicEnabled) {
        btn.textContent = '🎵';
        btn.title = 'Tắt nhạc nền';
        btn.classList.remove('muted');
        // Chỉ unmute, không restart
        if (bgMusicNodes) {
            bgMusicNodes.masterGain.gain.value = 0.18;
        } else if (backgroundMusic) {
            backgroundMusic.muted = false;
        } else {
            startGameMusic();
        }
    } else {
        btn.textContent = '🔇';
        btn.title = 'Bật nhạc nền';
        btn.classList.add('muted');
        // Chỉ mute, không dừng
        if (bgMusicNodes) {
            bgMusicNodes.masterGain.gain.value = 0;
        }
        if (backgroundMusic) {
            backgroundMusic.muted = true;
        }
    }
}

let backgroundMusic = null;
let musicData = null;

function uploadMusic() {
    const input = document.getElementById('music-upload');
    input.click();
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            musicData = {
                name: file.name,
                data: event.target.result
            };
            localStorage.setItem('bubble_game_music', JSON.stringify(musicData));
            updateMusicControls();
            alert('✅ Đã tải nhạc lên thành công!');
        };
        reader.readAsDataURL(file);
    };
}

function updateMusicControls() {
    const controls = document.getElementById('music-controls');
    const nameEl = document.getElementById('music-name');
    
    if (musicData) {
        controls.classList.remove('hidden');
        nameEl.textContent = musicData.name;
        if (!backgroundMusic) {
            backgroundMusic = new Audio(musicData.data);
            backgroundMusic.loop = true;
            backgroundMusic.volume = 0.3;
        }
    } else {
        controls.classList.add('hidden');
    }
}

function toggleMusic() {
    if (!backgroundMusic) return;
    const toggleBtn = document.getElementById('toggle-music-btn');
    if (backgroundMusic.paused) {
        backgroundMusic.play();
        toggleBtn.textContent = '⏸️ Dừng';
    } else {
        backgroundMusic.pause();
        toggleBtn.textContent = '▶️ Phát';
    }
}

function removeMusic() {
    if (backgroundMusic) {
        backgroundMusic.pause();
        backgroundMusic = null;
    }
    musicData = null;
    localStorage.removeItem('bubble_game_music');
    updateMusicControls();
    document.getElementById('toggle-music-btn').textContent = '▶️ Phát';
}

function loadMusic() {
    try {
        const saved = localStorage.getItem('bubble_game_music');
        if (saved) {
            musicData = JSON.parse(saved);
            updateMusicControls();
        }
    } catch (e) {
        console.error('Load music error:', e);
    }
}

// Bắt đầu nhạc khi vào game: ưu tiên nhạc user, fallback nhạc mặc định
function startGameMusic() {
    if (!bgMusicEnabled) return;
    
    if (musicData && musicData.data) {
        // Dùng nhạc user tải lên
        stopBgMusic(); // Dừng nhạc mặc định nếu đang chạy
        if (!backgroundMusic) {
            backgroundMusic = new Audio(musicData.data);
            backgroundMusic.loop = true;
            backgroundMusic.volume = 0.3;
        }
        backgroundMusic.currentTime = 0;
        backgroundMusic.play().catch(e => console.error(e));
    } else {
        // Dùng nhạc mặc định
        startBgMusic();
    }
}

// Dừng tất cả nhạc
function stopGameMusic() {
    if (backgroundMusic && !backgroundMusic.paused) {
        backgroundMusic.pause();
        backgroundMusic.currentTime = 0;
    }
    stopBgMusic();
}

// ==================== GAME LOGIC ====================

class Bubble {
    constructor(text, isCorrect, image = null) {
        this.text = text;
        this.isCorrect = isCorrect;
        this.image = image;
        this.x = Math.random() * (DOM.canvas.width - 300) + 150;
        this.y = DOM.canvas.height + 150;
        this.radius = CONFIG.BUBBLE_SIZE_MIN + Math.random() * (CONFIG.BUBBLE_SIZE_MAX - CONFIG.BUBBLE_SIZE_MIN);
        this.speed = CONFIG.BUBBLE_SPEED_MIN + Math.random() * (CONFIG.BUBBLE_SPEED_MAX - CONFIG.BUBBLE_SPEED_MIN);
        this.wobble = Math.random() * Math.PI * 2;
        this.wobbleSpeed = 0.015 + Math.random() * 0.015;
        this.hue = Math.random() * 360;
        this.popped = false;
        this.imageObj = null;
        // Trạng thái bóp sai
        this.wrongHit = false;
        this.wrongTimer = 0;
        this.shakeOffset = 0;
        
        if (this.image) {
            this.imageObj = new Image();
            this.imageObj.src = this.image;
        }
    }
    
    update() {
        this.y -= this.speed;
        this.wobble += this.wobbleSpeed;
        
        if (this.wrongHit) {
            this.wrongTimer++;
            this.shakeOffset = Math.sin(this.wrongTimer * 1.8) * 14 * (1 - this.wrongTimer / 30);
            if (this.wrongTimer >= 30) {
                this.wrongHit = false;
                this.shakeOffset = 0;
            }
        } else {
            this.x += Math.sin(this.wobble) * 0.4;
        }
        
        this.hue = (this.hue + 0.3) % 360;
    }
    
    draw() {
        if (this.popped) return;
        
        const x = this.x + this.shakeOffset;
        const y = this.y;
        const r = this.radius;
        
        // Đỏ khi bóp sai, màu bình thường khi không
        const hue = this.wrongHit ? 0 : this.hue;
        
        const gradient = ctx.createRadialGradient(
            x - r * 0.3, y - r * 0.3, r * 0.1,
            x, y, r
        );
        if (this.wrongHit) {
            gradient.addColorStop(0, 'hsla(0, 100%, 75%, 0.95)');
            gradient.addColorStop(0.5, 'hsla(0, 100%, 50%, 0.85)');
            gradient.addColorStop(1, 'hsla(0, 100%, 30%, 0.9)');
        } else {
            gradient.addColorStop(0, `hsla(${hue}, 100%, 80%, 0.9)`);
            gradient.addColorStop(0.5, `hsla(${hue + 30}, 100%, 60%, 0.7)`);
            gradient.addColorStop(1, `hsla(${hue + 60}, 100%, 40%, 0.8)`);
        }
        
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Viền đỏ dày khi sai
        ctx.strokeStyle = this.wrongHit ? 'rgba(255, 30, 30, 1)' : `hsla(${hue}, 80%, 90%, 0.6)`;
        ctx.lineWidth = this.wrongHit ? 6 : 3;
        if (this.wrongHit) {
            ctx.shadowColor = '#ff0000';
            ctx.shadowBlur = 20;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // Highlight
        ctx.beginPath();
        ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fill();
        
        // Dấu X trắng to khi bóp sai
        if (this.wrongHit) {
            const alpha = Math.min(1, this.wrongTimer / 5);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 7;
            ctx.lineCap = 'round';
            ctx.shadowColor = '#ff0000';
            ctx.shadowBlur = 20;
            const s = r * 0.42;
            ctx.beginPath();
            ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
            ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
            ctx.stroke();
            ctx.restore();
            return; // Không vẽ nội dung khi đang hiệu ứng sai
        }
        
        // Nội dung bình thường
        if (this.imageObj && this.imageObj.complete) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
            ctx.clip();
            const imgSize = r * 1.4;
            ctx.drawImage(this.imageObj, x - imgSize/2, y - imgSize/2, imgSize, imgSize);
            ctx.restore();
        } else if (this.text) {
            const maxTextWidth = r * 1.6;
            let fontSize = Math.max(18, r * 0.45);
            ctx.font = `bold ${fontSize}px Arial`;
            let textWidth = ctx.measureText(this.text).width;
            while (textWidth > maxTextWidth && fontSize > 14) {
                fontSize -= 1;
                ctx.font = `bold ${fontSize}px Arial`;
                textWidth = ctx.measureText(this.text).width;
            }
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 8;
            ctx.fillText(this.text, x, y);
            ctx.shadowBlur = 0;
        }
    }
    
    triggerWrongHit() {
        this.wrongHit = true;
        this.wrongTimer = 0;
        this.shakeOffset = 0;
    }
    
    isOffScreen() {
        return this.y < -this.radius * 2;
    }
    
    contains(px, py) {
        const dx = px - this.x;
        const dy = py - this.y;
        return dx * dx + dy * dy < this.radius * this.radius;
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 10;
        this.vy = (Math.random() - 0.5) * 10 - 2;
        this.radius = Math.random() * 4 + 2;
        this.color = color;
        this.life = 1;
        this.decay = Math.random() * 0.02 + 0.01;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.2;
        this.vx *= 0.98;
        this.life -= this.decay;
    }
    
    draw() {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    
    isDead() {
        return this.life <= 0;
    }
}

// Hiệu ứng text bay lên
class TextParticle {
    constructor(x, y, text, color) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.life = 1;
        this.vy = -3;
        this.scale = 0.5;
    }
    
    update() {
        this.y += this.vy;
        this.vy *= 0.95;
        this.life -= 0.015;
        
        // Scale tăng dần rồi giảm
        if (this.scale < 1.5) {
            this.scale += 0.08;
        }
    }
    
    draw() {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.font = `bold ${40 * this.scale}px Arial`;
        ctx.fillStyle = this.color;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 20;
        
        ctx.strokeText(this.text, this.x, this.y);
        ctx.fillText(this.text, this.x, this.y);
        
        ctx.restore();
    }
    
    isDead() {
        return this.life <= 0;
    }
}

// Hiệu ứng vòng tròn lan tỏa
class RippleEffect {
    constructor(x, y, isCorrect) {
        this.x = x;
        this.y = y;
        this.radius = 0;
        this.maxRadius = 200;
        this.color = isCorrect ? '#00ff88' : '#ff4444';
        this.life = 1;
    }
    
    update() {
        this.radius += 8;
        this.life -= 0.02;
    }
    
    draw() {
        ctx.save();
        ctx.globalAlpha = this.life * 0.6;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 6;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Vòng tròn thứ 2 nhỏ hơn
        ctx.globalAlpha = this.life * 0.4;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
    }
    
    isDead() {
        return this.life <= 0 || this.radius > this.maxRadius;
    }
}

function createParticles(x, y, isCorrect) {
    const colors = isCorrect 
        ? ['#00ff88', '#00ffcc', '#88ff00', '#ffff00', '#fff', '#00ff44']
        : ['#ff4444', '#ff8800', '#ff0088', '#ff0000', '#cc0000', '#880000'];
    
    // Tạo nhiều particles hơn
    for (let i = 0; i < 50; i++) {
        const color = colors[Math.floor(Math.random() * colors.length)];
        gameState.particles.push(new Particle(x, y, color));
    }
    
    // Thêm hiệu ứng text bay lên
    const feedbackText = isCorrect ? '✓ ĐÚNG!' : '✗ SAI!';
    const feedbackColor = isCorrect ? '#00ff88' : '#ff4444';
    gameState.particles.push(new TextParticle(x, y, feedbackText, feedbackColor));
    
    // Thêm hiệu ứng vòng tròn lan tỏa
    gameState.particles.push(new RippleEffect(x, y, isCorrect));
}

function playSound(isCorrect) {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (isCorrect) {
            // Âm thanh ĐÚNG - giai điệu vui tươi, tăng dần
            const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
            notes.forEach((freq, index) => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.frequency.value = freq;
                oscillator.type = 'sine';
                
                const startTime = audioContext.currentTime + index * 0.1;
                gainNode.gain.setValueAtTime(0, startTime);
                gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
                gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
                
                oscillator.start(startTime);
                oscillator.stop(startTime + 0.3);
            });
        } else {
            // Âm thanh SAI - âm trầm, giảm dần, có rung
            const oscillator1 = audioContext.createOscillator();
            const oscillator2 = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator1.connect(gainNode);
            oscillator2.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator1.frequency.value = 150;
            oscillator2.frequency.value = 155; // Tạo hiệu ứng rung
            oscillator1.type = 'sawtooth';
            oscillator2.type = 'sawtooth';
            
            gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            oscillator1.start();
            oscillator2.start();
            oscillator1.stop(audioContext.currentTime + 0.5);
            oscillator2.stop(audioContext.currentTime + 0.5);
        }
    } catch (e) {
        console.error('Audio error:', e);
    }
}

function spawnBubble() {
    if (gameState.bubbles.length >= CONFIG.MAX_BUBBLES) return;
    if (!gameData.questions[gameState.currentQuestionIndex]) return;
    
    const currentQ = gameData.questions[gameState.currentQuestionIndex];
    const allAnswers = [...currentQ.answers];
    const randomAnswer = allAnswers[Math.floor(Math.random() * allAnswers.length)];
    
    // Lấy text và image từ answer
    const answerText = randomAnswer.text || '';
    const answerImage = randomAnswer.image || null;
    
    // So sánh với correctAnswer (cũng là object)
    const isCorrect = (randomAnswer.text === currentQ.correctAnswer.text && 
                       randomAnswer.image === currentQ.correctAnswer.image);
    
    // Thử tìm vị trí không bị chồng lên bong bóng khác
    let attempts = 0;
    let validPosition = false;
    let newBubble;
    
    while (!validPosition && attempts < 20) {
        newBubble = new Bubble(answerText, isCorrect, answerImage);
        validPosition = true;
        
        // Kiểm tra khoảng cách với các bong bóng hiện có
        for (let bubble of gameState.bubbles) {
            const dx = newBubble.x - bubble.x;
            const dy = newBubble.y - bubble.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDistance = newBubble.radius + bubble.radius + CONFIG.MIN_BUBBLE_DISTANCE;
            
            if (distance < minDistance) {
                validPosition = false;
                break;
            }
        }
        
        attempts++;
    }
    
    if (validPosition && newBubble) {
        gameState.bubbles.push(newBubble);
    }
}

function startTimer() {
    gameState.timeRemaining = gameData.timeLimit;
    updateTimerDisplay();
    
    gameState.timerInterval = setInterval(() => {
        gameState.timeRemaining--;
        updateTimerDisplay();
        
        if (gameState.timeRemaining <= 0) {
            onTimeout();
        }
    }, 1000);
}

function stopTimer() {
    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
        gameState.timerInterval = null;
    }
}

function updateTimerDisplay() {
    const percent = (gameState.timeRemaining / gameData.timeLimit) * 100;
    const circumference = 220; // 2 * PI * 35 (radius)
    const offset = circumference - (percent / 100) * circumference;
    
    DOM.timerCircle.style.strokeDashoffset = offset;
    DOM.timerText.textContent = gameState.timeRemaining;
    
    DOM.timerCircle.classList.remove('warning', 'danger');
    if (percent <= 30) {
        DOM.timerCircle.classList.add('danger');
    } else if (percent <= 50) {
        DOM.timerCircle.classList.add('warning');
    }
}

function onTimeout() {
    if (gameState.questionAnswered) return;
    
    stopTimer();
    gameState.wrongCount++;
    gameState.score = Math.max(0, gameState.score - 5);
    DOM.scoreEl.textContent = gameState.score;
    
    createParticles(DOM.canvas.width / 2, DOM.canvas.height / 2, false);
    playSound(false);
    shakeScreen();
    flashScreen('#ff4444', 0.5);
    
    setTimeout(nextQuestion, 1500);
}

// Hiệu ứng rung màn hình
function shakeScreen() {
    const gameScreen = DOM.gameScreen;
    gameScreen.style.animation = 'shake 0.5s';
    setTimeout(() => {
        gameScreen.style.animation = '';
    }, 500);
}

// Hiệu ứng flash màn hình
function flashScreen(color, opacity) {
    const flash = document.createElement('div');
    flash.style.position = 'fixed';
    flash.style.top = '0';
    flash.style.left = '0';
    flash.style.width = '100vw';
    flash.style.height = '100vh';
    flash.style.backgroundColor = color;
    flash.style.opacity = opacity;
    flash.style.pointerEvents = 'none';
    flash.style.zIndex = '999';
    flash.style.transition = 'opacity 0.3s';
    
    document.body.appendChild(flash);
    
    setTimeout(() => {
        flash.style.opacity = '0';
        setTimeout(() => {
            document.body.removeChild(flash);
        }, 300);
    }, 100);
}

function loadQuestion() {
    if (gameState.currentQuestionIndex >= gameData.questions.length) {
        showResults();
        return;
    }
    
    gameState.questionAnswered = false;
    const question = gameData.questions[gameState.currentQuestionIndex];
    
    // Hiển thị text câu hỏi (nếu có)
    DOM.questionText.textContent = question.text || '';
    DOM.questionText.style.display = question.text ? 'block' : 'none';
    
    // Hiển thị image câu hỏi (nếu có)
    const questionImageContainer = document.getElementById('question-image-container');
    const questionImage = document.getElementById('question-image');
    
    if (question.image) {
        questionImage.src = question.image;
        questionImageContainer.classList.remove('hidden');
    } else {
        questionImageContainer.classList.add('hidden');
    }
    
    DOM.currentQEl.textContent = gameState.currentQuestionIndex + 1;
    
    gameState.bubbles = [];
    startTimer();
}

function nextQuestion() {
    stopTimer();
    gameState.currentQuestionIndex++;
    gameState.bubbles = [];
    gameState.particles = [];
    
    setTimeout(loadQuestion, 500);
}

function checkBubbleCollision(x, y) {
    if (gameState.questionAnswered) return;
    
    // Kiểm tra từ gần nhất đến xa nhất
    let closestBubble = null;
    let closestDistance = Infinity;
    
    for (let i = 0; i < gameState.bubbles.length; i++) {
        const bubble = gameState.bubbles[i];
        if (bubble.popped) continue;
        
        const dx = x - bubble.x;
        const dy = y - bubble.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < bubble.radius && distance < closestDistance) {
            closestBubble = bubble;
            closestDistance = distance;
        }
    }
    
    if (closestBubble) {
        if (closestBubble.isCorrect) {
            // ĐÚNG: nổ bong bóng
            closestBubble.popped = true;
            gameState.questionAnswered = true;
            stopTimer();
            
            gameState.score += 10;
            gameState.correctCount++;
            createParticles(closestBubble.x, closestBubble.y, true);
            playSound(true);
            flashScreen('#00ff88', 0.25);
            
            DOM.scoreEl.textContent = gameState.score;
            
            const index = gameState.bubbles.indexOf(closestBubble);
            if (index > -1) gameState.bubbles.splice(index, 1);
            
            setTimeout(nextQuestion, 1000);
        } else {
            // SAI: bong bóng không nổ, rung lắc + đỏ
            closestBubble.triggerWrongHit();
            gameState.questionAnswered = true;
            stopTimer();
            
            gameState.score = Math.max(0, gameState.score - 5);
            gameState.wrongCount++;
            createParticles(closestBubble.x, closestBubble.y, false);
            playSound(false);
            shakeScreen();
            flashScreen('#ff4444', 0.45);
            
            DOM.scoreEl.textContent = gameState.score;
            
            setTimeout(nextQuestion, 1200);
        }
    }
}

// ==================== MEDIAPIPE ====================
let lastHandCheckTime = 0;

function setupMediaPipe() {
    hands = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });
    
    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 0,           // Giữ model nhẹ
        minDetectionConfidence: 0.6,  // Tăng độ tin cậy phát hiện
        minTrackingConfidence: 0.6    // Tăng độ tin cậy tracking
    });
    
    hands.onResults(onHandsResults);
    
    camera = new Camera(DOM.webcam, {
        onFrame: async () => {
            await hands.send({ image: DOM.webcam });
        },
        width: 640,
        height: 480
    });
}

function onHandsResults(results) {
    gameState.hands = results.multiHandLandmarks || [];
}

function detectPinch() {
    const now = performance.now();
    
    // Kiểm tra mỗi 30ms để cân bằng giữa độ nhạy và hiệu năng
    if (now - lastHandCheckTime < 30) return;
    lastHandCheckTime = now;
    
    gameState.hands.forEach(landmarks => {
        const thumb = landmarks[4];
        const index = landmarks[8];
        
        const thumbX = (1 - thumb.x) * DOM.canvas.width;
        const thumbY = thumb.y * DOM.canvas.height;
        const indexX = (1 - index.x) * DOM.canvas.width;
        const indexY = index.y * DOM.canvas.height;
        
        const dx = thumbX - indexX;
        const dy = thumbY - indexY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < CONFIG.PINCH_THRESHOLD) {
            const pinchX = (thumbX + indexX) / 2;
            const pinchY = (thumbY + indexY) / 2;
            
            checkBubbleCollision(pinchX, pinchY);
            drawPinchEffect(pinchX, pinchY);
        } else {
            drawFingers(thumbX, thumbY, indexX, indexY);
        }
    });
}

function drawFingers(tx, ty, ix, iy) {
    if (!gameState.showHandTracking) return;
    
    // Ngón cái - lớn hơn
    ctx.fillStyle = 'rgba(255, 80, 80, 0.85)';
    ctx.beginPath();
    ctx.arc(tx, ty, 15, 0, Math.PI * 2);
    ctx.fill();
    
    // Ngón trỏ - lớn hơn
    ctx.fillStyle = 'rgba(80, 255, 80, 0.85)';
    ctx.beginPath();
    ctx.arc(ix, iy, 15, 0, Math.PI * 2);
    ctx.fill();
    
    // Đường nối
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(ix, iy);
    ctx.stroke();
}

function drawPinchEffect(x, y) {
    if (!gameState.showHandTracking) return;
    
    // Hiệu ứng pinch lớn và rõ hơn
    ctx.fillStyle = 'rgba(255, 255, 0, 0.95)';
    ctx.shadowColor = 'rgba(255, 255, 0, 1)';
    ctx.shadowBlur = 25;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();
    
    // Vòng tròn ngoài
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.shadowBlur = 0;
}

// ==================== GAME LOOP ====================
function gameLoop(timestamp) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    if (DOM.canvas.width !== width || DOM.canvas.height !== height) {
        DOM.canvas.width = width;
        DOM.canvas.height = height;
    }
    
    ctx.clearRect(0, 0, width, height);
    
    if (gameState.isPlaying) {
        // Detect pinch continuously
        if (gameState.hands.length > 0) {
            detectPinch();
        }
        
        // Spawn bubbles
        if (timestamp - gameState.lastSpawnTime > CONFIG.BUBBLE_SPAWN_INTERVAL) {
            spawnBubble();
            gameState.lastSpawnTime = timestamp;
        }
        
        // Update and draw bubbles
        for (let i = gameState.bubbles.length - 1; i >= 0; i--) {
            const bubble = gameState.bubbles[i];
            if (!bubble.popped) {
                bubble.update();
                bubble.draw();
                
                if (bubble.isOffScreen()) {
                    gameState.bubbles.splice(i, 1);
                }
            }
        }
        
        // Update and draw particles
        for (let i = gameState.particles.length - 1; i >= 0; i--) {
            const particle = gameState.particles[i];
            particle.update();
            particle.draw();
            
            if (particle.isDead()) {
                gameState.particles.splice(i, 1);
            }
        }
    }
    
    requestAnimationFrame(gameLoop);
}

// ==================== GAME FLOW ====================
async function startGame() {
    if (!validateSetup()) return;
    
    // Switch screens
    DOM.setupScreen.classList.remove('active');
    DOM.gameScreen.classList.add('active');
    DOM.resultScreen.classList.add('hidden');
    
    // Reset game state
    gameState.isPlaying = true;
    gameState.score = 0;
    gameState.currentQuestionIndex = 0;
    gameState.correctCount = 0;
    gameState.wrongCount = 0;
    gameState.bubbles = [];
    gameState.particles = [];
    
    DOM.scoreEl.textContent = '0';
    DOM.currentQEl.textContent = '0';
    DOM.totalQEl.textContent = gameData.questions.length;
    
    // Setup MediaPipe if not already done
    if (!camera) {
        setupMediaPipe();
    }
    
    await camera.start();
    startGameMusic();
    loadQuestion();
}

function showResults() {
    gameState.isPlaying = false;
    stopTimer();
    stopGameMusic();
    
    DOM.resultScreen.classList.remove('hidden');
    DOM.finalScore.textContent = gameState.score;
    DOM.correctCountEl.textContent = gameState.correctCount;
    DOM.wrongCountEl.textContent = gameState.wrongCount;
    
    const accuracy = gameData.questions.length > 0
        ? Math.round((gameState.correctCount / gameData.questions.length) * 100)
        : 0;
    DOM.accuracyEl.textContent = accuracy + '%';
}

function goHome() {
    if (!confirm('Quay về trang chủ? Tiến trình sẽ bị mất.')) return;
    
    stopTimer();
    stopGameMusic();
    gameState.isPlaying = false;
    gameState.bubbles = [];
    gameState.particles = [];
    
    if (camera) {
        camera.stop();
    }
    
    DOM.gameScreen.classList.remove('active');
    DOM.setupScreen.classList.add('active');
}

function playAgain() {
    DOM.resultScreen.classList.add('hidden');
    
    gameState.score = 0;
    gameState.currentQuestionIndex = 0;
    gameState.correctCount = 0;
    gameState.wrongCount = 0;
    gameState.bubbles = [];
    gameState.particles = [];
    gameState.isPlaying = true;
    
    DOM.scoreEl.textContent = '0';
    DOM.currentQEl.textContent = '0';
    
    loadQuestion();
}

function backToSetup() {
    stopTimer();
    gameState.isPlaying = false;
    
    if (camera) {
        camera.stop();
    }
    
    DOM.gameScreen.classList.remove('active');
    DOM.setupScreen.classList.add('active');
}

// ==================== EVENT LISTENERS ====================
DOM.addQuestionBtn.addEventListener('click', createQuestionCard);
DOM.startGameBtn.addEventListener('click', startGame);
DOM.clearAllBtn.addEventListener('click', clearAll);
DOM.homeBtn.addEventListener('click', goHome);
DOM.playAgainBtn.addEventListener('click', playAgain);
DOM.backSetupBtn.addEventListener('click', backToSetup);

// Quick add
document.getElementById('quick-add-btn').addEventListener('click', openQuickAdd);
document.getElementById('close-quick-add').addEventListener('click', closeQuickAdd);
document.getElementById('process-quick-add').addEventListener('click', processQuickAdd);

// Export/Import
document.getElementById('export-data-btn').addEventListener('click', exportData);
document.getElementById('import-data-btn').addEventListener('click', importData);

// Music
document.getElementById('upload-music-btn').addEventListener('click', uploadMusic);
document.getElementById('toggle-music-btn').addEventListener('click', toggleMusic);
document.getElementById('remove-music-btn').addEventListener('click', removeMusic);

// Toggle hand tracking visualization
DOM.toggleHandsBtn.addEventListener('click', () => {
    gameState.showHandTracking = !gameState.showHandTracking;
    DOM.toggleHandsBtn.classList.toggle('active', gameState.showHandTracking);
    DOM.toggleHandsBtn.textContent = gameState.showHandTracking ? '✋' : '🚫';
});

window.addEventListener('resize', () => {
    DOM.canvas.width = window.innerWidth;
    DOM.canvas.height = window.innerHeight;
});

// Make functions global for onclick handlers
window.addAnswer = addAnswer;
window.removeAnswerRow = removeAnswerRow;
window.removeQuestion = removeQuestion;
window.uploadImage = uploadImage;
window.uploadAnswerImage = uploadAnswerImage;
window.removeImage = removeImage;
window.removeAnswerImage = removeAnswerImage;

// ==================== INITIALIZATION ====================
function init() {
    DOM.canvas.width = window.innerWidth;
    DOM.canvas.height = window.innerHeight;
    
    // Load saved data or create first question
    if (!loadFromStorage()) {
        createQuestionCard();
    }
    
    // Load music
    loadMusic();
    
    // Start game loop
    requestAnimationFrame(gameLoop);
}

// Start the app
init();
