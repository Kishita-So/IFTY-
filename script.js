// ==========================================
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

// スペル候補
let pendingSpellingSuggestions = {};

const WORKER_URL = 'https://ifty.humbleflail205.workers.dev/';


// ==========================================
// 1. 初期化処理
// ==========================================

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
  initChatSystem();
});


// ==========================================
// 2. ユーザーデータ管理
// ==========================================

function loadUserData(username) {
  try {
    const saved = localStorage.getItem("vocab_user_" + username);

    if (saved) {
      folders = JSON.parse(saved);
    } else {
      folders = [];
    }
  } catch (e) {
    folders = [];
  }

  renderFolders();
}


function saveUserData() {
  try {
    localStorage.setItem(
      "vocab_user_" + currentUser,
      JSON.stringify(folders)
    );
  } catch (e) {}
}


// ==========================================
// 3. フォルダ管理
// ==========================================

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


// ==========================================
// フォルダ描画
// ==========================================

function renderFolders() {
  const container = document.getElementById("folders");
  if (!container) return;

  if (folders.length === 0) {
    container.innerHTML = `
      <p style="
        color: #94a3b8;
        text-align: center;
        padding: 30px;
        background: white;
        border-radius: 8px;
        border: 1px dashed #cbd5e1;
      ">
        フォルダがありません。下のフォームからフォルダを作成してください。
      </p>
    `;
    return;
  }

  container.innerHTML = folders.map((folder, fIndex) => {

    const spellingSuggestion =
      pendingSpellingSuggestions[folder.id];

    return `
      <div style="
        background: white;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 12px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      ">

        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: ${folder.collapsed ? '0' : '8px'};
        ">

          <div
            style="display: flex; align-items: center; gap: 8px; cursor: pointer;"
            onclick="toggleFolderCollapse('${folder.id}')"
          >
            <span style="font-size: 0.9em; color: #64748b;">
              ${folder.collapsed ? '▶' : '▼'}
            </span>

            <h3 style="
              margin: 0;
              color: #0f172a;
              font-size: 1.1em;
            ">
              📁 ${escapeHtml(folder.name)}
              (${folder.words ? folder.words.length : 0}件)
            </h3>
          </div>

          <div style="display: flex; gap: 4px; align-items: center;">

            <button
              onclick="moveFolder(${fIndex}, -1)"
              title="上に移動"
              style="
                background: #e2e8f0;
                border: none;
                padding: 2px 6px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.8em;
              "
            >⬆️</button>

            <button
              onclick="moveFolder(${fIndex}, 1)"
              title="下に移動"
              style="
                background: #e2e8f0;
                border: none;
                padding: 2px 6px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.8em;
              "
            >⬇️</button>

            <button
              onclick="clearFolderWords('${folder.id}')"
              title="全消し"
              style="
                background: #f59e0b;
                color: white;
                border: none;
                padding: 3px 6px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.75em;
              "
            >全消し</button>

            <button
              onclick="deleteFolder('${folder.id}')"
              title="削除"
              style="
                background: #ef4444;
                color: white;
                border: none;
                padding: 3px 6px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.75em;
              "
            >削除</button>

          </div>
        </div>

        ${folder.collapsed ? '' : `

          <div style="
            display: flex;
            gap: 6px;
            margin-bottom: 10px;
            margin-top: 8px;
          ">

            <input
              id="wordInput_${folder.id}"
              placeholder="単語を入力（Enterまたは追加でAI自動生成）"
              onkeydown="if(event.key==='Enter'){event.preventDefault(); addWordToFolder('${folder.id}');}"
              style="
                flex: 1;
                padding: 8px;
                border: 1px solid #cbd5e1;
                border-radius: 4px;
                font-size: 0.9em;
              "
            >

            <button
              onclick="addWordToFolder('${folder.id}')"
              style="
                background: #0284c7;
                color: white;
                border: none;
                padding: 8px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.9em;
                font-weight: bold;
              "
            >追加</button>

          </div>

          ${spellingSuggestion
            ? renderSpellingSuggestion(folder.id, spellingSuggestion)
            : ''
          }

          <div style="
            display: flex;
            flex-direction: column;
            gap: 8px;
          ">

            ${(folder.words || []).map((w, wIndex) =>
              renderWordItem(w, folder.id, wIndex)
            ).join('')}

          </div>
        `}
      </div>
    `;
  }).join('');
}


// ==========================================
// スペル候補
// ==========================================

function renderSpellingSuggestion(folderId, suggestion) {
  return `
    <div style="
      margin-bottom: 10px;
      padding: 10px 12px;
      background: #eff6ff;
      border: 1px solid #93c5fd;
      border-radius: 7px;
      color: #334155;
      font-size: 0.9em;
    ">

      <div style="margin-bottom: 8px;">
        もしかして
        <b>${escapeHtml(suggestion.suggested)}</b>
        ？
      </div>

      <div style="
        display: flex;
        gap: 7px;
        flex-wrap: wrap;
      ">

        <button
          onclick="acceptSpellingSuggestion('${folderId}')"
          style="
            background: #0284c7;
            color: white;
            border: none;
            padding: 6px 10px;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
          "
        >
          ${escapeHtml(suggestion.suggested)}
        </button>

        <button
          onclick="keepOriginalSpelling('${folderId}')"
          style="
            background: #e2e8f0;
            color: #334155;
            border: none;
            padding: 6px 10px;
            border-radius: 5px;
            cursor: pointer;
          "
        >
          ${escapeHtml(suggestion.original)} のまま
        </button>

        <button
          onclick="cancelSpellingSuggestion('${folderId}')"
          style="
            background: transparent;
            color: #64748b;
            border: none;
            padding: 6px;
            cursor: pointer;
          "
        >
          キャンセル
        </button>

      </div>
    </div>
  `;
}


window.acceptSpellingSuggestion = async function(folderId) {
  const suggestion = pendingSpellingSuggestions[folderId];

  if (!suggestion) return;

  const correctedWord = suggestion.suggested;

  delete pendingSpellingSuggestions[folderId];

  renderFolders();

  await generateAndAddWord(
    folderId,
    correctedWord
  );
};


