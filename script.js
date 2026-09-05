// ★★★ IFTY 最新版 2026-09-06：実践・複数選択・ALLIA実践編集対応 ★★★
// 完全版 スマート単語帳 & ALLIA（Cloudflare Workers連携）
// ==========================================

let currentUser = "default_user";
let currentView = "vocab"; // 'vocab' or 'chat'
let folders = [];
let flashcardList = [];
let currentFlashcardIndex = 0;
let isCardFlipped = false;
let currentFlashcardMode = 'all';
let isRandomMode = true;
let cardMode = 'front';

let chatSessions = [];
let currentChatSessionId = null;
let selectedImageBase64 = null;
let pendingSpellingSuggestions = {};

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

const WORKER_URL = 'https://ifty.humbleflail205.workers.dev/';

// ==========================================
// ALLIA 表示統一
// ==========================================
function applyAlliaBranding() {
  document.title = (document.title || 'スマート単語帳 & ALLIA')
    .replace(/Grok AI/gi, 'ALLIA')
    .replace(/Grok/gi, 'ALLIA');

  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.placeholder = 'ALLIAに質問、または「○○の意味」など…';

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
  localStorage.setItem("currentUser", currentUser);

  const landingPage = document.getElementById("landingPage");
  if (landingPage) landingPage.style.display = "none";

  const mainPortal = document.getElementById("mainPortal");
  if (mainPortal) mainPortal.style.display = "block";

  const userDisplay = document.getElementById("userDisplay");
  if (userDisplay) userDisplay.textContent = currentUser;

  const floatingAiBtn = document.getElementById("floatingAiBtn");
  if (floatingAiBtn) floatingAiBtn.style.display = "flex";

  loadUserData(currentUser);
  loadPracticeData(currentUser);
  initChatSystem();
  applyAlliaBranding();
});

// 2. ユーザーデータ管理
function makeId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

function normalizeFoldersData() {
  if (!Array.isArray(folders)) folders = [];

  folders.forEach(folder => {
    if (!folder.id) folder.id = makeId('folder');
    if (!Array.isArray(folder.words)) folder.words = [];
    folder.words.forEach(word => {
      if (!word.id) word.id = makeId('word');
    });
  });
}

function loadUserData(username) {
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
    folder.words = [];
    saveUserData();
    renderFolders();
  }
};

function renderFolders() {
  const container = document.getElementById("folders");
  if (!container) return;

  normalizeFoldersData();

  const selectedCount = selectedWordIds.size;
  const folderOptions = folders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');

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
    container.innerHTML = selectionToolbar + `
      <p style="color:#94a3b8;text-align:center;padding:30px;background:white;border-radius:8px;border:1px dashed #cbd5e1;">
        フォルダがありません。下のフォームからフォルダを作成してください。
      </p>
    `;
    return;
  }

  container.innerHTML = selectionToolbar + folders.map((folder, fIndex) => {
    const suggestion = pendingSpellingSuggestions[folder.id];
    const words = folder.words || [];
    const allWordsSelected = words.length > 0 && words.every(w => selectedWordIds.has(w.id));
    const folderChecked = selectedFolderIds.has(folder.id);

    return `
    <div style="background:white;border:1px solid #cbd5e1;border-radius:8px;padding:16px;margin-bottom:12px;box-shadow:0 2px 4px rgba(0,0,0,0.05);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${folder.collapsed ? '0' : '8px'};gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
          <input type="checkbox" ${folderChecked ? 'checked' : ''} onchange="toggleFolderSelection('${folder.id}', this.checked)" title="このフォルダを選択" style="width:18px;height:18px;flex:none;">
          <div style="display:flex;align-items:center;gap:8px;cursor:pointer;min-width:0;" onclick="toggleFolderCollapse('${folder.id}')">
            <span style="font-size:.9em;color:#64748b;">${folder.collapsed ? '▶' : '▼'}</span>
            <h3 style="margin:0;color:#0f172a;font-size:1.1em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📁 ${escapeHtml(folder.name)} (${words.length}件)</h3>
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

      ${folder.collapsed ? '' : `
        <div style="display:flex;gap:6px;margin-bottom:10px;margin-top:8px;">
          <input id="wordInput_${folder.id}" placeholder="単語を入力（Enterまたは追加でAI自動生成）" onkeydown="if(event.key==='Enter'){event.preventDefault(); addWordToFolder('${folder.id}');}" style="flex:1;padding:8px;border:1px solid #cbd5e1;border-radius:4px;font-size:.9em;min-width:0;">
          <button onclick="addWordToFolder('${folder.id}')" style="background:#0284c7;color:white;border:none;padding:8px 12px;border-radius:4px;cursor:pointer;font-size:.9em;font-weight:bold;">追加</button>
        </div>
        ${suggestion ? renderSpellingSuggestion(folder.id, suggestion) : ''}
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${words.map((w, wIndex) => `
            <div style="display:flex;align-items:flex-start;gap:8px;">
              <input type="checkbox" ${selectedWordIds.has(w.id) ? 'checked' : ''} onchange="toggleWordSelection('${w.id}', this.checked)" title="この単語を選択" style="width:18px;height:18px;margin-top:14px;flex:none;">
              <div style="flex:1;min-width:0;">${renderWordItem(w, folder.id, wIndex)}</div>
            </div>
          `).join('')}
        </div>
      `}
    </div>`;
  }).join('');
}

