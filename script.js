import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  signOut, onAuthStateChanged, sendPasswordResetEmail 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, setDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase設定
const firebaseConfig = {
  apiKey: "AIzaSyBDMYr_mLcNYjzuSAdgJ77IB3dujW-I-Mk",
  authDomain: "ifty-c6f67.firebaseapp.com",
  projectId: "ifty-c6f67",
  storageBucket: "ifty-c6f67.firebasestorage.app",
  messagingSenderId: "367366575162",
  appId: "1:367366575162:web:60946ed9f3611e428a5103",
  measurementId: "G-9MDLR0Z0J6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const WORKER_URL = "https://ifty.humbleflail205.workers.dev";

let currentUser = null;
let folders = [];
let authMode = "login";

// --- 🎮 画面切り替え制御 ---
window.showView = function(viewName) {
  const homeEl = document.getElementById("viewHome");
  const vocabEl = document.getElementById("viewVocab");
  if (homeEl) homeEl.style.display = viewName === "home" ? "block" : "none";
  if (vocabEl) vocabEl.style.display = viewName === "vocab" ? "block" : "none";
};

// --- 🔐 ログイン / 状態監視 ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const landingEl = document.getElementById("landingPage");
    const portalEl = document.getElementById("mainPortal");
    const userDisp = document.getElementById("userDisplay");

    if (landingEl) landingEl.style.display = "none";
    if (portalEl) portalEl.style.display = "block";
    if (userDisp) userDisp.innerText = user.email || "ログイン中";
    
    showView("home");
    await loadUserData();
  } else {
    currentUser = null;
    const landingEl = document.getElementById("landingPage");
    const portalEl = document.getElementById("mainPortal");

    if (landingEl) landingEl.style.display = "block";
    if (portalEl) portalEl.style.display = "none";
  }
});

window.showAuthModal = function(mode) {
  authMode = mode;
  const modalTitle = document.getElementById("modalTitle");
  const authSubmitBtn = document.getElementById("authSubmitBtn");
  const authGuide = document.getElementById("authGuide");
  const resetPassBtn = document.getElementById("resetPassBtn");

  if (modalTitle) modalTitle.innerText = mode === "login" ? "ログイン" : "新規アカウント登録";
  if (authSubmitBtn) authSubmitBtn.innerText = mode === "login" ? "ログイン" : "登録する";
  
  if (authGuide) {
    if (mode === "register") {
      authGuide.style.display = "block";
      authGuide.innerText = "※このアプリで今後使用するパスワードを新規作成して入力してください。";
    } else {
      authGuide.style.display = "none";
    }
  }

  if (resetPassBtn) {
    resetPassBtn.style.display = mode === "login" ? "block" : "none";
  }

  document.getElementById("authModal").style.display = "flex";
};

window.hideAuthModal = function() {
  document.getElementById("authModal").style.display = "none";
};

// 👁️ パスワード表示・非表示切り替え
window.togglePassword = function() {
  const passInput = document.getElementById("authPassword");
  const btn = document.getElementById("togglePassBtn");
  if (!passInput) return;

  if (passInput.type === "password") {
    passInput.type = "text";
    if (btn) btn.innerText = "🙈"; // 見えている時は非表示アイコン（猿など）
  } else {
    passInput.type = "password";
    if (btn) btn.innerText = "👁️"; // 伏せ字の時は目アイコン
  }
};

window.handleAuthSubmit = async function() {
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  if (!email || !password) return alert("メールアドレスとパスワードを入力してください");

  try {
    if (authMode === "login") {
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      await createUserWithEmailAndPassword(auth, email, password);
    }
    hideAuthModal();
  } catch (e) {
    alert("エラー: " + e.message);
  }
};

window.handleResetPassword = async function() {
  const email = document.getElementById("authEmail").value.trim();
  if (!email) return alert("パスワード再設定用メールを送信するため、まずメールアドレスを入力してください。");

  try {
    await sendPasswordResetEmail(auth, email);
    alert("パスワード再設定用のメールを送信しました。\nメールの案内をご確認ください。");
  } catch (e) {
    alert("送信エラー: " + e.message);
  }
};

setTimeout(() => {
  const emailInput = document.getElementById("authEmail");
  const passInput = document.getElementById("authPassword");

  const checkEnter = (e) => {
    if (e.key === "Enter") {
      window.handleAuthSubmit();
    }
  };

  if (emailInput) emailInput.onkeydown = checkEnter;
  if (passInput) passInput.onkeydown = checkEnter;
}, 500);

window.logout = function() {
  signOut(auth);
};