window.keepOriginalSpelling = async function(folderId) {
  const suggestion = pendingSpellingSuggestions[folderId];

  if (!suggestion) return;

  const originalWord = suggestion.original;

  delete pendingSpellingSuggestions[folderId];

  renderFolders();

  await generateAndAddWord(
    folderId,
    originalWord
  );
};


window.cancelSpellingSuggestion = function(folderId) {
  delete pendingSpellingSuggestions[folderId];

  renderFolders();
};


// ==========================================
// 単語カード表示
// ==========================================

function renderWordItem(w, folderId, wIndex) {

  const meanings = Array.isArray(w.meanings)
    ? w.meanings
    : (w.meanings ? [w.meanings] : []);

  const examples = Array.isArray(w.examples)
    ? w.examples
    : [];

  const derivatives = Array.isArray(w.derivatives)
    ? w.derivatives
    : (w.derivatives ? [w.derivatives] : []);

  const forms = w.forms || {};

  return `
    <div style="
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      padding: 12px;
      border-radius: 6px;
      font-size: 0.9em;
    ">

      <div style="
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      ">

        <div style="flex: 1; min-width: 0;">

          <div style="
            font-size: 1.25em;
            font-weight: bold;
            color: #0f172a;
          ">
            ${escapeHtml(w.word || '')}
          </div>

          ${(w.pronunciation || w.partOfSpeech) ? `
            <div style="
              margin-top: 2px;
              color: #64748b;
              font-size: 0.85em;
            ">
              ${w.pronunciation ? escapeHtml(w.pronunciation) : ''}
              ${w.pronunciation && w.partOfSpeech ? '　' : ''}
              ${w.partOfSpeech ? escapeHtml(w.partOfSpeech) : ''}
            </div>
          ` : ''}

          ${(w.transitivity || w.countability) ? `
            <div style="
              margin-top: 3px;
              color: #475569;
              font-size: 0.82em;
            ">
              ${w.transitivity ? escapeHtml(w.transitivity) : ''}
              ${w.transitivity && w.countability ? ' / ' : ''}
              ${w.countability ? escapeHtml(w.countability) : ''}
            </div>
          ` : ''}

          ${meanings.length > 0 ? `
            <div style="
              margin-top: 7px;
              color: #0f172a;
              line-height: 1.5;
            ">
              ${meanings.map((meaning, i) => `
                <div>
                  ${meanings.length > 1 ? `${i + 1}. ` : ''}
                  ${escapeHtml(meaning)}
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${(forms.past || forms.pastParticiple || forms.ing || forms.thirdPerson) ? `
            <div style="
              margin-top: 7px;
              padding: 6px 8px;
              background: #eef2ff;
              border-radius: 5px;
              font-size: 0.82em;
              color: #334155;
            ">
              <b>活用：</b>
              ${forms.past ? `過去 ${escapeHtml(forms.past)}　` : ''}
              ${forms.pastParticiple ? `過去分詞 ${escapeHtml(forms.pastParticiple)}　` : ''}
              ${forms.ing ? `-ing ${escapeHtml(forms.ing)}　` : ''}
              ${forms.thirdPerson ? `三単現 ${escapeHtml(forms.thirdPerson)}` : ''}
            </div>
          ` : ''}

          ${examples.length > 0 ? `
            <div style="
              margin-top: 8px;
              color: #334155;
              line-height: 1.45;
            ">

              <b style="font-size: 0.82em;">例文</b>

              ${examples.map(ex => `
                <div style="
                  margin-top: 4px;
                  padding-left: 4px;
                ">

                  <div>
                    ${escapeHtml(ex.en || '')}

                    ${ex.en ? `
                      <button
                        onclick="speakWord('${escapeHtml(
                          String(ex.en).replace(/'/g, "\\'")
                        )}')"
                        style="
                          background: #0284c7;
                          color: white;
                          border: none;
                          padding: 1px 4px;
                          border-radius: 3px;
                          font-size: 0.7em;
                          cursor: pointer;
                        "
                      >🔊</button>
                    ` : ''}
                  </div>

                  ${ex.ja ? `
                    <div style="
                      color: #64748b;
                      font-size: 0.9em;
                    ">
                      ${escapeHtml(ex.ja)}
                    </div>
                  ` : ''}

                </div>
              `).join('')}
            </div>
          ` : ''}

          ${derivatives.length > 0 ? `
            <div style="
              margin-top: 7px;
              color: #475569;
              font-size: 0.82em;
            ">
              <b>派生語：</b>
              ${derivatives.map(d => escapeHtml(d)).join(' / ')}
            </div>
          ` : ''}

          ${w.details ? `
            <div style="
              font-size: 0.8em;
              color: #0284c7;
              margin-top: 6px;
              line-height: 1.35;
            ">
              💡 ${escapeHtml(w.details)}
            </div>
          ` : ''}

        </div>

        <div style="
          display: flex;
          gap: 3px;
          align-items: center;
          margin-left: 8px;
        ">

          ${w.word ? `
            <button
              onclick="speakWord('${escapeHtml(
                String(w.word).replace(/'/g, "\\'")
              )}')"
              style="
                background: #0284c7;
                color: white;
                border: none;
                padding: 3px 6px;
                border-radius: 4px;
                font-size: 0.75em;
                cursor: pointer;
              "
              title="単語を発音"
            >🔊</button>
          ` : ''}

          <button
            onclick="openEditWordModal('${folderId}', ${wIndex})"
            style="
              background: #64748b;
              color: white;
              border: none;
              padding: 3px 6px;
              border-radius: 4px;
              font-size: 0.75em;
              cursor: pointer;
            "
            title="編集"
          >編集</button>

          <button
            onclick="moveWordWithinFolder('${folderId}', ${wIndex}, -1)"
            style="
              background: #e2e8f0;
              border: none;
              padding: 2px 5px;
              border-radius: 3px;
              cursor: pointer;
              font-size: 0.75em;
            "
            title="上へ"
          >⬆️</button>

          <button
            onclick="moveWordWithinFolder('${folderId}', ${wIndex}, 1)"
            style="
              background: #e2e8f0;
              border: none;
              padding: 2px 5px;
              border-radius: 3px;
              cursor: pointer;
              font-size: 0.75em;
            "
            title="下へ"
          >⬇️</button>

          <button
            onclick="deleteWord('${folderId}', ${wIndex})"
            style="
              background: none;
              border: none;
              color: #ef4444;
              cursor: pointer;
              font-weight: bold;
              font-size: 1.1em;
            "
            title="削除"
          >×</button>

        </div>
      </div>
    </div>
  `;
}