function renderSpellingSuggestion(folderId, suggestion) {
  return `
    <div style="margin-bottom: 10px; padding: 10px 12px; background: #eff6ff; border: 1px solid #93c5fd; border-radius: 7px; color: #334155; font-size: 0.9em;">
      <div style="margin-bottom: 8px;">もしかして <b>${escapeHtml(suggestion.suggested)}</b> ？</div>
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
  delete pendingSpellingSuggestions[folderId];
  renderFolders();
  await generateAndAddWord(folderId, word);
};

window.keepOriginalSpelling = async function(folderId) {
  const suggestion = pendingSpellingSuggestions[folderId];
  if (!suggestion) return;
  const word = suggestion.original;
  delete pendingSpellingSuggestions[folderId];
  renderFolders();
  await generateAndAddWord(folderId, word);
};

window.cancelSpellingSuggestion = function(folderId) {
  delete pendingSpellingSuggestions[folderId];
  renderFolders();
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
          <div style="font-size: 1.25em; font-weight: bold; color: #0f172a;">${escapeHtml(w.word || '')}</div>

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
                    ${ex.en ? `<button onclick="speakWord('${escapeHtml(String(ex.en).replace(/'/g, "\\'"))}')" style="background: #0284c7; color: white; border: none; padding: 1px 4px; border-radius: 3px; font-size: 0.7em; cursor: pointer;">🔊</button>` : ''}
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
          ${w.word ? `<button onclick="speakWord('${escapeHtml(String(w.word).replace(/'/g, "\\'"))}')" style="background: #0284c7; color: white; border: none; padding: 3px 6px; border-radius: 4px; font-size: 0.75em; cursor: pointer;" title="単語を発音">🔊</button>` : ''}
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
window.addWordToFolder = async function(folderId) {
  const input = document.getElementById(`wordInput_${folderId}`);
  if (!input) return;

  const wordText = input.value.trim();
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;
  if (!folder.words) folder.words = [];
  if (!wordText) return;

  input.value = "";
  delete pendingSpellingSuggestions[folderId];

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
        pendingSpellingSuggestions[folderId] = {
          original: wordText,
          suggested: String(spellData.suggestion).trim()
        };
        renderFolders();
        return;
      }
    }
  } catch (error) {
    console.error("スペル確認エラー:", error);
  }

  await generateAndAddWord(folderId, wordText);
};

async function generateAndAddWord(folderId, wordText) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;
  if (!folder.words) folder.words = [];

  const newWordObj = {
    id: makeId('word'),
    word: wordText,
    meanings: ['生成中...'],
    examples: [],
    details: '',
    mastery: 'unfixed'
  };

  folder.words.push(newWordObj);
  saveUserData();
  renderFolders();

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
          includeExamples: true,
          includeInflections: true,
          includeDerivatives: true,
          shortDetails: true
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.details || ("HTTP " + response.status));
    }

    applyWordData(newWordObj, data);
  } catch (error) {
    console.error("単語生成エラー:", error);
    newWordObj.meanings = ["AI生成に失敗しました。もう一度お試しください。"];
    newWordObj.examples = [];
    newWordObj.details = String(error.message || error);
  }

  saveUserData();
  renderFolders();

  if (!newWordObj.meanings.includes("AI生成に失敗しました。もう一度お試しください。")) {
    setTimeout(() => speakWord(wordText), 300);
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
      return { en: ex.en || "", ja: ex.ja || "" };
    });
  }

  if (data.pronunciation) wordObj.pronunciation = data.pronunciation;
  if (data.partOfSpeech) wordObj.partOfSpeech = data.partOfSpeech;
  if (data.transitivity) wordObj.transitivity = data.transitivity;
  if (data.countability) wordObj.countability = data.countability;
  if (data.details) wordObj.details = data.details;
  if (Array.isArray(data.derivatives)) wordObj.derivatives = data.derivatives;
  if (data.forms && typeof data.forms === 'object') wordObj.forms = data.forms;
}

