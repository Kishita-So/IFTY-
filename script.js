// ★★★ IFTY Q3 STEP52 2026-09-24：科目チェック固定・内外検索・生成中入力維持 ★★★
// 完全版 スマート単語帳 & ALLIA（Cloudflare Workers連携）
// ==========================================

let currentUser = "default_user";
let currentView = "vocab"; // 'vocab' or 'chat'
let iftyPortalPage = 'home'; // 'home' | 'subject' | 'settings' | 'vocab' | 'chat'

// Q3 STEP17：教科ごとのORDER / ALLIAコンテキスト
const IFTY_SUBJECT_KEYS = ['ENGLISH', 'ANCIENT', 'SCIENCE', 'SOCIAL STUDIES'];
const IFTY_ORDER_STORAGE_PREFIX = 'ifty_subject_orders_';
const IFTY_ORDER_META_STORAGE_PREFIX = 'ifty_subject_order_meta_';
const IFTY_ORDER_MAX_CHARS = 12000;
let currentIftySubject = 'ENGLISH';
let iftySubjectOrders = {
  ENGLISH: { activeId: null, orders: [] },
  ANCIENT: { activeId: null, orders: [] },
  SCIENCE: { activeId: null, orders: [] },
  'SOCIAL STUDIES': { activeId: null, orders: [] }
};
let iftySubjectOrderUpdatedAt = {
  ENGLISH: 0,
  ANCIENT: 0,
  SCIENCE: 0,
  'SOCIAL STUDIES': 0
};

let folders = [];
let flashcardList = [];
let currentFlashcardIndex = 0;
let isCardFlipped = false;
let currentFlashcardMode = 'all';
let isRandomMode = true;
let cardMode = 'front';

// Q3 STEP19：復習フォルダ / 間隔反復
const IFTY_REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30];
const IFTY_REVIEW_DAY_MS = 24 * 60 * 60 * 1000;
const IFTY_REVIEW_QUIZ_SET_ID = '__ifty_review_quiz__';
const IFTY_STUDY_HISTORY_MAX_DAYS = 60;
const IFTY_WEAK_MIN_ATTEMPTS = 3;
const IFTY_WEAK_MIN_WRONG = 2;
const IFTY_WEAK_MAX_ACCURACY = 0.7;
const IFTY_LISTENING_RATE_KEY = 'ifty_listening_rate';
let iftyListeningRate = (() => {
  const value = Number(localStorage.getItem(IFTY_LISTENING_RATE_KEY));
  return [0.75, 0.9, 1].includes(value) ? value : 0.9;
})();

// Q3 STEP21：スペル候補は一定時間応答がなければ候補側を自動採用する。
const IFTY_SPELLING_AUTO_ACCEPT_DEFAULT_SECONDS = 5;
const IFTY_SPELLING_AUTO_ACCEPT_MIN_SECONDS = 1;
const IFTY_SPELLING_AUTO_ACCEPT_MAX_SECONDS = 60;
const IFTY_SPELLING_AUTO_ACCEPT_SETTING_PREFIX = 'ifty_spelling_auto_accept_seconds_';
let iftySpellingAutoAcceptSeconds = IFTY_SPELLING_AUTO_ACCEPT_DEFAULT_SECONDS;
let iftySpellingSuggestionTimers = {};

// Q3 STEP23：1日の学習目標 / 連続学習
const IFTY_DAILY_GOAL_DEFAULT_WORDS = 20;
const IFTY_DAILY_GOAL_MIN_WORDS = 1;
const IFTY_DAILY_GOAL_MAX_WORDS = 500;
const IFTY_DAILY_GOAL_SETTING_PREFIX = 'ifty_daily_goal_words_';
let iftyDailyGoalWords = IFTY_DAILY_GOAL_DEFAULT_WORDS;

// Q3 STEP23：保存済み例文をAIなしで再利用する「例文資産」
let iftyExampleSearchQuery = '';

// Q3 STEP25 / STEP41：BASIC SENTENCES
// 自分で登録した英文、またはEXAMPLE BANKから取り込んだ英文をフォルダ単位で保存・整理する。
let iftyBasicSentenceSearchQuery = '';
let iftyBasicSentenceActiveFolderId = '';

// Q3 STEP38 / STEP41：YEARS / 年号学習
// SOCIAL STUDIESとは独立した年号暗記ツール。年号をフォルダ単位で保存・整理する。
let iftyYearLookupPending = 0;
let iftyYearActiveFolderId = '';
// Q3 STEP40：年号カードの開閉状態（表示中のみ保持）
const iftyCollapsedYearEntryIds = new Set();

// Q3 STEP26：SOCIAL STUDIES
// 社会は1教科として保持し、フォルダごとに日本史・世界史・地理・公共を複数設定できる。
const IFTY_SOCIAL_SUBJECTS = [
  { key: 'JAPANESE_HISTORY', label: '日本史' },
  { key: 'WORLD_HISTORY', label: '世界史' },
  { key: 'GEOGRAPHY', label: '地理' },
  { key: 'PUBLIC', label: '公共' }
];
const IFTY_SOCIAL_SUBJECT_KEYS = IFTY_SOCIAL_SUBJECTS.map(item => item.key);

// Q3 STEP27：SOCIAL STUDIES 画像資産 / 入力ドラフト / 画像クイズ
// AI解析用画像は一時的に高解像度、保存用画像はクラウド容量を抑えるため縮小して保持する。
let iftySocialTopicDrafts = {};
let iftySocialImageDrafts = {};
// 同じ社会フォルダで複数のALLIA生成を連続送信した時の進行数。
// savePracticeData() は正規化時にフォルダオブジェクトを作り直すため、
// 非同期処理では古いfolder参照を保持せず、完了時にfolderIdから取り直す。
let iftySocialGenerationPending = {};
let iftySocialEditorImageDraft = null;
let iftySocialSearchQuery = '';
let iftySocialFolderSearchQueries = {};
let iftySocialVisualQuizState = {
  mode: '',
  folderId: '',
  queue: [],
  index: 0,
  correct: 0,
  wrong: 0,
  answered: false,
  selectedId: '',
  optionIds: []
};


// Q3 STEP35：SOCIAL STUDIES 専用PRACTICE
// シンプル / 時代 / 並べ替え / 説明 / 画像関連を、社会フォルダから直接出題する。
let iftySocialPracticeSelectedFolderIds = new Set();
let iftySocialPracticeSelectionInitialized = false;
let iftySocialPracticeQuestionCount = 5;
let iftySocialPracticeState = {
  mode: '',
  questions: [],
  index: 0,
  correct: 0,
  wrong: 0,
  answered: false,
  selectedIds: [],
  orderIds: [],
  grading: false,
  feedback: '',
  score: null,
  modelAnswer: ''
};


// Q3 STEP47：SCIENCE
// 社会と同じフォルダ型を基礎に、物理・化学・生物・地学を複数指定できる。
// 理科では、定義だけでなく「原理・因果・公式・単位・条件・実験」を重視する。
const IFTY_SCIENCE_SUBJECTS = [
  { key: 'PHYSICS', label: '物理' },
  { key: 'CHEMISTRY', label: '化学' },
  { key: 'BIOLOGY', label: '生物' },
  { key: 'EARTH_SCIENCE', label: '地学' }
];
const IFTY_SCIENCE_SUBJECT_KEYS = IFTY_SCIENCE_SUBJECTS.map(item => item.key);

let iftyScienceTopicDrafts = {};
let iftyScienceImageDrafts = {};
let iftyScienceGenerationPending = {};
let iftyScienceEditorImageDraft = null;
let iftyScienceSearchQuery = '';
let iftyScienceFolderSearchQueries = {};
let iftyScienceVisualQuizState = {
  mode: '',
  folderId: '',
  queue: [],
  index: 0,
  correct: 0,
  wrong: 0,
  answered: false,
  selectedId: '',
  optionIds: []
};

let iftySciencePracticeSelectedFolderIds = new Set();
let iftySciencePracticeSelectionInitialized = false;
let iftySciencePracticeQuestionCount = 5;
let iftySciencePracticeState = {
  mode: '',
  questions: [],
  index: 0,
  correct: 0,
  wrong: 0,
  answered: false,
  selectedIds: [],
  orderIds: [],
  grading: false,
  feedback: '',
  score: null,
  modelAnswer: ''
};


let chatSessions = [];
let currentChatSessionId = null;
let selectedImageBase64 = null;
let pendingSpellingSuggestions = {};
let wordInputDrafts = {};

// Q3 STEP18：語彙検索（全フォルダ / フォルダ内）
let iftyGlobalVocabSearchQuery = '';
let iftyFolderSearchQueries = {};

// 選択状態（フォルダ・単語）
let selectedFolderIds = new Set();
let selectedWordIds = new Set();

// 実践データ。今後モジュールを増やしても ALLIA に丸ごと渡せる構造。
let practiceData = {
  schemaVersion: 1,
  modules: {
    flashcards: { sets: [] }
  }
};

let currentPracticeSetId = null;
let currentQuizSetId = null;

// Q3 第1弾：Undo / Redo
let undoStack = [];
let redoStack = [];
let isRestoringHistory = false;
const MAX_HISTORY_STEPS = 60;

// Q3 第1弾：テーマ
let iftyTheme = localStorage.getItem('ifty_theme') || 'light';

// Q3 STEP16：PERIODIC / MANUAL バックアップ + オートセーブ頻度
const IFTY_RECOVERY_DB_NAME = 'ifty_recovery_q3';
const IFTY_RECOVERY_DB_VERSION = 2;
const IFTY_RECOVERY_STORE = 'snapshots';
// Q3 STEP18：AI生成済み語彙データはクラウドへ送らず、この端末のIndexedDBへ保存して再利用する。
const IFTY_GENERATED_WORD_CACHE_STORE = 'generatedWordCache';
const IFTY_RECOVERY_MAX_MANUAL_SNAPSHOTS = 30;
const IFTY_AUTOSAVE_DEFAULT_MINUTES = 3;
const IFTY_AUTOSAVE_MIN_MINUTES = 1;
const IFTY_AUTOSAVE_MAX_MINUTES = 240;
const IFTY_AUTOSAVE_SETTING_PREFIX = 'ifty_autosave_minutes_';
const IFTY_PERIODIC_BACKUP_PREFIX = 'ifty_periodic_backup_';
let iftyAutosaveIntervalMinutes = IFTY_AUTOSAVE_DEFAULT_MINUTES;
let iftyAutoBackupTimer = null;
let iftyLastBackupHash = null;
let iftyRecoveryLifecycleInstalled = false;
let iftyLegacyRecoveryMigrationDoneForUser = null;

// Q3 STEP10：Service Worker / 配信ファイルの自動更新確認
const IFTY_UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
let iftyServiceWorkerRegistration = null;
let iftyServiceWorkerUpdateTimer = null;
let iftyServiceWorkerUpdateListenersInstalled = false;

// Q3 STEP12：IFTYアカウント / D1クラウドセーブ
// セーブデータの正本はアカウント側（Cloudflare D1）。
// localStorage はCookieではなく、オフライン動作用の端末キャッシュとセッショントークンだけに使用する。
const IFTY_SESSION_TOKEN_KEY = 'ifty_account_session_token';
const IFTY_ACCOUNT_META_KEY = 'ifty_account_meta';
const IFTY_CLOUD_REVISION_PREFIX = 'ifty_cloud_revision_';
const IFTY_CLOUD_DIRTY_PREFIX = 'ifty_cloud_dirty_';
const IFTY_CLOUD_SAVE_DEBOUNCE_MS = 1200;
let iftyAccount = null;
let iftySessionToken = '';
let iftyCloudRevision = 0;
let iftyCloudSaveTimer = null;
let iftyCloudSaveEnabled = false;
let iftyCloudApplyingRemote = false;
let iftyCloudSyncInFlight = false;
let iftyCloudSyncQueued = false;
let iftyCloudOnlineListenerInstalled = false;
let iftyAccountProfile = null;

// Q3 STEP14：一時的なDeveloperローカル入場
// 本物のアカウント認証やクラウドデータへの権限を迂回しない。
// Developerでは専用の端末ローカル領域だけを使用する。
const IFTY_DEVELOPER_SESSION_KEY = 'ifty_developer_session';
const IFTY_DEVELOPER_LOCAL_USER = '__ifty_developer_local__';
let iftyDeveloperMode = false;

const WORKER_URL = 'https://ifty.humbleflail205.workers.dev/';
const IFTY_LOGO_PATH = './ifty-icon.png';
const IFTY_PROFILE_STORAGE_PREFIX = 'ifty_profile_visual_';
const IFTY_HOME_ICON_BG_PREFIX = 'ifty_home_icon_bg_';
const IFTY_HOME_ICON_PATHS = {
  white: './ifty-home-icon-white.png',
  black: './ifty-home-icon-black.png'
};
let iftyHomeManifestObjectUrl = '';
const IFTY_PROFILE_PRESETS = [
  ['mint', '#14b8a6', '#ecfeff'],
  ['blue', '#2563eb', '#eff6ff'],
  ['violet', '#7c3aed', '#f5f3ff'],
  ['rose', '#e11d48', '#fff1f2'],
  ['amber', '#d97706', '#fffbeb'],
  ['slate', '#334155', '#f8fafc']
];

function getIftyVisualUserKey() {
  return String(currentUser || 'default_user').trim() || 'default_user';
}
function getIftyProfileStorageKey() { return IFTY_PROFILE_STORAGE_PREFIX + getIftyVisualUserKey(); }
function getIftyHomeIconBgKey() { return IFTY_HOME_ICON_BG_PREFIX + getIftyVisualUserKey(); }
function makeIftyPresetAvatar(fg, bg) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="${bg}"/><circle cx="64" cy="45" r="24" fill="${fg}"/><path d="M22 116c3-27 19-42 42-42s39 15 42 42" fill="${fg}"/></svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}
function getIftyProfileVisual() {
  try {
    const raw = JSON.parse(localStorage.getItem(getIftyProfileStorageKey()) || 'null');
    if (raw && raw.type === 'custom' && typeof raw.data === 'string' && raw.data.startsWith('data:image/')) return raw;
    if (raw && raw.type === 'preset' && Number.isInteger(raw.index) && IFTY_PROFILE_PRESETS[raw.index]) return raw;
  } catch (_) {}
  return { type: 'preset', index: 0 };
}
function getIftyProfileImageSrc() {
  const value = getIftyProfileVisual();
  if (value.type === 'custom') return value.data;
  const preset = IFTY_PROFILE_PRESETS[value.index] || IFTY_PROFILE_PRESETS[0];
  return makeIftyPresetAvatar(preset[0], preset[1]);
}
function getIftyHomeIconBackground() {
  return localStorage.getItem(getIftyHomeIconBgKey()) === 'black' ? 'black' : 'white';
}
function applyIftyProfileVisual() {
  const src = getIftyProfileImageSrc();
  const img = document.querySelector('#iftyGlobalLogo img');
  if (img) { img.src = src; img.onerror = null; }
}
function applyIftyHomeIcon() {
  const bg = getIftyHomeIconBackground();
  const relativeHref = IFTY_HOME_ICON_PATHS[bg];
  const versionedHref = `${relativeHref}?v=31-${bg}`;
  const absoluteHref = new URL(versionedHref, window.location.href).href;

  // 旧いHTMLや旧STEPが置いたアイコン指定を残すと、iOS Safariが先頭の古い
  // apple-touch-iconを採用することがあるため、いったんすべて外してから1つだけ入れ直す。
  document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]').forEach(link => link.remove());

  const favicon = document.createElement('link');
  favicon.id = 'iftyDynamicFavicon';
  favicon.rel = 'icon';
  favicon.type = 'image/png';
  favicon.sizes = '512x512';
  favicon.href = versionedHref;
  document.head.appendChild(favicon);

  const apple = document.createElement('link');
  apple.id = 'iftyDynamicAppleIcon';
  apple.rel = 'apple-touch-icon';
  apple.sizes = '512x512';
  apple.href = versionedHref;
  document.head.appendChild(apple);

  // Manifestも選択中の背景に合わせる。既存の固定manifest指定は競合するので置き換える。
  document.querySelectorAll('link[rel="manifest"]').forEach(link => link.remove());
  if (iftyHomeManifestObjectUrl) {
    try { URL.revokeObjectURL(iftyHomeManifestObjectUrl); } catch (_) {}
    iftyHomeManifestObjectUrl = '';
  }

  try {
    const manifest = {
      name: 'IFTY',
      short_name: 'IFTY',
      start_url: new URL('./', window.location.href).href,
      scope: new URL('./', window.location.href).href,
      display: 'standalone',
      background_color: bg === 'black' ? '#000000' : '#ffffff',
      theme_color: bg === 'black' ? '#000000' : '#ffffff',
      icons: [
        { src: absoluteHref, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: absoluteHref, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    iftyHomeManifestObjectUrl = URL.createObjectURL(blob);
    const manifestLink = document.createElement('link');
    manifestLink.id = 'iftyDynamicManifest';
    manifestLink.rel = 'manifest';
    manifestLink.href = iftyHomeManifestObjectUrl;
    document.head.appendChild(manifestLink);
  } catch (error) {
    console.warn('IFTY HOMEアイコンmanifest生成エラー:', error);
  }

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.content = bg === 'black' ? '#000000' : '#ffffff';
}
window.setIftyProfilePreset = function(index) {
  index = Number(index);
  if (!Number.isInteger(index) || !IFTY_PROFILE_PRESETS[index]) return;
  localStorage.setItem(getIftyProfileStorageKey(), JSON.stringify({ type: 'preset', index }));
  applyIftyProfileVisual();
  openIftySettings();
};
window.chooseIftyProfileImage = function() {
  const input = document.getElementById('iftyProfileImageInput');
  if (input) input.click();
};
window.handleIftyProfileImageUpload = function(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { alert('画像ファイルを選択してください。'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(size / image.width, size / image.height);
      const w = image.width * scale, h = image.height * scale;
      ctx.drawImage(image, (size-w)/2, (size-h)/2, w, h);
      const data = canvas.toDataURL('image/jpeg', 0.86);
      localStorage.setItem(getIftyProfileStorageKey(), JSON.stringify({ type: 'custom', data }));
      applyIftyProfileVisual();
      openIftySettings();
    };
    image.src = String(reader.result || '');
  };
  reader.readAsDataURL(file);
};
window.setIftyHomeIconBackground = function(bg) {
  bg = bg === 'black' ? 'black' : 'white';
  localStorage.setItem(getIftyHomeIconBgKey(), bg);
  applyIftyHomeIcon();
  openIftySettings();
};
const IFTY_LOGO_FALLBACK_DATA = 'data:image/png;base64,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';

// ==========================================
// IFTY 共通UI（公式ロゴ・テーマ・Undo/Redo）
// ==========================================
function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function captureLearningState(label) {
  return {
    label: label || '操作',
    folders: deepClone(folders),
    practiceData: deepClone(practiceData)
  };
}

function recordUndoState(label) {
  if (isRestoringHistory) return;
  undoStack.push(captureLearningState(label));
  if (undoStack.length > MAX_HISTORY_STEPS) undoStack.shift();
  redoStack = [];
  updateUndoRedoButtons();
}

function restoreLearningState(snapshot) {
  if (!snapshot) return;
  isRestoringHistory = true;
  try {
    folders = deepClone(snapshot.folders || []);
    practiceData = deepClone(snapshot.practiceData || { schemaVersion: 1, modules: { flashcards: { sets: [] }, questions: { sets: [] } } });
    normalizeFoldersData();
    normalizePracticeData();
    selectedFolderIds.clear();
    selectedWordIds.clear();
    saveUserData();
    savePracticeData();
    renderFolders();
    if (currentIftySubject === 'SOCIAL STUDIES' && iftyPortalPage === 'subject') {
      renderIftySocialStudiesPage();
    }
    if (iftyPortalPage === 'years' && typeof window.openIftyYears === 'function') {
      window.openIftyYears();
    }
    const practiceModal = document.getElementById('practiceModal');
    if (practiceModal && practiceModal.style.display !== 'none') renderPracticeHome();
  } finally {
    isRestoringHistory = false;
  }
}

window.undoIfty = function() {
  if (!undoStack.length) return;
  redoStack.push(captureLearningState('やり直し'));
  const snapshot = undoStack.pop();
  restoreLearningState(snapshot);
  updateUndoRedoButtons();
};

window.redoIfty = function() {
  if (!redoStack.length) return;
  undoStack.push(captureLearningState('取り消し'));
  const snapshot = redoStack.pop();
  restoreLearningState(snapshot);
  updateUndoRedoButtons();
};

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById('iftyUndoBtn');
  const redoBtn = document.getElementById('iftyRedoBtn');
  if (undoBtn) {
    undoBtn.disabled = undoStack.length === 0;
    undoBtn.style.opacity = undoStack.length ? '1' : '.4';
  }
  if (redoBtn) {
    redoBtn.disabled = redoStack.length === 0;
    redoBtn.style.opacity = redoStack.length ? '1' : '.4';
  }
}

function ensureIftyThemeStyles() {
  if (document.getElementById('iftyThemeStyles')) return;
  const style = document.createElement('style');
  style.id = 'iftyThemeStyles';
  style.textContent = `
    body[data-ifty-theme="dark"] { background:#020617 !important; color:#e2e8f0 !important; }
    body[data-ifty-theme="dark"] [style*="background:white"],
    body[data-ifty-theme="dark"] [style*="background: white"] { background:#0f172a !important; color:#e2e8f0 !important; }
    body[data-ifty-theme="dark"] [style*="background:#f8fafc"],
    body[data-ifty-theme="dark"] [style*="background: #f8fafc"],
    body[data-ifty-theme="dark"] [style*="background:#faf5ff"],
    body[data-ifty-theme="dark"] [style*="background:#f5f3ff"],
    body[data-ifty-theme="dark"] [style*="background:#eff6ff"] { background:#111827 !important; }
    body[data-ifty-theme="dark"] [style*="color:#0f172a"],
    body[data-ifty-theme="dark"] [style*="color: #0f172a"],
    body[data-ifty-theme="dark"] [style*="color:#334155"],
    body[data-ifty-theme="dark"] [style*="color: #334155"],
    body[data-ifty-theme="dark"] [style*="color:#475569"],
    body[data-ifty-theme="dark"] [style*="color: #475569"] { color:#e2e8f0 !important; }
    body[data-ifty-theme="dark"] input,
    body[data-ifty-theme="dark"] textarea,
    body[data-ifty-theme="dark"] select { background:#0b1220 !important; color:#e2e8f0 !important; border-color:#475569 !important; }
    body[data-ifty-theme="dark"] option { background:#0f172a; color:#e2e8f0; }
    #iftyGlobalLogo img { display:block; width:100%; height:100%; object-fit:contain; }
  `;
  document.head.appendChild(style);
}

function applyIftyTheme() {
  ensureIftyThemeStyles();
  document.body.setAttribute('data-ifty-theme', iftyTheme);
  localStorage.setItem('ifty_theme', iftyTheme);
  const btn = document.getElementById('iftyThemeBtn');
  if (btn) btn.textContent = iftyTheme === 'dark' ? '☀️' : '🌙';
}

window.toggleIftyTheme = function() {
  iftyTheme = iftyTheme === 'dark' ? 'light' : 'dark';
  applyIftyTheme();
  queueIftyCloudSave('テーマ変更');
};

window.goToIftyHome = function() {
  if (typeof window.closeIftySideMenu === 'function') window.closeIftySideMenu();
  if (typeof window.openIftyHome === 'function') {
    window.openIftyHome();
    return;
  }
  if (typeof window.closePracticeModal === 'function') window.closePracticeModal();
  if (typeof window.closeMainLauncher === 'function') window.closeMainLauncher();
  if (typeof window.closeMenuModal === 'function') window.closeMenuModal();
  if (typeof window.switchToVocabView === 'function') window.switchToVocabView();
};

// ==========================================
// Q3 STEP13：IFTY左サイドメニュー
// ==========================================
function ensureIftySideMenuStyles() {
  if (document.getElementById('iftySideMenuStyles')) return;
  const style = document.createElement('style');
  style.id = 'iftySideMenuStyles';
  style.textContent = `
    #iftySideMenuOverlay {
      position: fixed;
      inset: 0;
      z-index: 13050;
      background: rgba(15, 23, 42, .46);
      opacity: 0;
      pointer-events: none;
      transition: opacity .2s ease;
    }
    #iftySideMenuOverlay.ifty-side-menu-open {
      opacity: 1;
      pointer-events: auto;
    }
    #iftySideMenuDrawer {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: min(360px, 86vw);
      box-sizing: border-box;
      background: #ffffff;
      color: #0f172a;
      box-shadow: 12px 0 34px rgba(15, 23, 42, .26);
      transform: translateX(-102%);
      transition: transform .22s ease;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding: 18px 14px 24px;
    }
    #iftySideMenuOverlay.ifty-side-menu-open #iftySideMenuDrawer {
      transform: translateX(0);
    }
    .ifty-side-menu-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 4px 6px 16px;
      border-bottom: 1px solid #e2e8f0;
      margin-bottom: 10px;
    }
    .ifty-side-menu-logo {
      width: 50px;
      height: 50px;
      object-fit: cover;
      border-radius: 50%;
      background: #fff;
      border: 1px solid #cbd5e1;
      flex: 0 0 auto;
    }
    .ifty-side-menu-title {
      font-size: 1.18rem;
      font-weight: 900;
      letter-spacing: .04em;
    }
    .ifty-side-menu-user {
      margin-top: 3px;
      color: #64748b;
      font-size: .78rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 210px;
    }
    .ifty-side-menu-close {
      margin-left: auto;
      width: 36px;
      height: 36px;
      border: none;
      border-radius: 9px;
      background: #f1f5f9;
      color: #334155;
      font-size: 1.08rem;
      cursor: pointer;
    }
    .ifty-side-menu-label {
      padding: 14px 14px 6px;
      color: #64748b;
      font-size: .74rem;
      font-weight: 900;
      letter-spacing: .1em;
    }
    .ifty-side-menu-item {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 12px;
      box-sizing: border-box;
      border: none;
      border-radius: 10px;
      background: transparent;
      color: #0f172a;
      padding: 12px 14px;
      text-align: left;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    .ifty-side-menu-item:hover,
    .ifty-side-menu-item:focus-visible {
      background: #f1f5f9;
      outline: none;
    }
    .ifty-side-menu-item.ifty-side-subject {
      padding-left: 34px;
      font-weight: 700;
    }
    .ifty-side-menu-separator {
      height: 1px;
      background: #e2e8f0;
      margin: 10px 6px;
    }
    .ifty-side-menu-item.ifty-side-logout {
      color: #be123c;
    }
    body[data-ifty-theme="dark"] #iftySideMenuDrawer {
      background: #111827;
      color: #e5e7eb;
      box-shadow: 12px 0 34px rgba(0, 0, 0, .45);
    }
    body[data-ifty-theme="dark"] .ifty-side-menu-header {
      border-color: #334155;
    }
    body[data-ifty-theme="dark"] .ifty-side-menu-separator {
      background-color: #334155;
    }
    body[data-ifty-theme="dark"] .ifty-side-menu-user,
    body[data-ifty-theme="dark"] .ifty-side-menu-label {
      color: #94a3b8;
    }
    body[data-ifty-theme="dark"] .ifty-side-menu-close {
      background: #1e293b;
      color: #e2e8f0;
    }
    body[data-ifty-theme="dark"] .ifty-side-menu-item {
      color: #e5e7eb;
    }
    body[data-ifty-theme="dark"] .ifty-side-menu-item:hover,
    body[data-ifty-theme="dark"] .ifty-side-menu-item:focus-visible {
      background: #1e293b;
    }
    body[data-ifty-theme="dark"] .ifty-side-menu-item.ifty-side-logout {
      color: #fb7185;
    }
  `;
  document.head.appendChild(style);
}

function renderIftySideMenu() {
  ensureIftySideMenuStyles();
  let overlay = document.getElementById('iftySideMenuOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'iftySideMenuOverlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.addEventListener('click', event => {
      if (event.target === overlay) window.closeIftySideMenu();
    });
    document.body.appendChild(overlay);
  }

  const accountName = escapeHtml(String(iftyDeveloperMode ? 'Developer' : ((iftyAccount && iftyAccount.username) || currentUser || '')));
  overlay.innerHTML = `
    <nav id="iftySideMenuDrawer" aria-label="IFTYメニュー" onclick="event.stopPropagation()">
      <div class="ifty-side-menu-header">
        <img class="ifty-side-menu-logo" src="${getIftyProfileImageSrc()}" alt="プロフィール">
        <div style="min-width:0;">
          <div class="ifty-side-menu-title">IFTY</div>
          <div class="ifty-side-menu-user">${accountName}</div>
        </div>
        <button class="ifty-side-menu-close" type="button" onclick="closeIftySideMenu()" aria-label="メニューを閉じる">×</button>
      </div>

      <button class="ifty-side-menu-item" type="button" onclick="openIftySideMenuHome()">HOME</button>

      <div class="ifty-side-menu-label">SUBJECTS</div>
      <button class="ifty-side-menu-item ifty-side-subject" type="button" onclick="openIftySubject('ENGLISH')">VOCABULARY</button>
      <button class="ifty-side-menu-item ifty-side-subject" type="button" onclick="openIftySubject('ANCIENT')">ANCIENT</button>
      <button class="ifty-side-menu-item ifty-side-subject" type="button" onclick="openIftySubject('SCIENCE')">SCIENCE</button>
      <button class="ifty-side-menu-item ifty-side-subject" type="button" onclick="openIftySubject('SOCIAL STUDIES')">SOCIAL STUDIES</button>

      <div class="ifty-side-menu-separator"></div>
      <div class="ifty-side-menu-label">TOOLS</div>
      <button class="ifty-side-menu-item" type="button" onclick="closeIftySideMenu(); switchToChatView();">ALLIA</button>
      <button class="ifty-side-menu-item" type="button" onclick="closeIftySideMenu(); openIftyExampleBank();">EXAMPLES</button>
      <button class="ifty-side-menu-item" type="button" onclick="closeIftySideMenu(); openIftyBasicSentences();">BASIC SENTENCES</button>
      <button class="ifty-side-menu-item" type="button" onclick="closeIftySideMenu(); openIftyYears();">YEARS</button>
      <button class="ifty-side-menu-item" type="button" onclick="closeIftySideMenu(); openPracticeHome(currentIftySubject);">PRACTICE</button>

      <div class="ifty-side-menu-separator"></div>
      <button class="ifty-side-menu-item" type="button" onclick="openIftySettings()">SETTINGS</button>
      <button class="ifty-side-menu-item ifty-side-logout" type="button" onclick="closeIftySideMenu(); logout();">LOG OUT</button>
    </nav>`;

  return overlay;
}

window.openIftySideMenu = function(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  // 左上プロフィールが表示されているログイン後画面なら、個別ページのdisplay状態に
  // 依存せず必ずメニューを開けるようにする。
  if (!currentUser && !iftyAccount && !iftyDeveloperMode) return;
  if (typeof window.closeMainLauncher === 'function') window.closeMainLauncher();
  const overlay = renderIftySideMenu();
  overlay.style.display = 'block';
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.remove('ifty-side-menu-open');
  // Safari/PWAでも確実にトランジションを開始させる。
  void overlay.offsetWidth;
  overlay.classList.add('ifty-side-menu-open');
};

window.closeIftySideMenu = function() {
  const overlay = document.getElementById('iftySideMenuOverlay');
  if (!overlay) return;
  overlay.classList.remove('ifty-side-menu-open');
  overlay.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => {
    if (!overlay.classList.contains('ifty-side-menu-open')) overlay.style.display = 'none';
  }, 230);
};

window.toggleIftySideMenu = function(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const overlay = document.getElementById('iftySideMenuOverlay');
  if (overlay && overlay.classList.contains('ifty-side-menu-open')) {
    window.closeIftySideMenu();
  } else {
    window.openIftySideMenu();
  }
};

// ==========================================
// Q3 STEP17：教科別 ORDER
// ==========================================
function normalizeIftySubject(subject) {
  const normalized = String(subject || '').trim().toUpperCase();
  if (
    normalized === 'VOCABULARY' ||
    normalized === 'FOREIGN LANGUAGES' ||
    normalized === 'FOREIGN LANGUAGE'
  ) return 'ENGLISH';
  return IFTY_SUBJECT_KEYS.includes(normalized) ? normalized : 'ENGLISH';
}

function getIftySubjectDisplayName(subject) {
  const key = normalizeIftySubject(subject);
  return key === 'ENGLISH' ? 'VOCABULARY' : key;
}

function normalizeIftyLanguageCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const cleaned = raw.replace(/_/g, '-');
  const match = cleaned.match(/^[A-Za-z]{2,3}(?:-[A-Za-z]{2,4})?$/);
  return match ? cleaned : '';
}

function inferIftyLanguageFromText(text) {
  const value = String(text || '');
  if (/[぀-ヿ㐀-鿿]/.test(value)) return { label: '日本語', code: 'ja' };
  if (/[가-힯]/.test(value)) return { label: '韓国語', code: 'ko' };
  if (/[Ѐ-ӿ]/.test(value)) return { label: 'ロシア語など', code: 'ru' };
  if (/[؀-ۿ]/.test(value)) return { label: 'アラビア語', code: 'ar' };
  if (/[Ͱ-Ͽ]/.test(value)) return { label: 'ギリシャ語', code: 'el' };
  if (/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(value)) return { label: '英語', code: 'en' };
  return { label: '言語未設定', code: '' };
}

function getIftyWordLanguageInfo(word) {
  const source = word && typeof word === 'object' ? word : {};
  const inferred = inferIftyLanguageFromText(source.word || '');
  return {
    label: String(source.language || source.languageLabel || inferred.label || '言語未設定').trim(),
    code: normalizeIftyLanguageCode(source.languageCode || source.lang || inferred.code)
  };
}

function getIftySpeechLocale(languageCode, languageLabel, text = '') {
  const code = normalizeIftyLanguageCode(languageCode).toLowerCase();
  if (code.startsWith('ja')) return 'ja-JP';
  if (code.startsWith('en')) return 'en-US';
  if (code.startsWith('fr')) return 'fr-FR';
  if (code.startsWith('de')) return 'de-DE';
  if (code.startsWith('es')) return 'es-ES';
  if (code.startsWith('it')) return 'it-IT';
  if (code.startsWith('pt')) return 'pt-PT';
  if (code.startsWith('ko')) return 'ko-KR';
  if (code.startsWith('zh')) return 'zh-CN';
  if (code.startsWith('ru')) return 'ru-RU';
  if (code.startsWith('ar')) return 'ar-SA';
  if (code.startsWith('el')) return 'el-GR';
  if (code.startsWith('nl')) return 'nl-NL';
  if (code.startsWith('sv')) return 'sv-SE';
  if (code.startsWith('pl')) return 'pl-PL';
  if (code.startsWith('tr')) return 'tr-TR';
  const label = String(languageLabel || '');
  if (/日本語/.test(label)) return 'ja-JP';
  if (/韓国|朝鮮/.test(label)) return 'ko-KR';
  if (/中国|北京|普通話|中国語/.test(label)) return 'zh-CN';
  if (/フランス/.test(label)) return 'fr-FR';
  if (/ドイツ/.test(label)) return 'de-DE';
  if (/スペイン/.test(label)) return 'es-ES';
  if (/イタリア/.test(label)) return 'it-IT';
  if (/ロシア/.test(label)) return 'ru-RU';
  if (/アラビア/.test(label)) return 'ar-SA';
  return inferIftyLanguageFromText(text).code === 'ja' ? 'ja-JP' : 'en-US';
}

function makeEmptyIftyOrderSubjectState() {
  return { activeId: null, orders: [] };
}

function makeEmptyIftySubjectOrders() {
  return {
    ENGLISH: makeEmptyIftyOrderSubjectState(),
    ANCIENT: makeEmptyIftyOrderSubjectState(),
    SCIENCE: makeEmptyIftyOrderSubjectState(),
    'SOCIAL STUDIES': makeEmptyIftyOrderSubjectState()
  };
}

function makeEmptyIftySubjectOrderMeta() {
  return {
    ENGLISH: 0,
    ANCIENT: 0,
    SCIENCE: 0,
    'SOCIAL STUDIES': 0
  };
}

function makeIftyLegacyOrderId(subject) {
  return `legacy_${String(subject || 'subject').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
}

function normalizeIftyOrderEntry(value, subject, index = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const text = String(value.text ?? value.order ?? '').trim().slice(0, IFTY_ORDER_MAX_CHARS);
  let id = String(value.id || '').trim();
  if (!id) id = `order_${String(subject || 'subject').toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${index + 1}`;

  let name = String(value.name || '').trim().slice(0, 120);
  if (!name) name = `ORDER ${index + 1}`;

  const createdAtRaw = Number(value.createdAt || 0);
  const updatedAtRaw = Number(value.updatedAt || 0);

  return {
    id,
    name,
    text,
    createdAt: Number.isFinite(createdAtRaw) && createdAtRaw > 0 ? Math.floor(createdAtRaw) : 0,
    updatedAt: Number.isFinite(updatedAtRaw) && updatedAtRaw > 0 ? Math.floor(updatedAtRaw) : 0
  };
}

function normalizeIftyOrderSubjectState(value, subject) {
  // STEP45以前：教科ごとに1本の文字列ORDERを保存していた。
  // 非空文字列は「ORDER 1」として自動移行し、そのまま使用中にする。
  if (typeof value === 'string') {
    const text = value.trim().slice(0, IFTY_ORDER_MAX_CHARS);
    if (!text) return makeEmptyIftyOrderSubjectState();

    const id = makeIftyLegacyOrderId(subject);
    return {
      activeId: id,
      orders: [{
        id,
        name: 'ORDER 1',
        text,
        createdAt: 0,
        updatedAt: 0
      }]
    };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return makeEmptyIftyOrderSubjectState();
  }

  const rawOrders = Array.isArray(value.orders) ? value.orders : [];
  const orders = [];
  const usedIds = new Set();

  rawOrders.forEach((rawOrder, index) => {
    const normalized = normalizeIftyOrderEntry(rawOrder, subject, index);
    if (!normalized) return;

    let id = normalized.id;
    if (usedIds.has(id)) {
      let suffix = 2;
      while (usedIds.has(`${id}_${suffix}`)) suffix += 1;
      id = `${id}_${suffix}`;
    }
    usedIds.add(id);
    normalized.id = id;
    orders.push(normalized);
  });

  const requestedActiveId = value.activeId == null ? null : String(value.activeId);
  const activeId = requestedActiveId && orders.some(order => order.id === requestedActiveId)
    ? requestedActiveId
    : null;

  return { activeId, orders };
}

function normalizeIftySubjectOrders(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = makeEmptyIftySubjectOrders();

  IFTY_SUBJECT_KEYS.forEach(subject => {
    normalized[subject] = normalizeIftyOrderSubjectState(source[subject], subject);
  });

  return normalized;
}

function normalizeIftySubjectOrderMeta(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = makeEmptyIftySubjectOrderMeta();

  IFTY_SUBJECT_KEYS.forEach(subject => {
    const raw = Number(source[subject] || 0);
    normalized[subject] = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  });

  return normalized;
}

function getIftyOrderStorageKey(username = currentUser) {
  return IFTY_ORDER_STORAGE_PREFIX + String(username || 'default_user');
}

function getIftyOrderMetaStorageKey(username = currentUser) {
  return IFTY_ORDER_META_STORAGE_PREFIX + String(username || 'default_user');
}

function loadIftySubjectOrders(username = currentUser) {
  let saved = null;
  let savedMeta = null;
  try {
    saved = JSON.parse(localStorage.getItem(getIftyOrderStorageKey(username)) || 'null');
  } catch (_) {
    saved = null;
  }
  try {
    savedMeta = JSON.parse(localStorage.getItem(getIftyOrderMetaStorageKey(username)) || 'null');
  } catch (_) {
    savedMeta = null;
  }

  iftySubjectOrders = normalizeIftySubjectOrders(saved);
  iftySubjectOrderUpdatedAt = normalizeIftySubjectOrderMeta(savedMeta);

  // 旧「1教科1ORDER」形式は、normalize時にORDER 1へ自動移行する。
  // 更新時刻はSTEP45と同じく捏造せず、legacy=0のまま扱う。
  try {
    localStorage.setItem(getIftyOrderStorageKey(username), JSON.stringify(iftySubjectOrders));
  } catch (_) {}
}

function nextIftySubjectOrderTimestamp(subject) {
  const key = normalizeIftySubject(subject);
  const known = Number(iftySubjectOrderUpdatedAt[key] || 0);
  return Math.max(Date.now(), known + 1);
}

function saveIftySubjectOrders(options = {}) {
  iftySubjectOrders = normalizeIftySubjectOrders(iftySubjectOrders);
  iftySubjectOrderUpdatedAt = normalizeIftySubjectOrderMeta(iftySubjectOrderUpdatedAt);

  try {
    localStorage.setItem(getIftyOrderStorageKey(currentUser), JSON.stringify(iftySubjectOrders));
    localStorage.setItem(getIftyOrderMetaStorageKey(currentUser), JSON.stringify(iftySubjectOrderUpdatedAt));
  } catch (_) {}

  if (options.queueCloud !== false) {
    queueIftyCloudSave('ORDER更新');
  }
}

function hasIftySavedOrders(subjectState) {
  return !!(subjectState && Array.isArray(subjectState.orders) && subjectState.orders.length);
}

function mergeIftySubjectOrderState(localOrdersValue, localMetaValue, remoteOrdersValue, remoteMetaValue) {
  const localOrders = normalizeIftySubjectOrders(localOrdersValue);
  const localMeta = normalizeIftySubjectOrderMeta(localMetaValue);
  const remoteOrders = normalizeIftySubjectOrders(remoteOrdersValue);
  const remoteMeta = normalizeIftySubjectOrderMeta(remoteMetaValue);

  const orders = makeEmptyIftySubjectOrders();
  const updatedAt = makeEmptyIftySubjectOrderMeta();

  IFTY_SUBJECT_KEYS.forEach(subject => {
    const localState = localOrders[subject];
    const remoteState = remoteOrders[subject];
    const localTime = Number(localMeta[subject] || 0);
    const remoteTime = Number(remoteMeta[subject] || 0);

    if (localTime > remoteTime) {
      orders[subject] = localState;
      updatedAt[subject] = localTime;
      return;
    }
    if (remoteTime > localTime) {
      orders[subject] = remoteState;
      updatedAt[subject] = remoteTime;
      return;
    }

    const localHas = hasIftySavedOrders(localState);
    const remoteHas = hasIftySavedOrders(remoteState);

    // legacy同士など更新時刻が同じ/不明な場合は、
    // 片方だけに保存ORDERがあるなら、そのORDERを失わない。
    if (localHas && !remoteHas) {
      orders[subject] = localState;
      updatedAt[subject] = localTime || remoteTime;
      return;
    }
    if (remoteHas && !localHas) {
      orders[subject] = remoteState;
      updatedAt[subject] = remoteTime || localTime;
      return;
    }

    // 両方に保存ORDERがあり時刻が同じ/不明ならSTEP45同様クラウド側を優先。
    // 両方空ならどちらでも等価。
    orders[subject] = remoteHas ? remoteState : localState;
    updatedAt[subject] = remoteTime || localTime;
  });

  return { orders, updatedAt };
}

function isSameIftySubjectOrderState(ordersA, metaA, ordersB, metaB) {
  const aOrders = normalizeIftySubjectOrders(ordersA);
  const bOrders = normalizeIftySubjectOrders(ordersB);
  const aMeta = normalizeIftySubjectOrderMeta(metaA);
  const bMeta = normalizeIftySubjectOrderMeta(metaB);

  return IFTY_SUBJECT_KEYS.every(subject =>
    JSON.stringify(aOrders[subject]) === JSON.stringify(bOrders[subject]) &&
    Number(aMeta[subject] || 0) === Number(bMeta[subject] || 0)
  );
}

function getIftySubjectOrderState(subject = currentIftySubject) {
  const key = normalizeIftySubject(subject);
  const state = normalizeIftyOrderSubjectState(iftySubjectOrders[key], key);
  iftySubjectOrders[key] = state;
  return state;
}

function getIftySubjectOrderProfiles(subject = currentIftySubject) {
  return getIftySubjectOrderState(subject).orders;
}

function getIftyActiveOrderEntry(subject = currentIftySubject) {
  const state = getIftySubjectOrderState(subject);
  if (!state.activeId) return null;
  return state.orders.find(order => order.id === state.activeId) || null;
}

function getIftySubjectOrderName(subject = currentIftySubject) {
  const active = getIftyActiveOrderEntry(subject);
  return active ? active.name : 'ORDERなし';
}

function getIftySubjectOrder(subject = currentIftySubject) {
  const active = getIftyActiveOrderEntry(subject);
  return active ? String(active.text || '').trim() : '';
}

function getIftyOrderStatus(subject) {
  const state = getIftySubjectOrderState(subject);
  const active = getIftyActiveOrderEntry(subject);
  const count = state.orders.length;
  if (!active) return `ORDERなし / 保存 ${count}件`;
  return `使用中: ${active.name}（${String(active.text || '').length}文字） / 保存 ${count}件`;
}

function renderIftyOrderSettingsCards() {
  return IFTY_SUBJECT_KEYS.map(subject => {
    const state = getIftySubjectOrderState(subject);
    const active = getIftyActiveOrderEntry(subject);
    const order = active ? String(active.text || '').trim() : '';
    const preview = active
      ? (order
          ? escapeHtml(order.replace(/\s+/g, ' ').slice(0, 72)) + (order.replace(/\s+/g, ' ').length > 72 ? '…' : '')
          : `${escapeHtml(active.name)} は空です。`)
      : (state.orders.length
          ? `ORDERなしを使用中。保存済みORDERは${state.orders.length}件あります。`
          : '保存済みORDERはありません。');

    return `
      <button type="button" onclick="openIftySubjectOrder('${subject.replace(/'/g, "\\'")}')" style="width:100%;text-align:left;border:1px solid #cbd5e1;background:transparent;color:inherit;border-radius:10px;padding:12px;cursor:pointer;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
          <strong>${escapeHtml(getIftySubjectDisplayName(subject))}</strong>
          <span style="font-size:.76em;font-weight:900;color:${active ? '#0284c7' : '#64748b'};">${escapeHtml(getIftyOrderStatus(subject))}</span>
        </div>
        <div class="ifty-settings-note" style="margin-top:5px;">${preview}</div>
      </button>`;
  }).join('');
}

window.closeIftyOrderModal = function() {
  const modal = document.getElementById('iftyOrderModal');
  if (modal) modal.remove();
};

window.updateIftyOrderCharCount = function() {
  const textarea = document.getElementById('iftyOrderTextarea');
  const counter = document.getElementById('iftyOrderCharCount');
  if (!textarea || !counter) return;
  counter.textContent = `${String(textarea.value || '').length} / ${IFTY_ORDER_MAX_CHARS}`;
};

function getIftyOrderEditorEntry(subject, orderId) {
  const state = getIftySubjectOrderState(subject);
  return state.orders.find(order => order.id === String(orderId || '')) || null;
}

function makeNextIftyOrderName(subject) {
  const used = new Set(getIftySubjectOrderProfiles(subject).map(order => String(order.name || '').trim()));
  let number = 1;
  while (used.has(`ORDER ${number}`)) number += 1;
  return `ORDER ${number}`;
}

window.openIftySubjectOrder = function(subject, editOrderId = '') {
  const key = normalizeIftySubject(subject);
  const state = getIftySubjectOrderState(key);
  window.closeIftyOrderModal();

  let editorId = String(editOrderId || '');
  if (!state.orders.some(order => order.id === editorId)) {
    editorId = state.activeId && state.orders.some(order => order.id === state.activeId)
      ? state.activeId
      : (state.orders[0]?.id || '');
  }
  const editor = getIftyOrderEditorEntry(key, editorId);
  const activeId = state.activeId || '';

  const activeOptions = [
    `<option value="" ${!activeId ? 'selected' : ''}>ORDERなし</option>`,
    ...state.orders.map(order =>
      `<option value="${escapeHtml(order.id)}" ${activeId === order.id ? 'selected' : ''}>${escapeHtml(order.name)}</option>`
    )
  ].join('');

  const editorOptions = state.orders.length
    ? state.orders.map(order =>
        `<option value="${escapeHtml(order.id)}" ${editorId === order.id ? 'selected' : ''}>${escapeHtml(order.name)}</option>`
      ).join('')
    : '<option value="">（ORDER未作成）</option>';

  const modal = document.createElement('div');
  modal.id = 'iftyOrderModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.70);z-index:12120;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
  modal.innerHTML = `
    <div role="dialog" aria-modal="true" aria-labelledby="iftyOrderTitle" style="width:min(780px,100%);max-height:90vh;overflow:auto;background:#fff;color:#0f172a;border-radius:16px;padding:20px;box-shadow:0 20px 55px rgba(0,0,0,.35);">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div>
          <h2 id="iftyOrderTitle" style="margin:0;">${escapeHtml(getIftySubjectDisplayName(key))} ORDER</h2>
          <div style="margin-top:6px;color:#64748b;font-size:.86em;line-height:1.55;">
            複数のORDERを保存し、使用するORDERを切り替えられます。<br>
            「ORDERなし」を選ぶと、保存済みORDERは残したままALLIA・AI生成にORDERを適用しません。
          </div>
        </div>
        <button type="button" onclick="closeIftyOrderModal()" aria-label="閉じる" style="border:none;background:#e2e8f0;color:#334155;border-radius:8px;width:36px;height:36px;font-size:1.15em;cursor:pointer;">×</button>
      </div>

      <div style="margin-top:14px;padding:12px;border:1px solid #bae6fd;background:#f0f9ff;border-radius:10px;">
        <label for="iftyActiveOrderSelect" style="display:block;font-size:.8em;font-weight:900;color:#0c4a6e;margin-bottom:6px;">現在使用するORDER</label>
        <select id="iftyActiveOrderSelect" onchange="setIftyActiveSubjectOrder('${key.replace(/'/g, "\\'")}', this.value)" style="width:100%;padding:10px;border:1px solid #7dd3fc;border-radius:8px;background:white;font-weight:800;">
          ${activeOptions}
        </select>
        <div style="margin-top:6px;font-size:.76em;color:#64748b;">切り替えは即時保存され、次のALLIA応答・AI生成から反映されます。</div>
      </div>

      <div style="margin-top:14px;padding:12px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:10px;">
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
          <div style="flex:1;min-width:220px;">
            <label for="iftyOrderEditorSelect" style="display:block;font-size:.8em;font-weight:900;color:#334155;margin-bottom:6px;">編集するORDER</label>
            <select id="iftyOrderEditorSelect" onchange="selectIftyOrderForEdit('${key.replace(/'/g, "\\'")}', this.value)" ${state.orders.length ? '' : 'disabled'} style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:white;">
              ${editorOptions}
            </select>
          </div>
          <button type="button" onclick="createIftySubjectOrder('${key.replace(/'/g, "\\'")}')" style="border:none;background:#0f766e;color:white;padding:10px 13px;border-radius:8px;font-weight:900;cursor:pointer;">＋ 新規ORDER</button>
        </div>
      </div>

      <div style="margin-top:14px;">
        <label for="iftyOrderNameInput" style="display:block;font-size:.8em;font-weight:900;color:#334155;margin-bottom:5px;">ORDER名</label>
        <input id="iftyOrderNameInput" maxlength="120" value="${escapeHtml(editor?.name || '')}" ${editor ? '' : 'disabled'} placeholder="例：通常 / 詳細重視 / テスト前" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-weight:800;">
      </div>

      <div style="margin-top:10px;padding:11px 12px;background:#f1f5f9;border-radius:9px;color:#475569;font-size:.82em;line-height:1.55;">
        例：語彙では一般的な意味だけでなく、辞書に載る稀な意味・古義・専門用法も示す。<br>
        例：テスト前は学校の授業で問われやすい内容を最優先する。
      </div>

      <textarea id="iftyOrderTextarea" maxlength="${IFTY_ORDER_MAX_CHARS}" rows="13" oninput="updateIftyOrderCharCount()" ${editor ? '' : 'disabled'} placeholder="${editor ? 'このORDERの指示を自由に記述…' : 'まず「＋ 新規ORDER」でORDERを作成してください。'}" style="width:100%;box-sizing:border-box;margin-top:13px;padding:12px;border:2px solid #94a3b8;border-radius:10px;font-size:1em;line-height:1.6;resize:vertical;${editor ? '' : 'background:#f8fafc;color:#94a3b8;'}">${escapeHtml(editor?.text || '')}</textarea>

      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:7px;flex-wrap:wrap;">
        <div id="iftyOrderCharCount" style="font-size:.78em;color:#64748b;"></div>
        <div style="font-size:.76em;color:#64748b;">必須の出力形式・データ保護・安全上の制約はORDERより優先されます。</div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
        <button type="button" onclick="saveIftySubjectOrderFromModal('${key.replace(/'/g, "\\'")}')" ${editor ? '' : 'disabled'} style="flex:1;min-width:150px;border:none;background:${editor ? '#0284c7' : '#94a3b8'};color:white;padding:11px;border-radius:9px;font-weight:900;cursor:${editor ? 'pointer' : 'not-allowed'};">SAVE ORDER</button>
        <button type="button" onclick="deleteIftySubjectOrder('${key.replace(/'/g, "\\'")}')" ${editor ? '' : 'disabled'} style="border:none;background:${editor ? '#dc2626' : '#cbd5e1'};color:white;padding:11px 14px;border-radius:9px;font-weight:900;cursor:${editor ? 'pointer' : 'not-allowed'};">DELETE ORDER</button>
      </div>
      <div id="iftyOrderModalStatus" style="min-height:1.25em;margin-top:8px;color:#475569;font-size:.82em;"></div>
    </div>`;

  modal.addEventListener('click', event => {
    if (event.target === modal) window.closeIftyOrderModal();
  });
  document.body.appendChild(modal);
  window.updateIftyOrderCharCount();

  const textarea = document.getElementById('iftyOrderTextarea');
  if (textarea && editor) setTimeout(() => textarea.focus(), 30);
};

window.selectIftyOrderForEdit = function(subject, orderId) {
  const key = normalizeIftySubject(subject);
  const id = String(orderId || '');
  window.openIftySubjectOrder(key, id);
};

window.setIftyActiveSubjectOrder = function(subject, orderId) {
  const key = normalizeIftySubject(subject);
  const state = getIftySubjectOrderState(key);
  const requestedId = String(orderId || '');
  const nextActiveId = requestedId && state.orders.some(order => order.id === requestedId)
    ? requestedId
    : null;

  if (state.activeId === nextActiveId) return;

  const editorId = String(document.getElementById('iftyOrderEditorSelect')?.value || '');
  state.activeId = nextActiveId;
  iftySubjectOrders[key] = state;
  iftySubjectOrderUpdatedAt[key] = nextIftySubjectOrderTimestamp(key);
  saveIftySubjectOrders();
  refreshIftyEnglishOrderPanel();
  refreshIftyEnglishSubjectPanel();

  window.openIftySubjectOrder(key, editorId || nextActiveId || '');
  const status = document.getElementById('iftyOrderModalStatus');
  if (status) {
    status.textContent = nextActiveId
      ? `${getIftySubjectDisplayName(key)}で「${getIftySubjectOrderName(key)}」を使用します。`
      : `${getIftySubjectDisplayName(key)}をORDERなしに切り替えました。`;
    status.style.color = '#15803d';
  }
};

window.createIftySubjectOrder = function(subject) {
  const key = normalizeIftySubject(subject);
  const state = getIftySubjectOrderState(key);
  const now = Date.now();
  const order = {
    id: makeId('order'),
    name: makeNextIftyOrderName(key),
    text: '',
    createdAt: now,
    updatedAt: now
  };

  state.orders.push(order);
  state.activeId = order.id;
  iftySubjectOrders[key] = state;
  iftySubjectOrderUpdatedAt[key] = nextIftySubjectOrderTimestamp(key);
  saveIftySubjectOrders();
  refreshIftyEnglishOrderPanel();
  refreshIftyEnglishSubjectPanel();

  window.openIftySubjectOrder(key, order.id);
  const nameInput = document.getElementById('iftyOrderNameInput');
  if (nameInput) {
    nameInput.select();
    nameInput.focus();
  }
  const status = document.getElementById('iftyOrderModalStatus');
  if (status) {
    status.textContent = `${order.name} を作成し、使用中にしました。`;
    status.style.color = '#15803d';
  }
};

window.saveIftySubjectOrderFromModal = function(subject) {
  const key = normalizeIftySubject(subject);
  const state = getIftySubjectOrderState(key);
  const editorId = String(document.getElementById('iftyOrderEditorSelect')?.value || '');
  const entry = state.orders.find(order => order.id === editorId);
  const nameInput = document.getElementById('iftyOrderNameInput');
  const textarea = document.getElementById('iftyOrderTextarea');
  const status = document.getElementById('iftyOrderModalStatus');
  if (!entry || !nameInput || !textarea) return;

  const name = String(nameInput.value || '').trim().slice(0, 120);
  const value = String(textarea.value || '').trim();

  if (!name) {
    if (status) {
      status.textContent = 'ORDER名を入力してください。';
      status.style.color = '#dc2626';
    }
    nameInput.focus();
    return;
  }

  if (value.length > IFTY_ORDER_MAX_CHARS) {
    if (status) {
      status.textContent = `ORDERは${IFTY_ORDER_MAX_CHARS}文字以内にしてください。`;
      status.style.color = '#dc2626';
    }
    return;
  }

  const duplicate = state.orders.find(order =>
    order.id !== entry.id &&
    String(order.name || '').trim().toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    if (status) {
      status.textContent = '同じ名前のORDERがすでにあります。';
      status.style.color = '#dc2626';
    }
    nameInput.focus();
    return;
  }

  entry.name = name;
  entry.text = value;
  entry.updatedAt = Date.now();
  iftySubjectOrders[key] = state;
  iftySubjectOrderUpdatedAt[key] = nextIftySubjectOrderTimestamp(key);
  saveIftySubjectOrders();
  refreshIftyEnglishOrderPanel();
  refreshIftyEnglishSubjectPanel();

  if (status) {
    status.textContent = `${name} を保存しました。${state.activeId === entry.id ? '現在使用中です。' : '保存済みですが現在は使用していません。'}`;
    status.style.color = '#15803d';
  }
};

window.deleteIftySubjectOrder = function(subject) {
  const key = normalizeIftySubject(subject);
  const state = getIftySubjectOrderState(key);
  const editorId = String(document.getElementById('iftyOrderEditorSelect')?.value || '');
  const entry = state.orders.find(order => order.id === editorId);
  if (!entry) return;

  if (!confirm(`ORDER「${entry.name}」を削除しますか？\nこの操作では他のORDERは削除されません。`)) return;

  state.orders = state.orders.filter(order => order.id !== entry.id);
  if (state.activeId === entry.id) state.activeId = null;
  iftySubjectOrders[key] = state;
  iftySubjectOrderUpdatedAt[key] = nextIftySubjectOrderTimestamp(key);
  saveIftySubjectOrders();
  refreshIftyEnglishOrderPanel();
  refreshIftyEnglishSubjectPanel();

  window.openIftySubjectOrder(key, state.orders[0]?.id || '');
  const status = document.getElementById('iftyOrderModalStatus');
  if (status) {
    status.textContent = `「${entry.name}」を削除しました。`;
    status.style.color = '#15803d';
  }
};

// STEP45までの旧関数名との互換性。
// 現在は「空にする」ではなく、保存済みORDERを残したままORDERなしへ切り替える。
window.clearIftySubjectOrder = function(subject) {
  window.setIftyActiveSubjectOrder(subject, '');
};

// Q3 STEP18：ENGLISHにも他教科と同じORDER入口を表示する。
function ensureIftyEnglishVocabTools() {
  const vocabPage = document.getElementById('vocabPage');
  if (!vocabPage) return;

  let subjectPanel = document.getElementById('iftyEnglishSubjectPanel');
  if (!subjectPanel) {
    subjectPanel = document.createElement('div');
    subjectPanel.id = 'iftyEnglishSubjectPanel';
    subjectPanel.style.cssText = 'background:white;border:1px solid #e2e8f0;border-radius:14px;padding:18px;margin-bottom:12px;box-shadow:0 1px 3px rgba(15,23,42,.05);';
    vocabPage.insertBefore(subjectPanel, vocabPage.firstChild);
  }

  let orderPanel = document.getElementById('iftyEnglishOrderPanel');
  if (!orderPanel) {
    orderPanel = document.createElement('div');
    orderPanel.id = 'iftyEnglishOrderPanel';
    orderPanel.style.cssText = 'background:white;border:1px solid #cbd5e1;border-radius:10px;padding:12px;margin-bottom:12px;box-shadow:0 1px 3px rgba(15,23,42,.05);';
    subjectPanel.insertAdjacentElement('afterend', orderPanel);
  }

  let searchPanel = document.getElementById('iftyVocabSearchPanel');
  if (!searchPanel) {
    searchPanel = document.createElement('div');
    searchPanel.id = 'iftyVocabSearchPanel';
    searchPanel.style.cssText = 'background:white;border:1px solid #cbd5e1;border-radius:10px;padding:12px;margin-bottom:12px;box-shadow:0 1px 3px rgba(15,23,42,.05);';
    orderPanel.insertAdjacentElement('afterend', searchPanel);
  }

  refreshIftyEnglishSubjectPanel();
  refreshIftyEnglishOrderPanel();
  refreshIftyVocabSearchPanel();
}

function refreshIftyEnglishSubjectPanel() {
  const panel = document.getElementById('iftyEnglishSubjectPanel');
  if (!panel) return;
  const wordCount = folders.reduce((sum, folder) => sum + (Array.isArray(folder.words) ? folder.words.length : 0), 0);
  panel.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div>
        <h1 style="margin:0;color:#0f172a;font-size:1.55rem;font-weight:900;letter-spacing:.015em;">VOCABULARY</h1>
        <div style="margin-top:6px;color:#64748b;font-size:.9em;">英語を含む外国語と日本語の語彙をフォルダごとに追加・編集し、ALLIA・復習・PRACTICEへつなげます。</div>
      </div>
      <button type="button" onclick="openIftyHome()" style="border:none;background:#e2e8f0;color:#334155;border-radius:8px;padding:9px 12px;font-weight:900;cursor:pointer;">HOMEへ戻る</button>
    </div>

    <div style="margin-top:14px;padding:13px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div>
          <div style="font-weight:900;color:#0f172a;">ORDER / ALLIA</div>
          <div style="font-size:.78em;color:#64748b;margin-top:3px;">${escapeHtml(getIftyOrderStatus('ENGLISH'))}。VOCABULARY専用の生成・編集を行います。</div>
        </div>
        <div style="display:flex;gap:7px;flex-wrap:wrap;">
          <button type="button" onclick="openPracticeHome('ENGLISH')" style="border:none;background:#0f766e;color:white;border-radius:8px;padding:9px 12px;font-weight:900;cursor:pointer;">⚔️ PRACTICE</button>
          <button type="button" onclick="openIftySubjectOrder('ENGLISH')" style="border:none;background:#0284c7;color:white;border-radius:8px;padding:9px 12px;font-weight:900;cursor:pointer;">ORDERを編集</button>
          <button type="button" onclick="openIftySubjectAllia('ENGLISH')" style="border:none;background:#7c3aed;color:white;border-radius:8px;padding:9px 12px;font-weight:900;cursor:pointer;">🤖 ALLIA</button>
        </div>
      </div>
    </div>

    <div style="margin-top:12px;padding:13px;border:1px solid #bae6fd;border-radius:10px;background:#f0f9ff;">
      <div style="font-weight:900;color:#0c4a6e;">新しい外国語フォルダ</div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:9px;align-items:center;">
        <input id="iftyEnglishFolderName" placeholder="例：英検1級 / フランス語 / 現代文語彙" onkeydown="if(event.key==='Enter'){event.preventDefault();createIftyEnglishFolder();}" style="flex:1;min-width:210px;padding:9px;border:1px solid #7dd3fc;border-radius:7px;font-size:.95em;">
        <button type="button" onclick="createIftyEnglishFolder()" style="border:none;background:#0369a1;color:white;border-radius:7px;padding:9px 12px;font-weight:900;cursor:pointer;">作成</button>
      </div>
      <div style="margin-top:8px;color:#64748b;font-size:.76em;">フォルダ ${folders.length} / 単語 ${wordCount}</div>
    </div>`;
}

window.createIftyEnglishFolder = function() {
  const input = document.getElementById('iftyEnglishFolderName');
  const name = String(input?.value || '').trim();
  if (!name) {
    alert('フォルダ名を入力してください。');
    input?.focus();
    return;
  }
  recordUndoState('外国語フォルダ作成');
  folders.push({ id: makeId('folder'), name, collapsed: false, words: [] });
  if (input) input.value = '';
  saveUserData();
  renderFolders();
  refreshIftyEnglishSubjectPanel();
  setTimeout(() => document.getElementById('iftyEnglishFolderName')?.focus(), 0);
};

function refreshIftyEnglishOrderPanel() {
  const panel = document.getElementById('iftyEnglishOrderPanel');
  if (!panel) return;
  const status = getIftyOrderStatus('ENGLISH');
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
      <div style="min-width:0;">
        <div style="font-weight:900;color:#0f172a;">ORDER</div>
        <div style="font-size:.82em;color:#64748b;margin-top:3px;">${escapeHtml(status)}。このORDERはVOCABULARYだけに適用されます。</div>
      </div>
      <button type="button" onclick="openIftySubjectOrder('ENGLISH')" style="border:none;background:#0284c7;color:white;padding:9px 12px;border-radius:8px;font-weight:900;cursor:pointer;">ORDERを編集</button>
    </div>`;
}

function normalizeIftyVocabSearchText(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

function iftyWordMatchesSearch(word, query) {
  const q = normalizeIftyVocabSearchText(query);
  if (!q) return true;
  if (!word || typeof word !== 'object') return false;

  const spell = normalizeIftyVocabSearchText(word.word || '');
  if (spell.includes(q)) return true;

  const meanings = [];
  if (Array.isArray(word.meanings)) meanings.push(...word.meanings);
  else if (word.meanings) meanings.push(word.meanings);
  if (word.meaning) meanings.push(word.meaning);
  if (word.quizAnswers && Array.isArray(word.quizAnswers.jp)) meanings.push(...word.quizAnswers.jp);

  return meanings.some(value => normalizeIftyVocabSearchText(value).includes(q));
}

function getIftyVisibleWordEntries(folder) {
  const words = folder && Array.isArray(folder.words) ? folder.words : [];
  const globalQuery = normalizeIftyVocabSearchText(iftyGlobalVocabSearchQuery);
  const folderQuery = normalizeIftyVocabSearchText(iftyFolderSearchQueries[folder && folder.id] || '');

  return words
    .map((word, index) => ({ word, index }))
    .filter(entry => {
      if (globalQuery && !iftyWordMatchesSearch(entry.word, globalQuery)) return false;
      if (folderQuery && !iftyWordMatchesSearch(entry.word, folderQuery)) return false;
      return true;
    });
}

function countIftyGlobalVocabMatches() {
  const query = normalizeIftyVocabSearchText(iftyGlobalVocabSearchQuery);
  if (!query) return folders.reduce((sum, folder) => sum + (Array.isArray(folder.words) ? folder.words.length : 0), 0);
  return folders.reduce((sum, folder) => {
    const words = Array.isArray(folder.words) ? folder.words : [];
    return sum + words.filter(word => iftyWordMatchesSearch(word, query)).length;
  }, 0);
}

function refreshIftyVocabSearchPanel() {
  const panel = document.getElementById('iftyVocabSearchPanel');
  if (!panel) return;

  const inputValue = String(iftyGlobalVocabSearchQuery || '');
  const total = folders.reduce((sum, folder) => sum + (Array.isArray(folder.words) ? folder.words.length : 0), 0);
  const matchCount = countIftyGlobalVocabMatches();
  panel.innerHTML = `
    <div style="font-weight:900;color:#0f172a;margin-bottom:7px;">全フォルダ検索</div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
      <input id="iftyGlobalVocabSearchInput" value="${escapeHtml(inputValue)}" oninput="setIftyGlobalVocabSearch(this.value)" placeholder="スペル・意味で全フォルダを検索" style="flex:1;min-width:180px;padding:9px;border:1px solid #cbd5e1;border-radius:7px;font-size:.92em;">
      <button type="button" onclick="clearIftyGlobalVocabSearch()" style="border:none;background:#e2e8f0;color:#334155;padding:9px 11px;border-radius:7px;font-weight:800;cursor:pointer;">クリア</button>
      <span style="font-size:.8em;color:#64748b;white-space:nowrap;">${normalizeIftyVocabSearchText(inputValue) ? `${matchCount}件一致` : `${total}語`}</span>
    </div>`;
}

window.setIftyGlobalVocabSearch = function(value) {
  iftyGlobalVocabSearchQuery = String(value || '');
  renderFolders();
  const panel = document.getElementById('iftyVocabSearchPanel');
  if (panel) {
    const total = folders.reduce((sum, folder) => sum + (Array.isArray(folder.words) ? folder.words.length : 0), 0);
    const count = countIftyGlobalVocabMatches();
    const status = panel.querySelector('span');
    if (status) status.textContent = normalizeIftyVocabSearchText(iftyGlobalVocabSearchQuery) ? `${count}件一致` : `${total}語`;
  }
};

window.clearIftyGlobalVocabSearch = function() {
  iftyGlobalVocabSearchQuery = '';
  const input = document.getElementById('iftyGlobalVocabSearchInput');
  if (input) input.value = '';
  renderFolders();
  refreshIftyVocabSearchPanel();
};

window.setIftyFolderSearchQuery = function(folderId, value) {
  iftyFolderSearchQueries[folderId] = String(value || '');
  refreshFolderWordArea(folderId);
};

window.clearIftyFolderSearchQuery = function(folderId) {
  iftyFolderSearchQueries[folderId] = '';
  const input = document.getElementById(`folderSearch_${folderId}`);
  if (input) input.value = '';
  refreshFolderWordArea(folderId);
};

window.openIftySubjectAllia = function(subject) {
  currentIftySubject = normalizeIftySubject(subject);
  window.switchToChatView();
};

// ==========================================
// Q3 STEP15：HOME / SUBJECTS / SETTINGS 実画面
// ==========================================
function ensureIftyPortalStyles() {
  if (document.getElementById('iftyPortalStyles')) return;
  const style = document.createElement('style');
  style.id = 'iftyPortalStyles';
  style.textContent = `
    #iftyHubPage {
      display: none;
      width: 100%;
      box-sizing: border-box;
      margin-top: 2px;
    }
    .ifty-portal-shell {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 18px;
      color: #0f172a;
      box-sizing: border-box;
    }
    .ifty-portal-title {
      margin: 0;
      font-size: 1.55rem;
      font-weight: 900;
      letter-spacing: .015em;
    }
    .ifty-portal-subtitle {
      margin-top: 6px;
      color: #64748b;
      font-size: .9rem;
      line-height: 1.55;
    }
    .ifty-home-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 18px;
    }
    .ifty-home-card {
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      color: #0f172a;
      border-radius: 13px;
      padding: 16px;
      min-height: 132px;
      display: flex;
      flex-direction: column;
      gap: 7px;
      text-align: left;
      box-sizing: border-box;
    }
    button.ifty-home-card {
      cursor: pointer;
      font: inherit;
    }
    button.ifty-home-card:hover,
    button.ifty-home-card:focus-visible {
      border-color: #38bdf8;
      box-shadow: 0 0 0 3px rgba(56,189,248,.12);
      outline: none;
    }
    .ifty-home-card-title {
      font-size: 1.08rem;
      font-weight: 900;
    }
    .ifty-home-card-meta {
      color: #64748b;
      font-size: .82rem;
      line-height: 1.5;
    }
    .ifty-home-card-spacer {
      flex: 1;
    }
    .ifty-home-card-action {
      color: #0284c7;
      font-size: .82rem;
      font-weight: 900;
    }
    .ifty-home-card-soon {
      color: #94a3b8;
      font-size: .78rem;
      font-weight: 800;
    }
    .ifty-home-quick {
      margin-top: 16px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .ifty-home-quick button,
    .ifty-settings-action {
      border: none;
      border-radius: 9px;
      padding: 10px 13px;
      cursor: pointer;
      font-weight: 800;
    }
    .ifty-portal-back {
      border: none;
      background: #e2e8f0;
      color: #334155;
      border-radius: 8px;
      padding: 8px 11px;
      cursor: pointer;
      font-weight: 800;
    }
    .ifty-settings-section {
      margin-top: 14px;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 14px;
      background: #f8fafc;
    }
    .ifty-settings-section h3 {
      margin: 0 0 8px;
      font-size: 1rem;
    }
    .ifty-settings-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .ifty-settings-note {
      color: #64748b;
      font-size: .82rem;
      line-height: 1.55;
    }
    .ifty-subject-badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 5px 9px;
      font-size: .74rem;
      font-weight: 900;
      background: #e2e8f0;
      color: #475569;
      margin-top: 12px;
    }
    body[data-ifty-theme="dark"] .ifty-portal-shell {
      background: #111827;
      border-color: #334155;
      color: #e5e7eb;
    }
    body[data-ifty-theme="dark"] .ifty-portal-subtitle,
    body[data-ifty-theme="dark"] .ifty-home-card-meta,
    body[data-ifty-theme="dark"] .ifty-settings-note {
      color: #94a3b8;
    }
    body[data-ifty-theme="dark"] .ifty-home-card,
    body[data-ifty-theme="dark"] .ifty-settings-section {
      background: #0f172a;
      border-color: #334155;
      color: #e5e7eb;
    }
    body[data-ifty-theme="dark"] .ifty-portal-back {
      background: #334155;
      color: #e2e8f0;
    }
    body[data-ifty-theme="dark"] .ifty-subject-badge {
      background: #334155;
      color: #cbd5e1;
    }
    @media (max-width: 620px) {
      .ifty-home-grid { grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(style);
}

function ensureIftyHubPage() {
  ensureIftyPortalStyles();
  let page = document.getElementById('iftyHubPage');
  if (page) return page;

  const mainPortal = document.getElementById('mainPortal');
  if (!mainPortal) return null;

  page = document.createElement('div');
  page.id = 'iftyHubPage';

  const vocabPage = document.getElementById('vocabPage');
  if (vocabPage && vocabPage.parentNode === mainPortal) {
    mainPortal.insertBefore(page, vocabPage);
  } else {
    mainPortal.appendChild(page);
  }
  return page;
}

function hideIftyHubPage() {
  const page = document.getElementById('iftyHubPage');
  if (page) page.style.display = 'none';
}

function getIftyHomeStats() {
  let wordCount = 0;
  folders.forEach(folder => {
    wordCount += Array.isArray(folder && folder.words) ? folder.words.length : 0;
  });

  const flashSets = practiceData && practiceData.modules && practiceData.modules.flashcards &&
    Array.isArray(practiceData.modules.flashcards.sets)
      ? practiceData.modules.flashcards.sets.length
      : 0;

  const quizSets = practiceData && practiceData.modules && practiceData.modules.questions &&
    Array.isArray(practiceData.modules.questions.sets)
      ? practiceData.modules.questions.sets.length
      : 0;

  const socialFolders = practiceData && practiceData.modules && practiceData.modules.socialStudies && Array.isArray(practiceData.modules.socialStudies.folders)
    ? practiceData.modules.socialStudies.folders
    : [];
  const socialItems = socialFolders.reduce((sum, folder) => sum + (Array.isArray(folder.items) ? folder.items.length : 0), 0);

  const scienceFolders = practiceData && practiceData.modules && practiceData.modules.science && Array.isArray(practiceData.modules.science.folders)
    ? practiceData.modules.science.folders
    : [];
  const scienceItems = scienceFolders.reduce((sum, folder) => sum + (Array.isArray(folder.items) ? folder.items.length : 0), 0);

  const learning = getIftyLearningStats();
  return {
    folders: Array.isArray(folders) ? folders.length : 0,
    words: wordCount,
    flashSets,
    quizSets,
    chats: Array.isArray(chatSessions) ? chatSessions.length : 0,
    examples: countIftyExampleAssets(),
    basicSentences: countIftyBasicSentences(),
    years: countIftyYearEntries(),
    socialFolders: socialFolders.length,
    socialItems,
    scienceFolders: scienceFolders.length,
    scienceItems,
    ...learning
  };
}

function showIftyHubContent(html, pageName) {
  if (typeof window.closePracticeModal === 'function') window.closePracticeModal();
  if (typeof window.closeMainLauncher === 'function') window.closeMainLauncher();
  if (typeof window.closeMenuModal === 'function') window.closeMenuModal();

  const vocabPage = document.getElementById('vocabPage');
  const aiChatPage = document.getElementById('aiChatPage');
  const btn = document.getElementById('floatingAiBtn');
  const page = ensureIftyHubPage();
  if (!page) return;

  currentView = 'vocab';
  iftyPortalPage = pageName || 'home';

  if (vocabPage) vocabPage.style.display = 'none';
  if (aiChatPage) aiChatPage.style.display = 'none';
  if (btn) btn.textContent = '💬';

  page.innerHTML = html;
  page.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'auto' });
}

window.openIftyHome = function() {
  currentIftySubject = 'ENGLISH';
  const stats = getIftyHomeStats();
  showIftyHubContent(`
    <section class="ifty-portal-shell">
      <h1 class="ifty-portal-title">HOME</h1>
      <div class="ifty-portal-subtitle">IFTYの学習メニュー。科目を選ぶか、ALLIA・実践へ進めます。</div>

      <div class="ifty-home-grid">
        <button class="ifty-home-card" type="button" onclick="openIftySubject('ENGLISH')">
          <div class="ifty-home-card-title">VOCABULARY</div>
          <div class="ifty-home-card-meta">フォルダ ${stats.folders} / 単語 ${stats.words}</div>
          <div class="ifty-home-card-spacer"></div>
          <div class="ifty-home-card-action">単語帳を開く →</div>
        </button>

        <button class="ifty-home-card" type="button" onclick="openIftySubject('ANCIENT')">
          <div class="ifty-home-card-title">ANCIENT</div>
          <div class="ifty-home-card-meta">古文・漢文などの学習領域</div>
          <div class="ifty-home-card-spacer"></div>
          <div class="ifty-home-card-soon">科目ページ準備済み / 学習機能は今後追加</div>
        </button>

        <button class="ifty-home-card" type="button" onclick="openIftySubject('SCIENCE')">
          <div class="ifty-home-card-title">SCIENCE</div>
          <div class="ifty-home-card-meta">フォルダ ${stats.scienceFolders} / 項目 ${stats.scienceItems}</div>
          <div class="ifty-home-card-spacer"></div>
          <div class="ifty-home-card-action">物理・化学・生物・地学 →</div>
        </button>

        <button class="ifty-home-card" type="button" onclick="openIftySubject('SOCIAL STUDIES')">
          <div class="ifty-home-card-title">SOCIAL STUDIES</div>
          <div class="ifty-home-card-meta">フォルダ ${stats.socialFolders} / 項目 ${stats.socialItems}</div>
          <div class="ifty-home-card-spacer"></div>
          <div class="ifty-home-card-action">日本史・世界史・地理・公共 →</div>
        </button>
      </div>

      <div style="margin-top:18px;padding:15px;border:1px solid #cbd5e1;border-radius:12px;background:rgba(248,250,252,.82);">
        <div style="font-weight:900;color:#0f172a;margin-bottom:10px;">📊 TODAY / REVIEW</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:8px;">
          <div style="padding:10px;border-radius:9px;background:white;border:1px solid #e2e8f0;"><div style="font-size:.72em;color:#64748b;">今日学習した単語</div><div style="font-size:1.35em;font-weight:900;color:#0f172a;">${stats.studiedToday}語</div></div>
          <div style="padding:10px;border-radius:9px;background:white;border:1px solid #e2e8f0;"><div style="font-size:.72em;color:#64748b;">今日の回答</div><div style="font-size:1.35em;font-weight:900;color:#0f172a;">${stats.answersToday}回</div></div>
          <div style="padding:10px;border-radius:9px;background:white;border:1px solid #e2e8f0;"><div style="font-size:.72em;color:#64748b;">今日の正答率</div><div style="font-size:1.35em;font-weight:900;color:#0f172a;">${stats.answersToday ? stats.accuracyToday + '%' : '—'}</div></div>
          <div style="padding:10px;border-radius:9px;background:#fff7ed;border:1px solid #fed7aa;"><div style="font-size:.72em;color:#9a3412;">今日の復習</div><div style="font-size:1.35em;font-weight:900;color:#c2410c;">${stats.dueReview}語</div></div>
          <div style="padding:10px;border-radius:9px;background:#fff1f2;border:1px solid #fecdd3;"><div style="font-size:.72em;color:#9f1239;">苦手候補</div><div style="font-size:1.35em;font-weight:900;color:#be123c;">${stats.weakWords}語</div></div>
        </div>
        <div style="margin-top:11px;padding:10px;border:1px solid #dbeafe;border-radius:9px;background:white;">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:.8em;">
            <b>今日の目標 ${stats.studiedToday}/${stats.dailyGoal}語</b>
            <span>${stats.goalPercent >= 100 ? '達成 ✓' : `${stats.goalPercent}%`}</span>
          </div>
          <div style="height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-top:7px;">
            <div style="height:100%;width:${Math.min(100, stats.goalPercent)}%;background:#0f766e;border-radius:999px;"></div>
          </div>
          <div style="margin-top:6px;color:#64748b;font-size:.74em;">🔥 連続学習 ${stats.studyStreak}日　・　自己ベスト ${stats.bestStreak}日</div>
        </div>
        ${stats.dueReview ? `<button type="button" onclick="switchToVocabView(); setTimeout(()=>startIftyDueReviewFlashcards('front'),0);" style="width:100%;margin-top:10px;border:none;background:#ea580c;color:white;border-radius:8px;padding:10px;font-weight:900;cursor:pointer;">🔁 今日の復習を始める（${stats.dueReview}語）</button>` : ''}
      </div>

      <div class="ifty-home-quick">
        <button type="button" onclick="switchToChatView()" style="background:#0284c7;color:white;">🤖 ALLIA</button>
        <button type="button" onclick="openIftyExampleBank()" style="background:#2563eb;color:white;">📚 例文資産 ${stats.examples}</button>
        <button type="button" onclick="openIftyBasicSentences()" style="background:#059669;color:white;">📝 BASIC SENTENCES ${stats.basicSentences}</button>
        <button type="button" onclick="openIftyYears()" style="background:#b45309;color:white;">📅 YEARS ${stats.years}</button>
        <button type="button" onclick="openPracticeHome()" style="background:#7c3aed;color:white;">⚔️ 実践</button>
        <button type="button" onclick="openIftyLearningStats()" style="background:#0f766e;color:white;">📊 学習統計</button>
        <button type="button" onclick="openIftyRecoveryCenter()" style="background:#334155;color:white;">🛟 バックアップ / 復元</button>
      </div>

      <div class="ifty-settings-note" style="margin-top:14px;">
        実践：Flash ${stats.flashSets} / Quiz ${stats.quizSets}　・　例文資産 ${stats.examples}件　・　BASIC SENTENCES ${stats.basicSentences}件　・　YEARS ${stats.years}件　・　ALLIAチャット ${stats.chats}　・　復習管理 ${stats.reviewActive}語 / 卒業 ${stats.reviewGraduated}語
      </div>
    </section>
  `, 'home');
};

window.openIftySideMenuHome = function() {
  window.closeIftySideMenu();
  window.openIftyHome();
};

// ==========================================
// Q3 STEP38 / STEP41：YEARS / 年号学習
// SOCIAL STUDIESとは別ページ。年号をフォルダで整理し、フォルダ・年号の並べ替えにも対応する。
// practiceData.modules.years に保存するため、既存クラウド同期・バックアップ対象に自動で含まれる。
// ==========================================
function normalizeIftyCollectionFolder(folder, prefix = 'collection_folder', defaultName = '未分類', index = 0) {
  const source = folder && typeof folder === 'object' ? folder : {};
  return {
    id: String(source.id || makeId(prefix)),
    name: String(source.name || defaultName).trim() || defaultName,
    collapsed: !!source.collapsed,
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : index,
    createdAt: Math.max(0, Number(source.createdAt) || Date.now())
  };
}

function normalizeIftyYearEra(value) {
  return String(value || '').trim().toUpperCase() === 'BCE' ? 'BCE' : 'CE';
}

function formatIftyYearLabel(era, year) {
  const value = Math.max(1, Math.abs(Number(year) || 0));
  return normalizeIftyYearEra(era) === 'BCE' ? `紀元前${value}年` : `${value}年`;
}

function normalizeIftyYearSubject(value) {
  const key = String(value || '').trim().toUpperCase();
  return ['JAPANESE_HISTORY', 'WORLD_HISTORY'].includes(key) ? key : 'WORLD_HISTORY';
}

function getIftyYearSubjectLabel(value) {
  return normalizeIftyYearSubject(value) === 'JAPANESE_HISTORY' ? '日本史' : '世界史';
}

function normalizeIftyYearEvent(value, includeYear = false) {
  const source = value && typeof value === 'object' ? value : {};
  const yearNumber = Math.max(1, Math.abs(Number(source.year) || 0));
  return {
    id: String(source.id || makeId('yearevent')),
    subject: normalizeIftyYearSubject(source.subject),
    title: String(source.title || '').trim(),
    memoryText: String(source.memoryText || '').trim(),
    era: includeYear ? normalizeIftyYearEra(source.era) : '',
    year: includeYear ? yearNumber : 0,
    yearLabel: includeYear
      ? (String(source.yearLabel || '').trim() || formatIftyYearLabel(source.era, yearNumber))
      : ''
  };
}

function normalizeIftyYearEntry(value) {
  const source = value && typeof value === 'object' ? value : {};
  const era = normalizeIftyYearEra(source.era);
  const year = Math.max(1, Math.abs(Number(source.year) || 0));
  return {
    ...source,
    id: String(source.id || makeId('yearentry')),
    folderId: String(source.folderId || ''),
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : null,
    era,
    year,
    yearLabel: String(source.yearLabel || '').trim() || formatIftyYearLabel(era, year),
    periodLabel: String(source.periodLabel || '').trim(),
    exactEvents: Array.isArray(source.exactEvents)
      ? source.exactEvents.map(item => normalizeIftyYearEvent(item, false)).filter(item => item.title)
      : [],
    nearbyEvents: Array.isArray(source.nearbyEvents)
      ? source.nearbyEvents.map(item => normalizeIftyYearEvent(item, true)).filter(item => item.title && item.year)
      : [],
    note: String(source.note || '').trim(),
    mnemonic: String(source.mnemonic || '').trim(),
    source: String(source.source || 'ALLIA').trim() || 'ALLIA',
    createdAt: Number(source.createdAt) || Date.now(),
    updatedAt: Number(source.updatedAt) || Number(source.createdAt) || Date.now()
  };
}

function getIftyYearModule() {
  normalizePracticeData();
  return practiceData.modules.years;
}

function getIftyYearFolders() {
  const module = practiceData && practiceData.modules && practiceData.modules.years;
  return module && Array.isArray(module.folders) ? module.folders : [];
}

function getIftySortedYearFolders() {
  return getIftyYearFolders().slice().sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function getIftyYearFolderById(folderId) {
  return getIftyYearFolders().find(folder => String(folder.id) === String(folderId)) || null;
}

function getIftyYearDefaultFolderId() {
  const folders = getIftySortedYearFolders();
  return folders[0] ? String(folders[0].id) : '';
}

function getIftyYearEntries() {
  const module = practiceData && practiceData.modules && practiceData.modules.years;
  return module && Array.isArray(module.entries) ? module.entries : [];
}

function getIftyYearEntriesForFolder(folderId) {
  return getIftyYearEntries()
    .filter(entry => String(entry.folderId || '') === String(folderId || ''))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function getIftyNextYearOrder(folderId) {
  const rows = getIftyYearEntriesForFolder(folderId);
  return rows.length ? Math.max(...rows.map(row => Number(row.order || 0))) + 1 : 0;
}

function countIftyYearEntries() {
  return getIftyYearEntries().length;
}

function parseIftyYearInput(rawValue, selectedEra = 'CE') {
  let raw = String(rawValue ?? '').normalize('NFKC').trim();
  if (!raw) return null;

  let era = normalizeIftyYearEra(selectedEra);
  if (/紀元前|\bB\.?C\.?E?\.?\b/i.test(raw)) era = 'BCE';
  if (/西暦|\bA\.?D\.?\b|\bC\.?E\.?\b/i.test(raw)) era = 'CE';
  if (/^\s*-/.test(raw)) era = 'BCE';

  raw = raw
    .replace(/紀元前|西暦/gi, '')
    .replace(/\bB\.?C\.?E?\.?\b/gi, '')
    .replace(/\bA\.?D\.?\b|\bC\.?E\.?\b/gi, '')
    .replace(/年/g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '');

  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) return null;
  const year = Math.abs(numeric);
  if (year < 1 || year > 9999) return null;
  return { era, year };
}

function ensureIftyYearsStyles() {
  if (document.getElementById('iftyYearsStyles')) return;
  const style = document.createElement('style');
  style.id = 'iftyYearsStyles';
  style.textContent = `
    .ifty-years-form { margin-top:18px; border:1px solid #e2e8f0; border-radius:12px; background:#f8fafc; padding:14px; }
    .ifty-years-form-row { display:grid; grid-template-columns:110px minmax(0,1fr) minmax(150px,220px) auto; gap:8px; align-items:center; }
    .ifty-years-form select, .ifty-years-form input { width:100%; box-sizing:border-box; min-height:44px; border:1px solid #cbd5e1; border-radius:9px; padding:9px 11px; font:inherit; background:white; color:#0f172a; }
    .ifty-years-primary { min-height:44px; border:none; border-radius:9px; padding:9px 14px; background:#b45309; color:white; font-weight:900; cursor:pointer; }
    .ifty-years-status { min-height:1.4em; margin-top:8px; color:#64748b; font-size:.82rem; }
    .ifty-year-folder-list { margin-top:16px; display:grid; gap:12px; }
    .ifty-year-folder { border:1px solid #fed7aa; border-radius:14px; background:#fffaf5; padding:12px; }
    .ifty-year-folder-head { display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap; }
    .ifty-year-folder-title { font-weight:900; color:#7c2d12; font-size:1.02rem; }
    .ifty-year-folder-actions { display:flex; gap:5px; flex-wrap:wrap; }
    .ifty-year-folder-actions button { border:none; border-radius:7px; padding:6px 9px; font-weight:800; cursor:pointer; }
    .ifty-year-list { margin-top:10px; display:grid; gap:10px; }
    .ifty-year-card { border:1px solid #e2e8f0; border-radius:13px; padding:14px; background:white; }
    .ifty-year-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap; }
    .ifty-year-title { font-size:1.35rem; font-weight:900; color:#92400e; }
    .ifty-year-period { color:#64748b; font-size:.8rem; margin-top:3px; }
    .ifty-year-actions { display:flex; gap:6px; flex-wrap:wrap; }
    .ifty-year-actions button { border:none; border-radius:8px; padding:7px 10px; font-weight:800; cursor:pointer; }
    .ifty-year-collapse { background:#e2e8f0; color:#334155; }
    .ifty-year-body[hidden] { display:none !important; }
    .ifty-year-section-title { margin:13px 0 7px; font-size:.83rem; font-weight:900; color:#475569; }
    .ifty-year-events { display:grid; gap:7px; }
    .ifty-year-event { border:1px solid #e2e8f0; border-radius:10px; padding:10px; background:#f8fafc; }
    .ifty-year-event-top { display:flex; gap:7px; align-items:center; flex-wrap:wrap; }
    .ifty-year-badge { display:inline-flex; align-items:center; border-radius:999px; padding:3px 7px; font-size:.68rem; font-weight:900; background:#e0f2fe; color:#075985; }
    .ifty-year-event-title { font-weight:900; color:#0f172a; }
    .ifty-year-event-text { margin-top:5px; color:#475569; font-size:.84rem; line-height:1.55; }
    .ifty-year-nearby-year { font-weight:900; color:#b45309; }
    .ifty-year-note { margin-top:11px; padding:9px 10px; border-radius:9px; background:#fffbeb; color:#92400e; font-size:.82rem; line-height:1.55; }
    .ifty-year-mnemonic { margin-top:11px; padding:10px; border:1px solid #fde68a; border-radius:10px; background:#fffdf2; }
    .ifty-year-mnemonic-head { display:flex; justify-content:space-between; gap:8px; align-items:center; font-size:.8rem; font-weight:900; color:#92400e; }
    .ifty-year-mnemonic-text { margin-top:5px; color:#78350f; line-height:1.55; }
    .ifty-year-mnemonic-edit { border:none; border-radius:7px; padding:5px 8px; background:#f59e0b; color:#111827; font-weight:900; cursor:pointer; }
    @media (max-width:760px) { .ifty-years-form-row { grid-template-columns:1fr; } }
  `;
  document.head.appendChild(style);
}

function renderIftyYearEventCard(event, nearby = false) {
  const subjectLabel = getIftyYearSubjectLabel(event.subject);
  const yearPrefix = nearby ? `<span class="ifty-year-nearby-year">${escapeHtml(event.yearLabel || formatIftyYearLabel(event.era, event.year))}</span>` : '';
  return `<div class="ifty-year-event">
    <div class="ifty-year-event-top">
      ${yearPrefix}
      <span class="ifty-year-badge">${escapeHtml(subjectLabel)}</span>
      <span class="ifty-year-event-title">${escapeHtml(event.title)}</span>
    </div>
    ${event.memoryText ? `<div class="ifty-year-event-text">${escapeHtml(event.memoryText)}</div>` : ''}
  </div>`;
}

function renderIftyYearEntryCard(entry, index, total) {
  const exact = Array.isArray(entry.exactEvents) ? entry.exactEvents : [];
  const nearby = Array.isArray(entry.nearbyEvents) ? entry.nearbyEvents : [];
  const collapsed = iftyCollapsedYearEntryIds.has(String(entry.id));
  return `
    <article class="ifty-year-card" id="iftyYearEntry_${escapeHtml(entry.id)}">
      <div class="ifty-year-head">
        <div>
          <div class="ifty-year-title">${escapeHtml(entry.yearLabel)}</div>
          ${entry.periodLabel ? `<div class="ifty-year-period">${escapeHtml(entry.periodLabel)}</div>` : ''}
        </div>
        <div class="ifty-year-actions">
          <button type="button" ${index <= 0 ? 'disabled' : ''} onclick="moveIftyYearEntry('${escapeHtml(entry.id)}',-1)" title="上へ">↑</button>
          <button type="button" ${index >= total - 1 ? 'disabled' : ''} onclick="moveIftyYearEntry('${escapeHtml(entry.id)}',1)" title="下へ">↓</button>
          <button id="iftyYearCollapseBtn_${escapeHtml(entry.id)}" class="ifty-year-collapse" type="button" aria-expanded="${collapsed ? 'false' : 'true'}" onclick="toggleIftyYearEntryCollapse('${escapeHtml(entry.id)}')">${collapsed ? '▼ 展開' : '▲ 折りたたむ'}</button>
          <button type="button" onclick="regenerateIftyYearEntry('${escapeHtml(entry.id)}')" style="background:#f59e0b;color:#111827;">再生成</button>
          <button type="button" onclick="deleteIftyYearEntry('${escapeHtml(entry.id)}')" style="background:#ef4444;color:white;">削除</button>
        </div>
      </div>
      <div id="iftyYearBody_${escapeHtml(entry.id)}" class="ifty-year-body" ${collapsed ? 'hidden' : ''}>
        <div class="ifty-year-section-title">この年の重要事項</div>
        <div class="ifty-year-events">
          ${exact.length ? exact.map(event => renderIftyYearEventCard(event, false)).join('') : '<div class="ifty-year-event-text">高校範囲で特に重要な同年事項は見つかりませんでした。</div>'}
        </div>
        ${nearby.length ? `<div class="ifty-year-section-title">前後の重要事項</div><div class="ifty-year-events">${nearby.map(event => renderIftyYearEventCard(event, true)).join('')}</div>` : ''}
        <div class="ifty-year-mnemonic">
          <div class="ifty-year-mnemonic-head"><span>語呂合わせ</span><button class="ifty-year-mnemonic-edit" type="button" onclick="editIftyYearMnemonic('${escapeHtml(entry.id)}')">編集</button></div>
          <div class="ifty-year-mnemonic-text">${entry.mnemonic ? escapeHtml(entry.mnemonic) : 'まだ語呂合わせはありません。編集から自分で追加できます。'}</div>
        </div>
        ${entry.note ? `<div class="ifty-year-note">${escapeHtml(entry.note)}</div>` : ''}
      </div>
    </article>`;
}

window.toggleIftyYearEntryCollapse = function(entryId) {
  const id = String(entryId || '');
  const body = document.getElementById(`iftyYearBody_${id}`);
  const button = document.getElementById(`iftyYearCollapseBtn_${id}`);
  if (!body || !button) return;
  const willCollapse = !body.hidden;
  body.hidden = willCollapse;
  if (willCollapse) {
    iftyCollapsedYearEntryIds.add(id);
    button.textContent = '▼ 展開';
    button.setAttribute('aria-expanded', 'false');
  } else {
    iftyCollapsedYearEntryIds.delete(id);
    button.textContent = '▲ 折りたたむ';
    button.setAttribute('aria-expanded', 'true');
  }
};

function refreshIftyYearFolderSelect() {
  const select = document.getElementById('iftyYearFolderSelect');
  if (!select) return;
  const folders = getIftySortedYearFolders();
  if (!getIftyYearFolderById(iftyYearActiveFolderId)) iftyYearActiveFolderId = getIftyYearDefaultFolderId();
  select.innerHTML = folders.map(folder => `<option value="${escapeHtml(folder.id)}" ${String(folder.id) === String(iftyYearActiveFolderId) ? 'selected' : ''}>${escapeHtml(folder.name)}</option>`).join('');
}

function renderIftyYearEntries() {
  const root = document.getElementById('iftyYearList');
  if (!root) return;
  const folders = getIftySortedYearFolders();
  root.innerHTML = folders.map((folder, folderIndex) => {
    const entries = getIftyYearEntriesForFolder(folder.id);
    return `<section class="ifty-year-folder">
      <div class="ifty-year-folder-head">
        <button type="button" onclick="toggleIftyYearFolder('${escapeHtml(folder.id)}')" style="border:none;background:transparent;padding:0;cursor:pointer;text-align:left;">
          <span class="ifty-year-folder-title">${folder.collapsed ? '▶' : '▼'} 📁 ${escapeHtml(folder.name)} (${entries.length}件)</span>
        </button>
        <div class="ifty-year-folder-actions">
          <button type="button" ${folderIndex <= 0 ? 'disabled' : ''} onclick="moveIftyYearFolder('${escapeHtml(folder.id)}',-1)" style="background:#e2e8f0;color:#334155;">↑</button>
          <button type="button" ${folderIndex >= folders.length - 1 ? 'disabled' : ''} onclick="moveIftyYearFolder('${escapeHtml(folder.id)}',1)" style="background:#e2e8f0;color:#334155;">↓</button>
          <button type="button" onclick="renameIftyYearFolder('${escapeHtml(folder.id)}')" style="background:#f59e0b;color:#111827;">名前変更</button>
          <button type="button" onclick="deleteIftyYearFolder('${escapeHtml(folder.id)}')" style="background:#ef4444;color:white;">削除</button>
        </div>
      </div>
      ${folder.collapsed ? '' : `<div class="ifty-year-list">${entries.length ? entries.map((entry, index) => renderIftyYearEntryCard(entry, index, entries.length)).join('') : '<div class="ifty-settings-note">このフォルダにはまだ年号がありません。</div>'}</div>`}
    </section>`;
  }).join('');
  refreshIftyYearFolderSelect();
}

window.createIftyYearFolder = function() {
  const name = prompt('YEARSの新しいフォルダ名', '新しいフォルダ');
  if (name === null) return;
  const trimmed = String(name).trim();
  if (!trimmed) return;
  recordUndoState('YEARSフォルダ作成');
  const folders = getIftyYearFolders();
  const folder = normalizeIftyCollectionFolder({ id: makeId('yearfolder'), name: trimmed, order: folders.length, collapsed: false }, 'yearfolder', '未分類', folders.length);
  folders.push(folder);
  iftyYearActiveFolderId = folder.id;
  savePracticeData();
  renderIftyYearEntries();
};

window.renameIftyYearFolder = function(folderId) {
  const folder = getIftyYearFolderById(folderId);
  if (!folder) return;
  const next = prompt('フォルダ名を変更', folder.name);
  if (next === null || !String(next).trim()) return;
  recordUndoState('YEARSフォルダ名変更');
  folder.name = String(next).trim();
  savePracticeData();
  renderIftyYearEntries();
};

window.toggleIftyYearFolder = function(folderId) {
  const folder = getIftyYearFolderById(folderId);
  if (!folder) return;
  folder.collapsed = !folder.collapsed;
  savePracticeData();
  renderIftyYearEntries();
};

window.moveIftyYearFolder = function(folderId, direction) {
  const folders = getIftySortedYearFolders();
  const index = folders.findIndex(folder => String(folder.id) === String(folderId));
  const nextIndex = index + Number(direction || 0);
  if (index < 0 || nextIndex < 0 || nextIndex >= folders.length) return;
  recordUndoState('YEARSフォルダ並べ替え');
  [folders[index], folders[nextIndex]] = [folders[nextIndex], folders[index]];
  folders.forEach((folder, idx) => { folder.order = idx; });
  savePracticeData();
  renderIftyYearEntries();
};

window.deleteIftyYearFolder = function(folderId) {
  const folders = getIftySortedYearFolders();
  const folder = folders.find(row => String(row.id) === String(folderId));
  if (!folder) return;
  if (folders.length <= 1) {
    alert('YEARSには最低1つのフォルダが必要です。');
    return;
  }
  const entries = getIftyYearEntriesForFolder(folderId);
  const target = folders.find(row => String(row.id) !== String(folderId));
  const message = entries.length
    ? `「${folder.name}」を削除しますか？ 中の${entries.length}件は「${target.name}」へ移動します。`
    : `「${folder.name}」を削除しますか？`;
  if (!confirm(message)) return;
  recordUndoState('YEARSフォルダ削除');
  const baseOrder = getIftyNextYearOrder(target.id);
  entries.forEach((entry, index) => {
    entry.folderId = target.id;
    entry.order = baseOrder + index;
  });
  const raw = getIftyYearFolders();
  const rawIndex = raw.findIndex(row => String(row.id) === String(folderId));
  if (rawIndex >= 0) raw.splice(rawIndex, 1);
  iftyYearActiveFolderId = target.id;
  savePracticeData();
  renderIftyYearEntries();
};

window.moveIftyYearEntry = function(entryId, direction) {
  const entry = getIftyYearEntries().find(row => String(row.id) === String(entryId));
  if (!entry) return;
  const rows = getIftyYearEntriesForFolder(entry.folderId);
  const index = rows.findIndex(row => String(row.id) === String(entryId));
  const nextIndex = index + Number(direction || 0);
  if (index < 0 || nextIndex < 0 || nextIndex >= rows.length) return;
  recordUndoState('YEARS年号並べ替え');
  [rows[index], rows[nextIndex]] = [rows[nextIndex], rows[index]];
  rows.forEach((row, idx) => { row.order = idx; });
  savePracticeData();
  renderIftyYearEntries();
};

window.openIftyYears = function() {
  ensureIftyYearsStyles();
  normalizePracticeData();
  if (!getIftyYearFolderById(iftyYearActiveFolderId)) iftyYearActiveFolderId = getIftyYearDefaultFolderId();
  const count = countIftyYearEntries();
  showIftyHubContent(`
    <section class="ifty-portal-shell">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;">
        <div>
          <h1 class="ifty-portal-title">YEARS</h1>
          <div class="ifty-portal-subtitle">年号をフォルダで整理できます。フォルダと年号は↑↓で並べ替えられます。</div>
        </div>
        <button class="ifty-portal-back" type="button" onclick="openIftyHome()">HOMEへ戻る</button>
      </div>

      <form class="ifty-years-form" onsubmit="event.preventDefault(); lookupIftyYear();">
        <div class="ifty-years-form-row">
          <select id="iftyYearEra" aria-label="年代"><option value="CE">西暦</option><option value="BCE">紀元前</option></select>
          <input id="iftyYearInput" type="text" inputmode="numeric" autocomplete="off" placeholder="例：1600" aria-label="年号">
          <select id="iftyYearFolderSelect" aria-label="保存先フォルダ" onchange="iftyYearActiveFolderId=this.value;"></select>
          <button id="iftyYearLookupBtn" class="ifty-years-primary" type="submit">ALLIAで調べる</button>
        </div>
        <div id="iftyYearStatus" class="ifty-years-status">Enterで連続入力できます。保存先フォルダも選べます。</div>
      </form>

      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-top:14px;">
        <div style="font-weight:900;color:#475569;">保存済み ${count}件</div>
        <button class="ifty-settings-action" type="button" onclick="createIftyYearFolder()" style="background:#b45309;color:white;">＋ フォルダ</button>
      </div>
      <div id="iftyYearList" class="ifty-year-folder-list"></div>
    </section>
  `, 'years');
  renderIftyYearEntries();
  setTimeout(() => document.getElementById('iftyYearInput')?.focus({ preventScroll: true }), 0);
};

async function requestIftyYearLookup(era, year) {
  const response = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'year_lookup', era, year, subject: 'SOCIAL STUDIES', order: getIftySubjectOrder('SOCIAL STUDIES') })
  });
  const data = await response.json();
  if (!response.ok) throw alliaHttpError(response, data, '年号データの生成に失敗しました。');
  return data;
}

window.lookupIftyYear = async function(forcedEra = '', forcedYear = null, forcedFolderId = '') {
  if (!ensureIftyOnline('年号検索')) return;

  const input = document.getElementById('iftyYearInput');
  const eraSelect = document.getElementById('iftyYearEra');
  const folderSelect = document.getElementById('iftyYearFolderSelect');
  let parsed = null;
  if (forcedYear !== null && forcedYear !== undefined) {
    const y = Math.max(1, Math.abs(Number(forcedYear) || 0));
    if (y) parsed = { era: normalizeIftyYearEra(forcedEra), year: y };
  } else {
    parsed = parseIftyYearInput(input?.value || '', eraSelect?.value || 'CE');
  }

  if (!parsed) {
    const status = document.getElementById('iftyYearStatus');
    if (status) status.textContent = '1〜9999の整数を入力してください。0年は扱いません。';
    input?.focus({ preventScroll: true });
    return;
  }

  let folderId = String(forcedFolderId || folderSelect?.value || iftyYearActiveFolderId || getIftyYearDefaultFolderId());
  if (!getIftyYearFolderById(folderId)) folderId = getIftyYearDefaultFolderId();
  iftyYearActiveFolderId = folderId;

  const status = document.getElementById('iftyYearStatus');
  const requestLabel = formatIftyYearLabel(parsed.era, parsed.year);
  if (forcedYear === null || forcedYear === undefined) {
    if (input) input.value = '';
    input?.focus({ preventScroll: true });
  }

  iftyYearLookupPending += 1;
  if (status) status.textContent = `${requestLabel}をALLIAが整理中…（生成中 ${iftyYearLookupPending}件）`;

  try {
    const data = await requestIftyYearLookup(parsed.era, parsed.year);
    const entries = getIftyYearEntries();
    const existingIndex = entries.findIndex(entry => String(entry.folderId || '') === folderId && normalizeIftyYearEra(entry.era) === parsed.era && Number(entry.year) === parsed.year);
    const existing = existingIndex >= 0 ? entries[existingIndex] : null;
    recordUndoState(existing ? '年号データ更新' : '年号データ追加');
    const normalized = normalizeIftyYearEntry({
      ...data,
      id: existing?.id || makeId('yearentry'),
      folderId,
      order: existing?.order ?? getIftyNextYearOrder(folderId),
      era: parsed.era,
      year: parsed.year,
      yearLabel: data.yearLabel || requestLabel,
      mnemonic: existing?.mnemonic || data.mnemonic || '',
      source: 'ALLIA',
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now()
    });
    if (existingIndex >= 0) entries.splice(existingIndex, 1, normalized);
    else entries.push(normalized);
    savePracticeData();
    renderIftyYearEntries();
    if (status) {
      const remaining = Math.max(0, iftyYearLookupPending - 1);
      status.textContent = remaining ? `${normalized.yearLabel}を保存しました。ほか ${remaining}件を生成中…` : `${normalized.yearLabel}を保存しました。続けて別の数字を入力できます。`;
    }
    setTimeout(() => input?.focus({ preventScroll: true }), 0);
  } catch (error) {
    console.error('YEARS生成エラー:', error);
    if (status) status.textContent = `${requestLabel}: ${String(error.message || error)}`;
  } finally {
    iftyYearLookupPending = Math.max(0, iftyYearLookupPending - 1);
  }
};

window.regenerateIftyYearEntry = function(entryId) {
  const entry = getIftyYearEntries().find(item => String(item.id) === String(entryId));
  if (!entry) return;
  const eraSelect = document.getElementById('iftyYearEra');
  const input = document.getElementById('iftyYearInput');
  const folderSelect = document.getElementById('iftyYearFolderSelect');
  if (eraSelect) eraSelect.value = normalizeIftyYearEra(entry.era);
  if (input) input.value = String(entry.year || '');
  if (folderSelect) folderSelect.value = entry.folderId;
  iftyYearActiveFolderId = entry.folderId;
  window.lookupIftyYear(entry.era, entry.year, entry.folderId);
};

window.deleteIftyYearEntry = function(entryId) {
  const entries = getIftyYearEntries();
  const index = entries.findIndex(item => String(item.id) === String(entryId));
  if (index < 0) return;
  const entry = entries[index];
  if (!confirm(`${entry.yearLabel}の年号データを削除しますか？`)) return;
  recordUndoState('年号データ削除');
  entries.splice(index, 1);
  savePracticeData();
  renderIftyYearEntries();
};

window.editIftyYearMnemonic = function(entryId) {
  const entry = getIftyYearEntries().find(item => String(item.id) === String(entryId));
  if (!entry) return;
  const next = prompt(`${entry.yearLabel}の語呂合わせを編集`, entry.mnemonic || '');
  if (next === null) return;
  recordUndoState('年号語呂合わせ編集');
  entry.mnemonic = String(next).trim();
  entry.updatedAt = Date.now();
  savePracticeData();
  renderIftyYearEntries();
};

// ==========================================
// Q3 STEP29：SOCIAL STUDIES / フォルダ別科目設定 + 5W1H統合暗記文 + 画像資産 + 画像クイズ
// ==========================================
function normalizeIftySocialSubjects(value) {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source.map(item => String(item || '').trim().toUpperCase()))]
    .filter(key => IFTY_SOCIAL_SUBJECT_KEYS.includes(key));
}

function getIftySocialSubjectLabel(key) {
  const found = IFTY_SOCIAL_SUBJECTS.find(item => item.key === key);
  return found ? found.label : String(key || '');
}

function normalizeIftySocialImageData(value) {
  const image = String(value || '').trim();
  return /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(image) ? image : '';
}

function normalizeIftySocialImageKind(value) {
  const kind = String(value || '').trim().toUpperCase();
  return ['MAP', 'ARTWORK', 'PHOTO', 'DOCUMENT', 'CHART', 'OTHER'].includes(kind) ? kind : '';
}

function getIftySocialImageKindLabel(kind) {
  const labels = {
    MAP: '地図',
    ARTWORK: '作品・建築',
    PHOTO: '写真',
    DOCUMENT: '史料・文書',
    CHART: '図表・グラフ',
    OTHER: 'その他'
  };
  return labels[normalizeIftySocialImageKind(kind)] || '画像';
}

function buildIftySocialLegacyMemoryText(value) {
  if (!value || typeof value !== 'object') return '';
  const text = field => String(value[field] || '').trim();
  const direct = text('memoryText');
  if (direct) return direct;

  const sentences = [];
  const add = (prefix, raw) => {
    const body = String(raw || '').trim();
    if (!body || body === '該当なし') return;
    const clean = body.replace(/[。.!！?？]+$/u, '');
    if (clean) sentences.push(`${prefix}${clean}。`);
  };

  const summary = text('summary');
  if (summary) sentences.push(summary);
  add('関係する人物・主体は', text('who'));
  add('時期は', text('when'));
  add('主な場所・範囲は', text('where'));
  add('内容は', text('what'));
  add('背景・理由は', text('why'));
  add('経過・仕組みは', text('how'));
  return sentences.join(' ').trim();
}

function normalizeIftySocialItem(value) {
  if (!value || typeof value !== 'object') return null;
  const text = field => String(value[field] || '').trim();
  return {
    id: value.id || makeId('socialitem'),
    topic: text('topic'),
    title: text('title') || text('topic'),
    summary: text('summary'),
    memoryText: buildIftySocialLegacyMemoryText(value),
    who: text('who'),
    when: text('when'),
    where: text('where'),
    what: text('what'),
    why: text('why'),
    how: text('how'),
    keyPoints: Array.isArray(value.keyPoints) ? value.keyPoints.map(v => String(v || '').trim()).filter(Boolean).slice(0, 12) : [],
    subjects: normalizeIftySocialSubjects(value.subjects),
    imageData: normalizeIftySocialImageData(value.imageData),
    imageName: text('imageName'),
    imageKind: normalizeIftySocialImageKind(value.imageKind),
    imageFocus: text('imageFocus'),
    workTitle: text('workTitle'),
    source: String(value.source || 'MANUAL').trim(),
    createdAt: Number(value.createdAt || 0) || Date.now(),
    updatedAt: Number(value.updatedAt || 0) || Date.now()
  };
}

function getIftySocialModule() {
  normalizePracticeData();
  return practiceData.modules.socialStudies;
}

function getIftySocialFolder(folderId) {
  return getIftySocialModule().folders.find(folder => folder.id === folderId) || null;
}

function getIftySocialItemById(itemId) {
  for (const folder of getIftySocialModule().folders) {
    const item = (folder.items || []).find(entry => String(entry.id) === String(itemId));
    if (item) return { folder, item };
  }
  return null;
}

function countIftySocialItems() {
  return getIftySocialModule().folders.reduce((sum, folder) => sum + (Array.isArray(folder.items) ? folder.items.length : 0), 0);
}

function getIftySocialImageEntries(folderId = '') {
  const module = getIftySocialModule();
  const foldersToUse = folderId ? module.folders.filter(folder => folder.id === folderId) : module.folders;
  return foldersToUse.flatMap(folder => (folder.items || [])
    .filter(item => !!normalizeIftySocialImageData(item.imageData))
    .map(item => ({ folder, item })));
}

function renderIftySocialSubjectBadges(subjects) {
  const normalized = normalizeIftySocialSubjects(subjects);
  return normalized.map(key => `<span style="display:inline-block;padding:3px 7px;border-radius:999px;background:#e0f2fe;color:#075985;font-size:.72em;font-weight:900;">${escapeHtml(getIftySocialSubjectLabel(key))}</span>`).join(' ');
}

function renderIftySocialMemoryText(item) {
  const memoryText = String(item?.memoryText || '').trim();
  if (!memoryText) return '';
  return `<div style="margin-top:10px;border:1px solid #dbeafe;background:#f8fbff;border-radius:9px;padding:10px;">
    <div style="font-size:.76em;color:#0369a1;font-weight:900;">暗記用説明</div>
    <div style="margin-top:5px;color:#0f172a;font-size:.92em;line-height:1.65;white-space:pre-wrap;">${escapeHtml(formatIftyScienceMathText(memoryText))}</div>
  </div>`;
}

function renderIftySocialVisualAsset(item) {
  const imageData = normalizeIftySocialImageData(item.imageData);
  if (!imageData) return '';
  return `<div style="margin-top:10px;border:1px solid #d8b4fe;background:#faf5ff;border-radius:10px;padding:9px;display:grid;grid-template-columns:minmax(120px,220px) 1fr;gap:10px;align-items:start;">
    <button type="button" onclick="openIftySocialImageViewer('${item.id}')" style="border:none;background:transparent;padding:0;cursor:zoom-in;min-width:0;">
      <img src="${imageData}" alt="${escapeHtml(item.imageName || item.title || '社会画像')}" style="display:block;width:100%;max-height:190px;object-fit:contain;border-radius:7px;background:white;border:1px solid #e9d5ff;">
    </button>
    <div style="min-width:0;">
      <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
        <span style="font-size:.72em;font-weight:900;color:#7e22ce;background:#f3e8ff;border-radius:999px;padding:3px 7px;">${escapeHtml(getIftySocialImageKindLabel(item.imageKind))}</span>
        ${item.workTitle ? `<span style="font-size:.78em;font-weight:900;color:#581c87;">${escapeHtml(item.workTitle)}</span>` : ''}
      </div>
      <div style="margin-top:6px;font-size:.76em;font-weight:900;color:#6b21a8;">画像から押さえる核</div>
      <div style="margin-top:2px;color:#3b0764;font-size:.87em;line-height:1.5;white-space:pre-wrap;">${escapeHtml(item.imageFocus || '—')}</div>
    </div>
  </div>`;
}

function buildIftySocialSearchText(folder, item) {
  return [
    folder?.name,
    item?.title,
    item?.topic,
    item?.memoryText,
    item?.workTitle,
    item?.imageFocus,
    ...(Array.isArray(item?.keyPoints) ? item.keyPoints : []),
    ...(Array.isArray(item?.subjects) ? item.subjects.map(getIftySocialSubjectLabel) : [])
  ].map(value => String(value || '').trim()).filter(Boolean).join(' ').toLowerCase();
}

function renderIftySocialItemCard(folder, item) {
  const itemIndex = Math.max(0, (folder.items || []).findIndex(entry => String(entry.id) === String(item.id)));
  const lastIndex = Math.max(0, (folder.items || []).length - 1);
  const searchText = buildIftySocialSearchText(folder, item);

  return `<article class="ifty-social-item-card" data-folder-id="${escapeHtml(String(folder.id))}" data-ifty-search="${escapeHtml(searchText)}" style="border:1px solid #cbd5e1;border-radius:10px;background:white;padding:12px;margin-top:9px;box-shadow:0 1px 3px rgba(15,23,42,.05);">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
      <div style="min-width:0;flex:1;">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <strong style="font-size:1.08em;color:#0f172a;">${escapeHtml(item.title || item.topic || '無題')}</strong>
          ${renderIftySocialSubjectBadges(item.subjects.length ? item.subjects : folder.subjects)}
          ${item.source === 'ALLIA' ? '<span style="font-size:.68em;color:#7c3aed;font-weight:900;">ALLIA</span>' : '<span style="font-size:.68em;color:#64748b;font-weight:900;">MANUAL</span>'}
          ${item.imageData ? '<span style="font-size:.68em;color:#7e22ce;font-weight:900;">IMAGE</span>' : ''}
        </div>
      </div>
      <div style="display:flex;gap:5px;flex:none;flex-wrap:wrap;justify-content:flex-end;">
        <button type="button" onclick="moveIftySocialItem('${folder.id}','${item.id}',-1)" ${itemIndex <= 0 ? 'disabled' : ''} title="上へ" style="border:none;background:${itemIndex <= 0 ? '#cbd5e1' : '#e2e8f0'};color:#334155;border-radius:6px;padding:5px 8px;cursor:${itemIndex <= 0 ? 'not-allowed' : 'pointer'};font-weight:900;">↑</button>
        <button type="button" onclick="moveIftySocialItem('${folder.id}','${item.id}',1)" ${itemIndex >= lastIndex ? 'disabled' : ''} title="下へ" style="border:none;background:${itemIndex >= lastIndex ? '#cbd5e1' : '#e2e8f0'};color:#334155;border-radius:6px;padding:5px 8px;cursor:${itemIndex >= lastIndex ? 'not-allowed' : 'pointer'};font-weight:900;">↓</button>
        <button type="button" onclick="openIftySocialItemEditor('${folder.id}','${item.id}')" style="border:none;background:#64748b;color:white;border-radius:6px;padding:5px 8px;cursor:pointer;font-weight:800;">編集</button>
        <button type="button" onclick="deleteIftySocialItem('${folder.id}','${item.id}')" style="border:none;background:#ef4444;color:white;border-radius:6px;padding:5px 8px;cursor:pointer;font-weight:800;">削除</button>
      </div>
    </div>
    ${renderIftySocialVisualAsset(item)}
    ${renderIftySocialMemoryText(item)}
    ${item.keyPoints.length ? `<div style="margin-top:9px;padding:9px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;">
      <div style="font-size:.76em;font-weight:900;color:#475569;margin-bottom:4px;">重要ポイント</div>
      ${item.keyPoints.map(point => `<div style="font-size:.86em;color:#334155;line-height:1.45;">・${escapeHtml(point)}</div>`).join('')}
    </div>` : ''}
  </article>`;
}

window.moveIftySocialItem = function(folderId, itemId, direction) {
  const folder = getIftySocialFolder(folderId);
  if (!folder || !Array.isArray(folder.items)) return;
  const index = folder.items.findIndex(item => String(item.id) === String(itemId));
  if (index < 0) return;
  const nextIndex = index + (direction < 0 ? -1 : 1);
  if (nextIndex < 0 || nextIndex >= folder.items.length) return;

  recordUndoState('社会項目並べ替え');
  [folder.items[index], folder.items[nextIndex]] = [folder.items[nextIndex], folder.items[index]];
  folder.items[index].updatedAt = Date.now();
  folder.items[nextIndex].updatedAt = Date.now();
  savePracticeData();
  renderIftySocialStudiesPage({ preserveScroll: true });
};

function applyIftySocialSearchFilters() {
  const globalQuery = String(iftySocialSearchQuery || '').trim().toLowerCase();
  const cards = [...document.querySelectorAll('.ifty-social-item-card')];
  let visibleCount = 0;
  const folderTotals = {};
  const folderVisible = {};

  cards.forEach(card => {
    const folderId = String(card.dataset.folderId || '');
    const folderQuery = String(iftySocialFolderSearchQueries[folderId] || '').trim().toLowerCase();
    const searchText = String(card.dataset.iftySearch || '');
    const globalMatch = !globalQuery || searchText.includes(globalQuery);
    const folderMatch = !folderQuery || searchText.includes(folderQuery);
    const matched = globalMatch && folderMatch;

    folderTotals[folderId] = Number(folderTotals[folderId] || 0) + 1;
    if (matched) {
      visibleCount += 1;
      folderVisible[folderId] = Number(folderVisible[folderId] || 0) + 1;
    }
    card.style.display = matched ? '' : 'none';
  });

  const counter = document.getElementById('iftySocialSearchCount');
  if (counter) {
    counter.textContent = globalQuery
      ? `${visibleCount} / ${cards.length}件表示`
      : `${cards.length}件`;
  }

  Object.keys(folderTotals).forEach(folderId => {
    const counterEl = document.getElementById(`iftySocialFolderSearchCount_${folderId}`);
    if (!counterEl) return;
    const folderQuery = String(iftySocialFolderSearchQueries[folderId] || '').trim();
    counterEl.textContent = folderQuery
      ? `${Number(folderVisible[folderId] || 0)} / ${folderTotals[folderId]}件`
      : `${folderTotals[folderId]}件`;
  });
}

window.applyIftySocialSearch = function(value = null) {
  const input = document.getElementById('iftySocialSearchInput');
  iftySocialSearchQuery = String(value ?? input?.value ?? iftySocialSearchQuery ?? '').trim();
  applyIftySocialSearchFilters();
};

window.applyIftySocialFolderSearch = function(folderId, value = null) {
  const id = String(folderId || '');
  const input = document.getElementById(`iftySocialFolderSearch_${id}`);
  iftySocialFolderSearchQueries[id] = String(value ?? input?.value ?? iftySocialFolderSearchQueries[id] ?? '').trim();
  applyIftySocialSearchFilters();
};

function renderIftySocialPendingImage(folderId) {
  const container = document.getElementById(`iftySocialImagePreview_${folderId}`);
  if (!container) return;
  const draft = iftySocialImageDrafts[folderId];
  if (!draft || !draft.storedDataUrl) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  container.style.display = 'flex';
  container.innerHTML = `
    <img src="${draft.storedDataUrl}" alt="添付画像" style="width:74px;height:74px;object-fit:contain;border:1px solid #d8b4fe;border-radius:7px;background:white;">
    <div style="min-width:0;flex:1;">
      <div style="font-size:.78em;font-weight:900;color:#6b21a8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(draft.name || '画像')}</div>
      <div style="font-size:.7em;color:#7c3aed;margin-top:3px;">ALLIAが画像も読み取り、模式図・グラフ・実験装置・観察対象と覚える核を整理します。</div>
    </div>
    <button type="button" onclick="clearIftySocialImageDraft('${folderId}')" style="border:none;background:#e2e8f0;color:#475569;border-radius:999px;width:28px;height:28px;font-weight:900;cursor:pointer;">×</button>`;
}

function renderIftySocialVisualQuizBar(folder) {
  const items = Array.isArray(folder?.items) ? folder.items : [];
  const imageCount = items.filter(item => !!item.imageData).length;
  return `<div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-top:7px;padding:8px;border:1px solid #ede9fe;border-radius:8px;background:#fafaff;">
    <span style="font-size:.76em;font-weight:900;color:#6d28d9;">画像クイズ ${imageCount}枚</span>
    <button type="button" onclick="startIftySocialVisualQuiz('${folder.id}','image_to_text')" ${imageCount < 2 ? 'disabled' : ''} style="border:none;background:${imageCount < 2 ? '#cbd5e1' : '#7c3aed'};color:white;border-radius:7px;padding:6px 9px;font-weight:900;cursor:${imageCount < 2 ? 'not-allowed' : 'pointer'};">画像を見て選ぶ</button>
    <button type="button" onclick="startIftySocialVisualQuiz('${folder.id}','text_to_image')" ${imageCount < 2 ? 'disabled' : ''} style="border:none;background:${imageCount < 2 ? '#cbd5e1' : '#6d28d9'};color:white;border-radius:7px;padding:6px 9px;font-weight:900;cursor:${imageCount < 2 ? 'not-allowed' : 'pointer'};">画像を選ぶ</button>
    ${imageCount < 2 ? '<span style="font-size:.7em;color:#94a3b8;">2枚以上の画像を登録すると使用できます。</span>' : ''}
  </div>`;
}

function renderIftySocialItemsHtml(folder) {
  const items = Array.isArray(folder?.items) ? folder.items : [];
  return items.length
    ? items.map(item => renderIftySocialItemCard(folder, item)).join('')
    : '<div style="margin-top:12px;padding:18px;text-align:center;border:1px dashed #cbd5e1;border-radius:8px;color:#94a3b8;">まだ項目がありません。</div>';
}

function refreshIftySocialFolderDynamic(folderId) {
  const folder = getIftySocialFolder(folderId);
  if (!folder) return;

  const title = document.getElementById(`iftySocialFolderTitle_${folderId}`);
  if (title) title.textContent = `${folder.collapsed ? '▶' : '▼'} 📁 ${folder.name} (${folder.items.length}件)`;

  const quiz = document.getElementById(`iftySocialVisualQuizBar_${folderId}`);
  if (quiz) quiz.innerHTML = renderIftySocialVisualQuizBar(folder);

  const items = document.getElementById(`iftySocialItems_${folderId}`);
  if (items) items.innerHTML = renderIftySocialItemsHtml(folder);

  const summary = document.getElementById('iftySocialModuleSummary');
  if (summary) {
    const module = getIftySocialModule();
    summary.textContent = `フォルダ ${module.folders.length} / 項目 ${countIftySocialItems()}。画像はクイズ用に圧縮して項目へ保存され、既存のpracticeDataと一緒にクラウド同期・バックアップ対象になります。`;
  }

  applyIftySocialSearchFilters();
}

function keepIftySocialTopicFocused(folderId) {
  setTimeout(() => {
    const input = document.getElementById(`iftySocialTopic_${folderId}`);
    if (input) {
      input.focus({ preventScroll: true });
      const end = input.value.length;
      try { input.setSelectionRange(end, end); } catch (_) {}
    }
  }, 0);
}

function renderIftySocialFolder(folder) {
  const items = Array.isArray(folder.items) ? folder.items : [];
  const imageCount = items.filter(item => !!item.imageData).length;
  const subjectChecks = IFTY_SOCIAL_SUBJECTS.map(subject => {
    const checked = folder.subjects.includes(subject.key);
    return `<label style="display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border:1px solid ${checked ? '#38bdf8' : '#cbd5e1'};border-radius:999px;background:${checked ? '#f0f9ff' : 'white'};font-size:.76em;font-weight:800;cursor:pointer;">
      <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleIftySocialFolderSubject('${folder.id}','${subject.key}',this.checked,this)"> ${escapeHtml(subject.label)}
    </label>`;
  }).join('');

  return `<section id="iftySocialFolder_${folder.id}" style="margin-top:14px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;padding:13px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
      <div style="min-width:0;flex:1;">
        <button id="iftySocialFolderTitle_${folder.id}" type="button" onclick="toggleIftySocialFolderCollapse('${folder.id}')" style="border:none;background:transparent;padding:0;cursor:pointer;font-size:1.02em;font-weight:900;color:#0f172a;text-align:left;">${folder.collapsed ? '▶' : '▼'} 📁 ${escapeHtml(folder.name)} (${items.length}件)</button>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;">${subjectChecks}</div>
        <div style="font-size:.72em;color:#64748b;margin-top:5px;">このフォルダでは複数科目を同時選択できます。ALLIA生成時には選択中の科目だけをコンテキストとして送ります。</div>
      </div>
      <button type="button" onclick="deleteIftySocialFolder('${folder.id}')" style="border:none;background:#ef4444;color:white;border-radius:6px;padding:6px 9px;font-weight:900;cursor:pointer;">フォルダ削除</button>
    </div>

    ${folder.collapsed ? '' : `<div style="margin-top:12px;">
      <div style="display:flex;gap:7px;flex-wrap:wrap;">
        <input id="iftySocialTopic_${folder.id}" value="${escapeHtml(iftySocialTopicDrafts[folder.id] || '')}" placeholder="人物・出来事・制度・地名など（画像だけでも可）" oninput="iftySocialTopicDrafts['${folder.id}']=this.value" onkeydown="if(event.key==='Enter'){event.preventDefault();generateIftySocialItem('${folder.id}');}" style="flex:1;min-width:190px;padding:9px;border:1px solid #94a3b8;border-radius:7px;font-size:.95em;">
        <button type="button" onclick="document.getElementById('iftySocialImageInput_${folder.id}').click()" style="border:1px solid #c084fc;background:#faf5ff;color:#7e22ce;border-radius:7px;padding:9px 12px;font-weight:900;cursor:pointer;">🖼 画像</button>
        <input id="iftySocialImageInput_${folder.id}" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onchange="handleIftySocialImageSelect(event,'${folder.id}')" style="display:none;">
        <button type="button" onclick="addBlankIftySocialItem('${folder.id}')" style="border:1px solid #94a3b8;background:white;color:#334155;border-radius:7px;padding:9px 12px;font-weight:900;cursor:pointer;">白紙</button>
      </div>
      <div id="iftySocialImagePreview_${folder.id}" style="display:${iftySocialImageDrafts[folder.id]?.storedDataUrl ? 'flex' : 'none'};align-items:center;gap:8px;margin-top:7px;padding:7px;border:1px solid #e9d5ff;background:#faf5ff;border-radius:8px;"></div>
      <div id="iftySocialStatus_${folder.id}" style="min-height:1.2em;margin-top:6px;color:#64748b;font-size:.78em;">${Number(iftySocialGenerationPending[folder.id] || 0) > 0 ? `ALLIA生成中… ${Number(iftySocialGenerationPending[folder.id] || 0)}件` : ''}</div>
      <div id="iftySocialVisualQuizBar_${folder.id}">${renderIftySocialVisualQuizBar(folder)}</div>
      <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:9px;">
        <input id="iftySocialFolderSearch_${folder.id}" value="${escapeHtml(iftySocialFolderSearchQueries[folder.id] || '')}" placeholder="🔎 このフォルダ内を検索" oninput="applyIftySocialFolderSearch('${folder.id}',this.value)" style="flex:1;min-width:180px;padding:8px 9px;border:1px solid #cbd5e1;border-radius:7px;font-size:.86em;">
        <button type="button" onclick="document.getElementById('iftySocialFolderSearch_${folder.id}').value='';applyIftySocialFolderSearch('${folder.id}','');" style="border:none;background:#e2e8f0;color:#475569;border-radius:7px;padding:7px 9px;font-size:.8em;font-weight:900;cursor:pointer;">クリア</button>
        <span id="iftySocialFolderSearchCount_${folder.id}" style="font-size:.72em;color:#64748b;font-weight:800;">${items.length}件</span>
      </div>
      <div id="iftySocialItems_${folder.id}">${renderIftySocialItemsHtml(folder)}</div>
    </div>`}
  </section>`;
}

function renderIftySocialStudiesPage(options = {}) {
  const preserveScroll = !!options.preserveScroll;
  const preservedScrollY = preserveScroll ? window.scrollY : 0;
  currentIftySubject = 'SOCIAL STUDIES';
  const module = getIftySocialModule();
  showIftyHubContent(`
    <section class="ifty-portal-shell">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <h1 class="ifty-portal-title">SOCIAL STUDIES</h1>
          <div class="ifty-portal-subtitle">日本史・世界史・地理・公共を、フォルダごとに1つ以上組み合わせて管理。</div>
        </div>
        <button class="ifty-portal-back" type="button" onclick="openIftyHome()">HOMEへ戻る</button>
      </div>

      <div class="ifty-settings-section" style="margin-top:14px;">
        <div class="ifty-settings-row">
          <div>
            <h3>ORDER / ALLIA</h3>
            <div class="ifty-settings-note">${escapeHtml(getIftyOrderStatus('SOCIAL STUDIES'))}。社会のALLIAは、Who / When / Where / What / Why / Howを項目ごとに分断せず、必要な要素を自然につないだ暗記用説明文にします。人物は抽象的な主体だけで済ませず、判明している場合は建国者・創始者・首謀者・初代就任者・中心人物などの具体的人名を優先します。画像の地図・作品名・覚える核も整理します。</div>
          </div>
          <div style="display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end;">
            <button class="ifty-settings-action" type="button" onclick="openPracticeHome('SOCIAL STUDIES')" style="background:#0f766e;color:white;">⚔️ PRACTICE</button>
            <button class="ifty-settings-action" type="button" onclick="openIftySubjectOrder('SOCIAL STUDIES')" style="background:#0284c7;color:white;">ORDERを編集</button>
            <button class="ifty-settings-action" type="button" onclick="openIftySubjectAllia('SOCIAL STUDIES')" style="background:#7c3aed;color:white;">🤖 ALLIA</button>
          </div>
        </div>
      </div>

      <div style="margin-top:14px;padding:13px;border:1px solid #bae6fd;border-radius:10px;background:#f0f9ff;">
        <div style="font-weight:900;color:#0c4a6e;">新しい社会フォルダ</div>
        <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:9px;align-items:center;">
          <input id="iftySocialFolderName" placeholder="例：古代中国 / 幕末 / 気候 / 日本国憲法" onkeydown="if(event.key==='Enter'){event.preventDefault();createIftySocialFolder();}" style="flex:1;min-width:210px;padding:9px;border:1px solid #7dd3fc;border-radius:7px;font-size:.95em;">
          <button type="button" onclick="createIftySocialFolder()" style="border:none;background:#0369a1;color:white;border-radius:7px;padding:9px 12px;font-weight:900;cursor:pointer;">作成</button>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px;">
          ${IFTY_SOCIAL_SUBJECTS.map((subject, index) => `<label style="display:inline-flex;align-items:center;gap:4px;font-size:.8em;font-weight:800;"><input id="iftySocialCreate_${subject.key}" type="checkbox" ${index === 1 ? 'checked' : ''}> ${escapeHtml(subject.label)}</label>`).join('')}
        </div>
      </div>

      <div style="margin-top:12px;padding:10px;border:1px solid #cbd5e1;border-radius:10px;background:white;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input id="iftySocialSearchInput" value="${escapeHtml(iftySocialSearchQuery)}" placeholder="🔎 全フォルダから社会の用語・説明を検索" oninput="applyIftySocialSearch(this.value)" style="flex:1;min-width:220px;padding:9px 10px;border:1px solid #94a3b8;border-radius:8px;font-size:.92em;">
        <button type="button" onclick="document.getElementById('iftySocialSearchInput').value='';applyIftySocialSearch('');" style="border:none;background:#e2e8f0;color:#475569;border-radius:7px;padding:8px 10px;font-weight:900;cursor:pointer;">クリア</button>
        <span id="iftySocialSearchCount" style="font-size:.78em;color:#64748b;font-weight:800;">${countIftySocialItems()}件</span>
      </div>
      <div id="iftySocialModuleSummary" style="margin-top:10px;color:#64748b;font-size:.78em;">フォルダ ${module.folders.length} / 項目 ${countIftySocialItems()}。画像はクイズ用に圧縮して項目へ保存され、既存のpracticeDataと一緒にクラウド同期・バックアップ対象になります。</div>
      <div>${module.folders.length ? module.folders.map(renderIftySocialFolder).join('') : '<div style="margin-top:16px;padding:28px;text-align:center;border:1px dashed #cbd5e1;border-radius:10px;color:#94a3b8;">社会フォルダを作成してください。</div>'}</div>
    </section>
  `, 'subject');
  module.folders.forEach(folder => renderIftySocialPendingImage(folder.id));
  applyIftySocialSearchFilters();

  // ALLIA生成完了時の全体再描画でページ先頭へ飛ばないよう、
  // 再描画直前の閲覧位置を同じ位置へ戻す。通常の画面遷移では従来どおり先頭へ移動する。
  if (preserveScroll) {
    const restoreScroll = () => window.scrollTo({ top: preservedScrollY, left: 0, behavior: 'auto' });
    restoreScroll();
    requestAnimationFrame(restoreScroll);
  }
}

window.createIftySocialFolder = function() {
  const input = document.getElementById('iftySocialFolderName');
  const name = String(input?.value || '').trim();
  if (!name) {
    alert('フォルダ名を入力してください。');
    return;
  }
  const subjects = IFTY_SOCIAL_SUBJECTS
    .filter(subject => document.getElementById(`iftySocialCreate_${subject.key}`)?.checked)
    .map(subject => subject.key);
  if (!subjects.length) {
    alert('日本史・世界史・地理・公共から1つ以上選択してください。');
    return;
  }
  recordUndoState('社会フォルダ作成');
  getIftySocialModule().folders.push({ id: makeId('socialfolder'), name, subjects, collapsed: false, items: [] });
  savePracticeData();
  renderIftySocialStudiesPage();
};

window.toggleIftySocialFolderCollapse = function(folderId) {
  const folder = getIftySocialFolder(folderId);
  if (!folder) return;
  folder.collapsed = !folder.collapsed;
  savePracticeData();
  renderIftySocialStudiesPage();
};

window.toggleIftySocialFolderSubject = function(folderId, subjectKey, checked, checkbox = null) {
  const folder = getIftySocialFolder(folderId);
  if (!folder || !IFTY_SOCIAL_SUBJECT_KEYS.includes(subjectKey)) return;

  const next = new Set(folder.subjects);
  if (checked) next.add(subjectKey); else next.delete(subjectKey);

  if (!next.size) {
    if (checkbox) checkbox.checked = true;
    alert('少なくとも1科目は選択してください。');
    return;
  }

  recordUndoState('社会フォルダ科目変更');
  folder.subjects = [...next];
  savePracticeData();

  if (checkbox?.parentElement) {
    checkbox.parentElement.style.borderColor = checked ? '#38bdf8' : '#cbd5e1';
    checkbox.parentElement.style.background = checked ? '#f0f9ff' : 'white';
  }
};

window.deleteIftySocialFolder = function(folderId) {
  const module = getIftySocialModule();
  const folder = module.folders.find(item => item.id === folderId);
  if (!folder) return;
  if (!confirm(`「${folder.name}」を削除しますか？中の項目も削除されます。`)) return;
  recordUndoState('社会フォルダ削除');
  module.folders = module.folders.filter(item => item.id !== folderId);
  delete iftySocialTopicDrafts[folderId];
  delete iftySocialImageDrafts[folderId];
  delete iftySocialFolderSearchQueries[folderId];
  savePracticeData();
  renderIftySocialStudiesPage();
};

function loadIftyImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像を読み込めませんでした。'));
    img.src = dataUrl;
  });
}

async function makeIftySocialStoredImage(dataUrl, maxSide = 900, maxChars = 240000) {
  const img = await loadIftyImageElement(dataUrl);
  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;
  const largest = Math.max(width, height);
  if (largest > maxSide) {
    const scale = maxSide / largest;
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  for (let pass = 0; pass < 5; pass += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    for (const quality of [0.84, 0.76, 0.68, 0.6, 0.52]) {
      const out = canvas.toDataURL('image/jpeg', quality);
      if (out.length <= maxChars) return out;
    }
    width = Math.max(320, Math.round(width * 0.82));
    height = Math.max(240, Math.round(height * 0.82));
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.5);
}

window.handleIftySocialImageSelect = async function(event, folderId) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.type && !file.type.startsWith('image/')) {
    alert('画像ファイルを選択してください。');
    event.target.value = '';
    return;
  }
  if (file.size > 14 * 1024 * 1024) {
    alert('画像が大きすぎます。14MB以下の画像を選択してください。');
    event.target.value = '';
    return;
  }

  try {
    const rawDataUrl = await readFileAsDataUrl(file);
    const [aiDataUrl, storedDataUrl] = await Promise.all([
      resizeImageDataUrl(rawDataUrl, 1600),
      makeIftySocialStoredImage(rawDataUrl)
    ]);
    iftySocialImageDrafts[folderId] = {
      name: String(file.name || 'image').trim(),
      aiDataUrl,
      storedDataUrl
    };
    renderIftySocialPendingImage(folderId);
    keepIftySocialTopicFocused(folderId);
  } catch (error) {
    delete iftySocialImageDrafts[folderId];
    alert(String(error.message || error));
  } finally {
    event.target.value = '';
  }
};

window.clearIftySocialImageDraft = function(folderId) {
  delete iftySocialImageDrafts[folderId];
  renderIftySocialPendingImage(folderId);
  keepIftySocialTopicFocused(folderId);
};

window.generateIftySocialItem = async function(folderId) {
  const folder = getIftySocialFolder(folderId);
  const input = document.getElementById(`iftySocialTopic_${folderId}`);
  // DOMの値を最優先し、再描画直後などinput参照が取れない場合はdraftを使う。
  const topic = String(input?.value ?? iftySocialTopicDrafts[folderId] ?? '').trim();
  const imageDraft = iftySocialImageDrafts[folderId] ? { ...iftySocialImageDrafts[folderId] } : null;

  if (!folder) {
    alert('対象の社会フォルダを取得できませんでした。画面を開き直してください。');
    return;
  }
  // STEP33までは空欄時に無言returnしていたため、ボタンが壊れたように見えた。
  // 用語または画像のどちらかを必須にし、足りない場合は明示する。
  if (!topic && !imageDraft?.aiDataUrl) {
    const status = document.getElementById(`iftySocialStatus_${folderId}`);
    if (status) status.textContent = '用語を入力するか、画像を添付してください。';
    if (input) {
      input.focus({ preventScroll: true });
      input.style.outline = '2px solid #7c3aed';
      setTimeout(() => { if (input) input.style.outline = ''; }, 1200);
    }
    return;
  }
  if (!ensureIftyOnline('社会データ生成')) return;

  // 送信時点の科目設定を固定する。生成待ちの間にフォルダ設定が変わっても、
  // このリクエスト自体の条件は途中で変えない。
  const requestSubjects = [...folder.subjects];

  // クリック送信でもEnter送信でも、確定した値をここで固定してから空にする。
  // 前の生成完了を待たず、次の用語を続けて入力・送信できる。
  iftySocialTopicDrafts[folderId] = '';
  if (input) input.value = '';
  delete iftySocialImageDrafts[folderId];
  renderIftySocialPendingImage(folderId);
  keepIftySocialTopicFocused(folderId);

  iftySocialGenerationPending[folderId] = Number(iftySocialGenerationPending[folderId] || 0) + 1;
  const setPendingStatus = (message = '') => {
    const status = document.getElementById(`iftySocialStatus_${folderId}`);
    if (!status) return;
    const pending = Number(iftySocialGenerationPending[folderId] || 0);
    if (message) {
      status.textContent = pending > 0 ? `${message}（残り ${pending}件生成中）` : message;
    } else {
      status.textContent = pending > 0 ? `ALLIA生成中… ${pending}件` : '';
    }
  };
  setPendingStatus(imageDraft?.aiDataUrl ? 'ALLIAが画像と暗記用説明文を作成中…' : 'ALLIAが暗記用説明文を作成中…');

  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'social_generate',
        topic,
        image: imageDraft?.aiDataUrl || '',
        subjects: requestSubjects,
        subject: 'SOCIAL STUDIES',
        order: getIftySubjectOrder('SOCIAL STUDIES')
      })
    });
    const data = await response.json();
    if (!response.ok) throw alliaHttpError(response, data, '社会データ生成に失敗しました。');

    // 重要：savePracticeData()/normalizePracticeData() はフォルダオブジェクトを
    // 新しく作り直す。連続生成中に先のリクエストが保存すると、送信開始時に取得した
    // folder参照は古くなるため、必ず完了時点でfolderIdから最新フォルダを取り直す。
    const currentFolder = getIftySocialFolder(folderId);
    if (!currentFolder) {
      iftySocialGenerationPending[folderId] = Math.max(0, Number(iftySocialGenerationPending[folderId] || 0) - 1);
      return;
    }

    recordUndoState('社会項目追加');
    currentFolder.items.push(normalizeIftySocialItem({
      ...data,
      id: makeId('socialitem'),
      topic,
      title: topic || String(data.title || '').trim(),
      subjects: requestSubjects,
      imageData: imageDraft?.storedDataUrl || '',
      imageName: imageDraft?.name || '',
      source: 'ALLIA',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }));
    savePracticeData();

    iftySocialGenerationPending[folderId] = Math.max(0, Number(iftySocialGenerationPending[folderId] || 0) - 1);
    refreshIftySocialFolderDynamic(folderId);
    setPendingStatus();
  } catch (error) {
    console.error('社会暗記用説明文生成エラー:', error);
    iftySocialGenerationPending[folderId] = Math.max(0, Number(iftySocialGenerationPending[folderId] || 0) - 1);

    // 失敗時だけ、送信した内容を復元する。
    // ただし、その後に入力した新しい内容がある場合は絶対に上書きしない。
    if (!String(iftySocialTopicDrafts[folderId] || '').trim()) iftySocialTopicDrafts[folderId] = topic;
    if (!iftySocialImageDrafts[folderId] && imageDraft) iftySocialImageDrafts[folderId] = imageDraft;
    const currentInput = document.getElementById(`iftySocialTopic_${folderId}`);
    if (currentInput && !currentInput.value.trim()) currentInput.value = iftySocialTopicDrafts[folderId] || '';
    renderIftySocialPendingImage(folderId);
    setPendingStatus(String(error.message || error));
  }
};

window.addBlankIftySocialItem = function(folderId) {
  const folder = getIftySocialFolder(folderId);
  if (!folder) return;
  const imageDraft = iftySocialImageDrafts[folderId] ? { ...iftySocialImageDrafts[folderId] } : null;
  recordUndoState('社会白紙項目追加');
  const item = normalizeIftySocialItem({
    id: makeId('socialitem'),
    subjects: folder.subjects,
    imageData: imageDraft?.storedDataUrl || '',
    imageName: imageDraft?.name || '',
    source: 'MANUAL',
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  folder.items.push(item);
  delete iftySocialImageDrafts[folderId];
  savePracticeData();
  renderIftySocialStudiesPage();
  setTimeout(() => window.openIftySocialItemEditor(folderId, item.id), 0);
};

function ensureIftySocialImageViewerModal() {
  let modal = document.getElementById('iftySocialImageViewerModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'iftySocialImageViewerModal';
  modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(2,6,23,.82);z-index:12150;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
  modal.innerHTML = '<div id="iftySocialImageViewerCard" style="width:min(980px,96vw);max-height:94vh;overflow:auto;background:#0f172a;border-radius:12px;padding:12px;box-shadow:0 20px 60px rgba(0,0,0,.4);"></div>';
  modal.addEventListener('click', event => { if (event.target === modal) window.closeIftySocialImageViewer(); });
  document.body.appendChild(modal);
  return modal;
}

window.openIftySocialImageViewer = function(itemId) {
  const ref = getIftySocialItemById(itemId);
  if (!ref?.item?.imageData) return;
  const modal = ensureIftySocialImageViewerModal();
  const card = document.getElementById('iftySocialImageViewerCard');
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px;color:white;">
      <div style="font-weight:900;">${escapeHtml(ref.item.workTitle || ref.item.title || '画像')}</div>
      <button type="button" onclick="closeIftySocialImageViewer()" style="border:none;background:#334155;color:white;border-radius:999px;width:34px;height:34px;font-size:1.2em;cursor:pointer;">×</button>
    </div>
    <img src="${ref.item.imageData}" alt="${escapeHtml(ref.item.imageName || ref.item.title || '社会画像')}" style="display:block;max-width:100%;max-height:78vh;margin:auto;object-fit:contain;background:white;border-radius:8px;">
    ${ref.item.imageFocus ? `<div style="margin-top:9px;color:#e9d5ff;line-height:1.5;white-space:pre-wrap;">${escapeHtml(ref.item.imageFocus)}</div>` : ''}`;
  modal.style.display = 'flex';
};

window.closeIftySocialImageViewer = function() {
  const modal = document.getElementById('iftySocialImageViewerModal');
  if (modal) modal.style.display = 'none';
};

function ensureIftySocialItemModal() {
  let modal = document.getElementById('iftySocialItemModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'iftySocialItemModal';
  modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.58);z-index:12050;align-items:center;justify-content:center;padding:14px;box-sizing:border-box;';
  modal.innerHTML = '<div id="iftySocialItemModalCard" style="width:min(760px,96vw);max-height:92vh;overflow:auto;background:white;border-radius:12px;padding:16px;box-shadow:0 20px 50px rgba(0,0,0,.28);"></div>';
  modal.addEventListener('click', event => { if (event.target === modal) window.closeIftySocialItemEditor(); });
  document.body.appendChild(modal);
  return modal;
}

function renderIftySocialEditorImagePreview() {
  const container = document.getElementById('iftySocialEditImagePreview');
  if (!container) return;
  const imageData = normalizeIftySocialImageData(iftySocialEditorImageDraft?.imageData);
  if (!imageData) {
    container.innerHTML = '<div style="padding:12px;border:1px dashed #cbd5e1;border-radius:8px;color:#94a3b8;text-align:center;font-size:.8em;">画像なし</div>';
    return;
  }
  container.innerHTML = `
    <div style="display:flex;gap:9px;align-items:center;padding:8px;border:1px solid #e9d5ff;border-radius:8px;background:#faf5ff;">
      <img src="${imageData}" alt="画像プレビュー" style="width:96px;height:80px;object-fit:contain;background:white;border:1px solid #e9d5ff;border-radius:7px;">
      <div style="min-width:0;flex:1;font-size:.76em;color:#6b21a8;">${escapeHtml(iftySocialEditorImageDraft?.imageName || '添付画像')}</div>
      <button type="button" onclick="removeIftySocialEditorImage()" style="border:none;background:#ef4444;color:white;border-radius:7px;padding:6px 8px;font-weight:900;cursor:pointer;">画像削除</button>
    </div>`;
}

window.openIftySocialItemEditor = function(folderId, itemId) {
  const folder = getIftySocialFolder(folderId);
  const item = folder?.items?.find(entry => entry.id === itemId);
  if (!folder || !item) return;
  iftySocialEditorImageDraft = {
    imageData: normalizeIftySocialImageData(item.imageData),
    imageName: String(item.imageName || '').trim()
  };
  const modal = ensureIftySocialItemModal();
  const card = document.getElementById('iftySocialItemModalCard');
  const field = (id, label, value, rows = 1) => `<label style="display:block;margin-top:9px;font-size:.78em;font-weight:900;color:#475569;">${label}</label>${rows > 1 ? `<textarea id="${id}" rows="${rows}" style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #cbd5e1;border-radius:7px;font-size:.95em;resize:vertical;">${escapeHtml(value || '')}</textarea>` : `<input id="${id}" value="${escapeHtml(value || '')}" style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #cbd5e1;border-radius:7px;font-size:.95em;">`}`;
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
      <div><div style="font-size:1.15em;font-weight:900;color:#0f172a;">社会項目を編集</div><div style="font-size:.75em;color:#64748b;">5W1Hを自然に含んだ暗記用説明文と、画像の覚える核を修正できます。</div></div>
      <button type="button" onclick="closeIftySocialItemEditor()" style="border:none;background:#e2e8f0;color:#334155;border-radius:999px;width:34px;height:34px;font-size:1.2em;font-weight:900;cursor:pointer;">×</button>
    </div>
    ${field('iftySocialEditTitle','タイトル',item.title)}
    ${field('iftySocialEditMemoryText','暗記用説明文（Who / When / Where / What / Why / Howを、必要な範囲で自然な文章として含める）',item.memoryText,7)}
    ${field('iftySocialEditKeyPoints','重要ポイント（1行1項目）',item.keyPoints.join('\n'),4)}
    <div style="margin-top:12px;padding:10px;border:1px solid #e9d5ff;background:#faf5ff;border-radius:9px;">
      <div style="font-size:.8em;font-weight:900;color:#6b21a8;">画像資産</div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:7px;align-items:center;">
        <button type="button" onclick="document.getElementById('iftySocialEditImageInput').click()" style="border:1px solid #c084fc;background:white;color:#7e22ce;border-radius:7px;padding:7px 10px;font-weight:900;cursor:pointer;">画像を選択</button>
        <input id="iftySocialEditImageInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onchange="handleIftySocialEditorImageSelect(event)" style="display:none;">
      </div>
      <div id="iftySocialEditImagePreview" style="margin-top:7px;"></div>
      <label style="display:block;margin-top:9px;font-size:.78em;font-weight:900;color:#6b21a8;">画像種別</label>
      <select id="iftySocialEditImageKind" style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #d8b4fe;border-radius:7px;background:white;">
        <option value="" ${!item.imageKind ? 'selected' : ''}>未設定</option>
        <option value="MAP" ${item.imageKind === 'MAP' ? 'selected' : ''}>地図</option>
        <option value="ARTWORK" ${item.imageKind === 'ARTWORK' ? 'selected' : ''}>作品・建築</option>
        <option value="PHOTO" ${item.imageKind === 'PHOTO' ? 'selected' : ''}>写真</option>
        <option value="DOCUMENT" ${item.imageKind === 'DOCUMENT' ? 'selected' : ''}>史料・文書</option>
        <option value="CHART" ${item.imageKind === 'CHART' ? 'selected' : ''}>図表・グラフ</option>
        <option value="OTHER" ${item.imageKind === 'OTHER' ? 'selected' : ''}>その他</option>
      </select>
      ${field('iftySocialEditImageFocus','画像から押さえる核（地図なら場所・範囲、作品なら特徴など）',item.imageFocus,3)}
      ${field('iftySocialEditWorkTitle','作品名・建築名・史料名',item.workTitle)}
    </div>
    <div style="position:sticky;bottom:-16px;margin:14px -16px -16px;padding:10px 16px;background:rgba(255,255,255,.97);border-top:1px solid #e2e8f0;display:flex;gap:8px;justify-content:flex-end;">
      <button type="button" onclick="closeIftySocialItemEditor()" style="border:none;background:#e2e8f0;color:#334155;border-radius:7px;padding:9px 12px;font-weight:900;cursor:pointer;">キャンセル</button>
      <button type="button" onclick="saveIftySocialItemEditor('${folderId}','${itemId}')" data-ifty-enter-primary="true" style="border:none;background:#0284c7;color:white;border-radius:7px;padding:9px 14px;font-weight:900;cursor:pointer;">保存</button>
    </div>`;
  modal.style.display = 'flex';
  renderIftySocialEditorImagePreview();
  setTimeout(() => document.getElementById('iftySocialEditTitle')?.focus(), 0);
};

window.handleIftySocialEditorImageSelect = async function(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.type && !file.type.startsWith('image/')) {
    alert('画像ファイルを選択してください。');
    event.target.value = '';
    return;
  }
  if (file.size > 14 * 1024 * 1024) {
    alert('画像が大きすぎます。14MB以下の画像を選択してください。');
    event.target.value = '';
    return;
  }
  try {
    const rawDataUrl = await readFileAsDataUrl(file);
    iftySocialEditorImageDraft = {
      imageData: await makeIftySocialStoredImage(rawDataUrl),
      imageName: String(file.name || 'image').trim()
    };
    renderIftySocialEditorImagePreview();
  } catch (error) {
    alert(String(error.message || error));
  } finally {
    event.target.value = '';
  }
};

window.removeIftySocialEditorImage = function() {
  iftySocialEditorImageDraft = { imageData: '', imageName: '' };
  renderIftySocialEditorImagePreview();
};

window.closeIftySocialItemEditor = function() {
  const modal = document.getElementById('iftySocialItemModal');
  if (modal) modal.style.display = 'none';
  iftySocialEditorImageDraft = null;
};

window.saveIftySocialItemEditor = function(folderId, itemId) {
  const folder = getIftySocialFolder(folderId);
  const item = folder?.items?.find(entry => entry.id === itemId);
  if (!item) return;
  recordUndoState('社会項目編集');
  const val = id => String(document.getElementById(id)?.value || '').trim();
  item.title = val('iftySocialEditTitle');
  item.memoryText = val('iftySocialEditMemoryText');
  item.keyPoints = val('iftySocialEditKeyPoints').split(/\n+/).map(v => v.trim()).filter(Boolean).slice(0, 12);
  item.imageData = normalizeIftySocialImageData(iftySocialEditorImageDraft?.imageData);
  item.imageName = String(iftySocialEditorImageDraft?.imageName || '').trim();
  item.imageKind = normalizeIftySocialImageKind(val('iftySocialEditImageKind'));
  item.imageFocus = val('iftySocialEditImageFocus');
  item.workTitle = val('iftySocialEditWorkTitle');
  if (!item.imageData) {
    item.imageName = '';
    item.imageKind = '';
    item.imageFocus = '';
    item.workTitle = '';
  }
  item.updatedAt = Date.now();
  savePracticeData();
  window.closeIftySocialItemEditor();
  renderIftySocialStudiesPage();
};

window.deleteIftySocialItem = function(folderId, itemId) {
  const folder = getIftySocialFolder(folderId);
  const item = folder?.items?.find(entry => entry.id === itemId);
  if (!folder || !item) return;
  if (!confirm(`「${item.title || item.topic || 'この項目'}」を削除しますか？`)) return;
  recordUndoState('社会項目削除');
  folder.items = folder.items.filter(entry => entry.id !== itemId);
  savePracticeData();
  renderIftySocialStudiesPage();
};

function ensureIftySocialVisualQuizModal() {
  let modal = document.getElementById('iftySocialVisualQuizModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'iftySocialVisualQuizModal';
  modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.65);z-index:12080;align-items:center;justify-content:center;padding:14px;box-sizing:border-box;';
  modal.innerHTML = '<div id="iftySocialVisualQuizCard" style="width:min(820px,96vw);max-height:92vh;overflow:auto;background:white;border-radius:12px;padding:16px;box-shadow:0 20px 50px rgba(0,0,0,.3);"></div>';
  modal.addEventListener('click', event => { if (event.target === modal) window.closeIftySocialVisualQuiz(); });
  document.body.appendChild(modal);
  return modal;
}

function getIftySocialVisualQuizCandidates(folderId, mode) {
  const folder = getIftySocialFolder(folderId);
  if (!folder) return [];
  if (mode === 'text_to_image') {
    return (folder.items || []).filter(item => !!item.imageData && !!String(item.title || '').trim());
  }
  return (folder.items || []).filter(item => !!item.imageData && !!String(item.title || '').trim());
}

function buildIftySocialVisualOptionIds(folderId, targetId, mode) {
  const localFolder = getIftySocialFolder(folderId);
  let pool = [];
  if (mode === 'text_to_image') {
    pool = getIftySocialImageEntries().map(ref => ref.item);
  } else {
    pool = getIftySocialModule().folders.flatMap(folder => folder.items || []);
  }

  const target = getIftySocialItemById(targetId)?.item;
  if (!target) return [];
  const seenLabels = new Set([String(target.title || '').trim().toLowerCase()]);
  const distractors = [];

  // 同じフォルダを優先し、足りない分だけ社会全体から補う。
  const prioritized = [
    ...(localFolder?.items || []).filter(item => String(item.id) !== String(targetId)),
    ...pool.filter(item => !localFolder?.items?.some(local => String(local.id) === String(item.id)))
  ];

  for (const item of shuffleArray(prioritized)) {
    if (String(item.id) === String(targetId)) continue;
    if (mode === 'text_to_image' && !item.imageData) continue;
    const label = String(item.title || '').trim();
    if (!label) continue;
    const normalized = label.toLowerCase();
    if (seenLabels.has(normalized)) continue;
    seenLabels.add(normalized);
    distractors.push(String(item.id));
    if (distractors.length >= 3) break;
  }
  return shuffleArray([String(targetId), ...distractors]);
}

window.startIftySocialVisualQuiz = function(folderId, mode) {
  const normalizedMode = mode === 'text_to_image' ? 'text_to_image' : 'image_to_text';
  const candidates = getIftySocialVisualQuizCandidates(folderId, normalizedMode);
  if (candidates.length < 2) {
    alert('この画像クイズには、画像付きの項目が2件以上必要です。');
    return;
  }
  iftySocialVisualQuizState = {
    mode: normalizedMode,
    folderId,
    queue: shuffleArray(candidates.map(item => String(item.id))),
    index: 0,
    correct: 0,
    wrong: 0,
    answered: false,
    selectedId: '',
    optionIds: []
  };
  ensureIftySocialVisualQuizModal().style.display = 'flex';
  renderIftySocialVisualQuiz();
};

function renderIftySocialVisualQuiz() {
  const state = iftySocialVisualQuizState;
  const card = document.getElementById('iftySocialVisualQuizCard');
  if (!card) return;

  if (state.index >= state.queue.length) {
    const total = state.correct + state.wrong;
    const rate = total ? Math.round((state.correct / total) * 100) : 0;
    card.innerHTML = `
      <div style="text-align:center;padding:16px 4px;">
        <div style="font-size:1.25em;font-weight:900;color:#0f172a;">画像クイズ完了</div>
        <div style="margin-top:12px;font-size:1.05em;color:#334155;">正解 ${state.correct} / ${total}　正答率 ${rate}%</div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:16px;">
          <button type="button" onclick="startIftySocialVisualQuiz('${state.folderId}','${state.mode}')" style="border:none;background:#7c3aed;color:white;border-radius:8px;padding:9px 14px;font-weight:900;cursor:pointer;">もう一度</button>
          <button type="button" onclick="closeIftySocialVisualQuiz()" data-ifty-enter-primary="true" style="border:none;background:#334155;color:white;border-radius:8px;padding:9px 14px;font-weight:900;cursor:pointer;">閉じる</button>
        </div>
      </div>`;
    return;
  }

  const targetRef = getIftySocialItemById(state.queue[state.index]);
  if (!targetRef?.item?.imageData) {
    state.index += 1;
    renderIftySocialVisualQuiz();
    return;
  }
  const target = targetRef.item;
  if (!state.optionIds.length) state.optionIds = buildIftySocialVisualOptionIds(state.folderId, target.id, state.mode);
  const optionRefs = state.optionIds.map(id => getIftySocialItemById(id)).filter(Boolean);

  const resultBlock = state.answered ? `<div style="margin-top:13px;padding:10px;border-radius:9px;background:${state.selectedId === String(target.id) ? '#ecfdf5' : '#fff1f2'};border:1px solid ${state.selectedId === String(target.id) ? '#86efac' : '#fda4af'};">
      <div style="font-weight:900;color:${state.selectedId === String(target.id) ? '#166534' : '#9f1239'};">${state.selectedId === String(target.id) ? '正解' : `正解：${escapeHtml(target.title || '無題')}`}</div>
      ${target.workTitle ? `<div style="margin-top:5px;font-size:.83em;color:#581c87;"><strong>図・装置・資料名：</strong>${escapeHtml(target.workTitle)}</div>` : ''}
      ${target.imageFocus ? `<div style="margin-top:5px;font-size:.83em;color:#3b0764;line-height:1.5;"><strong>画像の核：</strong>${escapeHtml(target.imageFocus)}</div>` : ''}
      ${target.memoryText ? `<div style="margin-top:5px;font-size:.82em;color:#475569;line-height:1.55;">${escapeHtml(target.memoryText)}</div>` : ''}
      <div style="margin-top:10px;text-align:right;"><button type="button" onclick="nextIftySocialVisualQuiz()" data-ifty-enter-primary="true" style="border:none;background:#7c3aed;color:white;border-radius:8px;padding:8px 13px;font-weight:900;cursor:pointer;">次へ</button></div>
    </div>` : '';

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
      <div>
        <div style="font-size:1.12em;font-weight:900;color:#0f172a;">${state.mode === 'image_to_text' ? '画像を見て選ぶ' : '画像を選ぶ'}</div>
        <div style="font-size:.75em;color:#64748b;margin-top:2px;">${state.index + 1} / ${state.queue.length}</div>
      </div>
      <button type="button" onclick="closeIftySocialVisualQuiz()" style="border:none;background:#e2e8f0;color:#475569;border-radius:999px;width:34px;height:34px;font-size:1.2em;font-weight:900;cursor:pointer;">×</button>
    </div>

    ${state.mode === 'image_to_text' ? `
      <div style="margin-top:13px;text-align:center;">
        <img src="${target.imageData}" alt="問題画像" style="max-width:100%;max-height:340px;object-fit:contain;border:1px solid #e2e8f0;border-radius:10px;background:#fff;">
        <div style="margin-top:9px;font-weight:900;color:#334155;">この画像に最も対応する項目は？</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;margin-top:12px;">
        ${optionRefs.map(ref => {
          const id = String(ref.item.id);
          const disabled = state.answered ? 'disabled' : '';
          const isCorrect = id === String(target.id);
          const isSelected = id === state.selectedId;
          let bg = '#f8fafc', border = '#cbd5e1', color = '#0f172a';
          if (state.answered && isCorrect) { bg = '#dcfce7'; border = '#22c55e'; color = '#166534'; }
          else if (state.answered && isSelected) { bg = '#ffe4e6'; border = '#f43f5e'; color = '#9f1239'; }
          return `<button type="button" ${disabled} data-ifty-enter-ignore="true" onclick="answerIftySocialVisualQuiz('${id}')" style="border:2px solid ${border};background:${bg};color:${color};border-radius:9px;padding:11px;text-align:left;font-weight:900;cursor:${state.answered ? 'default' : 'pointer'};">${escapeHtml(ref.item.title || '無題')}</button>`;
        }).join('')}
      </div>` : `
      <div style="margin-top:13px;padding:12px;border:1px solid #ddd6fe;border-radius:10px;background:#f5f3ff;text-align:center;">
        <div style="font-size:.78em;color:#6d28d9;font-weight:900;">次の項目に対応する画像を選べ</div>
        <div style="margin-top:5px;font-size:1.2em;font-weight:900;color:#3b0764;">${escapeHtml(target.title || '無題')}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:12px;">
        ${optionRefs.map(ref => {
          const id = String(ref.item.id);
          const disabled = state.answered ? 'disabled' : '';
          const isCorrect = id === String(target.id);
          const isSelected = id === state.selectedId;
          let border = '#cbd5e1', bg = '#fff';
          if (state.answered && isCorrect) { border = '#22c55e'; bg = '#f0fdf4'; }
          else if (state.answered && isSelected) { border = '#f43f5e'; bg = '#fff1f2'; }
          return `<button type="button" ${disabled} data-ifty-enter-ignore="true" onclick="answerIftySocialVisualQuiz('${id}')" style="border:3px solid ${border};background:${bg};border-radius:10px;padding:7px;cursor:${state.answered ? 'default' : 'pointer'};min-width:0;"><img src="${ref.item.imageData}" alt="選択肢画像" style="display:block;width:100%;height:180px;object-fit:contain;background:white;border-radius:6px;"></button>`;
        }).join('')}
      </div>`}
    ${resultBlock}`;
}

window.answerIftySocialVisualQuiz = function(itemId) {
  const state = iftySocialVisualQuizState;
  if (state.answered || state.index >= state.queue.length) return;
  const correctId = String(state.queue[state.index]);
  state.selectedId = String(itemId);
  state.answered = true;
  if (state.selectedId === correctId) state.correct += 1;
  else state.wrong += 1;
  renderIftySocialVisualQuiz();
};

window.nextIftySocialVisualQuiz = function() {
  const state = iftySocialVisualQuizState;
  if (!state.answered) return;
  state.index += 1;
  state.answered = false;
  state.selectedId = '';
  state.optionIds = [];
  renderIftySocialVisualQuiz();
};

window.closeIftySocialVisualQuiz = function() {
  const modal = document.getElementById('iftySocialVisualQuizModal');
  if (modal) modal.style.display = 'none';
};


// ==========================================
// Q3 STEP35：SOCIAL STUDIES 専用PRACTICE
// ==========================================
function getIftySocialPracticeFolders() {
  return getIftySocialModule().folders.filter(folder => Array.isArray(folder.items) && folder.items.length);
}

function ensureIftySocialPracticeFolderSelection() {
  const foldersWithItems = getIftySocialPracticeFolders();
  const validIds = new Set(foldersWithItems.map(folder => String(folder.id)));
  iftySocialPracticeSelectedFolderIds = new Set(
    [...iftySocialPracticeSelectedFolderIds].filter(id => validIds.has(String(id)))
  );
  if (!iftySocialPracticeSelectionInitialized) {
    foldersWithItems.forEach(folder => iftySocialPracticeSelectedFolderIds.add(String(folder.id)));
    iftySocialPracticeSelectionInitialized = true;
  }
}

function getIftySocialPracticeSelectedFolders() {
  ensureIftySocialPracticeFolderSelection();
  return getIftySocialPracticeFolders().filter(folder => iftySocialPracticeSelectedFolderIds.has(String(folder.id)));
}

function getIftySocialPracticeItems() {
  return getIftySocialPracticeSelectedFolders().flatMap(folder => (folder.items || [])
    .filter(item => String(item?.title || item?.topic || '').trim())
    .map(item => ({ folder, item })));
}

function getIftySocialPracticeImageItems() {
  return getIftySocialPracticeItems().filter(ref => !!normalizeIftySocialImageData(ref.item.imageData));
}

function findIftySocialPracticeItemById(itemId) {
  const target = String(itemId || '');
  for (const folder of getIftySocialModule().folders || []) {
    const item = (folder.items || []).find(row => String(row?.id || '') === target);
    if (item) return { folder, item };
  }
  return null;
}

window.startIftySocialFlashcards = function(direction = 'front', random = true) {
  const refs = getIftySocialPracticeItems().filter(ref =>
    String(ref.item?.title || ref.item?.topic || '').trim() &&
    String(ref.item?.memoryText || '').trim()
  );
  if (!refs.length) {
    alert('フラッシュカードに使える社会用語がありません。');
    return;
  }
  closePracticeModal();
  currentFlashcardMode = 'social';
  cardMode = direction === 'back' ? 'back' : 'front';
  isRandomMode = random !== false;
  flashcardList = refs.map(ref => ({
    id: String(ref.item.id || ''),
    word: String(ref.item.title || ref.item.topic || '').trim(),
    meanings: [String(ref.item.memoryText || '').trim()],
    mastery: ref.item.mastery || 'unfixed',
    language: '日本語',
    languageCode: 'ja',
    __iftySocialFlashcard: true,
    __iftySocialItemId: String(ref.item.id || '')
  }));
  if (isRandomMode) flashcardList = shuffleArray(flashcardList);
  currentFlashcardIndex = 0;
  isCardFlipped = false;
  renderFlashcardModal();
};

function getIftySocialPracticeModeMeta(mode) {
  const meta = {
    simple: {
      title: 'シンプル',
      description: '用語→説明、または説明→用語。保存済みデータだけで出題します。',
      color: '#2563eb'
    },
    era: {
      title: '時代',
      description: '用語→時代、または時代→用語。正解が複数になる問題にも対応します。',
      color: '#7c3aed'
    },
    order: {
      title: '並べ替え',
      description: '用語に関係する出来事を、古いものから順に並べます。',
      color: '#d97706'
    },
    explanation: {
      title: '説明',
      description: '提示された用語を、指定された語句を使って説明します。ALLIAが採点します。',
      color: '#059669'
    },
    image: {
      title: '画像関連',
      description: '画像から用語を答える、または用語から正しい画像を選びます。',
      color: '#db2777'
    }
  };
  return meta[mode] || { title: 'PRACTICE', description: '', color: '#334155' };
}

function resetIftySocialPracticeAnswerState() {
  iftySocialPracticeState.answered = false;
  iftySocialPracticeState.selectedIds = [];
  iftySocialPracticeState.orderIds = [];
  iftySocialPracticeState.grading = false;
  iftySocialPracticeState.feedback = '';
  iftySocialPracticeState.score = null;
  iftySocialPracticeState.modelAnswer = '';
  iftySocialPracticeState.answerText = '';
}

window.openIftySocialPractice = function() {
  currentIftySubject = 'SOCIAL STUDIES';
  window.closeIftySideMenu();
  ensureIftySocialPracticeFolderSelection();
  window.openPracticeHome('SOCIAL STUDIES');
};

window.toggleIftySocialPracticeFolder = function(folderId, checked) {
  iftySocialPracticeSelectionInitialized = true;
  const id = String(folderId || '');
  if (checked) iftySocialPracticeSelectedFolderIds.add(id);
  else iftySocialPracticeSelectedFolderIds.delete(id);
  const practiceModal = document.getElementById('practiceModal');
  if (practiceModal && practiceModal.style.display !== 'none') renderPracticeHome();
  else renderIftySocialPracticeHome();
};

window.selectAllIftySocialPracticeFolders = function(selected) {
  iftySocialPracticeSelectionInitialized = true;
  iftySocialPracticeSelectedFolderIds.clear();
  if (selected) getIftySocialPracticeFolders().forEach(folder => iftySocialPracticeSelectedFolderIds.add(String(folder.id)));
  const practiceModal = document.getElementById('practiceModal');
  if (practiceModal && practiceModal.style.display !== 'none') renderPracticeHome();
  else renderIftySocialPracticeHome();
};

window.setIftySocialPracticeQuestionCount = function(value) {
  const count = Number(value);
  iftySocialPracticeQuestionCount = [5, 10].includes(count) ? count : 5;
  const practiceModal = document.getElementById('practiceModal');
  if (practiceModal && practiceModal.style.display !== 'none') renderPracticeHome();
  else renderIftySocialPracticeHome();
};

function renderIftySocialPracticeHome() {
  currentIftySubject = 'SOCIAL STUDIES';
  const foldersWithItems = getIftySocialPracticeFolders();
  ensureIftySocialPracticeFolderSelection();
  const selectedFolders = getIftySocialPracticeSelectedFolders();
  const selectedItems = getIftySocialPracticeItems();
  const imageItems = getIftySocialPracticeImageItems();
  const selectedSubjects = [...new Set(selectedFolders.flatMap(folder => normalizeIftySocialSubjects(folder.subjects)))]
    .map(getIftySocialSubjectLabel);

  const folderChoices = foldersWithItems.length
    ? foldersWithItems.map(folder => {
        const checked = iftySocialPracticeSelectedFolderIds.has(String(folder.id));
        return `<label style="display:flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid ${checked ? '#38bdf8' : '#cbd5e1'};border-radius:9px;background:${checked ? '#f0f9ff' : '#fff'};cursor:pointer;min-width:0;">
          <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleIftySocialPracticeFolder('${folder.id}',this.checked)">
          <span style="font-weight:900;color:#0f172a;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(folder.name)}</span>
          <span style="font-size:.72em;color:#64748b;white-space:nowrap;">${folder.items.length}件</span>
        </label>`;
      }).join('')
    : '<div style="color:#94a3b8;padding:10px 0;">項目のある社会フォルダがありません。</div>';

  const modeCard = mode => {
    const meta = getIftySocialPracticeModeMeta(mode);
    let disabledReason = '';
    if (mode === 'image' && imageItems.length < 2) disabledReason = '画像付き項目が2件以上必要です。';
    else if (mode === 'simple' && selectedItems.length < 2) disabledReason = '項目が2件以上必要です。';
    else if (!selectedItems.length) disabledReason = '学習する項目を選択してください。';
    const disabled = !!disabledReason;
    return `<button type="button" onclick="startIftySocialPractice('${mode}')" ${disabled ? 'disabled' : ''} style="text-align:left;border:1px solid ${disabled ? '#e2e8f0' : meta.color};background:${disabled ? '#f8fafc' : '#fff'};border-radius:12px;padding:14px;cursor:${disabled ? 'not-allowed' : 'pointer'};min-height:126px;opacity:${disabled ? '.62' : '1'};">
      <div style="font-size:1.08em;font-weight:900;color:${disabled ? '#94a3b8' : meta.color};">${escapeHtml(meta.title)}</div>
      <div style="margin-top:7px;color:#475569;font-size:.84em;line-height:1.55;">${escapeHtml(meta.description)}</div>
      ${disabledReason ? `<div style="margin-top:8px;font-size:.72em;color:#94a3b8;font-weight:800;">${escapeHtml(disabledReason)}</div>` : ''}
    </button>`;
  };

  showIftyHubContent(`
    <section class="ifty-portal-shell">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <h1 class="ifty-portal-title">SOCIAL STUDIES / PRACTICE</h1>
          <div class="ifty-portal-subtitle">社会専用の5種類の問題で、登録した用語を確認します。</div>
        </div>
        <button class="ifty-portal-back" type="button" onclick="renderIftySocialStudiesPage()">SOCIAL STUDIESへ戻る</button>
      </div>

      <div style="margin-top:14px;padding:13px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
          <div>
            <div style="font-weight:900;color:#0f172a;">出題するフォルダ</div>
            <div style="font-size:.76em;color:#64748b;margin-top:3px;">選択 ${selectedFolders.length}フォルダ / ${selectedItems.length}項目${selectedSubjects.length ? ` ・ ${escapeHtml(selectedSubjects.join('・'))}` : ''}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" onclick="selectAllIftySocialPracticeFolders(true)" style="border:none;background:#e0f2fe;color:#075985;border-radius:7px;padding:7px 9px;font-weight:900;cursor:pointer;">すべて</button>
            <button type="button" onclick="selectAllIftySocialPracticeFolders(false)" style="border:none;background:#e2e8f0;color:#475569;border-radius:7px;padding:7px 9px;font-weight:900;cursor:pointer;">解除</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:7px;margin-top:10px;">${folderChoices}</div>
      </div>

      <div style="margin-top:12px;padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;display:flex;align-items:center;gap:9px;flex-wrap:wrap;">
        <strong style="color:#334155;">問題数</strong>
        <select onchange="setIftySocialPracticeQuestionCount(this.value)" style="padding:8px 10px;border:1px solid #94a3b8;border-radius:7px;background:white;font-size:1em;">
          <option value="5" ${iftySocialPracticeQuestionCount === 5 ? 'selected' : ''}>5問</option>
          <option value="10" ${iftySocialPracticeQuestionCount === 10 ? 'selected' : ''}>10問</option>
        </select>
        <span style="font-size:.74em;color:#64748b;">時代・並べ替え・説明は開始時にALLIAが問題を作ります。</span>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:14px;">
        ${modeCard('simple')}
        ${modeCard('era')}
        ${modeCard('order')}
        ${modeCard('explanation')}
        ${modeCard('image')}
      </div>
    </section>
  `, 'social-practice');
}

function makeIftySocialPracticeSimpleQuestions(items, requestedCount) {
  const refs = items.filter(ref => String(ref.item.title || '').trim() && String(ref.item.memoryText || '').trim());
  if (refs.length < 2) return [];
  const targets = shuffleArray(refs).slice(0, Math.min(requestedCount, refs.length));
  return targets.map((targetRef, index) => {
    const direction = index % 2 === 0 ? 'term_to_description' : 'description_to_term';
    const target = targetRef.item;
    const targetLabel = direction === 'term_to_description' ? target.memoryText : target.title;
    const seen = new Set([String(targetLabel).trim().toLowerCase()]);
    const distractors = [];
    for (const ref of shuffleArray(refs.filter(ref => String(ref.item.id) !== String(target.id)))) {
      const label = direction === 'term_to_description' ? String(ref.item.memoryText || '').trim() : String(ref.item.title || '').trim();
      const key = label.toLowerCase();
      if (!label || seen.has(key)) continue;
      seen.add(key);
      distractors.push({ id: String(ref.item.id), itemId: String(ref.item.id), label });
      if (distractors.length >= 3) break;
    }
    const options = shuffleArray([
      { id: String(target.id), itemId: String(target.id), label: String(targetLabel) },
      ...distractors
    ]);
    return {
      id: `simple_${index}_${String(target.id)}`,
      type: 'simple',
      direction,
      prompt: direction === 'term_to_description'
        ? `「${target.title}」の説明として最も適切なものを選べ。`
        : '次の説明に当てはまる用語を選べ。',
      sourceText: direction === 'description_to_term' ? target.memoryText : '',
      targetItemId: String(target.id),
      options,
      correctIds: [String(target.id)],
      explanation: target.memoryText
    };
  }).filter(question => question.options.length >= 2);
}

function makeIftySocialPracticeImageQuestions(items, requestedCount) {
  const refs = items.filter(ref => !!normalizeIftySocialImageData(ref.item.imageData) && String(ref.item.title || '').trim());
  if (refs.length < 2) return [];
  const targets = shuffleArray(refs).slice(0, Math.min(requestedCount, refs.length));
  return targets.map((targetRef, index) => {
    const target = targetRef.item;
    const direction = index % 2 === 0 ? 'image_to_text' : 'text_to_image';
    let optionPool = refs;
    let labelField = 'title';
    let prompt = '';

    if (direction === 'image_to_text') {
      const workTitleRefs = refs.filter(ref => String(ref.item.workTitle || '').trim());
      const focusRefs = refs.filter(ref => String(ref.item.imageFocus || '').trim());
      if (String(target.workTitle || '').trim() && workTitleRefs.length >= 2) {
        optionPool = workTitleRefs;
        labelField = 'workTitle';
        prompt = 'この画像の作品名・建築名・史料名として最も適切なものを選べ。';
      } else if (String(target.imageFocus || '').trim() && focusRefs.length >= 2) {
        optionPool = focusRefs;
        labelField = 'imageFocus';
        prompt = 'この画像から押さえるべき内容として最も適切なものを選べ。';
      } else {
        prompt = 'この画像に最も対応する用語を選べ。';
      }
    } else {
      prompt = `「${target.title}」に対応する画像を選べ。`;
    }

    const candidatePool = optionPool.some(ref => String(ref.item.id) === String(target.id)) ? optionPool : refs;
    const others = shuffleArray(candidatePool.filter(ref => String(ref.item.id) !== String(target.id))).slice(0, 3);
    const optionRefs = shuffleArray([targetRef, ...others]);
    return {
      id: `image_${index}_${String(target.id)}`,
      type: 'image',
      direction,
      prompt,
      targetItemId: String(target.id),
      imageItemId: direction === 'image_to_text' ? String(target.id) : '',
      options: optionRefs.map(ref => ({
        id: String(ref.item.id),
        itemId: String(ref.item.id),
        label: direction === 'image_to_text'
          ? String(ref.item[labelField] || ref.item.title || '').trim()
          : String(ref.item.title || '').trim()
      })).filter(option => direction === 'text_to_image' || option.label),
      correctIds: [String(target.id)],
      explanation: String(target.memoryText || ''),
      imageFocus: String(target.imageFocus || ''),
      workTitle: String(target.workTitle || '')
    };
  }).filter(question => question.options.length >= 2);
}

function serializeIftySocialPracticeItems(items) {
  return items.slice(0, 60).map(ref => ({
    id: String(ref.item.id || ''),
    title: String(ref.item.title || ref.item.topic || '').trim(),
    memoryText: String(ref.item.memoryText || '').trim(),
    keyPoints: Array.isArray(ref.item.keyPoints) ? ref.item.keyPoints.slice(0, 4) : [],
    subjects: normalizeIftySocialSubjects(ref.item.subjects?.length ? ref.item.subjects : ref.folder.subjects)
  })).filter(item => item.id && item.title);
}

function normalizeIftySocialPracticeAiQuestions(mode, rawQuestions) {
  const questions = Array.isArray(rawQuestions) ? rawQuestions : [];
  return questions.map((raw, questionIndex) => {
    const source = raw && typeof raw === 'object' ? raw : {};
    const base = {
      id: `ai_${mode}_${questionIndex}_${Date.now()}`,
      type: mode,
      prompt: String(source.prompt || '').trim(),
      targetItemId: String(source.targetItemId || '').trim(),
      explanation: String(source.explanation || '').trim()
    };

    if (mode === 'era') {
      const originalOptions = Array.isArray(source.options) ? source.options : [];
      const originalCorrect = new Set((Array.isArray(source.correctIds) ? source.correctIds : []).map(value => String(value)));
      const options = originalOptions.map((option, optionIndex) => {
        const originalId = String(option?.id || `opt${optionIndex + 1}`);
        return {
          id: `formula_${questionIndex}_${optionIndex}`,
          originalId,
          label: String(option?.label || '').trim()
        };
      }).filter(option => option.label);
      const correctIds = options.filter(option => originalCorrect.has(option.originalId)).map(option => option.id);
      if (!base.prompt || options.length < 2 || !correctIds.length) return null;
      return { ...base, direction: String(source.direction || ''), options, correctIds };
    }

    if (mode === 'order') {
      const originalEvents = Array.isArray(source.events) ? source.events : [];
      const originalCorrectOrder = (Array.isArray(source.correctOrder) ? source.correctOrder : []).map(value => String(value));
      const events = originalEvents.map((event, eventIndex) => ({
        id: `order_${questionIndex}_${eventIndex}`,
        originalId: String(event?.id || `event${eventIndex + 1}`),
        text: String(event?.text || '').trim()
      })).filter(event => event.text);
      const byOriginal = new Map(events.map(event => [event.originalId, event.id]));
      const correctOrder = originalCorrectOrder.map(id => byOriginal.get(id)).filter(Boolean);
      if (!base.prompt || events.length < 3 || correctOrder.length !== events.length) return null;
      return { ...base, events: shuffleArray(events), correctOrder };
    }

    if (mode === 'explanation') {
      const requiredTerms = [...new Set((Array.isArray(source.requiredTerms) ? source.requiredTerms : [])
        .map(value => String(value || '').trim()).filter(Boolean))].slice(0, 5);
      const referenceAnswer = String(source.referenceAnswer || '').trim();
      const gradingPoints = (Array.isArray(source.gradingPoints) ? source.gradingPoints : [])
        .map(value => String(value || '').trim()).filter(Boolean).slice(0, 5);
      if (!base.prompt || !requiredTerms.length || !referenceAnswer) return null;
      return { ...base, requiredTerms, referenceAnswer, gradingPoints };
    }

    return null;
  }).filter(Boolean);
}

function renderIftySocialPracticeLoading(mode) {
  const meta = getIftySocialPracticeModeMeta(mode);
  showIftyHubContent(`
    <section class="ifty-portal-shell">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div>
          <h1 class="ifty-portal-title">${escapeHtml(meta.title)}</h1>
          <div class="ifty-portal-subtitle">ALLIAが社会PRACTICE用の問題を作成しています。</div>
        </div>
        <button class="ifty-portal-back" type="button" onclick="openIftySocialPractice()">PRACTICEへ戻る</button>
      </div>
      <div style="margin-top:20px;padding:28px;border:1px solid #ddd6fe;border-radius:12px;background:#faf5ff;text-align:center;">
        <div style="font-size:1.15em;font-weight:900;color:#6d28d9;">問題を生成中…</div>
        <div style="margin-top:7px;color:#64748b;font-size:.82em;">登録済みの用語と社会のORDERを使っています。</div>
      </div>
    </section>
  `, 'social-practice');
}

window.startIftySocialPractice = async function(mode) {
  const normalizedMode = ['simple', 'era', 'order', 'explanation', 'image'].includes(mode) ? mode : 'simple';
  const items = getIftySocialPracticeItems();
  if (!items.length) {
    alert('出題するフォルダを選択してください。');
    return;
  }

  let questions = [];
  if (normalizedMode === 'simple') {
    questions = makeIftySocialPracticeSimpleQuestions(items, iftySocialPracticeQuestionCount);
  } else if (normalizedMode === 'image') {
    questions = makeIftySocialPracticeImageQuestions(items, iftySocialPracticeQuestionCount);
  } else {
    if (!ensureIftyOnline('社会PRACTICE問題生成')) return;
    renderIftySocialPracticeLoading(normalizedMode);
    try {
      const selectedFolders = getIftySocialPracticeSelectedFolders();
      const subjects = [...new Set(selectedFolders.flatMap(folder => normalizeIftySocialSubjects(folder.subjects)))];
      const response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'social_practice_generate',
          mode: normalizedMode,
          count: iftySocialPracticeQuestionCount,
          items: serializeIftySocialPracticeItems(items),
          subjects,
          subject: 'SOCIAL STUDIES',
          order: getIftySubjectOrder('SOCIAL STUDIES')
        })
      });
      const data = await response.json();
      if (!response.ok) throw alliaHttpError(response, data, '社会PRACTICEの問題生成に失敗しました。');
      questions = normalizeIftySocialPracticeAiQuestions(normalizedMode, data.questions);
    } catch (error) {
      console.error('社会PRACTICE問題生成エラー:', error);
      alert(String(error.message || error));
      window.openPracticeHome('SOCIAL STUDIES');
      return;
    }
  }

  if (!questions.length) {
    alert(normalizedMode === 'image'
      ? '画像付き項目が2件以上必要です。'
      : 'この条件では問題を作れませんでした。別のフォルダを選ぶか、項目を増やしてください。');
    window.openPracticeHome('SOCIAL STUDIES');
    return;
  }

  iftySocialPracticeState = {
    mode: normalizedMode,
    questions,
    index: 0,
    correct: 0,
    wrong: 0,
    answered: false,
    selectedIds: [],
    orderIds: normalizedMode === 'order' ? questions[0].events.map(event => event.id) : [],
    grading: false,
    feedback: '',
    score: null,
    modelAnswer: '',
    answerText: ''
  };
  renderIftySocialPracticePlayer();
};

function getCurrentIftySocialPracticeQuestion() {
  return iftySocialPracticeState.questions[iftySocialPracticeState.index] || null;
}

function renderIftySocialPracticeResult() {
  const state = iftySocialPracticeState;
  const total = state.correct + state.wrong;
  const rate = total ? Math.round((state.correct / total) * 100) : 0;
  const meta = getIftySocialPracticeModeMeta(state.mode);
  showIftyHubContent(`
    <section class="ifty-portal-shell">
      <div style="text-align:center;padding:28px 8px;">
        <div style="font-size:1.4em;font-weight:900;color:${meta.color};">${escapeHtml(meta.title)} 完了</div>
        <div style="margin-top:12px;color:#334155;font-size:1.05em;">正解 ${state.correct} / ${total}　正答率 ${rate}%</div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:18px;">
          <button type="button" onclick="startIftySocialPractice('${state.mode}')" style="border:none;background:${meta.color};color:white;border-radius:8px;padding:10px 15px;font-weight:900;cursor:pointer;">もう一度</button>
          <button type="button" onclick="openIftySocialPractice()" data-ifty-enter-primary="true" style="border:none;background:#334155;color:white;border-radius:8px;padding:10px 15px;font-weight:900;cursor:pointer;">PRACTICEへ戻る</button>
        </div>
      </div>
    </section>
  `, 'social-practice');
}

function renderIftySocialPracticeChoiceQuestion(question) {
  const state = iftySocialPracticeState;
  const isEra = state.mode === 'era';
  const isImage = state.mode === 'image';
  const targetRef = question.targetItemId ? getIftySocialItemById(question.targetItemId) : null;
  const imageRef = question.imageItemId ? getIftySocialItemById(question.imageItemId) : null;

  const promptVisual = isImage && question.direction === 'image_to_text' && imageRef?.item?.imageData
    ? `<div style="margin-top:12px;text-align:center;"><img src="${imageRef.item.imageData}" alt="問題画像" style="max-width:100%;max-height:330px;object-fit:contain;border:1px solid #e2e8f0;border-radius:10px;background:white;"></div>`
    : '';
  const sourceText = question.sourceText
    ? `<div style="margin-top:12px;padding:12px;border:1px solid #dbeafe;border-radius:10px;background:#f8fbff;color:#0f172a;line-height:1.65;">${escapeHtml(question.sourceText)}</div>`
    : '';

  const optionHtml = (question.options || []).map(option => {
    const selected = state.selectedIds.includes(String(option.id));
    const correct = (question.correctIds || []).includes(String(option.id));
    let border = selected ? '#0ea5e9' : '#cbd5e1';
    let bg = selected ? '#f0f9ff' : '#fff';
    let color = '#0f172a';
    if (state.answered && correct) { border = '#22c55e'; bg = '#f0fdf4'; color = '#166534'; }
    else if (state.answered && selected && !correct) { border = '#f43f5e'; bg = '#fff1f2'; color = '#9f1239'; }

    if (isImage && question.direction === 'text_to_image') {
      const ref = getIftySocialItemById(option.itemId || option.id);
      const imageData = ref?.item?.imageData || '';
      return `<button type="button" ${state.answered ? 'disabled' : ''} data-ifty-enter-ignore="true" onclick="answerIftySocialPracticeChoice('${option.id}')" style="border:3px solid ${border};background:${bg};border-radius:10px;padding:7px;cursor:${state.answered ? 'default' : 'pointer'};min-width:0;">
        <img src="${imageData}" alt="選択肢画像" style="display:block;width:100%;height:170px;object-fit:contain;background:white;border-radius:6px;">
      </button>`;
    }

    return `<button type="button" ${state.answered ? 'disabled' : ''} data-ifty-enter-ignore="true" onclick="${isEra ? `toggleIftySocialPracticeEraChoice('${option.id}')` : `answerIftySocialPracticeChoice('${option.id}')`}" style="border:2px solid ${border};background:${bg};color:${color};border-radius:9px;padding:11px;text-align:left;font-weight:800;line-height:1.5;cursor:${state.answered ? 'default' : 'pointer'};">${escapeHtml(option.label)}</button>`;
  }).join('');

  const allCorrect = state.answered && arraysAsSetsEqual(state.selectedIds, question.correctIds || []);
  const feedback = state.answered ? `
    <div style="margin-top:13px;padding:11px;border-radius:9px;background:${allCorrect ? '#ecfdf5' : '#fff1f2'};border:1px solid ${allCorrect ? '#86efac' : '#fda4af'};">
      <div style="font-weight:900;color:${allCorrect ? '#166534' : '#9f1239'};">${allCorrect ? '正解' : '不正解'}</div>
      ${question.explanation ? `<div style="margin-top:6px;color:#475569;line-height:1.6;">${escapeHtml(question.explanation)}</div>` : ''}
      ${isImage && targetRef?.item?.workTitle ? `<div style="margin-top:5px;color:#581c87;font-size:.85em;"><strong>図・装置・資料名：</strong>${escapeHtml(targetRef.item.workTitle)}</div>` : ''}
      ${isImage && targetRef?.item?.imageFocus ? `<div style="margin-top:5px;color:#3b0764;font-size:.85em;"><strong>画像の核：</strong>${escapeHtml(targetRef.item.imageFocus)}</div>` : ''}
      <div style="margin-top:10px;text-align:right;"><button type="button" onclick="nextIftySocialPracticeQuestion()" data-ifty-enter-primary="true" style="border:none;background:#0f766e;color:white;border-radius:8px;padding:8px 13px;font-weight:900;cursor:pointer;">次へ</button></div>
    </div>` : '';

  return `
    <div style="font-size:1.03em;font-weight:900;color:#0f172a;line-height:1.55;">${escapeHtml(question.prompt)}</div>
    ${promptVisual}
    ${sourceText}
    ${isEra && !state.answered ? '<div style="margin-top:7px;color:#7c3aed;font-size:.76em;font-weight:800;">正しいものをすべて選択してください。複数正解の場合があります。</div>' : ''}
    <div style="display:grid;grid-template-columns:${isImage && question.direction === 'text_to_image' ? 'repeat(2,minmax(0,1fr))' : 'repeat(auto-fit,minmax(220px,1fr))'};gap:8px;margin-top:12px;">${optionHtml}</div>
    ${isEra && !state.answered ? `<div style="text-align:right;margin-top:11px;"><button type="button" onclick="submitIftySocialPracticeEra()" ${state.selectedIds.length ? '' : 'disabled'} style="border:none;background:${state.selectedIds.length ? '#7c3aed' : '#cbd5e1'};color:white;border-radius:8px;padding:9px 14px;font-weight:900;cursor:${state.selectedIds.length ? 'pointer' : 'not-allowed'};">回答する</button></div>` : ''}
    ${feedback}`;
}

function arraysAsSetsEqual(a, b) {
  const left = [...new Set((Array.isArray(a) ? a : []).map(String))].sort();
  const right = [...new Set((Array.isArray(b) ? b : []).map(String))].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function renderIftySocialPracticeOrderQuestion(question) {
  const state = iftySocialPracticeState;
  if (!state.orderIds.length) state.orderIds = (question.events || []).map(event => event.id);
  const eventMap = new Map((question.events || []).map(event => [String(event.id), event]));
  const rows = state.orderIds.map((id, index) => {
    const event = eventMap.get(String(id));
    if (!event) return '';
    const correctPosition = state.answered ? (question.correctOrder || []).indexOf(String(id)) : -1;
    const isCorrectPosition = state.answered && correctPosition === index;
    return `<div style="display:grid;grid-template-columns:34px 1fr auto;gap:8px;align-items:center;padding:9px;border:1px solid ${state.answered ? (isCorrectPosition ? '#86efac' : '#fda4af') : '#cbd5e1'};background:${state.answered ? (isCorrectPosition ? '#f0fdf4' : '#fff1f2') : '#fff'};border-radius:9px;">
      <div style="font-weight:900;color:#64748b;text-align:center;">${index + 1}</div>
      <div style="color:#0f172a;line-height:1.5;">${escapeHtml(event.text)}</div>
      ${state.answered ? '' : `<div style="display:flex;gap:4px;">
        <button type="button" data-ifty-enter-ignore="true" onclick="moveIftySocialPracticeOrder(${index},-1)" ${index === 0 ? 'disabled' : ''} style="border:none;background:#e2e8f0;border-radius:6px;width:34px;height:34px;cursor:${index === 0 ? 'not-allowed' : 'pointer'};">↑</button>
        <button type="button" data-ifty-enter-ignore="true" onclick="moveIftySocialPracticeOrder(${index},1)" ${index === state.orderIds.length - 1 ? 'disabled' : ''} style="border:none;background:#e2e8f0;border-radius:6px;width:34px;height:34px;cursor:${index === state.orderIds.length - 1 ? 'not-allowed' : 'pointer'};">↓</button>
      </div>`}
    </div>`;
  }).join('');
  const correct = state.answered && arraysAsSetsEqual(state.orderIds, question.correctOrder || []) && state.orderIds.every((id, index) => String(id) === String(question.correctOrder[index]));
  return `
    <div style="font-size:1.03em;font-weight:900;color:#0f172a;line-height:1.55;">${escapeHtml(question.prompt)}</div>
    <div style="margin-top:7px;color:#64748b;font-size:.76em;">科学的に正しい過程・因果・手順の順に並べてください。</div>
    <div style="display:grid;gap:7px;margin-top:12px;">${rows}</div>
    ${state.answered ? `<div style="margin-top:12px;padding:11px;border-radius:9px;background:${correct ? '#ecfdf5' : '#fff1f2'};border:1px solid ${correct ? '#86efac' : '#fda4af'};">
      <div style="font-weight:900;color:${correct ? '#166534' : '#9f1239'};">${correct ? '正解' : '不正解'}</div>
      ${question.explanation ? `<div style="margin-top:6px;color:#475569;line-height:1.6;">${escapeHtml(question.explanation)}</div>` : ''}
      ${!correct ? `<div style="margin-top:8px;color:#334155;font-size:.84em;"><strong>正しい順：</strong>${(question.correctOrder || []).map((id, i) => `${i + 1}. ${escapeHtml(eventMap.get(String(id))?.text || '')}`).join(' → ')}</div>` : ''}
      <div style="margin-top:10px;text-align:right;"><button type="button" onclick="nextIftySocialPracticeQuestion()" data-ifty-enter-primary="true" style="border:none;background:#0f766e;color:white;border-radius:8px;padding:8px 13px;font-weight:900;cursor:pointer;">次へ</button></div>
    </div>` : `<div style="text-align:right;margin-top:11px;"><button type="button" onclick="submitIftySocialPracticeOrder()" style="border:none;background:#d97706;color:white;border-radius:8px;padding:9px 14px;font-weight:900;cursor:pointer;">回答する</button></div>`}`;
}

function renderIftySocialPracticeExplanationQuestion(question) {
  const state = iftySocialPracticeState;
  const required = (question.requiredTerms || []).map(term => `<span style="display:inline-block;padding:5px 8px;border-radius:999px;background:#dcfce7;color:#166534;font-weight:900;font-size:.82em;">${escapeHtml(term)}</span>`).join(' ');
  return `
    <div style="font-size:1.03em;font-weight:900;color:#0f172a;line-height:1.55;">${escapeHtml(question.prompt)}</div>
    <div style="margin-top:10px;padding:10px;border:1px solid #bbf7d0;border-radius:9px;background:#f0fdf4;">
      <div style="font-size:.76em;color:#166534;font-weight:900;margin-bottom:6px;">必ず使う語句</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">${required}</div>
    </div>
    ${state.answered ? `<div style="margin-top:12px;padding:11px;border:1px solid ${state.correctLast ? '#86efac' : '#fda4af'};background:${state.correctLast ? '#ecfdf5' : '#fff1f2'};border-radius:9px;">
      <div style="font-weight:900;color:${state.correctLast ? '#166534' : '#9f1239'};">${state.correctLast ? '正解' : '要復習'}${Number.isFinite(Number(state.score)) ? `　${Math.round(Number(state.score))}点` : ''}</div>
      <div style="margin-top:7px;color:#334155;line-height:1.6;white-space:pre-wrap;">${escapeHtml(state.feedback)}</div>
      ${state.modelAnswer ? `<div style="margin-top:9px;padding:9px;background:white;border:1px solid #d1fae5;border-radius:8px;color:#0f172a;line-height:1.6;"><strong>模範：</strong>${escapeHtml(state.modelAnswer)}</div>` : ''}
      <div style="margin-top:10px;text-align:right;"><button type="button" onclick="nextIftySocialPracticeQuestion()" data-ifty-enter-primary="true" style="border:none;background:#0f766e;color:white;border-radius:8px;padding:8px 13px;font-weight:900;cursor:pointer;">次へ</button></div>
    </div>` : `<div style="margin-top:12px;">
      <textarea id="iftySocialPracticeExplanationInput" placeholder="ここに説明を書く" oninput="iftySocialPracticeState.answerText=this.value" style="width:100%;min-height:150px;box-sizing:border-box;padding:11px;border:1px solid #94a3b8;border-radius:9px;font:inherit;line-height:1.6;resize:vertical;">${escapeHtml(state.answerText || '')}</textarea>
      <div id="iftySocialPracticeGradeStatus" style="min-height:1.2em;margin-top:6px;color:#64748b;font-size:.78em;">${state.grading ? 'ALLIAが採点中…' : 'Ctrl/Cmd + Enterでも回答できます。'}</div>
      <div style="text-align:right;margin-top:7px;"><button type="button" onclick="submitIftySocialPracticeExplanation()" ${state.grading ? 'disabled' : ''} style="border:none;background:${state.grading ? '#94a3b8' : '#059669'};color:white;border-radius:8px;padding:9px 14px;font-weight:900;cursor:${state.grading ? 'wait' : 'pointer'};">${state.grading ? '採点中…' : '回答する'}</button></div>
    </div>`}`;
}

function renderIftySocialPracticePlayer() {
  const state = iftySocialPracticeState;
  if (state.index >= state.questions.length) {
    renderIftySocialPracticeResult();
    return;
  }
  const question = getCurrentIftySocialPracticeQuestion();
  if (!question) {
    state.index += 1;
    renderIftySocialPracticePlayer();
    return;
  }
  const meta = getIftySocialPracticeModeMeta(state.mode);
  let body = '';
  if (state.mode === 'simple' || state.mode === 'era' || state.mode === 'image') body = renderIftySocialPracticeChoiceQuestion(question);
  else if (state.mode === 'order') body = renderIftySocialPracticeOrderQuestion(question);
  else if (state.mode === 'explanation') body = renderIftySocialPracticeExplanationQuestion(question);

  showIftyHubContent(`
    <section class="ifty-portal-shell">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
        <div>
          <h1 class="ifty-portal-title" style="color:${meta.color};">${escapeHtml(meta.title)}</h1>
          <div class="ifty-portal-subtitle">${state.index + 1} / ${state.questions.length}　正解 ${state.correct}　要復習 ${state.wrong}</div>
        </div>
        <button class="ifty-portal-back" type="button" onclick="openIftySocialPractice()">終了</button>
      </div>
      <div style="margin-top:15px;padding:15px;border:1px solid #cbd5e1;border-radius:12px;background:white;">${body}</div>
    </section>
  `, 'social-practice');

  if (state.mode === 'explanation' && !state.answered && !state.grading) {
    const textarea = document.getElementById('iftySocialPracticeExplanationInput');
    if (textarea) {
      textarea.addEventListener('keydown', event => {
        if (event.isComposing) return;
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          window.submitIftySocialPracticeExplanation();
        }
      });
      setTimeout(() => textarea.focus({ preventScroll: true }), 0);
    }
  }
}

window.answerIftySocialPracticeChoice = function(optionId) {
  const state = iftySocialPracticeState;
  const question = getCurrentIftySocialPracticeQuestion();
  if (!question || state.answered) return;
  state.selectedIds = [String(optionId)];
  state.answered = true;
  const correct = arraysAsSetsEqual(state.selectedIds, question.correctIds || []);
  if (correct) state.correct += 1; else state.wrong += 1;
  renderIftySocialPracticePlayer();
};

window.toggleIftySocialPracticeEraChoice = function(optionId) {
  const state = iftySocialPracticeState;
  if (state.answered) return;
  const id = String(optionId);
  if (state.selectedIds.includes(id)) state.selectedIds = state.selectedIds.filter(value => value !== id);
  else state.selectedIds = [...state.selectedIds, id];
  renderIftySocialPracticePlayer();
};

window.submitIftySocialPracticeEra = function() {
  const state = iftySocialPracticeState;
  const question = getCurrentIftySocialPracticeQuestion();
  if (!question || state.answered || !state.selectedIds.length) return;
  state.answered = true;
  const correct = arraysAsSetsEqual(state.selectedIds, question.correctIds || []);
  if (correct) state.correct += 1; else state.wrong += 1;
  renderIftySocialPracticePlayer();
};

window.moveIftySocialPracticeOrder = function(index, direction) {
  const state = iftySocialPracticeState;
  if (state.answered) return;
  const from = Number(index);
  const to = from + Number(direction);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= state.orderIds.length || to >= state.orderIds.length) return;
  [state.orderIds[from], state.orderIds[to]] = [state.orderIds[to], state.orderIds[from]];
  renderIftySocialPracticePlayer();
};

window.submitIftySocialPracticeOrder = function() {
  const state = iftySocialPracticeState;
  const question = getCurrentIftySocialPracticeQuestion();
  if (!question || state.answered) return;
  state.answered = true;
  const correct = state.orderIds.length === (question.correctOrder || []).length
    && state.orderIds.every((id, index) => String(id) === String(question.correctOrder[index]));
  if (correct) state.correct += 1; else state.wrong += 1;
  renderIftySocialPracticePlayer();
};

window.submitIftySocialPracticeExplanation = async function() {
  const state = iftySocialPracticeState;
  const question = getCurrentIftySocialPracticeQuestion();
  if (!question || state.answered || state.grading) return;
  const textarea = document.getElementById('iftySocialPracticeExplanationInput');
  const answer = String(textarea?.value ?? state.answerText ?? '').trim();
  if (!answer) {
    if (textarea) textarea.focus();
    return;
  }
  if (!ensureIftyOnline('社会PRACTICE採点')) return;
  state.answerText = answer;
  state.grading = true;
  const status = document.getElementById('iftySocialPracticeGradeStatus');
  if (status) status.textContent = 'ALLIAが採点中…';
  const button = status?.parentElement?.querySelector('button');
  if (button) button.disabled = true;

  try {
    const target = question.targetItemId ? getIftySocialItemById(question.targetItemId)?.item : null;
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'social_practice_grade',
        question: {
          prompt: question.prompt,
          title: String(target?.title || ''),
          memoryText: String(target?.memoryText || ''),
          formula: String(target?.formula || ''),
          unit: String(target?.unit || ''),
          conditions: String(target?.conditions || ''),
          requiredTerms: question.requiredTerms || [],
          referenceAnswer: question.referenceAnswer || '',
          gradingPoints: question.gradingPoints || []
        },
        answer,
        subject: 'SOCIAL STUDIES',
        order: getIftySubjectOrder('SOCIAL STUDIES')
      })
    });
    const data = await response.json();
    if (!response.ok) throw alliaHttpError(response, data, '社会PRACTICEの採点に失敗しました。');
    state.grading = false;
    state.answered = true;
    state.correctLast = !!data.correct;
    state.score = Number.isFinite(Number(data.score)) ? Number(data.score) : null;
    state.feedback = String(data.feedback || '').trim();
    state.modelAnswer = String(data.modelAnswer || question.referenceAnswer || '').trim();
    if (state.correctLast) state.correct += 1; else state.wrong += 1;
    renderIftySocialPracticePlayer();
  } catch (error) {
    console.error('社会PRACTICE採点エラー:', error);
    state.grading = false;
    const currentStatus = document.getElementById('iftySocialPracticeGradeStatus');
    if (currentStatus) currentStatus.textContent = String(error.message || error);
    const currentButton = currentStatus?.parentElement?.querySelector('button');
    if (currentButton) currentButton.disabled = false;
  }
};

window.nextIftySocialPracticeQuestion = function() {
  const state = iftySocialPracticeState;
  if (!state.answered) return;
  state.index += 1;
  resetIftySocialPracticeAnswerState();
  const nextQuestion = getCurrentIftySocialPracticeQuestion();
  if (state.mode === 'order' && nextQuestion?.events) state.orderIds = nextQuestion.events.map(event => event.id);
  renderIftySocialPracticePlayer();
};


// Q3 STEP47：SCIENCE / 分野別フォルダ + 原理・公式・単位・条件 + 画像資産 + 画像クイズ
// ==========================================
function normalizeIftyScienceSubjects(value) {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source.map(item => String(item || '').trim().toUpperCase()))]
    .filter(key => IFTY_SCIENCE_SUBJECT_KEYS.includes(key));
}

function getIftyScienceSubjectLabel(key) {
  const found = IFTY_SCIENCE_SUBJECTS.find(item => item.key === key);
  return found ? found.label : String(key || '');
}

function normalizeIftyScienceImageData(value) {
  const image = String(value || '').trim();
  return /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(image) ? image : '';
}

function normalizeIftyScienceImageKind(value) {
  const kind = String(value || '').trim().toUpperCase();
  return ['DIAGRAM', 'GRAPH', 'APPARATUS', 'PHOTO', 'TABLE', 'OTHER'].includes(kind) ? kind : '';
}

function getIftyScienceImageKindLabel(kind) {
  const labels = {
    DIAGRAM: '図・模式図',
    GRAPH: 'グラフ',
    APPARATUS: '実験装置',
    PHOTO: '写真',
    TABLE: '表',
    OTHER: 'その他'
  };
  return labels[normalizeIftyScienceImageKind(kind)] || '画像';
}

function buildIftyScienceLegacyMemoryText(value) {
  if (!value || typeof value !== 'object') return '';
  const text = field => String(value[field] || '').trim();
  const direct = text('memoryText');
  if (direct) return direct;
  return text('summary') || text('what') || text('note') || '';
}

function normalizeIftyScienceItem(value) {
  if (!value || typeof value !== 'object') return null;
  const text = field => String(value[field] || '').trim();
  return {
    id: value.id || makeId('scienceitem'),
    topic: text('topic'),
    title: text('title') || text('topic'),
    summary: text('summary'),
    memoryText: buildIftyScienceLegacyMemoryText(value),
    who: text('who'),
    when: text('when'),
    where: text('where'),
    what: text('what'),
    why: text('why'),
    how: text('how'),
    keyPoints: Array.isArray(value.keyPoints) ? value.keyPoints.map(v => String(v || '').trim()).filter(Boolean).slice(0, 12) : [],
    formula: text('formula'),
    unit: text('unit'),
    conditions: text('conditions'),
    subjects: normalizeIftyScienceSubjects(value.subjects),
    imageData: normalizeIftyScienceImageData(value.imageData),
    imageName: text('imageName'),
    imageKind: normalizeIftyScienceImageKind(value.imageKind),
    imageFocus: text('imageFocus'),
    workTitle: text('workTitle'),
    source: String(value.source || 'MANUAL').trim(),
    createdAt: Number(value.createdAt || 0) || Date.now(),
    updatedAt: Number(value.updatedAt || 0) || Date.now()
  };
}

function getIftyScienceModule() {
  normalizePracticeData();
  return practiceData.modules.science;
}

function getIftyScienceFolder(folderId) {
  return getIftyScienceModule().folders.find(folder => folder.id === folderId) || null;
}

function getIftyScienceItemById(itemId) {
  for (const folder of getIftyScienceModule().folders) {
    const item = (folder.items || []).find(entry => String(entry.id) === String(itemId));
    if (item) return { folder, item };
  }
  return null;
}

function countIftyScienceItems() {
  return getIftyScienceModule().folders.reduce((sum, folder) => sum + (Array.isArray(folder.items) ? folder.items.length : 0), 0);
}

function getIftyScienceImageEntries(folderId = '') {
  const module = getIftyScienceModule();
  const foldersToUse = folderId ? module.folders.filter(folder => folder.id === folderId) : module.folders;
  return foldersToUse.flatMap(folder => (folder.items || [])
    .filter(item => !!normalizeIftyScienceImageData(item.imageData))
    .map(item => ({ folder, item })));
}

function renderIftyScienceSubjectBadges(subjects) {
  const normalized = normalizeIftyScienceSubjects(subjects);
  return normalized.map(key => `<span style="display:inline-block;padding:3px 7px;border-radius:999px;background:#e0f2fe;color:#075985;font-size:.72em;font-weight:900;">${escapeHtml(getIftyScienceSubjectLabel(key))}</span>`).join(' ');
}

function formatIftyScienceMathText(value) {
  let text = String(value || '');
  if (!text) return '';

  // Remove common inline-LaTeX wrappers while keeping the content.
  text = text
    .replace(/\\\(/g, '')
    .replace(/\\\)/g, '')
    .replace(/\\\[/g, '')
    .replace(/\\\]/g, '')
    .replace(/\$/g, '');

  // Common symbols used in high-school science.
  const commands = {
    '\\\\times': '×',
    '\\\\cdot': '·',
    '\\\\pm': '±',
    '\\\\mp': '∓',
    '\\\\leq': '≤',
    '\\\\le': '≤',
    '\\\\geq': '≥',
    '\\\\ge': '≥',
    '\\\\neq': '≠',
    '\\\\approx': '≈',
    '\\\\propto': '∝',
    '\\\\rightarrow': '→',
    '\\\\to': '→',
    '\\\\leftrightarrow': '↔',
    '\\\\Delta': 'Δ',
    '\\\\delta': 'δ',
    '\\\\theta': 'θ',
    '\\\\lambda': 'λ',
    '\\\\mu': 'μ',
    '\\\\rho': 'ρ',
    '\\\\sigma': 'σ',
    '\\\\omega': 'ω',
    '\\\\Omega': 'Ω',
    '\\\\alpha': 'α',
    '\\\\beta': 'β',
    '\\\\gamma': 'γ'
  };
  Object.entries(commands).forEach(([from, to]) => {
    text = text.split(from).join(to);
  });

  // Fractions. Prefer familiar single-character fractions when possible.
  const simpleFractions = {
    '1/2': '½',
    '1/3': '⅓',
    '2/3': '⅔',
    '1/4': '¼',
    '3/4': '¾'
  };
  text = text.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, (_, numerator, denominator) => {
    const key = `${String(numerator).trim()}/${String(denominator).trim()}`;
    return simpleFractions[key] || `(${String(numerator).trim()})/(${String(denominator).trim()})`;
  });

  // Roots and simple formatting commands.
  text = text
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, '√($1)')
    .replace(/\\(?:mathrm|text|mathbf|operatorname)\s*\{([^{}]+)\}/g, '$1')
    .replace(/\\left/g, '')
    .replace(/\\right/g, '');

  const superscriptMap = {
    '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹',
    '+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ'
  };
  const subscriptMap = {
    '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉',
    '+':'₊','-':'₋','=':'₌','(':'₍',')':'₎','a':'ₐ','e':'ₑ','h':'ₕ','i':'ᵢ','j':'ⱼ',
    'k':'ₖ','l':'ₗ','m':'ₘ','n':'ₙ','o':'ₒ','p':'ₚ','r':'ᵣ','s':'ₛ','t':'ₜ','u':'ᵤ','v':'ᵥ','x':'ₓ'
  };
  const convertScript = (raw, map, fallbackPrefix) => {
    const chars = [...String(raw || '')];
    if (chars.every(ch => Object.prototype.hasOwnProperty.call(map, ch))) {
      return chars.map(ch => map[ch]).join('');
    }
    return `${fallbackPrefix}${raw}`;
  };

  text = text
    .replace(/\^\{([^{}]+)\}/g, (_, raw) => convertScript(raw, superscriptMap, '^'))
    .replace(/\^([0-9n+\-=()]+)/g, (_, raw) => convertScript(raw, superscriptMap, '^'))
    .replace(/_\{([^{}]+)\}/g, (_, raw) => convertScript(raw, subscriptMap, '_'))
    .replace(/_([0-9a-z+\-=()]+)/g, (_, raw) => convertScript(raw, subscriptMap, '_'));

  // Any unknown LaTeX command is made readable instead of displaying a raw backslash.
  text = text.replace(/\\([A-Za-z]+)/g, '$1');

  return text.replace(/\s{2,}/g, ' ').trim();
}

function renderIftyScienceMemoryText(item) {
  const memoryText = String(item?.memoryText || '').trim();
  if (!memoryText) return '';
  return `<div style="margin-top:10px;border:1px solid #dbeafe;background:#f8fbff;border-radius:9px;padding:10px;">
    <div style="font-size:.76em;color:#0369a1;font-weight:900;">暗記用説明</div>
    <div style="margin-top:5px;color:#0f172a;font-size:.92em;line-height:1.65;white-space:pre-wrap;">${escapeHtml(memoryText)}</div>
  </div>`;
}

function renderIftyScienceVisualAsset(item) {
  const imageData = normalizeIftyScienceImageData(item.imageData);
  if (!imageData) return '';
  return `<div style="margin-top:10px;border:1px solid #d8b4fe;background:#faf5ff;border-radius:10px;padding:9px;display:grid;grid-template-columns:minmax(120px,220px) 1fr;gap:10px;align-items:start;">
    <button type="button" onclick="openIftyScienceImageViewer('${item.id}')" style="border:none;background:transparent;padding:0;cursor:zoom-in;min-width:0;">
      <img src="${imageData}" alt="${escapeHtml(item.imageName || item.title || '理科画像')}" style="display:block;width:100%;max-height:190px;object-fit:contain;border-radius:7px;background:white;border:1px solid #e9d5ff;">
    </button>
    <div style="min-width:0;">
      <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
        <span style="font-size:.72em;font-weight:900;color:#7e22ce;background:#f3e8ff;border-radius:999px;padding:3px 7px;">${escapeHtml(getIftyScienceImageKindLabel(item.imageKind))}</span>
        ${item.workTitle ? `<span style="font-size:.78em;font-weight:900;color:#581c87;">${escapeHtml(formatIftyScienceMathText(item.workTitle))}</span>` : ''}
      </div>
      <div style="margin-top:6px;font-size:.76em;font-weight:900;color:#6b21a8;">画像から押さえる核</div>
      <div style="margin-top:2px;color:#3b0764;font-size:.87em;line-height:1.5;white-space:pre-wrap;">${escapeHtml(formatIftyScienceMathText(item.imageFocus || '—'))}</div>
    </div>
  </div>`;
}

function buildIftyScienceSearchText(folder, item) {
  return [
    folder?.name,
    item?.title,
    item?.topic,
    item?.memoryText,
    item?.formula,
    item?.unit,
    item?.conditions,
    item?.workTitle,
    item?.imageFocus,
    ...(Array.isArray(item?.keyPoints) ? item.keyPoints : []),
    ...(Array.isArray(item?.subjects) ? item.subjects.map(getIftyScienceSubjectLabel) : [])
  ].map(value => String(value || '').trim()).filter(Boolean).join(' ').toLowerCase();
}

function renderIftyScienceItemCard(folder, item) {
  const itemIndex = Math.max(0, (folder.items || []).findIndex(entry => String(entry.id) === String(item.id)));
  const lastIndex = Math.max(0, (folder.items || []).length - 1);
  const searchText = buildIftyScienceSearchText(folder, item);

  return `<article class="ifty-science-item-card" data-folder-id="${escapeHtml(String(folder.id))}" data-ifty-search="${escapeHtml(searchText)}" style="border:1px solid #cbd5e1;border-radius:10px;background:white;padding:12px;margin-top:9px;box-shadow:0 1px 3px rgba(15,23,42,.05);">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
      <div style="min-width:0;flex:1;">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <strong style="font-size:1.08em;color:#0f172a;">${escapeHtml(item.title || item.topic || '無題')}</strong>
          ${renderIftyScienceSubjectBadges(item.subjects.length ? item.subjects : folder.subjects)}
          ${item.source === 'ALLIA' ? '<span style="font-size:.68em;color:#7c3aed;font-weight:900;">ALLIA</span>' : '<span style="font-size:.68em;color:#64748b;font-weight:900;">MANUAL</span>'}
          ${item.imageData ? '<span style="font-size:.68em;color:#7e22ce;font-weight:900;">IMAGE</span>' : ''}
        </div>
      </div>
      <div style="display:flex;gap:5px;flex:none;flex-wrap:wrap;justify-content:flex-end;">
        <button type="button" onclick="moveIftyScienceItem('${folder.id}','${item.id}',-1)" ${itemIndex <= 0 ? 'disabled' : ''} title="上へ" style="border:none;background:${itemIndex <= 0 ? '#cbd5e1' : '#e2e8f0'};color:#334155;border-radius:6px;padding:5px 8px;cursor:${itemIndex <= 0 ? 'not-allowed' : 'pointer'};font-weight:900;">↑</button>
        <button type="button" onclick="moveIftyScienceItem('${folder.id}','${item.id}',1)" ${itemIndex >= lastIndex ? 'disabled' : ''} title="下へ" style="border:none;background:${itemIndex >= lastIndex ? '#cbd5e1' : '#e2e8f0'};color:#334155;border-radius:6px;padding:5px 8px;cursor:${itemIndex >= lastIndex ? 'not-allowed' : 'pointer'};font-weight:900;">↓</button>
        <button type="button" onclick="openIftyScienceItemEditor('${folder.id}','${item.id}')" style="border:none;background:#64748b;color:white;border-radius:6px;padding:5px 8px;cursor:pointer;font-weight:800;">編集</button>
        <button type="button" onclick="deleteIftyScienceItem('${folder.id}','${item.id}')" style="border:none;background:#ef4444;color:white;border-radius:6px;padding:5px 8px;cursor:pointer;font-weight:800;">削除</button>
      </div>
    </div>
    ${renderIftyScienceVisualAsset(item)}
    ${(item.formula || item.unit || item.conditions) ? `<div style="margin-top:10px;padding:10px;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:9px;">
      ${item.formula ? `<div style="font-size:.9em;color:#14532d;"><strong>公式・関係式：</strong><span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(formatIftyScienceMathText(item.formula))}</span></div>` : ''}
      ${item.unit ? `<div style="margin-top:4px;font-size:.85em;color:#166534;"><strong>単位：</strong>${escapeHtml(formatIftyScienceMathText(item.unit))}</div>` : ''}
      ${item.conditions ? `<div style="margin-top:4px;font-size:.85em;color:#166534;"><strong>条件・適用範囲：</strong>${escapeHtml(formatIftyScienceMathText(item.conditions))}</div>` : ''}
    </div>` : ''}
    ${renderIftyScienceMemoryText(item)}
    ${item.keyPoints.length ? `<div style="margin-top:9px;padding:9px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;">
      <div style="font-size:.76em;font-weight:900;color:#475569;margin-bottom:4px;">重要ポイント</div>
      ${item.keyPoints.map(point => `<div style="font-size:.86em;color:#334155;line-height:1.45;">・${escapeHtml(formatIftyScienceMathText(point))}</div>`).join('')}
    </div>` : ''}
  </article>`;
}

window.moveIftyScienceItem = function(folderId, itemId, direction) {
  const folder = getIftyScienceFolder(folderId);
  if (!folder || !Array.isArray(folder.items)) return;
  const index = folder.items.findIndex(item => String(item.id) === String(itemId));
  if (index < 0) return;
  const nextIndex = index + (direction < 0 ? -1 : 1);
  if (nextIndex < 0 || nextIndex >= folder.items.length) return;

  recordUndoState('理科項目並べ替え');
  [folder.items[index], folder.items[nextIndex]] = [folder.items[nextIndex], folder.items[index]];
  folder.items[index].updatedAt = Date.now();
  folder.items[nextIndex].updatedAt = Date.now();
  savePracticeData();
  renderIftySciencePage({ preserveScroll: true });
};

function applyIftyScienceSearchFilters() {
  const globalQuery = String(iftyScienceSearchQuery || '').trim().toLowerCase();
  const cards = [...document.querySelectorAll('.ifty-science-item-card')];
  let visibleCount = 0;
  const folderTotals = {};
  const folderVisible = {};

  cards.forEach(card => {
    const folderId = String(card.dataset.folderId || '');
    const folderQuery = String(iftyScienceFolderSearchQueries[folderId] || '').trim().toLowerCase();
    const searchText = String(card.dataset.iftySearch || '');
    const globalMatch = !globalQuery || searchText.includes(globalQuery);
    const folderMatch = !folderQuery || searchText.includes(folderQuery);
    const matched = globalMatch && folderMatch;

    folderTotals[folderId] = Number(folderTotals[folderId] || 0) + 1;
    if (matched) {
      visibleCount += 1;
      folderVisible[folderId] = Number(folderVisible[folderId] || 0) + 1;
    }
    card.style.display = matched ? '' : 'none';
  });

  const counter = document.getElementById('iftyScienceSearchCount');
  if (counter) {
    counter.textContent = globalQuery
      ? `${visibleCount} / ${cards.length}件表示`
      : `${cards.length}件`;
  }

  Object.keys(folderTotals).forEach(folderId => {
    const counterEl = document.getElementById(`iftyScienceFolderSearchCount_${folderId}`);
    if (!counterEl) return;
    const folderQuery = String(iftyScienceFolderSearchQueries[folderId] || '').trim();
    counterEl.textContent = folderQuery
      ? `${Number(folderVisible[folderId] || 0)} / ${folderTotals[folderId]}件`
      : `${folderTotals[folderId]}件`;
  });
}

window.applyIftyScienceSearch = function(value = null) {
  const input = document.getElementById('iftyScienceSearchInput');
  iftyScienceSearchQuery = String(value ?? input?.value ?? iftyScienceSearchQuery ?? '').trim();
  applyIftyScienceSearchFilters();
};

window.applyIftyScienceFolderSearch = function(folderId, value = null) {
  const id = String(folderId || '');
  const input = document.getElementById(`iftyScienceFolderSearch_${id}`);
  iftyScienceFolderSearchQueries[id] = String(value ?? input?.value ?? iftyScienceFolderSearchQueries[id] ?? '').trim();
  applyIftyScienceSearchFilters();
};

function renderIftySciencePendingImage(folderId) {
  const container = document.getElementById(`iftyScienceImagePreview_${folderId}`);
  if (!container) return;
  const draft = iftyScienceImageDrafts[folderId];
  if (!draft || !draft.storedDataUrl) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  container.style.display = 'flex';
  container.innerHTML = `
    <img src="${draft.storedDataUrl}" alt="添付画像" style="width:74px;height:74px;object-fit:contain;border:1px solid #d8b4fe;border-radius:7px;background:white;">
    <div style="min-width:0;flex:1;">
      <div style="font-size:.78em;font-weight:900;color:#6b21a8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(draft.name || '画像')}</div>
      <div style="font-size:.7em;color:#7c3aed;margin-top:3px;">ALLIAが画像も読み取り、模式図・グラフ・実験装置・観察対象と覚える核を整理します。</div>
    </div>
    <button type="button" onclick="clearIftyScienceImageDraft('${folderId}')" style="border:none;background:#e2e8f0;color:#475569;border-radius:999px;width:28px;height:28px;font-weight:900;cursor:pointer;">×</button>`;
}

function renderIftyScienceVisualQuizBar(folder) {
  const items = Array.isArray(folder?.items) ? folder.items : [];
  const imageCount = items.filter(item => !!item.imageData).length;
  return `<div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-top:7px;padding:8px;border:1px solid #ede9fe;border-radius:8px;background:#fafaff;">
    <span style="font-size:.76em;font-weight:900;color:#6d28d9;">画像クイズ ${imageCount}枚</span>
    <button type="button" onclick="startIftyScienceVisualQuiz('${folder.id}','image_to_text')" ${imageCount < 2 ? 'disabled' : ''} style="border:none;background:${imageCount < 2 ? '#cbd5e1' : '#7c3aed'};color:white;border-radius:7px;padding:6px 9px;font-weight:900;cursor:${imageCount < 2 ? 'not-allowed' : 'pointer'};">画像を見て選ぶ</button>
    <button type="button" onclick="startIftyScienceVisualQuiz('${folder.id}','text_to_image')" ${imageCount < 2 ? 'disabled' : ''} style="border:none;background:${imageCount < 2 ? '#cbd5e1' : '#6d28d9'};color:white;border-radius:7px;padding:6px 9px;font-weight:900;cursor:${imageCount < 2 ? 'not-allowed' : 'pointer'};">画像を選ぶ</button>
    ${imageCount < 2 ? '<span style="font-size:.7em;color:#94a3b8;">2枚以上の画像を登録すると使用できます。</span>' : ''}
  </div>`;
}

function renderIftyScienceItemsHtml(folder) {
  const items = Array.isArray(folder?.items) ? folder.items : [];
  return items.length
    ? items.map(item => renderIftyScienceItemCard(folder, item)).join('')
    : '<div style="margin-top:12px;padding:18px;text-align:center;border:1px dashed #cbd5e1;border-radius:8px;color:#94a3b8;">まだ項目がありません。</div>';
}

function refreshIftyScienceFolderDynamic(folderId) {
  const folder = getIftyScienceFolder(folderId);
  if (!folder) return;

  const title = document.getElementById(`iftyScienceFolderTitle_${folderId}`);
  if (title) title.textContent = `${folder.collapsed ? '▶' : '▼'} 📁 ${folder.name} (${folder.items.length}件)`;

  const quiz = document.getElementById(`iftyScienceVisualQuizBar_${folderId}`);
  if (quiz) quiz.innerHTML = renderIftyScienceVisualQuizBar(folder);

  const items = document.getElementById(`iftyScienceItems_${folderId}`);
  if (items) items.innerHTML = renderIftyScienceItemsHtml(folder);

  const summary = document.getElementById('iftyScienceModuleSummary');
  if (summary) {
    const module = getIftyScienceModule();
    summary.textContent = `フォルダ ${module.folders.length} / 項目 ${countIftyScienceItems()}。画像はクイズ用に圧縮して項目へ保存され、既存のpracticeDataと一緒にクラウド同期・バックアップ対象になります。`;
  }

  applyIftyScienceSearchFilters();
}

function keepIftyScienceTopicFocused(folderId) {
  setTimeout(() => {
    const input = document.getElementById(`iftyScienceTopic_${folderId}`);
    if (input) {
      input.focus({ preventScroll: true });
      const end = input.value.length;
      try { input.setSelectionRange(end, end); } catch (_) {}
    }
  }, 0);
}

function renderIftyScienceFolder(folder) {
  const items = Array.isArray(folder.items) ? folder.items : [];
  const imageCount = items.filter(item => !!item.imageData).length;
  const subjectChecks = IFTY_SCIENCE_SUBJECTS.map(subject => {
    const checked = folder.subjects.includes(subject.key);
    return `<label style="display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border:1px solid ${checked ? '#38bdf8' : '#cbd5e1'};border-radius:999px;background:${checked ? '#f0f9ff' : 'white'};font-size:.76em;font-weight:800;cursor:pointer;">
      <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleIftyScienceFolderSubject('${folder.id}','${subject.key}',this.checked,this)"> ${escapeHtml(subject.label)}
    </label>`;
  }).join('');

  return `<section id="iftyScienceFolder_${folder.id}" style="margin-top:14px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;padding:13px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
      <div style="min-width:0;flex:1;">
        <button id="iftyScienceFolderTitle_${folder.id}" type="button" onclick="toggleIftyScienceFolderCollapse('${folder.id}')" style="border:none;background:transparent;padding:0;cursor:pointer;font-size:1.02em;font-weight:900;color:#0f172a;text-align:left;">${folder.collapsed ? '▶' : '▼'} 📁 ${escapeHtml(folder.name)} (${items.length}件)</button>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;">${subjectChecks}</div>
        <div style="font-size:.72em;color:#64748b;margin-top:5px;">このフォルダでは複数科目を同時選択できます。ALLIA生成時には選択中の科目だけをコンテキストとして送ります。</div>
      </div>
      <button type="button" onclick="deleteIftyScienceFolder('${folder.id}')" style="border:none;background:#ef4444;color:white;border-radius:6px;padding:6px 9px;font-weight:900;cursor:pointer;">フォルダ削除</button>
    </div>

    ${folder.collapsed ? '' : `<div style="margin-top:12px;">
      <div style="display:flex;gap:7px;flex-wrap:wrap;">
        <input id="iftyScienceTopic_${folder.id}" value="${escapeHtml(iftyScienceTopicDrafts[folder.id] || '')}" placeholder="用語・法則・現象・反応・生体機能など（画像だけでも可）" oninput="iftyScienceTopicDrafts['${folder.id}']=this.value" onkeydown="if(event.key==='Enter'){event.preventDefault();generateIftyScienceItem('${folder.id}');}" style="flex:1;min-width:190px;padding:9px;border:1px solid #94a3b8;border-radius:7px;font-size:.95em;">
        <button type="button" onclick="document.getElementById('iftyScienceImageInput_${folder.id}').click()" style="border:1px solid #c084fc;background:#faf5ff;color:#7e22ce;border-radius:7px;padding:9px 12px;font-weight:900;cursor:pointer;">🖼 画像</button>
        <input id="iftyScienceImageInput_${folder.id}" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onchange="handleIftyScienceImageSelect(event,'${folder.id}')" style="display:none;">
        <button type="button" onclick="addBlankIftyScienceItem('${folder.id}')" style="border:1px solid #94a3b8;background:white;color:#334155;border-radius:7px;padding:9px 12px;font-weight:900;cursor:pointer;">白紙</button>
      </div>
      <div id="iftyScienceImagePreview_${folder.id}" style="display:${iftyScienceImageDrafts[folder.id]?.storedDataUrl ? 'flex' : 'none'};align-items:center;gap:8px;margin-top:7px;padding:7px;border:1px solid #e9d5ff;background:#faf5ff;border-radius:8px;"></div>
      <div id="iftyScienceStatus_${folder.id}" style="min-height:1.2em;margin-top:6px;color:#64748b;font-size:.78em;">${Number(iftyScienceGenerationPending[folder.id] || 0) > 0 ? `ALLIA生成中… ${Number(iftyScienceGenerationPending[folder.id] || 0)}件` : ''}</div>
      <div id="iftyScienceVisualQuizBar_${folder.id}">${renderIftyScienceVisualQuizBar(folder)}</div>
      <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:9px;">
        <input id="iftyScienceFolderSearch_${folder.id}" value="${escapeHtml(iftyScienceFolderSearchQueries[folder.id] || '')}" placeholder="🔎 このフォルダ内を検索" oninput="applyIftyScienceFolderSearch('${folder.id}',this.value)" style="flex:1;min-width:180px;padding:8px 9px;border:1px solid #cbd5e1;border-radius:7px;font-size:.86em;">
        <button type="button" onclick="document.getElementById('iftyScienceFolderSearch_${folder.id}').value='';applyIftyScienceFolderSearch('${folder.id}','');" style="border:none;background:#e2e8f0;color:#475569;border-radius:7px;padding:7px 9px;font-size:.8em;font-weight:900;cursor:pointer;">クリア</button>
        <span id="iftyScienceFolderSearchCount_${folder.id}" style="font-size:.72em;color:#64748b;font-weight:800;">${items.length}件</span>
      </div>
      <div id="iftyScienceItems_${folder.id}">${renderIftyScienceItemsHtml(folder)}</div>
    </div>`}
  </section>`;
}

function renderIftySciencePage(options = {}) {
  const preserveScroll = !!options.preserveScroll;
  const preservedScrollY = preserveScroll ? window.scrollY : 0;
  currentIftySubject = 'SCIENCE';
  const module = getIftyScienceModule();
  showIftyHubContent(`
    <section class="ifty-portal-shell">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <h1 class="ifty-portal-title">SCIENCE</h1>
          <div class="ifty-portal-subtitle">物理・化学・生物・地学を、フォルダごとに1つ以上組み合わせて管理。</div>
        </div>
        <button class="ifty-portal-back" type="button" onclick="openIftyHome()">HOMEへ戻る</button>
      </div>

      <div class="ifty-settings-section" style="margin-top:14px;">
        <div class="ifty-settings-row">
          <div>
            <h3>ORDER / ALLIA</h3>
            <div class="ifty-settings-note">${escapeHtml(getIftyOrderStatus('SCIENCE'))}。理科のALLIAは、定義だけでなく原理・因果関係・公式・単位・成立条件・典型実験を、必要なものだけ短く整理します。画像では模式図・グラフ・実験装置・観察写真などから、覚えるべき核を抽出します。</div>
          </div>
          <div style="display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end;">
            <button class="ifty-settings-action" type="button" onclick="openPracticeHome('SCIENCE')" style="background:#0f766e;color:white;">⚔️ PRACTICE</button>
            <button class="ifty-settings-action" type="button" onclick="openIftySubjectOrder('SCIENCE')" style="background:#0284c7;color:white;">ORDERを編集</button>
            <button class="ifty-settings-action" type="button" onclick="openIftySubjectAllia('SCIENCE')" style="background:#7c3aed;color:white;">🤖 ALLIA</button>
          </div>
        </div>
      </div>

      <div style="margin-top:14px;padding:13px;border:1px solid #bae6fd;border-radius:10px;background:#f0f9ff;">
        <div style="font-weight:900;color:#0c4a6e;">新しい理科フォルダ</div>
        <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:9px;align-items:center;">
          <input id="iftyScienceFolderName" placeholder="例：力学 / 酸塩基 / 遺伝 / 地質" onkeydown="if(event.key==='Enter'){event.preventDefault();createIftyScienceFolder();}" style="flex:1;min-width:210px;padding:9px;border:1px solid #7dd3fc;border-radius:7px;font-size:.95em;">
          <button type="button" onclick="createIftyScienceFolder()" style="border:none;background:#0369a1;color:white;border-radius:7px;padding:9px 12px;font-weight:900;cursor:pointer;">作成</button>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px;">
          ${IFTY_SCIENCE_SUBJECTS.map((subject, index) => `<label style="display:inline-flex;align-items:center;gap:4px;font-size:.8em;font-weight:800;"><input id="iftyScienceCreate_${subject.key}" type="checkbox" ${index === 0 ? 'checked' : ''}> ${escapeHtml(subject.label)}</label>`).join('')}
        </div>
      </div>

      <div style="margin-top:12px;padding:10px;border:1px solid #cbd5e1;border-radius:10px;background:white;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input id="iftyScienceSearchInput" value="${escapeHtml(iftyScienceSearchQuery)}" placeholder="🔎 全フォルダから理科の用語・説明・公式・単位を検索" oninput="applyIftyScienceSearch(this.value)" style="flex:1;min-width:220px;padding:9px 10px;border:1px solid #94a3b8;border-radius:8px;font-size:.92em;">
        <button type="button" onclick="document.getElementById('iftyScienceSearchInput').value='';applyIftyScienceSearch('');" style="border:none;background:#e2e8f0;color:#475569;border-radius:7px;padding:8px 10px;font-weight:900;cursor:pointer;">クリア</button>
        <span id="iftyScienceSearchCount" style="font-size:.78em;color:#64748b;font-weight:800;">${countIftyScienceItems()}件</span>
      </div>
      <div id="iftyScienceModuleSummary" style="margin-top:10px;color:#64748b;font-size:.78em;">フォルダ ${module.folders.length} / 項目 ${countIftyScienceItems()}。画像はクイズ用に圧縮して項目へ保存され、既存のpracticeDataと一緒にクラウド同期・バックアップ対象になります。</div>
      <div>${module.folders.length ? module.folders.map(renderIftyScienceFolder).join('') : '<div style="margin-top:16px;padding:28px;text-align:center;border:1px dashed #cbd5e1;border-radius:10px;color:#94a3b8;">理科フォルダを作成してください。</div>'}</div>
    </section>
  `, 'subject');
  module.folders.forEach(folder => renderIftySciencePendingImage(folder.id));
  applyIftyScienceSearchFilters();

  // ALLIA生成完了時の全体再描画でページ先頭へ飛ばないよう、
  // 再描画直前の閲覧位置を同じ位置へ戻す。通常の画面遷移では従来どおり先頭へ移動する。
  if (preserveScroll) {
    const restoreScroll = () => window.scrollTo({ top: preservedScrollY, left: 0, behavior: 'auto' });
    restoreScroll();
    requestAnimationFrame(restoreScroll);
  }
}

window.createIftyScienceFolder = function() {
  const input = document.getElementById('iftyScienceFolderName');
  const name = String(input?.value || '').trim();
  if (!name) {
    alert('フォルダ名を入力してください。');
    return;
  }
  const subjects = IFTY_SCIENCE_SUBJECTS
    .filter(subject => document.getElementById(`iftyScienceCreate_${subject.key}`)?.checked)
    .map(subject => subject.key);
  if (!subjects.length) {
    alert('物理・化学・生物・地学から1つ以上選択してください。');
    return;
  }
  recordUndoState('理科フォルダ作成');
  getIftyScienceModule().folders.push({ id: makeId('sciencefolder'), name, subjects, collapsed: false, items: [] });
  savePracticeData();
  renderIftySciencePage();
};

window.toggleIftyScienceFolderCollapse = function(folderId) {
  const folder = getIftyScienceFolder(folderId);
  if (!folder) return;
  folder.collapsed = !folder.collapsed;
  savePracticeData();
  renderIftySciencePage();
};

window.toggleIftyScienceFolderSubject = function(folderId, subjectKey, checked, checkbox = null) {
  const folder = getIftyScienceFolder(folderId);
  if (!folder || !IFTY_SCIENCE_SUBJECT_KEYS.includes(subjectKey)) return;

  const next = new Set(folder.subjects);
  if (checked) next.add(subjectKey); else next.delete(subjectKey);

  if (!next.size) {
    if (checkbox) checkbox.checked = true;
    alert('少なくとも1科目は選択してください。');
    return;
  }

  recordUndoState('理科フォルダ科目変更');
  folder.subjects = [...next];
  savePracticeData();

  if (checkbox?.parentElement) {
    checkbox.parentElement.style.borderColor = checked ? '#38bdf8' : '#cbd5e1';
    checkbox.parentElement.style.background = checked ? '#f0f9ff' : 'white';
  }
};

window.deleteIftyScienceFolder = function(folderId) {
  const module = getIftyScienceModule();
  const folder = module.folders.find(item => item.id === folderId);
  if (!folder) return;
  if (!confirm(`「${folder.name}」を削除しますか？中の項目も削除されます。`)) return;
  recordUndoState('理科フォルダ削除');
  module.folders = module.folders.filter(item => item.id !== folderId);
  delete iftyScienceTopicDrafts[folderId];
  delete iftyScienceImageDrafts[folderId];
  delete iftyScienceFolderSearchQueries[folderId];
  savePracticeData();
  renderIftySciencePage();
};

function loadIftyImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像を読み込めませんでした。'));
    img.src = dataUrl;
  });
}

async function makeIftyScienceStoredImage(dataUrl, maxSide = 900, maxChars = 240000) {
  const img = await loadIftyImageElement(dataUrl);
  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;
  const largest = Math.max(width, height);
  if (largest > maxSide) {
    const scale = maxSide / largest;
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  for (let pass = 0; pass < 5; pass += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    for (const quality of [0.84, 0.76, 0.68, 0.6, 0.52]) {
      const out = canvas.toDataURL('image/jpeg', quality);
      if (out.length <= maxChars) return out;
    }
    width = Math.max(320, Math.round(width * 0.82));
    height = Math.max(240, Math.round(height * 0.82));
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.5);
}

window.handleIftyScienceImageSelect = async function(event, folderId) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.type && !file.type.startsWith('image/')) {
    alert('画像ファイルを選択してください。');
    event.target.value = '';
    return;
  }
  if (file.size > 14 * 1024 * 1024) {
    alert('画像が大きすぎます。14MB以下の画像を選択してください。');
    event.target.value = '';
    return;
  }

  try {
    const rawDataUrl = await readFileAsDataUrl(file);
    const [aiDataUrl, storedDataUrl] = await Promise.all([
      resizeImageDataUrl(rawDataUrl, 1600),
      makeIftyScienceStoredImage(rawDataUrl)
    ]);
    iftyScienceImageDrafts[folderId] = {
      name: String(file.name || 'image').trim(),
      aiDataUrl,
      storedDataUrl
    };
    renderIftySciencePendingImage(folderId);
    keepIftyScienceTopicFocused(folderId);
  } catch (error) {
    delete iftyScienceImageDrafts[folderId];
    alert(String(error.message || error));
  } finally {
    event.target.value = '';
  }
};

window.clearIftyScienceImageDraft = function(folderId) {
  delete iftyScienceImageDrafts[folderId];
  renderIftySciencePendingImage(folderId);
  keepIftyScienceTopicFocused(folderId);
};

window.generateIftyScienceItem = async function(folderId) {
  const folder = getIftyScienceFolder(folderId);
  const input = document.getElementById(`iftyScienceTopic_${folderId}`);
  // DOMの値を最優先し、再描画直後などinput参照が取れない場合はdraftを使う。
  const topic = String(input?.value ?? iftyScienceTopicDrafts[folderId] ?? '').trim();
  const imageDraft = iftyScienceImageDrafts[folderId] ? { ...iftyScienceImageDrafts[folderId] } : null;

  if (!folder) {
    alert('対象の理科フォルダを取得できませんでした。画面を開き直してください。');
    return;
  }
  // STEP33までは空欄時に無言returnしていたため、ボタンが壊れたように見えた。
  // 用語または画像のどちらかを必須にし、足りない場合は明示する。
  if (!topic && !imageDraft?.aiDataUrl) {
    const status = document.getElementById(`iftyScienceStatus_${folderId}`);
    if (status) status.textContent = '用語を入力するか、画像を添付してください。';
    if (input) {
      input.focus({ preventScroll: true });
      input.style.outline = '2px solid #7c3aed';
      setTimeout(() => { if (input) input.style.outline = ''; }, 1200);
    }
    return;
  }
  if (!ensureIftyOnline('理科データ生成')) return;

  // 送信時点の科目設定を固定する。生成待ちの間にフォルダ設定が変わっても、
  // このリクエスト自体の条件は途中で変えない。
  const requestSubjects = [...folder.subjects];

  // クリック送信でもEnter送信でも、確定した値をここで固定してから空にする。
  // 前の生成完了を待たず、次の用語を続けて入力・送信できる。
  iftyScienceTopicDrafts[folderId] = '';
  if (input) input.value = '';
  delete iftyScienceImageDrafts[folderId];
  renderIftySciencePendingImage(folderId);
  keepIftyScienceTopicFocused(folderId);

  iftyScienceGenerationPending[folderId] = Number(iftyScienceGenerationPending[folderId] || 0) + 1;
  const setPendingStatus = (message = '') => {
    const status = document.getElementById(`iftyScienceStatus_${folderId}`);
    if (!status) return;
    const pending = Number(iftyScienceGenerationPending[folderId] || 0);
    if (message) {
      status.textContent = pending > 0 ? `${message}（残り ${pending}件生成中）` : message;
    } else {
      status.textContent = pending > 0 ? `ALLIA生成中… ${pending}件` : '';
    }
  };
  setPendingStatus(imageDraft?.aiDataUrl ? 'ALLIAが画像と暗記用説明文を作成中…' : 'ALLIAが暗記用説明文を作成中…');

  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'science_generate',
        topic,
        image: imageDraft?.aiDataUrl || '',
        subjects: requestSubjects,
        subject: 'SCIENCE',
        order: getIftySubjectOrder('SCIENCE')
      })
    });
    const data = await response.json();
    if (!response.ok) throw alliaHttpError(response, data, '理科データ生成に失敗しました。');

    // 重要：savePracticeData()/normalizePracticeData() はフォルダオブジェクトを
    // 新しく作り直す。連続生成中に先のリクエストが保存すると、送信開始時に取得した
    // folder参照は古くなるため、必ず完了時点でfolderIdから最新フォルダを取り直す。
    const currentFolder = getIftyScienceFolder(folderId);
    if (!currentFolder) {
      iftyScienceGenerationPending[folderId] = Math.max(0, Number(iftyScienceGenerationPending[folderId] || 0) - 1);
      return;
    }

    recordUndoState('理科項目追加');
    currentFolder.items.push(normalizeIftyScienceItem({
      ...data,
      id: makeId('scienceitem'),
      topic,
      title: topic || String(data.title || '').trim(),
      subjects: requestSubjects,
      imageData: imageDraft?.storedDataUrl || '',
      imageName: imageDraft?.name || '',
      source: 'ALLIA',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }));
    savePracticeData();

    iftyScienceGenerationPending[folderId] = Math.max(0, Number(iftyScienceGenerationPending[folderId] || 0) - 1);
    refreshIftyScienceFolderDynamic(folderId);
    setPendingStatus();
  } catch (error) {
    console.error('理科暗記用説明文生成エラー:', error);
    iftyScienceGenerationPending[folderId] = Math.max(0, Number(iftyScienceGenerationPending[folderId] || 0) - 1);

    // 失敗時だけ、送信した内容を復元する。
    // ただし、その後に入力した新しい内容がある場合は絶対に上書きしない。
    if (!String(iftyScienceTopicDrafts[folderId] || '').trim()) iftyScienceTopicDrafts[folderId] = topic;
    if (!iftyScienceImageDrafts[folderId] && imageDraft) iftyScienceImageDrafts[folderId] = imageDraft;
    const currentInput = document.getElementById(`iftyScienceTopic_${folderId}`);
    if (currentInput && !currentInput.value.trim()) currentInput.value = iftyScienceTopicDrafts[folderId] || '';
    renderIftySciencePendingImage(folderId);
    setPendingStatus(String(error.message || error));
  }
};

window.addBlankIftyScienceItem = function(folderId) {
  const folder = getIftyScienceFolder(folderId);
  if (!folder) return;
  const imageDraft = iftyScienceImageDrafts[folderId] ? { ...iftyScienceImageDrafts[folderId] } : null;
  recordUndoState('理科白紙項目追加');
  const item = normalizeIftyScienceItem({
    id: makeId('scienceitem'),
    subjects: folder.subjects,
    imageData: imageDraft?.storedDataUrl || '',
    imageName: imageDraft?.name || '',
    source: 'MANUAL',
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  folder.items.push(item);
  delete iftyScienceImageDrafts[folderId];
  savePracticeData();
  renderIftySciencePage();
  setTimeout(() => window.openIftyScienceItemEditor(folderId, item.id), 0);
};

function ensureIftyScienceImageViewerModal() {
  let modal = document.getElementById('iftyScienceImageViewerModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'iftyScienceImageViewerModal';
  modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(2,6,23,.82);z-index:12150;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
  modal.innerHTML = '<div id="iftyScienceImageViewerCard" style="width:min(980px,96vw);max-height:94vh;overflow:auto;background:#0f172a;border-radius:12px;padding:12px;box-shadow:0 20px 60px rgba(0,0,0,.4);"></div>';
  modal.addEventListener('click', event => { if (event.target === modal) window.closeIftyScienceImageViewer(); });
  document.body.appendChild(modal);
  return modal;
}

window.openIftyScienceImageViewer = function(itemId) {
  const ref = getIftyScienceItemById(itemId);
  if (!ref?.item?.imageData) return;
  const modal = ensureIftyScienceImageViewerModal();
  const card = document.getElementById('iftyScienceImageViewerCard');
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px;color:white;">
      <div style="font-weight:900;">${escapeHtml(ref.item.workTitle || ref.item.title || '画像')}</div>
      <button type="button" onclick="closeIftyScienceImageViewer()" style="border:none;background:#334155;color:white;border-radius:999px;width:34px;height:34px;font-size:1.2em;cursor:pointer;">×</button>
    </div>
    <img src="${ref.item.imageData}" alt="${escapeHtml(ref.item.imageName || ref.item.title || '理科画像')}" style="display:block;max-width:100%;max-height:78vh;margin:auto;object-fit:contain;background:white;border-radius:8px;">
    ${ref.item.imageFocus ? `<div style="margin-top:9px;color:#e9d5ff;line-height:1.5;white-space:pre-wrap;">${escapeHtml(ref.item.imageFocus)}</div>` : ''}`;
  modal.style.display = 'flex';
};

window.closeIftyScienceImageViewer = function() {
  const modal = document.getElementById('iftyScienceImageViewerModal');
  if (modal) modal.style.display = 'none';
};

function ensureIftyScienceItemModal() {
  let modal = document.getElementById('iftyScienceItemModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'iftyScienceItemModal';
  modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.58);z-index:12050;align-items:center;justify-content:center;padding:14px;box-sizing:border-box;';
  modal.innerHTML = '<div id="iftyScienceItemModalCard" style="width:min(760px,96vw);max-height:92vh;overflow:auto;background:white;border-radius:12px;padding:16px;box-shadow:0 20px 50px rgba(0,0,0,.28);"></div>';
  modal.addEventListener('click', event => { if (event.target === modal) window.closeIftyScienceItemEditor(); });
  document.body.appendChild(modal);
  return modal;
}

function renderIftyScienceEditorImagePreview() {
  const container = document.getElementById('iftyScienceEditImagePreview');
  if (!container) return;
  const imageData = normalizeIftyScienceImageData(iftyScienceEditorImageDraft?.imageData);
  if (!imageData) {
    container.innerHTML = '<div style="padding:12px;border:1px dashed #cbd5e1;border-radius:8px;color:#94a3b8;text-align:center;font-size:.8em;">画像なし</div>';
    return;
  }
  container.innerHTML = `
    <div style="display:flex;gap:9px;align-items:center;padding:8px;border:1px solid #e9d5ff;border-radius:8px;background:#faf5ff;">
      <img src="${imageData}" alt="画像プレビュー" style="width:96px;height:80px;object-fit:contain;background:white;border:1px solid #e9d5ff;border-radius:7px;">
      <div style="min-width:0;flex:1;font-size:.76em;color:#6b21a8;">${escapeHtml(iftyScienceEditorImageDraft?.imageName || '添付画像')}</div>
      <button type="button" onclick="removeIftyScienceEditorImage()" style="border:none;background:#ef4444;color:white;border-radius:7px;padding:6px 8px;font-weight:900;cursor:pointer;">画像削除</button>
    </div>`;
}

window.openIftyScienceItemEditor = function(folderId, itemId) {
  const folder = getIftyScienceFolder(folderId);
  const item = folder?.items?.find(entry => entry.id === itemId);
  if (!folder || !item) return;
  iftyScienceEditorImageDraft = {
    imageData: normalizeIftyScienceImageData(item.imageData),
    imageName: String(item.imageName || '').trim()
  };
  const modal = ensureIftyScienceItemModal();
  const card = document.getElementById('iftyScienceItemModalCard');
  const field = (id, label, value, rows = 1) => `<label style="display:block;margin-top:9px;font-size:.78em;font-weight:900;color:#475569;">${label}</label>${rows > 1 ? `<textarea id="${id}" rows="${rows}" style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #cbd5e1;border-radius:7px;font-size:.95em;resize:vertical;">${escapeHtml(value || '')}</textarea>` : `<input id="${id}" value="${escapeHtml(value || '')}" style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #cbd5e1;border-radius:7px;font-size:.95em;">`}`;
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
      <div><div style="font-size:1.15em;font-weight:900;color:#0f172a;">理科項目を編集</div><div style="font-size:.75em;color:#64748b;">原理・因果・公式・単位・条件を含む暗記用説明と、画像の覚える核を修正できます。</div></div>
      <button type="button" onclick="closeIftyScienceItemEditor()" style="border:none;background:#e2e8f0;color:#334155;border-radius:999px;width:34px;height:34px;font-size:1.2em;font-weight:900;cursor:pointer;">×</button>
    </div>
    ${field('iftyScienceEditTitle','タイトル',item.title)}
    ${field('iftyScienceEditMemoryText','暗記用説明文（定義・原理・因果・仕組みを必要な範囲で簡潔に）',item.memoryText,7)}
    ${field('iftyScienceEditFormula','公式・関係式',item.formula)}
    ${field('iftyScienceEditUnit','単位',item.unit)}
    ${field('iftyScienceEditConditions','条件・適用範囲',item.conditions,3)}
    ${field('iftyScienceEditKeyPoints','重要ポイント（1行1項目）',item.keyPoints.join('\n'),4)}
    <div style="margin-top:12px;padding:10px;border:1px solid #e9d5ff;background:#faf5ff;border-radius:9px;">
      <div style="font-size:.8em;font-weight:900;color:#6b21a8;">画像資産</div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:7px;align-items:center;">
        <button type="button" onclick="document.getElementById('iftyScienceEditImageInput').click()" style="border:1px solid #c084fc;background:white;color:#7e22ce;border-radius:7px;padding:7px 10px;font-weight:900;cursor:pointer;">画像を選択</button>
        <input id="iftyScienceEditImageInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onchange="handleIftyScienceEditorImageSelect(event)" style="display:none;">
      </div>
      <div id="iftyScienceEditImagePreview" style="margin-top:7px;"></div>
      <label style="display:block;margin-top:9px;font-size:.78em;font-weight:900;color:#6b21a8;">画像種別</label>
      <select id="iftyScienceEditImageKind" style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #d8b4fe;border-radius:7px;background:white;">
        <option value="" ${!item.imageKind ? 'selected' : ''}>未設定</option>
        <option value="DIAGRAM" ${item.imageKind === 'DIAGRAM' ? 'selected' : ''}>図・模式図</option>
        <option value="GRAPH" ${item.imageKind === 'GRAPH' ? 'selected' : ''}>グラフ</option>
        <option value="APPARATUS" ${item.imageKind === 'APPARATUS' ? 'selected' : ''}>実験装置</option>
        <option value="PHOTO" ${item.imageKind === 'PHOTO' ? 'selected' : ''}>写真</option>
        <option value="TABLE" ${item.imageKind === 'TABLE' ? 'selected' : ''}>表</option>
        <option value="OTHER" ${item.imageKind === 'OTHER' ? 'selected' : ''}>その他</option>
      </select>
      ${field('iftyScienceEditImageFocus','画像から押さえる核（模式図の関係、グラフの傾向、装置の役割など）',item.imageFocus,3)}
      ${field('iftyScienceEditWorkTitle','図・装置・資料名',item.workTitle)}
    </div>
    <div style="position:sticky;bottom:-16px;margin:14px -16px -16px;padding:10px 16px;background:rgba(255,255,255,.97);border-top:1px solid #e2e8f0;display:flex;gap:8px;justify-content:flex-end;">
      <button type="button" onclick="closeIftyScienceItemEditor()" style="border:none;background:#e2e8f0;color:#334155;border-radius:7px;padding:9px 12px;font-weight:900;cursor:pointer;">キャンセル</button>
      <button type="button" onclick="saveIftyScienceItemEditor('${folderId}','${itemId}')" data-ifty-enter-primary="true" style="border:none;background:#0284c7;color:white;border-radius:7px;padding:9px 14px;font-weight:900;cursor:pointer;">保存</button>
    </div>`;
  modal.style.display = 'flex';
  renderIftyScienceEditorImagePreview();
  setTimeout(() => document.getElementById('iftyScienceEditTitle')?.focus(), 0);
};

window.handleIftyScienceEditorImageSelect = async function(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.type && !file.type.startsWith('image/')) {
    alert('画像ファイルを選択してください。');
    event.target.value = '';
    return;
  }
  if (file.size > 14 * 1024 * 1024) {
    alert('画像が大きすぎます。14MB以下の画像を選択してください。');
    event.target.value = '';
    return;
  }
  try {
    const rawDataUrl = await readFileAsDataUrl(file);
    iftyScienceEditorImageDraft = {
      imageData: await makeIftyScienceStoredImage(rawDataUrl),
      imageName: String(file.name || 'image').trim()
    };
    renderIftyScienceEditorImagePreview();
  } catch (error) {
    alert(String(error.message || error));
  } finally {
    event.target.value = '';
  }
};

window.removeIftyScienceEditorImage = function() {
  iftyScienceEditorImageDraft = { imageData: '', imageName: '' };
  renderIftyScienceEditorImagePreview();
};

window.closeIftyScienceItemEditor = function() {
  const modal = document.getElementById('iftyScienceItemModal');
  if (modal) modal.style.display = 'none';
  iftyScienceEditorImageDraft = null;
};

window.saveIftyScienceItemEditor = function(folderId, itemId) {
  const folder = getIftyScienceFolder(folderId);
  const item = folder?.items?.find(entry => entry.id === itemId);
  if (!item) return;
  recordUndoState('理科項目編集');
  const val = id => String(document.getElementById(id)?.value || '').trim();
  item.title = val('iftyScienceEditTitle');
  item.memoryText = val('iftyScienceEditMemoryText');
  item.formula = val('iftyScienceEditFormula');
  item.unit = val('iftyScienceEditUnit');
  item.conditions = val('iftyScienceEditConditions');
  item.keyPoints = val('iftyScienceEditKeyPoints').split(/\n+/).map(v => v.trim()).filter(Boolean).slice(0, 12);
  item.imageData = normalizeIftyScienceImageData(iftyScienceEditorImageDraft?.imageData);
  item.imageName = String(iftyScienceEditorImageDraft?.imageName || '').trim();
  item.imageKind = normalizeIftyScienceImageKind(val('iftyScienceEditImageKind'));
  item.imageFocus = val('iftyScienceEditImageFocus');
  item.workTitle = val('iftyScienceEditWorkTitle');
  if (!item.imageData) {
    item.imageName = '';
    item.imageKind = '';
    item.imageFocus = '';
    item.workTitle = '';
  }
  item.updatedAt = Date.now();
  savePracticeData();
  window.closeIftyScienceItemEditor();
  renderIftySciencePage();
};

window.deleteIftyScienceItem = function(folderId, itemId) {
  const folder = getIftyScienceFolder(folderId);
  const item = folder?.items?.find(entry => entry.id === itemId);
  if (!folder || !item) return;
  if (!confirm(`「${item.title || item.topic || 'この項目'}」を削除しますか？`)) return;
  recordUndoState('理科項目削除');
  folder.items = folder.items.filter(entry => entry.id !== itemId);
  savePracticeData();
  renderIftySciencePage();
};

function ensureIftyScienceVisualQuizModal() {
  let modal = document.getElementById('iftyScienceVisualQuizModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'iftyScienceVisualQuizModal';
  modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.65);z-index:12080;align-items:center;justify-content:center;padding:14px;box-sizing:border-box;';
  modal.innerHTML = '<div id="iftyScienceVisualQuizCard" style="width:min(820px,96vw);max-height:92vh;overflow:auto;background:white;border-radius:12px;padding:16px;box-shadow:0 20px 50px rgba(0,0,0,.3);"></div>';
  modal.addEventListener('click', event => { if (event.target === modal) window.closeIftyScienceVisualQuiz(); });
  document.body.appendChild(modal);
  return modal;
}

function getIftyScienceVisualQuizCandidates(folderId, mode) {
  const folder = getIftyScienceFolder(folderId);
  if (!folder) return [];
  if (mode === 'text_to_image') {
    return (folder.items || []).filter(item => !!item.imageData && !!String(item.title || '').trim());
  }
  return (folder.items || []).filter(item => !!item.imageData && !!String(item.title || '').trim());
}

function buildIftyScienceVisualOptionIds(folderId, targetId, mode) {
  const localFolder = getIftyScienceFolder(folderId);
  let pool = [];
  if (mode === 'text_to_image') {
    pool = getIftyScienceImageEntries().map(ref => ref.item);
  } else {
    pool = getIftyScienceModule().folders.flatMap(folder => folder.items || []);
  }

  const target = getIftyScienceItemById(targetId)?.item;
  if (!target) return [];
  const seenLabels = new Set([String(target.title || '').trim().toLowerCase()]);
  const distractors = [];

  // 同じフォルダを優先し、足りない分だけ理科全体から補う。
  const prioritized = [
    ...(localFolder?.items || []).filter(item => String(item.id) !== String(targetId)),
    ...pool.filter(item => !localFolder?.items?.some(local => String(local.id) === String(item.id)))
  ];

  for (const item of shuffleArray(prioritized)) {
    if (String(item.id) === String(targetId)) continue;
    if (mode === 'text_to_image' && !item.imageData) continue;
    const label = String(item.title || '').trim();
    if (!label) continue;
    const normalized = label.toLowerCase();
    if (seenLabels.has(normalized)) continue;
    seenLabels.add(normalized);
    distractors.push(String(item.id));
    if (distractors.length >= 3) break;
  }
  return shuffleArray([String(targetId), ...distractors]);
}

window.startIftyScienceVisualQuiz = function(folderId, mode) {
  const normalizedMode = mode === 'text_to_image' ? 'text_to_image' : 'image_to_text';
  const candidates = getIftyScienceVisualQuizCandidates(folderId, normalizedMode);
  if (candidates.length < 2) {
    alert('この画像クイズには、画像付きの項目が2件以上必要です。');
    return;
  }
  iftyScienceVisualQuizState = {
    mode: normalizedMode,
    folderId,
    queue: shuffleArray(candidates.map(item => String(item.id))),
    index: 0,
    correct: 0,
    wrong: 0,
    answered: false,
    selectedId: '',
    optionIds: []
  };
  ensureIftyScienceVisualQuizModal().style.display = 'flex';
  renderIftyScienceVisualQuiz();
};

function renderIftyScienceVisualQuiz() {
  const state = iftyScienceVisualQuizState;
  const card = document.getElementById('iftyScienceVisualQuizCard');
  if (!card) return;

  if (state.index >= state.queue.length) {
    const total = state.correct + state.wrong;
    const rate = total ? Math.round((state.correct / total) * 100) : 0;
    card.innerHTML = `
      <div style="text-align:center;padding:16px 4px;">
        <div style="font-size:1.25em;font-weight:900;color:#0f172a;">画像クイズ完了</div>
        <div style="margin-top:12px;font-size:1.05em;color:#334155;">正解 ${state.correct} / ${total}　正答率 ${rate}%</div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:16px;">
          <button type="button" onclick="startIftyScienceVisualQuiz('${state.folderId}','${state.mode}')" style="border:none;background:#7c3aed;color:white;border-radius:8px;padding:9px 14px;font-weight:900;cursor:pointer;">もう一度</button>
          <button type="button" onclick="closeIftyScienceVisualQuiz()" data-ifty-enter-primary="true" style="border:none;background:#334155;color:white;border-radius:8px;padding:9px 14px;font-weight:900;cursor:pointer;">閉じる</button>
        </div>
      </div>`;
    return;
  }

  const targetRef = getIftyScienceItemById(state.queue[state.index]);
  if (!targetRef?.item?.imageData) {
    state.index += 1;
    renderIftyScienceVisualQuiz();
    return;
  }
  const target = targetRef.item;
  if (!state.optionIds.length) state.optionIds = buildIftyScienceVisualOptionIds(state.folderId, target.id, state.mode);
  const optionRefs = state.optionIds.map(id => getIftyScienceItemById(id)).filter(Boolean);

  const resultBlock = state.answered ? `<div style="margin-top:13px;padding:10px;border-radius:9px;background:${state.selectedId === String(target.id) ? '#ecfdf5' : '#fff1f2'};border:1px solid ${state.selectedId === String(target.id) ? '#86efac' : '#fda4af'};">
      <div style="font-weight:900;color:${state.selectedId === String(target.id) ? '#166534' : '#9f1239'};">${state.selectedId === String(target.id) ? '正解' : `正解：${escapeHtml(target.title || '無題')}`}</div>
      ${target.workTitle ? `<div style="margin-top:5px;font-size:.83em;color:#581c87;"><strong>図・装置・資料名：</strong>${escapeHtml(target.workTitle)}</div>` : ''}
      ${target.imageFocus ? `<div style="margin-top:5px;font-size:.83em;color:#3b0764;line-height:1.5;"><strong>画像の核：</strong>${escapeHtml(target.imageFocus)}</div>` : ''}
      ${target.memoryText ? `<div style="margin-top:5px;font-size:.82em;color:#475569;line-height:1.55;">${escapeHtml(target.memoryText)}</div>` : ''}
      <div style="margin-top:10px;text-align:right;"><button type="button" onclick="nextIftyScienceVisualQuiz()" data-ifty-enter-primary="true" style="border:none;background:#7c3aed;color:white;border-radius:8px;padding:8px 13px;font-weight:900;cursor:pointer;">次へ</button></div>
    </div>` : '';

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
      <div>
        <div style="font-size:1.12em;font-weight:900;color:#0f172a;">${state.mode === 'image_to_text' ? '画像を見て選ぶ' : '画像を選ぶ'}</div>
        <div style="font-size:.75em;color:#64748b;margin-top:2px;">${state.index + 1} / ${state.queue.length}</div>
      </div>
      <button type="button" onclick="closeIftyScienceVisualQuiz()" style="border:none;background:#e2e8f0;color:#475569;border-radius:999px;width:34px;height:34px;font-size:1.2em;font-weight:900;cursor:pointer;">×</button>
    </div>

    ${state.mode === 'image_to_text' ? `
      <div style="margin-top:13px;text-align:center;">
        <img src="${target.imageData}" alt="問題画像" style="max-width:100%;max-height:340px;object-fit:contain;border:1px solid #e2e8f0;border-radius:10px;background:#fff;">
        <div style="margin-top:9px;font-weight:900;color:#334155;">この画像に最も対応する項目は？</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;margin-top:12px;">
        ${optionRefs.map(ref => {
          const id = String(ref.item.id);
          const disabled = state.answered ? 'disabled' : '';
          const isCorrect = id === String(target.id);
          const isSelected = id === state.selectedId;
          let bg = '#f8fafc', border = '#cbd5e1', color = '#0f172a';
          if (state.answered && isCorrect) { bg = '#dcfce7'; border = '#22c55e'; color = '#166534'; }
          else if (state.answered && isSelected) { bg = '#ffe4e6'; border = '#f43f5e'; color = '#9f1239'; }
          return `<button type="button" ${disabled} data-ifty-enter-ignore="true" onclick="answerIftyScienceVisualQuiz('${id}')" style="border:2px solid ${border};background:${bg};color:${color};border-radius:9px;padding:11px;text-align:left;font-weight:900;cursor:${state.answered ? 'default' : 'pointer'};">${escapeHtml(ref.item.title || '無題')}</button>`;
        }).join('')}
      </div>` : `
      <div style="margin-top:13px;padding:12px;border:1px solid #ddd6fe;border-radius:10px;background:#f5f3ff;text-align:center;">
        <div style="font-size:.78em;color:#6d28d9;font-weight:900;">次の項目に対応する画像を選べ</div>
        <div style="margin-top:5px;font-size:1.2em;font-weight:900;color:#3b0764;">${escapeHtml(target.title || '無題')}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:12px;">
        ${optionRefs.map(ref => {
          const id = String(ref.item.id);
          const disabled = state.answered ? 'disabled' : '';
          const isCorrect = id === String(target.id);
          const isSelected = id === state.selectedId;
          let border = '#cbd5e1', bg = '#fff';
          if (state.answered && isCorrect) { border = '#22c55e'; bg = '#f0fdf4'; }
          else if (state.answered && isSelected) { border = '#f43f5e'; bg = '#fff1f2'; }
          return `<button type="button" ${disabled} data-ifty-enter-ignore="true" onclick="answerIftyScienceVisualQuiz('${id}')" style="border:3px solid ${border};background:${bg};border-radius:10px;padding:7px;cursor:${state.answered ? 'default' : 'pointer'};min-width:0;"><img src="${ref.item.imageData}" alt="選択肢画像" style="display:block;width:100%;height:180px;object-fit:contain;background:white;border-radius:6px;"></button>`;
        }).join('')}
      </div>`}
    ${resultBlock}`;
}

window.answerIftyScienceVisualQuiz = function(itemId) {
  const state = iftyScienceVisualQuizState;
  if (state.answered || state.index >= state.queue.length) return;
  const correctId = String(state.queue[state.index]);
  state.selectedId = String(itemId);
  state.answered = true;
  if (state.selectedId === correctId) state.correct += 1;
  else state.wrong += 1;
  renderIftyScienceVisualQuiz();
};

window.nextIftyScienceVisualQuiz = function() {
  const state = iftyScienceVisualQuizState;
  if (!state.answered) return;
  state.index += 1;
  state.answered = false;
  state.selectedId = '';
  state.optionIds = [];
  renderIftyScienceVisualQuiz();
};

window.closeIftyScienceVisualQuiz = function() {
  const modal = document.getElementById('iftyScienceVisualQuizModal');
  if (modal) modal.style.display = 'none';
};


// ==========================================
// Q3 STEP47：SCIENCE 専用PRACTICE
// ==========================================
function getIftySciencePracticeFolders() {
  return getIftyScienceModule().folders.filter(folder => Array.isArray(folder.items) && folder.items.length);
}

function ensureIftySciencePracticeFolderSelection() {
  const foldersWithItems = getIftySciencePracticeFolders();
  const validIds = new Set(foldersWithItems.map(folder => String(folder.id)));
  iftySciencePracticeSelectedFolderIds = new Set(
    [...iftySciencePracticeSelectedFolderIds].filter(id => validIds.has(String(id)))
  );
  if (!iftySciencePracticeSelectionInitialized) {
    foldersWithItems.forEach(folder => iftySciencePracticeSelectedFolderIds.add(String(folder.id)));
    iftySciencePracticeSelectionInitialized = true;
  }
}

function getIftySciencePracticeSelectedFolders() {
  ensureIftySciencePracticeFolderSelection();
  return getIftySciencePracticeFolders().filter(folder => iftySciencePracticeSelectedFolderIds.has(String(folder.id)));
}

function getIftySciencePracticeItems() {
  return getIftySciencePracticeSelectedFolders().flatMap(folder => (folder.items || [])
    .filter(item => String(item?.title || item?.topic || '').trim())
    .map(item => ({ folder, item })));
}

function getIftySciencePracticeImageItems() {
  return getIftySciencePracticeItems().filter(ref => !!normalizeIftyScienceImageData(ref.item.imageData));
}

function findIftySciencePracticeItemById(itemId) {
  const target = String(itemId || '');
  for (const folder of getIftyScienceModule().folders || []) {
    const item = (folder.items || []).find(row => String(row?.id || '') === target);
    if (item) return { folder, item };
  }
  return null;
}

window.startIftyScienceFlashcards = function(direction = 'front', random = true) {
  const refs = getIftySciencePracticeItems().filter(ref =>
    String(ref.item?.title || ref.item?.topic || '').trim() &&
    String(ref.item?.memoryText || '').trim()
  );
  if (!refs.length) {
    alert('フラッシュカードに使える理科用語がありません。');
    return;
  }
  closePracticeModal();
  currentFlashcardMode = 'science';
  cardMode = direction === 'back' ? 'back' : 'front';
  isRandomMode = random !== false;
  flashcardList = refs.map(ref => ({
    id: String(ref.item.id || ''),
    word: String(ref.item.title || ref.item.topic || '').trim(),
    meanings: [String(ref.item.memoryText || '').trim()],
    mastery: ref.item.mastery || 'unfixed',
    language: '日本語',
    languageCode: 'ja',
    __iftyScienceFlashcard: true,
    __iftyScienceItemId: String(ref.item.id || '')
  }));
  if (isRandomMode) flashcardList = shuffleArray(flashcardList);
  currentFlashcardIndex = 0;
  isCardFlipped = false;
  renderFlashcardModal();
};

function getIftySciencePracticeModeMeta(mode) {
  const meta = {
    simple: {
      title: 'シンプル',
      description: '用語→説明、または説明→用語。保存済みデータだけで出題します。',
      color: '#2563eb'
    },
    formula: {
      title: '公式・単位',
      description: '用語→公式・単位、または公式・単位→用語。複数正解にも対応します。',
      color: '#7c3aed'
    },
    order: {
      title: '並べ替え',
      description: '反応・実験・生体過程・現象などの手順や因果の順序を並べます。',
      color: '#d97706'
    },
    explanation: {
      title: '説明',
      description: '提示された用語を、指定された語句を使って説明します。ALLIAが採点します。',
      color: '#059669'
    },
    image: {
      title: '画像関連',
      description: '画像から用語を答える、または用語から正しい画像を選びます。',
      color: '#db2777'
    }
  };
  return meta[mode] || { title: 'PRACTICE', description: '', color: '#334155' };
}

function resetIftySciencePracticeAnswerState() {
  iftySciencePracticeState.answered = false;
  iftySciencePracticeState.selectedIds = [];
  iftySciencePracticeState.orderIds = [];
  iftySciencePracticeState.grading = false;
  iftySciencePracticeState.feedback = '';
  iftySciencePracticeState.score = null;
  iftySciencePracticeState.modelAnswer = '';
  iftySciencePracticeState.answerText = '';
}

window.openIftySciencePractice = function() {
  currentIftySubject = 'SCIENCE';
  window.closeIftySideMenu();
  ensureIftySciencePracticeFolderSelection();
  window.openPracticeHome('SCIENCE');
};

window.toggleIftySciencePracticeFolder = function(folderId, checked) {
  iftySciencePracticeSelectionInitialized = true;
  const id = String(folderId || '');
  if (checked) iftySciencePracticeSelectedFolderIds.add(id);
  else iftySciencePracticeSelectedFolderIds.delete(id);
  const practiceModal = document.getElementById('practiceModal');
  if (practiceModal && practiceModal.style.display !== 'none') renderPracticeHome();
  else renderIftySciencePracticeHome();
};

window.selectAllIftySciencePracticeFolders = function(selected) {
  iftySciencePracticeSelectionInitialized = true;
  iftySciencePracticeSelectedFolderIds.clear();
  if (selected) getIftySciencePracticeFolders().forEach(folder => iftySciencePracticeSelectedFolderIds.add(String(folder.id)));
  const practiceModal = document.getElementById('practiceModal');
  if (practiceModal && practiceModal.style.display !== 'none') renderPracticeHome();
  else renderIftySciencePracticeHome();
};

window.setIftySciencePracticeQuestionCount = function(value) {
  const count = Number(value);
  iftySciencePracticeQuestionCount = [5, 10].includes(count) ? count : 5;
  const practiceModal = document.getElementById('practiceModal');
  if (practiceModal && practiceModal.style.display !== 'none') renderPracticeHome();
  else renderIftySciencePracticeHome();
};

function renderIftySciencePracticeHome() {
  currentIftySubject = 'SCIENCE';
  const foldersWithItems = getIftySciencePracticeFolders();
  ensureIftySciencePracticeFolderSelection();
  const selectedFolders = getIftySciencePracticeSelectedFolders();
  const selectedItems = getIftySciencePracticeItems();
  const imageItems = getIftySciencePracticeImageItems();
  const selectedSubjects = [...new Set(selectedFolders.flatMap(folder => normalizeIftyScienceSubjects(folder.subjects)))]
    .map(getIftyScienceSubjectLabel);

  const folderChoices = foldersWithItems.length
    ? foldersWithItems.map(folder => {
        const checked = iftySciencePracticeSelectedFolderIds.has(String(folder.id));
        return `<label style="display:flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid ${checked ? '#38bdf8' : '#cbd5e1'};border-radius:9px;background:${checked ? '#f0f9ff' : '#fff'};cursor:pointer;min-width:0;">
          <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleIftySciencePracticeFolder('${folder.id}',this.checked)">
          <span style="font-weight:900;color:#0f172a;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(folder.name)}</span>
          <span style="font-size:.72em;color:#64748b;white-space:nowrap;">${folder.items.length}件</span>
        </label>`;
      }).join('')
    : '<div style="color:#94a3b8;padding:10px 0;">項目のある理科フォルダがありません。</div>';

  const modeCard = mode => {
    const meta = getIftySciencePracticeModeMeta(mode);
    let disabledReason = '';
    if (mode === 'image' && imageItems.length < 2) disabledReason = '画像付き項目が2件以上必要です。';
    else if (mode === 'simple' && selectedItems.length < 2) disabledReason = '項目が2件以上必要です。';
    else if (!selectedItems.length) disabledReason = '学習する項目を選択してください。';
    const disabled = !!disabledReason;
    return `<button type="button" onclick="startIftySciencePractice('${mode}')" ${disabled ? 'disabled' : ''} style="text-align:left;border:1px solid ${disabled ? '#e2e8f0' : meta.color};background:${disabled ? '#f8fafc' : '#fff'};border-radius:12px;padding:14px;cursor:${disabled ? 'not-allowed' : 'pointer'};min-height:126px;opacity:${disabled ? '.62' : '1'};">
      <div style="font-size:1.08em;font-weight:900;color:${disabled ? '#94a3b8' : meta.color};">${escapeHtml(meta.title)}</div>
      <div style="margin-top:7px;color:#475569;font-size:.84em;line-height:1.55;">${escapeHtml(meta.description)}</div>
      ${disabledReason ? `<div style="margin-top:8px;font-size:.72em;color:#94a3b8;font-weight:800;">${escapeHtml(disabledReason)}</div>` : ''}
    </button>`;
  };

  showIftyHubContent(`
    <section class="ifty-portal-shell">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <h1 class="ifty-portal-title">SCIENCE / PRACTICE</h1>
          <div class="ifty-portal-subtitle">理科専用の5種類の問題で、登録した用語を確認します。</div>
        </div>
        <button class="ifty-portal-back" type="button" onclick="renderIftySciencePage()">SCIENCEへ戻る</button>
      </div>

      <div style="margin-top:14px;padding:13px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
          <div>
            <div style="font-weight:900;color:#0f172a;">出題するフォルダ</div>
            <div style="font-size:.76em;color:#64748b;margin-top:3px;">選択 ${selectedFolders.length}フォルダ / ${selectedItems.length}項目${selectedSubjects.length ? ` ・ ${escapeHtml(selectedSubjects.join('・'))}` : ''}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" onclick="selectAllIftySciencePracticeFolders(true)" style="border:none;background:#e0f2fe;color:#075985;border-radius:7px;padding:7px 9px;font-weight:900;cursor:pointer;">すべて</button>
            <button type="button" onclick="selectAllIftySciencePracticeFolders(false)" style="border:none;background:#e2e8f0;color:#475569;border-radius:7px;padding:7px 9px;font-weight:900;cursor:pointer;">解除</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:7px;margin-top:10px;">${folderChoices}</div>
      </div>

      <div style="margin-top:12px;padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;display:flex;align-items:center;gap:9px;flex-wrap:wrap;">
        <strong style="color:#334155;">問題数</strong>
        <select onchange="setIftySciencePracticeQuestionCount(this.value)" style="padding:8px 10px;border:1px solid #94a3b8;border-radius:7px;background:white;font-size:1em;">
          <option value="5" ${iftySciencePracticeQuestionCount === 5 ? 'selected' : ''}>5問</option>
          <option value="10" ${iftySciencePracticeQuestionCount === 10 ? 'selected' : ''}>10問</option>
        </select>
        <span style="font-size:.74em;color:#64748b;">公式・単位・並べ替え・説明は開始時にALLIAが問題を作ります。</span>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:14px;">
        ${modeCard('simple')}
        ${modeCard('formula')}
        ${modeCard('order')}
        ${modeCard('explanation')}
        ${modeCard('image')}
      </div>
    </section>
  `, 'science-practice');
}

function makeIftySciencePracticeSimpleQuestions(items, requestedCount) {
  const refs = items.filter(ref => String(ref.item.title || '').trim() && String(ref.item.memoryText || '').trim());
  if (refs.length < 2) return [];
  const targets = shuffleArray(refs).slice(0, Math.min(requestedCount, refs.length));
  return targets.map((targetRef, index) => {
    const direction = index % 2 === 0 ? 'term_to_description' : 'description_to_term';
    const target = targetRef.item;
    const targetLabel = direction === 'term_to_description' ? target.memoryText : target.title;
    const seen = new Set([String(targetLabel).trim().toLowerCase()]);
    const distractors = [];
    for (const ref of shuffleArray(refs.filter(ref => String(ref.item.id) !== String(target.id)))) {
      const label = direction === 'term_to_description' ? String(ref.item.memoryText || '').trim() : String(ref.item.title || '').trim();
      const key = label.toLowerCase();
      if (!label || seen.has(key)) continue;
      seen.add(key);
      distractors.push({ id: String(ref.item.id), itemId: String(ref.item.id), label });
      if (distractors.length >= 3) break;
    }
    const options = shuffleArray([
      { id: String(target.id), itemId: String(target.id), label: String(targetLabel) },
      ...distractors
    ]);
    return {
      id: `simple_${index}_${String(target.id)}`,
      type: 'simple',
      direction,
      prompt: direction === 'term_to_description'
        ? `「${target.title}」の説明として最も適切なものを選べ。`
        : '次の説明に当てはまる用語を選べ。',
      sourceText: direction === 'description_to_term' ? target.memoryText : '',
      targetItemId: String(target.id),
      options,
      correctIds: [String(target.id)],
      explanation: target.memoryText
    };
  }).filter(question => question.options.length >= 2);
}

function makeIftySciencePracticeImageQuestions(items, requestedCount) {
  const refs = items.filter(ref => !!normalizeIftyScienceImageData(ref.item.imageData) && String(ref.item.title || '').trim());
  if (refs.length < 2) return [];
  const targets = shuffleArray(refs).slice(0, Math.min(requestedCount, refs.length));
  return targets.map((targetRef, index) => {
    const target = targetRef.item;
    const direction = index % 2 === 0 ? 'image_to_text' : 'text_to_image';
    let optionPool = refs;
    let labelField = 'title';
    let prompt = '';

    if (direction === 'image_to_text') {
      const workTitleRefs = refs.filter(ref => String(ref.item.workTitle || '').trim());
      const focusRefs = refs.filter(ref => String(ref.item.imageFocus || '').trim());
      if (String(target.workTitle || '').trim() && workTitleRefs.length >= 2) {
        optionPool = workTitleRefs;
        labelField = 'workTitle';
        prompt = 'この画像の図・装置・資料名として最も適切なものを選べ。';
      } else if (String(target.imageFocus || '').trim() && focusRefs.length >= 2) {
        optionPool = focusRefs;
        labelField = 'imageFocus';
        prompt = 'この画像から押さえるべき内容として最も適切なものを選べ。';
      } else {
        prompt = 'この画像に最も対応する用語を選べ。';
      }
    } else {
      prompt = `「${target.title}」に対応する画像を選べ。`;
    }

    const candidatePool = optionPool.some(ref => String(ref.item.id) === String(target.id)) ? optionPool : refs;
    const others = shuffleArray(candidatePool.filter(ref => String(ref.item.id) !== String(target.id))).slice(0, 3);
    const optionRefs = shuffleArray([targetRef, ...others]);
    return {
      id: `image_${index}_${String(target.id)}`,
      type: 'image',
      direction,
      prompt,
      targetItemId: String(target.id),
      imageItemId: direction === 'image_to_text' ? String(target.id) : '',
      options: optionRefs.map(ref => ({
        id: String(ref.item.id),
        itemId: String(ref.item.id),
        label: direction === 'image_to_text'
          ? String(ref.item[labelField] || ref.item.title || '').trim()
          : String(ref.item.title || '').trim()
      })).filter(option => direction === 'text_to_image' || option.label),
      correctIds: [String(target.id)],
      explanation: String(target.memoryText || ''),
      imageFocus: String(target.imageFocus || ''),
      workTitle: String(target.workTitle || '')
    };
  }).filter(question => question.options.length >= 2);
}

function serializeIftySciencePracticeItems(items) {
  return items.slice(0, 60).map(ref => ({
    id: String(ref.item.id || ''),
    title: String(ref.item.title || ref.item.topic || '').trim(),
    memoryText: String(ref.item.memoryText || '').trim(),
    keyPoints: Array.isArray(ref.item.keyPoints) ? ref.item.keyPoints.slice(0, 4) : [],
    formula: String(ref.item.formula || '').trim(),
    unit: String(ref.item.unit || '').trim(),
    conditions: String(ref.item.conditions || '').trim(),
    subjects: normalizeIftyScienceSubjects(ref.item.subjects?.length ? ref.item.subjects : ref.folder.subjects)
  })).filter(item => item.id && item.title);
}

function normalizeIftySciencePracticeAiQuestions(mode, rawQuestions) {
  const questions = Array.isArray(rawQuestions) ? rawQuestions : [];
  return questions.map((raw, questionIndex) => {
    const source = raw && typeof raw === 'object' ? raw : {};
    const base = {
      id: `ai_${mode}_${questionIndex}_${Date.now()}`,
      type: mode,
      prompt: String(source.prompt || '').trim(),
      targetItemId: String(source.targetItemId || '').trim(),
      explanation: String(source.explanation || '').trim()
    };

    if (mode === 'formula') {
      const originalOptions = Array.isArray(source.options) ? source.options : [];
      const originalCorrect = new Set((Array.isArray(source.correctIds) ? source.correctIds : []).map(value => String(value)));
      const options = originalOptions.map((option, optionIndex) => {
        const originalId = String(option?.id || `opt${optionIndex + 1}`);
        return {
          id: `formula_${questionIndex}_${optionIndex}`,
          originalId,
          label: String(option?.label || '').trim()
        };
      }).filter(option => option.label);
      const correctIds = options.filter(option => originalCorrect.has(option.originalId)).map(option => option.id);
      if (!base.prompt || options.length < 2 || !correctIds.length) return null;
      return { ...base, direction: String(source.direction || ''), options, correctIds };
    }

    if (mode === 'order') {
      const originalEvents = Array.isArray(source.events) ? source.events : [];
      const originalCorrectOrder = (Array.isArray(source.correctOrder) ? source.correctOrder : []).map(value => String(value));
      const events = originalEvents.map((event, eventIndex) => ({
        id: `order_${questionIndex}_${eventIndex}`,
        originalId: String(event?.id || `event${eventIndex + 1}`),
        text: String(event?.text || '').trim()
      })).filter(event => event.text);
      const byOriginal = new Map(events.map(event => [event.originalId, event.id]));
      const correctOrder = originalCorrectOrder.map(id => byOriginal.get(id)).filter(Boolean);
      if (!base.prompt || events.length < 3 || correctOrder.length !== events.length) return null;
      return { ...base, events: shuffleArray(events), correctOrder };
    }

    if (mode === 'explanation') {
      const requiredTerms = [...new Set((Array.isArray(source.requiredTerms) ? source.requiredTerms : [])
        .map(value => String(value || '').trim()).filter(Boolean))].slice(0, 5);
      const referenceAnswer = String(source.referenceAnswer || '').trim();
      const gradingPoints = (Array.isArray(source.gradingPoints) ? source.gradingPoints : [])
        .map(value => String(value || '').trim()).filter(Boolean).slice(0, 5);
      if (!base.prompt || !requiredTerms.length || !referenceAnswer) return null;
      return { ...base, requiredTerms, referenceAnswer, gradingPoints };
    }

    return null;
  }).filter(Boolean);
}

function renderIftySciencePracticeLoading(mode) {
  const meta = getIftySciencePracticeModeMeta(mode);
  showIftyHubContent(`
    <section class="ifty-portal-shell">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div>
          <h1 class="ifty-portal-title">${escapeHtml(meta.title)}</h1>
          <div class="ifty-portal-subtitle">ALLIAが理科PRACTICE用の問題を作成しています。</div>
        </div>
        <button class="ifty-portal-back" type="button" onclick="openIftySciencePractice()">PRACTICEへ戻る</button>
      </div>
      <div style="margin-top:20px;padding:28px;border:1px solid #ddd6fe;border-radius:12px;background:#faf5ff;text-align:center;">
        <div style="font-size:1.15em;font-weight:900;color:#6d28d9;">問題を生成中…</div>
        <div style="margin-top:7px;color:#64748b;font-size:.82em;">登録済みの用語と理科のORDERを使っています。</div>
      </div>
    </section>
  `, 'science-practice');
}

window.startIftySciencePractice = async function(mode) {
  const normalizedMode = ['simple', 'formula', 'order', 'explanation', 'image'].includes(mode) ? mode : 'simple';
  const items = getIftySciencePracticeItems();
  if (!items.length) {
    alert('出題するフォルダを選択してください。');
    return;
  }

  let questions = [];
  if (normalizedMode === 'simple') {
    questions = makeIftySciencePracticeSimpleQuestions(items, iftySciencePracticeQuestionCount);
  } else if (normalizedMode === 'image') {
    questions = makeIftySciencePracticeImageQuestions(items, iftySciencePracticeQuestionCount);
  } else {
    if (!ensureIftyOnline('理科PRACTICE問題生成')) return;
    renderIftySciencePracticeLoading(normalizedMode);
    try {
      const selectedFolders = getIftySciencePracticeSelectedFolders();
      const subjects = [...new Set(selectedFolders.flatMap(folder => normalizeIftyScienceSubjects(folder.subjects)))];
      const response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'science_practice_generate',
          mode: normalizedMode,
          count: iftySciencePracticeQuestionCount,
          items: serializeIftySciencePracticeItems(items),
          subjects,
          subject: 'SCIENCE',
          order: getIftySubjectOrder('SCIENCE')
        })
      });
      const data = await response.json();
      if (!response.ok) throw alliaHttpError(response, data, '理科PRACTICEの問題生成に失敗しました。');
      questions = normalizeIftySciencePracticeAiQuestions(normalizedMode, data.questions);
    } catch (error) {
      console.error('理科PRACTICE問題生成エラー:', error);
      alert(String(error.message || error));
      window.openPracticeHome('SCIENCE');
      return;
    }
  }

  if (!questions.length) {
    alert(normalizedMode === 'image'
      ? '画像付き項目が2件以上必要です。'
      : 'この条件では問題を作れませんでした。別のフォルダを選ぶか、項目を増やしてください。');
    window.openPracticeHome('SCIENCE');
    return;
  }

  iftySciencePracticeState = {
    mode: normalizedMode,
    questions,
    index: 0,
    correct: 0,
    wrong: 0,
    answered: false,
    selectedIds: [],
    orderIds: normalizedMode === 'order' ? questions[0].events.map(event => event.id) : [],
    grading: false,
    feedback: '',
    score: null,
    modelAnswer: '',
    answerText: ''
  };
  renderIftySciencePracticePlayer();
};

function getCurrentIftySciencePracticeQuestion() {
  return iftySciencePracticeState.questions[iftySciencePracticeState.index] || null;
}

function renderIftySciencePracticeResult() {
  const state = iftySciencePracticeState;
  const total = state.correct + state.wrong;
  const rate = total ? Math.round((state.correct / total) * 100) : 0;
  const meta = getIftySciencePracticeModeMeta(state.mode);
  showIftyHubContent(`
    <section class="ifty-portal-shell">
      <div style="text-align:center;padding:28px 8px;">
        <div style="font-size:1.4em;font-weight:900;color:${meta.color};">${escapeHtml(meta.title)} 完了</div>
        <div style="margin-top:12px;color:#334155;font-size:1.05em;">正解 ${state.correct} / ${total}　正答率 ${rate}%</div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:18px;">
          <button type="button" onclick="startIftySciencePractice('${state.mode}')" style="border:none;background:${meta.color};color:white;border-radius:8px;padding:10px 15px;font-weight:900;cursor:pointer;">もう一度</button>
          <button type="button" onclick="openIftySciencePractice()" data-ifty-enter-primary="true" style="border:none;background:#334155;color:white;border-radius:8px;padding:10px 15px;font-weight:900;cursor:pointer;">PRACTICEへ戻る</button>
        </div>
      </div>
    </section>
  `, 'science-practice');
}

function renderIftySciencePracticeChoiceQuestion(question) {
  const state = iftySciencePracticeState;
  const isFormula = state.mode === 'formula';
  const isImage = state.mode === 'image';
  const targetRef = question.targetItemId ? getIftyScienceItemById(question.targetItemId) : null;
  const imageRef = question.imageItemId ? getIftyScienceItemById(question.imageItemId) : null;

  const promptVisual = isImage && question.direction === 'image_to_text' && imageRef?.item?.imageData
    ? `<div style="margin-top:12px;text-align:center;"><img src="${imageRef.item.imageData}" alt="問題画像" style="max-width:100%;max-height:330px;object-fit:contain;border:1px solid #e2e8f0;border-radius:10px;background:white;"></div>`
    : '';
  const sourceText = question.sourceText
    ? `<div style="margin-top:12px;padding:12px;border:1px solid #dbeafe;border-radius:10px;background:#f8fbff;color:#0f172a;line-height:1.65;">${escapeHtml(question.sourceText)}</div>`
    : '';

  const optionHtml = (question.options || []).map(option => {
    const selected = state.selectedIds.includes(String(option.id));
    const correct = (question.correctIds || []).includes(String(option.id));
    let border = selected ? '#0ea5e9' : '#cbd5e1';
    let bg = selected ? '#f0f9ff' : '#fff';
    let color = '#0f172a';
    if (state.answered && correct) { border = '#22c55e'; bg = '#f0fdf4'; color = '#166534'; }
    else if (state.answered && selected && !correct) { border = '#f43f5e'; bg = '#fff1f2'; color = '#9f1239'; }

    if (isImage && question.direction === 'text_to_image') {
      const ref = getIftyScienceItemById(option.itemId || option.id);
      const imageData = ref?.item?.imageData || '';
      return `<button type="button" ${state.answered ? 'disabled' : ''} data-ifty-enter-ignore="true" onclick="answerIftySciencePracticeChoice('${option.id}')" style="border:3px solid ${border};background:${bg};border-radius:10px;padding:7px;cursor:${state.answered ? 'default' : 'pointer'};min-width:0;">
        <img src="${imageData}" alt="選択肢画像" style="display:block;width:100%;height:170px;object-fit:contain;background:white;border-radius:6px;">
      </button>`;
    }

    return `<button type="button" ${state.answered ? 'disabled' : ''} data-ifty-enter-ignore="true" onclick="${isFormula ? `toggleIftySciencePracticeFormulaChoice('${option.id}')` : `answerIftySciencePracticeChoice('${option.id}')`}" style="border:2px solid ${border};background:${bg};color:${color};border-radius:9px;padding:11px;text-align:left;font-weight:800;line-height:1.5;cursor:${state.answered ? 'default' : 'pointer'};">${escapeHtml(option.label)}</button>`;
  }).join('');

  const allCorrect = state.answered && arraysAsSetsEqual(state.selectedIds, question.correctIds || []);
  const feedback = state.answered ? `
    <div style="margin-top:13px;padding:11px;border-radius:9px;background:${allCorrect ? '#ecfdf5' : '#fff1f2'};border:1px solid ${allCorrect ? '#86efac' : '#fda4af'};">
      <div style="font-weight:900;color:${allCorrect ? '#166534' : '#9f1239'};">${allCorrect ? '正解' : '不正解'}</div>
      ${question.explanation ? `<div style="margin-top:6px;color:#475569;line-height:1.6;">${escapeHtml(question.explanation)}</div>` : ''}
      ${isImage && targetRef?.item?.workTitle ? `<div style="margin-top:5px;color:#581c87;font-size:.85em;"><strong>図・装置・資料名：</strong>${escapeHtml(targetRef.item.workTitle)}</div>` : ''}
      ${isImage && targetRef?.item?.imageFocus ? `<div style="margin-top:5px;color:#3b0764;font-size:.85em;"><strong>画像の核：</strong>${escapeHtml(targetRef.item.imageFocus)}</div>` : ''}
      <div style="margin-top:10px;text-align:right;"><button type="button" onclick="nextIftySciencePracticeQuestion()" data-ifty-enter-primary="true" style="border:none;background:#0f766e;color:white;border-radius:8px;padding:8px 13px;font-weight:900;cursor:pointer;">次へ</button></div>
    </div>` : '';

  return `
    <div style="font-size:1.03em;font-weight:900;color:#0f172a;line-height:1.55;">${escapeHtml(question.prompt)}</div>
    ${promptVisual}
    ${sourceText}
    ${isFormula && !state.answered ? '<div style="margin-top:7px;color:#7c3aed;font-size:.76em;font-weight:800;">正しいものをすべて選択してください。複数正解の場合があります。</div>' : ''}
    <div style="display:grid;grid-template-columns:${isImage && question.direction === 'text_to_image' ? 'repeat(2,minmax(0,1fr))' : 'repeat(auto-fit,minmax(220px,1fr))'};gap:8px;margin-top:12px;">${optionHtml}</div>
    ${isFormula && !state.answered ? `<div style="text-align:right;margin-top:11px;"><button type="button" onclick="submitIftySciencePracticeFormula()" ${state.selectedIds.length ? '' : 'disabled'} style="border:none;background:${state.selectedIds.length ? '#7c3aed' : '#cbd5e1'};color:white;border-radius:8px;padding:9px 14px;font-weight:900;cursor:${state.selectedIds.length ? 'pointer' : 'not-allowed'};">回答する</button></div>` : ''}
    ${feedback}`;
}


function renderIftySciencePracticeOrderQuestion(question) {
  const state = iftySciencePracticeState;
  if (!state.orderIds.length) state.orderIds = (question.events || []).map(event => event.id);
  const eventMap = new Map((question.events || []).map(event => [String(event.id), event]));
  const rows = state.orderIds.map((id, index) => {
    const event = eventMap.get(String(id));
    if (!event) return '';
    const correctPosition = state.answered ? (question.correctOrder || []).indexOf(String(id)) : -1;
    const isCorrectPosition = state.answered && correctPosition === index;
    return `<div style="display:grid;grid-template-columns:34px 1fr auto;gap:8px;align-items:center;padding:9px;border:1px solid ${state.answered ? (isCorrectPosition ? '#86efac' : '#fda4af') : '#cbd5e1'};background:${state.answered ? (isCorrectPosition ? '#f0fdf4' : '#fff1f2') : '#fff'};border-radius:9px;">
      <div style="font-weight:900;color:#64748b;text-align:center;">${index + 1}</div>
      <div style="color:#0f172a;line-height:1.5;">${escapeHtml(event.text)}</div>
      ${state.answered ? '' : `<div style="display:flex;gap:4px;">
        <button type="button" data-ifty-enter-ignore="true" onclick="moveIftySciencePracticeOrder(${index},-1)" ${index === 0 ? 'disabled' : ''} style="border:none;background:#e2e8f0;border-radius:6px;width:34px;height:34px;cursor:${index === 0 ? 'not-allowed' : 'pointer'};">↑</button>
        <button type="button" data-ifty-enter-ignore="true" onclick="moveIftySciencePracticeOrder(${index},1)" ${index === state.orderIds.length - 1 ? 'disabled' : ''} style="border:none;background:#e2e8f0;border-radius:6px;width:34px;height:34px;cursor:${index === state.orderIds.length - 1 ? 'not-allowed' : 'pointer'};">↓</button>
      </div>`}
    </div>`;
  }).join('');
  const correct = state.answered && arraysAsSetsEqual(state.orderIds, question.correctOrder || []) && state.orderIds.every((id, index) => String(id) === String(question.correctOrder[index]));
  return `
    <div style="font-size:1.03em;font-weight:900;color:#0f172a;line-height:1.55;">${escapeHtml(question.prompt)}</div>
    <div style="margin-top:7px;color:#64748b;font-size:.76em;">科学的に正しい過程・因果・手順の順に並べてください。</div>
    <div style="display:grid;gap:7px;margin-top:12px;">${rows}</div>
    ${state.answered ? `<div style="margin-top:12px;padding:11px;border-radius:9px;background:${correct ? '#ecfdf5' : '#fff1f2'};border:1px solid ${correct ? '#86efac' : '#fda4af'};">
      <div style="font-weight:900;color:${correct ? '#166534' : '#9f1239'};">${correct ? '正解' : '不正解'}</div>
      ${question.explanation ? `<div style="margin-top:6px;color:#475569;line-height:1.6;">${escapeHtml(question.explanation)}</div>` : ''}
      ${!correct ? `<div style="margin-top:8px;color:#334155;font-size:.84em;"><strong>正しい順：</strong>${(question.correctOrder || []).map((id, i) => `${i + 1}. ${escapeHtml(eventMap.get(String(id))?.text || '')}`).join(' → ')}</div>` : ''}
      <div style="margin-top:10px;text-align:right;"><button type="button" onclick="nextIftySciencePracticeQuestion()" data-ifty-enter-primary="true" style="border:none;background:#0f766e;color:white;border-radius:8px;padding:8px 13px;font-weight:900;cursor:pointer;">次へ</button></div>
    </div>` : `<div style="text-align:right;margin-top:11px;"><button type="button" onclick="submitIftySciencePracticeOrder()" style="border:none;background:#d97706;color:white;border-radius:8px;padding:9px 14px;font-weight:900;cursor:pointer;">回答する</button></div>`}`;
}

function renderIftySciencePracticeExplanationQuestion(question) {
  const state = iftySciencePracticeState;
  const required = (question.requiredTerms || []).map(term => `<span style="display:inline-block;padding:5px 8px;border-radius:999px;background:#dcfce7;color:#166534;font-weight:900;font-size:.82em;">${escapeHtml(term)}</span>`).join(' ');
  return `
    <div style="font-size:1.03em;font-weight:900;color:#0f172a;line-height:1.55;">${escapeHtml(question.prompt)}</div>
    <div style="margin-top:10px;padding:10px;border:1px solid #bbf7d0;border-radius:9px;background:#f0fdf4;">
      <div style="font-size:.76em;color:#166534;font-weight:900;margin-bottom:6px;">必ず使う語句</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">${required}</div>
    </div>
    ${state.answered ? `<div style="margin-top:12px;padding:11px;border:1px solid ${state.correctLast ? '#86efac' : '#fda4af'};background:${state.correctLast ? '#ecfdf5' : '#fff1f2'};border-radius:9px;">
      <div style="font-weight:900;color:${state.correctLast ? '#166534' : '#9f1239'};">${state.correctLast ? '正解' : '要復習'}${Number.isFinite(Number(state.score)) ? `　${Math.round(Number(state.score))}点` : ''}</div>
      <div style="margin-top:7px;color:#334155;line-height:1.6;white-space:pre-wrap;">${escapeHtml(state.feedback)}</div>
      ${state.modelAnswer ? `<div style="margin-top:9px;padding:9px;background:white;border:1px solid #d1fae5;border-radius:8px;color:#0f172a;line-height:1.6;"><strong>模範：</strong>${escapeHtml(state.modelAnswer)}</div>` : ''}
      <div style="margin-top:10px;text-align:right;"><button type="button" onclick="nextIftySciencePracticeQuestion()" data-ifty-enter-primary="true" style="border:none;background:#0f766e;color:white;border-radius:8px;padding:8px 13px;font-weight:900;cursor:pointer;">次へ</button></div>
    </div>` : `<div style="margin-top:12px;">
      <textarea id="iftySciencePracticeExplanationInput" placeholder="ここに説明を書く" oninput="iftySciencePracticeState.answerText=this.value" style="width:100%;min-height:150px;box-sizing:border-box;padding:11px;border:1px solid #94a3b8;border-radius:9px;font:inherit;line-height:1.6;resize:vertical;">${escapeHtml(state.answerText || '')}</textarea>
      <div id="iftySciencePracticeGradeStatus" style="min-height:1.2em;margin-top:6px;color:#64748b;font-size:.78em;">${state.grading ? 'ALLIAが採点中…' : 'Ctrl/Cmd + Enterでも回答できます。'}</div>
      <div style="text-align:right;margin-top:7px;"><button type="button" onclick="submitIftySciencePracticeExplanation()" ${state.grading ? 'disabled' : ''} style="border:none;background:${state.grading ? '#94a3b8' : '#059669'};color:white;border-radius:8px;padding:9px 14px;font-weight:900;cursor:${state.grading ? 'wait' : 'pointer'};">${state.grading ? '採点中…' : '回答する'}</button></div>
    </div>`}`;
}

function renderIftySciencePracticePlayer() {
  const state = iftySciencePracticeState;
  if (state.index >= state.questions.length) {
    renderIftySciencePracticeResult();
    return;
  }
  const question = getCurrentIftySciencePracticeQuestion();
  if (!question) {
    state.index += 1;
    renderIftySciencePracticePlayer();
    return;
  }
  const meta = getIftySciencePracticeModeMeta(state.mode);
  let body = '';
  if (state.mode === 'simple' || state.mode === 'formula' || state.mode === 'image') body = renderIftySciencePracticeChoiceQuestion(question);
  else if (state.mode === 'order') body = renderIftySciencePracticeOrderQuestion(question);
  else if (state.mode === 'explanation') body = renderIftySciencePracticeExplanationQuestion(question);

  showIftyHubContent(`
    <section class="ifty-portal-shell">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
        <div>
          <h1 class="ifty-portal-title" style="color:${meta.color};">${escapeHtml(meta.title)}</h1>
          <div class="ifty-portal-subtitle">${state.index + 1} / ${state.questions.length}　正解 ${state.correct}　要復習 ${state.wrong}</div>
        </div>
        <button class="ifty-portal-back" type="button" onclick="openIftySciencePractice()">終了</button>
      </div>
      <div style="margin-top:15px;padding:15px;border:1px solid #cbd5e1;border-radius:12px;background:white;">${body}</div>
    </section>
  `, 'science-practice');

  if (state.mode === 'explanation' && !state.answered && !state.grading) {
    const textarea = document.getElementById('iftySciencePracticeExplanationInput');
    if (textarea) {
      textarea.addEventListener('keydown', event => {
        if (event.isComposing) return;
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          window.submitIftySciencePracticeExplanation();
        }
      });
      setTimeout(() => textarea.focus({ preventScroll: true }), 0);
    }
  }
}

window.answerIftySciencePracticeChoice = function(optionId) {
  const state = iftySciencePracticeState;
  const question = getCurrentIftySciencePracticeQuestion();
  if (!question || state.answered) return;
  state.selectedIds = [String(optionId)];
  state.answered = true;
  const correct = arraysAsSetsEqual(state.selectedIds, question.correctIds || []);
  if (correct) state.correct += 1; else state.wrong += 1;
  renderIftySciencePracticePlayer();
};

window.toggleIftySciencePracticeFormulaChoice = function(optionId) {
  const state = iftySciencePracticeState;
  if (state.answered) return;
  const id = String(optionId);
  if (state.selectedIds.includes(id)) state.selectedIds = state.selectedIds.filter(value => value !== id);
  else state.selectedIds = [...state.selectedIds, id];
  renderIftySciencePracticePlayer();
};

window.submitIftySciencePracticeFormula = function() {
  const state = iftySciencePracticeState;
  const question = getCurrentIftySciencePracticeQuestion();
  if (!question || state.answered || !state.selectedIds.length) return;
  state.answered = true;
  const correct = arraysAsSetsEqual(state.selectedIds, question.correctIds || []);
  if (correct) state.correct += 1; else state.wrong += 1;
  renderIftySciencePracticePlayer();
};

window.moveIftySciencePracticeOrder = function(index, direction) {
  const state = iftySciencePracticeState;
  if (state.answered) return;
  const from = Number(index);
  const to = from + Number(direction);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= state.orderIds.length || to >= state.orderIds.length) return;
  [state.orderIds[from], state.orderIds[to]] = [state.orderIds[to], state.orderIds[from]];
  renderIftySciencePracticePlayer();
};

window.submitIftySciencePracticeOrder = function() {
  const state = iftySciencePracticeState;
  const question = getCurrentIftySciencePracticeQuestion();
  if (!question || state.answered) return;
  state.answered = true;
  const correct = state.orderIds.length === (question.correctOrder || []).length
    && state.orderIds.every((id, index) => String(id) === String(question.correctOrder[index]));
  if (correct) state.correct += 1; else state.wrong += 1;
  renderIftySciencePracticePlayer();
};

window.submitIftySciencePracticeExplanation = async function() {
  const state = iftySciencePracticeState;
  const question = getCurrentIftySciencePracticeQuestion();
  if (!question || state.answered || state.grading) return;
  const textarea = document.getElementById('iftySciencePracticeExplanationInput');
  const answer = String(textarea?.value ?? state.answerText ?? '').trim();
  if (!answer) {
    if (textarea) textarea.focus();
    return;
  }
  if (!ensureIftyOnline('理科PRACTICE採点')) return;
  state.answerText = answer;
  state.grading = true;
  const status = document.getElementById('iftySciencePracticeGradeStatus');
  if (status) status.textContent = 'ALLIAが採点中…';
  const button = status?.parentElement?.querySelector('button');
  if (button) button.disabled = true;

  try {
    const target = question.targetItemId ? getIftyScienceItemById(question.targetItemId)?.item : null;
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'science_practice_grade',
        question: {
          prompt: question.prompt,
          title: String(target?.title || ''),
          memoryText: String(target?.memoryText || ''),
          requiredTerms: question.requiredTerms || [],
          referenceAnswer: question.referenceAnswer || '',
          gradingPoints: question.gradingPoints || []
        },
        answer,
        subject: 'SCIENCE',
        order: getIftySubjectOrder('SCIENCE')
      })
    });
    const data = await response.json();
    if (!response.ok) throw alliaHttpError(response, data, '理科PRACTICEの採点に失敗しました。');
    state.grading = false;
    state.answered = true;
    state.correctLast = !!data.correct;
    state.score = Number.isFinite(Number(data.score)) ? Number(data.score) : null;
    state.feedback = String(data.feedback || '').trim();
    state.modelAnswer = String(data.modelAnswer || question.referenceAnswer || '').trim();
    if (state.correctLast) state.correct += 1; else state.wrong += 1;
    renderIftySciencePracticePlayer();
  } catch (error) {
    console.error('理科PRACTICE採点エラー:', error);
    state.grading = false;
    const currentStatus = document.getElementById('iftySciencePracticeGradeStatus');
    if (currentStatus) currentStatus.textContent = String(error.message || error);
    const currentButton = currentStatus?.parentElement?.querySelector('button');
    if (currentButton) currentButton.disabled = false;
  }
};

window.nextIftySciencePracticeQuestion = function() {
  const state = iftySciencePracticeState;
  if (!state.answered) return;
  state.index += 1;
  resetIftySciencePracticeAnswerState();
  const nextQuestion = getCurrentIftySciencePracticeQuestion();
  if (state.mode === 'order' && nextQuestion?.events) state.orderIds = nextQuestion.events.map(event => event.id);
  renderIftySciencePracticePlayer();
};


window.openIftySubject = function(subject) {
  const normalized = normalizeIftySubject(subject);
  currentIftySubject = normalized;
  window.closeIftySideMenu();

  if (normalized === 'ENGLISH') {
    iftyPortalPage = 'vocab';
    window.switchToVocabView();
    return;
  }

  if (normalized === 'SOCIAL STUDIES') {
    renderIftySocialStudiesPage();
    return;
  }

  if (normalized === 'SCIENCE') {
    renderIftySciencePage();
    return;
  }

  const subjectInfo = {
    'ANCIENT': {
      title: 'ANCIENT',
      description: '古文・漢文などを扱う科目ページです。'
    },
    'SCIENCE': {
      title: 'SCIENCE',
      description: '理科系科目を扱う科目ページです。'
    },
    'SOCIAL STUDIES': {
      title: 'SOCIAL STUDIES',
      description: '地理・歴史などを扱う科目ページです。'
    }
  };

  const info = subjectInfo[normalized] || {
    title: normalized || 'SUBJECT',
    description: 'この科目のページです。'
  };

  showIftyHubContent(`
    <section class="ifty-portal-shell">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <h1 class="ifty-portal-title">${escapeHtml(info.title)}</h1>
          <div class="ifty-portal-subtitle">${escapeHtml(info.description)}</div>
        </div>
        <button class="ifty-portal-back" type="button" onclick="openIftyHome()">HOMEへ戻る</button>
      </div>

      <div class="ifty-subject-badge">SUBJECT PAGE</div>

      <div class="ifty-settings-section" style="margin-top:14px;">
        <div class="ifty-settings-row">
          <div>
            <h3>ORDER</h3>
            <div class="ifty-settings-note">${escapeHtml(getIftyOrderStatus(normalized))}。このORDERは${escapeHtml(normalized)}だけに適用されます。</div>
          </div>
          <button class="ifty-settings-action" type="button" onclick="openIftySubjectOrder('${normalized.replace(/'/g, "\'")}')" style="background:#0284c7;color:white;">ORDERを編集</button>
        </div>
      </div>

      <div class="ifty-settings-section">
        <div class="ifty-settings-row">
          <div>
            <h3>${escapeHtml(normalized)} ALLIA</h3>
            <div class="ifty-settings-note">この教科のORDERだけを読み込み、他教科のORDERは参照しません。</div>
          </div>
          <button class="ifty-settings-action" type="button" onclick="openIftySubjectAllia('${normalized.replace(/'/g, "\'")}')" style="background:#7c3aed;color:white;">🤖 ALLIAを開く</button>
        </div>
      </div>

      <div class="ifty-settings-section">
        <h3>この科目の学習機能は今後追加できます。</h3>
        <div class="ifty-settings-note">
          現在は教科別ORDERと教科別ALLIAコンテキストまで利用できます。単語帳などの専用学習機能はまだ追加していません。
        </div>
      </div>
    </section>
  `, 'subject');
};

window.openIftySettings = function() {
  window.closeIftySideMenu();

  const accountLabel = iftyDeveloperMode
    ? 'Developer（端末ローカル）'
    : String((iftyAccount && iftyAccount.username) || currentUser || '未設定');

  const cloudStatus = document.getElementById('iftyCloudStatus');
  const cloudText = iftyDeveloperMode
    ? 'Developerモードではクラウド同期しません。'
    : String((cloudStatus && cloudStatus.textContent) || 'クラウド状態を確認中');

  const themeName = iftyTheme === 'dark' ? 'ダーク' : 'ライト';
  const autosaveText = iftyAutosaveIntervalMinutes > 0
    ? `${iftyAutosaveIntervalMinutes}分ごと`
    : '停止中';

  showIftyHubContent(`
    <section class="ifty-portal-shell">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <h1 class="ifty-portal-title">SETTINGS</h1>
          <div class="ifty-portal-subtitle">IFTYの表示・データ・アカウント設定。</div>
        </div>
        <button class="ifty-portal-back" type="button" onclick="openIftyHome()">HOMEへ戻る</button>
      </div>

      <div class="ifty-settings-section">
        <div class="ifty-settings-row">
          <div>
            <h3>APPEARANCE</h3>
            <div class="ifty-settings-note">現在：${escapeHtml(themeName)}モード</div>
          </div>
          <button class="ifty-settings-action" type="button" onclick="toggleIftyTheme(); openIftySettings();" style="background:#334155;color:white;">
            ${iftyTheme === 'dark' ? '☀️ ライトへ' : '🌙 ダークへ'}
          </button>
        </div>
      </div>

      <div class="ifty-settings-section">
        <h3>PROFILE IMAGE</h3>
        <div class="ifty-settings-note">左上のメニューボタンに表示するプロフィール画像です。プリセットまたは自分の画像を使用できます。</div>
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:12px;">
          <img src="${getIftyProfileImageSrc()}" alt="プロフィール" style="width:74px;height:74px;border-radius:50%;object-fit:cover;border:2px solid #cbd5e1;background:white;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${IFTY_PROFILE_PRESETS.map((preset,index) => `<button type="button" onclick="setIftyProfilePreset(${index})" title="プリセット ${index+1}" style="width:48px;height:48px;padding:0;border:2px solid #cbd5e1;border-radius:50%;overflow:hidden;background:white;cursor:pointer;"><img src="${makeIftyPresetAvatar(preset[0],preset[1])}" alt="" style="width:100%;height:100%;object-fit:cover;"></button>`).join('')}
          </div>
        </div>
        <div style="margin-top:12px;">
          <input id="iftyProfileImageInput" type="file" accept="image/*" onchange="handleIftyProfileImageUpload(this)" style="display:none;">
          <button class="ifty-settings-action" type="button" onclick="chooseIftyProfileImage()" style="background:#0f766e;color:white;">画像で置き換える</button>
        </div>
      </div>

      <div class="ifty-settings-section">
        <h3>HOME SCREEN ICON</h3>
        <div class="ifty-settings-note">ホーム画面用アイコンは無限マークのみ。背景を白または黒から選べます。</div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:12px;">
          <button type="button" onclick="setIftyHomeIconBackground('white')" style="padding:8px;border:${getIftyHomeIconBackground()==='white'?'3px solid #14b8a6':'1px solid #94a3b8'};border-radius:12px;background:white;cursor:pointer;"><img src="${IFTY_HOME_ICON_PATHS.white}" alt="白背景" style="width:68px;height:68px;border-radius:12px;display:block;"><span style="display:block;margin-top:5px;font-weight:800;color:#0f172a;">白</span></button>
          <button type="button" onclick="setIftyHomeIconBackground('black')" style="padding:8px;border:${getIftyHomeIconBackground()==='black'?'3px solid #14b8a6':'1px solid #94a3b8'};border-radius:12px;background:#111827;cursor:pointer;"><img src="${IFTY_HOME_ICON_PATHS.black}" alt="黒背景" style="width:68px;height:68px;border-radius:12px;display:block;"><span style="display:block;margin-top:5px;font-weight:800;color:white;">黒</span></button>
        </div>
        <div class="ifty-settings-note" style="margin-top:8px;">設定後にSafariからホーム画面へ追加すると選択中のアイコンを使います。iPhone / iPadですでに追加済みのIFTYはアイコンだけを後から差し替えられないため、変更する場合はホーム画面のIFTYを削除してからSafariで再追加してください。</div>
      </div>

      <div class="ifty-settings-section">
        <h3>ORDER</h3>
        <div class="ifty-settings-note">
          教科ごとのALLIA・AI生成機能にだけ適用するカスタム指示です。VOCABULARYのORDERをSCIENCEなどが読むことはありません。
        </div>
        <div style="display:grid;gap:8px;margin-top:11px;">
          ${renderIftyOrderSettingsCards()}
        </div>
      </div>

      <div class="ifty-settings-section">
        <h3>DAILY STUDY GOAL</h3>
        <div class="ifty-settings-note">1日に学習する単語数の目標です。学習統計とHOMEの進捗表示に使います。現在：${iftyDailyGoalWords}語。</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:11px;">
          <input id="iftyDailyGoalWordsInput" type="number" min="${IFTY_DAILY_GOAL_MIN_WORDS}" max="${IFTY_DAILY_GOAL_MAX_WORDS}" step="1" value="${iftyDailyGoalWords}" inputmode="numeric" style="width:90px;padding:9px 10px;border:1px solid #94a3b8;border-radius:8px;font-size:1em;">
          <span style="font-weight:800;">語 / 日</span>
          <button class="ifty-settings-action" type="button" onclick="applyIftyDailyGoalSettingFromUi()" style="background:#0f766e;color:white;">変更</button>
        </div>
        <div class="ifty-settings-note" style="margin-top:8px;">${IFTY_DAILY_GOAL_MIN_WORDS}〜${IFTY_DAILY_GOAL_MAX_WORDS}語で設定できます。</div>
      </div>

      <div class="ifty-settings-section">
        <h3>AUTO SAVE FREQUENCY</h3>
        <div class="ifty-settings-note">現在：${escapeHtml(autosaveText)}。この端末・このIFTYユーザーのPERIODIC保存間隔です。</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:11px;">
          <input id="iftyAutosaveMinutesInput" type="number" min="${IFTY_AUTOSAVE_MIN_MINUTES}" max="${IFTY_AUTOSAVE_MAX_MINUTES}" step="1" value="${iftyAutosaveIntervalMinutes > 0 ? iftyAutosaveIntervalMinutes : IFTY_AUTOSAVE_DEFAULT_MINUTES}" inputmode="numeric" style="width:90px;padding:9px 10px;border:1px solid #94a3b8;border-radius:8px;font-size:1em;">
          <span style="font-weight:800;">分ごと</span>
          <button class="ifty-settings-action" type="button" onclick="applyIftyAutosaveSettingFromUi()" style="background:#0284c7;color:white;">変更</button>
          <button class="ifty-settings-action" type="button" onclick="disableIftyAutosaveFromUi()" style="background:#64748b;color:white;">停止</button>
        </div>
        <div class="ifty-settings-note" style="margin-top:8px;">1〜240分で自由に設定できます。停止中でもMANUAL保存は使えます。</div>
      </div>

      <div class="ifty-settings-section">
        <h3>SPELLING SUGGESTION</h3>
        <div class="ifty-settings-note">「もしかして」が表示されたあと、応答がなければ候補の単語を自動追加します。現在：${iftySpellingAutoAcceptSeconds}秒。</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:11px;">
          <input id="iftySpellingAutoAcceptSecondsInput" type="number" min="${IFTY_SPELLING_AUTO_ACCEPT_MIN_SECONDS}" max="${IFTY_SPELLING_AUTO_ACCEPT_MAX_SECONDS}" step="1" value="${iftySpellingAutoAcceptSeconds}" inputmode="numeric" style="width:90px;padding:9px 10px;border:1px solid #94a3b8;border-radius:8px;font-size:1em;">
          <span style="font-weight:800;">秒後</span>
          <button class="ifty-settings-action" type="button" onclick="applyIftySpellingAutoAcceptSettingFromUi()" style="background:#0284c7;color:white;">変更</button>
        </div>
        <div class="ifty-settings-note" style="margin-top:8px;">${IFTY_SPELLING_AUTO_ACCEPT_MIN_SECONDS}〜${IFTY_SPELLING_AUTO_ACCEPT_MAX_SECONDS}秒で設定できます。</div>
      </div>

      <div class="ifty-settings-section">
        <div class="ifty-settings-row">
          <div>
            <h3>BACKUP / RESTORE</h3>
            <div class="ifty-settings-note">PERIODICはオートセーブ1件を上書き。MANUALは手動保存を複数残します。</div>
          </div>
          <button class="ifty-settings-action" type="button" onclick="openIftyRecoveryCenter()" style="background:#0f766e;color:white;">🛟 開く</button>
        </div>
      </div>

      <div class="ifty-settings-section">
        <h3>ACCOUNT</h3>
        <div style="font-weight:900;margin-bottom:4px;">${escapeHtml(accountLabel)}</div>
        <div class="ifty-settings-note">${escapeHtml(cloudText)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
          <button class="ifty-settings-action" type="button" onclick="logout()" style="background:#e11d48;color:white;">LOG OUT</button>
        </div>
      </div>

      <div class="ifty-settings-section">
        <h3>ACCOUNT SECURITY</h3>
        <div id="iftyAccountSecurityPanel" class="ifty-settings-note">
          ${iftyDeveloperMode ? 'Developerモードではアカウント管理機能を使用しません。' : 'アカウント情報を読み込み中…'}
        </div>
      </div>

      <div class="ifty-settings-note" style="margin-top:14px;">IFTY Q3 STEP31</div>
    </section>
  `, 'settings');

  if (!iftyDeveloperMode) {
    refreshIftyAccountSecurityPanel().catch(error => {
      const panel = document.getElementById('iftyAccountSecurityPanel');
      if (panel) panel.innerHTML = `<span style="color:#dc2626;">アカウント情報を読み込めません：${escapeHtml(String(error.message || error))}</span>`;
    });
  }
};

function ensureIftyBrandUi() {
  if (!document.getElementById('iftyGlobalLogo')) {
    const logo = document.createElement('button');
    logo.id = 'iftyGlobalLogo';
    logo.type = 'button';
    logo.title = 'IFTYメニュー';
    logo.onclick = event => window.toggleIftySideMenu(event);
    logo.style.cssText = 'position:fixed;left:10px;top:10px;width:58px;height:58px;padding:0;border:2px solid rgba(255,255,255,.75);background:#fff;border-radius:50%;overflow:hidden;cursor:pointer;z-index:12090;box-shadow:0 5px 18px rgba(0,0,0,.28);pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
    const logoImg = document.createElement('img');
    logoImg.src = getIftyProfileImageSrc();
    logoImg.alt = 'プロフィール';
    logoImg.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    logo.appendChild(logoImg);
    document.body.appendChild(logo);
  }

  const globalLogo = document.getElementById('iftyGlobalLogo');
  if (globalLogo) {
    globalLogo.title = 'IFTYメニュー';
    globalLogo.onclick = event => window.toggleIftySideMenu(event);
    globalLogo.style.pointerEvents = 'auto';
    globalLogo.style.touchAction = 'manipulation';
  }

  if (!document.getElementById('iftyQuickControls')) {
    const controls = document.createElement('div');
    controls.id = 'iftyQuickControls';
    controls.style.cssText = 'position:fixed;right:10px;top:10px;display:flex;gap:5px;z-index:10090;';
    controls.innerHTML = `
      <button id="iftyUndoBtn" onclick="undoIfty()" title="取り消し Ctrl/⌘ + Z" style="width:38px;height:38px;border:none;border-radius:9px;background:#334155;color:white;font-size:1.05em;cursor:pointer;">↶</button>
      <button id="iftyRedoBtn" onclick="redoIfty()" title="やり直し Ctrl + Y / ⌘ + Shift + Z" style="width:38px;height:38px;border:none;border-radius:9px;background:#334155;color:white;font-size:1.05em;cursor:pointer;">↷</button>
      <button id="iftyRecoveryBtn" onclick="openIftyRecoveryCenter()" title="バックアップ / 復元" style="width:38px;height:38px;border:none;border-radius:9px;background:#334155;color:white;font-size:1em;cursor:pointer;">🛟</button>
      <button id="iftyThemeBtn" onclick="toggleIftyTheme()" title="ライト / ダーク" style="width:38px;height:38px;border:none;border-radius:9px;background:#334155;color:white;font-size:1em;cursor:pointer;">☀️</button>`;
    document.body.appendChild(controls);
  }

  const landingPage = document.getElementById('landingPage');
  if (landingPage && !document.getElementById('iftyLoginLogo')) {
    const img = document.createElement('img');
    img.id = 'iftyLoginLogo';
    img.src = IFTY_LOGO_PATH;
    img.alt = 'IFTY';
    img.onerror = function() {
      img.onerror = null;
      img.src = IFTY_LOGO_FALLBACK_DATA;
    };
    img.style.cssText = 'display:block;width:min(440px,80vw);max-height:46vh;object-fit:contain;margin:10px auto 24px;';
    landingPage.insertBefore(img, landingPage.firstChild);
  }

  applyIftyProfileVisual();
  applyIftyHomeIcon();
  applyIftyTheme();
  updateUndoRedoButtons();
}


// ==========================================
// Q3 STEP9：世代オートバックアップ / 復元センター
// ==========================================
function openIftyRecoveryDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDBが利用できません。'));
      return;
    }

    const request = indexedDB.open(IFTY_RECOVERY_DB_NAME, IFTY_RECOVERY_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IFTY_RECOVERY_STORE)) {
        const store = db.createObjectStore(IFTY_RECOVERY_STORE, { keyPath: 'id' });
        store.createIndex('user', 'user', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(IFTY_GENERATED_WORD_CACHE_STORE)) {
        const cacheStore = db.createObjectStore(IFTY_GENERATED_WORD_CACHE_STORE, { keyPath: 'id' });
        cacheStore.createIndex('user', 'user', { unique: false });
        cacheStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('バックアップ領域を開けませんでした。'));
  });
}

function idbRequestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('保存処理に失敗しました。'));
  });
}

function idbTransactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('保存処理に失敗しました。'));
    transaction.onabort = () => reject(transaction.error || new Error('保存処理が中断されました。'));
  });
}


// ==========================================
// Q3 STEP18：生成済み語彙データの端末ローカル再利用
// 同じIFTYユーザー + VOCABULARY + 同じ語彙 + 同じORDER のときだけ再利用する。
// ==========================================
function normalizeIftyGeneratedWordKey(word) {
  return String(word || '').normalize('NFKC').trim().toLowerCase();
}

function hashIftyGeneratedCacheText(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function getIftyGeneratedWordCacheId(username, subject, wordKey, order) {
  return [
    'gword',
    hashIftyGeneratedCacheText(username),
    normalizeIftySubject(subject),
    hashIftyGeneratedCacheText(wordKey),
    hashIftyGeneratedCacheText(order)
  ].join(':');
}

function sanitizeIftyGeneratedWordData(data) {
  if (!data || typeof data !== 'object') return null;
  const safe = {};
  const fields = [
    'word', 'language', 'languageCode', 'pronunciationSystem', 'pronunciation', 'partOfSpeech', 'transitivity', 'countability',
    'meanings', 'meaning', 'examples', 'details', 'derivatives', 'forms', 'quizAnswers'
  ];
  fields.forEach(key => {
    if (typeof data[key] !== 'undefined') safe[key] = deepClone(data[key]);
  });
  if (!safe.word && !safe.meanings && !safe.meaning) return null;
  return safe;
}

async function getIftyGeneratedWordCache(wordText, subject = 'ENGLISH', order = '') {
  if (!('indexedDB' in window)) return null;
  const user = String(currentUser || 'default_user');
  const normalizedSubject = normalizeIftySubject(subject);
  const wordKey = normalizeIftyGeneratedWordKey(wordText);
  const normalizedOrder = String(order || '').trim();
  if (!wordKey) return null;

  const id = getIftyGeneratedWordCacheId(user, normalizedSubject, wordKey, normalizedOrder);
  try {
    const db = await openIftyRecoveryDb();
    try {
      if (!db.objectStoreNames.contains(IFTY_GENERATED_WORD_CACHE_STORE)) return null;
      const transaction = db.transaction(IFTY_GENERATED_WORD_CACHE_STORE, 'readonly');
      const record = await idbRequestPromise(transaction.objectStore(IFTY_GENERATED_WORD_CACHE_STORE).get(id));
      if (!record) return null;
      if (record.user !== user || record.subject !== normalizedSubject || record.wordKey !== wordKey || String(record.order || '') !== normalizedOrder) return null;
      return sanitizeIftyGeneratedWordData(record.data);
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn('単語生成キャッシュ読込エラー:', error);
    return null;
  }
}

async function saveIftyGeneratedWordCache(wordText, data, subject = 'ENGLISH', order = '') {
  if (!('indexedDB' in window)) return;
  const safeData = sanitizeIftyGeneratedWordData(data);
  if (!safeData) return;

  const user = String(currentUser || 'default_user');
  const normalizedSubject = normalizeIftySubject(subject);
  const wordKey = normalizeIftyGeneratedWordKey(wordText);
  const normalizedOrder = String(order || '').trim();
  if (!wordKey) return;

  const record = {
    id: getIftyGeneratedWordCacheId(user, normalizedSubject, wordKey, normalizedOrder),
    user,
    subject: normalizedSubject,
    wordKey,
    order: normalizedOrder,
    data: safeData,
    updatedAt: Date.now()
  };

  try {
    const db = await openIftyRecoveryDb();
    try {
      if (!db.objectStoreNames.contains(IFTY_GENERATED_WORD_CACHE_STORE)) return;
      const transaction = db.transaction(IFTY_GENERATED_WORD_CACHE_STORE, 'readwrite');
      transaction.objectStore(IFTY_GENERATED_WORD_CACHE_STORE).put(record);
      await idbTransactionDone(transaction);
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn('単語生成キャッシュ保存エラー:', error);
  }
}

function makeIftyWordDataFromStoredWord(word) {
  if (!word || typeof word !== 'object') return null;
  const meanings = Array.isArray(word.meanings) ? word.meanings : (word.meanings ? [word.meanings] : []);
  if (!word.word || !meanings.length) return null;
  if (meanings.some(value => /生成中|AI生成に失敗/.test(String(value || '')))) return null;
  return sanitizeIftyGeneratedWordData(word);
}

function findIftyReusableStoredWordData(wordText, subject = 'ENGLISH', order = '') {
  const wordKey = normalizeIftyGeneratedWordKey(wordText);
  const normalizedSubject = normalizeIftySubject(subject);
  const normalizedOrder = String(order || '').trim();
  if (!wordKey) return null;

  for (const folder of folders) {
    const words = folder && Array.isArray(folder.words) ? folder.words : [];
    for (const word of words) {
      if (normalizeIftyGeneratedWordKey(word && word.word) !== wordKey) continue;

      const meta = word && word.generationMeta && typeof word.generationMeta === 'object' ? word.generationMeta : null;
      if (meta) {
        if (normalizeIftySubject(meta.subject) !== normalizedSubject) continue;
        if (String(meta.order || '').trim() !== normalizedOrder) continue;
      } else if (normalizedOrder) {
        // STEP18以前の単語は生成時ORDERが不明。ORDERありの場合は誤再利用しない。
        continue;
      }

      const data = makeIftyWordDataFromStoredWord(word);
      if (data) return data;
    }
  }
  return null;
}

async function resolveIftyReusableWordData(wordText, subject = 'ENGLISH', order = '') {
  const cached = await getIftyGeneratedWordCache(wordText, subject, order);
  if (cached) return { data: cached, source: 'local-cache' };

  const stored = findIftyReusableStoredWordData(wordText, subject, order);
  if (stored) {
    saveIftyGeneratedWordCache(wordText, stored, subject, order).catch(() => {});
    return { data: stored, source: 'existing-ifty-data' };
  }
  return null;
}

function sanitizeChatSessionsForBackup() {
  const safeSessions = deepClone(Array.isArray(chatSessions) ? chatSessions : []);
  safeSessions.forEach(session => {
    if (!Array.isArray(session.messages)) session.messages = [];
    session.messages = session.messages.filter(message => !message || !message.temporaryThinking);
  });
  return safeSessions;
}

function captureIftyRecoveryPayload() {
  return {
    schemaVersion: 1,
    appVersion: 'Q3_STEP18',
    savedAt: Date.now(),
    currentUser: currentUser,
    folders: deepClone(Array.isArray(folders) ? folders : []),
    practiceData: deepClone(practiceData || { schemaVersion: 1, modules: {} }),
    chatSessions: sanitizeChatSessionsForBackup(),
    currentChatSessionId: currentChatSessionId || null,
    subjectOrders: deepClone(normalizeIftySubjectOrders(iftySubjectOrders)),
    subjectOrderUpdatedAt: deepClone(normalizeIftySubjectOrderMeta(iftySubjectOrderUpdatedAt)),
    iftyTheme: iftyTheme
  };
}

function makeIftyRecoveryFingerprint(payload) {
  const stable = JSON.stringify({
    currentUser: payload.currentUser,
    folders: payload.folders,
    practiceData: payload.practiceData,
    chatSessions: payload.chatSessions,
    currentChatSessionId: payload.currentChatSessionId,
    subjectOrders: payload.subjectOrders,
    subjectOrderUpdatedAt: payload.subjectOrderUpdatedAt,
    iftyTheme: payload.iftyTheme
  });

  let hash = 2166136261;
  for (let i = 0; i < stable.length; i++) {
    hash ^= stable.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16) + ':' + stable.length;
}

function countIftyRecoveryContents(payload) {
  const savedFolders = Array.isArray(payload && payload.folders) ? payload.folders : [];
  const wordCount = savedFolders.reduce((sum, folder) => sum + (Array.isArray(folder.words) ? folder.words.length : 0), 0);
  const flashSets = payload && payload.practiceData && payload.practiceData.modules && payload.practiceData.modules.flashcards && Array.isArray(payload.practiceData.modules.flashcards.sets)
    ? payload.practiceData.modules.flashcards.sets.length : 0;
  const quizSets = payload && payload.practiceData && payload.practiceData.modules && payload.practiceData.modules.questions && Array.isArray(payload.practiceData.modules.questions.sets)
    ? payload.practiceData.modules.questions.sets.length : 0;
  const chats = Array.isArray(payload && payload.chatSessions) ? payload.chatSessions : [];
  const messageCount = chats.reduce((sum, session) => sum + (Array.isArray(session.messages) ? session.messages.length : 0), 0);
  return { folders: savedFolders.length, words: wordCount, flashSets, quizSets, chats: chats.length, messages: messageCount };
}

function getIftyAutosaveSettingKey(username = currentUser) {
  return IFTY_AUTOSAVE_SETTING_PREFIX + String(username || 'default_user');
}

function getIftyPeriodicBackupId(username = currentUser) {
  return IFTY_PERIODIC_BACKUP_PREFIX + String(username || 'default_user');
}

function normalizeIftyRecoveryKind(record) {
  if (record && record.kind === 'PERIODIC') return 'PERIODIC';
  return 'MANUAL';
}

function loadIftyAutosavePreference() {
  const raw = localStorage.getItem(getIftyAutosaveSettingKey());
  if (raw === null || raw === '') {
    iftyAutosaveIntervalMinutes = IFTY_AUTOSAVE_DEFAULT_MINUTES;
    return iftyAutosaveIntervalMinutes;
  }
  const value = Number(raw);
  if (value === 0) {
    iftyAutosaveIntervalMinutes = 0;
    return 0;
  }
  if (!Number.isFinite(value)) {
    iftyAutosaveIntervalMinutes = IFTY_AUTOSAVE_DEFAULT_MINUTES;
    return iftyAutosaveIntervalMinutes;
  }
  iftyAutosaveIntervalMinutes = Math.min(IFTY_AUTOSAVE_MAX_MINUTES, Math.max(IFTY_AUTOSAVE_MIN_MINUTES, Math.round(value)));
  return iftyAutosaveIntervalMinutes;
}

window.applyIftyAutosaveSettingFromUi = function() {
  const input = document.getElementById('iftyAutosaveMinutesInput');
  const value = Number(input && input.value);
  if (!Number.isFinite(value) || value < IFTY_AUTOSAVE_MIN_MINUTES || value > IFTY_AUTOSAVE_MAX_MINUTES) {
    alert(`オートセーブ間隔は${IFTY_AUTOSAVE_MIN_MINUTES}〜${IFTY_AUTOSAVE_MAX_MINUTES}分で入力してください。`);
    return;
  }
  iftyAutosaveIntervalMinutes = Math.round(value);
  localStorage.setItem(getIftyAutosaveSettingKey(), String(iftyAutosaveIntervalMinutes));
  startIftyAutoBackup();
  window.openIftySettings();
};

window.disableIftyAutosaveFromUi = function() {
  iftyAutosaveIntervalMinutes = 0;
  localStorage.setItem(getIftyAutosaveSettingKey(), '0');
  startIftyAutoBackup();
  window.openIftySettings();
};

function getIftySpellingAutoAcceptSettingKey(username = currentUser) {
  return IFTY_SPELLING_AUTO_ACCEPT_SETTING_PREFIX + String(username || 'default_user');
}

function loadIftySpellingAutoAcceptPreference() {
  const raw = localStorage.getItem(getIftySpellingAutoAcceptSettingKey());
  const value = Number(raw);
  if (!Number.isFinite(value) || value < IFTY_SPELLING_AUTO_ACCEPT_MIN_SECONDS || value > IFTY_SPELLING_AUTO_ACCEPT_MAX_SECONDS) {
    iftySpellingAutoAcceptSeconds = IFTY_SPELLING_AUTO_ACCEPT_DEFAULT_SECONDS;
    return iftySpellingAutoAcceptSeconds;
  }
  iftySpellingAutoAcceptSeconds = Math.round(value);
  return iftySpellingAutoAcceptSeconds;
}

window.applyIftySpellingAutoAcceptSettingFromUi = function() {
  const input = document.getElementById('iftySpellingAutoAcceptSecondsInput');
  const value = Number(input && input.value);
  if (!Number.isFinite(value) || value < IFTY_SPELLING_AUTO_ACCEPT_MIN_SECONDS || value > IFTY_SPELLING_AUTO_ACCEPT_MAX_SECONDS) {
    alert(`「もしかして」の自動確定時間は${IFTY_SPELLING_AUTO_ACCEPT_MIN_SECONDS}〜${IFTY_SPELLING_AUTO_ACCEPT_MAX_SECONDS}秒で入力してください。`);
    return;
  }
  iftySpellingAutoAcceptSeconds = Math.round(value);
  localStorage.setItem(getIftySpellingAutoAcceptSettingKey(), String(iftySpellingAutoAcceptSeconds));
  rescheduleAllIftySpellingSuggestionTimers();
  window.openIftySettings();
};

function getIftyDailyGoalSettingKey(username = currentUser) {
  return IFTY_DAILY_GOAL_SETTING_PREFIX + String(username || 'default_user');
}

function loadIftyDailyGoalPreference() {
  const raw = localStorage.getItem(getIftyDailyGoalSettingKey());
  const value = Number(raw);
  if (!Number.isFinite(value) || value < IFTY_DAILY_GOAL_MIN_WORDS || value > IFTY_DAILY_GOAL_MAX_WORDS) {
    iftyDailyGoalWords = IFTY_DAILY_GOAL_DEFAULT_WORDS;
    return iftyDailyGoalWords;
  }
  iftyDailyGoalWords = Math.round(value);
  return iftyDailyGoalWords;
}

window.applyIftyDailyGoalSettingFromUi = function() {
  const input = document.getElementById('iftyDailyGoalWordsInput');
  const value = Number(input && input.value);
  if (!Number.isFinite(value) || value < IFTY_DAILY_GOAL_MIN_WORDS || value > IFTY_DAILY_GOAL_MAX_WORDS) {
    alert(`1日の学習目標は${IFTY_DAILY_GOAL_MIN_WORDS}〜${IFTY_DAILY_GOAL_MAX_WORDS}語で入力してください。`);
    return;
  }
  iftyDailyGoalWords = Math.round(value);
  localStorage.setItem(getIftyDailyGoalSettingKey(), String(iftyDailyGoalWords));
  window.openIftySettings();
};

async function getIftyRecoverySnapshots() {
  const db = await openIftyRecoveryDb();
  try {
    const transaction = db.transaction(IFTY_RECOVERY_STORE, 'readonly');
    const store = transaction.objectStore(IFTY_RECOVERY_STORE);
    const all = await idbRequestPromise(store.getAll());
    const own = (Array.isArray(all) ? all : []).filter(item => item && item.user === currentUser);
    return own.sort((a, b) => {
      const ak = normalizeIftyRecoveryKind(a);
      const bk = normalizeIftyRecoveryKind(b);
      if (ak === 'PERIODIC' && bk !== 'PERIODIC') return -1;
      if (bk === 'PERIODIC' && ak !== 'PERIODIC') return 1;
      return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    });
  } finally {
    db.close();
  }
}

async function migrateLegacyIftyRecoverySnapshots() {
  if (iftyLegacyRecoveryMigrationDoneForUser === currentUser) return;
  iftyLegacyRecoveryMigrationDoneForUser = currentUser;

  const db = await openIftyRecoveryDb();
  try {
    const readTransaction = db.transaction(IFTY_RECOVERY_STORE, 'readonly');
    const all = await idbRequestPromise(readTransaction.objectStore(IFTY_RECOVERY_STORE).getAll());
    const own = (Array.isArray(all) ? all : []).filter(item => item && item.user === currentUser);
    const legacyAutoReasons = new Set(['自動保存', '起動時', 'バックグラウンド移行']);
    const legacyAuto = own
      .filter(item => item.kind !== 'PERIODIC' && legacyAutoReasons.has(String(item.reason || '')))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    if (!legacyAuto.length) return;

    const newest = legacyAuto[0];
    const periodic = {
      ...newest,
      id: getIftyPeriodicBackupId(),
      user: currentUser,
      kind: 'PERIODIC',
      reason: 'オートセーブ'
    };

    const transaction = db.transaction(IFTY_RECOVERY_STORE, 'readwrite');
    const store = transaction.objectStore(IFTY_RECOVERY_STORE);
    store.put(periodic);
    legacyAuto.forEach(item => store.delete(item.id));
    await idbTransactionDone(transaction);
  } finally {
    db.close();
  }
}

async function pruneIftyRecoverySnapshots() {
  const db = await openIftyRecoveryDb();
  try {
    const readTransaction = db.transaction(IFTY_RECOVERY_STORE, 'readonly');
    const store = readTransaction.objectStore(IFTY_RECOVERY_STORE);
    const all = await idbRequestPromise(store.getAll());
    const manual = (Array.isArray(all) ? all : [])
      .filter(item => item && item.user === currentUser && normalizeIftyRecoveryKind(item) === 'MANUAL')
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

    const excess = manual.slice(IFTY_RECOVERY_MAX_MANUAL_SNAPSHOTS);
    if (!excess.length) return;

    const deleteTransaction = db.transaction(IFTY_RECOVERY_STORE, 'readwrite');
    const deleteStore = deleteTransaction.objectStore(IFTY_RECOVERY_STORE);
    excess.forEach(item => deleteStore.delete(item.id));
    await idbTransactionDone(deleteTransaction);
  } finally {
    db.close();
  }
}

function setIftyRecoveryButtonStatus(savedAt) {
  const button = document.getElementById('iftyRecoveryBtn');
  if (!button) return;
  if (!savedAt) {
    button.title = 'バックアップ / 復元';
    return;
  }
  const date = new Date(savedAt);
  button.title = `バックアップ / 復元（最終保存 ${date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}）`;
}

async function createIftyRecoverySnapshot(reason = '手動保存', options = {}) {
  const kind = options.kind === 'PERIODIC' ? 'PERIODIC' : 'MANUAL';
  const payload = captureIftyRecoveryPayload();
  const hash = makeIftyRecoveryFingerprint(payload);
  if (kind === 'PERIODIC' && !options.force && hash === iftyLastBackupHash) return null;

  const createdAt = Date.now();
  const record = {
    id: kind === 'PERIODIC'
      ? getIftyPeriodicBackupId()
      : `recovery_${createdAt}_${Math.random().toString(36).slice(2, 8)}`,
    user: currentUser,
    createdAt,
    kind,
    reason: String(reason || (kind === 'PERIODIC' ? 'オートセーブ' : '手動保存')),
    hash,
    payload
  };

  const db = await openIftyRecoveryDb();
  try {
    const transaction = db.transaction(IFTY_RECOVERY_STORE, 'readwrite');
    transaction.objectStore(IFTY_RECOVERY_STORE).put(record);
    await idbTransactionDone(transaction);
  } finally {
    db.close();
  }

  if (kind === 'PERIODIC') iftyLastBackupHash = hash;
  setIftyRecoveryButtonStatus(createdAt);
  if (kind === 'MANUAL') await pruneIftyRecoverySnapshots();
  return record;
}

function formatIftyRecoveryTime(timestamp) {
  const date = new Date(Number(timestamp || 0));
  if (Number.isNaN(date.getTime())) return '日時不明';
  return date.toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function ensureIftyRecoveryModal() {
  let modal = document.getElementById('iftyRecoveryModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'iftyRecoveryModal';
  modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(2,6,23,.78);z-index:10120;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;';
  modal.innerHTML = `
    <div style="background:white;color:#0f172a;width:min(720px,96vw);max-height:88vh;overflow:auto;border-radius:14px;padding:18px;box-shadow:0 18px 50px rgba(0,0,0,.35);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;">
        <div>
          <div style="font-size:1.25em;font-weight:800;">🛟 バックアップ / 復元</div>
          <div style="font-size:.82em;color:#64748b;margin-top:3px;">PERIODICはオートセーブ1件を上書き、MANUALは手動保存を複数保持します。</div>
        </div>
        <button onclick="closeIftyRecoveryCenter()" style="border:none;background:#e2e8f0;color:#0f172a;border-radius:8px;padding:8px 11px;cursor:pointer;">✕</button>
      </div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px;">
        <button onclick="createManualIftyBackup()" style="border:none;background:#0284c7;color:white;border-radius:8px;padding:9px 12px;font-weight:700;cursor:pointer;">💾 MANUALを作成</button>
        <button onclick="exportIftyBackupFile()" style="border:none;background:#334155;color:white;border-radius:8px;padding:9px 12px;font-weight:700;cursor:pointer;">⬇️ ファイル書き出し</button>
        <button onclick="document.getElementById('iftyBackupImportInput').click()" style="border:none;background:#475569;color:white;border-radius:8px;padding:9px 12px;font-weight:700;cursor:pointer;">⬆️ ファイルから復元</button>
        <button onclick="deleteAllIftyRecoverySnapshots()" style="border:none;background:#b91c1c;color:white;border-radius:8px;padding:9px 12px;font-weight:700;cursor:pointer;">🗑️ 端末内バックアップを全削除</button>
        <input id="iftyBackupImportInput" type="file" accept="application/json,.json" style="display:none;" onchange="handleIftyBackupImport(event)">
      </div>
      <div style="font-size:.78em;color:#64748b;margin-bottom:12px;line-height:1.5;">PERIODICは常に最上部に固定されます。復元の直前には現在状態をMANUALとして緊急保存します。重要な保存は「ファイル書き出し」も利用できます。</div>
      <div id="iftyRecoveryList"><div style="padding:18px;text-align:center;color:#64748b;">読み込み中…</div></div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

function renderIftyRecoveryCard(snapshot, label, accent) {
  const counts = countIftyRecoveryContents(snapshot.payload || {});
  return `
    <div style="border:1px solid ${accent};border-radius:10px;padding:11px 12px;margin-bottom:8px;background:#f8fafc;">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
        <div style="min-width:0;">
          <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;font-weight:800;">
            <span style="background:${label === 'PERIODIC' ? '#dbeafe' : '#ede9fe'};color:${label === 'PERIODIC' ? '#1d4ed8' : '#6d28d9'};padding:2px 7px;border-radius:999px;font-size:.72em;font-weight:900;">${label}</span>
            ${escapeHtml(formatIftyRecoveryTime(snapshot.createdAt))}
          </div>
          <div style="font-size:.78em;color:#64748b;margin-top:3px;">${escapeHtml(snapshot.reason || '保存')} ・ フォルダ ${counts.folders} / 単語 ${counts.words} / Flash ${counts.flashSets} / Quiz ${counts.quizSets} / Chat ${counts.chats}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
          <button onclick="restoreIftyRecoverySnapshot('${snapshot.id}')" style="border:none;background:#0f766e;color:white;border-radius:8px;padding:8px 10px;font-weight:700;cursor:pointer;white-space:nowrap;">この状態に復元</button>
          <button onclick="deleteIftyRecoverySnapshot('${snapshot.id}')" style="border:none;background:#dc2626;color:white;border-radius:8px;padding:8px 10px;font-weight:700;cursor:pointer;white-space:nowrap;">削除</button>
        </div>
      </div>
    </div>`;
}

async function renderIftyRecoveryCenter() {
  const container = document.getElementById('iftyRecoveryList');
  if (!container) return;
  container.innerHTML = '<div style="padding:18px;text-align:center;color:#64748b;">読み込み中…</div>';

  try {
    await migrateLegacyIftyRecoverySnapshots();
    const snapshots = await getIftyRecoverySnapshots();
    const periodic = snapshots.find(snapshot => normalizeIftyRecoveryKind(snapshot) === 'PERIODIC') || null;
    const manual = snapshots.filter(snapshot => normalizeIftyRecoveryKind(snapshot) === 'MANUAL');

    const periodicHtml = periodic
      ? renderIftyRecoveryCard(periodic, 'PERIODIC', '#93c5fd')
      : `<div style="border:1px dashed #93c5fd;border-radius:10px;padding:14px;margin-bottom:12px;background:#eff6ff;color:#475569;">
           <div style="font-weight:900;color:#1d4ed8;margin-bottom:4px;">PERIODIC</div>
           <div style="font-size:.82em;">${iftyAutosaveIntervalMinutes > 0 ? `次の変更後、最大約${iftyAutosaveIntervalMinutes}分で作成されます。` : 'オートセーブはSETTINGSで停止中です。'}</div>
         </div>`;

    const manualHtml = manual.length
      ? manual.map(snapshot => renderIftyRecoveryCard(snapshot, 'MANUAL', '#c4b5fd')).join('')
      : '<div style="padding:16px;border:1px dashed #cbd5e1;border-radius:10px;text-align:center;color:#64748b;">MANUALはまだありません。「MANUALを作成」で何個でも分けて保存できます（端末内では新しい30件を保持）。</div>';

    container.innerHTML = `
      <div style="position:sticky;top:-18px;z-index:2;background:white;padding-top:2px;padding-bottom:4px;">
        ${periodicHtml}
      </div>
      <div style="font-weight:900;color:#6d28d9;margin:12px 0 7px;">MANUAL</div>
      ${manualHtml}`;
  } catch (error) {
    container.innerHTML = `<div style="padding:16px;border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:10px;">バックアップを読み込めませんでした：${escapeHtml(String(error.message || error))}</div>`;
  }
}

window.openIftyRecoveryCenter = async function() {
  const modal = ensureIftyRecoveryModal();
  modal.style.display = 'flex';
  await renderIftyRecoveryCenter();
};

window.closeIftyRecoveryCenter = function() {
  const modal = document.getElementById('iftyRecoveryModal');
  if (modal) modal.style.display = 'none';
};

window.createManualIftyBackup = async function() {
  try {
    await createIftyRecoverySnapshot('手動保存', { force: true, kind: 'MANUAL' });
    await renderIftyRecoveryCenter();
  } catch (error) {
    alert('バックアップに失敗しました：' + String(error.message || error));
  }
};

async function deleteIftyRecoverySnapshotRecord(snapshotId) {
  const db = await openIftyRecoveryDb();
  try {
    const transaction = db.transaction(IFTY_RECOVERY_STORE, 'readwrite');
    transaction.objectStore(IFTY_RECOVERY_STORE).delete(snapshotId);
    await idbTransactionDone(transaction);
  } finally {
    db.close();
  }
}

async function refreshIftyRecoveryButtonFromSnapshots() {
  const snapshots = await getIftyRecoverySnapshots();
  const latest = snapshots.reduce((best, snapshot) => {
    if (!best) return snapshot;
    return Number(snapshot.createdAt || 0) > Number(best.createdAt || 0) ? snapshot : best;
  }, null);
  setIftyRecoveryButtonStatus(latest ? latest.createdAt : null);
  return snapshots;
}

window.deleteIftyRecoverySnapshot = async function(snapshotId) {
  try {
    const snapshots = await getIftyRecoverySnapshots();
    const snapshot = snapshots.find(item => item.id === snapshotId);
    if (!snapshot) throw new Error('選択したバックアップが見つかりません。');

    const ok = confirm(`${formatIftyRecoveryTime(snapshot.createdAt)} の端末内バックアップを削除します。

現在の単語帳・実践・チャットのデータは削除されません。続けますか？`);
    if (!ok) return;

    await deleteIftyRecoverySnapshotRecord(snapshotId);
    await refreshIftyRecoveryButtonFromSnapshots();
    await renderIftyRecoveryCenter();
  } catch (error) {
    alert('バックアップを削除できませんでした：' + String(error.message || error));
  }
};

window.deleteAllIftyRecoverySnapshots = async function() {
  try {
    const snapshots = await getIftyRecoverySnapshots();
    if (!snapshots.length) {
      alert('削除できる端末内バックアップはありません。');
      return;
    }

    const ok = confirm(`この端末に保存されているバックアップ ${snapshots.length}件をすべて削除します。

現在の単語帳・実践・チャットのデータと、書き出し済みのJSONファイルは削除されません。続けますか？`);
    if (!ok) return;

    const db = await openIftyRecoveryDb();
    try {
      const transaction = db.transaction(IFTY_RECOVERY_STORE, 'readwrite');
      const store = transaction.objectStore(IFTY_RECOVERY_STORE);
      snapshots.forEach(snapshot => store.delete(snapshot.id));
      await idbTransactionDone(transaction);
    } finally {
      db.close();
    }

    setIftyRecoveryButtonStatus(null);
    await renderIftyRecoveryCenter();
  } catch (error) {
    alert('バックアップを一括削除できませんでした：' + String(error.message || error));
  }
};

async function applyIftyRecoveryPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('バックアップデータが不正です。');
  if (!Array.isArray(payload.folders)) throw new Error('単語帳データが見つかりません。');

  isRestoringHistory = true;
  try {
    folders = deepClone(payload.folders);
    practiceData = deepClone(payload.practiceData || { schemaVersion: 1, modules: { flashcards: { sets: [] }, questions: { sets: [] } } });
    chatSessions = deepClone(Array.isArray(payload.chatSessions) ? payload.chatSessions : []);
    const previousOrderMeta = normalizeIftySubjectOrderMeta(iftySubjectOrderUpdatedAt);
    iftySubjectOrders = normalizeIftySubjectOrders(payload.subjectOrders);
    const restoredMeta = normalizeIftySubjectOrderMeta(payload.subjectOrderUpdatedAt);
    const restoreTimestamp = Math.max(
      Date.now(),
      ...IFTY_SUBJECT_KEYS.map(subject => Number(previousOrderMeta[subject] || 0) + 1),
      ...IFTY_SUBJECT_KEYS.map(subject => Number(restoredMeta[subject] || 0) + 1)
    );
    iftySubjectOrderUpdatedAt = makeEmptyIftySubjectOrderMeta();
    IFTY_SUBJECT_KEYS.forEach(subject => {
      iftySubjectOrderUpdatedAt[subject] = restoreTimestamp;
    });
    iftyTheme = payload.iftyTheme === 'dark' ? 'dark' : 'light';

    normalizeFoldersData();
    normalizePracticeData();

    if (!chatSessions.length) {
      chatSessions = [{ id: 'session_' + Date.now(), title: 'ALLIA', messages: [] }];
    }
    const requestedSessionId = payload.currentChatSessionId;
    currentChatSessionId = chatSessions.some(session => session.id === requestedSessionId)
      ? requestedSessionId
      : chatSessions[0].id;

    selectedFolderIds.clear();
    selectedWordIds.clear();
    clearAllIftySpellingSuggestionTimers();
    pendingSpellingSuggestions = {};
    wordInputDrafts = {};
    iftySocialTopicDrafts = {};
    iftySocialImageDrafts = {};
    iftySocialGenerationPending = {};
    iftySocialEditorImageDraft = null;
    iftyGlobalVocabSearchQuery = '';
    iftyFolderSearchQueries = {};
    undoStack = [];
    redoStack = [];

    saveUserData();
    savePracticeData();
    saveChatSessions();
    saveIftySubjectOrders({ queueCloud: false });
    applyIftyTheme();
    renderFolders();
    updateChatSessionSelect();
    renderChatMessages();
    updateUndoRedoButtons();

    const practiceModal = document.getElementById('practiceModal');
    if (practiceModal && practiceModal.style.display !== 'none') renderPracticeHome();
    applyAlliaBranding();
  } finally {
    isRestoringHistory = false;
  }
}

window.restoreIftyRecoverySnapshot = async function(snapshotId) {
  try {
    const snapshots = await getIftyRecoverySnapshots();
    const snapshot = snapshots.find(item => item.id === snapshotId);
    if (!snapshot) throw new Error('選択したバックアップが見つかりません。');

    const counts = countIftyRecoveryContents(snapshot.payload || {});
    const ok = confirm(`${formatIftyRecoveryTime(snapshot.createdAt)} の状態へ復元します。\n単語 ${counts.words}件 / フォルダ ${counts.folders}件\n\n現在の状態は復元前に緊急保存します。続けますか？`);
    if (!ok) return;

    await createIftyRecoverySnapshot('復元前の緊急保存', { force: true, kind: 'MANUAL' });
    await applyIftyRecoveryPayload(snapshot.payload);
    iftyLastBackupHash = makeIftyRecoveryFingerprint(captureIftyRecoveryPayload());
    await createIftyRecoverySnapshot('復元直後', { force: true, kind: 'MANUAL' });
    await renderIftyRecoveryCenter();
    alert('バックアップから復元しました。');
  } catch (error) {
    alert('復元に失敗しました：' + String(error.message || error));
  }
};

function makeIftyBackupFileName() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `IFTY-backup-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;
}

window.exportIftyBackupFile = function() {
  try {
    const wrapper = {
      format: 'IFTY_BACKUP',
      version: 1,
      exportedAt: Date.now(),
      payload: captureIftyRecoveryPayload()
    };
    const blob = new Blob([JSON.stringify(wrapper, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = makeIftyBackupFileName();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    alert('バックアップファイルを作れませんでした：' + String(error.message || error));
  }
};

window.handleIftyBackupImport = async function(event) {
  const input = event && event.target;
  const file = input && input.files && input.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || parsed.format !== 'IFTY_BACKUP' || !parsed.payload) {
      throw new Error('IFTYのバックアップファイルではありません。');
    }

    const counts = countIftyRecoveryContents(parsed.payload);
    const ok = confirm(`このバックアップファイルを復元します。\n単語 ${counts.words}件 / フォルダ ${counts.folders}件\n\n現在の状態は復元前に緊急保存します。続けますか？`);
    if (!ok) return;

    await createIftyRecoverySnapshot('ファイル復元前の緊急保存', { force: true, kind: 'MANUAL' });
    await applyIftyRecoveryPayload(parsed.payload);
    iftyLastBackupHash = makeIftyRecoveryFingerprint(captureIftyRecoveryPayload());
    await createIftyRecoverySnapshot('ファイル復元直後', { force: true, kind: 'MANUAL' });
    await renderIftyRecoveryCenter();
    alert('バックアップファイルから復元しました。');
  } catch (error) {
    alert('バックアップファイルの読み込みに失敗しました：' + String(error.message || error));
  } finally {
    if (input) input.value = '';
  }
};

function installIftyRecoveryLifecycle() {
  if (iftyRecoveryLifecycleInstalled) return;
  iftyRecoveryLifecycleInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && iftyAutosaveIntervalMinutes > 0) {
      createIftyRecoverySnapshot('オートセーブ', { force: false, kind: 'PERIODIC' }).catch(() => {});
    }
  });
}

function startIftyAutoBackup() {
  installIftyRecoveryLifecycle();
  if (iftyAutoBackupTimer) {
    clearInterval(iftyAutoBackupTimer);
    iftyAutoBackupTimer = null;
  }

  loadIftyAutosavePreference();
  migrateLegacyIftyRecoverySnapshots().catch(error => console.warn('IFTY旧バックアップ移行エラー:', error));

  if (iftyAutosaveIntervalMinutes <= 0) return;

  setTimeout(() => {
    createIftyRecoverySnapshot('オートセーブ', { force: false, kind: 'PERIODIC' })
      .then(record => { if (record) setIftyRecoveryButtonStatus(record.createdAt); })
      .catch(error => console.warn('IFTYバックアップ初期化エラー:', error));
  }, 1500);

  iftyAutoBackupTimer = setInterval(() => {
    createIftyRecoverySnapshot('オートセーブ', { force: false, kind: 'PERIODIC' })
      .catch(error => console.warn('IFTY自動バックアップエラー:', error));
  }, iftyAutosaveIntervalMinutes * 60 * 1000);
}

function ensureIftyPwaHeadLinks() {
  if (!document.querySelector('meta[name="theme-color"]')) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  // STEP30までの固定apple-touch-icon / manifestと競合させず、
  // 現在の白・黒設定を唯一のPWAアイコン指定として反映する。
  applyIftyHomeIcon();
}


// Q3 STEP7：PWA / オフライン対応
function isIftyOnline() {
  return navigator.onLine !== false;
}

function iftyOfflineMessage(feature) {
  return `${feature || 'この機能'}にはインターネット接続が必要です。単語帳・フラッシュカード・「選択」クイズなどの端末内機能はオフラインでも使えます。`;
}

function ensureIftyOnline(feature, options = {}) {
  if (isIftyOnline()) return true;
  if (!options.silent) alert(iftyOfflineMessage(feature));
  updateIftyNetworkStatus();
  return false;
}

function ensureIftyNetworkUi() {
  let badge = document.getElementById('iftyNetworkStatus');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'iftyNetworkStatus';
    badge.setAttribute('aria-live', 'polite');
    badge.style.cssText = 'position:fixed;right:10px;top:56px;z-index:10090;padding:6px 10px;border-radius:999px;font-size:.78em;font-weight:bold;box-shadow:0 4px 14px rgba(0,0,0,.18);display:none;user-select:none;';
    document.body.appendChild(badge);
  }
  updateIftyNetworkStatus();
}

function updateIftyNetworkStatus() {
  const badge = document.getElementById('iftyNetworkStatus');
  if (!badge) return;
  if (isIftyOnline()) {
    badge.textContent = 'オンライン';
    badge.style.background = '#dcfce7';
    badge.style.color = '#166534';
    badge.style.display = 'none';
  } else {
    badge.textContent = '📴 オフライン';
    badge.style.background = '#fff7ed';
    badge.style.color = '#9a3412';
    badge.style.display = 'block';
  }
}

function installIftyNetworkListeners() {
  if (window.__iftyNetworkListenersInstalled) return;
  window.__iftyNetworkListenersInstalled = true;
  window.addEventListener('online', updateIftyNetworkStatus);
  window.addEventListener('offline', updateIftyNetworkStatus);
}

function postIftyCacheRefresh(registration) {
  if (!registration) return;
  const worker = registration.active || registration.waiting || registration.installing;
  if (!worker) return;
  try { worker.postMessage({ type: 'IFTY_CACHE_CORE' }); } catch (_) {}
}

async function checkIftyAppUpdate(registration = iftyServiceWorkerRegistration) {
  if (!registration || !isIftyOnline()) return;
  try {
    await registration.update();
    postIftyCacheRefresh(registration);
  } catch (error) {
    console.warn('IFTY 更新確認エラー:', error);
  }
}

function installIftyServiceWorkerUpdateChecks(registration) {
  iftyServiceWorkerRegistration = registration;

  if (iftyServiceWorkerUpdateTimer) clearInterval(iftyServiceWorkerUpdateTimer);
  iftyServiceWorkerUpdateTimer = setInterval(() => {
    checkIftyAppUpdate(registration);
  }, IFTY_UPDATE_CHECK_INTERVAL_MS);

  if (iftyServiceWorkerUpdateListenersInstalled) return;
  iftyServiceWorkerUpdateListenersInstalled = true;

  window.addEventListener('online', () => {
    checkIftyAppUpdate(iftyServiceWorkerRegistration);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkIftyAppUpdate(iftyServiceWorkerRegistration);
    }
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    postIftyCacheRefresh(iftyServiceWorkerRegistration);
  });
}

async function registerIftyServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  try {
    const scopeUrl = new URL('./', document.baseURI).href;
    const workerUrl = new URL('service-worker.js', scopeUrl).href;
    const registration = await navigator.serviceWorker.register(workerUrl, {
      scope: scopeUrl,
      updateViaCache: 'none'
    });
    await navigator.serviceWorker.ready;
    installIftyServiceWorkerUpdateChecks(registration);
    await checkIftyAppUpdate(registration);
    postIftyCacheRefresh(registration);
  } catch (error) {
    console.warn('IFTY Service Worker登録エラー:', error);
  }
}

function isAlliaQuotaError(response, data) {
  const text = `${data && data.error ? data.error : ''} ${data && data.details ? data.details : ''} ${data && data.message ? data.message : ''}`.toLowerCase();
  return response && response.status === 429 || /quota|limit|rate limit|neuron|daily.*limit|exceeded|resource exhausted|usage limit/.test(text);
}

function alliaHttpError(response, data, fallback) {
  if (isAlliaQuotaError(response, data)) {
    return new Error('本日のALLIA利用上限に達した可能性があります。Cloudflare Workers AIの無料枠は日本時間9:00ごろにリセットされます。');
  }
  return new Error((data && (data.error || data.details || data.message)) || fallback || ('HTTP ' + (response ? response.status : 'error')));
}

function deriveQuizAnswers(word) {
  const existing = word && word.quizAnswers && typeof word.quizAnswers === 'object' ? word.quizAnswers : {};
  const jp = Array.isArray(existing.jp) ? existing.jp.filter(Boolean).map(String) : [];
  const en = Array.isArray(existing.en) ? existing.en.filter(Boolean).map(String) : [];
  const meanings = Array.isArray(word && word.meanings) ? word.meanings.filter(Boolean).map(String) : [];
  return {
    jp: [...new Set(jp.length ? jp : meanings)],
    en: [...new Set(en.length ? en : (word && word.word ? [String(word.word)] : []))]
  };
}

function getLocalChoiceMeaning(word) {
  if (!word || typeof word !== 'object') return '';
  const quizAnswers = word.quizAnswers && typeof word.quizAnswers === 'object' ? word.quizAnswers : {};
  const stored = Array.isArray(quizAnswers.jp) ? quizAnswers.jp.map(String).map(v => v.trim()).filter(Boolean) : [];
  if (stored.length) return stored[0];
  const meanings = Array.isArray(word.meanings) ? word.meanings.map(String).map(v => v.trim()).filter(Boolean) : [];
  return meanings[0] || '';
}

function createLocalSelectionQuestion(set, word, direction) {
  const candidateRefs = uniqueExistingWordIds(set.wordIds || [])
    .filter(id => id !== word.id)
    .map(id => getWordById(id))
    .filter(Boolean);

  if (direction === 'jp_to_en') {
    const promptMeaning = getLocalChoiceMeaning(word);
    const distractors = shuffleArray(candidateRefs.map(ref => String(ref.word.word || '').trim()).filter(Boolean))
      .filter((value, index, arr) => value.toLowerCase() !== String(word.word || '').trim().toLowerCase() && arr.findIndex(x => x.toLowerCase() === value.toLowerCase()) === index)
      .slice(0, 3);
    if (!promptMeaning || distractors.length < 3) {
      throw new Error('「選択」クイズには、異なる候補を作れる語彙が同じクイズフォルダ内に4語以上必要です。');
    }
    const correctAnswer = String(word.word || '').trim();
    return {
      question: `「${promptMeaning}」に当たる見出し語を選んでください。`,
      instruction: '同じクイズフォルダの他の単語から選択肢を作成しています。ALLIAは使用しません。',
      referenceAnswer: correctAnswer,
      localCorrectAnswer: correctAnswer,
      options: shuffleArray([correctAnswer, ...distractors]),
      localGrade: true
    };
  }

  const correctAnswer = getLocalChoiceMeaning(word);
  const meaningPool = candidateRefs
    .map(ref => getLocalChoiceMeaning(ref.word))
    .map(value => String(value || '').trim())
    .filter(Boolean);
  const distractors = shuffleArray(meaningPool)
    .filter((value, index, arr) => value !== correctAnswer && arr.indexOf(value) === index)
    .slice(0, 3);
  if (!correctAnswer || distractors.length < 3) {
    throw new Error('「選択」クイズには、異なる意味の選択肢を作れる語彙が同じクイズフォルダ内に4語以上必要です。');
  }
  return {
    question: `「${word.word || ''}」の意味として正しいものを選んでください。`,
    instruction: '同じクイズフォルダの他の単語から選択肢を作成しています。ALLIAは使用しません。',
    referenceAnswer: correctAnswer,
    localCorrectAnswer: correctAnswer,
    options: shuffleArray([correctAnswer, ...distractors]),
    localGrade: true
  };
}

function gradeLocalSelectionAnswer(question, userAnswer) {
  const correctAnswer = String(question && question.localCorrectAnswer || '').trim();
  const answer = String(userAnswer || '').trim();
  const spellingMode = question && question.localAnswerMode === 'spelling';
  const normalizedCorrect = spellingMode ? correctAnswer.toLowerCase().replace(/\s+/g, ' ') : correctAnswer;
  const normalizedAnswer = spellingMode ? answer.toLowerCase().replace(/\s+/g, ' ') : answer;
  const correct = !!correctAnswer && normalizedAnswer === normalizedCorrect;
  return {
    correct,
    feedback: spellingMode
      ? (correct ? '正しいスペルです。ALLIAは使用していません。' : 'スペルが違います。ALLIAは使用していません。')
      : (correct ? '正しい選択肢です。ALLIAは使用していません。' : '選択肢が違います。ALLIAは使用していません。'),
    modelAnswer: correctAnswer
  };
}

function createLocalListeningQuestion(set, word) {
  const targetWord = String(word && word.word || '').trim();
  if (!targetWord) throw new Error('この語彙には読み上げる見出し語がありません。');

  const candidateRefs = uniqueExistingWordIds(set.wordIds || [])
    .filter(id => id !== word.id)
    .map(id => getWordById(id))
    .filter(Boolean);

  const availableModes = ['spelling'];

  const wordDistractors = shuffleArray(
    candidateRefs
      .map(ref => String(ref.word.word || '').trim())
      .filter(Boolean)
  ).filter((value, index, arr) =>
    value.toLowerCase() !== targetWord.toLowerCase() &&
    arr.findIndex(item => item.toLowerCase() === value.toLowerCase()) === index
  ).slice(0, 3);

  if (wordDistractors.length >= 3) availableModes.push('word_choice');

  const correctMeaning = getLocalChoiceMeaning(word);
  const meaningDistractors = shuffleArray(
    candidateRefs
      .map(ref => getLocalChoiceMeaning(ref.word))
      .map(value => String(value || '').trim())
      .filter(Boolean)
  ).filter((value, index, arr) =>
    value !== correctMeaning && arr.indexOf(value) === index
  ).slice(0, 3);

  if (correctMeaning && meaningDistractors.length >= 3) availableModes.push('meaning_choice');

  const mode = availableModes[Math.floor(Math.random() * availableModes.length)];

  if (mode === 'word_choice') {
    return {
      question: '音声で読まれた見出し語を選んでください。',
      instruction: '音声はお題の見出し語だけです。4択は同じクイズフォルダの語彙から作成しています。ALLIAは使用しません。',
      referenceAnswer: targetWord,
      localCorrectAnswer: targetWord,
      localAnswerMode: 'exact',
      listeningMode: 'word_choice',
      options: shuffleArray([targetWord, ...wordDistractors]),
      audioText: targetWord,
      audioLang: getIftyWordLanguageInfo(word).code || 'en',
      localGrade: true
    };
  }

  if (mode === 'meaning_choice') {
    return {
      question: '音声で読まれた見出し語の意味を選んでください。',
      instruction: '音声はお題の見出し語だけです。4択は同じクイズフォルダの語彙から作成しています。ALLIAは使用しません。',
      referenceAnswer: correctMeaning,
      localCorrectAnswer: correctMeaning,
      localAnswerMode: 'exact',
      listeningMode: 'meaning_choice',
      options: shuffleArray([correctMeaning, ...meaningDistractors]),
      audioText: targetWord,
      audioLang: getIftyWordLanguageInfo(word).code || 'en',
      localGrade: true
    };
  }

  return {
    question: '音声で読まれた見出し語を正しい表記で書いてください。',
    instruction: '音声はお題の見出し語だけです。大文字・小文字だけの違いは採点に影響しません。ALLIAは使用しません。',
    referenceAnswer: targetWord,
    localCorrectAnswer: targetWord,
    localAnswerMode: 'spelling',
    listeningMode: 'spelling',
    options: [],
    audioText: targetWord,
    audioLang: getIftyWordLanguageInfo(word).code || 'en',
    localGrade: true
  };
}


// ==========================================
// Q3 STEP12：IFTYアカウント / クラウドセーブ
// ==========================================
function getIftyCloudRevisionKey(username = currentUser) {
  return IFTY_CLOUD_REVISION_PREFIX + String(username || '');
}

function getIftyCloudDirtyKey(username = currentUser) {
  return IFTY_CLOUD_DIRTY_PREFIX + String(username || '');
}

function readStoredIftyAccountMeta() {
  try {
    const parsed = JSON.parse(localStorage.getItem(IFTY_ACCOUNT_META_KEY) || 'null');
    if (parsed && typeof parsed === 'object' && parsed.username) return parsed;
  } catch (_) {}
  return null;
}

function storeIftyAccountSession(account, token) {
  iftyAccount = account && typeof account === 'object' ? account : null;
  iftySessionToken = String(token || '');
  if (iftySessionToken) localStorage.setItem(IFTY_SESSION_TOKEN_KEY, iftySessionToken);
  if (iftyAccount) localStorage.setItem(IFTY_ACCOUNT_META_KEY, JSON.stringify(iftyAccount));
}

function clearIftyAccountSession() {
  iftyAccount = null;
  iftySessionToken = '';
  iftyCloudRevision = 0;
  iftyCloudSaveEnabled = false;
  localStorage.removeItem(IFTY_SESSION_TOKEN_KEY);
  localStorage.removeItem(IFTY_ACCOUNT_META_KEY);
  localStorage.removeItem('currentUser');
}

function setIftyAuthenticatedUiVisible(visible) {
  if (!visible && typeof window.closeIftySideMenu === 'function') window.closeIftySideMenu();
  const landingPage = document.getElementById('landingPage');
  const mainPortal = document.getElementById('mainPortal');
  const floatingAiBtn = document.getElementById('floatingAiBtn');
  const quickControls = document.getElementById('iftyQuickControls');
  const globalLogo = document.getElementById('iftyGlobalLogo');

  if (landingPage) landingPage.style.display = visible ? 'none' : 'block';
  if (mainPortal) mainPortal.style.display = visible ? 'block' : 'none';
  if (floatingAiBtn) {
    floatingAiBtn.style.display = 'none';
    floatingAiBtn.setAttribute('aria-hidden', 'true');
    floatingAiBtn.tabIndex = -1;
  }
  if (quickControls) quickControls.style.display = visible ? 'flex' : 'none';
  if (globalLogo) globalLogo.style.display = visible ? 'block' : 'none';
  removeIftyBottomRightLauncher();
}

function removeIftyBottomRightLauncher() {
  const button = document.getElementById('floatingAiBtn');
  if (button) button.remove();
  const launcher = document.getElementById('mainLauncherModal');
  if (launcher) launcher.remove();
}

function setIftyAccountFormStatus(message, isError = false) {
  const el = document.getElementById('iftyAccountStatus');
  if (!el) return;
  el.textContent = String(message || '');
  el.style.color = isError ? '#fca5a5' : '#bae6fd';
}

window.toggleIftyPasswordVisibility = function(inputId, button) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  if (button) {
    button.textContent = show ? '隠す' : '表示';
    button.setAttribute('aria-label', show ? 'パスワードを隠す' : 'パスワードを表示');
    button.setAttribute('aria-pressed', show ? 'true' : 'false');
  }
};

window.closeIftyPasswordRecoveryInfo = function() {
  const modal = document.getElementById('iftyPasswordRecoveryModal');
  if (modal) modal.remove();
};

window.showIftyPasswordRecoveryInfo = function() {
  window.closeIftyPasswordRecoveryInfo();
  const modal = document.createElement('div');
  modal.id = 'iftyPasswordRecoveryModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.72);z-index:12050;display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;';
  modal.innerHTML = `
    <div role="dialog" aria-modal="true" aria-labelledby="iftyPasswordRecoveryTitle" style="width:min(540px,100%);max-height:90vh;overflow:auto;background:#fff;color:#0f172a;border-radius:16px;padding:22px;box-shadow:0 18px 50px rgba(0,0,0,.35);">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div>
          <h3 id="iftyPasswordRecoveryTitle" style="margin:0 0 8px;font-size:1.25em;">パスワードを再設定</h3>
          <p style="margin:0;color:#475569;line-height:1.6;font-size:.9em;">事前にSETTINGSで確認済みの復旧用メールアドレスを登録しているアカウントで利用できます。</p>
        </div>
        <button type="button" onclick="closeIftyPasswordRecoveryInfo()" aria-label="閉じる" style="border:none;background:#e2e8f0;color:#334155;border-radius:8px;width:34px;height:34px;font-size:1.1em;cursor:pointer;">×</button>
      </div>
      <div style="display:grid;gap:9px;margin-top:16px;">
        <input id="iftyResetUsername" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="IFTY ID" style="padding:10px;border:1px solid #94a3b8;border-radius:8px;font-size:1em;">
        <div style="display:flex;gap:7px;">
          <input id="iftyResetEmail" type="email" autocomplete="email" placeholder="確認済みの復旧用メールアドレス" style="flex:1;min-width:0;padding:10px;border:1px solid #94a3b8;border-radius:8px;font-size:1em;">
          <button type="button" onclick="requestIftyPasswordResetCode()" style="border:none;background:#0284c7;color:white;padding:9px 11px;border-radius:8px;font-weight:800;cursor:pointer;">確認コードを送信</button>
        </div>
        <input id="iftyResetCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6桁の確認コード" style="padding:10px;border:1px solid #94a3b8;border-radius:8px;font-size:1em;">
        <div style="display:flex;gap:7px;">
          <input id="iftyResetNewPassword" type="password" autocomplete="new-password" placeholder="新しいパスワード（10文字以上）" style="flex:1;min-width:0;padding:10px;border:1px solid #94a3b8;border-radius:8px;font-size:1em;">
          <button type="button" onclick="toggleIftyPasswordVisibility('iftyResetNewPassword', this)" style="border:none;background:#334155;color:white;padding:0 12px;border-radius:8px;font-weight:800;cursor:pointer;">表示</button>
        </div>
        <div style="display:flex;gap:7px;">
          <input id="iftyResetNewPasswordConfirm" type="password" autocomplete="new-password" placeholder="新しいパスワードを再入力" style="flex:1;min-width:0;padding:10px;border:1px solid #94a3b8;border-radius:8px;font-size:1em;">
          <button type="button" onclick="toggleIftyPasswordVisibility('iftyResetNewPasswordConfirm', this)" style="border:none;background:#334155;color:white;padding:0 12px;border-radius:8px;font-weight:800;cursor:pointer;">表示</button>
        </div>
      </div>
      <div id="iftyResetStatus" style="min-height:1.3em;margin-top:10px;font-size:.84em;color:#475569;"></div>
      <div style="margin-top:4px;font-size:.78em;color:#64748b;line-height:1.5;">メールが届かない場合は、迷惑メールフォルダも確認してください。</div>
      <button type="button" onclick="confirmIftyPasswordReset()" style="margin-top:9px;width:100%;border:none;background:#15803d;color:white;padding:10px 14px;border-radius:8px;font-weight:800;cursor:pointer;">新しいパスワードに変更</button>
    </div>`;
  modal.addEventListener('click', event => {
    if (event.target === modal) window.closeIftyPasswordRecoveryInfo();
  });
  document.body.appendChild(modal);
};

function setIftyResetStatus(message, isError = false) {
  const el = document.getElementById('iftyResetStatus');
  if (!el) return;
  el.textContent = String(message || '');
  el.style.color = isError ? '#dc2626' : '#0f766e';
}

window.requestIftyPasswordResetCode = async function() {
  const username = String(document.getElementById('iftyResetUsername')?.value || '').trim();
  const email = String(document.getElementById('iftyResetEmail')?.value || '').trim();
  if (!username || !email) {
    setIftyResetStatus('IFTY IDと復旧用メールアドレスを入力してください。', true);
    return;
  }
  if (!isIftyOnline()) {
    setIftyResetStatus('確認コードの送信にはインターネット接続が必要です。', true);
    return;
  }
  setIftyResetStatus('確認コードを送信中…');
  try {
    const result = await iftyAccountApi('password_reset_request', { username, email });
    setIftyResetStatus(result.message || '情報が一致する場合、確認コードを送信しました。');
  } catch (error) {
    setIftyResetStatus(error.message || '確認コードを送信できませんでした。', true);
  }
};

window.confirmIftyPasswordReset = async function() {
  const username = String(document.getElementById('iftyResetUsername')?.value || '').trim();
  const email = String(document.getElementById('iftyResetEmail')?.value || '').trim();
  const code = String(document.getElementById('iftyResetCode')?.value || '').trim();
  const newPassword = String(document.getElementById('iftyResetNewPassword')?.value || '');
  const confirmPassword = String(document.getElementById('iftyResetNewPasswordConfirm')?.value || '');
  if (!username || !email || !/^\d{6}$/.test(code)) {
    setIftyResetStatus('IFTY ID・復旧用メール・6桁の確認コードを入力してください。', true);
    return;
  }
  if (newPassword.length < 10 || newPassword.length > 128) {
    setIftyResetStatus('新しいパスワードは10〜128文字で入力してください。', true);
    return;
  }
  if (newPassword !== confirmPassword) {
    setIftyResetStatus('新しいパスワードの確認入力が一致していません。', true);
    return;
  }
  setIftyResetStatus('パスワードを変更中…');
  try {
    await iftyAccountApi('password_reset_confirm', { username, email, code, newPassword });
    setIftyResetStatus('パスワードを変更しました。新しいパスワードでログインしてください。');
    setTimeout(() => window.closeIftyPasswordRecoveryInfo(), 1200);
  } catch (error) {
    setIftyResetStatus(error.message || 'パスワードを変更できませんでした。', true);
  }
};

function renderIftyAccountLanding(message = '') {
  setIftyAuthenticatedUiVisible(false);
  const landingPage = document.getElementById('landingPage');
  if (!landingPage) return;

  const heading = landingPage.querySelector('h2');
  if (heading) heading.textContent = 'IFTYアカウント';

  const accountList = document.getElementById('accountList');
  if (!accountList) return;
  accountList.innerHTML = `
    <input id="iftyAccountUsername" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="IFTY ID（3〜24文字）" style="padding:11px;border:1px solid #475569;border-radius:7px;font-size:1em;background:#0f172a;color:white;">
    <div style="display:flex;gap:7px;align-items:stretch;">
      <input id="iftyAccountPassword" type="password" autocomplete="current-password" placeholder="パスワード（10文字以上）" style="flex:1;min-width:0;padding:11px;border:1px solid #475569;border-radius:7px;font-size:1em;background:#0f172a;color:white;">
      <button type="button" onclick="toggleIftyPasswordVisibility('iftyAccountPassword', this)" aria-label="パスワードを表示" aria-pressed="false" style="flex:0 0 auto;background:#334155;color:#f8fafc;border:1px solid #475569;padding:0 12px;border-radius:7px;font-weight:700;cursor:pointer;">表示</button>
    </div>
    <div style="display:flex;gap:7px;align-items:stretch;">
      <input id="iftyAccountPasswordConfirm" type="password" autocomplete="new-password" placeholder="新規作成時のみ：パスワード確認" style="flex:1;min-width:0;padding:11px;border:1px solid #475569;border-radius:7px;font-size:1em;background:#0f172a;color:white;">
      <button type="button" onclick="toggleIftyPasswordVisibility('iftyAccountPasswordConfirm', this)" aria-label="確認用パスワードを表示" aria-pressed="false" style="flex:0 0 auto;background:#334155;color:#f8fafc;border:1px solid #475569;padding:0 12px;border-radius:7px;font-weight:700;cursor:pointer;">表示</button>
    </div>
    <button type="button" onclick="showIftyPasswordRecoveryInfo()" style="align-self:flex-start;background:transparent;color:#7dd3fc;border:none;padding:2px 0;font-size:.84em;text-decoration:underline;cursor:pointer;">パスワードを忘れた場合</button>
    <div style="display:flex;gap:8px;margin-top:4px;">
      <button onclick="loginIftyAccount()" style="flex:1;background:#0284c7;color:white;border:none;padding:10px;border-radius:7px;font-weight:800;cursor:pointer;">ログイン</button>
      <button onclick="registerIftyAccount()" style="flex:1;background:#15803d;color:white;border:none;padding:10px;border-radius:7px;font-weight:800;cursor:pointer;">新規作成</button>
    </div>
    <button type="button" onclick="enterIftyDeveloperMode()" style="width:100%;background:#d97706;color:white;border:none;padding:10px;border-radius:7px;font-weight:800;cursor:pointer;">Developer</button>
    <div style="font-size:.75em;line-height:1.45;color:#94a3b8;margin-top:-2px;">開発用：ログインせず、専用の端末ローカル領域だけでIFTYを開きます。クラウドアカウントのデータにはアクセスしません。</div>
    <div id="iftyAccountStatus" style="min-height:1.3em;font-size:.85em;color:#bae6fd;margin-top:4px;">${escapeHtml(message)}</div>
    <div style="font-size:.78em;line-height:1.55;color:#cbd5e1;margin-top:4px;">
      セーブデータの正本はIFTYアカウントのクラウド領域へ保存します。Cookieは使用しません。オフライン中だけ端末内キャッシュを使い、接続復帰後に同期します。
    </div>`;

  const password = document.getElementById('iftyAccountPassword');
  if (password) {
    password.addEventListener('keydown', event => {
      if (event.key === 'Enter') window.loginIftyAccount();
    });
  }
  const confirmPassword = document.getElementById('iftyAccountPasswordConfirm');
  if (confirmPassword) {
    confirmPassword.addEventListener('keydown', event => {
      if (event.key === 'Enter') window.registerIftyAccount();
    });
  }
}

function ensureIftyCloudStatusUi() {
  const userDisplay = document.getElementById('userDisplay');
  if (!userDisplay || document.getElementById('iftyCloudStatus')) return;
  const status = document.createElement('div');
  status.id = 'iftyCloudStatus';
  status.style.cssText = 'font-size:.72em;color:#64748b;margin-top:3px;';
  status.textContent = '☁️ 同期確認中';
  userDisplay.parentElement.appendChild(status);
}

function setIftyCloudStatus(text, kind = 'normal') {
  const status = document.getElementById('iftyCloudStatus');
  if (!status) return;
  status.textContent = String(text || '');
  status.style.color = kind === 'error' ? '#dc2626' : kind === 'ok' ? '#0f766e' : kind === 'offline' ? '#b45309' : '#64748b';
}

async function iftyAccountApi(type, payload = {}) {
  const response = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, ...payload })
  });
  let data = {};
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) {
    const error = new Error(data.error || data.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}


function ensureIftySecurityModal() {
  let modal = document.getElementById('iftySecurityModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'iftySecurityModal';
  modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(2,6,23,.78);z-index:12100;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;';
  modal.addEventListener('click', event => {
    if (event.target === modal) window.closeIftySecurityModal();
  });
  document.body.appendChild(modal);
  return modal;
}

window.closeIftySecurityModal = function() {
  const modal = document.getElementById('iftySecurityModal');
  if (modal) modal.style.display = 'none';
};

function showIftySecurityModal(title, bodyHtml) {
  const modal = ensureIftySecurityModal();
  modal.innerHTML = `
    <div role="dialog" aria-modal="true" style="width:min(560px,96vw);max-height:90vh;overflow:auto;background:white;color:#0f172a;border-radius:15px;padding:20px;box-shadow:0 18px 50px rgba(0,0,0,.35);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:13px;">
        <h3 style="margin:0;font-size:1.2em;">${escapeHtml(title)}</h3>
        <button type="button" onclick="closeIftySecurityModal()" style="border:none;background:#e2e8f0;color:#334155;border-radius:8px;width:34px;height:34px;cursor:pointer;font-size:1.1em;">×</button>
      </div>
      ${bodyHtml}
    </div>`;
  modal.style.display = 'flex';
}

async function refreshIftyAccountSecurityPanel() {
  const panel = document.getElementById('iftyAccountSecurityPanel');
  if (!panel || iftyDeveloperMode) return;
  if (!iftySessionToken) {
    panel.textContent = 'ログイン情報がありません。';
    return;
  }

  const profile = await iftyAccountApi('account_profile', { token: iftySessionToken });
  iftyAccountProfile = profile;
  const emailText = profile.recoveryEmail
    ? `${escapeHtml(profile.recoveryEmail)} <span style="color:#15803d;font-weight:800;">確認済み</span>`
    : '<span style="color:#b45309;font-weight:800;">未設定</span>';

  const usernameText = escapeHtml(String((profile.account && profile.account.username) || (iftyAccount && iftyAccount.username) || currentUser || ''));

  panel.innerHTML = `
    <div style="display:grid;gap:11px;">
      <div>
        <div style="font-weight:900;color:inherit;">IFTY ID</div>
        <div style="margin-top:3px;">${usernameText}</div>
      </div>
      <div>
        <div style="font-weight:900;color:inherit;">復旧用メール</div>
        <div style="margin-top:3px;">${emailText}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="ifty-settings-action" type="button" onclick="openIftyUsernameChange()" style="background:#7c3aed;color:white;">IFTY IDを変更</button>
        <button class="ifty-settings-action" type="button" onclick="openIftyRecoveryEmailSettings()" style="background:#0284c7;color:white;">復旧用メールを設定 / 変更</button>
        <button class="ifty-settings-action" type="button" onclick="openIftyPasswordChange()" style="background:#334155;color:white;">パスワード変更</button>
        <button class="ifty-settings-action" type="button" onclick="openIftySessionManager()" style="background:#0f766e;color:white;">セッション管理</button>
        <button class="ifty-settings-action" type="button" onclick="logoutAllIftySessions()" style="background:#b45309;color:white;">全端末からログアウト</button>
        <button class="ifty-settings-action" type="button" onclick="openIftyAccountDelete()" style="background:#b91c1c;color:white;">アカウント削除</button>
      </div>
      <div class="ifty-settings-note">IFTY IDの変更には現在のパスワードが必要です。復旧コードの送信にはWorker側のメール送信設定が必要です。</div>
    </div>`;
}

async function migrateIftyLocalUsernameData(oldUsername, newUsername) {
  const oldName = String(oldUsername || '').trim();
  const newName = String(newUsername || '').trim();
  if (!oldName || !newName || oldName === newName) return;

  const localKeyPairs = [
    [`vocab_user_${oldName}`, `vocab_user_${newName}`],
    [`practice_user_${oldName}`, `practice_user_${newName}`],
    [`chat_sessions_${oldName}`, `chat_sessions_${newName}`],
    [getIftyOrderStorageKey(oldName), getIftyOrderStorageKey(newName)],
    [getIftyOrderMetaStorageKey(oldName), getIftyOrderMetaStorageKey(newName)],
    [getIftyAutosaveSettingKey(oldName), getIftyAutosaveSettingKey(newName)],
    [getIftySpellingAutoAcceptSettingKey(oldName), getIftySpellingAutoAcceptSettingKey(newName)],
    [getIftyDailyGoalSettingKey(oldName), getIftyDailyGoalSettingKey(newName)],
    [getIftyCloudRevisionKey(oldName), getIftyCloudRevisionKey(newName)],
    [getIftyCloudDirtyKey(oldName), getIftyCloudDirtyKey(newName)]
  ];

  localKeyPairs.forEach(([oldKey, newKey]) => {
    const value = localStorage.getItem(oldKey);
    if (value !== null) localStorage.setItem(newKey, value);
  });

  if ('indexedDB' in window) {
    try {
      const db = await openIftyRecoveryDb();
      try {
        if (db.objectStoreNames.contains(IFTY_RECOVERY_STORE)) {
          const readTx = db.transaction(IFTY_RECOVERY_STORE, 'readonly');
          const records = await idbRequestPromise(readTx.objectStore(IFTY_RECOVERY_STORE).getAll());
          const own = (Array.isArray(records) ? records : []).filter(record => record && record.user === oldName);
          if (own.length) {
            const writeTx = db.transaction(IFTY_RECOVERY_STORE, 'readwrite');
            const store = writeTx.objectStore(IFTY_RECOVERY_STORE);
            own.forEach(record => {
              const oldId = record.id;
              const updated = { ...record, user: newName };
              if (normalizeIftyRecoveryKind(record) === 'PERIODIC') {
                updated.id = getIftyPeriodicBackupId(newName);
              }
              store.put(updated);
              if (updated.id !== oldId) store.delete(oldId);
            });
            await idbTransactionDone(writeTx);
          }
        }

        if (db.objectStoreNames.contains(IFTY_GENERATED_WORD_CACHE_STORE)) {
          const readTx = db.transaction(IFTY_GENERATED_WORD_CACHE_STORE, 'readonly');
          const records = await idbRequestPromise(readTx.objectStore(IFTY_GENERATED_WORD_CACHE_STORE).getAll());
          const own = (Array.isArray(records) ? records : []).filter(record => record && record.user === oldName);
          if (own.length) {
            const writeTx = db.transaction(IFTY_GENERATED_WORD_CACHE_STORE, 'readwrite');
            const store = writeTx.objectStore(IFTY_GENERATED_WORD_CACHE_STORE);
            own.forEach(record => {
              const oldId = record.id;
              const updated = {
                ...record,
                id: getIftyGeneratedWordCacheId(newName, record.subject, record.wordKey, String(record.order || '')),
                user: newName,
                updatedAt: Date.now()
              };
              store.put(updated);
              if (updated.id !== oldId) store.delete(oldId);
            });
            await idbTransactionDone(writeTx);
          }
        }
      } finally {
        db.close();
      }
    } catch (error) {
      console.warn('IFTY ID変更時の端末データ移行エラー:', error);
    }
  }

  localKeyPairs.forEach(([oldKey]) => localStorage.removeItem(oldKey));
}

window.openIftyUsernameChange = function() {
  const current = String((iftyAccountProfile && iftyAccountProfile.account && iftyAccountProfile.account.username) || (iftyAccount && iftyAccount.username) || currentUser || '');
  showIftySecurityModal('IFTY IDを変更', `
    <div style="display:grid;gap:9px;">
      <div style="font-size:.84em;color:#64748b;line-height:1.5;">現在のIFTY ID：<b>${escapeHtml(current)}</b><br>英数字・_ . - の3〜24文字で設定できます。</div>
      <input id="iftyNewUsername" type="text" autocomplete="username" maxlength="24" value="${escapeHtml(current)}" placeholder="新しいIFTY ID" style="padding:10px;border:1px solid #94a3b8;border-radius:8px;font-size:1em;">
      <div style="display:flex;gap:7px;">
        <input id="iftyUsernameChangePassword" type="password" autocomplete="current-password" placeholder="現在のパスワード" style="flex:1;min-width:0;padding:10px;border:1px solid #94a3b8;border-radius:8px;font-size:1em;">
        <button type="button" onclick="toggleIftyPasswordVisibility('iftyUsernameChangePassword', this)" style="border:none;background:#334155;color:white;padding:0 12px;border-radius:8px;font-weight:800;cursor:pointer;">表示</button>
      </div>
      <button type="button" onclick="submitIftyUsernameChange()" style="border:none;background:#7c3aed;color:white;padding:10px;border-radius:8px;font-weight:800;cursor:pointer;">IFTY IDを変更</button>
      <div id="iftySecurityModalStatus" style="min-height:1.3em;color:#475569;font-size:.84em;"></div>
    </div>`);
};

window.submitIftyUsernameChange = async function() {
  const newUsername = String(document.getElementById('iftyNewUsername')?.value || '').trim();
  const currentPassword = String(document.getElementById('iftyUsernameChangePassword')?.value || '');
  if (!/^[A-Za-z0-9_.-]{3,24}$/.test(newUsername)) {
    setIftySecurityModalStatus('IFTY IDは英数字・_ . - の3〜24文字で入力してください。', true);
    return;
  }
  if (!currentPassword) {
    setIftySecurityModalStatus('現在のパスワードを入力してください。', true);
    return;
  }

  const oldUsername = String(currentUser || '');
  if (newUsername === oldUsername) {
    setIftySecurityModalStatus('現在と同じIFTY IDです。', true);
    return;
  }

  setIftySecurityModalStatus('IFTY IDを変更中…');
  try {
    const result = await iftyAccountApi('account_username_change', {
      token: iftySessionToken,
      newUsername,
      currentPassword
    });
    const account = result && result.account ? result.account : { ...(iftyAccount || {}), username: newUsername };
    const confirmedUsername = String(account.username || newUsername);

    await migrateIftyLocalUsernameData(oldUsername, confirmedUsername);

    currentUser = confirmedUsername;
    localStorage.setItem('currentUser', currentUser);
    storeIftyAccountSession(account, iftySessionToken);
    iftyAccountProfile = {
      ...(iftyAccountProfile || {}),
      account
    };

    saveUserData();
    savePracticeData();
    saveChatSessions();
    saveIftySubjectOrders({ queueCloud: false });
    localStorage.setItem(getIftyAutosaveSettingKey(currentUser), String(iftyAutosaveIntervalMinutes));
    localStorage.setItem(getIftySpellingAutoAcceptSettingKey(currentUser), String(iftySpellingAutoAcceptSeconds));
    localStorage.setItem(getIftyCloudRevisionKey(currentUser), String(iftyCloudRevision));

    const userDisplay = document.getElementById('userDisplay');
    if (userDisplay) userDisplay.textContent = currentUser;
    startIftyAutoBackup();

    setIftySecurityModalStatus(`IFTY IDを「${confirmedUsername}」に変更しました。`);
    setTimeout(async () => {
      window.closeIftySecurityModal();
      await refreshIftyAccountSecurityPanel();
      if (typeof window.openIftySettings === 'function') window.openIftySettings();
    }, 700);
  } catch (error) {
    setIftySecurityModalStatus(error.message || 'IFTY IDを変更できませんでした。', true);
  }
};

window.openIftyRecoveryEmailSettings = function() {
  const current = String((iftyAccountProfile && iftyAccountProfile.recoveryEmail) || '');
  showIftySecurityModal('復旧用メールを設定 / 変更', `
    <div style="display:grid;gap:9px;">
      <input id="iftySecurityEmail" type="email" autocomplete="email" value="${escapeHtml(current)}" placeholder="復旧用メールアドレス" style="padding:10px;border:1px solid #94a3b8;border-radius:8px;font-size:1em;">
      <div style="display:flex;gap:7px;">
        <input id="iftySecurityEmailPassword" type="password" autocomplete="current-password" placeholder="現在のパスワード" style="flex:1;min-width:0;padding:10px;border:1px solid #94a3b8;border-radius:8px;font-size:1em;">
        <button type="button" onclick="toggleIftyPasswordVisibility('iftySecurityEmailPassword', this)" style="border:none;background:#334155;color:white;padding:0 12px;border-radius:8px;font-weight:800;cursor:pointer;">表示</button>
      </div>
      <button type="button" onclick="requestIftyRecoveryEmailCode()" style="border:none;background:#0284c7;color:white;padding:10px;border-radius:8px;font-weight:800;cursor:pointer;">確認コードを送信</button>
      <div style="display:flex;gap:7px;">
        <input id="iftySecurityEmailCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="メールに届いた6桁コード" style="flex:1;min-width:0;padding:10px;border:1px solid #94a3b8;border-radius:8px;font-size:1em;">
        <button type="button" onclick="verifyIftyRecoveryEmail()" style="border:none;background:#15803d;color:white;padding:9px 12px;border-radius:8px;font-weight:800;cursor:pointer;">確認</button>
      </div>
      <div id="iftySecurityModalStatus" style="min-height:1.3em;color:#475569;font-size:.84em;"></div>
    </div>`);
};

function setIftySecurityModalStatus(message, isError = false) {
  const el = document.getElementById('iftySecurityModalStatus');
  if (!el) return;
  el.textContent = String(message || '');
  el.style.color = isError ? '#dc2626' : '#0f766e';
}

window.requestIftyRecoveryEmailCode = async function() {
  const email = String(document.getElementById('iftySecurityEmail')?.value || '').trim();
  const currentPassword = String(document.getElementById('iftySecurityEmailPassword')?.value || '');
  if (!email || !currentPassword) {
    setIftySecurityModalStatus('メールアドレスと現在のパスワードを入力してください。', true);
    return;
  }
  setIftySecurityModalStatus('確認コードを送信中…');
  try {
    await iftyAccountApi('account_email_request', { token: iftySessionToken, email, currentPassword });
    setIftySecurityModalStatus('確認コードを送信しました。10分以内に入力してください。');
  } catch (error) {
    setIftySecurityModalStatus(error.message || '確認コードを送信できませんでした。', true);
  }
};

window.verifyIftyRecoveryEmail = async function() {
  const email = String(document.getElementById('iftySecurityEmail')?.value || '').trim();
  const code = String(document.getElementById('iftySecurityEmailCode')?.value || '').trim();
  if (!email || !/^\d{6}$/.test(code)) {
    setIftySecurityModalStatus('メールアドレスと6桁の確認コードを入力してください。', true);
    return;
  }
  setIftySecurityModalStatus('確認中…');
  try {
    await iftyAccountApi('account_email_verify', { token: iftySessionToken, email, code });
    setIftySecurityModalStatus('復旧用メールを確認しました。');
    iftyAccountProfile = null;
    setTimeout(async () => {
      window.closeIftySecurityModal();
      await refreshIftyAccountSecurityPanel();
    }, 700);
  } catch (error) {
    setIftySecurityModalStatus(error.message || '確認できませんでした。', true);
  }
};

window.openIftyPasswordChange = function() {
  showIftySecurityModal('パスワード変更', `
    <div style="display:grid;gap:9px;">
      <div style="display:flex;gap:7px;"><input id="iftyCurrentPasswordChange" type="password" autocomplete="current-password" placeholder="現在のパスワード" style="flex:1;min-width:0;padding:10px;border:1px solid #94a3b8;border-radius:8px;font-size:1em;"><button type="button" onclick="toggleIftyPasswordVisibility('iftyCurrentPasswordChange', this)" style="border:none;background:#334155;color:white;padding:0 12px;border-radius:8px;font-weight:800;cursor:pointer;">表示</button></div>
      <div style="display:flex;gap:7px;"><input id="iftyNewPasswordChange" type="password" autocomplete="new-password" placeholder="新しいパスワード（10文字以上）" style="flex:1;min-width:0;padding:10px;border:1px solid #94a3b8;border-radius:8px;font-size:1em;"><button type="button" onclick="toggleIftyPasswordVisibility('iftyNewPasswordChange', this)" style="border:none;background:#334155;color:white;padding:0 12px;border-radius:8px;font-weight:800;cursor:pointer;">表示</button></div>
      <div style="display:flex;gap:7px;"><input id="iftyNewPasswordChangeConfirm" type="password" autocomplete="new-password" placeholder="新しいパスワードを再入力" style="flex:1;min-width:0;padding:10px;border:1px solid #94a3b8;border-radius:8px;font-size:1em;"><button type="button" onclick="toggleIftyPasswordVisibility('iftyNewPasswordChangeConfirm', this)" style="border:none;background:#334155;color:white;padding:0 12px;border-radius:8px;font-weight:800;cursor:pointer;">表示</button></div>
      <button type="button" onclick="submitIftyPasswordChange()" style="border:none;background:#0284c7;color:white;padding:10px;border-radius:8px;font-weight:800;cursor:pointer;">変更する</button>
      <div id="iftySecurityModalStatus" style="min-height:1.3em;color:#475569;font-size:.84em;"></div>
    </div>`);
};

window.submitIftyPasswordChange = async function() {
  const currentPassword = String(document.getElementById('iftyCurrentPasswordChange')?.value || '');
  const newPassword = String(document.getElementById('iftyNewPasswordChange')?.value || '');
  const confirmPassword = String(document.getElementById('iftyNewPasswordChangeConfirm')?.value || '');
  if (newPassword.length < 10 || newPassword.length > 128) {
    setIftySecurityModalStatus('新しいパスワードは10〜128文字で入力してください。', true);
    return;
  }
  if (newPassword !== confirmPassword) {
    setIftySecurityModalStatus('新しいパスワードの確認入力が一致していません。', true);
    return;
  }
  setIftySecurityModalStatus('変更中…');
  try {
    await iftyAccountApi('account_password_change', { token: iftySessionToken, currentPassword, newPassword });
    setIftySecurityModalStatus('パスワードを変更しました。他のセッションは終了しました。');
  } catch (error) {
    setIftySecurityModalStatus(error.message || 'パスワードを変更できませんでした。', true);
  }
};

window.openIftySessionManager = async function() {
  showIftySecurityModal('セッション管理', '<div id="iftySecurityModalStatus">読み込み中…</div>');
  try {
    const result = await iftyAccountApi('account_sessions', { token: iftySessionToken });
    const sessions = Array.isArray(result.sessions) ? result.sessions : [];
    const body = sessions.length ? sessions.map(session => `
      <div style="border:1px solid #cbd5e1;border-radius:10px;padding:11px;margin-bottom:8px;">
        <div style="font-weight:900;">${session.current ? 'このセッション' : 'ログイン中のセッション'} ${session.current ? '<span style="color:#15803d;font-size:.78em;">CURRENT</span>' : ''}</div>
        <div style="font-size:.8em;color:#64748b;margin-top:4px;">開始：${escapeHtml(formatIftyRecoveryTime(session.createdAt))}<br>期限：${escapeHtml(formatIftyRecoveryTime(session.expiresAt))}</div>
        <button type="button" onclick="revokeIftySession('${session.id}', ${session.current ? 'true' : 'false'})" style="margin-top:8px;border:none;background:#b45309;color:white;padding:8px 10px;border-radius:8px;font-weight:800;cursor:pointer;">このセッションを終了</button>
      </div>`).join('') : '<div style="color:#64748b;">セッションはありません。</div>';
    const modal = document.getElementById('iftySecurityModal');
    if (modal) {
      const inner = modal.firstElementChild;
      if (inner) inner.querySelector('#iftySecurityModalStatus').outerHTML = `<div>${body}</div>`;
    }
  } catch (error) {
    setIftySecurityModalStatus(error.message || 'セッションを読み込めませんでした。', true);
  }
};

window.revokeIftySession = async function(sessionId, isCurrent) {
  if (!confirm(isCurrent ? 'この端末のログインを終了しますか？' : '選択したセッションを終了しますか？')) return;
  try {
    await iftyAccountApi('account_session_revoke', { token: iftySessionToken, sessionId });
    if (isCurrent) {
      clearIftyAccountSession();
      location.reload();
      return;
    }
    await window.openIftySessionManager();
  } catch (error) {
    alert('セッションを終了できませんでした：' + String(error.message || error));
  }
};

window.logoutAllIftySessions = async function() {
  if (!confirm('すべての端末・ブラウザのログインを終了します。続けますか？')) return;
  try {
    await iftyAccountApi('account_logout_all', { token: iftySessionToken });
    clearIftyAccountSession();
    location.reload();
  } catch (error) {
    alert('全端末ログアウトに失敗しました：' + String(error.message || error));
  }
};

async function purgeIftyLocalAccountData(username) {
  const user = String(username || '');
  if (!user) return;

  localStorage.removeItem('vocab_user_' + user);
  localStorage.removeItem('practice_user_' + user);
  localStorage.removeItem('chat_sessions_' + user);
  localStorage.removeItem(IFTY_ORDER_STORAGE_PREFIX + user);
  localStorage.removeItem(IFTY_ORDER_META_STORAGE_PREFIX + user);
  localStorage.removeItem(IFTY_CLOUD_REVISION_PREFIX + user);
  localStorage.removeItem(IFTY_CLOUD_DIRTY_PREFIX + user);
  localStorage.removeItem(IFTY_AUTOSAVE_SETTING_PREFIX + user);
  localStorage.removeItem(IFTY_SPELLING_AUTO_ACCEPT_SETTING_PREFIX + user);

  try {
    const db = await openIftyRecoveryDb();
    try {
      const readTransaction = db.transaction(IFTY_RECOVERY_STORE, 'readonly');
      const all = await idbRequestPromise(readTransaction.objectStore(IFTY_RECOVERY_STORE).getAll());
      const own = (Array.isArray(all) ? all : []).filter(item => item && item.user === user);
      if (own.length) {
        const deleteTransaction = db.transaction(IFTY_RECOVERY_STORE, 'readwrite');
        const store = deleteTransaction.objectStore(IFTY_RECOVERY_STORE);
        own.forEach(item => store.delete(item.id));
        await idbTransactionDone(deleteTransaction);
      }

      if (db.objectStoreNames.contains(IFTY_GENERATED_WORD_CACHE_STORE)) {
        const cacheReadTransaction = db.transaction(IFTY_GENERATED_WORD_CACHE_STORE, 'readonly');
        const cached = await idbRequestPromise(cacheReadTransaction.objectStore(IFTY_GENERATED_WORD_CACHE_STORE).getAll());
        const ownCache = (Array.isArray(cached) ? cached : []).filter(item => item && item.user === user);
        if (ownCache.length) {
          const cacheDeleteTransaction = db.transaction(IFTY_GENERATED_WORD_CACHE_STORE, 'readwrite');
          const cacheStore = cacheDeleteTransaction.objectStore(IFTY_GENERATED_WORD_CACHE_STORE);
          ownCache.forEach(item => cacheStore.delete(item.id));
          await idbTransactionDone(cacheDeleteTransaction);
        }
      }
    } finally {
      db.close();
    }
  } catch (_) {}
}

window.openIftyAccountDelete = function() {
  showIftySecurityModal('アカウント削除', `
    <div style="padding:11px;border-radius:9px;background:#fef2f2;color:#991b1b;font-size:.86em;line-height:1.55;">IFTYアカウントとクラウド上の単語帳・実践・チャットデータを削除し、この端末のIFTY用ローカルキャッシュと端末内バックアップも削除します。この操作は取り消せません。書き出し済みJSONファイルは自動削除されません。</div>
    <div style="display:grid;gap:9px;margin-top:12px;">
      <div style="display:flex;gap:7px;"><input id="iftyDeletePassword" type="password" autocomplete="current-password" placeholder="現在のパスワード" style="flex:1;min-width:0;padding:10px;border:1px solid #94a3b8;border-radius:8px;font-size:1em;"><button type="button" onclick="toggleIftyPasswordVisibility('iftyDeletePassword', this)" style="border:none;background:#334155;color:white;padding:0 12px;border-radius:8px;font-weight:800;cursor:pointer;">表示</button></div>
      <input id="iftyDeleteConfirmText" autocomplete="off" placeholder="確認のため DELETE と入力" style="padding:10px;border:1px solid #94a3b8;border-radius:8px;font-size:1em;">
      <button type="button" onclick="submitIftyAccountDelete()" style="border:none;background:#b91c1c;color:white;padding:10px;border-radius:8px;font-weight:900;cursor:pointer;">完全に削除</button>
      <div id="iftySecurityModalStatus" style="min-height:1.3em;color:#475569;font-size:.84em;"></div>
    </div>`);
};

window.submitIftyAccountDelete = async function() {
  const currentPassword = String(document.getElementById('iftyDeletePassword')?.value || '');
  const confirmText = String(document.getElementById('iftyDeleteConfirmText')?.value || '').trim();
  if (confirmText !== 'DELETE') {
    setIftySecurityModalStatus('確認欄に DELETE と入力してください。', true);
    return;
  }
  if (!confirm('本当にIFTYアカウントを削除しますか？クラウドデータは元に戻せません。')) return;
  setIftySecurityModalStatus('削除中…');
  try {
    const deletingUser = currentUser;
    await iftyAccountApi('account_delete', { token: iftySessionToken, currentPassword, confirm: 'DELETE' });
    await purgeIftyLocalAccountData(deletingUser);
    clearIftyAccountSession();
    location.reload();
  } catch (error) {
    setIftySecurityModalStatus(error.message || 'アカウントを削除できませんでした。', true);
  }
};

function captureIftyCloudPayload() {
  return {
    schemaVersion: 1,
    appVersion: 'Q3_STEP18',
    savedAt: Date.now(),
    folders: deepClone(Array.isArray(folders) ? folders : []),
    practiceData: deepClone(practiceData || { schemaVersion: 1, modules: {} }),
    chatSessions: sanitizeChatSessionsForBackup(),
    currentChatSessionId: currentChatSessionId || null,
    subjectOrders: deepClone(normalizeIftySubjectOrders(iftySubjectOrders)),
    subjectOrderUpdatedAt: deepClone(normalizeIftySubjectOrderMeta(iftySubjectOrderUpdatedAt)),
    iftyTheme: iftyTheme === 'dark' ? 'dark' : 'light'
  };
}

function readIftyLocalPayloadForUser(username) {
  let savedFolders = [];
  let savedPractice = { schemaVersion: 1, modules: { flashcards: { sets: [] }, questions: { sets: [] } } };
  let savedChats = [];
  let savedOrders = makeEmptyIftySubjectOrders();
  let savedOrderMeta = makeEmptyIftySubjectOrderMeta();
  try { savedFolders = JSON.parse(localStorage.getItem('vocab_user_' + username) || '[]'); } catch (_) {}
  try { savedPractice = JSON.parse(localStorage.getItem('practice_user_' + username) || JSON.stringify(savedPractice)); } catch (_) {}
  try { savedChats = JSON.parse(localStorage.getItem('chat_sessions_' + username) || '[]'); } catch (_) {}
  try { savedOrders = JSON.parse(localStorage.getItem(getIftyOrderStorageKey(username)) || 'null') || savedOrders; } catch (_) {}
  try { savedOrderMeta = JSON.parse(localStorage.getItem(getIftyOrderMetaStorageKey(username)) || 'null') || savedOrderMeta; } catch (_) {}
  return {
    schemaVersion: 1,
    appVersion: 'Q3_STEP18_LOCAL',
    savedAt: Date.now(),
    folders: Array.isArray(savedFolders) ? savedFolders : [],
    practiceData: savedPractice && typeof savedPractice === 'object' ? savedPractice : { schemaVersion: 1, modules: {} },
    chatSessions: Array.isArray(savedChats) ? savedChats : [],
    currentChatSessionId: Array.isArray(savedChats) && savedChats[0] ? savedChats[0].id : null,
    subjectOrders: normalizeIftySubjectOrders(savedOrders),
    subjectOrderUpdatedAt: normalizeIftySubjectOrderMeta(savedOrderMeta),
    iftyTheme: localStorage.getItem('ifty_theme') === 'dark' ? 'dark' : 'light'
  };
}

function hasMeaningfulIftyPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const savedFolders = Array.isArray(payload.folders) ? payload.folders : [];
  if (savedFolders.length) return true;
  const modules = payload.practiceData && payload.practiceData.modules ? payload.practiceData.modules : {};
  if (modules.flashcards && Array.isArray(modules.flashcards.sets) && modules.flashcards.sets.length) return true;
  if (modules.questions && Array.isArray(modules.questions.sets) && modules.questions.sets.length) return true;
  const orders = normalizeIftySubjectOrders(payload.subjectOrders);
  if (IFTY_SUBJECT_KEYS.some(subject => hasIftySavedOrders(orders[subject]))) return true;
  const chats = Array.isArray(payload.chatSessions) ? payload.chatSessions : [];
  return chats.some(session => Array.isArray(session.messages) && session.messages.some(message => message && message.role === 'user'));
}

async function applyIftyCloudPayload(payload, options = {}) {
  if (!payload || typeof payload !== 'object') throw new Error('クラウドセーブデータが不正です。');

  const remoteOrders = normalizeIftySubjectOrders(payload.subjectOrders);
  const remoteOrderMeta = normalizeIftySubjectOrderMeta(payload.subjectOrderUpdatedAt);
  let orderMergeChangedRemote = false;

  iftyCloudApplyingRemote = true;
  try {
    folders = deepClone(Array.isArray(payload.folders) ? payload.folders : []);
    practiceData = deepClone(payload.practiceData || { schemaVersion: 1, modules: { flashcards: { sets: [] }, questions: { sets: [] } } });
    chatSessions = deepClone(Array.isArray(payload.chatSessions) ? payload.chatSessions : []);

    if (options.mergeOrders === false) {
      iftySubjectOrders = remoteOrders;
      iftySubjectOrderUpdatedAt = remoteOrderMeta;
    } else {
      const mergedOrderState = mergeIftySubjectOrderState(
        iftySubjectOrders,
        iftySubjectOrderUpdatedAt,
        remoteOrders,
        remoteOrderMeta
      );
      iftySubjectOrders = mergedOrderState.orders;
      iftySubjectOrderUpdatedAt = mergedOrderState.updatedAt;
      orderMergeChangedRemote = !isSameIftySubjectOrderState(
        iftySubjectOrders,
        iftySubjectOrderUpdatedAt,
        remoteOrders,
        remoteOrderMeta
      );
    }

    iftyTheme = payload.iftyTheme === 'dark' ? 'dark' : 'light';

    normalizeFoldersData();
    normalizePracticeData();
    if (!chatSessions.length) {
      chatSessions = [{ id: 'session_' + Date.now(), title: 'ALLIA', messages: [{ role: 'assistant', text: 'こんにちは！ALLIAアシスタントです。何でも聞いてください！' }] }];
    }
    currentChatSessionId = chatSessions.some(session => session.id === payload.currentChatSessionId)
      ? payload.currentChatSessionId
      : chatSessions[0].id;

    selectedFolderIds.clear();
    selectedWordIds.clear();
    clearAllIftySpellingSuggestionTimers();
    pendingSpellingSuggestions = {};
    wordInputDrafts = {};
    iftySocialTopicDrafts = {};
    iftySocialImageDrafts = {};
    iftySocialGenerationPending = {};
    iftySocialEditorImageDraft = null;
    undoStack = [];
    redoStack = [];

    saveUserData();
    savePracticeData();
    saveChatSessions();
    saveIftySubjectOrders({ queueCloud: false });
    applyIftyTheme();
    renderFolders();
    updateChatSessionSelect();
    renderChatMessages();
    updateUndoRedoButtons();
    const practiceModal = document.getElementById('practiceModal');
    if (practiceModal && practiceModal.style.display !== 'none') renderPracticeHome();
    applyAlliaBranding();
  } finally {
    iftyCloudApplyingRemote = false;
  }

  return { orderMergeChangedRemote };
}

function markIftyCloudDirty() {
  if (!iftyAccount) return;
  localStorage.setItem(getIftyCloudDirtyKey(), '1');
}

function queueIftyCloudSave(reason = '変更') {
  if (!iftyCloudSaveEnabled || iftyCloudApplyingRemote || !iftyAccount || !iftySessionToken) return;
  markIftyCloudDirty();

  if (!isIftyOnline()) {
    setIftyCloudStatus('☁️ オフライン：端末に一時保存', 'offline');
    return;
  }

  if (iftyCloudSaveTimer) clearTimeout(iftyCloudSaveTimer);
  setIftyCloudStatus('☁️ 保存待ち');
  iftyCloudSaveTimer = setTimeout(() => {
    flushIftyCloudSave({ reason }).catch(error => {
      console.warn('IFTYクラウド保存エラー:', error);
    });
  }, IFTY_CLOUD_SAVE_DEBOUNCE_MS);
}

async function resolveIftyCloudConflict(conflictState) {
  const remoteRevision = Number(conflictState && conflictState.revision || 0);
  const remotePayload = conflictState && conflictState.payload;
  try { await createIftyRecoverySnapshot('クラウド競合前の端末保存', { force: true, kind: 'MANUAL' }); } catch (_) {}

  const useCloud = confirm('別の端末で更新されたクラウドセーブを検出しました。\n\nOK：クラウド版をこの端末へ読み込む\nキャンセル：この端末版をクラウドへ上書きする\n\nどちらを選んでも、この端末の現在状態は復元用バックアップへ保存しています。');
  if (useCloud) {
    await applyIftyCloudPayload(remotePayload || {}, { mergeOrders: false });
    iftyCloudRevision = remoteRevision;
    localStorage.setItem(getIftyCloudRevisionKey(), String(iftyCloudRevision));
    localStorage.removeItem(getIftyCloudDirtyKey());
    setIftyCloudStatus('☁️ 同期済み', 'ok');
    return;
  }

  const forced = await iftyAccountApi('cloud_save', {
    token: iftySessionToken,
    expectedRevision: remoteRevision,
    force: true,
    payload: captureIftyCloudPayload()
  });
  iftyCloudRevision = Number(forced.revision || remoteRevision + 1);
  localStorage.setItem(getIftyCloudRevisionKey(), String(iftyCloudRevision));
  localStorage.removeItem(getIftyCloudDirtyKey());
  setIftyCloudStatus('☁️ 同期済み', 'ok');
}

async function flushIftyCloudSave(options = {}) {
  if (!iftyCloudSaveEnabled || !iftyAccount || !iftySessionToken) return;
  if (!isIftyOnline()) {
    markIftyCloudDirty();
    setIftyCloudStatus('☁️ オフライン：端末に一時保存', 'offline');
    return;
  }

  if (iftyCloudSyncInFlight) {
    iftyCloudSyncQueued = true;
    return;
  }

  iftyCloudSyncInFlight = true;
  setIftyCloudStatus('☁️ 保存中…');
  try {
    const data = await iftyAccountApi('cloud_save', {
      token: iftySessionToken,
      expectedRevision: iftyCloudRevision,
      force: !!options.force,
      payload: captureIftyCloudPayload()
    });
    iftyCloudRevision = Number(data.revision || iftyCloudRevision + 1);
    localStorage.setItem(getIftyCloudRevisionKey(), String(iftyCloudRevision));
    localStorage.removeItem(getIftyCloudDirtyKey());
    setIftyCloudStatus('☁️ 同期済み', 'ok');
  } catch (error) {
    if (error.status === 409 && error.data && error.data.state) {
      await resolveIftyCloudConflict(error.data.state);
    } else if (error.status === 401) {
      setIftyCloudStatus('☁️ ログイン期限切れ', 'error');
      alert('IFTYアカウントのログイン期限が切れました。もう一度ログインしてください。端末内のデータは削除しません。');
      clearIftyAccountSession();
      renderIftyAccountLanding('ログインし直してください。');
    } else {
      markIftyCloudDirty();
      setIftyCloudStatus('☁️ 同期待ち', 'offline');
      throw error;
    }
  } finally {
    iftyCloudSyncInFlight = false;
    if (iftyCloudSyncQueued) {
      iftyCloudSyncQueued = false;
      setTimeout(() => flushIftyCloudSave().catch(() => {}), 200);
    }
  }
}

async function syncIftyCloudAfterLogin() {
  if (!iftyAccount || !iftySessionToken || !isIftyOnline()) {
    setIftyCloudStatus('☁️ オフライン：端末キャッシュ使用', 'offline');
    return;
  }

  setIftyCloudStatus('☁️ クラウド確認中…');
  const localRevision = Number(localStorage.getItem(getIftyCloudRevisionKey()) || 0);
  const localDirty = localStorage.getItem(getIftyCloudDirtyKey()) === '1';
  const cloud = await iftyAccountApi('cloud_load', { token: iftySessionToken });

  if (cloud.exists) {
    const remoteRevision = Number(cloud.revision || 0);
    if (localDirty) {
      iftyCloudRevision = localRevision;
      if (localRevision !== remoteRevision) {
        await resolveIftyCloudConflict({ revision: remoteRevision, payload: cloud.payload });
      } else {
        await flushIftyCloudSave();
      }
      return;
    }

    iftyCloudRevision = remoteRevision;
    const applyResult = await applyIftyCloudPayload(cloud.payload || {});
    localStorage.setItem(getIftyCloudRevisionKey(), String(iftyCloudRevision));

    if (applyResult && applyResult.orderMergeChangedRemote) {
      // 端末側のORDERを救済した場合、その状態をクラウドにも即時反映して
      // 次の端末で再び消えることを防ぐ。
      markIftyCloudDirty();
      await flushIftyCloudSave({ reason: 'ORDER同期補正' });
    } else {
      localStorage.removeItem(getIftyCloudDirtyKey());
      setIftyCloudStatus('☁️ 同期済み', 'ok');
    }
    return;
  }

  let initialPayload = captureIftyCloudPayload();
  if (!hasMeaningfulIftyPayload(initialPayload)) {
    const legacy = readIftyLocalPayloadForUser('default_user');
    if (hasMeaningfulIftyPayload(legacy)) {
      await applyIftyCloudPayload(legacy);
      initialPayload = captureIftyCloudPayload();
      try { await createIftyRecoverySnapshot('旧default_userデータをアカウントへ移行', { force: true, kind: 'MANUAL' }); } catch (_) {}
    }
  }

  iftyCloudRevision = 0;
  localStorage.setItem(getIftyCloudRevisionKey(), '0');
  markIftyCloudDirty();
  await flushIftyCloudSave();
}

function installIftyCloudOnlineListener() {
  if (iftyCloudOnlineListenerInstalled) return;
  iftyCloudOnlineListenerInstalled = true;
  window.addEventListener('online', () => {
    if (iftyAccount && iftySessionToken) {
      syncIftyCloudAfterLogin().catch(error => console.warn('IFTY再同期エラー:', error));
    }
  });
  window.addEventListener('offline', () => {
    if (iftyAccount) setIftyCloudStatus('☁️ オフライン：端末に一時保存', 'offline');
  });
}

async function enterIftyAccount(account, options = {}) {
  if (!account || !account.username) throw new Error('アカウント情報が不正です。');
  iftyAccount = account;
  currentUser = String(account.username);
  localStorage.setItem('currentUser', currentUser);
  setIftyAuthenticatedUiVisible(true);
  const userDisplay = document.getElementById('userDisplay');
  if (userDisplay) userDisplay.textContent = currentUser;
  ensureIftyCloudStatusUi();

  iftyCloudSaveEnabled = false;
  loadUserData(currentUser);
  loadPracticeData(currentUser);
  initChatSystem();
  loadIftySubjectOrders(currentUser);
  applyAlliaBranding();
  ensureIftyBrandUi();
  ensureIftyNetworkUi();
  loadIftyAutosavePreference();
  loadIftySpellingAutoAcceptPreference();
  loadIftyDailyGoalPreference();
  startIftyAutoBackup();
  iftyCloudSaveEnabled = true;

  if (options.offline) {
    iftyCloudRevision = Number(localStorage.getItem(getIftyCloudRevisionKey()) || 0);
    setIftyCloudStatus('☁️ オフライン：端末キャッシュ使用', 'offline');
  } else {
    await syncIftyCloudAfterLogin();
  }

  if (typeof window.openIftyHome === 'function') window.openIftyHome();
}

async function enterIftyDeveloperSession() {
  iftyDeveloperMode = true;
  iftyAccount = null;
  iftySessionToken = '';
  iftyCloudRevision = 0;
  iftyCloudSaveEnabled = false;
  iftyCloudApplyingRemote = false;
  iftyCloudSyncInFlight = false;
  iftyCloudSyncQueued = false;

  currentUser = IFTY_DEVELOPER_LOCAL_USER;
  localStorage.setItem('currentUser', currentUser);
  sessionStorage.setItem(IFTY_DEVELOPER_SESSION_KEY, '1');

  setIftyAuthenticatedUiVisible(true);
  const userDisplay = document.getElementById('userDisplay');
  if (userDisplay) userDisplay.textContent = 'Developer';
  ensureIftyCloudStatusUi();
  setIftyCloudStatus('🧪 Developer：端末ローカルのみ', 'offline');

  loadUserData(currentUser);
  loadPracticeData(currentUser);
  initChatSystem();
  loadIftySubjectOrders(currentUser);
  applyAlliaBranding();
  ensureIftyBrandUi();
  ensureIftyNetworkUi();
  loadIftyAutosavePreference();
  loadIftySpellingAutoAcceptPreference();
  loadIftyDailyGoalPreference();
  startIftyAutoBackup();

  // Developerはアカウント認証を省略する代わりに、クラウド同期は常に無効。
  iftyCloudSaveEnabled = false;

  if (typeof window.openIftyHome === 'function') window.openIftyHome();
}

window.enterIftyDeveloperMode = async function() {
  setIftyAccountFormStatus('Developerモードを開いています…');
  try {
    await enterIftyDeveloperSession();
  } catch (error) {
    sessionStorage.removeItem(IFTY_DEVELOPER_SESSION_KEY);
    iftyDeveloperMode = false;
    setIftyAccountFormStatus(error.message || 'Developerモードを開けませんでした。', true);
  }
};

async function bootstrapIftyAccount() {
  ensureIftyBrandUi();
  setIftyAuthenticatedUiVisible(false);
  installIftyCloudOnlineListener();

  if (sessionStorage.getItem(IFTY_DEVELOPER_SESSION_KEY) === '1') {
    await enterIftyDeveloperSession();
    return;
  }

  const token = String(localStorage.getItem(IFTY_SESSION_TOKEN_KEY) || '');
  const meta = readStoredIftyAccountMeta();
  if (!token || !meta || !meta.username) {
    renderIftyAccountLanding();
    return;
  }

  iftySessionToken = token;
  iftyAccount = meta;

  if (!isIftyOnline()) {
    await enterIftyAccount(meta, { offline: true });
    return;
  }

  try {
    const session = await iftyAccountApi('account_session', { token });
    storeIftyAccountSession(session.account, token);
    await enterIftyAccount(session.account);
  } catch (error) {
    clearIftyAccountSession();
    renderIftyAccountLanding(error.status === 401 ? 'セッションの期限が切れました。再ログインしてください。' : 'アカウント確認に失敗しました。');
  }
}

window.loginIftyAccount = async function() {
  const username = String(document.getElementById('iftyAccountUsername')?.value || '').trim();
  const password = String(document.getElementById('iftyAccountPassword')?.value || '');
  if (!username || !password) {
    setIftyAccountFormStatus('IFTY IDとパスワードを入力してください。', true);
    return;
  }
  if (!isIftyOnline()) {
    setIftyAccountFormStatus('初回ログインにはインターネット接続が必要です。', true);
    return;
  }

  setIftyAccountFormStatus('ログイン中…');
  try {
    const result = await iftyAccountApi('account_login', { username, password });
    storeIftyAccountSession(result.account, result.token);
    await enterIftyAccount(result.account);
  } catch (error) {
    setIftyAccountFormStatus(error.message || 'ログインできませんでした。', true);
  }
};

window.registerIftyAccount = async function() {
  const username = String(document.getElementById('iftyAccountUsername')?.value || '').trim();
  const password = String(document.getElementById('iftyAccountPassword')?.value || '');
  const confirmPassword = String(document.getElementById('iftyAccountPasswordConfirm')?.value || '');
  if (!/^[A-Za-z0-9_.-]{3,24}$/.test(username)) {
    setIftyAccountFormStatus('IFTY IDは英数字・_ . - の3〜24文字で入力してください。', true);
    return;
  }
  if (password.length < 10) {
    setIftyAccountFormStatus('パスワードは10文字以上にしてください。', true);
    return;
  }
  if (password !== confirmPassword) {
    setIftyAccountFormStatus('確認用パスワードが一致していません。', true);
    return;
  }
  if (!isIftyOnline()) {
    setIftyAccountFormStatus('アカウント作成にはインターネット接続が必要です。', true);
    return;
  }

  setIftyAccountFormStatus('アカウント作成中…');
  try {
    const result = await iftyAccountApi('account_register', { username, password });
    storeIftyAccountSession(result.account, result.token);
    await enterIftyAccount(result.account);
  } catch (error) {
    setIftyAccountFormStatus(error.message || 'アカウントを作成できませんでした。', true);
  }
};

// ==========================================
// ALLIA 表示統一
// ==========================================
function applyAlliaBranding() {
  document.title = (document.title || 'スマート単語帳 & ALLIA')
    .replace(/Grok AI/gi, 'ALLIA')
    .replace(/Grok/gi, 'ALLIA');

  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.placeholder = `${getIftySubjectDisplayName(currentIftySubject)} ALLIAに質問…`;

    const initialValue = String(chatInput.value || '').trim();
    if (initialValue === 'ALLIA' || /^grok$/i.test(initialValue)) {
      chatInput.value = '';
    }
  }

  document.querySelectorAll('input, textarea').forEach(el => {
    if (typeof el.placeholder === 'string' && /grok/i.test(el.placeholder)) {
      el.placeholder = el.placeholder.replace(/Grok/gi, 'ALLIA');
    }
  });
}

// 1. 初期化処理
document.addEventListener("DOMContentLoaded", function() {
  removeIftyBottomRightLauncher();
  applyAlliaBranding();
  ensureIftyPwaHeadLinks();
  ensureIftyBrandUi();
  ensureIftyNetworkUi();
  installIftyNetworkListeners();
  registerIftyServiceWorker();
  bootstrapIftyAccount().catch(error => {
    console.error('IFTYアカウント初期化エラー:', error);
    renderIftyAccountLanding('アカウント初期化に失敗しました。');
  });
});

document.addEventListener('keydown', function(event) {
  const target = event.target;
  const tag = target && target.tagName ? String(target.tagName).toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || (target && target.isContentEditable)) return;
  const key = String(event.key || '').toLowerCase();
  const command = event.ctrlKey || event.metaKey;
  if (!command) return;
  if (key === 'z' && !event.shiftKey) {
    event.preventDefault();
    window.undoIfty();
  } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
    event.preventDefault();
    window.redoIfty();
  }
});


// ==========================================
// Q3 STEP36：全モーダル「画面外タップで閉じる」
// 背景オーバーレイそのものをタップした時だけ閉じるため、カード内部の操作には干渉しない。
// ==========================================
const IFTY_OUTSIDE_CLOSE_HANDLERS = {
  editWordModal: () => window.closeEditWordModal?.(),
  iftySecurityModal: () => window.closeIftySecurityModal?.(),
  iftyPasswordRecoveryModal: () => window.closeIftyPasswordRecoveryInfo?.(),
  iftyRecoveryModal: () => window.closeIftyRecoveryCenter?.(),
  practiceNameModal: () => { const el = document.getElementById('practiceNameModal'); if (el) el.style.display = 'none'; },
  iftyBasicSentenceModal: () => window.closeIftyBasicSentenceEditor?.(),
  iftySocialItemModal: () => window.closeIftySocialItemEditor?.(),
  iftySocialVisualQuizModal: () => window.closeIftySocialVisualQuiz?.(),
  iftySocialImageViewerModal: () => window.closeIftySocialImageViewer?.(),
  practiceModal: () => window.closePracticeModal?.(),
  flashcardModal: () => window.closeFlashcardModal?.(),
  mainLauncherModal: () => window.closeMainLauncher?.(),
  appMenuModal: () => window.closeMenuModal?.(),
  iftyOrderModal: () => window.closeIftyOrderModal?.()
};

document.addEventListener('click', function(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const handler = IFTY_OUTSIDE_CLOSE_HANDLERS[target.id];
  if (typeof handler === 'function') handler();
});

// ==========================================
// Q3 STEP24：全画面スマートEnter確定
// 「次へ」「続ける」「開始」「判定」「保存」など、次の状態へ進む主操作をEnterで実行する。
// 入力欄・IME変換中・破壊操作・戻る/閉じる系・候補が複数で曖昧な画面は自動実行しない。
// ボタン自身にフォーカスがある場合はブラウザ標準のEnterクリックに任せる。
// ==========================================
const IFTY_ENTER_MODAL_IDS = [
  'editWordModal',
  'iftySecurityModal',
  'iftyPasswordRecoveryModal',
  'iftyRecoveryModal',
  'practiceNameModal',
  'iftyBasicSentenceModal',
  'iftySocialItemModal',
  'iftySocialVisualQuizModal',
  'iftySocialImageViewerModal',
  'practiceModal',
  'flashcardModal',
  'mainLauncherModal',
  'appMenuModal',
  'iftyOrderModal'
];

function isIftyElementVisible(element) {
  if (!element || !element.isConnected) return false;
  if (element.hidden) return false;
  const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)) return false;
  const rect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null;
  if (rect && rect.width <= 0 && rect.height <= 0) return false;
  return true;
}

function getIftyEnterScope() {
  const visibleModals = IFTY_ENTER_MODAL_IDS
    .map((id, order) => {
      const element = document.getElementById(id);
      if (!isIftyElementVisible(element)) return null;
      const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
      const zIndex = style ? Number.parseInt(style.zIndex, 10) : 0;
      return { element, order, zIndex: Number.isFinite(zIndex) ? zIndex : 0 };
    })
    .filter(Boolean)
    .sort((a, b) => (b.zIndex - a.zIndex) || (b.order - a.order));

  return visibleModals.length ? visibleModals[0].element : document;
}

function normalizeIftyEnterButtonText(button) {
  return String((button && (button.innerText || button.textContent)) || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getIftyEnterButtonPriority(button) {
  if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return -1;
  if (button.getAttribute('data-ifty-enter-ignore') === 'true') return -1;
  if (!isIftyElementVisible(button)) return -1;

  const text = normalizeIftyEnterButtonText(button);
  const aria = String(button.getAttribute('aria-label') || '').trim();
  const onclick = String(button.getAttribute('onclick') || '').trim();
  const combined = `${text} ${aria}`.trim();

  // Enterだけで実行すると困る操作は明示的に除外する。
  if (/閉じる|戻る|終了|中断|キャンセル|スキップ|削除|全削除|消す|解除|停止|RESET|LOG\s*OUT|ログアウト|復元|書き出し|Challenge|チャレンジ|表示|発音|音声を再生|クリア|取り消し|やり直し/i.test(combined)) return -1;
  if (/delete|remove|logout|restore|revoke|clear|close|pause|skip/i.test(onclick)) return -1;

  // 最優先：結果画面などの明確な「次へ」。
  if (/^(?:➡️\s*)?次へ$/i.test(text) || /^NEXT$/i.test(text) || /next[A-Z_a-z0-9]*\s*\(/.test(onclick)) return 100;

  // 続行系。復習の「残りを続ける」など。
  if (/続ける|続きから|もう一度続ける|残りを続ける|答えを見る/i.test(text)) return 95;

  // 回答確定・ローカル判定。クイズ側の専用Enter処理がpreventDefaultした場合はこちらは動かない。
  if (/端末内で判定|回答する|判定してもらう|回答を確定|確定$/i.test(text) || /submit[A-Z_a-z0-9]*\s*\(/.test(onclick)) return 90;

  // 明確な開始操作。
  if (/開始|始める|プレイ開始|学習開始/i.test(text) || /start[A-Z_a-z0-9]*\s*\(/.test(onclick)) return 80;

  // 保存・決定・送信・認証・再試行など。入力欄フォーカス中はこの仕組み自体を使わない。
  if (/^保存$|^SAVE ORDER$|保存して閉じる|決定|送信|確認コードを送信|パスワードに変更|^変更$|^作成$|^登録$|^ログイン$|^新規登録$|再試行/i.test(text)) return 70;
  if (/^(?:save|confirm|retry|login|register)[A-Z_a-z0-9]*\s*\(/.test(onclick)) return 70;

  // 「他のモードでプレイ」のような明確な前進遷移。
  if (/他のモードでプレイ|ALLIAを開く|例文.*学習|苦手だけ学習/i.test(text)) return 60;

  return -1;
}

function findIftySmartEnterButton(scope = getIftyEnterScope()) {
  if (!scope || typeof scope.querySelectorAll !== 'function') return null;
  const candidates = Array.from(scope.querySelectorAll('button'))
    .map(button => ({ button, priority: getIftyEnterButtonPriority(button) }))
    .filter(item => item.priority >= 0);

  if (!candidates.length) return null;
  const highest = Math.max(...candidates.map(item => item.priority));
  const top = candidates.filter(item => item.priority === highest);

  // 同格の主操作が複数ある画面では勝手に選ばない。
  if (top.length !== 1) return null;
  return top[0].button;
}

function shouldIftySkipSmartEnter(event) {
  if (!event || event.key !== 'Enter') return true;
  if (event.repeat || event.isComposing || event.keyCode === 229) return true;
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return true;

  const target = event.target;
  const tag = target && target.tagName ? String(target.tagName).toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || (target && target.isContentEditable)) return true;

  // フォーカス中のボタン/リンクはブラウザ標準操作を優先する。
  const active = document.activeElement;
  const activeTag = active && active.tagName ? String(active.tagName).toLowerCase() : '';
  if (activeTag === 'button' || activeTag === 'a') return true;

  return false;
}

function installIftySmartEnterNavigation() {
  if (window.__iftySmartEnterNavigationInstalled) return;
  window.__iftySmartEnterNavigationInstalled = true;

  document.addEventListener('keydown', event => {
    if (shouldIftySkipSmartEnter(event)) return;

    // 同じkeydownを扱うクイズ/例文学習などの専用処理を先に通す。
    // それらがpreventDefaultした場合は二重実行しない。
    queueMicrotask(() => {
      if (event.defaultPrevented) return;
      const button = findIftySmartEnterButton();
      if (!button || !button.isConnected || !isIftyElementVisible(button) || button.disabled) return;
      event.preventDefault();
      button.click();
    });
  });
}

installIftySmartEnterNavigation();

// 2. ユーザーデータ管理
function makeId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

function getIftyLocalDateKey(timestamp = Date.now()) {
  const date = new Date(Number(timestamp || Date.now()));
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeIftyStudyState(word) {
  if (!word || typeof word !== 'object') return null;
  if (!word.study || typeof word.study !== 'object') word.study = {};
  const study = word.study;
  ['total','correct','wrong'].forEach(key => {
    const value = Number(study[key]);
    study[key] = Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
  });
  study.firstStudiedAt = Number.isFinite(Number(study.firstStudiedAt)) && Number(study.firstStudiedAt) > 0 ? Number(study.firstStudiedAt) : 0;
  study.lastStudiedAt = Number.isFinite(Number(study.lastStudiedAt)) && Number(study.lastStudiedAt) > 0 ? Number(study.lastStudiedAt) : 0;
  if (!study.daily || typeof study.daily !== 'object' || Array.isArray(study.daily)) study.daily = {};
  Object.keys(study.daily).forEach(key => {
    const row = study.daily[key];
    if (!row || typeof row !== 'object') { delete study.daily[key]; return; }
    ['attempts','correct','wrong'].forEach(name => {
      const value = Number(row[name]);
      row[name] = Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
    });
  });
  const dayKeys = Object.keys(study.daily).sort().reverse();
  dayKeys.slice(IFTY_STUDY_HISTORY_MAX_DAYS).forEach(key => delete study.daily[key]);
  if (!study.sources || typeof study.sources !== 'object' || Array.isArray(study.sources)) study.sources = {};
  return study;
}

function normalizeIftyReviewState(word) {
  if (!word || typeof word !== 'object') return null;
  if (!word.review || typeof word.review !== 'object') return null;

  const review = word.review;
  review.active = review.active === true;

  let level = Number(review.level);
  if (!Number.isFinite(level)) level = -1;
  review.level = Math.max(-1, Math.min(IFTY_REVIEW_INTERVAL_DAYS.length - 1, Math.trunc(level)));

  const lastReviewed = Number(review.lastReviewed);
  review.lastReviewed = Number.isFinite(lastReviewed) && lastReviewed > 0 ? lastReviewed : 0;

  const nextReview = Number(review.nextReview);
  review.nextReview = Number.isFinite(nextReview) && nextReview > 0 ? nextReview : 0;
  if (review.active && !review.nextReview) review.nextReview = Date.now();

  const correctCount = Number(review.correctCount);
  review.correctCount = Number.isFinite(correctCount) && correctCount >= 0 ? Math.trunc(correctCount) : 0;

  const wrongCount = Number(review.wrongCount);
  review.wrongCount = Number.isFinite(wrongCount) && wrongCount >= 0 ? Math.trunc(wrongCount) : 0;

  review.source = review.source === 'auto' ? 'auto' : 'manual';
  const graduatedAt = Number(review.graduatedAt);
  review.graduatedAt = Number.isFinite(graduatedAt) && graduatedAt > 0 ? graduatedAt : 0;
  const manuallyRemovedAt = Number(review.manuallyRemovedAt);
  review.manuallyRemovedAt = Number.isFinite(manuallyRemovedAt) && manuallyRemovedAt > 0 ? manuallyRemovedAt : 0;
  return review;
}

function recordIftyStudyEvent(wordId, correct, source = 'practice') {
  const word = getIftyReviewWordById(wordId);
  if (!word) return false;
  const study = normalizeIftyStudyState(word);
  const now = Date.now();
  const dayKey = getIftyLocalDateKey(now);
  if (!study.firstStudiedAt) study.firstStudiedAt = now;
  study.lastStudiedAt = now;
  study.total += 1;
  if (correct) study.correct += 1;
  else study.wrong += 1;
  if (!study.daily[dayKey]) study.daily[dayKey] = { attempts: 0, correct: 0, wrong: 0 };
  study.daily[dayKey].attempts += 1;
  if (correct) study.daily[dayKey].correct += 1;
  else study.daily[dayKey].wrong += 1;
  const sourceKey = String(source || 'practice').slice(0, 40);
  study.sources[sourceKey] = (Number(study.sources[sourceKey]) || 0) + 1;
  normalizeIftyStudyState(word);
  return true;
}

function correctIftyLastStudyOutcome(wordId) {
  const word = getIftyReviewWordById(wordId);
  if (!word) return false;
  const study = normalizeIftyStudyState(word);
  if (!study || study.wrong <= 0) return false;
  study.wrong -= 1;
  study.correct += 1;
  const dayKey = getIftyLocalDateKey();
  const row = study.daily[dayKey];
  if (row && row.wrong > 0) {
    row.wrong -= 1;
    row.correct += 1;
  }
  return true;
}

function isIftyWeakWord(word) {
  const study = normalizeIftyStudyState(word);
  if (!study || study.total < IFTY_WEAK_MIN_ATTEMPTS || study.wrong < IFTY_WEAK_MIN_WRONG) return false;
  const accuracy = study.total ? study.correct / study.total : 1;
  return accuracy < IFTY_WEAK_MAX_ACCURACY;
}

function getIftyWeakEntries() {
  const entries = [];
  folders.forEach(folder => {
    (folder.words || []).forEach((word, index) => {
      if (!isIftyWeakWord(word)) return;
      const study = normalizeIftyStudyState(word);
      entries.push({ folder, word, index, study, accuracy: study.total ? study.correct / study.total : 0 });
    });
  });
  entries.sort((a, b) => a.accuracy - b.accuracy || b.study.wrong - a.study.wrong || String(a.word.word || '').localeCompare(String(b.word.word || ''), 'en'));
  return entries;
}

function getIftyStudyActivityMap() {
  const activity = {};
  folders.forEach(folder => {
    (folder.words || []).forEach(word => {
      const study = normalizeIftyStudyState(word);
      if (!study || !study.daily) return;
      Object.entries(study.daily).forEach(([key, row]) => {
        if (!row || Number(row.attempts || 0) <= 0) return;
        activity[key] = (activity[key] || 0) + 1;
      });
    });
  });
  return activity;
}

function getIftyDateKeyDaysAgo(daysAgo = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - Math.max(0, Math.trunc(Number(daysAgo) || 0)));
  return getIftyLocalDateKey(date.getTime());
}

function getIftyStudyStreakInfo(maxDays = IFTY_STUDY_HISTORY_MAX_DAYS) {
  const activity = getIftyStudyActivityMap();
  const todayActive = !!activity[getIftyDateKeyDaysAgo(0)];
  let current = 0;
  let offset = todayActive ? 0 : 1;

  while (offset < maxDays && activity[getIftyDateKeyDaysAgo(offset)]) {
    current += 1;
    offset += 1;
  }

  let best = 0;
  let running = 0;
  for (let i = maxDays - 1; i >= 0; i--) {
    if (activity[getIftyDateKeyDaysAgo(i)]) {
      running += 1;
      if (running > best) best = running;
    } else {
      running = 0;
    }
  }

  return { current, best };
}

function getIftyLearningStats() {
  const today = getIftyLocalDateKey();
  let studiedToday = 0;
  let answersToday = 0;
  let correctToday = 0;
  let reviewActive = 0;
  let reviewGraduated = 0;
  folders.forEach(folder => {
    (folder.words || []).forEach(word => {
      const study = normalizeIftyStudyState(word);
      const row = study && study.daily ? study.daily[today] : null;
      if (row && row.attempts > 0) {
        studiedToday += 1;
        answersToday += row.attempts;
        correctToday += row.correct;
      }
      const review = normalizeIftyReviewState(word);
      if (review && review.active) reviewActive += 1;
      if (review && review.graduatedAt > 0) reviewGraduated += 1;
    });
  });
  const streak = getIftyStudyStreakInfo();
  const dailyGoal = Math.max(IFTY_DAILY_GOAL_MIN_WORDS, Number(iftyDailyGoalWords) || IFTY_DAILY_GOAL_DEFAULT_WORDS);
  return {
    studiedToday,
    answersToday,
    correctToday,
    accuracyToday: answersToday ? Math.round(correctToday / answersToday * 100) : 0,
    dueReview: getIftyReviewEntries({ dueOnly: true }).length,
    reviewActive,
    reviewGraduated,
    weakWords: getIftyWeakEntries().length,
    dailyGoal,
    goalPercent: Math.min(999, Math.round(studiedToday / dailyGoal * 100)),
    studyStreak: streak.current,
    bestStreak: streak.best
  };
}

function getIftyRecentDailyStats(days = 7) {
  const result = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const key = getIftyLocalDateKey(date.getTime());
    let attempts = 0, correct = 0, studiedWords = 0;
    folders.forEach(folder => (folder.words || []).forEach(word => {
      const study = normalizeIftyStudyState(word);
      const row = study && study.daily ? study.daily[key] : null;
      if (!row || !row.attempts) return;
      studiedWords += 1;
      attempts += row.attempts;
      correct += row.correct;
    }));
    result.push({ key, attempts, correct, studiedWords, accuracy: attempts ? Math.round(correct / attempts * 100) : 0 });
  }
  return result;
}

function enrollIftyReviewFromStudy(wordId, correct) {
  const word = getIftyReviewWordById(wordId);
  if (!word) return false;
  const now = Date.now();
  let review = normalizeIftyReviewState(word);
  if (review && review.active) {
    if (!correct) {
      review.level = 0;
      review.lastReviewed = now;
      review.nextReview = now + IFTY_REVIEW_INTERVAL_DAYS[0] * IFTY_REVIEW_DAY_MS;
      review.graduatedAt = 0;
      review.wrongCount += 1;
      word.mastery = 'unfixed';
      return true;
    }
    return false;
  }
  if (review && review.graduatedAt > 0 && correct) return false;
  if (!review) {
    word.review = {
      active: true,
      level: 0,
      lastReviewed: now,
      nextReview: now + IFTY_REVIEW_INTERVAL_DAYS[0] * IFTY_REVIEW_DAY_MS,
      correctCount: 0,
      wrongCount: 0,
      source: 'auto',
      graduatedAt: 0,
      manuallyRemovedAt: 0
    };
    return true;
  }
  review.active = true;
  review.level = 0;
  review.lastReviewed = now;
  review.nextReview = now + IFTY_REVIEW_INTERVAL_DAYS[0] * IFTY_REVIEW_DAY_MS;
  review.source = 'auto';
  review.graduatedAt = 0;
  review.manuallyRemovedAt = 0;
  return true;
}

function isIftyReviewTagged(word) {
  const review = normalizeIftyReviewState(word);
  return !!(review && review.active);
}

function isIftyReviewDue(word, now = Date.now()) {
  const review = normalizeIftyReviewState(word);
  return !!(review && review.active && Number(review.nextReview || 0) <= now);
}

function formatIftyReviewDate(timestamp) {
  const value = Number(timestamp || 0);
  if (!Number.isFinite(value) || value <= 0) return '未設定';
  const date = new Date(value);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat('ja-JP', sameYear
    ? { month: 'numeric', day: 'numeric' }
    : { year: 'numeric', month: 'numeric', day: 'numeric' }
  ).format(date);
}

function getIftyReviewEntries(options = {}) {
  const dueOnly = options.dueOnly === true;
  const now = Number(options.now || Date.now());
  const entries = [];

  folders.forEach(folder => {
    (folder.words || []).forEach((word, index) => {
      const review = normalizeIftyReviewState(word);
      if (!review || !review.active) return;
      if (dueOnly && review.nextReview > now) return;
      entries.push({ folder, word, index, review });
    });
  });

  entries.sort((a, b) => {
    const nextDiff = Number(a.review.nextReview || 0) - Number(b.review.nextReview || 0);
    if (nextDiff !== 0) return nextDiff;
    return String(a.word.word || '').localeCompare(String(b.word.word || ''), 'en');
  });

  return entries;
}

function getIftyNextReviewTimestamp(now = Date.now()) {
  const future = getIftyReviewEntries()
    .map(entry => Number(entry.review.nextReview || 0))
    .filter(value => value > now);
  return future.length ? Math.min(...future) : 0;
}

function getIftyReviewWordById(wordId) {
  const ref = getWordById(wordId);
  return ref && ref.word ? ref.word : null;
}

function snapshotIftyReviewState(wordId) {
  const word = getIftyReviewWordById(wordId);
  if (!word) return null;
  return word.review && typeof word.review === 'object' ? deepClone(word.review) : null;
}

function restoreIftyReviewState(wordId, snapshot) {
  const word = getIftyReviewWordById(wordId);
  if (!word) return;
  if (snapshot && typeof snapshot === 'object') word.review = deepClone(snapshot);
  else delete word.review;
  normalizeIftyReviewState(word);
}

function applyIftyReviewResult(wordId, correct) {
  const word = getIftyReviewWordById(wordId);
  if (!word) return false;

  const review = normalizeIftyReviewState(word);
  if (!review || !review.active) return false;

  const now = Date.now();
  review.lastReviewed = now;
  if (correct) {
    review.correctCount += 1;
    if (review.level >= IFTY_REVIEW_INTERVAL_DAYS.length - 1) {
      review.active = false;
      review.nextReview = 0;
      review.graduatedAt = now;
      word.mastery = 'fixed';
      return true;
    }
    review.level = Math.min(review.level + 1, IFTY_REVIEW_INTERVAL_DAYS.length - 1);
  } else {
    review.level = 0;
    review.wrongCount += 1;
    review.graduatedAt = 0;
  }

  const intervalIndex = Math.max(0, review.level);
  review.nextReview = now + IFTY_REVIEW_INTERVAL_DAYS[intervalIndex] * IFTY_REVIEW_DAY_MS;
  word.mastery = correct ? 'fixed' : 'unfixed';
  return true;
}

window.toggleIftyWordReview = function(folderId, wordId) {
  const folder = folders.find(item => item.id === folderId);
  const word = folder && (folder.words || []).find(item => item.id === wordId);
  if (!word) return;

  recordUndoState(isIftyReviewTagged(word) ? '復習登録解除' : '復習登録');

  if (isIftyReviewTagged(word)) {
    word.review.active = false;
    word.review.manuallyRemovedAt = Date.now();
  } else {
    const review = normalizeIftyReviewState(word);
    if (!review) {
      word.review = {
        active: true,
        level: -1,
        lastReviewed: 0,
        nextReview: Date.now(),
        correctCount: 0,
        wrongCount: 0,
        source: 'manual',
        graduatedAt: 0,
        manuallyRemovedAt: 0
      };
    } else {
      review.active = true;
      review.level = -1;
      review.lastReviewed = 0;
      review.nextReview = Date.now();
      review.source = 'manual';
      review.graduatedAt = 0;
      review.manuallyRemovedAt = 0;
    }
  }

  saveUserData();
  renderFolders();
};

function renderIftyReviewFolder() {
  const allEntries = getIftyReviewEntries();
  const dueEntries = getIftyReviewEntries({ dueOnly: true });
  const nextReview = getIftyNextReviewTimestamp();
  const stats = getIftyLearningStats();

  const dueList = dueEntries.length
    ? dueEntries.map(({ folder, word, review }) => {
        const meanings = Array.isArray(word.meanings) ? word.meanings : (word.meanings ? [word.meanings] : []);
        const stage = review.level < 0 ? '手動・今すぐ' : `${IFTY_REVIEW_INTERVAL_DAYS[Math.max(0, review.level)]}日段階`;
        return `
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid #fed7aa;">
            <div style="min-width:0;">
              <div style="font-weight:900;color:#7c2d12;">${escapeHtml(word.word || '')}</div>
              <div style="margin-top:2px;color:#9a3412;font-size:.82em;line-height:1.4;">${escapeHtml(meanings.join(' / '))}</div>
              <div style="margin-top:3px;color:#a16207;font-size:.72em;">📁 ${escapeHtml(folder.name || '')} ・ ${escapeHtml(stage)} ・ ${review.source === 'auto' ? '自動登録' : '手動登録'}</div>
            </div>
            <button type="button" onclick="toggleIftyWordReview('${folder.id}','${word.id}')" style="border:none;background:#ffedd5;color:#9a3412;border-radius:6px;padding:6px 8px;font-size:.74em;font-weight:800;cursor:pointer;flex:none;">解除</button>
          </div>`;
      }).join('')
    : `<div style="padding:16px 4px;text-align:center;color:#a16207;font-size:.86em;">今日の復習はありません。${nextReview ? `次回は ${escapeHtml(formatIftyReviewDate(nextReview))} です。` : 'フラッシュカードやクイズで学習すると自動登録されます。手動登録も可能です。'}</div>`;

  return `
    <div id="iftyReviewFolder" style="background:#fff7ed;border:2px solid #fb923c;border-radius:10px;padding:16px;margin-bottom:12px;box-shadow:0 2px 5px rgba(154,52,18,.08);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <div>
          <h3 style="margin:0;color:#7c2d12;font-size:1.12em;">🔁 復習 <span style="font-size:.82em;color:#c2410c;">(今日 ${dueEntries.length}件 / 管理 ${allEntries.length}件 / 卒業 ${stats.reviewGraduated}件)</span></h3>
          <div style="margin-top:4px;color:#9a3412;font-size:.78em;">自動：学習 → 1日 → 3日 → 7日 → 14日 → 30日 → 卒業　／　間違いは1日段階へ戻る</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" onclick="startIftyDueReviewFlashcards('front')" ${dueEntries.length ? '' : 'disabled'} style="border:none;background:#ea580c;color:white;border-radius:7px;padding:8px 10px;font-weight:900;cursor:${dueEntries.length ? 'pointer' : 'default'};opacity:${dueEntries.length ? '1' : '.45'};">📇 今日の復習</button>
          <button type="button" onclick="startIftyDueReviewQuiz()" ${dueEntries.length ? '' : 'disabled'} style="border:none;background:#7c3aed;color:white;border-radius:7px;padding:8px 10px;font-weight:900;cursor:${dueEntries.length ? 'pointer' : 'default'};opacity:${dueEntries.length ? '1' : '.45'};">❓ クイズ</button>
        </div>
      </div>
      <div style="margin-top:10px;">${dueList}</div>
    </div>`;
}

function renderIftyWeakFolder() {
  const entries = getIftyWeakEntries();
  if (!entries.length) return '';
  const list = entries.slice(0, 12).map(({ folder, word, study, accuracy }) => {
    const meanings = Array.isArray(word.meanings) ? word.meanings : (word.meanings ? [word.meanings] : []);
    return `<div style="padding:8px 0;border-bottom:1px solid #fecdd3;display:flex;justify-content:space-between;gap:10px;align-items:flex-start;"><div><div style="font-weight:900;color:#881337;">${escapeHtml(word.word || '')}</div><div style="font-size:.8em;color:#9f1239;margin-top:2px;">${escapeHtml(meanings.join(' / '))}</div><div style="font-size:.72em;color:#be123c;margin-top:3px;">📁 ${escapeHtml(folder.name || '')} ・ ${study.correct}/${study.total}正解 ・ 正答率${Math.round(accuracy * 100)}%</div></div></div>`;
  }).join('');
  return `<div id="iftyWeakFolder" style="background:#fff1f2;border:2px solid #fb7185;border-radius:10px;padding:16px;margin-bottom:12px;"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;"><div><h3 style="margin:0;color:#881337;font-size:1.08em;">🎯 苦手候補 <span style="font-size:.82em;color:#be123c;">${entries.length}語</span></h3><div style="font-size:.76em;color:#9f1239;margin-top:4px;">3回以上学習・2回以上不正解・正答率70%未満を自動抽出</div></div><button type="button" onclick="startIftyWeakFlashcards('front')" style="border:none;background:#be123c;color:white;border-radius:7px;padding:8px 10px;font-weight:900;cursor:pointer;">📇 苦手だけ学習</button></div><div style="margin-top:9px;">${list}${entries.length > 12 ? `<div style="padding-top:8px;color:#9f1239;font-size:.76em;">ほか ${entries.length - 12}語</div>` : ''}</div></div>`;
}

window.startIftyWeakFlashcards = function(direction = 'front') {
  const entries = getIftyWeakEntries();
  if (!entries.length) { alert('現在、苦手候補はありません。'); return; }
  currentFlashcardMode = 'weak';
  isRandomMode = true;
  cardMode = direction === 'back' ? 'back' : 'front';
  flashcardList = shuffleArray(entries.map(({ word }) => ({ ...deepClone(word) })));
  currentFlashcardIndex = 0;
  isCardFlipped = false;
  renderFlashcardModal();
};

window.openIftyLearningStats = function() {
  window.closeIftySideMenu();
  const stats = getIftyLearningStats();
  const daily = getIftyRecentDailyStats(7);
  const weak = getIftyWeakEntries().slice(0, 20);
  showIftyHubContent(`
    <section class="ifty-portal-shell">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;"><div><h1 class="ifty-portal-title">LEARNING STATS</h1><div class="ifty-portal-subtitle">端末・クラウドに保存された単語ごとの学習記録から集計。</div></div><button class="ifty-portal-back" type="button" onclick="openIftyHome()">HOMEへ戻る</button></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:9px;margin-top:16px;">
        <div class="ifty-settings-section"><div class="ifty-settings-note">今日学習</div><div style="font-size:1.6em;font-weight:900;">${stats.studiedToday}語</div></div>
        <div class="ifty-settings-section"><div class="ifty-settings-note">今日の回答</div><div style="font-size:1.6em;font-weight:900;">${stats.answersToday}回</div></div>
        <div class="ifty-settings-section"><div class="ifty-settings-note">今日の正答率</div><div style="font-size:1.6em;font-weight:900;">${stats.answersToday ? stats.accuracyToday + '%' : '—'}</div></div>
        <div class="ifty-settings-section"><div class="ifty-settings-note">今日の目標</div><div style="font-size:1.6em;font-weight:900;color:#0f766e;">${stats.studiedToday}/${stats.dailyGoal}語</div><div class="ifty-settings-note">${stats.goalPercent >= 100 ? '達成 ✓' : stats.goalPercent + '%'}</div></div>
        <div class="ifty-settings-section"><div class="ifty-settings-note">連続学習</div><div style="font-size:1.6em;font-weight:900;color:#b45309;">${stats.studyStreak}日</div></div>
        <div class="ifty-settings-section"><div class="ifty-settings-note">自己ベスト</div><div style="font-size:1.6em;font-weight:900;color:#7c3aed;">${stats.bestStreak}日</div></div>
        <div class="ifty-settings-section"><div class="ifty-settings-note">今日の復習</div><div style="font-size:1.6em;font-weight:900;color:#c2410c;">${stats.dueReview}語</div></div>
        <div class="ifty-settings-section"><div class="ifty-settings-note">復習卒業</div><div style="font-size:1.6em;font-weight:900;color:#047857;">${stats.reviewGraduated}語</div></div>
        <div class="ifty-settings-section"><div class="ifty-settings-note">苦手候補</div><div style="font-size:1.6em;font-weight:900;color:#be123c;">${stats.weakWords}語</div></div>
      </div>
      <div class="ifty-settings-section"><h3>直近7日</h3><div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.86em;"><thead><tr><th style="text-align:left;padding:7px;border-bottom:1px solid #cbd5e1;">日付</th><th style="padding:7px;border-bottom:1px solid #cbd5e1;">学習語</th><th style="padding:7px;border-bottom:1px solid #cbd5e1;">回答</th><th style="padding:7px;border-bottom:1px solid #cbd5e1;">正答率</th></tr></thead><tbody>${daily.map(row => `<tr><td style="padding:7px;border-bottom:1px solid #e2e8f0;">${escapeHtml(row.key.slice(5).replace('-', '/'))}</td><td style="text-align:center;padding:7px;border-bottom:1px solid #e2e8f0;">${row.studiedWords}</td><td style="text-align:center;padding:7px;border-bottom:1px solid #e2e8f0;">${row.attempts}</td><td style="text-align:center;padding:7px;border-bottom:1px solid #e2e8f0;">${row.attempts ? row.accuracy + '%' : '—'}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="ifty-settings-section"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;"><div><h3 style="margin-bottom:4px;">苦手候補</h3><div class="ifty-settings-note">回答履歴から自動判定。</div></div>${weak.length ? '<button class="ifty-settings-action" type="button" onclick="switchToVocabView(); setTimeout(()=>startIftyWeakFlashcards(\'front\'),0);" style="background:#be123c;color:white;">苦手だけ学習</button>' : ''}</div><div style="margin-top:10px;display:grid;gap:6px;">${weak.length ? weak.map(({ folder, word, study, accuracy }) => `<div style="padding:9px;border:1px solid #fecdd3;border-radius:8px;background:#fff1f2;"><b>${escapeHtml(word.word || '')}</b><span style="margin-left:8px;color:#be123c;font-size:.8em;">${Math.round(accuracy*100)}% (${study.correct}/${study.total})</span><div style="font-size:.72em;color:#9f1239;margin-top:2px;">${escapeHtml(folder.name || '')}</div></div>`).join('') : '<div class="ifty-settings-note">現在、苦手候補はありません。</div>'}</div></div>
    </section>`, 'stats');
};


// ==========================================
// Q3 STEP23：例文資産 / AIなし例文学習
// ==========================================
function normalizeIftyExamplePair(example) {
  if (typeof example === 'string') {
    const en = String(example || '').trim();
    return en ? { en, ja: '' } : null;
  }
  if (!example || typeof example !== 'object') return null;
  const en = String(example.en || example.english || '').trim();
  const ja = String(example.ja || example.jp || example.japanese || '').trim();
  if (!en && !ja) return null;
  return { en, ja };
}

function getIftyExampleEntries(query = '') {
  const normalizedQuery = normalizeIftyVocabSearchText(query);
  const rows = [];

  folders.forEach(folder => {
    (folder.words || []).forEach((word, wordIndex) => {
      const examples = Array.isArray(word.examples) ? word.examples : [];
      examples.forEach((example, exampleIndex) => {
        const pair = normalizeIftyExamplePair(example);
        if (!pair || !pair.en) return;
        const key = `${String(word.id || '')}::${exampleIndex}`;
        const haystack = normalizeIftyVocabSearchText([
          word.word || '',
          pair.en,
          pair.ja,
          folder.name || ''
        ].join(' '));
        if (normalizedQuery && !haystack.includes(normalizedQuery)) return;
        const languageInfo = getIftyWordLanguageInfo(word);
        rows.push({
          key,
          folder,
          word,
          wordIndex,
          exampleIndex,
          en: pair.en,
          ja: pair.ja,
          language: languageInfo.label,
          languageCode: languageInfo.code
        });
      });
    });
  });

  return rows;
}

function countIftyExampleAssets() {
  let count = 0;
  folders.forEach(folder => {
    (folder.words || []).forEach(word => {
      const examples = Array.isArray(word.examples) ? word.examples : [];
      examples.forEach(example => {
        const pair = normalizeIftyExamplePair(example);
        if (pair && pair.en) count += 1;
      });
    });
  });
  return count;
}

function findIftyExampleEntryByKey(key) {
  const target = String(key || '');
  if (!target) return null;
  return getIftyExampleEntries('').find(entry => entry.key === target) || null;
}

function renderIftyExampleBankList() {
  const list = document.getElementById('iftyExampleBankList');
  const count = document.getElementById('iftyExampleBankCount');
  if (!list) return;

  const entries = getIftyExampleEntries(iftyExampleSearchQuery);
  const total = countIftyExampleAssets();
  if (count) count.textContent = normalizeIftyVocabSearchText(iftyExampleSearchQuery)
    ? `${entries.length} / ${total}件`
    : `${total}件`;

  if (!entries.length) {
    list.innerHTML = `<div class="ifty-settings-note" style="padding:16px 4px;">${total ? '検索条件に一致する例文はありません。' : 'まだ例文がありません。単語編集またはALLIA生成で保存した例文がここに集まります。'}</div>`;
    return;
  }

  const visible = entries.slice(0, 200);
  list.innerHTML = visible.map(entry => `
    <div style="border:1px solid #dbeafe;border-radius:10px;padding:12px;background:white;">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
        <div style="min-width:0;">
          <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;"><div style="font-weight:900;color:#1e3a8a;">${escapeHtml(entry.word.word || '')}</div><span style="font-size:.7em;font-weight:900;color:#075985;background:#e0f2fe;border-radius:999px;padding:2px 7px;">${escapeHtml(entry.language || '言語未設定')}</span></div>
          <div style="margin-top:6px;font-size:.97em;line-height:1.55;color:#0f172a;">${escapeHtml(entry.en)}</div>
          ${entry.ja ? `<div style="margin-top:4px;font-size:.84em;line-height:1.5;color:#475569;">${escapeHtml(entry.ja)}</div>` : ''}
          <div style="margin-top:5px;font-size:.72em;color:#64748b;">📁 ${escapeHtml(entry.folder.name || '')}</div>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;">
          <button type="button" onclick="speakIftyExampleByKey('${escapeHtml(entry.key)}')" title="例文を読む" style="border:none;background:#0284c7;color:white;border-radius:7px;padding:7px 9px;cursor:pointer;">🔊</button>
          <button type="button" onclick="addIftyExampleToBasicSentences('${escapeHtml(entry.key)}')" title="BASIC SENTENCESへ追加" style="border:none;background:${isIftyBasicSentenceDuplicate(entry.en, entry.ja) ? '#94a3b8' : '#059669'};color:white;border-radius:7px;padding:7px 9px;cursor:pointer;">${isIftyBasicSentenceDuplicate(entry.en, entry.ja) ? '✓ BASIC' : '＋ BASIC'}</button>
          <button type="button" onclick="openEditWordModal('${escapeHtml(String(entry.folder.id || ''))}', ${entry.wordIndex})" title="単語を編集" style="border:none;background:#64748b;color:white;border-radius:7px;padding:7px 9px;cursor:pointer;">✏️</button>
        </div>
      </div>
    </div>
  `).join('') + (entries.length > visible.length
    ? `<div class="ifty-settings-note" style="padding:10px 2px;">表示は先頭200件まで。検索で絞り込めます。</div>`
    : '');
}

window.openIftyExampleBank = function() {
  window.closeIftySideMenu();
  const total = countIftyExampleAssets();
  showIftyHubContent(`
    <section class="ifty-portal-shell">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <h1 class="ifty-portal-title">EXAMPLE BANK</h1>
          <div class="ifty-portal-subtitle">保存済みの例文を一覧・検索し、必要なものをBASIC SENTENCESへ取り込めます。</div>
        </div>
        <button class="ifty-portal-back" type="button" onclick="openIftyHome()">HOMEへ戻る</button>
      </div>

      <div class="ifty-settings-section">
        <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;">
          <input id="iftyExampleSearchInput" value="${escapeHtml(iftyExampleSearchQuery)}" oninput="setIftyExampleSearch(this.value)" placeholder="語彙・例文・日本語訳・フォルダ名で検索" style="flex:1;min-width:210px;padding:10px;border:1px solid #94a3b8;border-radius:8px;font-size:.94em;">
          <button class="ifty-settings-action" type="button" onclick="clearIftyExampleSearch()" style="background:#64748b;color:white;">クリア</button>
          <span id="iftyExampleBankCount" class="ifty-settings-note">${total}件</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:11px;">
          <button class="ifty-settings-action" type="button" onclick="addVisibleIftyExamplesToBasicSentences()" style="background:#059669;color:white;">＋ 表示中をBASICへ追加</button>
        </div>
        <div class="ifty-settings-note" style="margin-top:8px;">検索中は、検索条件に一致する例文をまとめてBASIC SENTENCESへ追加できます。</div>
      </div>

      <div id="iftyExampleBankList" style="display:grid;gap:8px;margin-top:12px;"></div>
    </section>
  `, 'examples');
  renderIftyExampleBankList();
};

window.setIftyExampleSearch = function(value) {
  iftyExampleSearchQuery = String(value || '');
  renderIftyExampleBankList();
};

window.clearIftyExampleSearch = function() {
  iftyExampleSearchQuery = '';
  const input = document.getElementById('iftyExampleSearchInput');
  if (input) input.value = '';
  renderIftyExampleBankList();
};

window.speakIftyExampleByKey = function(key) {
  const entry = findIftyExampleEntryByKey(key);
  if (!entry || !entry.en) return;
  window.speakWord(entry.en, entry.languageCode || '');
};


// ==========================================
// Q3 STEP25 / STEP41：BASIC SENTENCES
// ALLIAを呼ばず、自作英文とEXAMPLE BANK由来の英文をフォルダ単位で保存・整理する。
// practiceData.modules.basicSentences に保存するため、既存クラウド同期・バックアップ対象に自動で含まれる。
// ==========================================
function normalizeIftyBasicSentenceStudy(study) {
  const source = study && typeof study === 'object' ? study : {};
  const daily = source.daily && typeof source.daily === 'object' ? source.daily : {};
  const normalizedDaily = {};
  Object.entries(daily).forEach(([key, row]) => {
    if (!row || typeof row !== 'object') return;
    const attempts = Math.max(0, Math.trunc(Number(row.attempts) || 0));
    const correct = Math.max(0, Math.trunc(Number(row.correct) || 0));
    const wrong = Math.max(0, Math.trunc(Number(row.wrong) || 0));
    if (attempts > 0 || correct > 0 || wrong > 0) normalizedDaily[String(key)] = { attempts, correct, wrong };
  });
  return {
    total: Math.max(0, Math.trunc(Number(source.total) || 0)),
    correct: Math.max(0, Math.trunc(Number(source.correct) || 0)),
    wrong: Math.max(0, Math.trunc(Number(source.wrong) || 0)),
    firstStudiedAt: Math.max(0, Number(source.firstStudiedAt) || 0),
    lastStudiedAt: Math.max(0, Number(source.lastStudiedAt) || 0),
    daily: normalizedDaily
  };
}

function normalizeIftyBasicSentenceItem(item) {
  if (!item || typeof item !== 'object') return null;
  const en = String(item.en || item.english || '').trim();
  const ja = String(item.ja || item.jp || item.japanese || '').trim();
  const note = String(item.note || '').trim();
  if (!en && !ja && !note) return null;
  const createdAt = Math.max(0, Number(item.createdAt) || Date.now());
  const updatedAt = Math.max(createdAt, Number(item.updatedAt) || createdAt);
  return {
    ...item,
    id: String(item.id || makeId('basic_sentence')),
    folderId: String(item.folderId || ''),
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : null,
    en,
    ja,
    note,
    source: item.source && typeof item.source === 'object' ? { ...item.source } : { type: 'manual' },
    createdAt,
    updatedAt,
    study: normalizeIftyBasicSentenceStudy(item.study)
  };
}

function getIftyBasicSentenceFolders() {
  const module = practiceData && practiceData.modules && practiceData.modules.basicSentences;
  return module && Array.isArray(module.folders) ? module.folders : [];
}

function getIftySortedBasicSentenceFolders() {
  return getIftyBasicSentenceFolders().slice().sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function getIftyBasicSentenceFolderById(folderId) {
  return getIftyBasicSentenceFolders().find(folder => String(folder.id) === String(folderId)) || null;
}

function getIftyBasicSentenceDefaultFolderId() {
  const folder = getIftySortedBasicSentenceFolders()[0];
  return folder ? String(folder.id) : '';
}

function getIftyBasicSentenceItems() {
  const module = practiceData && practiceData.modules && practiceData.modules.basicSentences;
  return module && Array.isArray(module.items) ? module.items : [];
}

function getIftyBasicSentenceItemsForFolder(folderId) {
  return getIftyBasicSentenceItems()
    .filter(item => String(item.folderId || '') === String(folderId || ''))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function getIftyNextBasicSentenceOrder(folderId) {
  const rows = getIftyBasicSentenceItemsForFolder(folderId);
  return rows.length ? Math.max(...rows.map(row => Number(row.order || 0))) + 1 : 0;
}

function countIftyBasicSentences() {
  return getIftyBasicSentenceItems().length;
}

function findIftyBasicSentenceById(id) {
  return getIftyBasicSentenceItems().find(item => String(item.id) === String(id)) || null;
}

function normalizeIftyBasicSentenceText(value) {
  return String(value || '').normalize('NFKC').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?。！？]+$/g, '').trim();
}

function isIftyBasicSentenceDuplicate(en, ja = '') {
  const targetEn = normalizeIftyBasicSentenceText(en);
  const targetJa = normalizeIftyVocabSearchText(ja);
  if (!targetEn) return false;
  return getIftyBasicSentenceItems().some(item => {
    const sameEn = normalizeIftyBasicSentenceText(item.en) === targetEn;
    if (!sameEn) return false;
    if (!targetJa) return true;
    return normalizeIftyVocabSearchText(item.ja) === targetJa;
  });
}

function getIftyFilteredBasicSentences() {
  const query = normalizeIftyVocabSearchText(iftyBasicSentenceSearchQuery);
  const items = getIftyBasicSentenceItems();
  if (!query) return items.slice();
  return items.filter(item => normalizeIftyVocabSearchText([item.en || '', item.ja || '', item.note || ''].join(' ')).includes(query));
}

function getIftyBasicSentenceStats() {
  return { total: countIftyBasicSentences() };
}

function recordIftyBasicSentenceStudy(sentenceId, correct) {
  const item = findIftyBasicSentenceById(sentenceId);
  if (!item) return false;
  const now = Date.now();
  const dayKey = getIftyLocalDateKey(now);
  const study = normalizeIftyBasicSentenceStudy(item.study);
  if (!study.firstStudiedAt) study.firstStudiedAt = now;
  study.lastStudiedAt = now;
  study.total += 1;
  if (correct) study.correct += 1; else study.wrong += 1;
  if (!study.daily[dayKey]) study.daily[dayKey] = { attempts: 0, correct: 0, wrong: 0 };
  study.daily[dayKey].attempts += 1;
  if (correct) study.daily[dayKey].correct += 1; else study.daily[dayKey].wrong += 1;
  item.study = study;
  item.updatedAt = Math.max(Number(item.updatedAt) || 0, now);
  savePracticeData();
  return true;
}

function ensureIftyBasicSentenceModal() {
  let modal = document.getElementById('iftyBasicSentenceModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'iftyBasicSentenceModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.72);display:none;align-items:center;justify-content:center;padding:14px;box-sizing:border-box;z-index:10080;';
    modal.addEventListener('click', event => { if (event.target === modal) window.closeIftyBasicSentenceEditor(); });
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
  return modal;
}

window.closeIftyBasicSentenceEditor = function() {
  const modal = document.getElementById('iftyBasicSentenceModal');
  if (!modal) return;
  const shouldRefresh = modal.dataset.savedDuringSession === '1';
  modal.style.display = 'none';
  modal.dataset.savedDuringSession = '0';
  if (shouldRefresh) window.openIftyBasicSentences();
};

window.openIftyBasicSentenceEditor = function(sentenceId = '', preferredFolderId = '') {
  normalizePracticeData();
  const item = sentenceId ? findIftyBasicSentenceById(sentenceId) : null;
  let folderId = String(item?.folderId || preferredFolderId || iftyBasicSentenceActiveFolderId || getIftyBasicSentenceDefaultFolderId());
  if (!getIftyBasicSentenceFolderById(folderId)) folderId = getIftyBasicSentenceDefaultFolderId();
  iftyBasicSentenceActiveFolderId = folderId;
  const modal = ensureIftyBasicSentenceModal();
  modal.dataset.sentenceId = item ? String(item.id) : '';
  modal.dataset.savedDuringSession = '0';
  const folderOptions = getIftySortedBasicSentenceFolders().map(folder => `<option value="${escapeHtml(folder.id)}" ${String(folder.id) === folderId ? 'selected' : ''}>${escapeHtml(folder.name)}</option>`).join('');
  modal.innerHTML = `
    <div style="width:min(94vw,700px);max-height:92vh;overflow:auto;background:white;border-radius:14px;padding:20px;box-sizing:border-box;box-shadow:0 18px 50px rgba(0,0,0,.35);position:relative;">
      <button type="button" onclick="closeIftyBasicSentenceEditor()" aria-label="閉じる" style="position:absolute;right:10px;top:10px;width:38px;height:38px;border:none;border-radius:999px;background:#e2e8f0;color:#334155;font-size:1.35em;cursor:pointer;">×</button>
      <h2 style="margin:0;padding-right:46px;color:#065f46;">${item ? 'BASIC SENTENCEを編集' : 'BASIC SENTENCEを追加'}</h2>
      <div style="margin-top:15px;display:grid;gap:11px;">
        <label style="display:grid;gap:5px;font-weight:800;color:#334155;">保存先フォルダ
          <select id="iftyBasicSentenceFolder" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #94a3b8;border-radius:8px;font:inherit;background:white;">${folderOptions}</select>
        </label>
        <label style="display:grid;gap:5px;font-weight:800;color:#334155;">英文<textarea id="iftyBasicSentenceEn" rows="3" placeholder="English sentence" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #94a3b8;border-radius:8px;font:inherit;resize:vertical;">${escapeHtml(item ? item.en : '')}</textarea></label>
        <label style="display:grid;gap:5px;font-weight:800;color:#334155;">和訳<textarea id="iftyBasicSentenceJa" rows="3" placeholder="日本語訳" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #94a3b8;border-radius:8px;font:inherit;resize:vertical;">${escapeHtml(item ? item.ja : '')}</textarea></label>
        <label style="display:grid;gap:5px;font-weight:800;color:#334155;">メモ<textarea id="iftyBasicSentenceNote" rows="2" placeholder="文法・語法・覚え方など（任意）" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #94a3b8;border-radius:8px;font:inherit;resize:vertical;">${escapeHtml(item ? item.note : '')}</textarea></label>
      </div>
      <div id="iftyBasicSentenceSaveStatus" style="min-height:1.2em;margin-top:10px;color:#047857;font-size:.8em;font-weight:800;"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;position:sticky;bottom:-20px;background:white;padding:14px 0 2px;margin-top:4px;border-top:1px solid #e2e8f0;">
        <button type="button" onclick="closeIftyBasicSentenceEditor()" style="border:none;background:#e2e8f0;color:#334155;border-radius:8px;padding:10px 13px;font-weight:900;cursor:pointer;">${item ? 'キャンセル' : '終了'}</button>
        <button type="button" onclick="saveIftyBasicSentenceEditor()" style="border:none;background:#059669;color:white;border-radius:8px;padding:10px 15px;font-weight:900;cursor:pointer;">${item ? '保存' : '保存して次へ'}</button>
      </div>
      <div style="margin-top:7px;color:#64748b;font-size:.76em;">${item ? 'Ctrl/Cmd + Enterでも保存できます。' : 'Ctrl/Cmd + Enterで保存すると、そのまま次の英文を続けて入力できます。'} ALLIAは使用しません。</div>
    </div>`;
  modal.onkeydown = event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      window.saveIftyBasicSentenceEditor();
    }
  };
  setTimeout(() => document.getElementById('iftyBasicSentenceEn')?.focus(), 0);
};

window.saveIftyBasicSentenceEditor = function() {
  const modal = document.getElementById('iftyBasicSentenceModal');
  if (!modal) return;
  const sentenceId = String(modal.dataset.sentenceId || '');
  const en = String(document.getElementById('iftyBasicSentenceEn')?.value || '').trim();
  const ja = String(document.getElementById('iftyBasicSentenceJa')?.value || '').trim();
  const note = String(document.getElementById('iftyBasicSentenceNote')?.value || '').trim();
  let folderId = String(document.getElementById('iftyBasicSentenceFolder')?.value || getIftyBasicSentenceDefaultFolderId());
  if (!getIftyBasicSentenceFolderById(folderId)) folderId = getIftyBasicSentenceDefaultFolderId();
  if (!en) {
    alert('英文を入力してください。');
    document.getElementById('iftyBasicSentenceEn')?.focus();
    return;
  }

  const current = sentenceId ? findIftyBasicSentenceById(sentenceId) : null;
  if (!current && isIftyBasicSentenceDuplicate(en, ja)) {
    if (!confirm('同じ英文がBASIC SENTENCESにあります。それでも追加しますか？')) return;
  }

  recordUndoState(current ? 'BASIC SENTENCE編集' : 'BASIC SENTENCE追加');
  const now = Date.now();
  if (current) {
    const moved = String(current.folderId || '') !== folderId;
    current.en = en;
    current.ja = ja;
    current.note = note;
    current.folderId = folderId;
    if (moved) current.order = getIftyNextBasicSentenceOrder(folderId);
    current.updatedAt = now;
  } else {
    getIftyBasicSentenceItems().push(normalizeIftyBasicSentenceItem({
      id: makeId('basic_sentence'), folderId, order: getIftyNextBasicSentenceOrder(folderId), en, ja, note,
      source: { type: 'manual' }, createdAt: now, updatedAt: now, study: {}
    }));
  }
  iftyBasicSentenceActiveFolderId = folderId;
  savePracticeData();
  modal.dataset.savedDuringSession = '1';

  if (current) {
    window.closeIftyBasicSentenceEditor();
    return;
  }

  const enInput = document.getElementById('iftyBasicSentenceEn');
  const jaInput = document.getElementById('iftyBasicSentenceJa');
  const noteInput = document.getElementById('iftyBasicSentenceNote');
  if (enInput) enInput.value = '';
  if (jaInput) jaInput.value = '';
  if (noteInput) noteInput.value = '';
  const status = document.getElementById('iftyBasicSentenceSaveStatus');
  if (status) status.textContent = '保存しました。続けて次の英文を入力できます。';
  setTimeout(() => enInput?.focus(), 0);
};

window.deleteIftyBasicSentence = function(sentenceId) {
  const item = findIftyBasicSentenceById(sentenceId);
  if (!item) return;
  if (!confirm(`「${item.en}」をBASIC SENTENCESから削除しますか？`)) return;
  const items = getIftyBasicSentenceItems();
  const index = items.findIndex(row => String(row.id) === String(sentenceId));
  if (index < 0) return;
  recordUndoState('BASIC SENTENCE削除');
  items.splice(index, 1);
  savePracticeData();
  renderIftyBasicSentenceList();
};

window.speakIftyBasicSentence = function(sentenceId) {
  const item = findIftyBasicSentenceById(sentenceId);
  if (!item || !item.en) return;
  window.speakWord(item.en);
};

window.setIftyBasicSentenceSearch = function(value) {
  iftyBasicSentenceSearchQuery = String(value || '');
  renderIftyBasicSentenceList();
};

window.clearIftyBasicSentenceSearch = function() {
  iftyBasicSentenceSearchQuery = '';
  const input = document.getElementById('iftyBasicSentenceSearchInput');
  if (input) input.value = '';
  renderIftyBasicSentenceList();
};

window.createIftyBasicSentenceFolder = function() {
  const name = prompt('BASIC SENTENCESの新しいフォルダ名', '新しいフォルダ');
  if (name === null || !String(name).trim()) return;
  recordUndoState('BASIC SENTENCEフォルダ作成');
  const folders = getIftyBasicSentenceFolders();
  const folder = normalizeIftyCollectionFolder({ id: makeId('basicsentencefolder'), name: String(name).trim(), order: folders.length, collapsed: false }, 'basicsentencefolder', '未分類', folders.length);
  folders.push(folder);
  iftyBasicSentenceActiveFolderId = folder.id;
  savePracticeData();
  renderIftyBasicSentenceList();
};

window.renameIftyBasicSentenceFolder = function(folderId) {
  const folder = getIftyBasicSentenceFolderById(folderId);
  if (!folder) return;
  const next = prompt('フォルダ名を変更', folder.name);
  if (next === null || !String(next).trim()) return;
  recordUndoState('BASIC SENTENCEフォルダ名変更');
  folder.name = String(next).trim();
  savePracticeData();
  renderIftyBasicSentenceList();
};

window.toggleIftyBasicSentenceFolder = function(folderId) {
  const folder = getIftyBasicSentenceFolderById(folderId);
  if (!folder) return;
  folder.collapsed = !folder.collapsed;
  savePracticeData();
  renderIftyBasicSentenceList();
};

window.moveIftyBasicSentenceFolder = function(folderId, direction) {
  const folders = getIftySortedBasicSentenceFolders();
  const index = folders.findIndex(folder => String(folder.id) === String(folderId));
  const nextIndex = index + Number(direction || 0);
  if (index < 0 || nextIndex < 0 || nextIndex >= folders.length) return;
  recordUndoState('BASIC SENTENCEフォルダ並べ替え');
  [folders[index], folders[nextIndex]] = [folders[nextIndex], folders[index]];
  folders.forEach((folder, idx) => { folder.order = idx; });
  savePracticeData();
  renderIftyBasicSentenceList();
};

window.deleteIftyBasicSentenceFolder = function(folderId) {
  const folders = getIftySortedBasicSentenceFolders();
  const folder = folders.find(row => String(row.id) === String(folderId));
  if (!folder) return;
  if (folders.length <= 1) {
    alert('BASIC SENTENCESには最低1つのフォルダが必要です。');
    return;
  }
  const items = getIftyBasicSentenceItemsForFolder(folderId);
  const target = folders.find(row => String(row.id) !== String(folderId));
  const message = items.length ? `「${folder.name}」を削除しますか？ 中の${items.length}件は「${target.name}」へ移動します。` : `「${folder.name}」を削除しますか？`;
  if (!confirm(message)) return;
  recordUndoState('BASIC SENTENCEフォルダ削除');
  let baseOrder = getIftyNextBasicSentenceOrder(target.id);
  items.forEach((item, index) => { item.folderId = target.id; item.order = baseOrder + index; });
  const raw = getIftyBasicSentenceFolders();
  const rawIndex = raw.findIndex(row => String(row.id) === String(folderId));
  if (rawIndex >= 0) raw.splice(rawIndex, 1);
  iftyBasicSentenceActiveFolderId = target.id;
  savePracticeData();
  renderIftyBasicSentenceList();
};

window.moveIftyBasicSentence = function(sentenceId, direction) {
  const item = findIftyBasicSentenceById(sentenceId);
  if (!item) return;
  const rows = getIftyBasicSentenceItemsForFolder(item.folderId);
  const index = rows.findIndex(row => String(row.id) === String(sentenceId));
  const nextIndex = index + Number(direction || 0);
  if (index < 0 || nextIndex < 0 || nextIndex >= rows.length) return;
  recordUndoState('BASIC SENTENCE並べ替え');
  [rows[index], rows[nextIndex]] = [rows[nextIndex], rows[index]];
  rows.forEach((row, idx) => { row.order = idx; });
  savePracticeData();
  renderIftyBasicSentenceList();
};

function renderIftyBasicSentenceCard(item, index, total) {
  const study = normalizeIftyBasicSentenceStudy(item.study);
  const accuracy = study.total ? Math.round(study.correct / study.total * 100) : null;
  const sourceLabel = item.source && item.source.type === 'example_bank' ? 'EXAMPLE BANK' : 'MANUAL';
  return `<div style="border:1px solid #d1fae5;border-radius:10px;padding:12px;background:white;">
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
      <div style="min-width:0;flex:1;">
        <div style="font-size:1em;font-weight:900;line-height:1.6;color:#064e3b;">${escapeHtml(item.en)}</div>
        ${item.ja ? `<div style="margin-top:5px;color:#475569;line-height:1.55;">${escapeHtml(item.ja)}</div>` : '<div style="margin-top:5px;color:#94a3b8;font-size:.82em;">和訳なし</div>'}
        ${item.note ? `<div style="margin-top:7px;padding:7px 9px;border-radius:7px;background:#f8fafc;color:#475569;font-size:.82em;line-height:1.5;">${escapeHtml(item.note)}</div>` : ''}
        <div style="margin-top:7px;font-size:.72em;color:#64748b;">${sourceLabel}${study.total ? ` ・ 学習 ${study.total}回 / 正答率 ${accuracy}%` : ''}</div>
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;">
        <button type="button" ${index <= 0 ? 'disabled' : ''} onclick="moveIftyBasicSentence('${escapeHtml(String(item.id))}',-1)" title="上へ" style="border:none;background:#e2e8f0;color:#334155;border-radius:7px;padding:7px 9px;cursor:pointer;">↑</button>
        <button type="button" ${index >= total - 1 ? 'disabled' : ''} onclick="moveIftyBasicSentence('${escapeHtml(String(item.id))}',1)" title="下へ" style="border:none;background:#e2e8f0;color:#334155;border-radius:7px;padding:7px 9px;cursor:pointer;">↓</button>
        <button type="button" onclick="speakIftyBasicSentence('${escapeHtml(String(item.id))}')" title="英文を読む" style="border:none;background:#0284c7;color:white;border-radius:7px;padding:7px 9px;cursor:pointer;">🔊</button>
        <button type="button" onclick="openIftyBasicSentenceEditor('${escapeHtml(String(item.id))}')" title="編集" style="border:none;background:#64748b;color:white;border-radius:7px;padding:7px 9px;cursor:pointer;">✏️</button>
        <button type="button" onclick="deleteIftyBasicSentence('${escapeHtml(String(item.id))}')" title="削除" style="border:none;background:#dc2626;color:white;border-radius:7px;padding:7px 9px;cursor:pointer;">削除</button>
      </div>
    </div>
  </div>`;
}

function renderIftyBasicSentenceList() {
  const list = document.getElementById('iftyBasicSentenceList');
  const count = document.getElementById('iftyBasicSentenceCount');
  if (!list) return;
  const filteredIds = new Set(getIftyFilteredBasicSentences().map(item => String(item.id)));
  const queryActive = !!normalizeIftyVocabSearchText(iftyBasicSentenceSearchQuery);
  const total = countIftyBasicSentences();
  const visibleCount = queryActive ? filteredIds.size : total;
  if (count) count.textContent = queryActive ? `${visibleCount} / ${total}件` : `${total}件`;

  const folders = getIftySortedBasicSentenceFolders();
  list.innerHTML = folders.map((folder, folderIndex) => {
    const allRows = getIftyBasicSentenceItemsForFolder(folder.id);
    const rows = queryActive ? allRows.filter(item => filteredIds.has(String(item.id))) : allRows;
    if (queryActive && !rows.length) return '';
    return `<section style="border:1px solid #bbf7d0;border-radius:13px;background:#f7fff9;padding:11px;">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
        <button type="button" onclick="toggleIftyBasicSentenceFolder('${escapeHtml(folder.id)}')" style="border:none;background:transparent;padding:0;cursor:pointer;text-align:left;font-weight:900;color:#065f46;font-size:1rem;">${folder.collapsed ? '▶' : '▼'} 📁 ${escapeHtml(folder.name)} (${allRows.length}件)</button>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          <button type="button" ${folderIndex <= 0 ? 'disabled' : ''} onclick="moveIftyBasicSentenceFolder('${escapeHtml(folder.id)}',-1)" style="border:none;background:#e2e8f0;color:#334155;border-radius:7px;padding:6px 9px;font-weight:800;">↑</button>
          <button type="button" ${folderIndex >= folders.length - 1 ? 'disabled' : ''} onclick="moveIftyBasicSentenceFolder('${escapeHtml(folder.id)}',1)" style="border:none;background:#e2e8f0;color:#334155;border-radius:7px;padding:6px 9px;font-weight:800;">↓</button>
          <button type="button" onclick="openIftyBasicSentenceEditor('', '${escapeHtml(folder.id)}')" style="border:none;background:#059669;color:white;border-radius:7px;padding:6px 9px;font-weight:800;">＋追加</button>
          <button type="button" onclick="renameIftyBasicSentenceFolder('${escapeHtml(folder.id)}')" style="border:none;background:#f59e0b;color:#111827;border-radius:7px;padding:6px 9px;font-weight:800;">名前変更</button>
          <button type="button" onclick="deleteIftyBasicSentenceFolder('${escapeHtml(folder.id)}')" style="border:none;background:#ef4444;color:white;border-radius:7px;padding:6px 9px;font-weight:800;">削除</button>
        </div>
      </div>
      ${folder.collapsed && !queryActive ? '' : `<div style="display:grid;gap:8px;margin-top:10px;">${rows.length ? rows.map((item, index) => renderIftyBasicSentenceCard(item, index, rows.length)).join('') : '<div class="ifty-settings-note">このフォルダにはまだ英文がありません。</div>'}</div>`}
    </section>`;
  }).join('') || `<div class="ifty-settings-note" style="padding:16px 4px;">${total ? '検索条件に一致する英文はありません。' : 'まだ英文がありません。'}</div>`;
}

window.openIftyBasicSentences = function() {
  window.closeIftySideMenu();
  normalizePracticeData();
  if (!getIftyBasicSentenceFolderById(iftyBasicSentenceActiveFolderId)) iftyBasicSentenceActiveFolderId = getIftyBasicSentenceDefaultFolderId();
  const stats = getIftyBasicSentenceStats();
  showIftyHubContent(`
    <section class="ifty-portal-shell">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div><h1 class="ifty-portal-title">BASIC SENTENCES</h1><div class="ifty-portal-subtitle">英文をフォルダで整理できます。フォルダと英文は↑↓で並べ替えられます。</div></div>
        <button class="ifty-portal-back" type="button" onclick="openIftyHome()">HOMEへ戻る</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:8px;margin-top:15px;"><div class="ifty-settings-section"><div class="ifty-settings-note">登録英文</div><div style="font-size:1.45em;font-weight:900;color:#047857;">${stats.total}</div></div></div>
      <div class="ifty-settings-section">
        <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;">
          <input id="iftyBasicSentenceSearchInput" value="${escapeHtml(iftyBasicSentenceSearchQuery)}" oninput="setIftyBasicSentenceSearch(this.value)" placeholder="英文・和訳・メモで検索" style="flex:1;min-width:210px;padding:10px;border:1px solid #94a3b8;border-radius:8px;font-size:.94em;">
          <button class="ifty-settings-action" type="button" onclick="clearIftyBasicSentenceSearch()" style="background:#64748b;color:white;">クリア</button>
          <span id="iftyBasicSentenceCount" class="ifty-settings-note">${stats.total}件</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:11px;">
          <button class="ifty-settings-action" type="button" onclick="openIftyBasicSentenceEditor('', iftyBasicSentenceActiveFolderId)" style="background:#059669;color:white;">＋ 白紙から追加</button>
          <button class="ifty-settings-action" type="button" onclick="createIftyBasicSentenceFolder()" style="background:#047857;color:white;">＋ フォルダ</button>
          <button class="ifty-settings-action" type="button" onclick="openIftyExampleBank()" style="background:#0f766e;color:white;">📚 EXAMPLE BANK</button>
          <button class="ifty-settings-action" type="button" onclick="openPracticeHome('BASIC SENTENCES')" style="background:#7c3aed;color:white;">⚔️ PRACTICE</button>
        </div>
      </div>
      <div id="iftyBasicSentenceList" style="display:grid;gap:10px;margin-top:12px;"></div>
    </section>
  `, 'basic_sentences');
  renderIftyBasicSentenceList();
};

window.addIftyExampleToBasicSentences = function(key) {
  const entry = findIftyExampleEntryByKey(key);
  if (!entry || !entry.en) return;
  if (isIftyBasicSentenceDuplicate(entry.en, entry.ja)) {
    alert('この例文はすでにBASIC SENTENCESにあります。');
    return;
  }
  normalizePracticeData();
  let folderId = String(iftyBasicSentenceActiveFolderId || getIftyBasicSentenceDefaultFolderId());
  if (!getIftyBasicSentenceFolderById(folderId)) folderId = getIftyBasicSentenceDefaultFolderId();
  recordUndoState('例文をBASIC SENTENCESへ追加');
  const now = Date.now();
  getIftyBasicSentenceItems().push(normalizeIftyBasicSentenceItem({
    id: makeId('basic_sentence'), folderId, order: getIftyNextBasicSentenceOrder(folderId),
    en: entry.en, ja: entry.ja, note: entry.word && entry.word.word ? `元単語: ${entry.word.word}` : '',
    source: { type: 'example_bank', exampleKey: entry.key, wordId: entry.word ? String(entry.word.id || '') : '', folderId: entry.folder ? String(entry.folder.id || '') : '' },
    createdAt: now, updatedAt: now, study: {}
  }));
  savePracticeData();
  renderIftyExampleBankList();
};

window.addVisibleIftyExamplesToBasicSentences = function() {
  const entries = getIftyExampleEntries(iftyExampleSearchQuery);
  if (!entries.length) { alert('追加できる例文がありません。'); return; }
  const addable = entries.filter(entry => entry.en && !isIftyBasicSentenceDuplicate(entry.en, entry.ja));
  if (!addable.length) { alert('表示中の例文はすべて追加済みです。'); return; }
  normalizePracticeData();
  let folderId = String(iftyBasicSentenceActiveFolderId || getIftyBasicSentenceDefaultFolderId());
  if (!getIftyBasicSentenceFolderById(folderId)) folderId = getIftyBasicSentenceDefaultFolderId();
  recordUndoState('表示中の例文をBASIC SENTENCESへ追加');
  const items = getIftyBasicSentenceItems();
  const now = Date.now();
  let order = getIftyNextBasicSentenceOrder(folderId);
  addable.forEach((entry, index) => {
    items.push(normalizeIftyBasicSentenceItem({
      id: makeId('basic_sentence'), folderId, order: order + index,
      en: entry.en, ja: entry.ja, note: entry.word && entry.word.word ? `元単語: ${entry.word.word}` : '',
      source: { type: 'example_bank', exampleKey: entry.key, wordId: entry.word ? String(entry.word.id || '') : '', folderId: entry.folder ? String(entry.folder.id || '') : '' },
      createdAt: now + index, updatedAt: now + index, study: {}
    }));
  });
  savePracticeData();
  renderIftyExampleBankList();
  alert(`${addable.length}件をBASIC SENTENCESへ追加しました。`);
};


// ==========================================
// Q3 STEP42：BASIC SENTENCES PRACTICE
// 記述＝ALLIA採点 / 穴埋め＝端末内採点、Challenge時のみALLIA
// ==========================================
let iftyBasicPracticeState = null;

function getIftyBasicPracticeEligibleItems(folderIds = []) {
  const wanted = new Set((folderIds || []).map(String));
  return getIftyBasicSentenceItems().filter(item => {
    if (wanted.size && !wanted.has(String(item.folderId))) return false;
    return !!String(item.en || '').trim() && !!String(item.ja || '').trim();
  });
}

function normalizeIftyBasicPracticeAnswer(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase()
    .replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ').replace(/[.!?。！？]+$/g, '').trim();
}

function getIftyBasicCloze(item) {
  const sentence = String(item.en || '').trim();
  const tokens = sentence.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || [];
  const candidates = tokens.filter(token => token.replace(/[^A-Za-z]/g, '').length >= 3);
  if (!candidates.length) return null;
  const answer = candidates.reduce((best, token) => token.length > best.length ? token : best, candidates[0]);
  const index = sentence.toLowerCase().indexOf(answer.toLowerCase());
  if (index < 0) return null;
  return { answer, prompt: sentence.slice(0,index) + '□□□□' + sentence.slice(index + answer.length) };
}

function renderIftyBasicPracticeTabs(active = 'BASIC SENTENCES') {
  const btn = (name, label) => `<button type="button" onclick="setIftyUnifiedPracticeSubject('${name}')" style="border:${active===name?'none':'1px solid #cbd5e1'};background:${active===name?'#7c3aed':'white'};color:${active===name?'white':'#334155'};border-radius:999px;padding:8px 13px;font-weight:900;cursor:pointer;">${label}</button>`;
  return `<div style="display:flex;gap:7px;margin-bottom:14px;flex-wrap:wrap;">${btn('ENGLISH','VOCABULARY')}${btn('SOCIAL STUDIES','SOCIAL STUDIES')}${btn('SCIENCE','SCIENCE')}${btn('BASIC SENTENCES','BASIC SENTENCES')}</div>`;
}

function renderIftyBasicSentencePracticeHome(modal) {
  normalizePracticeData();
  const folders = getIftySortedBasicSentenceFolders();
  const eligible = getIftyBasicPracticeEligibleItems();
  modal.innerHTML = `<div style="background:white;border-radius:14px;width:min(760px,100%);max-height:92vh;overflow:auto;padding:18px;box-shadow:0 15px 45px rgba(0,0,0,.28);">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;"><div><h2 style="margin:0;color:#0f172a;font-size:1.3em;">⚔️ PRACTICE</h2><div style="color:#64748b;font-size:.85em;margin-top:3px;">BASIC SENTENCESの実践</div></div><button onclick="closePracticeModal()" style="background:none;border:none;font-size:1.4em;color:#64748b;cursor:pointer;">✕</button></div>
    ${renderIftyBasicPracticeTabs()}
    <div style="border:1px solid #ddd6fe;border-radius:11px;padding:14px;background:#faf5ff;">
      <div style="font-weight:900;color:#4c1d95;">出題フォルダ</div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:9px;">${folders.map(f=>`<label style="display:flex;gap:5px;align-items:center;background:white;border:1px solid #ddd6fe;border-radius:999px;padding:7px 10px;"><input class="ifty-basic-practice-folder" type="checkbox" value="${escapeHtml(f.id)}" checked> ${escapeHtml(f.name)} <span style="color:#64748b;">(${getIftyBasicSentenceItemsForFolder(f.id).filter(x=>x.en&&x.ja).length})</span></label>`).join('')}</div>
      <div style="margin-top:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">
        <div style="background:white;border:1px solid #c4b5fd;border-radius:10px;padding:13px;"><div style="font-weight:900;color:#5b21b6;">✍️ 記述</div><div style="color:#64748b;font-size:.82em;margin:5px 0 10px;">日→英 / 英→日。回答内容をALLIAが採点。</div><select id="iftyBasicWrittenDirection" style="width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:7px;background:white;"><option value="mixed">日英・英日 MIX</option><option value="ja_to_en">日 → 英</option><option value="en_to_ja">英 → 日</option></select><button type="button" onclick="startIftyBasicPractice('written')" style="width:100%;margin-top:9px;border:none;background:#7c3aed;color:white;border-radius:7px;padding:10px;font-weight:900;">開始</button></div>
        <div style="background:white;border:1px solid #bfdbfe;border-radius:10px;padding:13px;"><div style="font-weight:900;color:#1d4ed8;">🧩 穴埋め</div><div style="color:#64748b;font-size:.82em;margin:5px 0 10px;">英文の一語を穴埋め。通常採点は端末内、Challenge時だけALLIA。</div><button type="button" onclick="startIftyBasicPractice('cloze')" style="width:100%;margin-top:37px;border:none;background:#2563eb;color:white;border-radius:7px;padding:10px;font-weight:900;">開始</button></div>
      </div>
      <div style="margin-top:10px;color:#64748b;font-size:.8em;">和訳つき英文 ${eligible.length}件が実践対象です。</div>
    </div>
  </div>`;
}

function getSelectedIftyBasicPracticeFolders() {
  return [...document.querySelectorAll('.ifty-basic-practice-folder:checked')].map(el=>String(el.value));
}

window.startIftyBasicPractice = function(mode) {
  const folderIds = getSelectedIftyBasicPracticeFolders();
  if (!folderIds.length) { alert('出題するフォルダを1つ以上選択してください。'); return; }
  let items = shuffleArray(getIftyBasicPracticeEligibleItems(folderIds));
  if (mode === 'cloze') items = items.filter(item => getIftyBasicCloze(item));
  if (!items.length) { alert(mode === 'cloze' ? '穴埋めに使える英文がありません。' : '英文と和訳の両方がある文がありません。'); return; }
  const direction = String(document.getElementById('iftyBasicWrittenDirection')?.value || 'mixed');
  iftyBasicPracticeState = { mode, direction, queue:items.map(x=>String(x.id)), index:0, correct:0, wrong:0, answered:false, last:null };
  renderIftyBasicPracticeQuestion();
};

function renderIftyBasicPracticeQuestion() {
  const modal=document.getElementById('practiceModal'), st=iftyBasicPracticeState;
  if(!modal||!st)return;
  if(st.index>=st.queue.length){
    const total=st.correct+st.wrong;
    modal.innerHTML=`<div style="background:white;border-radius:14px;width:min(620px,100%);padding:24px;text-align:center;"><h2 style="color:#4c1d95;">BASIC SENTENCES 完了</h2><div style="font-size:1.15em;margin:14px 0;">正解 ${st.correct} / ${total}　正答率 ${total?Math.round(st.correct/total*100):0}%</div><button onclick="setIftyUnifiedPracticeSubject('BASIC SENTENCES')" style="border:none;background:#7c3aed;color:white;border-radius:8px;padding:11px 16px;font-weight:900;">PRACTICEへ戻る</button></div>`; return;
  }
  const item=findIftyBasicSentenceById(st.queue[st.index]); if(!item){st.index++;renderIftyBasicPracticeQuestion();return;}
  let direction=st.direction;
  if(st.mode==='written'&&direction==='mixed') direction=Math.random()<.5?'ja_to_en':'en_to_ja';
  st.currentDirection=direction; st.answered=false; st.last=null;
  let prompt='', label='';
  if(st.mode==='cloze'){ const c=getIftyBasicCloze(item); if(!c){st.index++;renderIftyBasicPracticeQuestion();return;} st.cloze=c; prompt=c.prompt; label='空欄に入る英語を入力'; }
  else if(direction==='ja_to_en'){prompt=item.ja;label='英訳を入力';}
  else {prompt=item.en;label='和訳を入力';}
  modal.innerHTML=`<div style="background:white;border-radius:14px;width:min(700px,100%);padding:22px;box-shadow:0 15px 45px rgba(0,0,0,.28);"><div style="display:flex;justify-content:space-between;gap:10px;"><div style="font-weight:900;color:${st.mode==='cloze'?'#1d4ed8':'#5b21b6'};">${st.mode==='cloze'?'🧩 穴埋め':'✍️ 記述'}　${st.index+1}/${st.queue.length}</div><button onclick="setIftyUnifiedPracticeSubject('BASIC SENTENCES')" style="border:none;background:none;font-size:1.3em;color:#64748b;">✕</button></div><div style="margin-top:18px;padding:16px;border-radius:10px;background:#f8fafc;font-size:1.08em;line-height:1.7;white-space:pre-wrap;">${escapeHtml(prompt)}</div><label style="display:block;margin-top:14px;font-weight:800;color:#334155;">${label}<textarea id="iftyBasicPracticeAnswer" rows="3" style="width:100%;box-sizing:border-box;margin-top:7px;padding:11px;border:1px solid #94a3b8;border-radius:8px;font:inherit;resize:vertical;"></textarea></label><button id="iftyBasicPracticeSubmit" onclick="submitIftyBasicPracticeAnswer()" style="width:100%;margin-top:11px;border:none;background:${st.mode==='cloze'?'#2563eb':'#7c3aed'};color:white;border-radius:8px;padding:11px;font-weight:900;">回答</button><div style="margin-top:8px;color:#64748b;font-size:.78em;">Enterで回答 / Shift+Enterで改行${st.mode==='cloze'?'。通常はALLIAを使用しません。':''}</div></div>`;
  const input=document.getElementById('iftyBasicPracticeAnswer'); if(input){input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();window.submitIftyBasicPracticeAnswer();}};setTimeout(()=>input.focus(),0);}
}

window.submitIftyBasicPracticeAnswer = async function() {
  const st=iftyBasicPracticeState, modal=document.getElementById('practiceModal'); if(!st||!modal||st.answered)return;
  const item=findIftyBasicSentenceById(st.queue[st.index]); if(!item)return;
  const answer=String(document.getElementById('iftyBasicPracticeAnswer')?.value||'').trim(); if(!answer){document.getElementById('iftyBasicPracticeAnswer')?.focus();return;}
  st.answered=true;
  if(st.mode==='cloze'){
    const correct=normalizeIftyBasicPracticeAnswer(answer)===normalizeIftyBasicPracticeAnswer(st.cloze.answer);
    st.last={answer,correct}; if(correct)st.correct++;else st.wrong++; recordIftyBasicSentenceStudy(item.id,correct); savePracticeData(); renderIftyBasicPracticeFeedback(correct, correct?'登録英文の空欄と一致しました。':'登録英文とは一致しませんでした。', st.cloze.answer, !correct); return;
  }
  if(!ensureIftyOnline('BASIC SENTENCES記述採点')){st.answered=false;return;}
  modal.innerHTML=`<div style="background:white;border-radius:14px;width:min(620px,100%);padding:28px;text-align:center;"><h3 style="color:#5b21b6;">ALLIAが採点中…</h3></div>`;
  try{
    const response=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'basic_sentence_grade',direction:st.currentDirection,prompt:st.currentDirection==='ja_to_en'?item.ja:item.en,referenceAnswer:st.currentDirection==='ja_to_en'?item.en:item.ja,userAnswer:answer})});
    const data=await response.json(); if(!response.ok)throw alliaHttpError(response,data,'採点に失敗しました。');
    const correct=data.correct===true; if(correct)st.correct++;else st.wrong++; st.last={answer,correct}; recordIftyBasicSentenceStudy(item.id,correct); savePracticeData(); renderIftyBasicPracticeFeedback(correct,data.feedback||'',data.modelAnswer|| (st.currentDirection==='ja_to_en'?item.en:item.ja),false);
  }catch(error){st.answered=false;modal.innerHTML=`<div style="background:white;border-radius:14px;width:min(620px,100%);padding:24px;text-align:center;"><h3 style="color:#ef4444;">採点に失敗しました</h3><p>${escapeHtml(String(error.message||error))}</p><button onclick="renderIftyBasicPracticeQuestion()" style="border:none;background:#7c3aed;color:white;border-radius:7px;padding:9px 12px;">問題に戻る</button></div>`;}
};

function renderIftyBasicPracticeFeedback(correct, feedback, modelAnswer, canChallenge) {
  const modal=document.getElementById('practiceModal'), st=iftyBasicPracticeState; if(!modal||!st)return;
  modal.innerHTML=`<div style="background:white;border-radius:14px;width:min(650px,100%);padding:22px;"><h2 style="margin-top:0;color:${correct?'#059669':'#dc2626'};">${correct?'⭕ 正解':'❌ 不正解'}</h2><div style="padding:10px;background:#f8fafc;border-radius:8px;"><b>あなたの回答：</b>${escapeHtml(st.last?.answer||'')}</div><div style="padding:10px;background:#f5f3ff;border-radius:8px;margin-top:8px;color:#4c1d95;"><b>登録・模範：</b>${escapeHtml(modelAnswer||'')}</div><div style="margin-top:10px;color:#475569;white-space:pre-wrap;line-height:1.55;">${escapeHtml(feedback||'')}</div>${canChallenge?`<div style="margin-top:13px;padding:11px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;"><div style="font-weight:900;color:#92400e;">別解だと思う場合</div><textarea id="iftyBasicChallengeReason" rows="2" placeholder="理由（任意）" style="width:100%;box-sizing:border-box;margin-top:7px;padding:9px;border:1px solid #f59e0b;border-radius:7px;"></textarea><button onclick="submitIftyBasicClozeChallenge()" style="width:100%;margin-top:7px;border:none;background:#d97706;color:white;border-radius:7px;padding:9px;font-weight:900;">⚖️ Challenge（ALLIA）</button></div>`:''}<button onclick="nextIftyBasicPracticeQuestion()" style="width:100%;margin-top:13px;border:none;background:#7c3aed;color:white;border-radius:8px;padding:11px;font-weight:900;">次へ</button></div>`;
}

window.nextIftyBasicPracticeQuestion=function(){const st=iftyBasicPracticeState;if(!st)return;st.index++;renderIftyBasicPracticeQuestion();};

window.submitIftyBasicClozeChallenge=async function(){
  const st=iftyBasicPracticeState, modal=document.getElementById('practiceModal'); if(!st||!modal||st.mode!=='cloze'||!st.last||st.last.correct)return;
  const item=findIftyBasicSentenceById(st.queue[st.index]); if(!item||!ensureIftyOnline('Challenge再審査'))return;
  const reason=String(document.getElementById('iftyBasicChallengeReason')?.value||'').trim();
  modal.innerHTML=`<div style="background:white;border-radius:14px;width:min(620px,100%);padding:28px;text-align:center;"><h3 style="color:#92400e;">⚖️ ALLIAがChallengeを再審査中…</h3></div>`;
  try{const response=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'basic_sentence_cloze_challenge',sentence:item.en,blankedSentence:st.cloze.prompt,referenceAnswer:st.cloze.answer,userAnswer:st.last.answer,reason})});const data=await response.json();if(!response.ok)throw alliaHttpError(response,data,'Challengeに失敗しました。');const accepted=data.challengeAccepted===true;if(accepted){st.wrong=Math.max(0,st.wrong-1);st.correct++;st.last.correct=true;const study=normalizeIftyBasicSentenceStudy(item.study);if(study.total){study.wrong=Math.max(0,study.wrong-1);study.correct++;item.study=study;savePracticeData();}}renderIftyBasicPracticeFeedback(accepted,data.feedback||'',st.cloze.answer,false);}catch(error){renderIftyBasicPracticeFeedback(false,String(error.message||error),st.cloze.answer,true);}
};

window.startIftyDueReviewFlashcards = function(direction = 'front') {
  const entries = getIftyReviewEntries({ dueOnly: true });
  if (!entries.length) {
    alert('今日の復習対象はありません。');
    renderFolders();
    return;
  }

  currentFlashcardMode = 'review_due';
  isRandomMode = true;
  cardMode = direction === 'back' ? 'back' : 'front';
  flashcardList = shuffleArray(entries.map(({ word }) => ({ ...deepClone(word), __iftyReviewWordId: word.id })));
  currentFlashcardIndex = 0;
  isCardFlipped = false;
  renderFlashcardModal();
};

function ensureIftyReviewQuizSet() {
  normalizePracticeData();
  let set = practiceData.modules.questions.sets.find(item => item && item.id === IFTY_REVIEW_QUIZ_SET_ID);
  if (!set) {
    set = {
      id: IFTY_REVIEW_QUIZ_SET_ID,
      name: '今日の復習',
      wordIds: [],
      directionMode: 'mixed',
      types: { simple: true, selection: false, written: false, example: false, knowledge: false, composition: false, translation: false, listening: false, usage_cloze: false, synonym_choice: false },
      random: true,
      progress: null,
      reviewWordIds: [],
      mistakeCounts: {},
      systemReview: true
    };
    practiceData.modules.questions.sets.push(set);
  }
  set.systemReview = true;
  set.name = '今日の復習';
  return set;
}

window.startIftyDueReviewQuiz = function() {
  const dueIds = getIftyReviewEntries({ dueOnly: true }).map(entry => entry.word.id);
  if (!dueIds.length) {
    alert('今日の復習対象はありません。');
    renderFolders();
    return;
  }

  const set = ensureIftyReviewQuizSet();
  set.wordIds = uniqueExistingWordIds(dueIds);
  set.directionMode = 'mixed';
  set.types = { simple: true, selection: false, written: false, example: false, knowledge: false, composition: false, translation: false, listening: false, usage_cloze: false, synonym_choice: false };
  set.random = true;
  set.progress = null;
  set.reviewWordIds = [];
  set.mistakeCounts = {};
  savePracticeData();

  let modal = document.getElementById('practiceModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'practiceModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;justify-content:center;align-items:center;padding:18px;box-sizing:border-box;z-index:10030;';
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
  startQuizSet(set.id, true, false);
};

function normalizeFoldersData() {
  if (!Array.isArray(folders)) folders = [];

  folders.forEach(folder => {
    if (!folder.id) folder.id = makeId('folder');
    if (!Array.isArray(folder.words)) folder.words = [];
    folder.words.forEach(word => {
      if (!word.id) word.id = makeId('word');
      word.quizAnswers = deriveQuizAnswers(word);
      normalizeIftyStudyState(word);
      normalizeIftyReviewState(word);
    });
  });
}

function loadUserData(username) {
  iftyGlobalVocabSearchQuery = '';
  iftyFolderSearchQueries = {};
  try {
    const saved = localStorage.getItem("vocab_user_" + username);
    folders = saved ? JSON.parse(saved) : [];
  } catch (e) {
    folders = [];
  }

  normalizeFoldersData();
  saveUserData();
  renderFolders();
}

function saveUserData() {
  try {
    normalizeFoldersData();
    localStorage.setItem("vocab_user_" + currentUser, JSON.stringify(folders));
    queueIftyCloudSave('単語帳更新');
  } catch (e) {}
}

function normalizePracticeData() {
  if (!practiceData || typeof practiceData !== 'object') practiceData = {};
  if (!practiceData.schemaVersion) practiceData.schemaVersion = 1;
  if (!practiceData.modules || typeof practiceData.modules !== 'object') practiceData.modules = {};

  if (!practiceData.modules.flashcards || typeof practiceData.modules.flashcards !== 'object') {
    practiceData.modules.flashcards = { sets: [] };
  }
  if (!Array.isArray(practiceData.modules.flashcards.sets)) practiceData.modules.flashcards.sets = [];

  practiceData.modules.flashcards.sets.forEach(set => {
    if (!set.id) set.id = makeId('flashset');
    if (!set.name) set.name = 'フラッシュカード';
    if (!Array.isArray(set.wordIds)) set.wordIds = [];
    if (typeof set.random !== 'boolean') set.random = true;
    if (!set.direction) set.direction = 'front';
    if (!set.progress || typeof set.progress !== 'object') set.progress = null;
  });

  if (!practiceData.modules.questions || typeof practiceData.modules.questions !== 'object') {
    practiceData.modules.questions = { sets: [] };
  }
  if (!Array.isArray(practiceData.modules.questions.sets)) practiceData.modules.questions.sets = [];

  practiceData.modules.questions.sets.forEach(set => {
    if (!set.id) set.id = makeId('quizset');
    if (!set.name) set.name = 'クイズフォルダ';
    if (!Array.isArray(set.wordIds)) set.wordIds = [];
    if (!['jp_to_en', 'en_to_jp', 'mixed'].includes(set.directionMode)) set.directionMode = 'mixed';
    if (!set.types || typeof set.types !== 'object') set.types = {};
    const defaults = { simple: true, selection: false, written: false, example: false, knowledge: false, composition: false, translation: false, listening: false, usage_cloze: false, synonym_choice: false };
    Object.keys(defaults).forEach(key => {
      if (typeof set.types[key] !== 'boolean') set.types[key] = defaults[key];
    });
    if (!Object.values(set.types).some(Boolean)) set.types.simple = true;
    if (typeof set.random !== 'boolean') set.random = true;
    if (!set.progress || typeof set.progress !== 'object') set.progress = null;
    if (!Array.isArray(set.reviewWordIds)) set.reviewWordIds = [];
    if (!set.mistakeCounts || typeof set.mistakeCounts !== 'object') set.mistakeCounts = {};
  });

  if (!practiceData.modules.basicSentences || typeof practiceData.modules.basicSentences !== 'object') {
    practiceData.modules.basicSentences = { items: [], folders: [] };
  }
  if (!Array.isArray(practiceData.modules.basicSentences.items)) practiceData.modules.basicSentences.items = [];
  if (!Array.isArray(practiceData.modules.basicSentences.folders)) practiceData.modules.basicSentences.folders = [];
  if (!practiceData.modules.basicSentences.folders.length) {
    practiceData.modules.basicSentences.folders.push(normalizeIftyCollectionFolder({ id: 'basic_sentence_default', name: '未分類', order: 0, collapsed: false }, 'basicsentencefolder', '未分類', 0));
  }
  practiceData.modules.basicSentences.folders = practiceData.modules.basicSentences.folders
    .map((folder, index) => normalizeIftyCollectionFolder(folder, 'basicsentencefolder', '未分類', index))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  practiceData.modules.basicSentences.folders.forEach((folder, index) => { folder.order = index; });
  const basicFolderIds = new Set(practiceData.modules.basicSentences.folders.map(folder => String(folder.id)));
  const basicDefaultFolderId = String(practiceData.modules.basicSentences.folders[0].id);
  practiceData.modules.basicSentences.items = practiceData.modules.basicSentences.items.map(normalizeIftyBasicSentenceItem).filter(Boolean);
  practiceData.modules.basicSentences.items.forEach(item => {
    if (!basicFolderIds.has(String(item.folderId || ''))) item.folderId = basicDefaultFolderId;
  });
  practiceData.modules.basicSentences.folders.forEach(folder => {
    const rows = practiceData.modules.basicSentences.items.filter(item => String(item.folderId) === String(folder.id));
    rows.sort((a, b) => {
      const ao = Number.isFinite(Number(a.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
      const bo = Number.isFinite(Number(b.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return Number(a.createdAt || 0) - Number(b.createdAt || 0);
    });
    rows.forEach((item, index) => { item.order = index; });
  });

  if (!practiceData.modules.years || typeof practiceData.modules.years !== 'object') {
    practiceData.modules.years = { entries: [], folders: [] };
  }
  if (!Array.isArray(practiceData.modules.years.entries)) practiceData.modules.years.entries = [];
  if (!Array.isArray(practiceData.modules.years.folders)) practiceData.modules.years.folders = [];
  if (!practiceData.modules.years.folders.length) {
    practiceData.modules.years.folders.push(normalizeIftyCollectionFolder({ id: 'years_default', name: '未分類', order: 0, collapsed: false }, 'yearfolder', '未分類', 0));
  }
  practiceData.modules.years.folders = practiceData.modules.years.folders
    .map((folder, index) => normalizeIftyCollectionFolder(folder, 'yearfolder', '未分類', index))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  practiceData.modules.years.folders.forEach((folder, index) => { folder.order = index; });
  const yearFolderIds = new Set(practiceData.modules.years.folders.map(folder => String(folder.id)));
  const yearDefaultFolderId = String(practiceData.modules.years.folders[0].id);
  practiceData.modules.years.entries = practiceData.modules.years.entries.map(normalizeIftyYearEntry).filter(entry => entry.year >= 1);
  practiceData.modules.years.entries.forEach(entry => {
    if (!yearFolderIds.has(String(entry.folderId || ''))) entry.folderId = yearDefaultFolderId;
  });
  practiceData.modules.years.folders.forEach(folder => {
    const rows = practiceData.modules.years.entries.filter(entry => String(entry.folderId) === String(folder.id));
    rows.sort((a, b) => {
      const ao = Number.isFinite(Number(a.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
      const bo = Number.isFinite(Number(b.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return Number(a.createdAt || 0) - Number(b.createdAt || 0);
    });
    rows.forEach((entry, index) => { entry.order = index; });
  });

  if (!practiceData.modules.socialStudies || typeof practiceData.modules.socialStudies !== 'object') {
    practiceData.modules.socialStudies = { folders: [] };
  }
  if (!Array.isArray(practiceData.modules.socialStudies.folders)) {
    practiceData.modules.socialStudies.folders = [];
  }
  practiceData.modules.socialStudies.folders = practiceData.modules.socialStudies.folders.map(folder => {
    const source = folder && typeof folder === 'object' ? folder : {};
    const normalizedSubjects = normalizeIftySocialSubjects(source.subjects);
    return {
      id: source.id || makeId('socialfolder'),
      name: String(source.name || '社会').trim() || '社会',
      subjects: normalizedSubjects.length ? normalizedSubjects : ['WORLD_HISTORY'],
      collapsed: !!source.collapsed,
      items: Array.isArray(source.items) ? source.items.map(normalizeIftySocialItem).filter(Boolean) : []
    };
  });

  if (!practiceData.modules.science || typeof practiceData.modules.science !== 'object') {
    practiceData.modules.science = { folders: [] };
  }
  if (!Array.isArray(practiceData.modules.science.folders)) {
    practiceData.modules.science.folders = [];
  }
  practiceData.modules.science.folders = practiceData.modules.science.folders.map(folder => {
    const source = folder && typeof folder === 'object' ? folder : {};
    const normalizedSubjects = normalizeIftyScienceSubjects(source.subjects);
    return {
      id: source.id || makeId('sciencefolder'),
      name: String(source.name || '理科').trim() || '理科',
      subjects: normalizedSubjects.length ? normalizedSubjects : ['PHYSICS'],
      collapsed: !!source.collapsed,
      items: Array.isArray(source.items) ? source.items.map(normalizeIftyScienceItem).filter(Boolean) : []
    };
  });
}
function loadPracticeData(username) {
  try {
    const saved = localStorage.getItem("practice_user_" + username);
    if (saved) practiceData = JSON.parse(saved);
  } catch (e) {}
  normalizePracticeData();
  savePracticeData();
}

function savePracticeData() {
  try {
    normalizePracticeData();
    localStorage.setItem("practice_user_" + currentUser, JSON.stringify(practiceData));
    queueIftyCloudSave('実践データ更新');
  } catch (e) {}
}

// 3. フォルダ管理
window.createFolder = function() {
  const input = document.getElementById("folderName");
  if (!input) return;

  const name = input.value.trim();

  if (!name) {
    alert("フォルダ名を入力してください。");
    return;
  }

  recordUndoState('フォルダ作成');
  folders.push({
    id: 'folder_' + Date.now(),
    name: name,
    collapsed: false,
    words: []
  });

  input.value = "";
  saveUserData();
  renderFolders();
};

window.toggleFolderCollapse = function(folderId) {
  const folder = folders.find(f => f.id === folderId);

  if (folder) {
    folder.collapsed = !folder.collapsed;
    saveUserData();
    renderFolders();
  }
};

window.moveFolder = function(index, direction) {
  const newIndex = index + direction;

  if (newIndex < 0 || newIndex >= folders.length) return;

  recordUndoState('フォルダ移動');
  const temp = folders[index];
  folders[index] = folders[newIndex];
  folders[newIndex] = temp;

  saveUserData();
  renderFolders();
};

window.clearFolderWords = function(folderId) {
  if (!confirm("このフォルダ内の単語をすべて削除しますか？")) return;

  const folder = folders.find(f => f.id === folderId);

  if (folder) {
    recordUndoState('フォルダ内単語の全削除');
    folder.words = [];
    saveUserData();
    renderFolders();
  }
};

function renderFolders() {
  const container = document.getElementById("folders");
  if (!container) return;

  normalizeFoldersData();
  refreshIftyEnglishSubjectPanel();

  const selectedCount = selectedWordIds.size;
  const folderOptions = folders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');

  const reviewFolder = renderIftyReviewFolder();
  const weakFolder = renderIftyWeakFolder();

  const selectionToolbar = `
    <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:10px;margin-bottom:12px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
      <b style="color:#334155;margin-right:4px;">選択: ${selectedCount}語</b>
      <button onclick="selectAllWords()" style="background:#334155;color:white;border:none;border-radius:5px;padding:6px 9px;cursor:pointer;">全フォルダから全選択</button>
      <button onclick="clearAllSelections()" style="background:#e2e8f0;color:#334155;border:none;border-radius:5px;padding:6px 9px;cursor:pointer;">選択全解除</button>
      <button onclick="bulkDeleteSelectedWords()" ${selectedCount ? '' : 'disabled'} style="background:#ef4444;color:white;border:none;border-radius:5px;padding:6px 9px;cursor:${selectedCount ? 'pointer' : 'default'};opacity:${selectedCount ? '1' : '.45'};">選択語を一斉削除</button>
      <select id="bulkMoveFolderSelect" ${selectedCount ? '' : 'disabled'} style="padding:6px;border:1px solid #cbd5e1;border-radius:5px;">${folderOptions}</select>
      <button onclick="bulkMoveSelectedWords()" ${selectedCount ? '' : 'disabled'} style="background:#0284c7;color:white;border:none;border-radius:5px;padding:6px 9px;cursor:${selectedCount ? 'pointer' : 'default'};opacity:${selectedCount ? '1' : '.45'};">選択語を一斉移動</button>
    </div>
  `;

  if (folders.length === 0) {
    container.innerHTML = reviewFolder + weakFolder + selectionToolbar + `
      <p style="color:#94a3b8;text-align:center;padding:30px;background:white;border-radius:8px;border:1px dashed #cbd5e1;">
        フォルダがありません。下のフォームからフォルダを作成してください。
      </p>
    `;
    return;
  }

  const globalSearchActive = !!normalizeIftyVocabSearchText(iftyGlobalVocabSearchQuery);
  const renderedFolders = folders
    .map((folder, fIndex) => ({ folder, fIndex }))
    .filter(({ folder }) => !globalSearchActive || getIftyVisibleWordEntries(folder).length > 0);

  if (globalSearchActive && renderedFolders.length === 0) {
    container.innerHTML = reviewFolder + weakFolder + selectionToolbar + `
      <p style="color:#64748b;text-align:center;padding:28px;background:white;border-radius:8px;border:1px dashed #cbd5e1;">
        全フォルダ検索に一致する単語がありません。
      </p>`;
    return;
  }

  container.innerHTML = reviewFolder + weakFolder + selectionToolbar + renderedFolders.map(({ folder, fIndex }) => {
    const suggestion = pendingSpellingSuggestions[folder.id];
    const words = folder.words || [];
    const allWordsSelected = words.length > 0 && words.every(w => selectedWordIds.has(w.id));
    const folderChecked = selectedFolderIds.has(folder.id);
    // 全フォルダ検索中は結果を確認できるよう一時的に展開表示するが、保存済みcollapsed状態は変更しない。
    const visuallyCollapsed = folder.collapsed && !globalSearchActive;

    return `
    <div style="background:white;border:1px solid #cbd5e1;border-radius:8px;padding:16px;margin-bottom:12px;box-shadow:0 2px 4px rgba(0,0,0,0.05);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${visuallyCollapsed ? '0' : '8px'};gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
          <input type="checkbox" ${folderChecked ? 'checked' : ''} onchange="toggleFolderSelection('${folder.id}', this.checked)" title="このフォルダを選択" style="width:18px;height:18px;flex:none;">
          <div style="display:flex;align-items:center;gap:8px;cursor:pointer;min-width:0;" onclick="toggleFolderCollapse('${folder.id}')">
            <span style="font-size:.9em;color:#64748b;">${visuallyCollapsed ? '▶' : '▼'}</span>
            <h3 style="margin:0;color:#0f172a;font-size:1.1em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📁 ${escapeHtml(folder.name)} (<span id="folderWordCount_${folder.id}">${words.length}件</span>)</h3>
          </div>
        </div>
        <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
          <button onclick="selectAllWordsInFolder('${folder.id}')" title="フォルダ内全選択" style="background:${allWordsSelected ? '#10b981' : '#e2e8f0'};color:${allWordsSelected ? 'white' : '#334155'};border:none;padding:3px 6px;border-radius:4px;cursor:pointer;font-size:.75em;">全選択</button>
          <button onclick="moveFolder(${fIndex}, -1)" title="上に移動" style="background:#e2e8f0;border:none;padding:2px 6px;border-radius:4px;cursor:pointer;font-size:.8em;">⬆️</button>
          <button onclick="moveFolder(${fIndex}, 1)" title="下に移動" style="background:#e2e8f0;border:none;padding:2px 6px;border-radius:4px;cursor:pointer;font-size:.8em;">⬇️</button>
          <button onclick="clearFolderWords('${folder.id}')" title="全消し" style="background:#f59e0b;color:white;border:none;padding:3px 6px;border-radius:4px;cursor:pointer;font-size:.75em;">全消し</button>
          <button onclick="deleteFolder('${folder.id}')" title="削除" style="background:#ef4444;color:white;border:none;padding:3px 6px;border-radius:4px;cursor:pointer;font-size:.75em;">削除</button>
        </div>
      </div>

      ${visuallyCollapsed ? '' : `
        <div style="display:flex;gap:6px;margin-bottom:10px;margin-top:8px;">
          <input id="wordInput_${folder.id}" value="${escapeHtml(wordInputDrafts[folder.id] || '')}" placeholder="単語を入力（Enterまたは追加でALLIA生成）" oninput="saveWordInputDraft('${folder.id}', this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault(); addWordToFolder('${folder.id}');}" style="flex:1;padding:8px;border:1px solid #cbd5e1;border-radius:4px;font-size:.9em;min-width:0;">
          <button onclick="addWordToFolder('${folder.id}')" style="background:#0284c7;color:white;border:none;padding:8px 12px;border-radius:4px;cursor:pointer;font-size:.9em;font-weight:bold;">追加</button>
          <button onclick="addBlankWordToFolder('${folder.id}')" title="ALLIAを使わず白紙から自分で作成" style="background:white;color:#334155;border:1px solid #94a3b8;padding:8px 12px;border-radius:4px;cursor:pointer;font-size:.9em;font-weight:bold;white-space:nowrap;">白紙</button>
        </div>
        <div id="spellingSuggestion_${folder.id}">${suggestion ? renderSpellingSuggestion(folder.id, suggestion) : ''}</div>
        <div style="display:flex;gap:6px;align-items:center;margin:8px 0 10px;flex-wrap:wrap;">
          <input id="folderSearch_${folder.id}" value="${escapeHtml(iftyFolderSearchQueries[folder.id] || '')}" oninput="setIftyFolderSearchQuery('${folder.id}', this.value)" placeholder="このフォルダ内をスペル・意味で検索" style="flex:1;min-width:170px;padding:8px;border:1px solid #cbd5e1;border-radius:6px;font-size:.86em;">
          <button type="button" onclick="clearIftyFolderSearchQuery('${folder.id}')" style="border:none;background:#e2e8f0;color:#334155;padding:8px 10px;border-radius:6px;font-size:.8em;font-weight:800;cursor:pointer;">クリア</button>
          <span id="folderSearchCount_${folder.id}" style="font-size:.76em;color:#64748b;white-space:nowrap;">${getIftyVisibleWordEntries(folder).length}/${words.length}件</span>
        </div>
        <div id="wordList_${folder.id}" style="display:flex;flex-direction:column;gap:8px;">
          ${renderFolderWordList(folder)}
        </div>
      `}
    </div>`;
  }).join('');
}

window.saveWordInputDraft = function(folderId, value) {
  wordInputDrafts[folderId] = String(value ?? '');
};

function renderFolderWordList(folder) {
  const entries = getIftyVisibleWordEntries(folder);
  const hasSearch = !!normalizeIftyVocabSearchText(iftyGlobalVocabSearchQuery) || !!normalizeIftyVocabSearchText(iftyFolderSearchQueries[folder && folder.id] || '');

  if (!entries.length && hasSearch) {
    return `<div style="padding:16px;text-align:center;color:#94a3b8;border:1px dashed #cbd5e1;border-radius:6px;">一致する単語がありません。</div>`;
  }

  return entries.map(({ word: w, index: wIndex }) => `
    <div style="display:flex;align-items:flex-start;gap:8px;">
      <input type="checkbox" ${selectedWordIds.has(w.id) ? 'checked' : ''} onchange="toggleWordSelection('${w.id}', this.checked)" title="この単語を選択" style="width:18px;height:18px;margin-top:14px;flex:none;">
      <div style="flex:1;min-width:0;">${renderWordItem(w, folder.id, wIndex)}</div>
    </div>
  `).join('');
}

function refreshFolderWordArea(folderId) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;

  const list = document.getElementById(`wordList_${folderId}`);
  if (list) list.innerHTML = renderFolderWordList(folder);

  const count = document.getElementById(`folderWordCount_${folderId}`);
  if (count) count.textContent = `${Array.isArray(folder.words) ? folder.words.length : 0}件`;

  const searchCount = document.getElementById(`folderSearchCount_${folderId}`);
  if (searchCount) searchCount.textContent = `${getIftyVisibleWordEntries(folder).length}/${Array.isArray(folder.words) ? folder.words.length : 0}件`;
  refreshIftyVocabSearchPanel();
}

function refreshSpellingSuggestion(folderId) {
  const area = document.getElementById(`spellingSuggestion_${folderId}`);
  if (!area) return;
  const suggestion = pendingSpellingSuggestions[folderId];
  area.innerHTML = suggestion ? renderSpellingSuggestion(folderId, suggestion) : '';
}

function clearIftySpellingSuggestionTimer(folderId) {
  const timer = iftySpellingSuggestionTimers[folderId];
  if (timer) clearTimeout(timer);
  delete iftySpellingSuggestionTimers[folderId];
}

function clearAllIftySpellingSuggestionTimers() {
  Object.keys(iftySpellingSuggestionTimers).forEach(clearIftySpellingSuggestionTimer);
}

function clearIftySpellingSuggestion(folderId, options = {}) {
  clearIftySpellingSuggestionTimer(folderId);
  delete pendingSpellingSuggestions[folderId];
  if (!options.skipRefresh) refreshSpellingSuggestion(folderId);
}

function scheduleIftySpellingSuggestionAutoAccept(folderId, suggestion) {
  clearIftySpellingSuggestionTimer(folderId);
  if (!suggestion) return;
  const token = String(suggestion.id || '');
  const createdAt = Number(suggestion.createdAt || Date.now());
  const dueAt = createdAt + iftySpellingAutoAcceptSeconds * 1000;
  const delay = Math.max(0, dueAt - Date.now());
  iftySpellingSuggestionTimers[folderId] = setTimeout(async () => {
    delete iftySpellingSuggestionTimers[folderId];
    const current = pendingSpellingSuggestions[folderId];
    if (!current || String(current.id || '') !== token) return;
    const word = String(current.suggested || '').trim();
    clearIftySpellingSuggestion(folderId);
    if (!word) return;
    keepWordInputFocused(folderId);
    await generateAndAddWord(folderId, word);
  }, delay);
}

function setIftySpellingSuggestion(folderId, original, suggested) {
  const suggestion = {
    id: makeId('spelling'),
    original: String(original || '').trim(),
    suggested: String(suggested || '').trim(),
    createdAt: Date.now()
  };
  pendingSpellingSuggestions[folderId] = suggestion;
  refreshSpellingSuggestion(folderId);
  scheduleIftySpellingSuggestionAutoAccept(folderId, suggestion);
}

function rescheduleAllIftySpellingSuggestionTimers() {
  clearAllIftySpellingSuggestionTimers();
  Object.entries(pendingSpellingSuggestions).forEach(([folderId, suggestion]) => {
    if (suggestion) scheduleIftySpellingSuggestionAutoAccept(folderId, suggestion);
  });
}

function keepWordInputFocused(folderId) {
  const input = document.getElementById(`wordInput_${folderId}`);
  if (!input) return;
  try {
    input.focus({ preventScroll: true });
  } catch (_) {
    input.focus();
  }
}

function renderSpellingSuggestion(folderId, suggestion) {
  return `
    <div style="margin-bottom: 10px; padding: 10px 12px; background: #eff6ff; border: 1px solid #93c5fd; border-radius: 7px; color: #334155; font-size: 0.9em;">
      <div style="margin-bottom: 5px;">もしかして <b>${escapeHtml(suggestion.suggested)}</b> ？</div>
      <div style="margin-bottom:8px;color:#64748b;font-size:.82em;">${iftySpellingAutoAcceptSeconds}秒以内に応答がなければ <b>${escapeHtml(suggestion.suggested)}</b> を自動追加します。</div>
      <div style="display: flex; gap: 7px; flex-wrap: wrap;">
        <button onclick="acceptSpellingSuggestion('${folderId}')" style="background: #0284c7; color: white; border: none; padding: 6px 10px; border-radius: 5px; cursor: pointer; font-weight: bold;">${escapeHtml(suggestion.suggested)} を追加</button>
        <button onclick="keepOriginalSpelling('${folderId}')" style="background: #e2e8f0; color: #334155; border: none; padding: 6px 10px; border-radius: 5px; cursor: pointer;">${escapeHtml(suggestion.original)} のまま追加</button>
        <button onclick="cancelSpellingSuggestion('${folderId}')" style="background: transparent; color: #64748b; border: none; padding: 6px; cursor: pointer;">キャンセル</button>
      </div>
    </div>
  `;
}

window.acceptSpellingSuggestion = async function(folderId) {
  const suggestion = pendingSpellingSuggestions[folderId];
  if (!suggestion) return;
  const word = suggestion.suggested;
  clearIftySpellingSuggestion(folderId);
  keepWordInputFocused(folderId);
  await generateAndAddWord(folderId, word);
};

window.keepOriginalSpelling = async function(folderId) {
  const suggestion = pendingSpellingSuggestions[folderId];
  if (!suggestion) return;
  const word = suggestion.original;
  clearIftySpellingSuggestion(folderId);
  keepWordInputFocused(folderId);
  await generateAndAddWord(folderId, word);
};

window.cancelSpellingSuggestion = function(folderId) {
  clearIftySpellingSuggestion(folderId);
  keepWordInputFocused(folderId);
};

// 単語カード表示
function renderWordItem(w, folderId, wIndex) {
  const meanings = Array.isArray(w.meanings) ? w.meanings : (w.meanings ? [w.meanings] : []);
  const examples = Array.isArray(w.examples) ? w.examples : [];
  const derivatives = Array.isArray(w.derivatives) ? w.derivatives : (w.derivatives ? [w.derivatives] : []);
  const forms = w.forms || {};

  return `
    <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; font-size: 0.9em;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div style="flex: 1; min-width: 0;">
          <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
            <div style="font-size: 1.25em; font-weight: bold; color: #0f172a;">${escapeHtml(w.word || '')}</div>
            ${(() => { const lang = getIftyWordLanguageInfo(w); return `<span style="display:inline-block;padding:2px 7px;border-radius:999px;background:#e0f2fe;color:#075985;font-size:.68em;font-weight:900;">🌐 ${escapeHtml(lang.label)}</span>`; })()}
            ${isIftyReviewTagged(w) ? `<span style="display:inline-block;padding:2px 6px;border-radius:999px;background:${isIftyReviewDue(w) ? '#ffedd5' : '#fef3c7'};color:${isIftyReviewDue(w) ? '#c2410c' : '#a16207'};font-size:.68em;font-weight:900;">${isIftyReviewDue(w) ? '🔁 復習：今日' : `🔁 次回 ${escapeHtml(formatIftyReviewDate(w.review.nextReview))}`}</span>` : (w.review && Number(w.review.graduatedAt) > 0 ? '<span style="display:inline-block;padding:2px 6px;border-radius:999px;background:#dcfce7;color:#047857;font-size:.68em;font-weight:900;">✅ 復習卒業</span>' : '')}
            ${isIftyWeakWord(w) ? '<span style="display:inline-block;padding:2px 6px;border-radius:999px;background:#ffe4e6;color:#be123c;font-size:.68em;font-weight:900;">🎯 苦手候補</span>' : ''}
          </div>
          ${(() => { const st=normalizeIftyStudyState(w); return st && st.total ? `<div style="margin-top:3px;color:#64748b;font-size:.72em;">学習 ${st.total}回 ・ 正解 ${st.correct} ・ 不正解 ${st.wrong} ・ 正答率 ${Math.round(st.correct/st.total*100)}%</div>` : ''; })()}

          ${(w.pronunciation || w.partOfSpeech) ? `
            <div style="margin-top: 2px; color: #64748b; font-size: 0.85em;">
              ${w.pronunciation ? escapeHtml(w.pronunciation) : ''}
              ${w.pronunciation && w.partOfSpeech ? '　' : ''}
              ${w.partOfSpeech ? escapeHtml(w.partOfSpeech) : ''}
            </div>
          ` : ''}

          ${(w.transitivity || w.countability) ? `
            <div style="margin-top: 3px; color: #475569; font-size: 0.82em;">
              ${w.transitivity ? escapeHtml(w.transitivity) : ''}
              ${w.transitivity && w.countability ? ' / ' : ''}
              ${w.countability ? escapeHtml(w.countability) : ''}
            </div>
          ` : ''}

          ${meanings.length > 0 ? `
            <div style="margin-top: 7px; color: #0f172a; line-height: 1.5;">
              ${meanings.map((meaning, i) => `<div>${meanings.length > 1 ? `${i + 1}. ` : ''}${escapeHtml(meaning)}</div>`).join('')}
            </div>
          ` : ''}

          ${(forms.past || forms.pastParticiple || forms.ing || forms.thirdPerson) ? `
            <div style="margin-top: 7px; padding: 6px 8px; background: #eef2ff; border-radius: 5px; font-size: 0.82em; color: #334155;">
              <b>活用：</b>
              ${forms.past ? `過去 ${escapeHtml(forms.past)}　` : ''}
              ${forms.pastParticiple ? `過去分詞 ${escapeHtml(forms.pastParticiple)}　` : ''}
              ${forms.ing ? `-ing ${escapeHtml(forms.ing)}　` : ''}
              ${forms.thirdPerson ? `三単現 ${escapeHtml(forms.thirdPerson)}` : ''}
            </div>
          ` : ''}

          ${examples.length > 0 ? `
            <div style="margin-top: 8px; color: #334155; line-height: 1.45;">
              <b style="font-size: 0.82em;">例文</b>
              ${examples.map(ex => `
                <div style="margin-top: 4px; padding-left: 4px;">
                  <div>
                    ${escapeHtml(ex.en || '')}
                    ${ex.en ? `<button onclick="speakWord('${escapeHtml(String(ex.en).replace(/'/g, "\\'"))}','${escapeHtml(getIftyWordLanguageInfo(w).code)}')" style="background: #0284c7; color: white; border: none; padding: 1px 4px; border-radius: 3px; font-size: 0.7em; cursor: pointer;">🔊</button>` : ''}
                  </div>
                  ${ex.ja ? `<div style="color: #64748b; font-size: 0.9em;">${escapeHtml(ex.ja)}</div>` : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${derivatives.length > 0 ? `<div style="margin-top: 7px; color: #475569; font-size: 0.82em;"><b>派生語：</b>${derivatives.map(d => escapeHtml(d)).join(' / ')}</div>` : ''}

          ${w.details ? `<div style="font-size: 0.8em; color: #0284c7; margin-top: 6px; line-height: 1.35;">💡 ${escapeHtml(w.details)}</div>` : ''}
        </div>

        <div style="display: flex; gap: 3px; align-items: center; margin-left: 8px;">
          ${w.word ? `<button onclick="speakWord('${escapeHtml(String(w.word).replace(/'/g, "\\'"))}','${escapeHtml(getIftyWordLanguageInfo(w).code)}')" style="background: #0284c7; color: white; border: none; padding: 3px 6px; border-radius: 4px; font-size: 0.75em; cursor: pointer;" title="語彙を発音">🔊</button>` : ''}
          <button onclick="toggleIftyWordReview('${folderId}','${w.id}')" style="background:${isIftyReviewTagged(w) ? '#ea580c' : '#f59e0b'};color:white;border:none;padding:3px 6px;border-radius:4px;font-size:.75em;cursor:pointer;" title="${isIftyReviewTagged(w) ? '復習登録を解除' : 'この単語を復習に登録'}">${isIftyReviewTagged(w) ? '🔁 復習中' : '🔁 手動で復習登録'}</button>
          <button onclick="openEditWordModal('${folderId}', ${wIndex})" style="background: #64748b; color: white; border: none; padding: 3px 6px; border-radius: 4px; font-size: 0.75em; cursor: pointer;" title="編集">編集</button>
          <button onclick="moveWordWithinFolder('${folderId}', ${wIndex}, -1)" style="background: #e2e8f0; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 0.75em;" title="上へ">⬆️</button>
          <button onclick="moveWordWithinFolder('${folderId}', ${wIndex}, 1)" style="background: #e2e8f0; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 0.75em;" title="下へ">⬇️</button>
          <button onclick="deleteWord('${folderId}', ${wIndex})" style="background: none; border: none; color: #ef4444; cursor: pointer; font-weight: bold; font-size: 1.1em;" title="削除">×</button>
        </div>
      </div>
    </div>
  `;
}

// 4. 単語追加・編集・移動
let iftyEditWordModalState = null;
let iftyEditWordModalKeyboardInstalled = false;

window.addBlankWordToFolder = function(folderId) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;
  if (!Array.isArray(folder.words)) folder.words = [];

  const undoDepthBefore = undoStack.length;
  recordUndoState('白紙単語追加');

  const blankWord = {
    id: makeId('word'),
    word: '',
    meanings: [],
    examples: [],
    pronunciation: '',
    partOfSpeech: '',
    transitivity: '',
    countability: '',
    details: '',
    derivatives: [],
    forms: {},
    mastery: 'unfixed',
    quizAnswers: { jp: [], en: [] },
    generationMeta: {
      subject: 'ENGLISH',
      order: '',
      source: 'MANUAL_BLANK',
      generatedAt: 0
    }
  };

  folder.words.push(blankWord);
  saveUserData();
  refreshFolderWordArea(folderId);

  window.openEditWordModal(folderId, folder.words.length - 1, {
    isNewBlank: true,
    wordId: blankWord.id,
    undoDepthBefore
  });

  setTimeout(() => {
    const field = document.getElementById('editWordText');
    if (field) field.focus();
  }, 0);
};

window.addWordToFolder = async function(folderId) {
  const input = document.getElementById(`wordInput_${folderId}`);
  if (!input) return;

  const wordText = input.value.trim();
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;
  if (!folder.words) folder.words = [];
  if (!wordText) return;

  const englishOrder = getIftySubjectOrder('ENGLISH');

  // STEP18：同じ単語 + 同じENGLISH ORDERの生成済みデータが端末にあれば、
  // スペル確認も単語生成もALLIAを呼ばず、そのデータをそのまま再利用する。
  const reusable = await resolveIftyReusableWordData(wordText, 'ENGLISH', englishOrder);
  if (reusable && reusable.data) {
    wordInputDrafts[folderId] = '';
    input.value = '';
    keepWordInputFocused(folderId);
    clearIftySpellingSuggestion(folderId);
    await addWordFromReusableData(folderId, wordText, reusable.data, reusable.source, englishOrder);
    return;
  }

  // キャッシュがない場合だけ従来どおりオンラインAI処理へ進む。
  if (!ensureIftyOnline('単語生成')) {
    wordInputDrafts[folderId] = wordText;
    input.value = wordText;
    keepWordInputFocused(folderId);
    return;
  }

  // 送信した単語はEnter/追加の確定時点で入力欄から消す。
  // その後ユーザーが次の単語を入力した場合は wordInputDrafts に保存され、
  // AI生成完了後の再描画でもその新しい入力だけを保持する。
  wordInputDrafts[folderId] = '';
  input.value = '';
  // Enterで送信しても入力欄からフォーカスを外さず、iPadでそのまま次の単語を続けて入力できるようにする。
  keepWordInputFocused(folderId);
  clearIftySpellingSuggestion(folderId);

  try {
    const spellResponse = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: "word_check", word: wordText })
    });

    if (spellResponse.ok) {
      const spellData = await spellResponse.json();

      if (
        spellData &&
        spellData.valid === false &&
        spellData.suggestion &&
        String(spellData.suggestion).trim().toLowerCase() !== wordText.toLowerCase()
      ) {
        setIftySpellingSuggestion(folderId, wordText, String(spellData.suggestion).trim());
        keepWordInputFocused(folderId);
        return;
      }
    }
  } catch (error) {
    console.error("スペル確認エラー:", error);
  }

  await generateAndAddWord(folderId, wordText);
};

async function addWordFromReusableData(folderId, wordText, data, source, order) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;
  if (!folder.words) folder.words = [];

  recordUndoState('単語追加');
  const newWordObj = {
    id: makeId('word'),
    word: wordText,
    language: inferIftyLanguageFromText(wordText).label,
    languageCode: inferIftyLanguageFromText(wordText).code,
    meanings: [],
    examples: [],
    details: '',
    mastery: 'unfixed',
    quizAnswers: { jp: [], en: [wordText] }
  };

  applyWordData(newWordObj, data);
  newWordObj.generationMeta = {
    subject: 'ENGLISH',
    order: String(order || '').trim(),
    source: source || 'local-cache',
    generatedAt: Date.now()
  };

  folder.words.push(newWordObj);
  saveUserData();
  refreshFolderWordArea(folderId);
  keepWordInputFocused(folderId);
  setTimeout(() => speakWord(newWordObj.word || wordText, newWordObj.languageCode || ''), 150);
}

async function generateAndAddWord(folderId, wordText) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;
  if (!folder.words) folder.words = [];

  const englishOrder = getIftySubjectOrder('ENGLISH');

  // acceptSpellingSuggestion / keepOriginalSpelling から直接来た場合にも再利用を確認する。
  const reusable = await resolveIftyReusableWordData(wordText, 'ENGLISH', englishOrder);
  if (reusable && reusable.data) {
    await addWordFromReusableData(folderId, wordText, reusable.data, reusable.source, englishOrder);
    return;
  }

  if (!ensureIftyOnline('単語生成')) {
    const input = document.getElementById(`wordInput_${folderId}`);
    wordInputDrafts[folderId] = wordText;
    if (input) input.value = wordText;
    keepWordInputFocused(folderId);
    return;
  }

  recordUndoState('単語追加');
  const newWordObj = {
    id: makeId('word'),
    word: wordText,
    language: inferIftyLanguageFromText(wordText).label,
    languageCode: inferIftyLanguageFromText(wordText).code,
    meanings: ['生成中...'],
    examples: [],
    details: '',
    mastery: 'unfixed',
    quizAnswers: { jp: [], en: [wordText] }
  };

  folder.words.push(newWordObj);
  saveUserData();
  // 入力欄を含むフォルダ全体は再描画せず、単語一覧だけ更新する。
  // これによりAI生成開始時にもiPadのキーボードと入力フォーカスを維持する。
  refreshFolderWordArea(folderId);
  keepWordInputFocused(folderId);

  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: "word",
        word: wordText,
        language: "ja",
        format: "dictionary",
        requirements: {
          concise: true,
          includePronunciation: true,
          includePartOfSpeech: true,
          includeTransitivity: true,
          includeCountability: true,
          includeExamMeanings: true,
          advancedMeaningCoverage: 'Eiken Grade 1 / University of Tokyo / TUFS reading level',
          includeQuizAnswers: true,
          includeExamples: true,
          includeInflections: true,
          includeDerivatives: true,
          shortDetails: true
        },
        subject: 'ENGLISH',
        order: englishOrder
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw alliaHttpError(response, data, '単語生成に失敗しました。');
    }

    applyWordData(newWordObj, data);
    newWordObj.generationMeta = {
      subject: 'ENGLISH',
      order: String(englishOrder || '').trim(),
      source: 'ALLIA',
      generatedAt: Date.now()
    };
    await saveIftyGeneratedWordCache(wordText, data, 'ENGLISH', englishOrder);
  } catch (error) {
    console.error("単語生成エラー:", error);
    newWordObj.meanings = ["AI生成に失敗しました。もう一度お試しください。"];
    newWordObj.examples = [];
    newWordObj.details = String(error.message || error);
  }

  saveUserData();
  // AI生成完了時も入力欄自体は作り直さず、単語カード部分だけ更新する。
  refreshFolderWordArea(folderId);
  keepWordInputFocused(folderId);

  if (!newWordObj.meanings.includes("AI生成に失敗しました。もう一度お試しください。")) {
    setTimeout(() => speakWord(newWordObj.word || wordText, newWordObj.languageCode || ''), 300);
  }
}

function applyWordData(wordObj, data) {
  if (!data) return;
  if (data.word) wordObj.word = data.word;

  if (Array.isArray(data.meanings)) {
    wordObj.meanings = data.meanings;
  } else if (data.meaning) {
    wordObj.meanings = [data.meaning];
  }

  if (Array.isArray(data.examples)) {
    wordObj.examples = data.examples.map(ex => {
      if (typeof ex === 'string') return { en: ex, ja: "" };
      return { en: ex.text || ex.en || "", ja: ex.ja || ex.translationJa || "" };
    });
  }

  if (data.language) wordObj.language = String(data.language);
  if (data.languageCode) wordObj.languageCode = normalizeIftyLanguageCode(data.languageCode);
  if (data.pronunciationSystem) wordObj.pronunciationSystem = String(data.pronunciationSystem);
  if (!wordObj.language || !wordObj.languageCode) {
    const inferred = inferIftyLanguageFromText(wordObj.word || '');
    if (!wordObj.language) wordObj.language = inferred.label;
    if (!wordObj.languageCode) wordObj.languageCode = inferred.code;
  }
  if (data.pronunciation) wordObj.pronunciation = data.pronunciation;
  if (data.partOfSpeech) wordObj.partOfSpeech = data.partOfSpeech;
  if (data.transitivity) wordObj.transitivity = data.transitivity;
  if (data.countability) wordObj.countability = data.countability;
  if (data.details) wordObj.details = data.details;
  if (Array.isArray(data.derivatives)) wordObj.derivatives = data.derivatives;
  if (data.forms && typeof data.forms === 'object') wordObj.forms = data.forms;
  if (data.quizAnswers && typeof data.quizAnswers === 'object') {
    wordObj.quizAnswers = {
      jp: Array.isArray(data.quizAnswers.jp) ? data.quizAnswers.jp.filter(Boolean).map(String) : [],
      en: Array.isArray(data.quizAnswers.en) ? data.quizAnswers.en.filter(Boolean).map(String) : []
    };
  }
  wordObj.quizAnswers = deriveQuizAnswers(wordObj);
}

window.moveWordWithinFolder = function(folderId, wordIndex, direction) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder || !folder.words) return;

  const newIndex = wordIndex + direction;
  if (newIndex < 0 || newIndex >= folder.words.length) return;

  recordUndoState('単語並べ替え');
  const temp = folder.words[wordIndex];
  folder.words[wordIndex] = folder.words[newIndex];
  folder.words[newIndex] = temp;

  saveUserData();
  renderFolders();
};

window.openEditWordModal = function(folderId, wordIndex, options = {}) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder || !folder.words[wordIndex]) return;

  const w = folder.words[wordIndex];
  let modal = document.getElementById("editWordModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "editWordModal";
    modal.style.cssText = `position: fixed; inset: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 10005; padding: 14px; box-sizing: border-box;`;
    document.body.appendChild(modal);
  }

  iftyEditWordModalState = {
    folderId,
    wordIndex,
    wordId: String(options.wordId || w.id || ''),
    isNewBlank: !!options.isNewBlank,
    undoDepthBefore: Number.isInteger(options.undoDepthBefore) ? options.undoDepthBefore : null,
    saved: false
  };

  const meaningsStr = Array.isArray(w.meanings) ? w.meanings.join('\n') : (w.meanings || '');
  const examplesStr = w.examples ? w.examples.map(ex => `${ex.en || ''} | ${ex.ja || ''}`).join('\n') : '';
  const derivativesStr = Array.isArray(w.derivatives) ? w.derivatives.join('\n') : (w.derivatives || '');
  const titleText = iftyEditWordModalState.isNewBlank ? '📝 白紙から単語を作成' : '✏️ 単語の編集';

  modal.innerHTML = `
    <div id="editWordDialog" role="dialog" aria-modal="true" aria-label="${iftyEditWordModalState.isNewBlank ? '白紙から単語を作成' : '単語の編集'}" style="background:white;border-radius:12px;width:min(92vw,520px);max-height:92vh;overflow-y:auto;box-shadow:0 4px 16px rgba(0,0,0,0.3);position:relative;">
      <div style="position:sticky;top:0;z-index:4;background:white;padding:16px 18px 12px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <h3 style="margin:0;color:#0f172a;">${titleText}</h3>
        <button type="button" onclick="closeEditWordModal()" aria-label="閉じる" title="閉じる" style="flex:0 0 auto;width:38px;height:38px;border:none;border-radius:999px;background:#e2e8f0;color:#334155;font-size:1.45em;line-height:1;cursor:pointer;font-weight:900;">×</button>
      </div>

      <div style="padding:16px 18px 8px;">
        ${iftyEditWordModalState.isNewBlank ? `<div style="margin-bottom:12px;padding:9px 11px;border-radius:8px;background:#f0f9ff;color:#075985;font-size:.82em;line-height:1.45;">ALLIAを使わず、すべて自分で入力します。閉じる／キャンセルした場合、未保存の白紙単語は残りません。</div>` : ''}
        <div id="editWordValidationMessage" style="display:none;margin-bottom:10px;padding:8px 10px;border-radius:7px;background:#fee2e2;color:#b91c1c;font-size:.82em;font-weight:700;"></div>

        <div style="display:flex;flex-direction:column;gap:10px;text-align:left;">
          <div>
            <label style="font-size:.85em;font-weight:bold;color:#475569;">単語</label>
            <div style="display:flex;gap:7px;align-items:center;">
              <input id="editWordText" value="${escapeHtml(w.word)}" autocomplete="off" style="flex:1;min-width:0;padding:8px;border:1px solid #cbd5e1;border-radius:4px;box-sizing:border-box;">
              <button type="button" onclick="speakWord((document.getElementById('editWordText')||{}).value || '', (document.getElementById('editLanguageCodeText')||{}).value || '')" title="入力中の語彙を発音" style="padding:8px 10px;background:#0284c7;color:white;border:none;border-radius:5px;cursor:pointer;">🔊</button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 120px;gap:8px;">
            <div><label style="font-size: 0.85em; font-weight: bold; color: #475569;">言語</label><input id="editLanguageText" value="${escapeHtml(getIftyWordLanguageInfo(w).label)}" placeholder="英語 / フランス語 / 日本語 など" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:4px;box-sizing:border-box;"></div>
            <div><label style="font-size: 0.85em; font-weight: bold; color: #475569;">言語コード</label><input id="editLanguageCodeText" value="${escapeHtml(getIftyWordLanguageInfo(w).code)}" placeholder="en / fr / ja" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:4px;box-sizing:border-box;"></div>
          </div>
          <div><label style="font-size: 0.85em; font-weight: bold; color: #475569;">発音・読み</label><input id="editPronunciationText" value="${escapeHtml(w.pronunciation || '')}" placeholder="IPA / ピンイン / かな読みなど" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;"></div>
          <div><label style="font-size: 0.85em; font-weight: bold; color: #475569;">品詞</label><input id="editPartOfSpeechText" value="${escapeHtml(w.partOfSpeech || '')}" placeholder="動詞・名詞など" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;"></div>
          <div><label style="font-size: 0.85em; font-weight: bold; color: #475569;">自他動詞・可算不可算</label><input id="editUsageText" value="${escapeHtml([w.transitivity, w.countability].filter(Boolean).join(' / '))}" placeholder="他動詞 / 可算" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;"></div>
          <div><label style="font-size: 0.85em; font-weight: bold; color: #475569;">意味（改行区切り）</label><textarea id="editMeaningsText" rows="4" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-size: 0.9em;">${escapeHtml(meaningsStr)}</textarea></div>
          <div><label style="font-size: 0.85em; font-weight: bold; color: #475569;">活用</label><input id="editFormsText" value="${escapeHtml([w.forms && w.forms.past ? `過去:${w.forms.past}` : '', w.forms && w.forms.pastParticiple ? `過去分詞:${w.forms.pastParticiple}` : '', w.forms && w.forms.ing ? `ing:${w.forms.ing}` : '', w.forms && w.forms.thirdPerson ? `三単現:${w.forms.thirdPerson}` : ''].filter(Boolean).join(' / '))}" placeholder="過去 / 過去分詞 / -ing / 三単現" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;"></div>
          <div><label style="font-size: 0.85em; font-weight: bold; color: #475569;">例文（学習言語 | 日本語訳・補足）</label><textarea id="editExamplesText" rows="4" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-size: 0.9em;">${escapeHtml(examplesStr)}</textarea></div>
          <div><label style="font-size: 0.85em; font-weight: bold; color: #475569;">派生語（改行区切り）</label><textarea id="editDerivativesText" rows="2" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-size: 0.9em;">${escapeHtml(derivativesStr)}</textarea></div>
          <div><label style="font-size: 0.85em; font-weight: bold; color: #475569;">💡 補足</label><input id="editDetailsText" value="${escapeHtml(w.details || '')}" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;"></div>
        </div>
      </div>

      <div style="position:sticky;bottom:0;z-index:4;background:rgba(255,255,255,.98);border-top:1px solid #e2e8f0;padding:12px 18px;display:flex;gap:8px;flex-wrap:wrap;box-shadow:0 -4px 12px rgba(15,23,42,.06);">
        <button type="button" onclick="saveEditedWord('${folder.id}', ${wordIndex})" style="flex:1;min-width:120px;padding:10px;background:#0284c7;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">保存</button>
        ${iftyEditWordModalState.isNewBlank ? `<button type="button" onclick="saveEditedWord('${folder.id}', ${wordIndex}, true)" style="flex:1;min-width:150px;padding:10px;background:#0f766e;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">保存して次の白紙</button>` : ''}
        <button type="button" onclick="closeEditWordModal()" style="padding:10px 16px;background:#e2e8f0;color:#334155;border:none;border-radius:6px;cursor:pointer;font-weight:700;">キャンセル</button>
      </div>
    </div>
  `;

  modal.onclick = function(event) {
    if (event.target === modal) closeEditWordModal();
  };

  modal.style.display = "flex";
  installIftyEditWordModalKeyboard();
};

function installIftyEditWordModalKeyboard() {
  if (iftyEditWordModalKeyboardInstalled) return;
  iftyEditWordModalKeyboardInstalled = true;

  document.addEventListener('keydown', event => {
    const modal = document.getElementById('editWordModal');
    if (!modal || modal.style.display === 'none') return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeEditWordModal();
      return;
    }

    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      const state = iftyEditWordModalState;
      if (!state) return;
      event.preventDefault();
      saveEditedWord(state.folderId, state.wordIndex);
    }
  });
}

function parseIftyEditedForms(value) {
  const raw = String(value || '').trim();
  if (!raw) return {};

  const result = {};
  const parts = raw.split('/').map(s => s.trim()).filter(Boolean);
  const hasLabels = parts.some(part => /^(?:過去分詞|過去|ing|-ing|三単現)\s*[:：]/i.test(part));

  if (hasLabels) {
    parts.forEach(part => {
      const match = part.match(/^(過去分詞|過去|ing|-ing|三単現)\s*[:：]\s*(.+)$/i);
      if (!match) return;
      const label = match[1].toLowerCase();
      const val = match[2].trim();
      if (!val) return;
      if (label === '過去') result.past = val;
      else if (label === '過去分詞') result.pastParticiple = val;
      else if (label === 'ing' || label === '-ing') result.ing = val;
      else if (label === '三単現') result.thirdPerson = val;
    });
    return result;
  }

  if (parts[0]) result.past = parts[0];
  if (parts[1]) result.pastParticiple = parts[1];
  if (parts[2]) result.ing = parts[2];
  if (parts[3]) result.thirdPerson = parts[3];
  return result;
}

function showIftyEditWordValidation(message) {
  const box = document.getElementById('editWordValidationMessage');
  if (!box) return;
  box.textContent = String(message || '');
  box.style.display = message ? 'block' : 'none';
}

window.saveEditedWord = function(folderId, wordIndex, createNextBlank = false) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder || !folder.words[wordIndex]) return;

  const wordVal = document.getElementById("editWordText").value.trim();
  const languageVal = document.getElementById("editLanguageText")?.value.trim() || '';
  const languageCodeVal = normalizeIftyLanguageCode(document.getElementById("editLanguageCodeText")?.value || '');
  const pronunciationVal = document.getElementById("editPronunciationText").value.trim();
  const partOfSpeechVal = document.getElementById("editPartOfSpeechText").value.trim();
  const usageVal = document.getElementById("editUsageText").value.trim();
  const formsVal = document.getElementById("editFormsText").value.trim();
  const meaningsVal = document.getElementById("editMeaningsText").value.split('\n').map(s => s.trim()).filter(Boolean);
  const examplesRaw = document.getElementById("editExamplesText").value.split('\n').map(s => s.trim()).filter(Boolean);
  const derivativesVal = document.getElementById("editDerivativesText").value.split('\n').map(s => s.trim()).filter(Boolean);
  const detailsVal = document.getElementById("editDetailsText").value.trim();

  if (!wordVal) {
    showIftyEditWordValidation('単語を入力してください。');
    const field = document.getElementById('editWordText');
    if (field) field.focus();
    return;
  }
  showIftyEditWordValidation('');

  const newExamples = examplesRaw.map(line => {
    const separatorIndex = line.indexOf('|');
    if (separatorIndex < 0) return { en: line, ja: '' };
    return {
      en: line.slice(0, separatorIndex).trim(),
      ja: line.slice(separatorIndex + 1).trim()
    };
  });

  // 白紙新規作成では addBlankWordToFolder() の開始時点でUndoを記録済み。
  // 通常編集だけここでUndoを記録する。
  const state = iftyEditWordModalState;
  if (!state || !state.isNewBlank) {
    recordUndoState('単語編集');
  }

  const word = folder.words[wordIndex];
  word.word = wordVal;
  word.language = languageVal || inferIftyLanguageFromText(wordVal).label;
  word.languageCode = languageCodeVal || inferIftyLanguageFromText(wordVal).code;
  word.pronunciation = pronunciationVal;
  word.partOfSpeech = partOfSpeechVal;
  word.meanings = meaningsVal;
  word.examples = newExamples;
  word.derivatives = derivativesVal;
  word.details = detailsVal;
  word.forms = parseIftyEditedForms(formsVal);
  word.quizAnswers = { jp: meaningsVal, en: wordVal ? [wordVal] : [] };

  if (usageVal) {
    const usageParts = usageVal.split('/').map(s => s.trim());
    word.transitivity = usageParts[0] || '';
    word.countability = usageParts[1] || '';
  } else {
    word.transitivity = '';
    word.countability = '';
  }

  if (state) state.saved = true;

  saveUserData();
  renderFolders();
  closeEditWordModal({ keepNewBlank: true });

  if (createNextBlank) {
    setTimeout(() => window.addBlankWordToFolder(folderId), 0);
  }
};

window.closeEditWordModal = function(options = {}) {
  const modal = document.getElementById("editWordModal");
  const state = iftyEditWordModalState;
  const keepNewBlank = !!(options && options.keepNewBlank);

  if (state && state.isNewBlank && !state.saved && !keepNewBlank) {
    const folder = folders.find(f => f.id === state.folderId);
    if (folder && Array.isArray(folder.words)) {
      const index = folder.words.findIndex(word => String(word && word.id || '') === state.wordId);
      if (index >= 0) folder.words.splice(index, 1);
    }

    // 「白紙を開いて閉じただけ」がUndo履歴に残らないようにする。
    if (Number.isInteger(state.undoDepthBefore) && undoStack.length > state.undoDepthBefore) {
      undoStack.splice(state.undoDepthBefore);
      updateUndoRedoButtons();
    }

    saveUserData();
    renderFolders();
  }

  if (modal) modal.style.display = "none";
  iftyEditWordModalState = null;
};

function generateSmartWordData(word) {
  return { meaning: `${word}の意味`, example: `This is an example sentence using ${word}.` };
}

// Web Speech API
window.speakWord = function(text, languageCode = '', languageLabel = '') {
  if (!('speechSynthesis' in window)) return;
  const value = String(text || '').trim();
  if (!value) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(value);
  utterance.lang = getIftySpeechLocale(languageCode, languageLabel, value);
  utterance.rate = utterance.lang.startsWith('ja') ? 0.95 : 1.0;
  window.speechSynthesis.speak(utterance);
};

window.deleteFolder = function(folderId) {
  if (!confirm("このフォルダを削除しますか？")) return;
  recordUndoState('フォルダ削除');
  const removedFolder = folders.find(f => f.id === folderId);
  if (removedFolder) (removedFolder.words || []).forEach(w => selectedWordIds.delete(w.id));
  selectedFolderIds.delete(folderId);
  folders = folders.filter(f => f.id !== folderId);
  clearIftySpellingSuggestion(folderId, { skipRefresh: true });
  saveUserData();
  renderFolders();
};

window.deleteWord = function(folderId, wordIndex) {
  const folder = folders.find(f => f.id === folderId);
  if (folder && folder.words) {
    recordUndoState('単語削除');
    const removed = folder.words[wordIndex];
    if (removed && removed.id) selectedWordIds.delete(removed.id);
    folder.words.splice(wordIndex, 1);
    saveUserData();
    renderFolders();
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==========================================
// 選択・一括操作
// ==========================================
window.toggleFolderSelection = function(folderId, checked) {
  if (checked) selectedFolderIds.add(folderId);
  else selectedFolderIds.delete(folderId);
  renderFolders();
};

window.toggleWordSelection = function(wordId, checked) {
  if (checked) selectedWordIds.add(wordId);
  else selectedWordIds.delete(wordId);
  renderFolders();
};

window.selectAllWords = function() {
  folders.forEach(folder => (folder.words || []).forEach(word => selectedWordIds.add(word.id)));
  renderFolders();
};

window.selectAllWordsInFolder = function(folderId) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;
  const words = folder.words || [];
  const allSelected = words.length > 0 && words.every(w => selectedWordIds.has(w.id));
  words.forEach(word => allSelected ? selectedWordIds.delete(word.id) : selectedWordIds.add(word.id));
  renderFolders();
};

window.clearAllSelections = function() {
  selectedFolderIds.clear();
  selectedWordIds.clear();
  renderFolders();
};

window.bulkDeleteSelectedWords = function() {
  if (selectedWordIds.size === 0) return;
  if (!confirm(`選択した ${selectedWordIds.size} 語をすべて削除しますか？`)) return;
  recordUndoState('選択語の一斉削除');
  folders.forEach(folder => {
    folder.words = (folder.words || []).filter(word => !selectedWordIds.has(word.id));
  });
  selectedWordIds.clear();
  saveUserData();
  renderFolders();
};

window.bulkMoveSelectedWords = function() {
  if (selectedWordIds.size === 0) return;
  const select = document.getElementById('bulkMoveFolderSelect');
  if (!select || !select.value) return;
  const destination = folders.find(f => f.id === select.value);
  if (!destination) return;

  recordUndoState('選択語の一斉移動');
  const moving = [];
  folders.forEach(folder => {
    if (folder.id === destination.id) return;
    const keep = [];
    (folder.words || []).forEach(word => {
      if (selectedWordIds.has(word.id)) moving.push(word);
      else keep.push(word);
    });
    folder.words = keep;
  });

  const existingIds = new Set((destination.words || []).map(w => w.id));
  moving.forEach(word => {
    if (!existingIds.has(word.id)) destination.words.push(word);
  });

  selectedWordIds.clear();
  saveUserData();
  renderFolders();
};

function getWordById(wordId) {
  for (const folder of folders) {
    const word = (folder.words || []).find(w => w.id === wordId);
    if (word) return { word, folder };
  }
  return null;
}

function collectWordIdsFromSelection() {
  const ids = new Set(selectedWordIds);
  folders.forEach(folder => {
    if (selectedFolderIds.has(folder.id)) {
      (folder.words || []).forEach(word => ids.add(word.id));
    }
  });
  return [...ids];
}

// ==========================================
// 実践 / フラッシュカードセット
// ==========================================
function getFlashcardSets() {
  normalizePracticeData();
  return practiceData.modules.flashcards.sets;
}

function getPracticeSet(setId) {
  return getFlashcardSets().find(set => set.id === setId) || null;
}

let iftyUnifiedPracticeSubject = 'ENGLISH';

window.openPracticeHome = function(subject) {
  closeMainLauncher();
  const requested = String(subject || '').trim().toUpperCase();
  if (requested === 'SOCIAL STUDIES') iftyUnifiedPracticeSubject = 'SOCIAL STUDIES';
  else if (requested === 'SCIENCE') iftyUnifiedPracticeSubject = 'SCIENCE';
  else if (requested === 'BASIC SENTENCES') iftyUnifiedPracticeSubject = 'BASIC SENTENCES';
  else if (
    requested === 'ENGLISH' ||
    requested === 'VOCABULARY' ||
    requested === 'FOREIGN LANGUAGES' ||
    requested === 'FOREIGN LANGUAGE'
  ) iftyUnifiedPracticeSubject = 'ENGLISH';
  else if (currentIftySubject === 'SOCIAL STUDIES') iftyUnifiedPracticeSubject = 'SOCIAL STUDIES';
  else if (currentIftySubject === 'SCIENCE') iftyUnifiedPracticeSubject = 'SCIENCE';
  else iftyUnifiedPracticeSubject = 'ENGLISH';
  let modal = document.getElementById('practiceModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'practiceModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;justify-content:center;align-items:center;padding:18px;box-sizing:border-box;z-index:10030;';
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
  renderPracticeHome();
};

window.closePracticeModal = function() {
  const modal = document.getElementById('practiceModal');
  if (modal) modal.style.display = 'none';
};

window.setIftyUnifiedPracticeSubject = function(subject) {
  const value = String(subject || '').toUpperCase();
  iftyUnifiedPracticeSubject = value === 'SOCIAL STUDIES' ? 'SOCIAL STUDIES' : (value === 'SCIENCE' ? 'SCIENCE' : (value === 'BASIC SENTENCES' ? 'BASIC SENTENCES' : 'ENGLISH'));
  renderPracticeHome();
};

function renderPracticeHome() {
  const modal = document.getElementById('practiceModal');
  if (!modal) return;
  if (iftyUnifiedPracticeSubject === 'SOCIAL STUDIES') {
    renderIftyUnifiedSocialPracticeHome(modal);
    return;
  }
  if (iftyUnifiedPracticeSubject === 'SCIENCE') {
    renderIftyUnifiedSciencePracticeHome(modal);
    return;
  }
  if (iftyUnifiedPracticeSubject === 'BASIC SENTENCES') {
    renderIftyBasicSentencePracticeHome(modal);
    return;
  }
  const sets = getFlashcardSets();
  const quizSets = getQuizSets().filter(set => !set.systemReview);
  modal.innerHTML = `
    <div style="background:white;border-radius:14px;width:min(760px,100%);max-height:92vh;overflow:auto;padding:18px;box-shadow:0 15px 45px rgba(0,0,0,.28);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;">
        <div><h2 style="margin:0;color:#0f172a;font-size:1.3em;">⚔️ PRACTICE</h2><div style="color:#64748b;font-size:.85em;margin-top:3px;">教科を切り替えて実践できます。</div></div>
        <button onclick="closePracticeModal()" style="background:none;border:none;font-size:1.4em;color:#64748b;cursor:pointer;">✕</button>
      </div>
      <div style="display:flex;gap:7px;margin-bottom:14px;flex-wrap:wrap;">
        <button type="button" onclick="setIftyUnifiedPracticeSubject('ENGLISH')" style="border:none;background:#0f766e;color:white;border-radius:999px;padding:8px 13px;font-weight:900;cursor:pointer;">VOCABULARY</button>
        <button type="button" onclick="setIftyUnifiedPracticeSubject('SOCIAL STUDIES')" style="border:1px solid #cbd5e1;background:white;color:#334155;border-radius:999px;padding:8px 13px;font-weight:900;cursor:pointer;">SOCIAL STUDIES</button>
        <button type="button" onclick="setIftyUnifiedPracticeSubject('SCIENCE')" style="border:1px solid #cbd5e1;background:white;color:#334155;border-radius:999px;padding:8px 13px;font-weight:900;cursor:pointer;">SCIENCE</button>
        <button type="button" onclick="setIftyUnifiedPracticeSubject('BASIC SENTENCES')" style="border:1px solid #cbd5e1;background:white;color:#334155;border-radius:999px;padding:8px 13px;font-weight:900;cursor:pointer;">BASIC SENTENCES</button>
      </div>

      <div style="border:1px solid #cbd5e1;border-radius:10px;padding:14px;background:#f8fafc;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <div><b style="color:#0f172a;">📇 フラッシュカード</b><div style="font-size:.82em;color:#64748b;margin-top:2px;">セットごとに保存・編集・再開できます</div></div>
          <button onclick="createPracticeFlashcardSet()" style="background:#0284c7;color:white;border:none;border-radius:6px;padding:8px 12px;font-weight:bold;cursor:pointer;">＋ 新規セット</button>
        </div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;">
          ${sets.length ? sets.map(set => `
            <div style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
              <button onclick="openPracticeFlashcardSet('${set.id}')" style="background:none;border:none;padding:0;cursor:pointer;text-align:left;flex:1;min-width:170px;">
                <div style="font-weight:bold;color:#0f172a;">${escapeHtml(set.name)}</div>
                <div style="font-size:.8em;color:#64748b;margin-top:2px;">${set.wordIds.length}語${set.progress ? ` ・ ${set.progress.round || 1}周目を中断中` : ''}</div>
              </button>
              <div style="display:flex;gap:4px;">
                <button onclick="movePracticeSet('${set.id}',-1)" style="border:none;background:#e2e8f0;border-radius:4px;padding:5px;cursor:pointer;">⬆️</button>
                <button onclick="movePracticeSet('${set.id}',1)" style="border:none;background:#e2e8f0;border-radius:4px;padding:5px;cursor:pointer;">⬇️</button>
                <button onclick="duplicatePracticeSet('${set.id}')" style="border:none;background:#e2e8f0;border-radius:4px;padding:5px;cursor:pointer;">複製</button>
                <button onclick="deletePracticeSet('${set.id}')" style="border:none;background:#ef4444;color:white;border-radius:4px;padding:5px 7px;cursor:pointer;">削除</button>
              </div>
            </div>`).join('') : '<div style="color:#94a3b8;text-align:center;padding:16px;">まだセットがありません。</div>'}
        </div>
      </div>

      <div style="border:1px solid #c4b5fd;border-radius:10px;padding:14px;background:#faf5ff;margin-top:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <div><b style="color:#581c87;">❓ クエスチョン</b><div style="font-size:.82em;color:#7e22ce;margin-top:2px;">ALLIA判定の記述式クイズをフォルダごとに作れます</div></div>
          <button onclick="createQuizSet()" style="background:#7c3aed;color:white;border:none;border-radius:6px;padding:8px 12px;font-weight:bold;cursor:pointer;">＋ クイズフォルダ</button>
        </div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;">
          ${quizSets.length ? quizSets.map(set => `
            <div style="background:white;border:1px solid #ddd6fe;border-radius:8px;padding:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
              <button onclick="openQuizSet('${set.id}')" style="background:none;border:none;padding:0;cursor:pointer;text-align:left;flex:1;min-width:170px;">
                <div style="font-weight:bold;color:#4c1d95;">${escapeHtml(set.name)}</div>
                <div style="font-size:.8em;color:#7c3aed;margin-top:2px;">${set.wordIds.length}語 ・ 復習${set.reviewWordIds.length}語${set.progress ? ' ・ 中断中' : ''}</div>
              </button>
              <div style="display:flex;gap:4px;">
                <button onclick="moveQuizSet('${set.id}',-1)" style="border:none;background:#ede9fe;border-radius:4px;padding:5px;cursor:pointer;">⬆️</button>
                <button onclick="moveQuizSet('${set.id}',1)" style="border:none;background:#ede9fe;border-radius:4px;padding:5px;cursor:pointer;">⬇️</button>
                <button onclick="duplicateQuizSet('${set.id}')" style="border:none;background:#ede9fe;border-radius:4px;padding:5px;cursor:pointer;">複製</button>
                <button onclick="deleteQuizSet('${set.id}')" style="border:none;background:#ef4444;color:white;border-radius:4px;padding:5px 7px;cursor:pointer;">削除</button>
              </div>
            </div>`).join('') : '<div style="color:#a78bfa;text-align:center;padding:16px;">まだクイズフォルダがありません。</div>'}
        </div>
      </div>
    </div>`;
}

function renderIftyUnifiedSocialPracticeHome(modal) {
  ensureIftySocialPracticeFolderSelection();
  const foldersWithItems = getIftySocialPracticeFolders();
  const selectedFolders = getIftySocialPracticeSelectedFolders();
  const selectedItems = getIftySocialPracticeItems();
  const imageItems = getIftySocialPracticeImageItems();
  const selectedSubjects = [...new Set(selectedFolders.flatMap(folder => normalizeIftySocialSubjects(folder.subjects)))].map(getIftySocialSubjectLabel);

  const folderChoices = foldersWithItems.length
    ? foldersWithItems.map(folder => {
        const checked = iftySocialPracticeSelectedFolderIds.has(String(folder.id));
        return `<label style="display:flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid ${checked ? '#38bdf8' : '#cbd5e1'};border-radius:9px;background:${checked ? '#f0f9ff' : '#fff'};cursor:pointer;min-width:0;">
          <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleIftySocialPracticeFolder('${folder.id}',this.checked)">
          <span style="font-weight:900;color:#0f172a;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(folder.name)}</span>
          <span style="font-size:.72em;color:#64748b;white-space:nowrap;">${folder.items.length}件</span>
        </label>`;
      }).join('')
    : '<div style="color:#94a3b8;padding:10px 0;">項目のある社会フォルダがありません。</div>';

  const modeCard = mode => {
    const meta = getIftySocialPracticeModeMeta(mode);
    let disabledReason = '';
    if (mode === 'image' && imageItems.length < 2) disabledReason = '画像付き項目が2件以上必要です。';
    else if (mode === 'simple' && selectedItems.length < 2) disabledReason = '項目が2件以上必要です。';
    else if (!selectedItems.length) disabledReason = '学習する項目を選択してください。';
    const disabled = !!disabledReason;
    return `<button type="button" onclick="closePracticeModal();startIftySocialPractice('${mode}')" ${disabled ? 'disabled' : ''} style="text-align:left;border:1px solid ${disabled ? '#e2e8f0' : meta.color};background:${disabled ? '#f8fafc' : '#fff'};border-radius:12px;padding:12px;cursor:${disabled ? 'not-allowed' : 'pointer'};min-height:112px;opacity:${disabled ? '.62' : '1'};">
      <div style="font-size:1.04em;font-weight:900;color:${disabled ? '#94a3b8' : meta.color};">${escapeHtml(meta.title)}</div>
      <div style="margin-top:6px;color:#475569;font-size:.82em;line-height:1.5;">${escapeHtml(meta.description)}</div>
      ${disabledReason ? `<div style="margin-top:7px;font-size:.7em;color:#94a3b8;font-weight:800;">${escapeHtml(disabledReason)}</div>` : ''}
    </button>`;
  };

  modal.innerHTML = `
    <div style="background:white;border-radius:14px;width:min(820px,100%);max-height:92vh;overflow:auto;padding:18px;box-shadow:0 15px 45px rgba(0,0,0,.28);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;">
        <div><h2 style="margin:0;color:#0f172a;font-size:1.3em;">⚔️ PRACTICE</h2><div style="color:#64748b;font-size:.85em;margin-top:3px;">教科を切り替えて実践できます。</div></div>
        <button onclick="closePracticeModal()" style="background:none;border:none;font-size:1.4em;color:#64748b;cursor:pointer;">✕</button>
      </div>
      <div style="display:flex;gap:7px;margin-bottom:14px;flex-wrap:wrap;">
        <button type="button" onclick="setIftyUnifiedPracticeSubject('ENGLISH')" style="border:1px solid #cbd5e1;background:white;color:#334155;border-radius:999px;padding:8px 13px;font-weight:900;cursor:pointer;">VOCABULARY</button>
        <button type="button" onclick="setIftyUnifiedPracticeSubject('SOCIAL STUDIES')" style="border:none;background:#0f766e;color:white;border-radius:999px;padding:8px 13px;font-weight:900;cursor:pointer;">SOCIAL STUDIES</button>
        <button type="button" onclick="setIftyUnifiedPracticeSubject('SCIENCE')" style="border:1px solid #cbd5e1;background:white;color:#334155;border-radius:999px;padding:8px 13px;font-weight:900;cursor:pointer;">SCIENCE</button>
        <button type="button" onclick="setIftyUnifiedPracticeSubject('BASIC SENTENCES')" style="border:1px solid #cbd5e1;background:white;color:#334155;border-radius:999px;padding:8px 13px;font-weight:900;cursor:pointer;">BASIC SENTENCES</button>
      </div>

      <div style="padding:13px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
          <div>
            <div style="font-weight:900;color:#0f172a;">出題するフォルダ</div>
            <div style="font-size:.76em;color:#64748b;margin-top:3px;">選択 ${selectedFolders.length}フォルダ / ${selectedItems.length}項目${selectedSubjects.length ? ` ・ ${escapeHtml(selectedSubjects.join('・'))}` : ''}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" onclick="selectAllIftySocialPracticeFolders(true)" style="border:none;background:#e0f2fe;color:#075985;border-radius:7px;padding:7px 9px;font-weight:900;cursor:pointer;">すべて</button>
            <button type="button" onclick="selectAllIftySocialPracticeFolders(false)" style="border:none;background:#e2e8f0;color:#475569;border-radius:7px;padding:7px 9px;font-weight:900;cursor:pointer;">解除</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:7px;margin-top:10px;">${folderChoices}</div>
      </div>

      <div style="margin-top:12px;padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;display:flex;align-items:center;gap:9px;flex-wrap:wrap;">
        <strong style="color:#334155;">問題数</strong>
        <select onchange="setIftySocialPracticeQuestionCount(this.value)" style="padding:8px 10px;border:1px solid #94a3b8;border-radius:7px;background:white;font-size:1em;">
          <option value="5" ${iftySocialPracticeQuestionCount === 5 ? 'selected' : ''}>5問</option>
          <option value="10" ${iftySocialPracticeQuestionCount === 10 ? 'selected' : ''}>10問</option>
        </select>
        <span style="font-size:.74em;color:#64748b;">時代・並べ替え・説明は開始時にALLIAが問題を作ります。</span>
      </div>

      <div style="margin-top:14px;padding:13px;border:1px solid #99f6e4;border-radius:11px;background:#f0fdfa;">
        <div style="font-size:1.04em;font-weight:900;color:#0f766e;">📇 フラッシュカード</div>
        <div style="margin-top:5px;color:#475569;font-size:.82em;line-height:1.5;">VOCABULARYと同じカードUIで、用語⇄説明を確認します。選択中の社会フォルダだけが対象です。</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
          <button type="button" onclick="startIftySocialFlashcards('front',true)" ${selectedItems.length ? '' : 'disabled'} style="border:none;background:#0f766e;color:white;border-radius:7px;padding:9px 12px;font-weight:900;cursor:${selectedItems.length ? 'pointer' : 'not-allowed'};opacity:${selectedItems.length ? '1' : '.55'};">用語 → 説明</button>
          <button type="button" onclick="startIftySocialFlashcards('back',true)" ${selectedItems.length ? '' : 'disabled'} style="border:none;background:#115e59;color:white;border-radius:7px;padding:9px 12px;font-weight:900;cursor:${selectedItems.length ? 'pointer' : 'not-allowed'};opacity:${selectedItems.length ? '1' : '.55'};">説明 → 用語</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:14px;">
        ${modeCard('simple')}
        ${modeCard('era')}
        ${modeCard('order')}
        ${modeCard('explanation')}
        ${modeCard('image')}
      </div>
    </div>`;
}


function renderIftyUnifiedSciencePracticeHome(modal) {
  ensureIftySciencePracticeFolderSelection();
  const foldersWithItems = getIftySciencePracticeFolders();
  const selectedFolders = getIftySciencePracticeSelectedFolders();
  const selectedItems = getIftySciencePracticeItems();
  const imageItems = getIftySciencePracticeImageItems();
  const selectedSubjects = [...new Set(selectedFolders.flatMap(folder => normalizeIftyScienceSubjects(folder.subjects)))].map(getIftyScienceSubjectLabel);

  const folderChoices = foldersWithItems.length
    ? foldersWithItems.map(folder => {
        const checked = iftySciencePracticeSelectedFolderIds.has(String(folder.id));
        return `<label style="display:flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid ${checked ? '#38bdf8' : '#cbd5e1'};border-radius:9px;background:${checked ? '#f0f9ff' : '#fff'};cursor:pointer;min-width:0;">
          <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleIftySciencePracticeFolder('${folder.id}',this.checked)">
          <span style="font-weight:900;color:#0f172a;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(folder.name)}</span>
          <span style="font-size:.72em;color:#64748b;white-space:nowrap;">${folder.items.length}件</span>
        </label>`;
      }).join('')
    : '<div style="color:#94a3b8;padding:10px 0;">項目のある理科フォルダがありません。</div>';

  const modeCard = mode => {
    const meta = getIftySciencePracticeModeMeta(mode);
    let disabledReason = '';
    if (mode === 'image' && imageItems.length < 2) disabledReason = '画像付き項目が2件以上必要です。';
    else if (mode === 'simple' && selectedItems.length < 2) disabledReason = '項目が2件以上必要です。';
    else if (!selectedItems.length) disabledReason = '学習する項目を選択してください。';
    const disabled = !!disabledReason;
    return `<button type="button" onclick="closePracticeModal();startIftySciencePractice('${mode}')" ${disabled ? 'disabled' : ''} style="text-align:left;border:1px solid ${disabled ? '#e2e8f0' : meta.color};background:${disabled ? '#f8fafc' : '#fff'};border-radius:12px;padding:12px;cursor:${disabled ? 'not-allowed' : 'pointer'};min-height:112px;opacity:${disabled ? '.62' : '1'};">
      <div style="font-size:1.04em;font-weight:900;color:${disabled ? '#94a3b8' : meta.color};">${escapeHtml(meta.title)}</div>
      <div style="margin-top:6px;color:#475569;font-size:.82em;line-height:1.5;">${escapeHtml(meta.description)}</div>
      ${disabledReason ? `<div style="margin-top:7px;font-size:.7em;color:#94a3b8;font-weight:800;">${escapeHtml(disabledReason)}</div>` : ''}
    </button>`;
  };

  modal.innerHTML = `
    <div style="background:white;border-radius:14px;width:min(820px,100%);max-height:92vh;overflow:auto;padding:18px;box-shadow:0 15px 45px rgba(0,0,0,.28);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;">
        <div><h2 style="margin:0;color:#0f172a;font-size:1.3em;">⚔️ PRACTICE</h2><div style="color:#64748b;font-size:.85em;margin-top:3px;">教科を切り替えて実践できます。</div></div>
        <button onclick="closePracticeModal()" style="background:none;border:none;font-size:1.4em;color:#64748b;cursor:pointer;">✕</button>
      </div>
      <div style="display:flex;gap:7px;margin-bottom:14px;flex-wrap:wrap;">
        <button type="button" onclick="setIftyUnifiedPracticeSubject('ENGLISH')" style="border:1px solid #cbd5e1;background:white;color:#334155;border-radius:999px;padding:8px 13px;font-weight:900;cursor:pointer;">VOCABULARY</button>
        <button type="button" onclick="setIftyUnifiedPracticeSubject('SOCIAL STUDIES')" style="border:1px solid #cbd5e1;background:white;color:#334155;border-radius:999px;padding:8px 13px;font-weight:900;cursor:pointer;">SOCIAL STUDIES</button>
        <button type="button" onclick="setIftyUnifiedPracticeSubject('SCIENCE')" style="border:none;background:#0f766e;color:white;border-radius:999px;padding:8px 13px;font-weight:900;cursor:pointer;">SCIENCE</button>
        <button type="button" onclick="setIftyUnifiedPracticeSubject('BASIC SENTENCES')" style="border:1px solid #cbd5e1;background:white;color:#334155;border-radius:999px;padding:8px 13px;font-weight:900;cursor:pointer;">BASIC SENTENCES</button>
      </div>

      <div style="padding:13px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
          <div>
            <div style="font-weight:900;color:#0f172a;">出題するフォルダ</div>
            <div style="font-size:.76em;color:#64748b;margin-top:3px;">選択 ${selectedFolders.length}フォルダ / ${selectedItems.length}項目${selectedSubjects.length ? ` ・ ${escapeHtml(selectedSubjects.join('・'))}` : ''}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" onclick="selectAllIftySciencePracticeFolders(true)" style="border:none;background:#e0f2fe;color:#075985;border-radius:7px;padding:7px 9px;font-weight:900;cursor:pointer;">すべて</button>
            <button type="button" onclick="selectAllIftySciencePracticeFolders(false)" style="border:none;background:#e2e8f0;color:#475569;border-radius:7px;padding:7px 9px;font-weight:900;cursor:pointer;">解除</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:7px;margin-top:10px;">${folderChoices}</div>
      </div>

      <div style="margin-top:12px;padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;display:flex;align-items:center;gap:9px;flex-wrap:wrap;">
        <strong style="color:#334155;">問題数</strong>
        <select onchange="setIftySciencePracticeQuestionCount(this.value)" style="padding:8px 10px;border:1px solid #94a3b8;border-radius:7px;background:white;font-size:1em;">
          <option value="5" ${iftySciencePracticeQuestionCount === 5 ? 'selected' : ''}>5問</option>
          <option value="10" ${iftySciencePracticeQuestionCount === 10 ? 'selected' : ''}>10問</option>
        </select>
        <span style="font-size:.74em;color:#64748b;">公式・単位・並べ替え・説明は開始時にALLIAが問題を作ります。</span>
      </div>

      <div style="margin-top:14px;padding:13px;border:1px solid #99f6e4;border-radius:11px;background:#f0fdfa;">
        <div style="font-size:1.04em;font-weight:900;color:#0f766e;">📇 フラッシュカード</div>
        <div style="margin-top:5px;color:#475569;font-size:.82em;line-height:1.5;">VOCABULARYと同じカードUIで、用語⇄説明を確認します。選択中の理科フォルダだけが対象です。</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
          <button type="button" onclick="startIftyScienceFlashcards('front',true)" ${selectedItems.length ? '' : 'disabled'} style="border:none;background:#0f766e;color:white;border-radius:7px;padding:9px 12px;font-weight:900;cursor:${selectedItems.length ? 'pointer' : 'not-allowed'};opacity:${selectedItems.length ? '1' : '.55'};">用語 → 説明</button>
          <button type="button" onclick="startIftyScienceFlashcards('back',true)" ${selectedItems.length ? '' : 'disabled'} style="border:none;background:#115e59;color:white;border-radius:7px;padding:9px 12px;font-weight:900;cursor:${selectedItems.length ? 'pointer' : 'not-allowed'};opacity:${selectedItems.length ? '1' : '.55'};">説明 → 用語</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:14px;">
        ${modeCard('simple')}
        ${modeCard('formula')}
        ${modeCard('order')}
        ${modeCard('explanation')}
        ${modeCard('image')}
      </div>
    </div>`;
}


function openPracticeNamePrompt(title, defaultValue, onConfirm) {
  let modal = document.getElementById('practiceNameModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'practiceNameModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.48);display:flex;justify-content:center;align-items:center;padding:18px;z-index:10060;';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div style="background:white;width:min(420px,100%);border-radius:12px;padding:18px;box-shadow:0 15px 40px rgba(0,0,0,.28);">
      <h3 style="margin:0 0 10px;color:#0f172a;">${escapeHtml(title)}</h3>
      <input id="practiceNameInput" value="${escapeHtml(defaultValue)}" style="width:100%;box-sizing:border-box;padding:10px;border:2px solid #93c5fd;border-radius:7px;font-size:1em;">
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
        <button id="practiceNameCancel" style="border:none;background:#e2e8f0;color:#334155;border-radius:6px;padding:8px 12px;cursor:pointer;">キャンセル</button>
        <button id="practiceNameConfirm" style="border:none;background:#0284c7;color:white;border-radius:6px;padding:8px 12px;font-weight:bold;cursor:pointer;">作成</button>
      </div>
    </div>`;
  modal.style.display = 'flex';
  const input = document.getElementById('practiceNameInput');
  const cancel = document.getElementById('practiceNameCancel');
  const confirmBtn = document.getElementById('practiceNameConfirm');
  const finish = () => {
    const value = input ? input.value.trim() : '';
    if (!value) return;
    modal.style.display = 'none';
    onConfirm(value);
  };
  if (cancel) cancel.onclick = () => { modal.style.display = 'none'; };
  if (confirmBtn) confirmBtn.onclick = finish;
  if (input) {
    input.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); finish(); } };
    setTimeout(() => { input.focus(); input.select(); }, 30);
  }
}

window.createPracticeFlashcardSet = function() {
  openPracticeNamePrompt('フラッシュカードセット名を入力してください。', '新しいフラッシュカード', name => {
    recordUndoState('フラッシュカードセット作成');
    const set = { id: makeId('flashset'), name, wordIds: [], random: true, direction: 'front', progress: null };
    getFlashcardSets().push(set);
    savePracticeData();
    openPracticeFlashcardSet(set.id);
  });
};
window.renamePracticeSet = function(setId) {
  const set = getPracticeSet(setId); if (!set) return;
  const name = prompt('新しいセット名', set.name);
  if (!name || !name.trim()) return;
  recordUndoState('フラッシュカードセット名変更');
  set.name = name.trim(); savePracticeData(); openPracticeFlashcardSet(setId);
};

window.movePracticeSet = function(setId, direction) {
  const sets = getFlashcardSets();
  const i = sets.findIndex(s => s.id === setId); const ni = i + direction;
  if (i < 0 || ni < 0 || ni >= sets.length) return;
  recordUndoState('フラッシュカードセット移動');
  [sets[i], sets[ni]] = [sets[ni], sets[i]];
  savePracticeData(); renderPracticeHome();
};

window.duplicatePracticeSet = function(setId) {
  const set = getPracticeSet(setId); if (!set) return;
  recordUndoState('フラッシュカードセット複製');
  getFlashcardSets().push({ ...JSON.parse(JSON.stringify(set)), id: makeId('flashset'), name: set.name + ' コピー', progress: null });
  savePracticeData(); renderPracticeHome();
};

window.deletePracticeSet = function(setId) {
  const set = getPracticeSet(setId); if (!set) return;
  if (!confirm(`「${set.name}」を削除しますか？`)) return;
  recordUndoState('フラッシュカードセット削除');
  practiceData.modules.flashcards.sets = getFlashcardSets().filter(s => s.id !== setId);
  savePracticeData(); renderPracticeHome();
};

window.openPracticeFlashcardSet = function(setId) {
  currentPracticeSetId = setId;
  const set = getPracticeSet(setId); if (!set) return;
  const modal = document.getElementById('practiceModal'); if (!modal) return;
  const available = set.wordIds.map(id => getWordById(id)).filter(Boolean);
  modal.innerHTML = `
    <div style="background:white;border-radius:14px;width:min(820px,100%);max-height:92vh;overflow:auto;padding:18px;box-shadow:0 15px 45px rgba(0,0,0,.28);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <button onclick="renderPracticeHome()" style="border:none;background:#e2e8f0;color:#334155;border-radius:6px;padding:7px 10px;cursor:pointer;">◀ 戻る</button>
        <button onclick="closePracticeModal()" style="background:none;border:none;font-size:1.4em;color:#64748b;cursor:pointer;">✕</button>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px;">
        <div><h2 style="margin:0;color:#0f172a;font-size:1.25em;">📇 ${escapeHtml(set.name)}</h2><div style="font-size:.82em;color:#64748b;margin-top:3px;">${available.length}語</div></div>
        <button onclick="renamePracticeSet('${set.id}')" style="border:none;background:#e2e8f0;border-radius:6px;padding:7px 10px;cursor:pointer;">名前変更</button>
      </div>
      <div style="margin-top:14px;padding:12px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;">
        <b style="color:#334155;">単語を追加</b>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
          <button onclick="addSelectedWordsToPracticeSet('${set.id}')" style="border:none;background:#0284c7;color:white;border-radius:5px;padding:7px 9px;cursor:pointer;">チェックしたフォルダ・語彙から追加</button>
          <select id="practiceFolderSource" style="padding:7px;border:1px solid #cbd5e1;border-radius:5px;">${folders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('')}</select>
          <button onclick="addFolderWordsToPracticeSet('${set.id}')" style="border:none;background:#334155;color:white;border-radius:5px;padding:7px 9px;cursor:pointer;">選択フォルダから追加</button>
          <button onclick="addAllWordsToPracticeSet('${set.id}')" style="border:none;background:#334155;color:white;border-radius:5px;padding:7px 9px;cursor:pointer;">全語彙を追加</button>
          <button onclick="clearPracticeSetWords('${set.id}')" style="border:none;background:#f59e0b;color:white;border-radius:5px;padding:7px 9px;cursor:pointer;">セットを空にする</button>
        </div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <label style="display:flex;align-items:center;gap:5px;color:#334155;"><input type="checkbox" ${set.random ? 'checked' : ''} onchange="setPracticeRandom('${set.id}',this.checked)"> ランダム順</label>
        <select onchange="setPracticeDirection('${set.id}',this.value)" style="padding:7px;border:1px solid #cbd5e1;border-radius:5px;">
          <option value="front" ${set.direction==='front'?'selected':''}>単語 → 意味</option>
          <option value="back" ${set.direction==='back'?'selected':''}>意味 → 単語</option>
        </select>
        <button onclick="startPracticeSet('${set.id}', false)" ${available.length ? '' : 'disabled'} style="background:#10b981;color:white;border:none;border-radius:6px;padding:8px 12px;font-weight:bold;cursor:${available.length?'pointer':'default'};opacity:${available.length?'1':'.45'};">▶ ${set.progress ? '続きから' : '開始'}</button>
        <button onclick="startPracticeSet('${set.id}', true)" ${available.length ? '' : 'disabled'} style="background:#ef4444;color:white;border:none;border-radius:6px;padding:8px 12px;font-weight:bold;cursor:${available.length?'pointer':'default'};opacity:${available.length?'1':'.45'};">↻ 最初から</button>
      </div>
      <div style="margin-top:14px;border-top:1px solid #e2e8f0;padding-top:10px;max-height:38vh;overflow:auto;">
        ${available.length ? available.map(({word}) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:7px 2px;border-bottom:1px solid #f1f5f9;"><span><b>${escapeHtml(word.word)}</b>　<span style="color:#64748b;font-size:.88em;">${escapeHtml((word.meanings||[]).join(' / '))}</span></span><button onclick="removeWordFromPracticeSet('${set.id}','${word.id}')" style="border:none;background:none;color:#ef4444;cursor:pointer;">削除</button></div>`).join('') : '<div style="color:#94a3b8;text-align:center;padding:16px;">単語を追加してください。</div>'}
      </div>
    </div>`;
}

function uniqueExistingWordIds(ids) {
  const out = [];
  const seen = new Set();
  ids.forEach(id => { if (!seen.has(id) && getWordById(id)) { seen.add(id); out.push(id); } });
  return out;
}

function addIdsToSet(set, ids) {
  recordUndoState('フラッシュカードへ単語追加');
  set.wordIds = uniqueExistingWordIds([...(set.wordIds || []), ...ids]);
  set.progress = null;
  savePracticeData();
  openPracticeFlashcardSet(set.id);
}

window.addSelectedWordsToPracticeSet = function(setId) { const set=getPracticeSet(setId); if(set) addIdsToSet(set, collectWordIdsFromSelection()); };
window.addFolderWordsToPracticeSet = function(setId) { const set=getPracticeSet(setId); const sel=document.getElementById('practiceFolderSource'); const f=folders.find(x=>sel&&x.id===sel.value); if(set&&f) addIdsToSet(set,(f.words||[]).map(w=>w.id)); };
window.addAllWordsToPracticeSet = function(setId) { const set=getPracticeSet(setId); if(set) addIdsToSet(set,folders.flatMap(f=>(f.words||[]).map(w=>w.id))); };
window.removeWordFromPracticeSet = function(setId,wordId) { const set=getPracticeSet(setId); if(!set)return; recordUndoState('フラッシュカードから単語削除'); set.wordIds=(set.wordIds||[]).filter(id=>id!==wordId); set.progress=null; savePracticeData(); openPracticeFlashcardSet(setId); };
window.clearPracticeSetWords = function(setId) { const set=getPracticeSet(setId); if(!set)return; if(!confirm('このセットの単語をすべて外しますか？'))return; recordUndoState('フラッシュカードを空にする'); set.wordIds=[]; set.progress=null; savePracticeData(); openPracticeFlashcardSet(setId); };
window.setPracticeRandom = function(setId,val) { const set=getPracticeSet(setId); if(set){ recordUndoState('フラッシュカード設定変更'); set.random=!!val; set.progress=null; savePracticeData(); } };
window.setPracticeDirection = function(setId,val) { const set=getPracticeSet(setId); if(set){ recordUndoState('フラッシュカード設定変更'); set.direction=val; set.progress=null; savePracticeData(); } };

function shuffleArray(arr) {
  const copy=[...arr]; for(let i=copy.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [copy[i],copy[j]]=[copy[j],copy[i]]; } return copy;
}

window.startPracticeSet = function(setId, restart=false) {
  const set=getPracticeSet(setId); if(!set)return;
  const validIds=uniqueExistingWordIds(set.wordIds||[]); if(!validIds.length){ alert('このセットに利用できる単語がありません。'); return; }
  if(restart || !set.progress){
    set.progress={ round:1, queue:set.random?shuffleArray(validIds):[...validIds], index:0, missed:[], showingBack:false };
  } else {
    set.progress.queue=uniqueExistingWordIds(set.progress.queue||[]);
    set.progress.missed=uniqueExistingWordIds(set.progress.missed||[]);
    if(set.progress.index>=set.progress.queue.length) set.progress.index=0;
  }
  savePracticeData(); renderPracticePlayer(setId);
};

function renderPracticePlayer(setId) {
  const set=getPracticeSet(setId); if(!set||!set.progress)return;
  const modal=document.getElementById('practiceModal'); if(!modal)return;
  const p=set.progress;
  if(p.index>=p.queue.length){
    if(p.missed.length){
      p.round += 1; p.queue=set.random?shuffleArray(uniqueExistingWordIds(p.missed)):uniqueExistingWordIds(p.missed); p.missed=[]; p.index=0; p.showingBack=false; savePracticeData();
    } else {
      set.progress=null; savePracticeData();
      modal.innerHTML=`<div style="background:white;border-radius:14px;width:min(520px,100%);padding:26px;text-align:center;"><h2 style="color:#0f172a;margin-top:0;">🎉 完了</h2><p style="color:#475569;">「${escapeHtml(set.name)}」をすべて覚えました。</p><div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;"><button onclick="startPracticeSet('${set.id}',true)" style="background:#0284c7;color:white;border:none;border-radius:6px;padding:9px 12px;cursor:pointer;">最初から</button><button onclick="openPracticeFlashcardSet('${set.id}')" style="background:#e2e8f0;color:#334155;border:none;border-radius:6px;padding:9px 12px;cursor:pointer;">セットへ戻る</button></div></div>`;
      return;
    }
  }
  const ref=getWordById(p.queue[p.index]); if(!ref){ p.index++; savePracticeData(); renderPracticePlayer(setId); return; }
  const word=ref.word;
  const meaning=escapeHtml((word.meanings||[]).join('<br>'));
  const front=set.direction==='front' ? escapeHtml(word.word) : escapeHtml((word.meanings||[]).join(' / '));
  const back=set.direction==='front' ? escapeHtml((word.meanings||[]).join(' / ')) : escapeHtml(word.word);
  modal.innerHTML=`
    <div style="background:white;border-radius:14px;width:min(620px,100%);padding:20px;box-shadow:0 15px 45px rgba(0,0,0,.28);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><div style="color:#64748b;font-size:.88em;">${escapeHtml(set.name)} ・ ${p.round}周目 ・ ${p.index+1}/${p.queue.length}</div><button onclick="pausePracticeSet('${set.id}')" style="background:#e2e8f0;color:#334155;border:none;border-radius:6px;padding:7px 10px;cursor:pointer;">⏸ 一時中断</button></div>
      <button onclick="togglePracticeCard('${set.id}')" style="width:100%;min-height:210px;margin-top:16px;background:#f8fafc;border:2px solid #cbd5e1;border-radius:12px;padding:24px;cursor:pointer;color:#0f172a;font-size:1.5em;font-weight:bold;white-space:pre-wrap;">${p.showingBack?back:front}<div style="margin-top:14px;font-size:.5em;color:#94a3b8;font-weight:normal;">タップして裏返す</div></button>
      <div style="display:flex;gap:10px;margin-top:14px;"><button onclick="answerPracticeCard('${set.id}',false)" style="flex:1;background:#ef4444;color:white;border:none;border-radius:7px;padding:12px;font-weight:bold;cursor:pointer;">覚えてない</button><button onclick="answerPracticeCard('${set.id}',true)" style="flex:1;background:#10b981;color:white;border:none;border-radius:7px;padding:12px;font-weight:bold;cursor:pointer;">覚えた</button></div>
      <div style="display:flex;justify-content:center;margin-top:10px;"><button onclick="restartPracticeConfirm('${set.id}')" style="background:none;border:none;color:#64748b;cursor:pointer;">↻ 最初からやり直す</button></div>
    </div>`;
}

window.togglePracticeCard = function(setId) { const set=getPracticeSet(setId); if(!set||!set.progress)return; set.progress.showingBack=!set.progress.showingBack; savePracticeData(); renderPracticePlayer(setId); };
window.answerPracticeCard = function(setId, remembered) {
  const set=getPracticeSet(setId); if(!set||!set.progress)return;
  const p=set.progress; const id=p.queue[p.index];
  if(!remembered && !p.missed.includes(id)) p.missed.push(id);
  const sourceWord = getIftyReviewWordById(id);
  if (sourceWord) sourceWord.mastery = remembered ? 'fixed' : 'unfixed';
  recordIftyStudyEvent(id, !!remembered, 'practice_flashcard');
  enrollIftyReviewFromStudy(id, !!remembered);
  saveUserData();
  p.index++; p.showingBack=false; savePracticeData(); renderPracticePlayer(setId);
};
window.pausePracticeSet = function(setId) { savePracticeData(); openPracticeFlashcardSet(setId); };
window.restartPracticeConfirm = function(setId) { if(confirm('このセットを最初からやり直しますか？')) startPracticeSet(setId,true); };


// ==========================================
// 実践 / クエスチョン
// ==========================================
function getQuizSets() {
  normalizePracticeData();
  return practiceData.modules.questions.sets;
}

function getQuizSet(setId) {
  return getQuizSets().find(set => set.id === setId) || null;
}

function getEnabledQuizTypes(set) {
  return Object.entries(set.types || {}).filter(([, enabled]) => enabled).map(([key]) => key);
}

function quizTypeLabel(type) {
  return ({
    simple: 'シンプル',
    selection: '選択',
    written: '記述',
    example: '例文',
    knowledge: '知識',
    composition: '作文',
    translation: '和訳',
    listening: 'リスニング',
    usage_cloze: '語法穴埋め',
    synonym_choice: '類義語選別'
  })[type] || type;
}

function quizDirectionLabel(mode) {
  return ({ jp_to_en: '意味→語彙', en_to_jp: '語彙→意味', mixed: '混合' })[mode] || mode;
}

window.createQuizSet = function() {
  openPracticeNamePrompt('クイズフォルダ名を入力してください。', '新しいクイズフォルダ', name => {
    recordUndoState('クイズフォルダ作成');
    const set = {
      id: makeId('quizset'),
      name,
      wordIds: [],
      directionMode: 'mixed',
      types: { simple: true, selection: false, written: false, example: false, knowledge: false, composition: false, translation: false, listening: false, usage_cloze: false, synonym_choice: false },
      random: true,
      progress: null,
      reviewWordIds: [],
      mistakeCounts: {}
    };
    getQuizSets().push(set);
    savePracticeData();
    openQuizSet(set.id);
  });
};

window.renameQuizSet = function(setId) {
  const set = getQuizSet(setId); if (!set) return;
  openPracticeNamePrompt('クイズフォルダ名を変更', set.name, name => {
    recordUndoState('クイズフォルダ名変更');
    set.name = name;
    savePracticeData();
    openQuizSet(setId);
  });
};

window.moveQuizSet = function(setId, direction) {
  const sets = getQuizSets();
  const i = sets.findIndex(s => s.id === setId); const ni = i + direction;
  if (i < 0 || ni < 0 || ni >= sets.length) return;
  recordUndoState('クイズフォルダ移動');
  [sets[i], sets[ni]] = [sets[ni], sets[i]];
  savePracticeData(); renderPracticeHome();
};

window.duplicateQuizSet = function(setId) {
  const set = getQuizSet(setId); if (!set) return;
  recordUndoState('クイズフォルダ複製');
  const copy = JSON.parse(JSON.stringify(set));
  copy.id = makeId('quizset');
  copy.name = set.name + ' コピー';
  copy.progress = null;
  getQuizSets().push(copy);
  savePracticeData(); renderPracticeHome();
};

window.deleteQuizSet = function(setId) {
  const set = getQuizSet(setId); if (!set) return;
  if (!confirm(`「${set.name}」を削除しますか？`)) return;
  recordUndoState('クイズフォルダ削除');
  practiceData.modules.questions.sets = getQuizSets().filter(s => s.id !== setId);
  savePracticeData(); renderPracticeHome();
};

window.openQuizSet = function(setId) {
  currentQuizSetId = setId;
  const set = getQuizSet(setId); if (!set) return;
  const modal = document.getElementById('practiceModal'); if (!modal) return;
  const available = set.wordIds.map(id => getWordById(id)).filter(Boolean);
  const typeCards = [
    ['simple','シンプル','意味→語彙 / 語彙→意味を記述し、ALLIAが判定'],
    ['selection','選択','同じクイズフォルダの他の単語から4択を作成。生成・採点ともALLIA不使用'],
    ['written','記述','見出し語・意味を記述。複数の意味や表現をALLIAが判定'],
    ['example','例文','学習言語の文脈穴埋め、または日本語の意味から語を答える'],
    ['knowledge','知識','類義語・対義語・前置詞・語法・ニュアンスなどから出題'],
    ['composition','作文','お題の語彙を使った短い文を書く'],
    ['translation','和訳','例文を日本語で訳す。意味→語彙設定では逆向きの作文にも対応'],
    ['listening','リスニング','見出し語をその言語の発音で再生し、①語を4択 ②意味を4択 ③表記記述 の3形式をランダム出題。生成・採点ともALLIA不使用'],
    ['usage_cloze','語法穴埋め','前置詞・語形・コロケーション・定型表現の穴埋め'],
    ['synonym_choice','類義語選別','似た語の中から文脈・ニュアンスに最も合う語を選ぶ']
  ];
  modal.innerHTML = `
    <div style="background:white;border-radius:14px;width:min(880px,100%);max-height:92vh;overflow:auto;padding:18px;box-shadow:0 15px 45px rgba(0,0,0,.28);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <button onclick="renderPracticeHome()" style="border:none;background:#ede9fe;color:#5b21b6;border-radius:6px;padding:7px 10px;cursor:pointer;">◀ 戻る</button>
        <button onclick="closePracticeModal()" style="background:none;border:none;font-size:1.4em;color:#64748b;cursor:pointer;">✕</button>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px;">
        <div><h2 style="margin:0;color:#4c1d95;font-size:1.25em;">❓ ${escapeHtml(set.name)}</h2><div style="font-size:.82em;color:#7c3aed;margin-top:3px;">${available.length}語 ・ 復習対象 ${set.reviewWordIds.length}語</div></div>
        <button onclick="renameQuizSet('${set.id}')" style="border:none;background:#ede9fe;color:#5b21b6;border-radius:6px;padding:7px 10px;cursor:pointer;">名前変更</button>
      </div>

      <div style="margin-top:14px;padding:12px;background:#faf5ff;border:1px solid #ddd6fe;border-radius:8px;">
        <b style="color:#581c87;">1. 出題方向</b>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:8px;">
          ${[
            ['jp_to_en','意味→語彙','#0ea5e9'],
            ['en_to_jp','語彙→意味','#10b981'],
            ['mixed','混合','#8b5cf6']
          ].map(([value,label,color]) => `<label style="display:flex;align-items:center;justify-content:center;gap:6px;padding:9px 6px;border-radius:8px;border:2px solid ${set.directionMode===value?color:'#e2e8f0'};background:${set.directionMode===value?color+'18':'white'};color:${set.directionMode===value?color:'#475569'};font-weight:bold;cursor:pointer;"><input type="radio" name="quizDirection_${set.id}" value="${value}" ${set.directionMode===value?'checked':''} onchange="setQuizDirection('${set.id}',this.value)" style="accent-color:${color};">${label}</label>`).join('')}
        </div>
      </div>

      <div style="margin-top:12px;padding:12px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;">
        <b style="color:#334155;">2. クイズ形式（複数選択可）</b>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;margin-top:9px;">
          ${typeCards.map(([key,label,desc]) => `<label style="display:flex;gap:8px;align-items:flex-start;border:1px solid ${set.types[key]?'#a78bfa':'#e2e8f0'};background:${set.types[key]?'#f5f3ff':'white'};border-radius:8px;padding:9px;cursor:pointer;"><input type="checkbox" ${set.types[key]?'checked':''} onchange="setQuizType('${set.id}','${key}',this.checked)" style="width:18px;height:18px;accent-color:#7c3aed;flex:none;margin-top:2px;"><span><b style="color:#4c1d95;">${label}</b><div style="font-size:.78em;color:#64748b;margin-top:2px;line-height:1.35;">${desc}</div></span></label>`).join('')}
        </div>
      </div>

      <div style="margin-top:12px;padding:12px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;">
        <b style="color:#334155;">3. 語彙を追加</b>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
          <button onclick="addSelectedWordsToQuizSet('${set.id}')" style="border:none;background:#7c3aed;color:white;border-radius:5px;padding:7px 9px;cursor:pointer;">チェックしたフォルダ・語彙から追加</button>
          <select id="quizFolderSource" style="padding:7px;border:1px solid #cbd5e1;border-radius:5px;">${folders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('')}</select>
          <button onclick="addFolderWordsToQuizSet('${set.id}')" style="border:none;background:#5b21b6;color:white;border-radius:5px;padding:7px 9px;cursor:pointer;">選択フォルダから追加</button>
          <button onclick="addAllWordsToQuizSet('${set.id}')" style="border:none;background:#5b21b6;color:white;border-radius:5px;padding:7px 9px;cursor:pointer;">全語彙を追加</button>
          <button onclick="clearQuizSetWords('${set.id}')" style="border:none;background:#f59e0b;color:white;border-radius:5px;padding:7px 9px;cursor:pointer;">フォルダを空にする</button>
        </div>
      </div>

      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <label style="display:flex;align-items:center;gap:5px;color:#334155;"><input type="checkbox" ${set.random?'checked':''} onchange="setQuizRandom('${set.id}',this.checked)"> ランダム順</label>
        <button onclick="startQuizSet('${set.id}',false,false)" ${available.length?'':'disabled'} style="background:#7c3aed;color:white;border:none;border-radius:6px;padding:8px 12px;font-weight:bold;cursor:${available.length?'pointer':'default'};opacity:${available.length?'1':'.45'};">▶ ${set.progress ? '続きから' : '開始'}</button>
        <button onclick="startQuizSet('${set.id}',true,false)" ${available.length?'':'disabled'} style="background:#5b21b6;color:white;border:none;border-radius:6px;padding:8px 12px;font-weight:bold;cursor:${available.length?'pointer':'default'};opacity:${available.length?'1':'.45'};">↻ 最初から</button>
        <button onclick="startQuizSet('${set.id}',true,true)" ${set.reviewWordIds.length?'':'disabled'} style="background:#ea580c;color:white;border:none;border-radius:6px;padding:8px 12px;font-weight:bold;cursor:${set.reviewWordIds.length?'pointer':'default'};opacity:${set.reviewWordIds.length?'1':'.45'};">🔥 間違いだけ復習 (${set.reviewWordIds.length})</button>
        ${set.reviewWordIds.length ? `<button onclick="clearQuizReview('${set.id}')" style="background:#e2e8f0;color:#475569;border:none;border-radius:6px;padding:8px 10px;cursor:pointer;">復習記録を消す</button>` : ''}
      </div>

      <div style="margin-top:14px;border-top:1px solid #e2e8f0;padding-top:10px;max-height:32vh;overflow:auto;">
        ${available.length ? available.map(({word}) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:7px 2px;border-bottom:1px solid #f1f5f9;"><span><b>${escapeHtml(word.word)}</b>　<span style="color:#64748b;font-size:.88em;">${escapeHtml((word.meanings||[]).join(' / '))}</span>${set.reviewWordIds.includes(word.id)?'<span style="margin-left:6px;color:#ea580c;font-size:.78em;font-weight:bold;">復習</span>':''}</span><button onclick="removeWordFromQuizSet('${set.id}','${word.id}')" style="border:none;background:none;color:#ef4444;cursor:pointer;">削除</button></div>`).join('') : '<div style="color:#94a3b8;text-align:center;padding:16px;">単語を追加してください。</div>'}
      </div>
    </div>`;
};

window.setQuizDirection = function(setId, value) {
  const set=getQuizSet(setId); if(!set)return;
  if(['jp_to_en','en_to_jp','mixed'].includes(value)) { recordUndoState('クイズ設定変更'); set.directionMode=value; }
  set.progress=null; savePracticeData(); openQuizSet(setId);
};

window.setQuizType = function(setId, type, checked) {
  const set=getQuizSet(setId); if(!set || !(type in set.types))return;
  recordUndoState('クイズ形式変更');
  set.types[type]=!!checked;
  if(!Object.values(set.types).some(Boolean)) {
    set.types[type]=true;
    alert('クイズ形式は最低1つ選んでください。');
  }
  set.progress=null; savePracticeData(); openQuizSet(setId);
};

window.setQuizRandom = function(setId, value) { const set=getQuizSet(setId); if(set){ recordUndoState('クイズ設定変更'); set.random=!!value; set.progress=null; savePracticeData(); } };

function addIdsToQuizSet(set, ids) {
  recordUndoState('クイズへ単語追加');
  set.wordIds=uniqueExistingWordIds([...(set.wordIds||[]),...ids]);
  set.progress=null; savePracticeData(); openQuizSet(set.id);
}
window.addSelectedWordsToQuizSet = function(setId){ const set=getQuizSet(setId); if(set)addIdsToQuizSet(set,collectWordIdsFromSelection()); };
window.addFolderWordsToQuizSet = function(setId){ const set=getQuizSet(setId); const sel=document.getElementById('quizFolderSource'); const f=folders.find(x=>sel&&x.id===sel.value); if(set&&f)addIdsToQuizSet(set,(f.words||[]).map(w=>w.id)); };
window.addAllWordsToQuizSet = function(setId){ const set=getQuizSet(setId); if(set)addIdsToQuizSet(set,folders.flatMap(f=>(f.words||[]).map(w=>w.id))); };
window.removeWordFromQuizSet = function(setId,wordId){ const set=getQuizSet(setId); if(!set)return; recordUndoState('クイズから単語削除'); set.wordIds=(set.wordIds||[]).filter(id=>id!==wordId); set.reviewWordIds=(set.reviewWordIds||[]).filter(id=>id!==wordId); delete set.mistakeCounts[wordId]; set.progress=null; savePracticeData(); openQuizSet(setId); };
window.clearQuizSetWords = function(setId){ const set=getQuizSet(setId); if(!set)return; if(!confirm('このクイズフォルダの単語をすべて外しますか？'))return; recordUndoState('クイズフォルダを空にする'); set.wordIds=[]; set.reviewWordIds=[]; set.mistakeCounts={}; set.progress=null; savePracticeData(); openQuizSet(setId); };
window.clearQuizReview = function(setId){ const set=getQuizSet(setId); if(!set)return; if(!confirm('間違い・復習記録を消しますか？'))return; recordUndoState('クイズ復習記録削除'); set.reviewWordIds=[]; set.mistakeCounts={}; savePracticeData(); openQuizSet(setId); };

function resolveQuizDirection(set) {
  if(set.directionMode==='mixed') return Math.random()<0.5 ? 'jp_to_en' : 'en_to_jp';
  return set.directionMode;
}

function chooseQuizType(set) {
  const types=getEnabledQuizTypes(set);
  return types[Math.floor(Math.random()*types.length)] || 'simple';
}

window.startQuizSet = function(setId, restart=false, reviewOnly=false) {
  const set=getQuizSet(setId); if(!set)return;
  let validIds=uniqueExistingWordIds(reviewOnly ? (set.reviewWordIds||[]) : (set.wordIds||[]));
  if(!validIds.length){ alert(reviewOnly?'復習対象の単語がありません。':'このクイズフォルダに利用できる単語がありません。'); return; }
  if(restart || !set.progress || !!set.progress.reviewOnly!==!!reviewOnly){
    set.progress={ queue:set.random?shuffleArray(validIds):[...validIds], index:0, reviewOnly:!!reviewOnly, currentQuestion:null, correctCount:0, wrongCount:0 };
  } else {
    set.progress.queue=uniqueExistingWordIds(set.progress.queue||[]);
    if(set.progress.index>=set.progress.queue.length) set.progress.index=0;
  }
  savePracticeData(); renderQuizPlayer(setId);
};

async function renderQuizPlayer(setId) {
  const set=getQuizSet(setId); if(!set||!set.progress)return;
  const modal=document.getElementById('practiceModal'); if(!modal)return;
  const p=set.progress;
  if(p.index>=p.queue.length){ renderQuizComplete(setId); return; }
  const ref=getWordById(p.queue[p.index]);
  if(!ref){ p.index++; p.currentQuestion=null; savePracticeData(); renderQuizPlayer(setId); return; }

  if(!p.currentQuestion){
    modal.innerHTML=`<div style="background:white;border-radius:14px;width:min(620px,100%);padding:28px;text-align:center;"><div style="font-size:2em;">❓</div><h3 style="color:#4c1d95;">問題を準備中…</h3><div style="color:#64748b;">${p.index+1}/${p.queue.length}</div></div>`;
    try {
      const type=chooseQuizType(set);
      const direction=resolveQuizDirection(set);
      if (!['selection','listening'].includes(type) && !ensureIftyOnline('このクイズ形式の問題生成', { silent: true })) {
        throw new Error(iftyOfflineMessage('このクイズ形式の問題生成'));
      }
      if (type === 'selection') {
        const data = createLocalSelectionQuestion(set, ref.word, direction);
        p.currentQuestion={...data,quizType:type,direction,wordId:ref.word.id};
      } else if (type === 'listening') {
        const data = createLocalListeningQuestion(set, ref.word);
        p.currentQuestion={...data,quizType:type,direction:'listening',wordId:ref.word.id};
      } else {
        const candidateWords=shuffleArray((set.wordIds||[]).filter(id=>id!==ref.word.id)).slice(0,8).map(id=>{const x=getWordById(id);return x?x.word:null;}).filter(Boolean);
        const response=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'question_generate',quizType:type,direction,word:ref.word,candidateWords,subject:'ENGLISH',order:getIftySubjectOrder('ENGLISH')})});
        const data=await response.json();
        if(!response.ok) throw alliaHttpError(response, data, '問題生成に失敗しました。');
        p.currentQuestion={...data,quizType:type,direction,wordId:ref.word.id};
      }
      savePracticeData();
    } catch(error){
      modal.innerHTML=`<div style="background:white;border-radius:14px;width:min(620px,100%);padding:24px;text-align:center;"><h3 style="color:#ef4444;">問題生成に失敗しました</h3><p style="color:#64748b;">${escapeHtml(String(error.message||error))}</p><button onclick="retryCurrentQuizQuestion('${set.id}')" style="background:#7c3aed;color:white;border:none;border-radius:6px;padding:9px 12px;cursor:pointer;">再試行</button><button onclick="openQuizSet('${set.id}')" style="margin-left:8px;background:#e2e8f0;border:none;border-radius:6px;padding:9px 12px;cursor:pointer;">戻る</button></div>`;
      return;
    }
  }

  const q=p.currentQuestion;
  modal.innerHTML=`
    <div tabindex="0" onkeydown="handleIftyQuizKeydown(event,'${set.id}')" style="background:white;border-radius:14px;width:min(700px,100%);padding:20px;box-shadow:0 15px 45px rgba(0,0,0,.28);outline:none;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><div style="color:#7c3aed;font-size:.88em;font-weight:bold;">${escapeHtml(set.name)} ・ ${p.index+1}/${p.queue.length} ・ ${quizTypeLabel(q.quizType)}${q.quizType==='listening'?'':` ・ ${quizDirectionLabel(q.direction==='jp_to_en'?'jp_to_en':'en_to_jp')}`}</div><button onclick="pauseQuizSet('${set.id}')" style="background:#ede9fe;color:#5b21b6;border:none;border-radius:6px;padding:7px 10px;cursor:pointer;">${set.systemReview?'✕ 終了':'⏸ 一時中断'}</button></div>
      <div style="margin-top:15px;padding:18px;background:#faf5ff;border:2px solid #ddd6fe;border-radius:10px;color:#2e1065;line-height:1.65;font-size:1.08em;white-space:pre-wrap;">${escapeHtml(q.question||'')}</div>
      ${q.audioText?`<div style="margin-top:10px;display:flex;justify-content:center;gap:6px;align-items:center;flex-wrap:wrap;"><button onclick="speakQuizAudio('${set.id}')" style="background:#0ea5e9;color:white;border:none;border-radius:8px;padding:10px 16px;font-weight:bold;cursor:pointer;">🔊 音声を再生</button><span style="font-size:.72em;color:#64748b;font-weight:800;">速度</span>${[0.75,0.9,1].map(rate=>`<button type="button" onclick="setIftyListeningRate(${rate}); speakQuizAudio('${set.id}')" style="border:1px solid ${iftyListeningRate===rate?'#0284c7':'#cbd5e1'};background:${iftyListeningRate===rate?'#e0f2fe':'white'};color:#0369a1;border-radius:6px;padding:6px 8px;font-size:.76em;cursor:pointer;">${rate}×</button>`).join('')}</div>`:''}
      ${q.instruction?`<div style="margin-top:7px;color:#64748b;font-size:.82em;">${escapeHtml(q.instruction)}</div>`:''}
      ${Array.isArray(q.options)&&q.options.length?`<div id="quizChoiceArea" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-top:12px;">${q.options.map((option,i)=>`<label style="display:flex;gap:8px;align-items:center;border:2px solid #ddd6fe;background:white;border-radius:8px;padding:10px;cursor:pointer;"><input type="radio" name="quizChoice" value="${escapeHtml(option)}" onkeydown="if(event.key==='Enter'){event.preventDefault();submitQuizAnswer('${set.id}');}" style="accent-color:#7c3aed;"><span>${String.fromCharCode(65+i)}. ${escapeHtml(option)}</span></label>`).join('')}</div>`:(q.localAnswerMode==='spelling'?`<input id="quizAnswerInput" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="スペルを入力してEnter" onkeydown="if(event.key==='Enter'){event.preventDefault();submitQuizAnswer('${set.id}');}" style="width:100%;box-sizing:border-box;margin-top:12px;padding:11px;border:2px solid #c4b5fd;border-radius:8px;font-size:1.05em;">`:`<textarea id="quizAnswerInput" rows="4" placeholder="答えを入力（Enterで確定 / Shift+Enterで改行）" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submitQuizAnswer('${set.id}');}" style="width:100%;box-sizing:border-box;margin-top:12px;padding:11px;border:2px solid #c4b5fd;border-radius:8px;font-size:1em;resize:vertical;"></textarea>`)}
      <div style="display:flex;gap:8px;margin-top:10px;"><button onclick="submitQuizAnswer('${set.id}')" style="flex:1;background:#7c3aed;color:white;border:none;border-radius:7px;padding:11px;font-weight:bold;cursor:pointer;">${q.localGrade?'端末内で判定':(Array.isArray(q.options)&&q.options.length?'回答する':'ALLIAに判定してもらう')}</button><button onclick="skipQuizQuestion('${set.id}')" style="background:#e2e8f0;color:#475569;border:none;border-radius:7px;padding:11px;cursor:pointer;">スキップ</button></div>
      <div style="margin-top:9px;color:#94a3b8;font-size:.78em;text-align:center;">「選択」と「リスニング」は端末内で問題生成・採点するためALLIAを使いません。リスニングは各語彙の言語に合った音声で見出し語を再生し、語彙4択・意味4択・表記記述の3形式をランダム出題します。4択は A〜D / 1〜4、Enterで判定、リスニング中はRで再生できます。その他の記述回答はALLIAが表記ゆれ・複数の意味・自然さを含めて判定します。</div>
    </div>`;
  const input=document.getElementById('quizAnswerInput');
  if(input) setTimeout(()=>input.focus(),30);
  else setTimeout(()=>{ const panel=modal.querySelector('[tabindex="0"]'); if(panel) panel.focus(); },30);
  if(q.audioText)setTimeout(()=>window.speakQuizAudio(set.id),180);
}

window.retryCurrentQuizQuestion = function(setId){ const set=getQuizSet(setId); if(!set||!set.progress)return; set.progress.currentQuestion=null; savePracticeData(); renderQuizPlayer(setId); };
window.setIftyListeningRate = function(rate) {
  const value = Number(rate);
  if (![0.75, 0.9, 1].includes(value)) return;
  iftyListeningRate = value;
  localStorage.setItem(IFTY_LISTENING_RATE_KEY, String(value));
};
window.speakQuizAudio = function(setId){ const set=getQuizSet(setId); const q=set&&set.progress&&set.progress.currentQuestion; if(!q||!q.audioText||!('speechSynthesis' in window))return; window.speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(q.audioText); u.lang=getIftySpeechLocale(q.audioLang||'', '', q.audioText); u.rate=u.lang.startsWith('ja')?0.95:iftyListeningRate; window.speechSynthesis.speak(u); };
window.handleIftyQuizKeydown = function(event, setId) {
  const target = event && event.target;
  const tag = target && target.tagName ? String(target.tagName).toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || (target && target.isContentEditable)) return;
  const key = String(event.key || '').toLowerCase();
  const radios = Array.from(document.querySelectorAll('input[name="quizChoice"]'));
  const map = { '1':0, 'a':0, '2':1, 'b':1, '3':2, 'c':2, '4':3, 'd':3 };
  if (Object.prototype.hasOwnProperty.call(map, key) && radios[map[key]]) {
    event.preventDefault();
    radios[map[key]].checked = true;
    radios[map[key]].focus();
    return;
  }
  if (key === 'enter') { event.preventDefault(); submitQuizAnswer(setId); }
  if (key === 'r') { event.preventDefault(); speakQuizAudio(setId); }
};
window.pauseQuizSet = function(setId){ const set=getQuizSet(setId); savePracticeData(); if(set&&set.systemReview){ closePracticeModal(); renderFolders(); return; } openQuizSet(setId); };
window.skipQuizQuestion = function(setId){ const set=getQuizSet(setId); if(!set||!set.progress)return; set.progress.index++; set.progress.currentQuestion=null; savePracticeData(); renderQuizPlayer(setId); };

window.submitQuizAnswer = async function(setId) {
  const set=getQuizSet(setId); if(!set||!set.progress||!set.progress.currentQuestion)return;
  const p=set.progress, q=p.currentQuestion;
  const input=document.getElementById('quizAnswerInput');
  const checked=document.querySelector('input[name="quizChoice"]:checked');
  const answer=checked?String(checked.value||'').trim():(input?input.value.trim():'');
  if(!answer){ alert(Array.isArray(q.options)&&q.options.length?'選択肢を1つ選んでください。':'答えを入力してください。'); return; }
  const ref=getWordById(q.wordId); if(!ref)return;
  const modal=document.getElementById('practiceModal'); if(!modal)return;

  if (q.localGrade) {
    const data = gradeLocalSelectionAnswer(q, answer);
    const correct = data.correct === true;
    const reviewStateBefore = set.systemReview ? snapshotIftyReviewState(q.wordId) : null;
    const wasInReviewBefore=(set.reviewWordIds||[]).includes(q.wordId);
    const previousMistakeCount=Number(set.mistakeCounts[q.wordId])||0;
    if(correct){
      p.correctCount=(p.correctCount||0)+1;
      if(p.reviewOnly) set.reviewWordIds=(set.reviewWordIds||[]).filter(id=>id!==q.wordId);
    }else{
      p.wrongCount=(p.wrongCount||0)+1;
      if(!set.reviewWordIds.includes(q.wordId))set.reviewWordIds.push(q.wordId);
      set.mistakeCounts[q.wordId]=previousMistakeCount+1;
    }
    p.lastGrade={
      wordId:q.wordId,
      userAnswer:answer,
      correct,
      firstFeedback:data.feedback||'',
      firstModelAnswer:data.modelAnswer||q.referenceAnswer||'',
      wasInReviewBefore,
      previousMistakeCount,
      localGrade:true,
      challenged:false,
      reviewStateBefore
    };
    if (set.systemReview) {
      applyIftyReviewResult(q.wordId, correct);
      recordIftyStudyEvent(q.wordId, correct, 'review_quiz');
    } else {
      recordIftyStudyEvent(q.wordId, correct, q.quizType === 'listening' ? 'listening_quiz' : 'quiz');
      enrollIftyReviewFromStudy(q.wordId, correct);
    }
    saveUserData();
    savePracticeData();
    renderQuizFeedback(setId, correct, data.feedback||'', data.modelAnswer||q.referenceAnswer||'', answer);
    return;
  }

  if (!ensureIftyOnline('ALLIA採点')) return;

  modal.innerHTML=`<div style="background:white;border-radius:14px;width:min(620px,100%);padding:28px;text-align:center;"><h3 style="color:#4c1d95;">ALLIAが採点中…</h3></div>`;
  try{
    const response=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'question_grade',quizType:q.quizType,direction:q.direction,question:q.question,referenceAnswer:q.referenceAnswer||'',userAnswer:answer,word:ref.word,subject:'ENGLISH',order:getIftySubjectOrder('ENGLISH')})});
    const data=await response.json();
    if(!response.ok)throw alliaHttpError(response, data, '採点に失敗しました。');
    const correct=data.correct===true;
    const reviewStateBefore = set.systemReview ? snapshotIftyReviewState(q.wordId) : null;
    const wasInReviewBefore=(set.reviewWordIds||[]).includes(q.wordId);
    const previousMistakeCount=Number(set.mistakeCounts[q.wordId])||0;
    if(correct){
      p.correctCount=(p.correctCount||0)+1;
      if(p.reviewOnly) set.reviewWordIds=(set.reviewWordIds||[]).filter(id=>id!==q.wordId);
    }else{
      p.wrongCount=(p.wrongCount||0)+1;
      if(!set.reviewWordIds.includes(q.wordId))set.reviewWordIds.push(q.wordId);
      set.mistakeCounts[q.wordId]=previousMistakeCount+1;
    }
    p.lastGrade={
      wordId:q.wordId,
      userAnswer:answer,
      correct,
      firstFeedback:data.feedback||'',
      firstModelAnswer:data.modelAnswer||q.referenceAnswer||'',
      wasInReviewBefore,
      previousMistakeCount,
      localGrade:false,
      challenged:false,
      reviewStateBefore
    };
    if (set.systemReview) {
      applyIftyReviewResult(q.wordId, correct);
      recordIftyStudyEvent(q.wordId, correct, 'review_quiz');
    } else {
      recordIftyStudyEvent(q.wordId, correct, q.quizType === 'listening' ? 'listening_quiz' : 'quiz');
      enrollIftyReviewFromStudy(q.wordId, correct);
    }
    saveUserData();
    savePracticeData();
    renderQuizFeedback(setId, correct, data.feedback||'', data.modelAnswer||q.referenceAnswer||'', answer);
  }catch(error){
    modal.innerHTML=`<div style="background:white;border-radius:14px;width:min(620px,100%);padding:24px;text-align:center;"><h3 style="color:#ef4444;">採点に失敗しました</h3><p style="color:#64748b;">${escapeHtml(String(error.message||error))}</p><button onclick="renderQuizPlayer('${set.id}')" style="background:#7c3aed;color:white;border:none;border-radius:6px;padding:9px 12px;cursor:pointer;">問題に戻る</button></div>`;
  }
};

function renderQuizFeedback(setId, correct, feedback, modelAnswer, userAnswer) {
  const set=getQuizSet(setId); if(!set||!set.progress)return;
  const p=set.progress;
  const q=p.currentQuestion;
  const last=p.lastGrade||null;
  const canChallenge=!correct && q && !q.localGrade && last && last.wordId===q.wordId && last.localGrade!==true && last.challenged!==true;
  const modal=document.getElementById('practiceModal'); if(!modal)return;
  modal.innerHTML=`
    <div style="background:white;border-radius:14px;width:min(650px,100%);padding:22px;box-shadow:0 15px 45px rgba(0,0,0,.28);">
      <h2 style="margin-top:0;color:${correct?'#059669':'#dc2626'};">${correct?'⭕ 正解':'❌ 不正解'}</h2>
      <div style="padding:10px;background:#f8fafc;border-radius:8px;color:#334155;"><b>あなたの回答：</b>${escapeHtml(userAnswer)}</div>
      ${modelAnswer?`<div style="padding:10px;background:#f5f3ff;border-radius:8px;color:#4c1d95;margin-top:8px;"><b>基準・模範：</b>${escapeHtml(modelAnswer)}</div>`:''}
      <div style="margin-top:10px;line-height:1.55;color:#475569;white-space:pre-wrap;">${escapeHtml(feedback)}</div>
      ${!correct?'<div style="margin-top:10px;color:#ea580c;font-size:.85em;font-weight:bold;">この単語は自動で「間違いだけ復習」に追加されました。</div>':''}
      ${canChallenge?`
        <div style="margin-top:14px;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:9px;">
          <div style="font-weight:bold;color:#92400e;">⚖️ ALLIAの判定に異議がある場合</div>
          <textarea id="quizChallengeReason" rows="3" placeholder="Challengeの理由を入力（例：この訳も文脈上成立する、この用法も辞書的に正しい、など）" style="width:100%;box-sizing:border-box;margin-top:8px;padding:10px;border:1px solid #f59e0b;border-radius:7px;font-size:.95em;resize:vertical;"></textarea>
          <button onclick="submitQuizChallenge('${set.id}')" style="width:100%;margin-top:8px;background:#d97706;color:white;border:none;border-radius:7px;padding:10px;font-weight:bold;cursor:pointer;">⚖️ Challenge</button>
        </div>`:''}
      <button onclick="nextQuizQuestion('${set.id}')" style="width:100%;margin-top:14px;background:#7c3aed;color:white;border:none;border-radius:7px;padding:11px;font-weight:bold;cursor:pointer;">次へ</button>
    </div>`;
}

window.submitQuizChallenge = async function(setId) {
  const set=getQuizSet(setId); if(!set||!set.progress||!set.progress.currentQuestion)return;
  const p=set.progress, q=p.currentQuestion, last=p.lastGrade;
  if(!last || last.wordId!==q.wordId || last.correct===true || last.localGrade===true || last.challenged===true)return;
  const ref=getWordById(q.wordId); if(!ref)return;
  const reasonInput=document.getElementById('quizChallengeReason');
  const challengeReason=reasonInput?String(reasonInput.value||'').trim():'';
  const modal=document.getElementById('practiceModal'); if(!modal)return;
  if (!ensureIftyOnline('Challenge再審査')) return;

  modal.innerHTML=`<div style="background:white;border-radius:14px;width:min(620px,100%);padding:28px;text-align:center;"><h3 style="color:#92400e;">⚖️ ALLIAがChallengeを再審査中…</h3><div style="color:#64748b;margin-top:6px;">最初の採点とは別に、元の回答をもう一度検討します。</div></div>`;
  try{
    const response=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      type:'question_challenge',
      quizType:q.quizType,
      direction:q.direction,
      question:q.question,
      referenceAnswer:q.referenceAnswer||'',
      userAnswer:last.userAnswer||'',
      word:ref.word,
      firstFeedback:last.firstFeedback||'',
      firstModelAnswer:last.firstModelAnswer||q.referenceAnswer||'',
      challengeReason,
      subject:'ENGLISH',
      order:getIftySubjectOrder('ENGLISH')
    })});
    const data=await response.json();
    if(!response.ok)throw alliaHttpError(response, data, 'Challengeの再審査に失敗しました。');

    const accepted=data.challengeAccepted===true || data.correct===true;
    last.challenged=true;
    last.challengeAccepted=accepted;
    last.challengeReason=challengeReason;
    last.challengeFeedback=data.feedback||'';

    if(accepted){
      p.wrongCount=Math.max(0,(Number(p.wrongCount)||0)-1);
      p.correctCount=(Number(p.correctCount)||0)+1;

      if (set.systemReview) {
        restoreIftyReviewState(q.wordId, last.reviewStateBefore || null);
        applyIftyReviewResult(q.wordId, true);
      }
      correctIftyLastStudyOutcome(q.wordId);
      saveUserData();

      if(last.wasInReviewBefore){
        if(!set.reviewWordIds.includes(q.wordId))set.reviewWordIds.push(q.wordId);
      }else{
        set.reviewWordIds=(set.reviewWordIds||[]).filter(id=>id!==q.wordId);
      }

      const previous=Number(last.previousMistakeCount)||0;
      if(previous>0) set.mistakeCounts[q.wordId]=previous;
      else delete set.mistakeCounts[q.wordId];
    }

    savePracticeData();
    renderQuizChallengeResult(setId, accepted, data.feedback||'', data.modelAnswer||last.firstModelAnswer||q.referenceAnswer||'', last.userAnswer||'', challengeReason);
  }catch(error){
    renderQuizFeedback(setId, false, last.firstFeedback||'', last.firstModelAnswer||q.referenceAnswer||'', last.userAnswer||'');
    setTimeout(()=>alert(String(error.message||error)),20);
  }
};

function renderQuizChallengeResult(setId, accepted, feedback, modelAnswer, userAnswer, challengeReason) {
  const set=getQuizSet(setId); if(!set||!set.progress)return;
  const modal=document.getElementById('practiceModal'); if(!modal)return;
  modal.innerHTML=`
    <div style="background:white;border-radius:14px;width:min(650px,100%);padding:22px;box-shadow:0 15px 45px rgba(0,0,0,.28);">
      <h2 style="margin-top:0;color:${accepted?'#059669':'#dc2626'};">${accepted?'⚖️ Challenge成立':'⚖️ Challenge却下'}</h2>
      <div style="padding:10px;background:#f8fafc;border-radius:8px;color:#334155;"><b>元の回答：</b>${escapeHtml(userAnswer)}</div>
      ${challengeReason?`<div style="padding:10px;background:#fffbeb;border-radius:8px;color:#92400e;margin-top:8px;"><b>Challenge理由：</b>${escapeHtml(challengeReason)}</div>`:''}
      ${modelAnswer?`<div style="padding:10px;background:#f5f3ff;border-radius:8px;color:#4c1d95;margin-top:8px;"><b>基準・模範：</b>${escapeHtml(modelAnswer)}</div>`:''}
      <div style="margin-top:10px;line-height:1.55;color:#475569;white-space:pre-wrap;">${escapeHtml(feedback)}</div>
      ${accepted?'<div style="margin-top:10px;color:#059669;font-size:.88em;font-weight:bold;">元の不正解記録を取り消し、この回答を正解として反映しました。</div>':'<div style="margin-top:10px;color:#dc2626;font-size:.88em;font-weight:bold;">元の不正解判定と復習記録を維持します。</div>'}
      <button onclick="nextQuizQuestion('${set.id}')" style="width:100%;margin-top:14px;background:#7c3aed;color:white;border:none;border-radius:7px;padding:11px;font-weight:bold;cursor:pointer;">次へ</button>
    </div>`;
}

window.nextQuizQuestion = function(setId){ const set=getQuizSet(setId); if(!set||!set.progress)return; set.progress.index++; set.progress.currentQuestion=null; savePracticeData(); renderQuizPlayer(setId); };

function renderQuizComplete(setId) {
  const set=getQuizSet(setId); if(!set||!set.progress)return;
  const p=set.progress;
  const modal=document.getElementById('practiceModal'); if(!modal)return;
  const correct=p.correctCount||0, wrong=p.wrongCount||0;

  if (set.systemReview) {
    set.progress=null;
    savePracticeData();
    renderFolders();
    const remaining = getIftyReviewEntries({ dueOnly: true }).length;
    modal.innerHTML=`<div style="background:white;border-radius:14px;width:min(560px,100%);padding:26px;text-align:center;"><h2 style="color:#4c1d95;margin-top:0;">🎉 今日の復習クイズ完了</h2><p style="color:#475569;">正解 ${correct} / 不正解 ${wrong}</p><p style="color:#c2410c;font-weight:bold;">今日まだ復習できる単語：${remaining}語</p><div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;">${remaining?'<button onclick="startIftyDueReviewQuiz()" style="background:#7c3aed;color:white;border:none;border-radius:6px;padding:9px 12px;cursor:pointer;">残りを続ける</button>':''}<button onclick="closePracticeModal(); renderFolders();" style="background:#e2e8f0;color:#334155;border:none;border-radius:6px;padding:9px 12px;cursor:pointer;">復習フォルダへ戻る</button></div></div>`;
    return;
  }

  set.progress=null; savePracticeData();
  modal.innerHTML=`<div style="background:white;border-radius:14px;width:min(560px,100%);padding:26px;text-align:center;"><h2 style="color:#4c1d95;margin-top:0;">🎉 クイズ完了</h2><p style="color:#475569;">正解 ${correct} / 不正解 ${wrong}</p><p style="color:#ea580c;font-weight:bold;">復習対象：${set.reviewWordIds.length}語</p><div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;"><button onclick="startQuizSet('${set.id}',true,false)" style="background:#7c3aed;color:white;border:none;border-radius:6px;padding:9px 12px;cursor:pointer;">最初から</button><button onclick="startQuizSet('${set.id}',true,true)" ${set.reviewWordIds.length?'':'disabled'} style="background:#ea580c;color:white;border:none;border-radius:6px;padding:9px 12px;cursor:pointer;opacity:${set.reviewWordIds.length?'1':'.45'};">間違いだけ復習</button><button onclick="openQuizSet('${set.id}')" style="background:#e2e8f0;color:#334155;border:none;border-radius:6px;padding:9px 12px;cursor:pointer;">設定へ戻る</button></div></div>`;
}

// 5. メイン機能ランチャー・画面切り替え
window.toggleViewMode = function() {
  if (currentView === 'chat') {
    switchToVocabView();
    return;
  }

  openMainLauncher();
};

window.openMainLauncher = function() {
  let modal = document.getElementById("mainLauncherModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "mainLauncherModal";
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.38);
      display: flex;
      justify-content: flex-end;
      align-items: flex-end;
      padding: 100px 28px 92px 28px;
      box-sizing: border-box;
      z-index: 10020;
    `;

    modal.addEventListener("click", function(event) {
      if (event.target === modal) {
        closeMainLauncher();
      }
    });

    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div
      onclick="event.stopPropagation()"
      style="
        width: min(300px, calc(100vw - 40px));
        background: white;
        border-radius: 16px;
        padding: 12px;
        box-shadow: 0 12px 35px rgba(15,23,42,0.24);
        border: 1px solid #e2e8f0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      "
    >
      <button
        onclick="closeMainLauncher(); switchToChatView();"
        style="
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border: none;
          border-radius: 10px;
          background: #0284c7;
          color: white;
          cursor: pointer;
          font-size: 1em;
          font-weight: bold;
          text-align: left;
        "
      >
        <span style="font-size: 1.3em;">🤖</span>
        <span>ALLIAを開く</span>
      </button>

      <button
        onclick="closeMainLauncher(); openPracticeHome();"
        style="
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border: none;
          border-radius: 10px;
          background: #7c3aed;
          color: white;
          cursor: pointer;
          font-size: 1em;
          font-weight: bold;
          text-align: left;
        "
      >
        <span style="font-size: 1.3em;">⚔️</span>
        <span>実践</span>
      </button>
    </div>
  `;

  modal.style.display = "flex";
};

window.closeMainLauncher = function() {
  const modal = document.getElementById("mainLauncherModal");
  if (modal) modal.style.display = "none";
};

window.switchToChatView = function() {
  currentView = 'chat';
  iftyPortalPage = 'chat';
  hideIftyHubPage();

  const vocabPage = document.getElementById("vocabPage");
  const aiChatPage = document.getElementById("aiChatPage");
  const btn = document.getElementById("floatingAiBtn");

  if (vocabPage) vocabPage.style.display = "none";
  if (aiChatPage) aiChatPage.style.display = "flex";
  if (btn) btn.textContent = "📚";

  closeMainLauncher();
  applyAlliaBranding();

  const chatInput = document.getElementById("chatInput");
  if (chatInput) {
    const currentValue = String(chatInput.value || "").trim();
    if (currentValue === "ALLIA" || /^grok$/i.test(currentValue)) {
      chatInput.value = "";
    }
  }

  closeMenuModal();
};

window.switchToVocabView = function() {
  currentIftySubject = 'ENGLISH';
  currentView = 'vocab';
  iftyPortalPage = 'vocab';
  hideIftyHubPage();

  const vocabPage = document.getElementById("vocabPage");
  const aiChatPage = document.getElementById("aiChatPage");
  const btn = document.getElementById("floatingAiBtn");

  if (vocabPage) vocabPage.style.display = "block";
  if (aiChatPage) aiChatPage.style.display = "none";
  if (btn) btn.textContent = "💬";
  ensureIftyEnglishVocabTools();

  closeMainLauncher();
  closeMenuModal();
};

// 6. ALLIAチャットシステム
function initChatSystem() {
  try {
    const savedSessions = localStorage.getItem("chat_sessions_" + currentUser);
    if (savedSessions) chatSessions = JSON.parse(savedSessions);
  } catch(e) {
    chatSessions = [];
  }

  if (chatSessions.length === 0) {
    createNewChatSession();
  } else {
    currentChatSessionId = chatSessions[0].id;
    updateChatSessionSelect();
    renderChatMessages();
  }

  applyAlliaBranding();
}

window.createNewChatSession = function() {
  const newSession = {
    id: 'session_' + Date.now(),
    title: 'ALLIA',
    messages: [
      { role: 'assistant', text: 'こんにちは！ALLIAアシスタントです。何でも聞いてください！' }
    ]
  };

  chatSessions.unshift(newSession);
  currentChatSessionId = newSession.id;
  saveChatSessions();
  updateChatSessionSelect();
  renderChatMessages();
  applyAlliaBranding();
};

window.switchChatSession = function(sessionId) {
  currentChatSessionId = sessionId;
  renderChatMessages();

  const session = chatSessions.find(s => s.id === sessionId);
  const titleInput = document.getElementById("chatTitleInput");
  if (titleInput && session) titleInput.value = session.title;
};

window.updateChatTitle = function(newTitle) {
  const session = chatSessions.find(s => s.id === currentChatSessionId);
  if (session) {
    session.title = newTitle.trim() || "ALLIA";
    saveChatSessions();
    updateChatSessionSelect();
  }
};

window.moveChatSession = function(direction) {
  const index = chatSessions.findIndex(s => s.id === currentChatSessionId);
  if (index === -1) return;

  const newIndex = index + direction;
  if (newIndex >= 0 && newIndex < chatSessions.length) {
    const temp = chatSessions[index];
    chatSessions[index] = chatSessions[newIndex];
    chatSessions[newIndex] = temp;
    saveChatSessions();
    updateChatSessionSelect();
  }
};

window.deleteCurrentChatSession = function() {
  if (chatSessions.length <= 1) {
    alert("最後のチャットセッションは削除できません。");
    return;
  }

  if (!confirm("このチャットを削除しますか？")) return;

  chatSessions = chatSessions.filter(s => s.id !== currentChatSessionId);
  currentChatSessionId = chatSessions[0].id;
  saveChatSessions();
  updateChatSessionSelect();
  renderChatMessages();
};

function saveChatSessions() {
  try {
    localStorage.setItem("chat_sessions_" + currentUser, JSON.stringify(chatSessions));
    queueIftyCloudSave('チャット更新');
  } catch(e) {}
}

function updateChatSessionSelect() {
  const select = document.getElementById("chatSessionSelect");
  if (!select) return;

  select.innerHTML = chatSessions.map(s => `
    <option value="${s.id}" ${s.id === currentChatSessionId ? 'selected' : ''}>
      ${escapeHtml(s.title === '新しいチャット' ? 'ALLIA' : (s.title || 'ALLIA'))}
    </option>
  `).join('');

  const session = chatSessions.find(s => s.id === currentChatSessionId);
  const titleInput = document.getElementById("chatTitleInput");
  if (titleInput && session) {
    titleInput.value = session.title === '新しいチャット' ? 'ALLIA' : session.title;
  }
}

function renderChatMessages() {
  const container = document.getElementById("chatMessages");
  if (!container) return;

  const session = chatSessions.find(s => s.id === currentChatSessionId);
  if (!session || !session.messages) {
    container.innerHTML = "";
    return;
  }

  const activeSubject = normalizeIftySubject(currentIftySubject);
  const visibleMessages = session.messages.filter(message => {
    const messageSubject = normalizeIftySubject(message && message.subject ? message.subject : 'ENGLISH');
    return messageSubject === activeSubject;
  });

  container.innerHTML = visibleMessages.length
    ? visibleMessages.map(m => `
      <div style="display: flex; justify-content: ${m.role === 'user' ? 'flex-end' : 'flex-start'}; margin-bottom: 8px;">
        <div style="background: ${m.role === 'user' ? '#0284c7' : '#e2e8f0'}; color: ${m.role === 'user' ? 'white' : '#0f172a'}; padding: 10px 14px; border-radius: 8px; max-width: 80%; word-break: break-word; white-space: pre-wrap; line-height: 1.5; font-size: 0.95em;">${escapeHtml(m.text)}</div>
      </div>
    `).join('')
    : `<div style="margin:16px auto;max-width:560px;padding:13px 15px;background:#f1f5f9;color:#475569;border-radius:10px;text-align:center;font-size:.88em;line-height:1.55;">
         ${escapeHtml(getIftySubjectDisplayName(activeSubject))} ALLIA<br>
         この教科では${getIftyActiveOrderEntry(activeSubject) ? `「${escapeHtml(getIftySubjectOrderName(activeSubject))}」を適用します。` : 'ORDERなしで動作します。'}
       </div>`;

  container.scrollTop = container.scrollHeight;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('画像ファイルを読み込めませんでした。'));
    reader.readAsDataURL(file);
  });
}

function resizeImageDataUrl(dataUrl, maxSide = 1800) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const largest = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
        if (!largest || largest <= maxSide) { resolve(dataUrl); return; }
        const scale = maxSide / largest;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
        canvas.height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(dataUrl); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      } catch (e) {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

window.handleImageSelect = async function(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.type && !file.type.startsWith('image/')) {
    alert('画像ファイルを選択してください。');
    event.target.value = '';
    return;
  }
  if (file.size > 14 * 1024 * 1024) {
    alert('画像が大きすぎます。14MB以下の画像を選択してください。');
    event.target.value = '';
    return;
  }

  try {
    const rawDataUrl = await readFileAsDataUrl(file);
    selectedImageBase64 = await resizeImageDataUrl(rawDataUrl, 1800);

    const previewContainer = document.getElementById("imagePreviewContainer");
    const previewImg = document.getElementById("imagePreview");

    if (previewContainer && previewImg) {
      previewImg.src = selectedImageBase64;
      previewContainer.style.display = "flex";
    }
  } catch (error) {
    selectedImageBase64 = null;
    alert(String(error.message || error));
    event.target.value = '';
  }
};

window.clearSelectedImage = function() {
  selectedImageBase64 = null;

  const previewContainer = document.getElementById("imagePreviewContainer");
  if (previewContainer) previewContainer.style.display = "none";

  const fileInput = document.getElementById("imageInput");
  if (fileInput) fileInput.value = "";
};


function getIftyAlliaSubjectCapabilities(subject) {
  const key = normalizeIftySubject(subject);
  const registry = {
    ENGLISH: {
      storage: 'vocabularyFolders',
      moduleKey: '',
      folderCollection: 'folders',
      itemCollection: 'words',
      itemLabelField: 'word',
      generator: 'multilingual_word',
      supportsPractice: true
    },
    'SOCIAL STUDIES': {
      storage: 'practiceModule',
      moduleKey: 'socialStudies',
      folderCollection: 'folders',
      itemCollection: 'items',
      itemLabelField: 'title',
      generator: 'social_study',
      folderDefaults: { subjects: ['WORLD_HISTORY'], collapsed: false },
      itemSchema: ['title','memoryText','keyPoints','subjects','imageData','imageName','imageKind','imageFocus','workTitle','source','createdAt','updatedAt'],
      supportsPractice: true
    },
    ANCIENT: {
      storage: 'practiceModule', moduleKey: 'ancient', folderCollection: 'folders', itemCollection: 'items',
      itemLabelField: 'title', generator: 'generic_study_item', supportsPractice: false
    },
    SCIENCE: {
      storage: 'practiceModule',
      moduleKey: 'science',
      folderCollection: 'folders',
      itemCollection: 'items',
      itemLabelField: 'title',
      generator: 'science_study',
      folderDefaults: { subjects: ['PHYSICS'], collapsed: false },
      itemSchema: ['title','memoryText','keyPoints','formula','unit','conditions','subjects','imageData','imageName','imageKind','imageFocus','workTitle','source','createdAt','updatedAt'],
      supportsPractice: true
    }
  };
  // Future subjects only need a registry entry. Worker actions use these declared storage
  // capabilities rather than hard-coding a subject name.
  return registry[key] || {
    storage: 'practiceModule',
    moduleKey: String(key || 'subject').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    folderCollection: 'folders', itemCollection: 'items', itemLabelField: 'title',
    generator: 'generic_study_item', supportsPractice: false
  };
}

window.sendChatMessage = async function() {
  const input = document.getElementById("chatInput");
  if (!input) return;

  const text = input.value.trim();
  if (!text && !selectedImageBase64) return;
  if (!ensureIftyOnline('ALLIAチャット')) return;

  const session = chatSessions.find(s => s.id === currentChatSessionId);
  if (!session) return;

  const userMsg = text || '[画像を送信しました]';
  const activeSubject = normalizeIftySubject(currentIftySubject);
  const activeOrder = getIftySubjectOrder(activeSubject);

  const history = session.messages
    .filter(m => {
      const messageSubject = normalizeIftySubject(m && m.subject ? m.subject : 'ENGLISH');
      return (m.role === 'user' || m.role === 'assistant') &&
        !m.temporaryThinking &&
        messageSubject === activeSubject;
    })
    .slice(-12)
    .map(m => ({ role: m.role, content: m.text }));

  session.messages.push({ role: 'user', text: userMsg, subject: activeSubject });
  input.value = "";

  const currentImg = selectedImageBase64;
  clearSelectedImage();

  const thinkingMessage = { role: 'assistant', text: 'Thinking…', temporaryThinking: true, subject: activeSubject };
  session.messages.push(thinkingMessage);
  renderChatMessages();

  let replyText = "処理を実行しました。";

  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: "agent_chat",
        prompt: userMsg,
        history,
        subject: activeSubject,
        order: activeOrder,
        // STEP37: ALLIA ACTION SYSTEM is subject-agnostic.  New subjects can opt in by
        // registering a module below instead of adding a new chat implementation.
        allowAppEdits: true,
        currentFolders: activeSubject === 'ENGLISH' ? folders : [],
        practiceData,
        subjectCapabilities: getIftyAlliaSubjectCapabilities(activeSubject),
        practiceCapabilities: {
          schemaVersion: 1,
          note: "ALLIA may edit the entire practiceData object. Future practice modules are stored under practiceData.modules and should be preserved unless explicitly changed by the user. Question type selection is generated and graded locally from other words in the same quiz set and must not require AI.",
          questions: [
            "create_quiz_folder",
            "rename_quiz_folder",
            "delete_quiz_folder",
            "add_words",
            "remove_words",
            "set_direction",
            "set_quiz_types",
            "clear_review"
          ],
          flashcards: ["create_set", "rename_set", "move_set", "duplicate_set", "delete_set", "add_words", "remove_words", "clear_set", "set_random", "set_direction"]
        },
        image: currentImg
      })
    });

    const data = await response.json();

    if (response.ok) {
      replyText = data.reply || data.content || data.message || "応答を取得しました。";
      if (activeSubject === 'ENGLISH' && Array.isArray(data.updatedFolders)) {
        folders = data.updatedFolders;
        normalizeFoldersData();
        saveUserData();
        renderFolders();
      }
      if (data.updatedPracticeData && typeof data.updatedPracticeData === 'object') {
        practiceData = data.updatedPracticeData;
        normalizePracticeData();
        savePracticeData();
        const practiceModal = document.getElementById('practiceModal');
        if (practiceModal && practiceModal.style.display !== 'none') renderPracticeHome();
      }
    } else {
      replyText = isAlliaQuotaError(response, data)
        ? '本日のALLIA利用上限に達した可能性があります。Cloudflare Workers AIの無料枠は日本時間9:00ごろにリセットされます。'
        : (data.error || data.details || "AIからの応答に失敗しました。");
    }
  } catch (e) {
    replyText = "通信エラーが発生しました: " + e.message;
  }

  thinkingMessage.text = replyText;
  delete thinkingMessage.temporaryThinking;
  saveChatSessions();
  renderChatMessages();
  applyAlliaBranding();
};

// 7. メニュー
window.openMenuModal = function() {
  let modal = document.getElementById("appMenuModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "appMenuModal";
    modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 10000;`;
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 340px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); text-align: center;">
      <h3 style="margin-top: 0; color: #0f172a; margin-bottom: 16px;">メニュー</h3>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button onclick="${currentView === 'chat' ? 'switchToVocabView()' : 'switchToChatView()'}" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">${currentView === 'chat' ? '📚 単語帳に戻る' : '🤖 ALLIAを開く'}</button>
        <button onclick="openPlaySubMenu()" style="padding: 10px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">▶ プレイ</button>
        <button onclick="closeMenuModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer; margin-top: 4px;">閉じる</button>
      </div>
    </div>
  `;

  modal.style.display = "flex";
};

window.openPlaySubMenu = function() {
  const modal = document.getElementById("appMenuModal");
  if (!modal) return;

  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 340px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); text-align: center;">
      <h3 style="margin-top: 0; color: #0f172a; margin-bottom: 16px;">🎮 プレイモード選択</h3>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button onclick="openFlashcardDirectionMenu()" style="padding: 10px; background: #334155; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">📇 フラッシュカード</button>
        <button onclick="startQuiz()" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">📝 クイズ</button>
        <button onclick="openMenuModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer; margin-top: 6px;">◀ 戻る</button>
      </div>
    </div>
  `;
};

window.openFlashcardDirectionMenu = function() {
  const modal = document.getElementById("appMenuModal");
  if (!modal) return;

  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 340px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); text-align: center;">
      <h3 style="margin-top: 0; color: #0f172a; margin-bottom: 16px;">📇 フラッシュカード設定</h3>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button onclick="startFlashcards('all', true, 'front')" style="padding: 10px; background: #334155; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">表面：単語 / 裏面：意味</button>
        <button onclick="startFlashcards('all', true, 'back')" style="padding: 10px; background: #334155; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">表面：意味 / 裏面：単語</button>
        <button onclick="openPlaySubMenu()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer; margin-top: 6px;">◀ 戻る</button>
      </div>
    </div>
  `;
};

window.closeMenuModal = function() {
  const modal = document.getElementById("appMenuModal");
  if (modal) modal.style.display = "none";
};

window.startFlashcards = function(mode, random = true, direction = 'front') {
  closeMenuModal();
  currentFlashcardMode = mode;
  isRandomMode = random;
  cardMode = direction;
  loadFlashcardItems(mode, random);

  if (flashcardList.length === 0) {
    alert("対象となる語彙がありません。語彙を追加してください。");
    return;
  }

  currentFlashcardIndex = 0;
  isCardFlipped = false;
  renderFlashcardModal();
};

function loadFlashcardItems(mode, random) {
  let list = [];

  folders.forEach(f => {
    if (f.words) {
      f.words.forEach(w => {
        list.push({ ...w, mastery: w.mastery || 'unfixed' });
      });
    }
  });

  if (random) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  flashcardList = list;
}

window.renderFlashcardModal = function() {
  let modal = document.getElementById("flashcardModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "flashcardModal";
    modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 10001;`;
    document.body.appendChild(modal);
  } else {
    modal.style.display = "flex";
  }

  if (currentFlashcardIndex >= flashcardList.length) {
    const isReviewSession = currentFlashcardMode === 'review_due';
    const isWeakSession = currentFlashcardMode === 'weak';
    const isSocialSession = currentFlashcardMode === 'social';
    const isScienceSession = currentFlashcardMode === 'science';
    if (isReviewSession || isWeakSession) renderFolders();
    modal.innerHTML = `
      <div style="background: white; padding: 30px; border-radius: 12px; width: 90%; max-width: 380px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.3);">
        <h3 style="color: #0f172a; margin-top: 0; margin-bottom: 10px;">🎉 完了！</h3>
        <p style="color: #475569; font-size: 0.95em; margin-bottom: 20px;">${isReviewSession ? '今日の復習を終了しました。' : (isWeakSession ? '苦手候補の学習を終了しました。' : 'すべてのカードを終了しました。')}</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${(isReviewSession || isWeakSession || isSocialSession || isScienceSession) ? '' : '<button onclick="closeFlashcardModal(); openPracticeHome(\'ENGLISH\');" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">➡️ 他のモードでプレイ</button>'}
          <button onclick="closeFlashcardModal();${isSocialSession ? "openPracticeHome('SOCIAL STUDIES');" : (isScienceSession ? "openPracticeHome('SCIENCE');" : '')}" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer;">${isReviewSession ? '復習フォルダへ戻る' : (isWeakSession ? '語彙帳へ戻る' : (isSocialSession ? '社会PRACTICEへ戻る' : (isScienceSession ? '理科PRACTICEへ戻る' : '閉じる')))}</button>
        </div>
      </div>
    `;
    return;
  }

  const currentWord = flashcardList[currentFlashcardIndex];
  const meaningsText = Array.isArray(currentWord.meanings)
    ? currentWord.meanings.map(m => escapeHtml(m)).join("<br>")
    : escapeHtml(currentWord.meanings || '');

  const frontText = cardMode === 'front' ? escapeHtml(currentWord.word) : meaningsText;
  const backText = cardMode === 'front' ? meaningsText : escapeHtml(currentWord.word);

  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 400px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); text-align: center; position: relative;">
      <div style="position: absolute; top: 12px; left: 16px; font-size: 0.85em; color: #64748b;">${currentFlashcardIndex + 1} / ${flashcardList.length}</div>
      <button onclick="closeFlashcardModal()" style="position: absolute; top: 10px; right: 12px; background: none; border: none; font-size: 1.2em; cursor: pointer; color: #64748b;">✕</button>
      <div onclick="toggleCardFlip()" style="margin: 30px 0 20px 0; padding: 25px 20px; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 10px; cursor: pointer; min-height: 110px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
        <div style="font-size: 1.5em; font-weight: bold; color: #0f172a; margin-bottom: 8px;">${isCardFlipped ? backText : frontText}</div>
        ${currentWord.word ? `<button onclick="event.stopPropagation(); speakWord('${escapeHtml(String(currentWord.word).replace(/'/g, "\\'"))}','${escapeHtml(getIftyWordLanguageInfo(currentWord).code)}')" style="margin-top: 8px; background: #0284c7; color: white; border: none; padding: 4px 10px; border-radius: 4px; font-size: 0.8em; cursor: pointer;">🔊 発音</button>` : ''}
        <div style="font-size: 0.8em; color: #94a3b8; margin-top: 8px;">${isCardFlipped ? '(裏面)' : '(クリックして裏返す)'}</div>
      </div>
      <div style="display: flex; gap: 10px; margin-bottom: 12px;">
        <button onclick="setMasteryAndNext('unfixed')" style="flex: 1; padding: 10px; background: #f43f5e; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.9em;">❌ 未定着</button>
        <button onclick="setMasteryAndNext('fixed')" style="flex: 1; padding: 10px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.9em;">⭕ 定着</button>
      </div>
    </div>
  `;
};

window.toggleCardFlip = function() {
  isCardFlipped = !isCardFlipped;
  renderFlashcardModal();
};

window.setMasteryAndNext = function(status) {
  const current = flashcardList[currentFlashcardIndex];
  if (current) {
    const correct = status === 'fixed';
    current.mastery = status;
    if (current.__iftySocialFlashcard) {
      const ref = findIftySocialPracticeItemById(current.__iftySocialItemId || current.id);
      if (ref && ref.item) ref.item.mastery = status;
      savePracticeData();
    } else if (current.__iftyScienceFlashcard) {
      const ref = findIftySciencePracticeItemById(current.__iftyScienceItemId || current.id);
      if (ref && ref.item) ref.item.mastery = status;
      savePracticeData();
    } else {
      const sourceId = current.__iftyReviewWordId || current.id;
      const sourceWord = sourceId ? getIftyReviewWordById(sourceId) : null;
      if (sourceWord) sourceWord.mastery = status;
      if (currentFlashcardMode === 'review_due' && current.__iftyReviewWordId) {
        applyIftyReviewResult(current.__iftyReviewWordId, correct);
        recordIftyStudyEvent(current.__iftyReviewWordId, correct, 'review_flashcard');
      } else if (sourceId) {
        recordIftyStudyEvent(sourceId, correct, currentFlashcardMode === 'weak' ? 'weak_flashcard' : 'flashcard');
        enrollIftyReviewFromStudy(sourceId, correct);
      }
      saveUserData();
    }
  }

  currentFlashcardIndex++;
  isCardFlipped = false;
  renderFlashcardModal();
};

window.closeFlashcardModal = function() {
  const modal = document.getElementById("flashcardModal");
  if (modal) modal.style.display = "none";
};

window.startQuiz = function() {
  closeMenuModal();

  let modal = document.getElementById("flashcardModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "flashcardModal";
    modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 10001;`;
    document.body.appendChild(modal);
  } else {
    modal.style.display = "flex";
  }

  modal.innerHTML = `
    <div style="background: white; padding: 30px; border-radius: 12px; width: 90%; max-width: 380px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.3);">
      <h3 style="color: #0f172a; margin-top: 0; margin-bottom: 10px;">📝 クイズモード</h3>
      <p style="color: #475569; font-size: 0.95em; margin-bottom: 20px;">クイズ機能は現在準備中です！</p>
      <button onclick="closeFlashcardModal()" style="padding: 10px 20px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">閉じる</button>
    </div>
  `;
};

window.logout = async function() {
  if (iftyDeveloperMode || sessionStorage.getItem(IFTY_DEVELOPER_SESSION_KEY) === '1') {
    iftyDeveloperMode = false;
    sessionStorage.removeItem(IFTY_DEVELOPER_SESSION_KEY);
    localStorage.removeItem('currentUser');
    location.reload();
    return;
  }

  const token = iftySessionToken;
  if (iftyCloudSaveTimer) {
    clearTimeout(iftyCloudSaveTimer);
    iftyCloudSaveTimer = null;
  }
  if (token && isIftyOnline()) {
    try { await iftyAccountApi('account_logout', { token }); } catch (_) {}
  }
  clearIftyAccountSession();
  location.reload();
};