// ==========================================
// 4. 単語追加
// ==========================================

window.addWordToFolder = async function(folderId) {

  const input =
    document.getElementById(`wordInput_${folderId}`);

  if (!input) {
    console.error(
      "単語入力欄が見つかりません:",
      `wordInput_${folderId}`
    );
    return;
  }

  const wordText =
    input.value.trim();

  const folder =
    folders.find(
      f => f.id === folderId
    );

  if (!folder) return;

  if (!folder.words) {
    folder.words = [];
  }

  if (!wordText) {
    folder.words.push({
      word: '',
      meanings: [''],
      examples: [],
      details: '',
      mastery: 'unfixed'
    });

    input.value = "";

    saveUserData();
    renderFolders();

    return;
  }

  input.value = "";

  // 前回の候補を消す
  delete pendingSpellingSuggestions[folderId];

  // ==========================================
  // スペル確認
  // ==========================================

  try {

    const spellResponse =
      await fetch(
        WORKER_URL,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            type: "word_check",
            word: wordText
          })
        }
      );

    if (spellResponse.ok) {

      const spellData =
        await spellResponse.json();

      if (
        spellData &&
        spellData.valid === false &&
        spellData.suggestion &&
        String(spellData.suggestion).trim().toLowerCase() !==
          wordText.toLowerCase()
      ) {

        pendingSpellingSuggestions[folderId] = {
          original: wordText,
          suggested: String(
            spellData.suggestion
          ).trim()
        };

        renderFolders();

        return;
      }
    }

  } catch (error) {
    console.error(
      "スペル確認エラー:",
      error
    );

    // スペル確認だけ失敗しても、
    // 単語生成自体は続行する
  }

  await generateAndAddWord(
    folderId,
    wordText
  );
};


// ==========================================
// AI単語生成
// ==========================================

async function generateAndAddWord(
  folderId,
  wordText
) {

  const folder =
    folders.find(
      f => f.id === folderId
    );

  if (!folder) return;

  if (!folder.words) {
    folder.words = [];
  }

  const newWordObj = {
    word: wordText,
    meanings: ['生成中...'],
    examples: [],
    details: '',
    mastery: 'unfixed'
  };

  folder.words.push(
    newWordObj
  );

  saveUserData();
  renderFolders();

  try {

    const response =
      await fetch(
        WORKER_URL,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

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
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        data.details ||
        "HTTP " +
        response.status
      );
    }

    applyWordData(
      newWordObj,
      data
    );

  } catch (error) {

    console.error(
      "単語生成エラー:",
      error
    );

    // エラー時に偽物の意味を作らない
    newWordObj.meanings = [
      "AI生成に失敗しました。もう一度お試しください。"
    ];

    newWordObj.examples = [];

    newWordObj.details =
      String(
        error.message ||
        error
      );
  }

  saveUserData();
  renderFolders();

  if (
    newWordObj.meanings[0] !==
    "AI生成に失敗しました。もう一度お試しください。"
  ) {
    setTimeout(
      () => {
        speakWord(wordText);
      },
      300
    );
  }
}


// ==========================================
// AIデータ反映
// ==========================================

function applyWordData(
  wordObj,
  data
) {

  if (!data) return;

  if (data.word) {
    wordObj.word =
      data.word;
  }

  if (
    Array.isArray(
      data.meanings
    )
  ) {
    wordObj.meanings =
      data.meanings;

  } else if (
    data.meaning
  ) {
    wordObj.meanings =
      [data.meaning];
  }

  if (
    Array.isArray(
      data.examples
    )
  ) {

    wordObj.examples =
      data.examples.map(
        ex => {

          if (
            typeof ex ===
            'string'
          ) {
            return {
              en: ex,
              ja: ""
            };
          }

          return {
            en:
              ex.en ||
              "",

            ja:
              ex.ja ||
              ""
          };
        }
      );
  }

  if (data.pronunciation) {
    wordObj.pronunciation =
      data.pronunciation;
  }

  if (data.partOfSpeech) {
    wordObj.partOfSpeech =
      data.partOfSpeech;
  }

  if (data.transitivity) {
    wordObj.transitivity =
      data.transitivity;
  }

  if (data.countability) {
    wordObj.countability =
      data.countability;
  }

  if (data.details) {
    wordObj.details =
      data.details;
  }

  if (
    Array.isArray(
      data.derivatives
    )
  ) {
    wordObj.derivatives =
      data.derivatives;
  }

  if (
    data.forms &&
    typeof data.forms ===
      'object'
  ) {
    wordObj.forms =
      data.forms;
  }
}


// ==========================================
// 移動
// ==========================================

window.moveWordWithinFolder = function(
  folderId,
  wordIndex,
  direction
) {

  const folder =
    folders.find(
      f => f.id === folderId
    );

  if (
    !folder ||
    !folder.words
  ) return;

  const newIndex =
    wordIndex +
    direction;

  if (
    newIndex < 0 ||
    newIndex >=
      folder.words.length
  ) return;

  const temp =
    folder.words[
      wordIndex
    ];

  folder.words[
    wordIndex
  ] =
    folder.words[
      newIndex
    ];

  folder.words[
    newIndex
  ] =
    temp;

  saveUserData();
  renderFolders();
};


// ==========================================
// 編集
// ==========================================