window.moveWordWithinFolder = function(folderId, wordIndex, direction) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder || !folder.words) return;

  const newIndex = wordIndex + direction;
  if (newIndex < 0 || newIndex >= folder.words.length) return;

  const temp = folder.words[wordIndex];
  folder.words[wordIndex] = folder.words[newIndex];
  folder.words[newIndex] = temp;

  saveUserData();
  renderFolders();
};

window.openEditWordModal = function(folderId, wordIndex) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder || !folder.words[wordIndex]) return;

  const w = folder.words[wordIndex];
  let modal = document.getElementById("editWordModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "editWordModal";
    modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 10005;`;
    document.body.appendChild(modal);
  }

  const meaningsStr = Array.isArray(w.meanings) ? w.meanings.join('\n') : (w.meanings || '');
  const examplesStr = w.examples ? w.examples.map(ex => `${ex.en || ''} | ${ex.ja || ''}`).join('\n') : '';
  const derivativesStr = Array.isArray(w.derivatives) ? w.derivatives.join('\n') : (w.derivatives || '');

  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 420px; max-height: 90vh; overflow-y: auto; box-shadow: 0 4px 16px rgba(0,0,0,0.3);">
      <h3 style="margin-top: 0; color: #0f172a; margin-bottom: 12px;">✏️ 単語の編集</h3>
      <div style="display: flex; flex-direction: column; gap: 10px; text-align: left;">
        <div><label style="font-size: 0.85em; font-weight: bold; color: #475569;">単語</label><input id="editWordText" value="${escapeHtml(w.word)}" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;"></div>
        <div><label style="font-size: 0.85em; font-weight: bold; color: #475569;">発音記号</label><input id="editPronunciationText" value="${escapeHtml(w.pronunciation || '')}" placeholder="/.../" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;"></div>
        <div><label style="font-size: 0.85em; font-weight: bold; color: #475569;">品詞</label><input id="editPartOfSpeechText" value="${escapeHtml(w.partOfSpeech || '')}" placeholder="動詞・名詞など" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;"></div>
        <div><label style="font-size: 0.85em; font-weight: bold; color: #475569;">自他動詞・可算不可算</label><input id="editUsageText" value="${escapeHtml([w.transitivity, w.countability].filter(Boolean).join(' / '))}" placeholder="他動詞 / 可算" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;"></div>
        <div><label style="font-size: 0.85em; font-weight: bold; color: #475569;">意味（改行区切り）</label><textarea id="editMeaningsText" rows="4" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-size: 0.9em;">${escapeHtml(meaningsStr)}</textarea></div>
        <div><label style="font-size: 0.85em; font-weight: bold; color: #475569;">活用</label><input id="editFormsText" value="${escapeHtml([w.forms && w.forms.past ? `過去:${w.forms.past}` : '', w.forms && w.forms.pastParticiple ? `過去分詞:${w.forms.pastParticiple}` : '', w.forms && w.forms.ing ? `ing:${w.forms.ing}` : '', w.forms && w.forms.thirdPerson ? `三単現:${w.forms.thirdPerson}` : ''].filter(Boolean).join(' / '))}" placeholder="過去 / 過去分詞 / -ing / 三単現" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;"></div>
        <div><label style="font-size: 0.85em; font-weight: bold; color: #475569;">例文（英語 | 和訳）</label><textarea id="editExamplesText" rows="4" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-size: 0.9em;">${escapeHtml(examplesStr)}</textarea></div>
        <div><label style="font-size: 0.85em; font-weight: bold; color: #475569;">派生語（改行区切り）</label><textarea id="editDerivativesText" rows="2" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-size: 0.9em;">${escapeHtml(derivativesStr)}</textarea></div>
        <div><label style="font-size: 0.85em; font-weight: bold; color: #475569;">💡 補足</label><input id="editDetailsText" value="${escapeHtml(w.details || '')}" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;"></div>
        <div style="display: flex; gap: 10px; margin-top: 10px;">
          <button onclick="saveEditedWord('${folder.id}', ${wordIndex})" style="flex: 1; padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">保存</button>
          <button onclick="closeEditWordModal()" style="padding: 10px 16px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer;">キャンセル</button>
        </div>
      </div>
    </div>
  `;

  modal.style.display = "flex";
};

