// JobMate Frontend Application
// Auto-detect API URL based on current host
const API_BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000'
  : window.location.origin;

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBqsjyXHLtYUbzUeZ4HnsT8awjoI-BVQ8U",
  authDomain: "jobmatee-64027.firebaseapp.com",
  projectId: "jobmatee-64027",
  storageBucket: "jobmatee-64027.firebasestorage.app",
  messagingSenderId: "459203161978",
  appId: "1:459203161978:web:a533a9afaa0819ac44f0c3",
  measurementId: "G-G5WX61SLH6"
};

// Get user's timezone
function getUserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (e) {
    return 'Australia/Sydney'; // Default to Australia, not UTC
  }
}

// State
const state = {
  user: null,
  token: null,
  projects: [],
  currentProject: null,
  notes: [],
  reminders: [],
  chatMessages: [],
  uploadedFile: null,
  timezone: getUserTimezone(), // Auto-detect timezone
  currentCheckin: null, // Current check-in context for replies
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// DOM Elements
const elements = {
  authScreen: document.getElementById('auth-screen'),
  mainScreen: document.getElementById('main-screen'),
  signinForm: document.getElementById('signin-form'),
  signupForm: document.getElementById('signup-form'),
  authError: document.getElementById('auth-error'),
  googleSigninBtn: document.getElementById('google-signin-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  userName: document.getElementById('user-name'),
  userEmail: document.getElementById('user-email'),
  userAvatar: document.getElementById('user-avatar'),
  chatMessages: document.getElementById('chat-messages'),
  chatInput: document.getElementById('chat-input'),
  sendBtn: document.getElementById('send-btn'),
  fileUpload: document.getElementById('file-upload'),
  uploadPreview: document.getElementById('upload-preview'),
  chatProjectSelect: document.getElementById('chat-project-select'),
  projectsList: document.getElementById('projects-list'),
  notesList: document.getElementById('notes-list'),
  remindersList: document.getElementById('reminders-list'),
  scheduleTimeline: document.getElementById('schedule-timeline'),
  scheduleDate: document.getElementById('schedule-date'),
  modalOverlay: document.getElementById('modal-overlay'),
  modal: document.getElementById('modal'),
  modalTitle: document.getElementById('modal-title'),
  modalContent: document.getElementById('modal-content'),
  toastContainer: document.getElementById('toast-container'),
};

// ============ API Helper ============
async function api(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  
  // Remove Content-Type for FormData
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || 'Request failed');
  }
  
  return response.json();
}

// ============ Toast Notifications ============
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);
  
  setTimeout(() => toast.remove(), 4000);
}

// ============ Modal ============
function showModal(title, content) {
  elements.modalTitle.textContent = title;
  elements.modalContent.innerHTML = content;
  elements.modalOverlay.classList.add('show');
}

function hideModal() {
  elements.modalOverlay.classList.remove('show');
}

// ============ Auth Functions ============
async function handleSignIn(e) {
  e.preventDefault();
  const email = document.getElementById('signin-email').value;
  const password = document.getElementById('signin-password').value;
  const submitBtn = e.target.querySelector('button[type="submit"]');
  
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="loading"></span> Signing in...';
  
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    handleAuthSuccess(data);
  } catch (error) {
    showAuthError(error.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
  }
}