window.openEditWordModal = function(
  folderId,
  wordIndex
) {

  const folder =
    folders.find(
      f => f.id === folderId
    );

  if (
    !folder ||
    !folder.words[wordIndex]
  ) return;

  const w =
    folder.words[wordIndex];

  let modal =
    document.getElementById(
      "editWordModal"
    );

  if (!modal) {
    modal =
      document.createElement(
        "div"
      );

    modal.id =
      "editWordModal";

    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.6);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10005;
    `;

    document.body.appendChild(
      modal
    );
  }

  const meaningsStr =
    Array.isArray(
      w.meanings
    )
      ? w.meanings.join('\n')
      : (w.meanings || '');

  const examplesStr =
    w.examples
      ? w.examples
          .map(
            ex =>
              `${ex.en || ''} | ${ex.ja || ''}`
          )
          .join('\n')
      : '';

  const derivativesStr =
    Array.isArray(
      w.derivatives
    )
      ? w.derivatives.join('\n')
      : (w.derivatives || '');

  modal.innerHTML = `
    <div style="
      background: white;
      padding: 24px;
      border-radius: 12px;
      width: 90%;
      max-width: 420px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    ">

      <h3 style="
        margin-top: 0;
        color: #0f172a;
        margin-bottom: 12px;
      ">
        ✏️ 単語の編集
      </h3>

      <div style="
        display: flex;
        flex-direction: column;
        gap: 10px;
        text-align: left;
      ">

        <div>
          <label style="font-size: 0.85em; font-weight: bold; color: #475569;">
            単語
          </label>

          <input
            id="editWordText"
            value="${escapeHtml(w.word)}"
            style="
              width: 100%;
              padding: 8px;
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              box-sizing: border-box;
            "
          >
        </div>

        <div>
          <label style="font-size: 0.85em; font-weight: bold; color: #475569;">
            発音記号
          </label>

          <input
            id="editPronunciationText"
            value="${escapeHtml(w.pronunciation || '')}"
            placeholder="/.../"
            style="
              width: 100%;
              padding: 8px;
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              box-sizing: border-box;
            "
          >
        </div>

        <div>
          <label style="font-size: 0.85em; font-weight: bold; color: #475569;">
            品詞
          </label>

          <input
            id="editPartOfSpeechText"
            value="${escapeHtml(w.partOfSpeech || '')}"
            placeholder="動詞・名詞など"
            style="
              width: 100%;
              padding: 8px;
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              box-sizing: border-box;
            "
          >
        </div>

        <div>
          <label style="font-size: 0.85em; font-weight: bold; color: #475569;">
            自他動詞・可算不可算
          </label>

          <input
            id="editUsageText"
            value="${escapeHtml(
              [w.transitivity, w.countability]
                .filter(Boolean)
                .join(' / ')
            )}"
            placeholder="他動詞 / 可算"
            style="
              width: 100%;
              padding: 8px;
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              box-sizing: border-box;
            "
          >
        </div>

        <div>
          <label style="font-size: 0.85em; font-weight: bold; color: #475569;">
            意味（改行区切り）
          </label>

          <textarea
            id="editMeaningsText"
            rows="4"
            style="
              width: 100%;
              padding: 8px;
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              box-sizing: border-box;
              font-size: 0.9em;
            "
          >${escapeHtml(meaningsStr)}</textarea>
        </div>

        <div>
          <label style="font-size: 0.85em; font-weight: bold; color: #475569;">
            活用
          </label>

          <input
            id="editFormsText"
            value="${escapeHtml(
              [
                w.forms && w.forms.past
                  ? `過去:${w.forms.past}`
                  : '',

                w.forms && w.forms.pastParticiple
                  ? `過去分詞:${w.forms.pastParticiple}`
                  : '',

                w.forms && w.forms.ing
                  ? `ing:${w.forms.ing}`
                  : '',

                w.forms && w.forms.thirdPerson
                  ? `三単現:${w.forms.thirdPerson}`
                  : ''
              ]
                .filter(Boolean)
                .join(' / ')
            )}"
            placeholder="過去 / 過去分詞 / -ing / 三単現"
            style="
              width: 100%;
              padding: 8px;
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              box-sizing: border-box;
            "
          >
        </div>

        <div>
          <label style="font-size: 0.85em; font-weight: bold; color: #475569;">
            例文（英語 | 和訳）
          </label>

          <textarea
            id="editExamplesText"
            rows="4"
            style="
              width: 100%;
              padding: 8px;
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              box-sizing: border-box;
              font-size: 0.9em;
            "
          >${escapeHtml(examplesStr)}</textarea>
        </div>

        <div>
          <label style="font-size: 0.85em; font-weight: bold; color: #475569;">
            派生語（改行区切り）
          </label>

          <textarea
            id="editDerivativesText"
            rows="2"
            style="
              width: 100%;
              padding: 8px;
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              box-sizing: border-box;
              font-size: 0.9em;
            "
          >${escapeHtml(derivativesStr)}</textarea>
        </div>

        <div>
          <label style="font-size: 0.85em; font-weight: bold; color: #475569;">
            💡 補足
          </label>

          <input
            id="editDetailsText"
            value="${escapeHtml(w.details || '')}"
            style="
              width: 100%;
              padding: 8px;
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              box-sizing: border-box;
            "
          >
        </div>

        <div style="
          display: flex;
          gap: 10px;
          margin-top: 10px;
        ">

          <button
            onclick="saveEditedWord('${folder.id}', ${wordIndex})"
            style="
              flex: 1;
              padding: 10px;
              background: #0284c7;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-weight: bold;
            "
          >保存</button>

          <button
            onclick="closeEditWordModal()"
            style="
              padding: 10px 16px;
              background: #e2e8f0;
              color: #334155;
              border: none;
              border-radius: 6px;
              cursor: pointer;
            "
          >キャンセル</button>

        </div>
      </div>
    </div>
  `;

  modal.style.display =
    "flex";
};


window.saveEditedWord = function(
  folderId,
  wordIndex
) {

  const folder =
    folders.find(
      f => f.id === folderId
    );

  if (
    !folder ||
    !folder.words[wordIndex]
  ) return;

  const wordVal =
    document
      .getElementById(
        "editWordText"
      )
      .value
      .trim();

  const pronunciationVal =
    document
      .getElementById(
        "editPronunciationText"
      )
      .value
      .trim();

  const partOfSpeechVal =
    document
      .getElementById(
        "editPartOfSpeechText"
      )
      .value
      .trim();

  const usageVal =
    document
      .getElementById(
        "editUsageText"
      )
      .value
      .trim();

  const meaningsVal =
    document
      .getElementById(
        "editMeaningsText"
      )
      .value
      .split('\n')
      .map(
        s => s.trim()
      )
      .filter(Boolean);

  const examplesRaw =
    document
      .getElementById(
        "editExamplesText"
      )
      .value
      .split('\n')
      .map(
        s => s.trim()
      )
      .filter(Boolean);

  const derivativesVal =
    document
      .getElementById(
        "editDerivativesText"
      )
      .value
      .split('\n')
      .map(
        s => s.trim()
      )
      .filter(Boolean);

  const detailsVal =
    document
      .getElementById(
        "editDetailsText"
      )
      .value
      .trim();

  const newExamples =
    examplesRaw.map(
      line => {

        const parts =
          line.split('|');

        return {
          en:
            parts[0]
              ? parts[0].trim()
              : line,

          ja:
            parts[1]
              ? parts[1].trim()
              : ''
        };
      }
    );

  const word =
    folder.words[wordIndex];

  word.word =
    wordVal;

  word.pronunciation =
    pronunciationVal;

  word.partOfSpeech =
    partOfSpeechVal;

  word.meanings =
    meaningsVal;

  word.examples =
    newExamples;

  word.derivatives =
    derivativesVal;

  word.details =
    detailsVal;

  if (usageVal) {
    const usageParts =
      usageVal
        .split('/')
        .map(
          s => s.trim()
        );

    word.transitivity =
      usageParts[0] ||
      '';

    word.countability =
      usageParts[1] ||
      '';
  }

  saveUserData();

  renderFolders();

  closeEditWordModal();
};


window.closeEditWordModal = function() {
  const modal =
    document.getElementById(
      "editWordModal"
    );

  if (modal) {
    modal.style.display =
      "none";
  }
};


// ==========================================
// Web Speech API
// ==========================================

window.speakWord = function(text) {
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();

  const utterance =
    new SpeechSynthesisUtterance(
      text
    );

  utterance.lang =
    'en-US';

  utterance.rate =
    1.0;

  window.speechSynthesis.speak(
    utterance
  );
};


// ==========================================
// 削除
// ==========================================

window.deleteFolder = function(folderId) {
  if (!confirm("このフォルダを削除しますか？")) return;

  folders =
    folders.filter(
      f => f.id !== folderId
    );

  delete pendingSpellingSuggestions[
    folderId
  ];

  saveUserData();

  renderFolders();
};


window.deleteWord = function(
  folderId,
  wordIndex
) {

  const folder =
    folders.find(
      f => f.id === folderId
    );

  if (
    folder &&
    folder.words
  ) {

    folder.words.splice(
      wordIndex,
      1
    );

    saveUserData();

    renderFolders();
  }
};


// ==========================================
// HTMLエスケープ
// ==========================================

function escapeHtml(str) {
  if (!str) return '';

  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


// ==========================================
// 5. 画面切り替え
// ==========================================

window.toggleViewMode = function() {
  if (currentView === 'vocab') {
    switchToChatView();
  } else {
    switchToVocabView();
  }
};


window.switchToChatView = function() {
  currentView = 'chat';

  const vocabPage =
    document.getElementById(
      "vocabPage"
    );

  const aiChatPage =
    document.getElementById(
      "aiChatPage"
    );

  const btn =
    document.getElementById(
      "floatingAiBtn"
    );

  if (vocabPage) {
    vocabPage.style.display =
      "none";
  }

  if (aiChatPage) {
    aiChatPage.style.display =
      "flex";
  }

  if (btn) {
    btn.textContent =
      "📚";
  }

  closeMenuModal();
};


window.switchToVocabView = function() {
  currentView = 'vocab';

  const vocabPage =
    document.getElementById(
      "vocabPage"
    );

  const aiChatPage =
    document.getElementById(
      "aiChatPage"
    );

  const btn =
    document.getElementById(
      "floatingAiBtn"
    );

  if (vocabPage) {
    vocabPage.style.display =
      "block";
  }

  if (aiChatPage) {
    aiChatPage.style.display =
      "none";
  }

  if (btn) {
    btn.textContent =
      "💬";
  }

  closeMenuModal();
};


// ==========================================
// 6. ALLIAチャット
// ==========================================

function initChatSystem() {
  try {

    const savedSessions =
      localStorage.getItem(
        "chat_sessions_" +
        currentUser
      );

    if (savedSessions) {
      chatSessions =
        JSON.parse(
          savedSessions
        );
    }

  } catch(e) {
    chatSessions = [];
  }

  if (
    chatSessions.length ===
    0
  ) {

    createNewChatSession();

  } else {

    currentChatSessionId =
      chatSessions[0].id;

    updateChatSessionSelect();

    renderChatMessages();
  }
}


window.createNewChatSession = function() {
  const newSession = {
    id:
      'session_' +
      Date.now(),

    title:
      'ALLIA',

    messages: [
      {
        role:
          'assistant',

        text:
          'こんにちは！ALLIAアシスタントです。何でも聞いてください！'
      }
    ]
  };

  chatSessions.unshift(
    newSession
  );

  currentChatSessionId =
    newSession.id;

  saveChatSessions();

  updateChatSessionSelect();

  renderChatMessages();
};


window.switchChatSession = function(sessionId) {
  currentChatSessionId =
    sessionId;

  renderChatMessages();

  const session =
    chatSessions.find(
      s => s.id === sessionId
    );

  const titleInput =
    document.getElementById(
      "chatTitleInput"
    );

  if (
    titleInput &&
    session
  ) {
    titleInput.value =
      session.title;
  }
};


window.updateChatTitle = function(newTitle) {
  const session =
    chatSessions.find(
      s =>
        s.id ===
        currentChatSessionId
    );

  if (session) {
    session.title =
      newTitle.trim() ||
      "ALLIA";

    saveChatSessions();

    updateChatSessionSelect();
  }
};


window.moveChatSession = function(direction) {
  const index =
    chatSessions.findIndex(
      s =>
        s.id ===
        currentChatSessionId
    );

  if (index === -1) return;

  const newIndex =
    index +
    direction;

  if (
    newIndex >= 0 &&
    newIndex <
      chatSessions.length
  ) {

    const temp =
      chatSessions[index];

    chatSessions[index] =
      chatSessions[newIndex];

    chatSessions[newIndex] =
      temp;

    saveChatSessions();

    updateChatSessionSelect();
  }
};


window.deleteCurrentChatSession = function() {
  if (
    chatSessions.length <=
    1
  ) {

    alert(
      "最後のチャットセッションは削除できません。"
    );

    return;
  }

  if (
    !confirm(
      "このチャットを削除しますか？"
    )
  ) return;

  chatSessions =
    chatSessions.filter(
      s =>
        s.id !==
        currentChatSessionId
    );

  currentChatSessionId =
    chatSessions[0].id;

  saveChatSessions();

  updateChatSessionSelect();

  renderChatMessages();
};


function saveChatSessions() {
  try {
    localStorage.setItem(
      "chat_sessions_" +
      currentUser,

      JSON.stringify(
        chatSessions
      )
    );
  } catch(e) {}
}


function updateChatSessionSelect() {
  const select =
    document.getElementById(
      "chatSessionSelect"
    );

  if (!select) return;

  select.innerHTML =
    chatSessions.map(
      s => `
        <option
          value="${s.id}"
          ${s.id === currentChatSessionId ? 'selected' : ''}
        >
          ${escapeHtml(
            s.title === '新しいチャット'
              ? 'ALLIA'
              : (s.title || 'ALLIA')
          )}
        </option>
      `
    ).join('');

  const session =
    chatSessions.find(
      s =>
        s.id ===
        currentChatSessionId
    );

  const titleInput =
    document.getElementById(
      "chatTitleInput"
    );

  if (
    titleInput &&
    session
  ) {

    titleInput.value =
      session.title ===
        '新しいチャット'
        ? 'ALLIA'
        : session.title;
  }
}


function renderChatMessages() {
  const container =
    document.getElementById(
      "chatMessages"
    );

  if (!container) return;

  const session =
    chatSessions.find(
      s =>
        s.id ===
        currentChatSessionId
    );

  if (
    !session ||
    !session.messages
  ) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML =
    session.messages.map(
      m => `

        <div style="
          display: flex;
          justify-content: ${m.role === 'user' ? 'flex-end' : 'flex-start'};
          margin-bottom: 8px;
        ">

          <div style="
            background: ${m.role === 'user' ? '#0284c7' : '#e2e8f0'};
            color: ${m.role === 'user' ? 'white' : '#0f172a'};
            padding: 10px 14px;
            border-radius: 8px;
            max-width: 80%;
            word-break: break-word;
            white-space: pre-wrap;
            line-height: 1.5;
            font-size: 0.95em;
          ">
            ${escapeHtml(m.text)}
          </div>

        </div>

      `
    ).join('');

  container.scrollTop =
    container.scrollHeight;
}


window.handleImageSelect = function(event) {
  const file =
    event.target.files[0];

  if (!file) return;

  const reader =
    new FileReader();

  reader.onload =
  function(e) {

    selectedImageBase64 =
      e.target.result;

    const previewContainer =
      document.getElementById(
        "imagePreviewContainer"
      );

    const previewImg =
      document.getElementById(
        "imagePreview"
      );

    if (
      previewContainer &&
      previewImg
    ) {

      previewImg.src =
        selectedImageBase64;

      previewContainer.style.display =
        "flex";
    }
  };

  reader.readAsDataURL(
    file
  );
};


window.clearSelectedImage = function() {
  selectedImageBase64 =
    null;

  const previewContainer =
    document.getElementById(
      "imagePreviewContainer"
    );

  if (previewContainer) {
    previewContainer.style.display =
      "none";
  }

  const fileInput =
    document.getElementById(
      "imageInput"
    );

  if (fileInput) {
    fileInput.value =
      "";
  }
};


// ==========================================
// ALLIA送信
// ==========================================

window.sendChatMessage = async function() {
  const input =
    document.getElementById(
      "chatInput"
    );

  if (!input) return;

  const text =
    input.value.trim();

  if (
    !text &&
    !selectedImageBase64
  ) return;

  const session =
    chatSessions.find(
      s =>
        s.id ===
        currentChatSessionId
    );

  if (!session) return;

  const userMsg =
    text ||
    '[画像を送信しました]';

  // 今の発言を追加する前の履歴
  const history =
    session.messages
      .filter(
        m =>
          m.role === 'user' ||
          m.role === 'assistant'
      )
      .slice(-12)
      .map(
        m => ({
          role: m.role,
          content: m.text
        })
      );

  session.messages.push({
    role: 'user',
    text: userMsg
  });

  input.value =
    "";

  const currentImg =
    selectedImageBase64;

  clearSelectedImage();

  renderChatMessages();

  let replyText =
    "処理を実行しました。";

  try {

    const response =
      await fetch(
        WORKER_URL,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            type:
              "agent_chat",

            prompt:
              userMsg,

            history:
              history,

            currentFolders:
              folders,

            image:
              currentImg
          })
        }
      );

    const data =
      await response.json();

    if (response.ok) {

      replyText =
        data.reply ||
        data.content ||
        data.message ||
        "応答を取得しました。";

      if (
        data.updatedFolders
      ) {

        folders =
          data.updatedFolders;

        saveUserData();

        renderFolders();
      }

    } else {

      replyText =
        data.error ||
        data.details ||
        "AIからの応答に失敗しました。";
    }

  } catch (e) {

    replyText =
      "通信エラーが発生しました: " +
      e.message;
  }

  session.messages.push({
    role: 'assistant',
    text: replyText
  });

  saveChatSessions();

  renderChatMessages();
};


// ==========================================
// 7. メニュー
// ==========================================

window.openMenuModal = function() {
  let modal =
    document.getElementById(
      "appMenuModal"
    );

  if (!modal) {
    modal =
      document.createElement(
        "div"
      );

    modal.id =
      "appMenuModal";

    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.6);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;

    document.body.appendChild(
      modal
    );
  }

  modal.innerHTML = `

    <div style="
      background: white;
      padding: 24px;
      border-radius: 12px;
      width: 90%;
      max-width: 340px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      text-align: center;
    ">

      <h3 style="
        margin-top: 0;
        color: #0f172a;
        margin-bottom: 16px;
      ">メニュー</h3>

      <div style="
        display: flex;
        flex-direction: column;
        gap: 10px;
      ">

        <button
          onclick="${currentView === 'chat' ? 'switchToVocabView()' : 'switchToChatView()'}"
          style="
            padding: 10px;
            background: #0284c7;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
          "
        >
          ${currentView === 'chat' ? '📚 単語帳に戻る' : '🤖 ALLIAを開く'}
        </button>

        <button
          onclick="openPlaySubMenu()"
          style="
            padding: 10px;
            background: #10b981;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
          "
        >▶ プレイ</button>

        <button
          onclick="closeMenuModal()"
          style="
            padding: 8px;
            background: #e2e8f0;
            color: #334155;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            margin-top: 4px;
          "
        >閉じる</button>

      </div>
    </div>
  `;

  modal.style.display =
    "flex";
};


window.openPlaySubMenu = function() {
  const modal =
    document.getElementById(
      "appMenuModal"
    );

  if (!modal) return;

  modal.innerHTML = `

    <div style="
      background: white;
      padding: 24px;
      border-radius: 12px;
      width: 90%;
      max-width: 340px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      text-align: center;
    ">

      <h3 style="
        margin-top: 0;
        color: #0f172a;
        margin-bottom: 16px;
      ">
        🎮 プレイモード選択
      </h3>

      <div style="
        display: flex;
        flex-direction: column;
        gap: 10px;
      ">

        <button
          onclick="openFlashcardDirectionMenu()"
          style="
            padding: 10px;
            background: #334155;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
          "
        >📇 フラッシュカード</button>

        <button
          onclick="startQuiz()"
          style="
            padding: 10px;
            background: #0284c7;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
          "
        >📝 クイズ</button>

        <button
          onclick="openMenuModal()"
          style="
            padding: 8px;
            background: #e2e8f0;
            color: #334155;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            margin-top: 6px;
          "
        >◀ 戻る</button>

      </div>
    </div>
  `;
};


window.openFlashcardDirectionMenu = function() {
  const modal =
    document.getElementById(
      "appMenuModal"
    );

  if (!modal) return;

  modal.innerHTML = `

    <div style="
      background: white;
      padding: 24px;
      border-radius: 12px;
      width: 90%;
      max-width: 340px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      text-align: center;
    ">

      <h3 style="
        margin-top: 0;
        color: #0f172a;
        margin-bottom: 16px;
      ">
        📇 フラッシュカード設定
      </h3>

      <div style="
        display: flex;
        flex-direction: column;
        gap: 10px;
      ">

        <button
          onclick="startFlashcards('all', true, 'front')"
          style="
            padding: 10px;
            background: #334155;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
          "
        >表面：単語 / 裏面：意味</button>

        <button
          onclick="startFlashcards('all', true, 'back')"
          style="
            padding: 10px;
            background: #334155;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
          "
        >表面：意味 / 裏面：単語</button>

        <button
          onclick="openPlaySubMenu()"
          style="
            padding: 8px;
            background: #e2e8f0;
            color: #334155;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            margin-top: 6px;
          "
        >◀ 戻る</button>

      </div>
    </div>
  `;
};


window.closeMenuModal = function() {
  const modal =
    document.getElementById(
      "appMenuModal"
    );

  if (modal) {
    modal.style.display =
      "none";
  }
};


// ==========================================
// フラッシュカード
// ==========================================

window.startFlashcards = function(
  mode,
  random = true,
  direction = 'front'
) {

  closeMenuModal();

  currentFlashcardMode =
    mode;

  isRandomMode =
    random;

  cardMode =
    direction;

  loadFlashcardItems(
    mode,
    random
  );

  if (
    flashcardList.length ===
    0
  ) {

    alert(
      "対象となる単語がありません。単語を追加してください。"
    );

    return;
  }

  currentFlashcardIndex = 0;
  isCardFlipped = false;

  renderFlashcardModal();
};


function loadFlashcardItems(
  mode,
  random
) {

  let list = [];

  folders.forEach(
    f => {

      if (f.words) {

        f.words.forEach(
          w => {

            list.push({
              ...w,
              mastery:
                w.mastery ||
                'unfixed'
            });
          }
        );
      }
    }
  );

  if (random) {

    for (
      let i =
        list.length - 1;

      i > 0;

      i--
    ) {

      const j =
        Math.floor(
          Math.random() *
          (i + 1)
        );

      [
        list[i],
        list[j]
      ] = [
        list[j],
        list[i]
      ];
    }
  }

  flashcardList =
    list;
}


window.renderFlashcardModal = function() {
  let modal =
    document.getElementById(
      "flashcardModal"
    );

  if (!modal) {

    modal =
      document.createElement(
        "div"
      );

    modal.id =
      "flashcardModal";

    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10001;
    `;

    document.body.appendChild(
      modal
    );

  } else {

    modal.style.display =
      "flex";
  }

  if (
    currentFlashcardIndex >=
    flashcardList.length
  ) {

    modal.innerHTML = `

      <div style="
        background: white;
        padding: 30px;
        border-radius: 12px;
        width: 90%;
        max-width: 380px;
        text-align: center;
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      ">

        <h3 style="
          color: #0f172a;
          margin-top: 0;
          margin-bottom: 10px;
        ">🎉 完了！</h3>

        <p style="
          color: #475569;
          font-size: 0.95em;
          margin-bottom: 20px;
        ">
          すべてのカードを終了しました。
        </p>

        <div style="
          display: flex;
          flex-direction: column;
          gap: 10px;
        ">

          <button
            onclick="closeFlashcardModal(); openMenuModal(); openPlaySubMenu();"
            style="
              padding: 10px;
              background: #0284c7;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-weight: bold;
            "
          >➡️ 他のモードでプレイ</button>

          <button
            onclick="closeFlashcardModal()"
            style="
              padding: 8px;
              background: #e2e8f0;
              color: #334155;
              border: none;
              border-radius: 6px;
              cursor: pointer;
            "
          >閉じる</button>

        </div>
      </div>
    `;

    return;
  }

  const currentWord =
    flashcardList[
      currentFlashcardIndex
    ];

  const meaningsText =
    Array.isArray(
      currentWord.meanings
    )
      ? currentWord.meanings
          .map(
            m => escapeHtml(m)
          )
          .join("<br>")
      : escapeHtml(
          currentWord.meanings ||
          ''
        );

  const frontText =
    cardMode === 'front'
      ? escapeHtml(
          currentWord.word
        )
      : meaningsText;

  const backText =
    cardMode === 'front'
      ? meaningsText
      : escapeHtml(
          currentWord.word
        );

  modal.innerHTML = `

    <div style="
      background: white;
      padding: 24px;
      border-radius: 12px;
      width: 90%;
      max-width: 400px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      text-align: center;
      position: relative;
    ">

      <div style="
        position: absolute;
        top: 12px;
        left: 16px;
        font-size: 0.85em;
        color: #64748b;
      ">
        ${currentFlashcardIndex + 1}
        /
        ${flashcardList.length}
      </div>

      <button
        onclick="closeFlashcardModal()"
        style="
          position: absolute;
          top: 10px;
          right: 12px;
          background: none;
          border: none;
          font-size: 1.2em;
          cursor: pointer;
          color: #64748b;
        "
      >✕</button>

      <div
        onclick="toggleCardFlip()"
        style="
          margin: 30px 0 20px 0;
          padding: 25px 20px;
          background: #f8fafc;
          border: 2px dashed #cbd5e1;
          border-radius: 10px;
          cursor: pointer;
          min-height: 110px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        "
      >

        <div style="
          font-size: 1.5em;
          font-weight: bold;
          color: #0f172a;
          margin-bottom: 8px;
        ">
          ${isCardFlipped
            ? backText
            : frontText}
        </div>

        ${currentWord.word ? `
          <button
            onclick="event.stopPropagation(); speakWord('${escapeHtml(
              String(currentWord.word).replace(/'/g, "\\'")
            )}')"
            style="
              margin-top: 8px;
              background: #0284c7;
              color: white;
              border: none;
              padding: 4px 10px;
              border-radius: 4px;
              font-size: 0.8em;
              cursor: pointer;
            "
          >🔊 発音</button>
        ` : ''}

        <div style="
          font-size: 0.8em;
          color: #94a3b8;
          margin-top: 8px;
        ">
          ${isCardFlipped
            ? '(裏面)'
            : '(クリックして裏返す)'}
        </div>

      </div>

      <div style="
        display: flex;
        gap: 10px;
        margin-bottom: 12px;
      ">

        <button
          onclick="setMasteryAndNext('unfixed')"
          style="
            flex: 1;
            padding: 10px;
            background: #f43f5e;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
            font-size: 0.9em;
          "
        >❌ 未定着</button>

        <button
          onclick="setMasteryAndNext('fixed')"
          style="
            flex: 1;
            padding: 10px;
            background: #10b981;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
            font-size: 0.9em;
          "
        >⭕ 定着</button>

      </div>
    </div>
  `;
};


