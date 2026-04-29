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
        const answerRows = card.querySelectorAll('.answer-row');
        
        const question = {
            text: questionInput.value.trim(),
            answers: []
        };
        
        let correctAnswer = null;
        answerRows.forEach(row => {
            const radio = row.querySelector('input[type="radio"]');
            const input = row.querySelector('.answer-input');
            const text = input.value.trim();
            
            if (text) {
                question.answers.push(text);
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
                
                const answersContainer = card.querySelector('.answers-container');
                answersContainer.innerHTML = '';
                
                q.answers.forEach((answer, index) => {
                    addAnswerRow(answersContainer, card.dataset.qid);
                    const row = answersContainer.lastElementChild;
                    row.querySelector('.answer-input').value = answer;
                    if (answer === q.correctAnswer) {
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
        <input type="text" class="question-input" placeholder="Nhập nội dung câu hỏi...">
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
        <button class="btn-remove-answer" onclick="removeAnswerRow(this)">✖</button>
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
        
        if (!questionText) {
            showError(questionInput, 'Vui lòng nhập câu hỏi!');
            isValid = false;
            return;
        }
        
        const answerRows = card.querySelectorAll('.answer-row');
        const answers = [];
        let correctAnswer = null;
        
        answerRows.forEach(row => {
            const radio = row.querySelector('input[type="radio"]');
            const input = row.querySelector('.answer-input');
            const text = input.value.trim();
            
            if (text) {
                answers.push(text);
                if (radio.checked) {
                    correctAnswer = text;
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
            text: questionText,
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

// ==================== GAME LOGIC ====================

class Bubble {
    constructor(text, isCorrect) {
        this.text = text;
        this.isCorrect = isCorrect;
        this.x = Math.random() * (DOM.canvas.width - 300) + 150;
        this.y = DOM.canvas.height + 150;
        this.radius = CONFIG.BUBBLE_SIZE_MIN + Math.random() * (CONFIG.BUBBLE_SIZE_MAX - CONFIG.BUBBLE_SIZE_MIN);
        this.speed = CONFIG.BUBBLE_SPEED_MIN + Math.random() * (CONFIG.BUBBLE_SPEED_MAX - CONFIG.BUBBLE_SPEED_MIN);
        this.wobble = Math.random() * Math.PI * 2;
        this.wobbleSpeed = 0.015 + Math.random() * 0.015;
        this.hue = Math.random() * 360;
        this.popped = false;
    }
    
    update() {
        this.y -= this.speed;
        this.wobble += this.wobbleSpeed;
        this.x += Math.sin(this.wobble) * 0.4;
        this.hue = (this.hue + 0.3) % 360;
    }
    
    draw() {
        if (this.popped) return;
        
        const x = this.x;
        const y = this.y;
        const r = this.radius;
        
        // Gradient
        const gradient = ctx.createRadialGradient(
            x - r * 0.3, y - r * 0.3, r * 0.1,
            x, y, r
        );
        gradient.addColorStop(0, `hsla(${this.hue}, 100%, 80%, 0.9)`);
        gradient.addColorStop(0.5, `hsla(${this.hue + 30}, 100%, 60%, 0.7)`);
        gradient.addColorStop(1, `hsla(${this.hue + 60}, 100%, 40%, 0.8)`);
        
        // Draw bubble
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Border
        ctx.strokeStyle = `hsla(${this.hue}, 80%, 90%, 0.6)`;
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Highlight
        ctx.beginPath();
        ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fill();
        
        // Text - Tự động điều chỉnh size
        const maxTextWidth = r * 1.6;
        let fontSize = Math.max(18, r * 0.45);
        ctx.font = `bold ${fontSize}px Arial`;
        
        // Giảm font size nếu text quá dài
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

function createParticles(x, y, isCorrect) {
    const colors = isCorrect 
        ? ['#00ff88', '#00ffcc', '#88ff00', '#ffff00', '#fff']
        : ['#ff4444', '#ff8800', '#ff0088', '#fff'];
    
    for (let i = 0; i < 30; i++) {
        const color = colors[Math.floor(Math.random() * colors.length)];
        gameState.particles.push(new Particle(x, y, color));
    }
}

function playSound(isCorrect) {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        if (isCorrect) {
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.2);
        } else {
            oscillator.frequency.value = 200;
            oscillator.type = 'sawtooth';
            gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.3);
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
    const isCorrect = randomAnswer === currentQ.correctAnswer;
    
    // Thử tìm vị trí không bị chồng lên bong bóng khác
    let attempts = 0;
    let validPosition = false;
    let newBubble;
    
    while (!validPosition && attempts < 20) {
        newBubble = new Bubble(randomAnswer, isCorrect);
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
    
    setTimeout(nextQuestion, 1500);
}

function loadQuestion() {
    if (gameState.currentQuestionIndex >= gameData.questions.length) {
        showResults();
        return;
    }
    
    gameState.questionAnswered = false;
    const question = gameData.questions[gameState.currentQuestionIndex];
    
    DOM.questionText.textContent = question.text;
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
        closestBubble.popped = true;
        gameState.questionAnswered = true;
        stopTimer();
        
        if (closestBubble.isCorrect) {
            gameState.score += 10;
            gameState.correctCount++;
            createParticles(closestBubble.x, closestBubble.y, true);
            playSound(true);
        } else {
            gameState.score = Math.max(0, gameState.score - 5);
            gameState.wrongCount++;
            createParticles(closestBubble.x, closestBubble.y, false);
            playSound(false);
        }
        
        DOM.scoreEl.textContent = gameState.score;
        
        // Remove bubble
        const index = gameState.bubbles.indexOf(closestBubble);
        if (index > -1) {
            gameState.bubbles.splice(index, 1);
        }
        
        setTimeout(nextQuestion, 1000);
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
    loadQuestion();
}

function showResults() {
    gameState.isPlaying = false;
    stopTimer();
    
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

// ==================== INITIALIZATION ====================
function init() {
    DOM.canvas.width = window.innerWidth;
    DOM.canvas.height = window.innerHeight;
    
    // Load saved data or create first question
    if (!loadFromStorage()) {
        createQuestionCard();
    }
    
    // Start game loop
    requestAnimationFrame(gameLoop);
}

// Start the app
init();