async function handleSignUp(e) {
  e.preventDefault();
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const displayName = document.getElementById('signup-name').value;
  const submitBtn = e.target.querySelector('button[type="submit"]');
  
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="loading"></span> Creating account...';
  
  try {
    const data = await api('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    });
    
    handleAuthSuccess(data);
  } catch (error) {
    showAuthError(error.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Account';
  }
}

async function handleGoogleSignIn() {
  const btn = elements.googleSigninBtn;
  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> Connecting...';
  
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    
    const result = await firebase.auth().signInWithPopup(provider);
    const idToken = await result.user.getIdToken();
    
    const data = await api('/auth/google-signin', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });
    
    handleAuthSuccess(data);
  } catch (error) {
    showAuthError(error.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
      Continue with Google
    `;
  }
}

function handleAuthSuccess(data) {
  state.token = data.accessToken;
  state.user = data.user;
  localStorage.setItem('token', data.accessToken);
  localStorage.setItem('user', JSON.stringify(data.user));
  
  showMainScreen();
  loadInitialData();
  requestNotificationPermission();
}

function showAuthError(message) {
  elements.authError.textContent = message;
  elements.authError.classList.add('show');
  setTimeout(() => elements.authError.classList.remove('show'), 5000);
}

function handleLogout() {
  firebase.auth().signOut();
  state.token = null;
  state.user = null;
  state.projects = [];
  state.currentProject = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  
  elements.authScreen.classList.add('active');
  elements.mainScreen.classList.remove('active');
  showToast('Signed out successfully');
}

function showMainScreen() {
  elements.authScreen.classList.remove('active');
  elements.mainScreen.classList.add('active');
  
  if (state.user) {
    elements.userName.textContent = state.user.displayName || 'User';
    elements.userEmail.textContent = state.user.email;
    elements.userAvatar.textContent = (state.user.displayName || state.user.email)[0].toUpperCase();
  }
}

// ============ Push Notifications ============
async function requestNotificationPermission() {
  try {
    console.log('🔔 Requesting notification permission...');
    const permission = await Notification.requestPermission();
    console.log('🔔 Permission result:', permission);
    
    if (permission === 'granted') {
      console.log('🔔 Registering service worker...');
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      console.log('🔔 Service worker registered:', registration);
      
      // Wait for service worker to be ready/active
      if (registration.installing) {
        console.log('🔔 Waiting for service worker to install...');
        await new Promise((resolve) => {
          registration.installing.addEventListener('statechange', (e) => {
            if (e.target.state === 'activated') {
              resolve();
            }
          });
        });
      } else if (registration.waiting) {
        console.log('🔔 Waiting for service worker to activate...');
        await new Promise((resolve) => {
          registration.waiting.addEventListener('statechange', (e) => {
            if (e.target.state === 'activated') {
              resolve();
            }
          });
        });
      }
      
      // Ensure service worker is ready
      await navigator.serviceWorker.ready;
      console.log('🔔 Service worker is ready');
      
      const messaging = firebase.messaging();
      console.log('🔔 Getting FCM token...');
      const token = await messaging.getToken({ 
        serviceWorkerRegistration: registration,
        vapidKey: undefined // Uses Firebase config
      });
      
      console.log('🔔 FCM token obtained:', token ? token.substring(0, 20) + '...' : 'NONE');
      
      if (token) {
        try {
          await api('/webhooks/fcm-token', {
            method: 'POST',
            body: JSON.stringify({ token }),
          });
          console.log('✅ FCM token registered with backend');
        } catch (apiError) {
          console.error('❌ Failed to save FCM token to backend:', apiError);
        }
      } else {
        console.warn('⚠️ No FCM token received from Firebase');
      }
      
      // Handle foreground messages - show in chat when check-in notification arrives
      messaging.onMessage((payload) => {
        console.log('🔔 FCM message received in foreground:', payload);
        
        const { data, notification } = payload;
        
        // Show browser notification (even in foreground for visibility)
        if (notification) {
          try {
            new Notification(notification.title, {
              body: notification.body,
              icon: '/favicon.ico',
            });
          } catch (e) {
            console.log('Could not show notification:', e);
          }
        }
        
        // If it's a reminder/check-in notification, add it to chat
        const isCheckin = data?.action === 'checkin' || 
                          data?.type === 'reminder_checkin' || 
                          data?.type === 'reminder_followup' ||
                          data?.type === 'reminder_due' ||
                          data?.reminderId;
        
        console.log('🔔 Is check-in notification:', isCheckin, 'type:', data?.type, 'data:', data);
        
        if (isCheckin) {
          handleCheckinNotification(data, notification);
        }
      });
    }
  } catch (error) {
    console.error('❌ Notification setup failed:', error);
    console.error('   Error name:', error.name);
    console.error('   Error message:', error.message);
  }
}

// Handle check-in notifications - add GPT message to chat history
function handleCheckinNotification(data, notification) {
  console.log('📋 handleCheckinNotification called:', { data, notification });
  
  // Switch to chat view
  switchView('chat');
  
  // Select the project if available
  if (data.projectId && elements.chatProjectSelect) {
    elements.chatProjectSelect.value = data.projectId;
    const project = state.projects.find(p => p.id === data.projectId);
    if (project) {
      state.currentProject = project;
    }
  }
  
  // Determine notification type (early or follow-up)
  const isFollowUp = data.type === 'reminder_followup' || data.notificationType === 'followup';
  const eventTitle = data.eventTitle || 'your task';
  const minutesUntilDue = data.minutesUntilDue ? parseInt(data.minutesUntilDue) : 0;
  const minutesSinceDue = data.minutesSinceDue ? parseInt(data.minutesSinceDue) : 0;
  
  // The notification body is the user-friendly message
  const displayMessage = notification?.body || 
    (isFollowUp 
      ? `Hey mate! How'd "${eventTitle}" go? Is it done?`
      : `Hey mate! "${eventTitle}" is coming up. Ready to go?`);
  
  // Build context message for GPT based on notification type
  let contextMessage;
  if (isFollowUp) {
    contextMessage = `[REMINDER FOLLOW-UP for "${eventTitle}" (was due ${minutesSinceDue} min ago)${data.reminderId ? `, reminderId: ${data.reminderId}` : ''}]\n\n${displayMessage}`;
  } else {
    contextMessage = `[REMINDER CHECK-IN for "${eventTitle}"${minutesUntilDue > 0 ? ` (due in ${minutesUntilDue} min)` : ' (due now)'}${data.reminderId ? `, reminderId: ${data.reminderId}` : ''}]\n\n${displayMessage}`;
  }
  
  // Badge text based on type
  const badgeText = isFollowUp ? '🔔 Follow-up' : '📋 Check-in';
  const badgeClass = isFollowUp ? 'followup-badge' : 'checkin-badge';
  const timestamp = formatMessageTime(new Date());
  
  // Add to chat UI (show the friendly message)
  const messageDiv = document.createElement('div');
  messageDiv.className = `message assistant ${isFollowUp ? 'followup-message' : 'checkin-message'}`;
  messageDiv.innerHTML = `
    <div class="message-content">
      <div class="${badgeClass}">${badgeText}: ${escapeHtml(eventTitle)}</div>
      ${formatMarkdown(displayMessage)}
      <div class="message-time">${timestamp}</div>
    </div>
  `;
  elements.chatMessages.appendChild(messageDiv);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  
  // Add to chat history WITH context (so GPT knows what reminder this is about)
  state.chatMessages.push({ 
    role: 'assistant', 
    content: contextMessage,
    timestamp: new Date().toISOString()
  });
  
  // Store the current check-in context for quick actions
  state.currentCheckin = {
    reminderId: data.reminderId,
    eventTitle: eventTitle,
    projectId: data.projectId,
    dueAt: data.dueAt,
    isFollowUp: isFollowUp,
  };
  
  // Show toast
  const toastIcon = isFollowUp ? '🔔' : '📋';
  const toastType = isFollowUp ? 'Follow-up' : 'Check-in';
  showToast(`${toastIcon} ${toastType}: ${eventTitle}`, 'info');
}

// ============ Data Loading ============
async function loadInitialData() {
  showSectionLoading('projects-list');
  showSectionLoading('notes-list');
  showSectionLoading('reminders-list');
  
  try {
    await loadProjects();
    if (state.projects.length > 0) {
      state.currentProject = state.projects[0];
      elements.chatProjectSelect.value = state.currentProject.id;
      await Promise.all([
        loadNotes(), 
        loadReminders(),
        loadChatHistory(state.currentProject.id), // Load chat history for first project
      ]);
    } else {
      hideSectionLoading('notes-list');
      hideSectionLoading('reminders-list');
      renderNotes();
      renderReminders();
      showWelcomeMessage(); // Show welcome if no projects
    }
  } catch (error) {
    console.error('Failed to load data:', error);
    showToast('Failed to load data', 'error');
    hideSectionLoading('projects-list');
    hideSectionLoading('notes-list');
    hideSectionLoading('reminders-list');
  }
}

function showSectionLoading(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.innerHTML = `
      <div class="section-loading">
        <div class="loading"></div>
        <p>Loading...</p>
      </div>
    `;
  }
}