window.toggleCardFlip = function() {
  isCardFlipped =
    !isCardFlipped;

  renderFlashcardModal();
};


window.setMasteryAndNext = function(status) {
  if (
    flashcardList[
      currentFlashcardIndex
    ]
  ) {

    flashcardList[
      currentFlashcardIndex
    ].mastery =
      status;
  }

  currentFlashcardIndex++;

  isCardFlipped =
    false;

  renderFlashcardModal();
};


window.closeFlashcardModal = function() {
  const modal =
    document.getElementById(
      "flashcardModal"
    );

  if (modal) {
    modal.style.display =
      "none";
  }
};


// ==========================================
// クイズ
// ==========================================

window.startQuiz = function() {
  closeMenuModal();

  let modal =
    document.getElementById(
      "flashcardModal"
    );

  if (!modal) {
    modal =
      document.createElement(
        "div"
      );

    modal.id =
      "flashcardModal";

    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10001;
    `;

    document.body.appendChild(
      modal
    );

  } else {

    modal.style.display =
      "flex";
  }

  modal.innerHTML = `

    <div style="
      background: white;
      padding: 30px;
      border-radius: 12px;
      width: 90%;
      max-width: 380px;
      text-align: center;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    ">

      <h3 style="
        color: #0f172a;
        margin-top: 0;
        margin-bottom: 10px;
      ">
        📝 クイズモード
      </h3>

      <p style="
        color: #475569;
        font-size: 0.95em;
        margin-bottom: 20px;
      ">
        クイズ機能は現在準備中です！
      </p>

      <button
        onclick="closeFlashcardModal()"
        style="
          padding: 10px 20px;
          background: #0284c7;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: bold;
        "
      >閉じる</button>

    </div>
  `;
};


// ==========================================
// ログアウト
// ==========================================

window.logout = function() {
  localStorage.removeItem(
    "currentUser"
  );

  location.reload();
};