window.saveEditedWord = function(folderId, wordIndex) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder || !folder.words[wordIndex]) return;

  const wordVal = document.getElementById("editWordText").value.trim();
  const pronunciationVal = document.getElementById("editPronunciationText").value.trim();
  const partOfSpeechVal = document.getElementById("editPartOfSpeechText").value.trim();
  const usageVal = document.getElementById("editUsageText").value.trim();
  const meaningsVal = document.getElementById("editMeaningsText").value.split('\n').map(s => s.trim()).filter(Boolean);
  const examplesRaw = document.getElementById("editExamplesText").value.split('\n').map(s => s.trim()).filter(Boolean);
  const derivativesVal = document.getElementById("editDerivativesText").value.split('\n').map(s => s.trim()).filter(Boolean);
  const detailsVal = document.getElementById("editDetailsText").value.trim();

  const newExamples = examplesRaw.map(line => {
    const parts = line.split('|');
    return { en: parts[0] ? parts[0].trim() : line, ja: parts[1] ? parts[1].trim() : '' };
  });

  const word = folder.words[wordIndex];
  word.word = wordVal;
  word.pronunciation = pronunciationVal;
  word.partOfSpeech = partOfSpeechVal;
  word.meanings = meaningsVal;
  word.examples = newExamples;
  word.derivatives = derivativesVal;
  word.details = detailsVal;

  if (usageVal) {
    const usageParts = usageVal.split('/').map(s => s.trim());
    word.transitivity = usageParts[0] || '';
    word.countability = usageParts[1] || '';
  }

  saveUserData();
  renderFolders();
  closeEditWordModal();
};

window.closeEditWordModal = function() {
  const modal = document.getElementById("editWordModal");
  if (modal) modal.style.display = "none";
};

function generateSmartWordData(word) {
  return { meaning: `${word}の意味`, example: `This is an example sentence using ${word}.` };
}

// Web Speech API
window.speakWord = function(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 1.0;
  window.speechSynthesis.speak(utterance);
};

window.deleteFolder = function(folderId) {
  if (!confirm("このフォルダを削除しますか？")) return;
  const removedFolder = folders.find(f => f.id === folderId);
  if (removedFolder) (removedFolder.words || []).forEach(w => selectedWordIds.delete(w.id));
  selectedFolderIds.delete(folderId);
  folders = folders.filter(f => f.id !== folderId);
  delete pendingSpellingSuggestions[folderId];
  saveUserData();
  renderFolders();
};