// --- ☁️ データ同期（Firestore） ---
async function saveUserData() {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, "users", currentUser.uid), { folders: folders });
  } catch (e) {
    console.error("保存エラー:", e);
  }
}

async function loadUserData() {
  if (!currentUser) return;
  try {
    const docSnap = await getDoc(doc(db, "users", currentUser.uid));
    if (docSnap.exists()) {
      folders = docSnap.data().folders || [];
    } else {
      folders = [];
    }
    render();
  } catch (e) {
    console.error("読み込みエラー:", e);
  }
}

// --- 🔊 音声再生 ---
window.speakWord = function(text) {
  if (!text) return;
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    setTimeout(() => {
      const uttr = new SpeechSynthesisUtterance(text);
      uttr.lang = 'en-US';
      uttr.rate = 0.9;
      window.speechSynthesis.speak(uttr);
    }, 500);
  } else {
    alert("お使いのブラウザは音声読み上げに対応していません。");
  }
};

// --- 🎨 テキスト装飾機能 ---
window.formatText = function(command, value = null) {
  document.execCommand(command, false, value);
};

// --- 🤖 AIデータ取得 ---
async function fetchAIContent(word) {
  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "word", word: word })
    });
    if (res.ok) return await res.json();
  } catch (e) {}
  return { 
    meanings: [`【訳】 ${word}`], 
    examples: [],
    details: ""
  };
}

// AI相談室
window.askAIChat = async function(customQuery = null) {
  const inputEl = document.getElementById("aiChatInput");
  const resultEl = document.getElementById("aiChatResult");
  const query = customQuery || (inputEl ? inputEl.value.trim() : "");
  if (!query) return;

  resultEl.style.display = "block";
  resultEl.innerHTML = "⏳ AIが回答を作成中...";

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "chat", question: query })
    });
    if (res.ok) {
      const data = await res.json();
      resultEl.innerHTML = `<b>💡 AIの回答:</b><br>${data.answer.replace(/\n/g, "<br>")}`;
    }
  } catch (e) {
    resultEl.innerHTML = "❌ エラーが発生しました。";
  }
};

// 単語追加
window.addWord = async function(folderId, word){
  const cleanWord = word.trim();
  if(!cleanWord) return;

  const aiData = await fetchAIContent(cleanWord);
  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.words.push({ word: cleanWord, ...aiData });
    await saveUserData();
    render();
  }
};

// 白紙追加
window.addBlankWord = async function(folderId) {
  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.words.push({
      word: "",
      meanings: [""],
      examples: [],
      details: ""
    });
    await saveUserData();
    render();
  }
};

// フォルダ作成
window.createFolder = async function() {
  const input = document.getElementById("folderName");
  const name = input ? input.value.trim() : "";
  if (!name) return;
  folders.push({ id: Date.now(), name: name, isCollapsed: false, words: [] });
  if (input) input.value = "";
  await saveUserData();
  render();
};

setTimeout(() => {
  const folderInput = document.getElementById("folderName");
  const createBtn = document.getElementById("createFolderBtn");
  
  if (createBtn) createBtn.onclick = window.createFolder;
  if (folderInput) {
    folderInput.onkeydown = (e) => {
      if (e.key === 'Enter') window.createFolder();
    };
  }
}, 500);

window.toggleFolder = async function(folderId) {
  const f = folders.find(x => x.id === folderId);
  if (f) { f.isCollapsed = !f.isCollapsed; await saveUserData(); render(); }
};

window.deleteFolder = async function(folderId) {
  if (confirm("フォルダを削除しますか？（中の単語も消去されます）")) {
    folders = folders.filter(f => f.id !== folderId);
    await saveUserData();
    render();
  }
};

window.clearFolderWords = async function(folderId) {
  if (confirm("このフォルダ内の単語をすべて削除しますか？")) {
    const f = folders.find(x => x.id === folderId);
    if (f) {
      f.words = [];
      await saveUserData();
      render();
    }
  }
};

window.deleteWord = async function(folderId, index) {
  const f = folders.find(x => x.id === folderId);
  if (f) { f.words.splice(index, 1); await saveUserData(); render(); }
};

window.moveWord = async function(fromFolderId, wIdx, toFolderId) {
  const targetFolderId = Number(toFolderId);
  if (!targetFolderId || fromFolderId === targetFolderId) return;

  const srcFolder = folders.find(f => f.id === fromFolderId);
  const destFolder = folders.find(f => f.id === targetFolderId);

  if (srcFolder && destFolder) {
    const [movedWord] = srcFolder.words.splice(wIdx, 1);
    destFolder.words.push(movedWord);
    await saveUserData();
    render();
  }
};