function hideSectionLoading(elementId) {
  // Loading will be replaced by render functions
}

async function loadProjects() {
  try {
    state.projects = await api('/projects');
    renderProjects();
    updateProjectSelectors();
  } catch (error) {
    console.error('Failed to load projects:', error);
    state.projects = [];
    renderProjects();
  }
}

async function loadNotes() {
  if (!state.currentProject) {
    renderNotes();
    return;
  }
  
  try {
    state.notes = await api(`/notes?projectId=${state.currentProject.id}`);
    renderNotes();
  } catch (error) {
    console.error('Failed to load notes:', error);
    state.notes = [];
    renderNotes();
  }
}

async function loadReminders() {
  showSectionLoading('reminders-list');
  
  try {
    // Load all reminders for the user (not filtered by project)
    console.log('Loading reminders...');
    const response = await api('/reminders');
    console.log('Reminders API response:', response);
    state.reminders = response || [];
    console.log('Reminders loaded:', state.reminders.length);
    renderReminders();
  } catch (error) {
    console.error('Failed to load reminders:', error);
    state.reminders = [];
    renderReminders();
  }
}


// ============ Render Functions ============
function renderProjects() {
  if (state.projects.length === 0) {
    elements.projectsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📁</div>
        <div class="empty-state-title">No projects yet</div>
        <p>Create your first project to get started</p>
      </div>
    `;
    return;
  }
  
  elements.projectsList.innerHTML = state.projects.map(project => `
    <div class="card" data-id="${project.id}">
      <div class="card-header">
        <h3 class="card-title">${escapeHtml(project.name)}</h3>
      </div>
      <p class="card-description">${escapeHtml(project.description || 'No description')}</p>
      <div class="card-meta">
        Created ${formatDate(project.createdAt)}
      </div>
      <div class="card-actions">
        <button class="btn btn-secondary btn-sm" onclick="selectProject('${project.id}')">Open</button>
        <button class="btn btn-ghost btn-sm" onclick="editProject('${project.id}')">Edit</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteProject('${project.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function renderNotes() {
  if (state.notes.length === 0) {
    elements.notesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <div class="empty-state-title">No notes yet</div>
        <p>Create a note or ask the AI assistant</p>
      </div>
    `;
    return;
  }
  
  elements.notesList.innerHTML = state.notes.map(note => `
    <div class="list-item" data-id="${note.id}">
      <div class="list-item-icon">${note.kind === 'VOICE' ? '🎤' : note.kind === 'AI' ? '🤖' : '📝'}</div>
      <div class="list-item-content">
        <div class="list-item-title">${escapeHtml(note.content.substring(0, 100))}${note.content.length > 100 ? '...' : ''}</div>
        <div class="list-item-subtitle">${formatDate(note.date)} • ${note.tags?.join(', ') || 'No tags'}</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-ghost btn-sm" onclick="viewNote('${note.id}')">View</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteNote('${note.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function renderReminders() {
  if (state.reminders.length === 0) {
    elements.remindersList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⏰</div>
        <div class="empty-state-title">No reminders yet</div>
        <p>Create a reminder or ask the AI assistant</p>
      </div>
    `;
    return;
  }
  
  elements.remindersList.innerHTML = state.reminders.map(reminder => `
    <div class="list-item" data-id="${reminder.id}">
      <div class="list-item-icon">⏰</div>
      <div class="list-item-content">
        <div class="list-item-title">${escapeHtml(reminder.title)}</div>
        <div class="list-item-subtitle">
          Due: ${formatDateTime(reminder.dueAt)}
          <span class="badge badge-${reminder.status.toLowerCase()}">${reminder.status}</span>
        </div>
      </div>
      <div class="list-item-actions">
        ${reminder.status === 'PENDING' ? `
          <button class="btn btn-primary btn-sm" onclick="testReminderNotification('${reminder.id}')" title="Send test notification now">🔔 Test</button>
          <button class="btn btn-secondary btn-sm" onclick="completeReminder('${reminder.id}')">Complete</button>
        ` : ''}
        <button class="btn btn-ghost btn-sm" onclick="deleteReminder('${reminder.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function renderSchedule(events) {
  if (!events || events.length === 0) {
    elements.scheduleTimeline.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📅</div>
        <div class="empty-state-title">No events scheduled</div>
        <p>Upload a schedule PDF or create events via AI chat</p>
      </div>
    `;
    return;
  }
  
  elements.scheduleTimeline.innerHTML = events.map(event => `
    <div class="timeline-item">
      <div class="timeline-time">${formatTime(event.startsAt)}</div>
      <div class="timeline-content">
        <div class="timeline-title">${escapeHtml(event.title)}</div>
        <div class="timeline-description">${escapeHtml(event.description || '')}</div>
      </div>
    </div>
  `).join('');
}

function updateProjectSelectors() {
  const options = state.projects.map(p => 
    `<option value="${p.id}">${escapeHtml(p.name)}</option>`
  ).join('');
  
  elements.chatProjectSelect.innerHTML = `
    <option value="">Select Project</option>
    ${options}
  `;
  
  if (state.currentProject) {
    elements.chatProjectSelect.value = state.currentProject.id;
  }
}

// ============ Chat Functions ============
function addChatMessage(content, role = 'user') {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;
  const timestamp = formatMessageTime(new Date());
  messageDiv.innerHTML = `
    <div class="message-content">
      ${role === 'assistant' ? formatMarkdown(content) : `<p>${escapeHtml(content)}</p>`}
      <div class="message-time">${timestamp}</div>
    </div>
  `;
  elements.chatMessages.appendChild(messageDiv);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  
  state.chatMessages.push({ role, content, timestamp: new Date().toISOString() });
}

// Format time for chat messages (user's local time)
function formatMessageTime(date) {
  return date.toLocaleTimeString('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function addLoadingMessage(customMessage) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message assistant';
  messageDiv.id = 'loading-message';
  messageDiv.innerHTML = `
    <div class="message-content">
      <div class="loading"></div> ${customMessage || 'Thinking...'}
    </div>
  `;
  elements.chatMessages.appendChild(messageDiv);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function removeLoadingMessage() {
  const loading = document.getElementById('loading-message');
  if (loading) loading.remove();
}

async function sendChatMessage() {
  const message = elements.chatInput.value.trim();
  const projectId = elements.chatProjectSelect.value;
  
  if (!message && !state.uploadedFile) return;
  
  if (!projectId) {
    showToast('Please select a project first', 'error');
    return;
  }
  
  // Handle file upload first - upload before adding to chat
  let uploadedFileName = null;
  let uploadResult = null;
  const hasPdfUpload = state.uploadedFile && state.uploadedFile.type === 'application/pdf';
  
  if (state.uploadedFile) {
    uploadedFileName = state.uploadedFile.name;
    
    // Show uploading message for PDF
    if (hasPdfUpload) {
      addLoadingMessage('📤 Uploading PDF...');
    }
    
    uploadResult = await uploadFile(projectId);
    
    // Update loading message after upload
    if (hasPdfUpload) {
      removeLoadingMessage();
    }
  }
  
  // Build the message to send to AI
  let aiMessage = message;
  if (uploadedFileName && uploadResult) {
    // Tell the AI explicitly that a PDF was uploaded with the upload ID
    const uploadContext = `[USER UPLOADED PDF FILE: "${uploadedFileName}", uploadId: "${uploadResult.id}", hasExtractedText: ${!!uploadResult.extractedText}. Use the importScheduleFromPdf tool with this uploadId to process it and create reminders/events from the schedule.]`;
    if (message) {
      aiMessage = `${uploadContext}\n\nUser message: ${message}`;
    } else {
      aiMessage = `${uploadContext}\n\nUser message: Please process this uploaded PDF and create reminders for the schedule.`;
    }
  } else if (uploadedFileName) {
    // Upload failed but we still have the filename
    const uploadContext = `[USER TRIED TO UPLOAD PDF FILE: "${uploadedFileName}" but upload may have failed. Try using importScheduleFromPdf tool to find recent uploads.]`;
    if (message) {
      aiMessage = `${uploadContext}\n\nUser message: ${message}`;
    } else {
      aiMessage = `${uploadContext}\n\nUser message: Please check for recent PDF uploads and create reminders from the schedule.`;
    }
  }
  
  // Add user message to UI (show friendly version)
  if (uploadedFileName) {
    addChatMessage(`📎 Uploaded: ${uploadedFileName}${message ? `\n${message}` : ''}`, 'user');
  } else if (message) {
    addChatMessage(message, 'user');
  }
  
  // Update state with the AI-friendly message
  if (state.chatMessages.length > 0) {
    state.chatMessages[state.chatMessages.length - 1].content = aiMessage;
  }
  
  elements.chatInput.value = '';
  elements.sendBtn.disabled = true;
  
  // Show appropriate loading message
  if (hasPdfUpload) {
    addLoadingMessage('📊 Analyzing PDF and creating schedule...');
  } else {
    addLoadingMessage();
  }
  
  try {
    const response = await api('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        projectId,
        timezone: state.timezone, // Send user's timezone
        messages: state.chatMessages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });
    
    removeLoadingMessage();
    
    if (response.message) {
      addChatMessage(response.message, 'assistant');
    }
    
    // Handle tool results
    if (response.toolResults?.length > 0) {
      for (const result of response.toolResults) {
        console.log('Tool result:', result.tool, result.result);
        
        if (result.tool === 'generateNote') {
          if (result.result?.noteId) {
            showToast('Note created!', 'success');
            await loadNotes();
          } else {
            showToast('Failed to create note', 'error');
          }
        } else if (result.tool === 'createReminder') {
          if (result.result?.reminderId) {
            showToast('Reminder created!', 'success');
          } else {
            showToast('Failed to create reminder', 'error');
          }
          await loadReminders();
        } else if (result.tool === 'importScheduleFromPdf') {
          // Check if reminders were actually created
          const createdCount = result.result?.commitResult?.createdReminders?.length || 0;
          const blocksCount = result.result?.blocks?.length || 0;
          
          if (createdCount > 0) {
            showToast(`Created ${createdCount} reminders from schedule!`, 'success');
          } else if (blocksCount > 0) {
            showToast(`Found ${blocksCount} tasks but failed to create reminders. Check console for errors.`, 'error');
            console.error('Schedule import result:', result.result);
          } else if (result.result?.error) {
            showToast(result.result.message || 'Failed to import schedule', 'error');
          }
          await loadReminders();
        }
      }
    }
  } catch (error) {
    removeLoadingMessage();
    addChatMessage(`Sorry mate, something went wrong: ${error.message}`, 'assistant');
  }
}

async function uploadFile(projectId) {
  if (!state.uploadedFile) return null;
  
  const formData = new FormData();
  formData.append('file', state.uploadedFile);
  formData.append('projectId', projectId);
  formData.append('isSchedule', 'true');
  
  try {
    const result = await api('/uploads', {
      method: 'POST',
      body: formData,
    });
    showToast('File uploaded successfully', 'success');
    console.log('Upload result:', result);
    
    // Store the upload ID for the AI to use
    state.lastUploadId = result.id;
    state.lastUploadHasText = !!result.extractedText;
    
    clearUploadedFile();
    return result;
  } catch (error) {
    showToast('Failed to upload file: ' + error.message, 'error');
    clearUploadedFile();
    return null;
  }
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  if (file.type !== 'application/pdf') {
    showToast('Please upload a PDF file', 'error');
    return;
  }
  
  state.uploadedFile = file;
  elements.uploadPreview.innerHTML = `
    <span>📄 ${escapeHtml(file.name)}</span>
    <button class="remove-file" onclick="clearUploadedFile()">✕</button>
  `;
  elements.uploadPreview.classList.add('show');
  elements.sendBtn.disabled = false;
}

function clearUploadedFile() {
  state.uploadedFile = null;
  elements.uploadPreview.classList.remove('show');
  elements.uploadPreview.innerHTML = '';
  elements.fileUpload.value = '';
  updateSendButton();
}


// ============ Project CRUD ============
function selectProject(projectId) {
  state.currentProject = state.projects.find(p => p.id === projectId);
  elements.chatProjectSelect.value = projectId;
  
  // Show loading and reload data
  showSectionLoading('notes-list');
  
  loadNotes();
  loadReminders();
  loadChatHistory(projectId); // Load chat history for this project
  switchView('chat');
  showToast(`Switched to ${state.currentProject.name}`);
}

// Load chat history for a project
async function loadChatHistory(projectId) {
  if (!projectId) return;
  
  // Clear current chat messages
  state.chatMessages = [];
  elements.chatMessages.innerHTML = '';
  
  try {
    const response = await api(`/ai/chat/history?projectId=${projectId}&limit=100`);
    
    if (response.messages && response.messages.length > 0) {
      // Render each message from history
      for (const msg of response.messages) {
        renderHistoryMessage(msg);
        state.chatMessages.push({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
        });
      }
      elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    } else {
      // Show welcome message if no history
      showWelcomeMessage();
    }
  } catch (error) {
    console.error('Failed to load chat history:', error);
    showWelcomeMessage();
  }
}

// Render a message from history
function renderHistoryMessage(msg) {
  const messageDiv = document.createElement('div');
  const timestamp = msg.timestamp ? formatMessageTime(new Date(msg.timestamp)) : '';
  
  // Check if this is a check-in or follow-up message from history
  const isCheckin = msg.content.startsWith('[REMINDER CHECK-IN');
  const isFollowUp = msg.content.startsWith('[REMINDER FOLLOW-UP');
  
  if (isCheckin || isFollowUp) {
    // Parse the context and extract the display message
    const contextMatch = msg.content.match(/^\[REMINDER (CHECK-IN|FOLLOW-UP) for "([^"]+)"[^\]]*\]\n\n([\s\S]*)$/);
    
    if (contextMatch) {
      const type = contextMatch[1];
      const eventTitle = contextMatch[2];
      const displayMessage = contextMatch[3];
      
      const badgeText = type === 'FOLLOW-UP' ? '🔔 Follow-up' : '📋 Check-in';
      const badgeClass = type === 'FOLLOW-UP' ? 'followup-badge' : 'checkin-badge';
      
      messageDiv.className = `message assistant ${type === 'FOLLOW-UP' ? 'followup-message' : 'checkin-message'}`;
      messageDiv.innerHTML = `
        <div class="message-content">
          <div class="${badgeClass}">${badgeText}: ${escapeHtml(eventTitle)}</div>
          ${formatMarkdown(displayMessage)}
          ${timestamp ? `<div class="message-time">${timestamp}</div>` : ''}
        </div>
      `;
    } else {
      // Fallback if parsing fails
      messageDiv.className = `message ${msg.role}`;
      messageDiv.innerHTML = `
        <div class="message-content">
          ${formatMarkdown(msg.content)}
          ${timestamp ? `<div class="message-time">${timestamp}</div>` : ''}
        </div>
      `;
    }
  } else {
    // Regular message
    messageDiv.className = `message ${msg.role}`;
    messageDiv.innerHTML = `
      <div class="message-content">
        ${msg.role === 'assistant' ? formatMarkdown(msg.content) : `<p>${escapeHtml(msg.content)}</p>`}
        ${timestamp ? `<div class="message-time">${timestamp}</div>` : ''}
      </div>
    `;
  }
  
  elements.chatMessages.appendChild(messageDiv);
}

// Show welcome message when no chat history
function showWelcomeMessage() {
  const welcomeDiv = document.createElement('div');
  welcomeDiv.className = 'message assistant welcome-message';
  welcomeDiv.innerHTML = `
    <div class="message-content">
      <p>G'day mate! 👋 I'm JobMate, your daily assistant.</p>
      <p>I can help you with:</p>
      <ul>
        <li>📝 Creating notes and summaries</li>
        <li>⏰ Setting reminders</li>
        <li>📅 Managing your schedule</li>
        <li>📄 Importing schedules from PDFs</li>
      </ul>
      <p>Just ask me anything!</p>
    </div>
  `;
  elements.chatMessages.appendChild(welcomeDiv);
}

// Clear chat history for current project
async function clearChatHistory() {
  if (!state.currentProject) {
    showToast('Please select a project first', 'error');
    return;
  }
  
  if (!confirm('Are you sure you want to clear all chat history for this project?')) {
    return;
  }
  
  try {
    await api(`/ai/chat/history/${state.currentProject.id}`, {
      method: 'DELETE',
    });
    
    state.chatMessages = [];
    elements.chatMessages.innerHTML = '';
    showWelcomeMessage();
    showToast('Chat history cleared', 'success');
  } catch (error) {
    showToast('Failed to clear chat history', 'error');
  }
}

async function createProject() {
  const name = document.getElementById('project-name').value.trim();
  const description = document.getElementById('project-description').value.trim();
  
  if (!name) {
    showToast('Project name is required', 'error');
    return;
  }
  
  try {
    const project = await api('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
    
    state.projects.push(project);
    state.currentProject = project;
    renderProjects();
    updateProjectSelectors();
    hideModal();
    showToast('Project created!', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function showNewProjectModal() {
  showModal('New Project', `
    <form onsubmit="event.preventDefault(); createProject();">
      <div class="form-group">
        <label for="project-name">Project Name</label>
        <input type="text" id="project-name" placeholder="My Project" required>
      </div>
      <div class="form-group">
        <label for="project-description">Description</label>
        <textarea id="project-description" placeholder="Optional description" rows="3"></textarea>
      </div>
      <button type="submit" class="btn btn-primary btn-full">Create Project</button>
    </form>
  `);
}

async function editProject(projectId) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;
  
  showModal('Edit Project', `
    <form onsubmit="event.preventDefault(); updateProject('${projectId}');">
      <div class="form-group">
        <label for="edit-project-name">Project Name</label>
        <input type="text" id="edit-project-name" value="${escapeHtml(project.name)}" required>
      </div>
      <div class="form-group">
        <label for="edit-project-description">Description</label>
        <textarea id="edit-project-description" rows="3">${escapeHtml(project.description || '')}</textarea>
      </div>
      <button type="submit" class="btn btn-primary btn-full">Save Changes</button>
    </form>
  `);
}

async function updateProject(projectId) {
  const name = document.getElementById('edit-project-name').value.trim();
  const description = document.getElementById('edit-project-description').value.trim();
  
  try {
    const updated = await api(`/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, description }),
    });
    
    const index = state.projects.findIndex(p => p.id === projectId);
    if (index !== -1) {
      state.projects[index] = updated;
    }
    
    renderProjects();
    updateProjectSelectors();
    hideModal();
    showToast('Project updated!', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteProject(projectId) {
  if (!confirm('Are you sure you want to delete this project?')) return;
  
  try {
    await api(`/projects/${projectId}`, { method: 'DELETE' });
    state.projects = state.projects.filter(p => p.id !== projectId);
    
    if (state.currentProject?.id === projectId) {
      state.currentProject = state.projects[0] || null;
    }
    
    renderProjects();
    updateProjectSelectors();
    showToast('Project deleted', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ============ Note CRUD ============
function showNewNoteModal() {
  if (!state.currentProject) {
    showToast('Please select a project first', 'error');
    return;
  }
  
  showModal('New Note', `
    <form onsubmit="event.preventDefault(); createNote();">
      <div class="form-group">
        <label for="note-content">Content</label>
        <textarea id="note-content" placeholder="Write your note..." rows="6" required></textarea>
      </div>
      <div class="form-group">
        <label for="note-tags">Tags (comma separated)</label>
        <input type="text" id="note-tags" placeholder="work, meeting, important">
      </div>
      <button type="submit" class="btn btn-primary btn-full">Create Note</button>
    </form>
  `);
}

async function createNote() {
  const content = document.getElementById('note-content').value.trim();
  const tagsInput = document.getElementById('note-tags').value.trim();
  const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()) : [];
  
  if (!content) {
    showToast('Note content is required', 'error');
    return;
  }
  
  try {
    await api('/notes', {
      method: 'POST',
      body: JSON.stringify({
        projectId: state.currentProject.id,
        content,
        tags,
      }),
    });
    
    await loadNotes();
    hideModal();
    showToast('Note created!', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function viewNote(noteId) {
  const note = state.notes.find(n => n.id === noteId);
  if (!note) return;
  
  showModal('Note', `
    <div style="white-space: pre-wrap; margin-bottom: 16px;">${escapeHtml(note.content)}</div>
    <div class="card-meta">
      Created: ${formatDateTime(note.createdAt)}<br>
      Tags: ${note.tags?.join(', ') || 'None'}
    </div>
  `);
}

async function deleteNote(noteId) {
  if (!confirm('Delete this note?')) return;
  
  try {
    await api(`/notes/${noteId}`, { method: 'DELETE' });
    state.notes = state.notes.filter(n => n.id !== noteId);
    renderNotes();
    showToast('Note deleted', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ============ Reminder CRUD ============
function showNewReminderModal() {
  if (!state.currentProject) {
    showToast('Please select a project first', 'error');
    return;
  }
  
  const now = new Date();
  const defaultDate = now.toISOString().slice(0, 16);
  
  showModal('New Reminder', `
    <form onsubmit="event.preventDefault(); createReminder();">
      <div class="form-group">
        <label for="reminder-title">Title</label>
        <input type="text" id="reminder-title" placeholder="Reminder title" required>
      </div>
      <div class="form-group">
        <label for="reminder-due">Due Date & Time</label>
        <input type="datetime-local" id="reminder-due" value="${defaultDate}" required>
      </div>
      <button type="submit" class="btn btn-primary btn-full">Create Reminder</button>
    </form>
  `);
}

async function createReminder() {
  const title = document.getElementById('reminder-title').value.trim();
  const dueAt = document.getElementById('reminder-due').value;
  
  if (!title || !dueAt) {
    showToast('Title and due date are required', 'error');
    return;
  }
  
  try {
    await api('/reminders', {
      method: 'POST',
      body: JSON.stringify({
        projectId: state.currentProject.id,
        title,
        dueAt: new Date(dueAt).toISOString(),
      }),
    });
    
    await loadReminders();
    hideModal();
    showToast('Reminder created!', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function completeReminder(reminderId) {
  try {
    await api(`/reminders/${reminderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'COMPLETED' }),
    });
    
    await loadReminders();
    showToast('Reminder completed!', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// Test notification for a specific reminder - triggers immediate push notification
async function testReminderNotification(reminderId) {
  showToast('🔔 Sending test notification...', 'info');
  
  try {
    const result = await api(`/reminders/${reminderId}/notify`, {
      method: 'POST',
    });
    
    showToast('✅ Notification sent! Check your browser/device.', 'success');
    console.log('Test notification result:', result);
  } catch (error) {
    showToast('❌ Failed to send notification: ' + error.message, 'error');
    console.error('Test notification error:', error);
  }
}

// Test the cron job manually - checks all due reminders
async function testCronJob() {
  showToast('⏰ Triggering cron job...', 'info');
  
  try {
    const result = await api('/reminders/test/cron', {
      method: 'POST',
    });
    
    showToast('✅ Cron job executed! Check logs for details.', 'success');
    console.log('Cron job result:', result);
  } catch (error) {
    showToast('❌ Cron job failed: ' + error.message, 'error');
    console.error('Cron job error:', error);
  }
}

async function deleteReminder(reminderId) {
  if (!confirm('Delete this reminder?')) return;
  
  try {
    await api(`/reminders/${reminderId}`, { method: 'DELETE' });
    state.reminders = state.reminders.filter(r => r.id !== reminderId);
    renderReminders();
    showToast('Reminder deleted', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ============ Test Notification System ============
async function testNotificationSystem() {
  if (!state.currentProject) {
    showToast('Please select a project first', 'error');
    return;
  }
  
  showToast('🧪 Testing notification system...', 'info');
  
  try {
    // Step 1: Create a test reminder due in 10 seconds
    const result = await api('/reminders/test/create-and-notify', {
      method: 'POST',
      body: JSON.stringify({ projectId: state.currentProject.id }),
    });
    
    console.log('Test reminder created:', result);
    showToast(`✅ Created test reminder: "${result.reminder?.title}"`, 'success');
    
    // Step 2: Wait 2 seconds then trigger the cron job manually
    setTimeout(async () => {
      showToast('⏰ Triggering cron job...', 'info');
      
      try {
        const cronResult = await api('/reminders/test/cron', { method: 'POST' });
        console.log('Cron job result:', cronResult);
        showToast('📬 Cron job executed! Check for notification.', 'success');
      } catch (cronError) {
        console.error('Cron job error:', cronError);
        showToast('❌ Cron job failed: ' + cronError.message, 'error');
      }
      
      // Reload reminders to show the new one
      await loadReminders();
    }, 2000);
    
  } catch (error) {
    console.error('Test notification error:', error);
    showToast('❌ Test failed: ' + error.message, 'error');
  }
}

// Send immediate notification for a specific reminder
async function sendReminderNotification(reminderId) {
  try {
    showToast('📤 Sending notification...', 'info');
    const result = await api(`/reminders/${reminderId}/notify`, { method: 'POST' });
    console.log('Notification result:', result);
    showToast('✅ Notification sent! Check your browser.', 'success');
  } catch (error) {
    console.error('Notification error:', error);
    showToast('❌ Failed to send: ' + error.message, 'error');
  }
}

// ============ Schedule ============
async function loadSchedule() {
  const date = elements.scheduleDate.value || new Date().toISOString().split('T')[0];
  
  // Show loading
  elements.scheduleTimeline.innerHTML = `
    <div class="section-loading">
      <div class="loading"></div>
      <p>Loading schedule...</p>
    </div>
  `;
  
  try {
    // First reload reminders to get latest data
    await loadReminders();
    
    // Filter reminders for the selected date
    const reminders = state.reminders.filter(r => {
      const reminderDate = new Date(r.dueAt).toISOString().split('T')[0];
      return reminderDate === date;
    });
    
    if (reminders.length === 0 && state.reminders.length > 0) {
      // No reminders for selected date, but there are reminders - show helpful message
      const nextReminder = state.reminders[0]; // Already sorted by dueAt
      const nextDate = new Date(nextReminder.dueAt).toISOString().split('T')[0];
      
      elements.scheduleTimeline.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📅</div>
          <div class="empty-state-title">No events on ${date}</div>
          <p>You have ${state.reminders.length} reminders scheduled.</p>
          <p>Next reminder: ${new Date(nextReminder.dueAt).toLocaleDateString()}</p>
          <button class="btn btn-secondary" onclick="document.getElementById('schedule-date').value='${nextDate}'; loadSchedule();">
            Jump to ${nextDate}
          </button>
        </div>
      `;
      return;
    }
    
    renderSchedule(reminders.map(r => ({
      title: r.title,
      startsAt: r.dueAt,
      description: r.status,
    })));
  } catch (error) {
    console.error('Failed to load schedule:', error);
    elements.scheduleTimeline.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">❌</div>
        <div class="empty-state-title">Failed to load schedule</div>
        <p>Please try again</p>
      </div>
    `;
  }
}


// ============ Navigation ============
function switchView(viewName) {
  // Update nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });
  
  // Update views
  document.querySelectorAll('.view').forEach(view => {
    view.classList.toggle('active', view.id === `${viewName}-view`);
  });
  
  // Load data for specific views
  if (viewName === 'schedule') {
    loadSchedule();
  }
}

// ============ Utility Functions ============
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatMarkdown(text) {
  if (!text) return '';
  
  // Escape HTML first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Format markdown
  html = html
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code
    .replace(/`(.*?)`/g, '<code>$1</code>')
    // Bullet points (• or -)
    .replace(/^[•\-]\s+(.*)$/gm, '<li>$1</li>')
    // Numbered lists
    .replace(/^\d+\.\s+(.*)$/gm, '<li>$1</li>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  
  // Wrap consecutive <li> items in <ul>
  html = html.replace(/(<li>.*?<\/li>)(\s*<br>\s*)?(<li>)/g, '$1$3');
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul class="chat-list">$1</ul>');
  
  // Wrap in paragraph
  html = `<p>${html}</p>`;
  
  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  
  return html;
}

function updateSendButton() {
  const hasText = elements.chatInput.value.trim().length > 0;
  const hasFile = state.uploadedFile !== null;
  elements.sendBtn.disabled = !hasText && !hasFile;
}

// ============ Event Listeners ============
function initEventListeners() {
  // Auth tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`${btn.dataset.tab}-form`).classList.add('active');
    });
  });
  
  // Auth forms
  elements.signinForm.addEventListener('submit', handleSignIn);
  elements.signupForm.addEventListener('submit', handleSignUp);
  elements.googleSigninBtn.addEventListener('click', handleGoogleSignIn);
  elements.logoutBtn.addEventListener('click', handleLogout);
  
  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchView(item.dataset.view));
  });
  
  // Chat
  elements.chatInput.addEventListener('input', () => {
    updateSendButton();
    // Auto-resize textarea
    elements.chatInput.style.height = 'auto';
    elements.chatInput.style.height = Math.min(elements.chatInput.scrollHeight, 120) + 'px';
  });
  
  elements.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
  
  elements.sendBtn.addEventListener('click', sendChatMessage);
  elements.fileUpload.addEventListener('change', handleFileSelect);
  
  elements.chatProjectSelect.addEventListener('change', (e) => {
    const projectId = e.target.value;
    if (projectId) {
      state.currentProject = state.projects.find(p => p.id === projectId);
      loadNotes();
      loadReminders();
      loadChatHistory(projectId); // Load chat history when switching projects
    }
  });
  
  // New buttons
  document.getElementById('new-project-btn').addEventListener('click', showNewProjectModal);
  document.getElementById('new-note-btn').addEventListener('click', showNewNoteModal);
  document.getElementById('new-reminder-btn').addEventListener('click', showNewReminderModal);
  document.getElementById('refresh-reminders-btn').addEventListener('click', () => {
    loadReminders();
    showToast('Refreshing reminders...', 'info');
  });
  
  // Test notification button (if exists)
  const testNotifBtn = document.getElementById('test-notification-btn');
  if (testNotifBtn) {
    testNotifBtn.addEventListener('click', testNotificationSystem);
  }
  
  // Schedule date
  elements.scheduleDate.addEventListener('change', loadSchedule);
  elements.scheduleDate.value = new Date().toISOString().split('T')[0];
  
  // Modal
  elements.modalOverlay.addEventListener('click', (e) => {
    if (e.target === elements.modalOverlay) hideModal();
  });
  document.querySelector('.modal-close').addEventListener('click', hideModal);
}

// ============ Initialize App ============
function initApp() {
  // Hide loading screen after a short delay
  const loadingScreen = document.getElementById('loading-screen');
  
  // Check for stored auth
  const storedToken = localStorage.getItem('token');
  const storedUser = localStorage.getItem('user');
  
  if (storedToken && storedUser) {
    state.token = storedToken;
    state.user = JSON.parse(storedUser);
    showMainScreen();
    loadInitialData();
    
    // Request notification permission for returning users
    requestNotificationPermission();
  }
  
  initEventListeners();
  
  // Firebase auth state listener
  firebase.auth().onAuthStateChanged((user) => {
    if (user && !state.token) {
      // User signed in via Firebase but we don't have a backend token
      // This can happen on page refresh with Firebase persistence
      user.getIdToken().then(async (idToken) => {
        try {
          const data = await api('/auth/google-signin', {
            method: 'POST',
            body: JSON.stringify({ idToken }),
          });
          handleAuthSuccess(data);
        } catch (error) {
          console.error('Failed to authenticate with backend:', error);
        }
      });
    }
  });
  
  // Listen for messages from service worker (notification clicks)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      console.log('Message from service worker:', event.data);
      
      if (event.data?.type === 'CHECKIN_NOTIFICATION') {
        handleCheckinNotification(event.data.data, event.data.notification);
      }
    });
  }
  
  // Check URL params for check-in (when opened from notification)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('checkin') === 'true') {
    const eventTitle = urlParams.get('eventTitle') || '';
    const projectId = urlParams.get('projectId') || '';
    const reminderId = urlParams.get('reminderId') || '';
    
    // Wait for app to load, then handle check-in
    setTimeout(() => {
      handleCheckinNotification(
        { eventTitle, projectId, reminderId, action: 'checkin' },
        { body: `Hey mate! How's the progress on "${eventTitle}"?` }
      );
      // Clean up URL
      window.history.replaceState({}, document.title, '/');
    }, 1500);
  }
  
  // Hide loading screen after initialization
  setTimeout(() => {
    if (loadingScreen) {
      loadingScreen.classList.add('hidden');
    }
  }, 800);
}

// Start the app
document.addEventListener('DOMContentLoaded', initApp);