window.deleteWord = function(folderId, wordIndex) {
  const folder = folders.find(f => f.id === folderId);
  if (folder && folder.words) {
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

window.openPracticeHome = function() {
  closeMainLauncher();
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

function renderPracticeHome() {
  const modal = document.getElementById('practiceModal');
  if (!modal) return;
  const sets = getFlashcardSets();
  modal.innerHTML = `
    <div style="background:white;border-radius:14px;width:min(760px,100%);max-height:92vh;overflow:auto;padding:18px;box-shadow:0 15px 45px rgba(0,0,0,.28);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px;">
        <div><h2 style="margin:0;color:#0f172a;font-size:1.3em;">⚔️ 実践</h2><div style="color:#64748b;font-size:.85em;margin-top:3px;">実践モジュール</div></div>
        <button onclick="closePracticeModal()" style="background:none;border:none;font-size:1.4em;color:#64748b;cursor:pointer;">✕</button>
      </div>
      <div style="border:1px solid #cbd5e1;border-radius:10px;padding:14px;background:#f8fafc;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <div><b style="color:#0f172a;">📇 フラッシュカード</b><div style="font-size:.82em;color:#64748b;margin-top:2px;">セットごとに保存・編集・再開できます</div></div>
          <button onclick="createPracticeFlashcardSet()" style="background:#0284c7;color:white;border:none;border-radius:6px;padding:8px 12px;font-weight:bold;cursor:pointer;">＋ 新規セット</button>
        </div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;">
          ${sets.length ? sets.map((set, index) => `
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
    </div>`;
}

window.createPracticeFlashcardSet = function() {
  const name = prompt('フラッシュカードセット名を入力してください。', '新しいフラッシュカード');
  if (!name || !name.trim()) return;
  const set = { id: makeId('flashset'), name: name.trim(), wordIds: [], random: true, direction: 'front', progress: null };
  getFlashcardSets().push(set);
  savePracticeData();
  openPracticeFlashcardSet(set.id);
};

window.renamePracticeSet = function(setId) {
  const set = getPracticeSet(setId); if (!set) return;
  const name = prompt('新しいセット名', set.name);
  if (!name || !name.trim()) return;
  set.name = name.trim(); savePracticeData(); openPracticeFlashcardSet(setId);
};

window.movePracticeSet = function(setId, direction) {
  const sets = getFlashcardSets();
  const i = sets.findIndex(s => s.id === setId); const ni = i + direction;
  if (i < 0 || ni < 0 || ni >= sets.length) return;
  [sets[i], sets[ni]] = [sets[ni], sets[i]];
  savePracticeData(); renderPracticeHome();
};

window.duplicatePracticeSet = function(setId) {
  const set = getPracticeSet(setId); if (!set) return;
  getFlashcardSets().push({ ...JSON.parse(JSON.stringify(set)), id: makeId('flashset'), name: set.name + ' コピー', progress: null });
  savePracticeData(); renderPracticeHome();
};

window.deletePracticeSet = function(setId) {
  const set = getPracticeSet(setId); if (!set) return;
  if (!confirm(`「${set.name}」を削除しますか？`)) return;
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
          <button onclick="addSelectedWordsToPracticeSet('${set.id}')" style="border:none;background:#0284c7;color:white;border-radius:5px;padding:7px 9px;cursor:pointer;">チェックしたフォルダ・単語から追加</button>
          <select id="practiceFolderSource" style="padding:7px;border:1px solid #cbd5e1;border-radius:5px;">${folders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('')}</select>
          <button onclick="addFolderWordsToPracticeSet('${set.id}')" style="border:none;background:#334155;color:white;border-radius:5px;padding:7px 9px;cursor:pointer;">選択フォルダから追加</button>
          <button onclick="addAllWordsToPracticeSet('${set.id}')" style="border:none;background:#334155;color:white;border-radius:5px;padding:7px 9px;cursor:pointer;">全単語を追加</button>
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
  set.wordIds = uniqueExistingWordIds([...(set.wordIds || []), ...ids]);
  set.progress = null;
  savePracticeData();
  openPracticeFlashcardSet(set.id);
}

window.addSelectedWordsToPracticeSet = function(setId) { const set=getPracticeSet(setId); if(set) addIdsToSet(set, collectWordIdsFromSelection()); };
window.addFolderWordsToPracticeSet = function(setId) { const set=getPracticeSet(setId); const sel=document.getElementById('practiceFolderSource'); const f=folders.find(x=>sel&&x.id===sel.value); if(set&&f) addIdsToSet(set,(f.words||[]).map(w=>w.id)); };
window.addAllWordsToPracticeSet = function(setId) { const set=getPracticeSet(setId); if(set) addIdsToSet(set,folders.flatMap(f=>(f.words||[]).map(w=>w.id))); };
window.removeWordFromPracticeSet = function(setId,wordId) { const set=getPracticeSet(setId); if(!set)return; set.wordIds=(set.wordIds||[]).filter(id=>id!==wordId); set.progress=null; savePracticeData(); openPracticeFlashcardSet(setId); };
window.clearPracticeSetWords = function(setId) { const set=getPracticeSet(setId); if(!set)return; if(!confirm('このセットの単語をすべて外しますか？'))return; set.wordIds=[]; set.progress=null; savePracticeData(); openPracticeFlashcardSet(setId); };
window.setPracticeRandom = function(setId,val) { const set=getPracticeSet(setId); if(set){ set.random=!!val; set.progress=null; savePracticeData(); } };
window.setPracticeDirection = function(setId,val) { const set=getPracticeSet(setId); if(set){ set.direction=val; set.progress=null; savePracticeData(); } };

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
window.answerPracticeCard = function(setId, remembered) { const set=getPracticeSet(setId); if(!set||!set.progress)return; const p=set.progress; const id=p.queue[p.index]; if(!remembered && !p.missed.includes(id)) p.missed.push(id); p.index++; p.showingBack=false; savePracticeData(); renderPracticePlayer(setId); };
window.pausePracticeSet = function(setId) { savePracticeData(); openPracticeFlashcardSet(setId); };
window.restartPracticeConfirm = function(setId) { if(confirm('このセットを最初からやり直しますか？')) startPracticeSet(setId,true); };

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
  currentView = 'vocab';

  const vocabPage = document.getElementById("vocabPage");
  const aiChatPage = document.getElementById("aiChatPage");
  const btn = document.getElementById("floatingAiBtn");

  if (vocabPage) vocabPage.style.display = "block";
  if (aiChatPage) aiChatPage.style.display = "none";
  if (btn) btn.textContent = "💬";

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

  container.innerHTML = session.messages.map(m => `
    <div style="display: flex; justify-content: ${m.role === 'user' ? 'flex-end' : 'flex-start'}; margin-bottom: 8px;">
      <div style="background: ${m.role === 'user' ? '#0284c7' : '#e2e8f0'}; color: ${m.role === 'user' ? 'white' : '#0f172a'}; padding: 10px 14px; border-radius: 8px; max-width: 80%; word-break: break-word; white-space: pre-wrap; line-height: 1.5; font-size: 0.95em;">${escapeHtml(m.text)}</div>
    </div>
  `).join('');

  container.scrollTop = container.scrollHeight;
}

window.handleImageSelect = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    selectedImageBase64 = e.target.result;

    const previewContainer = document.getElementById("imagePreviewContainer");
    const previewImg = document.getElementById("imagePreview");

    if (previewContainer && previewImg) {
      previewImg.src = selectedImageBase64;
      previewContainer.style.display = "flex";
    }
  };

  reader.readAsDataURL(file);
};

window.clearSelectedImage = function() {
  selectedImageBase64 = null;

  const previewContainer = document.getElementById("imagePreviewContainer");
  if (previewContainer) previewContainer.style.display = "none";

  const fileInput = document.getElementById("imageInput");
  if (fileInput) fileInput.value = "";
};

window.sendChatMessage = async function() {
  const input = document.getElementById("chatInput");
  if (!input) return;

  const text = input.value.trim();
  if (!text && !selectedImageBase64) return;

  const session = chatSessions.find(s => s.id === currentChatSessionId);
  if (!session) return;

  const userMsg = text || '[画像を送信しました]';

  const history = session.messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-12)
    .map(m => ({ role: m.role, content: m.text }));

  session.messages.push({ role: 'user', text: userMsg });
  input.value = "";

  const currentImg = selectedImageBase64;
  clearSelectedImage();
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
        currentFolders: folders,
        practiceData: practiceData,
        practiceCapabilities: {
          schemaVersion: 1,
          note: "ALLIA may edit the entire practiceData object. Future practice modules are stored under practiceData.modules and should be preserved unless explicitly changed by the user.",
          flashcards: ["create_set", "rename_set", "move_set", "duplicate_set", "delete_set", "add_words", "remove_words", "clear_set", "set_random", "set_direction"]
        },
        image: currentImg
      })
    });

    const data = await response.json();

    if (response.ok) {
      replyText = data.reply || data.content || data.message || "応答を取得しました。";
      if (Array.isArray(data.updatedFolders)) {
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
      replyText = data.error || data.details || "AIからの応答に失敗しました。";
    }
  } catch (e) {
    replyText = "通信エラーが発生しました: " + e.message;
  }

  session.messages.push({ role: 'assistant', text: replyText });
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
    alert("対象となる単語がありません。単語を追加してください。");
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
    modal.innerHTML = `
      <div style="background: white; padding: 30px; border-radius: 12px; width: 90%; max-width: 380px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.3);">
        <h3 style="color: #0f172a; margin-top: 0; margin-bottom: 10px;">🎉 完了！</h3>
        <p style="color: #475569; font-size: 0.95em; margin-bottom: 20px;">すべてのカードを終了しました。</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <button onclick="closeFlashcardModal(); openMenuModal(); openPlaySubMenu();" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">➡️ 他のモードでプレイ</button>
          <button onclick="closeFlashcardModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer;">閉じる</button>
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
        ${currentWord.word ? `<button onclick="event.stopPropagation(); speakWord('${escapeHtml(String(currentWord.word).replace(/'/g, "\\'"))}')" style="margin-top: 8px; background: #0284c7; color: white; border: none; padding: 4px 10px; border-radius: 4px; font-size: 0.8em; cursor: pointer;">🔊 発音</button>` : ''}
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
  if (flashcardList[currentFlashcardIndex]) {
    flashcardList[currentFlashcardIndex].mastery = status;
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

window.logout = function() {
  localStorage.removeItem("currentUser");
  location.reload();
};