window.addExample = async function(folderId, wIdx) {
  const f = folders.find(x => x.id === folderId);
  if (f && f.words[wIdx]) {
    if (!f.words[wIdx].examples) f.words[wIdx].examples = [];
    f.words[wIdx].examples.push({ en: "", jp: "" });
    await saveUserData();
    render();
  }
};

window.updateExampleField = async function(folderId, wIdx, exIdx, field, value) {
  const f = folders.find(x => x.id === folderId);
  if (f && f.words[wIdx] && f.words[wIdx].examples[exIdx]) {
    f.words[wIdx].examples[exIdx][field] = value;
    await saveUserData();
  }
};

window.deleteExample = async function(folderId, wIdx, exIdx) {
  const f = folders.find(x => x.id === folderId);
  if (f && f.words[wIdx] && f.words[wIdx].examples) {
    f.words[wIdx].examples.splice(exIdx, 1);
    await saveUserData();
    render();
  }
};

window.updateWordField = async function(folderId, wIdx, field, value) {
  const f = folders.find(x => x.id === folderId);
  if (f && f.words[wIdx]) {
    if (field === 'meanings') f.words[wIdx].meanings = [value];
    else if (field === 'details') f.words[wIdx].details = value;
    else if (field === 'word') f.words[wIdx].word = value;
    await saveUserData();
  }
};

// 🎨 画面描画
function render(){
  const foldersEl = document.getElementById("folders");
  if (!foldersEl) return;
  foldersEl.innerHTML = "";

  // 1. AI英語相談室
  const chatBox = document.createElement("div");
  chatBox.style.cssText = "background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; margin-bottom: 20px;";
  chatBox.innerHTML = `
    <h3 style="margin:0 0 8px 0; color:#166534; font-size:1.05em;">🤖 AI英語相談室</h3>
    <div style="display:flex; gap:6px; margin-bottom:8px;">
      <input id="aiChatInput" placeholder="質問を入力 (例: enthusiasticとexuberantの違いは？)" onkeydown="if(event.key==='Enter') askAIChat();" style="flex:1; padding:8px; border:1px solid #86efac; border-radius:4px;">
      <button onclick="askAIChat()" style="background:#15803d; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer; font-weight:bold;">質問</button>
    </div>
    <div id="aiChatResult" style="display:none; background:white; padding:10px; border-radius:6px; border:1px solid #cbd5e1; font-size:0.9em; line-height:1.6;"></div>
  `;
  foldersEl.appendChild(chatBox);

  // 2. フォルダ＆単語カード表示
  folders.forEach((folder) => {
    const div = document.createElement("div");
    div.style.cssText = "background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);";

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div style="cursor:pointer;" onclick="toggleFolder(${folder.id})">
          <h2 style="margin:0; font-size:1.1em; color:#0f172a;">📁 ${folder.name} (${folder.words.length}語) ${folder.isCollapsed ? '▶' : '▼'}</h2>
        </div>
        <div>
          <button onclick="clearFolderWords(${folder.id})" style="background:#f59e0b; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:0.8em; cursor:pointer; margin-right:4px;">🧹 一掃</button>
          <button onclick="deleteFolder(${folder.id})" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:0.8em; cursor:pointer;">削除</button>
        </div>
      </div>

      ${!folder.isCollapsed ? `
        <div style="margin-top:12px;">
          <div style="display:flex; gap:6px; margin-bottom:12px;">
            <input placeholder="英単語を入力してEnter" onkeydown="if(event.key==='Enter'){ addWord(${folder.id}, this.value); this.value=''; }" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:4px;">
            <button onclick="addBlankWord(${folder.id})" style="background:#475569; color:white; border:none; padding:8px 12px; border-radius:4px; font-size:0.85em; cursor:pointer;">📄 白紙追加</button>
          </div>

          ${folder.words.map((w, wIdx) => `
            <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:5px solid #e11d48; padding:12px; margin-top:10px; border-radius:6px;">
              <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <div style="display:flex; align-items:center; gap:6px; flex:1;">
                  <button onclick="speakWord('${w.word}')" title="発音を聞く" style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:50%; width:32px; height:32px; cursor:pointer; font-size:1em; display:flex; align-items:center; justify-content:center;">🔊</button>
                  <input value="${w.word || ''}" placeholder="単語を入力..." onkeydown="if(event.key==='Enter') this.blur();" onchange="updateWordField(${folder.id}, ${wIdx}, 'word', this.value)" style="font-size:1.2em; font-weight:bold; border:none; outline:none; color:#0f172a; width:100%;">
                </div>

                <div style="display:flex; align-items:center; gap:6px;">
                  <select onchange="moveWord(${folder.id}, ${wIdx}, this.value)" style="font-size:0.8em; padding:4px; border-radius:4px; border:1px solid #cbd5e1; background:#f8fafc;">
                    <option value="">移動...</option>
                    ${folders.map(f => `<option value="${f.id}" ${f.id === folder.id ? 'disabled' : ''}>${f.name}</option>`).join('')}
                  </select>
                  <button onclick="deleteWord(${folder.id}, ${wIdx})" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:1.1em;">🗑️</button>
                </div>
              </div>
              
              <div style="margin-top:8px; display:flex; gap:4px; align-items:center; background:#f8fafc; padding:4px 8px; border-radius:4px; border:1px solid #e2e8f0; font-size:0.75em;">
                <span style="color:#64748b; margin-right:4px;">文字色:</span>
                <button onmousedown="event.preventDefault(); formatText('foreColor', '#e11d48');" style="background:#e11d48; color:white; border:none; border-radius:3px; padding:2px 6px; cursor:pointer;">赤</button>
                <button onmousedown="event.preventDefault(); formatText('foreColor', '#0284c7');" style="background:#0284c7; color:white; border:none; border-radius:3px; padding:2px 6px; cursor:pointer;">青</button>
                <button onmousedown="event.preventDefault(); formatText('hiliteColor', '#fef08a');" style="background:#fef08a; color:#0f172a; border:none; border-radius:3px; padding:2px 6px; cursor:pointer;">黄ハイライト</button>
                <button onmousedown="event.preventDefault(); formatText('bold');" style="background:#cbd5e1; color:#0f172a; border:none; border-radius:3px; padding:2px 6px; cursor:pointer; font-weight:bold;">B</button>
                <button onmousedown="event.preventDefault(); formatText('removeFormat');" style="background:#e2e8f0; color:#475569; border:none; border-radius:3px; padding:2px 6px; cursor:pointer;">🧹 リセット</button>
              </div>

              <div style="margin-top:4px; background:#fff5f5; padding:8px; border-radius:4px; font-size:0.95em; border:1px solid #ffe4e6; line-height:1.5;">
                <div 
                  contenteditable="true" 
                  onblur="updateWordField(${folder.id}, ${wIdx}, 'meanings', this.innerHTML)" 
                  style="width:100%; border:none; outline:none; font-family:sans-serif; min-height:1.2em;"
                >${(w.meanings || []).join('<br>')}</div>
              </div>

              <div style="margin-top:8px; background:#f8fafc; padding:8px; border-radius:4px; border:1px solid #f1f5f9;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <span style="font-size:0.85em; font-weight:bold; color:#475569;">💬 例文</span>
                  <button onclick="addExample(${folder.id}, ${wIdx})" style="background:#0284c7; color:white; border:none; padding:2px 6px; border-radius:3px; font-size:0.75em; cursor:pointer;">+ 例文追加</button>
                </div>
                ${(w.examples || []).map((ex, exIdx) => `
                  <div style="display:flex; align-items:center; gap:6px; margin-top:6px;">
                    <div style="flex:1;">
                      <input value="${ex.en || ''}" placeholder="英語例文を入力..." onchange="updateExampleField(${folder.id}, ${wIdx}, ${exIdx}, 'en', this.value)" style="width:100%; font-size:0.88em; color:#0284c7; border:none; border-bottom:1px solid #cbd5e1; outline:none; background:transparent;">
                      <input value="${ex.jp || ''}" placeholder="日本語訳を入力..." onchange="updateExampleField(${folder.id}, ${wIdx}, ${exIdx}, 'jp', this.value)" style="width:100%; font-size:0.85em; color:#64748b; border:none; border-bottom:1px dashed #cbd5e1; outline:none; background:transparent; margin-top:2px;">
                    </div>
                    <button onclick="deleteExample(${folder.id}, ${wIdx}, ${exIdx})" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.9em;">🗑️</button>
                  </div>
                `).join('')}
              </div>

              <div style="margin-top:6px; font-size:0.82em; color:#475569; background:#f1f5f9; padding:6px 8px; border-radius:4px;">
                💡 <b>解説:</b> 
                <input value="${w.details || ''}" placeholder="補足やメモを入力..." onkeydown="if(event.key==='Enter') this.blur();" onchange="updateWordField(${folder.id}, ${wIdx}, 'details', this.value)" style="width:80%; border:none; background:transparent; font-size:1em; outline:none; color:#475569;">
              </div>
            </div>
          `).join("")}
        </div>
      ` : ''}
    `;
    foldersEl.appendChild(div);
  });
}
