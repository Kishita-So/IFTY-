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

let pendingSpellingSuggestions = {};

const WORKER_URL =
  'https://ifty.humbleflail205.workers.dev/';


// ==========================================
// ALLIA 表示統一
// ==========================================

function applyAlliaBranding() {

  // ブラウザタブ名
  if (document.title) {
    document.title =
      document.title
        .replace(/Grok AI/gi, "ALLIA")
        .replace(/Grok/gi, "ALLIA");
  } else {
    document.title =
      "スマート単語帳 & ALLIA";
  }

  // チャット入力欄
  const chatInput =
    document.getElementById("chatInput");

  if (chatInput) {

    chatInput.placeholder =
      'ALLIAに質問、または「○○の意味」など…';

    // 入力欄に初期値としてALLIAやGrokが
    // 入ってしまっている場合は消す
    const currentValue =
      String(chatInput.value || "")
        .trim();

    if (
      currentValue === "ALLIA" ||
      currentValue === "Grok" ||
      currentValue === "GROK"
    ) {
      chatInput.value = "";
    }
  }

  // HTML側に残っているGrok表記も可能な範囲で修正
  const inputs =
    document.querySelectorAll(
      'input, textarea'
    );

  inputs.forEach(el => {

    if (
      typeof el.placeholder ===
      "string" &&
      /grok/i.test(el.placeholder)
    ) {

      el.placeholder =
        el.placeholder.replace(
          /Grok/gi,
          "ALLIA"
        );
    }
  });
}


// ==========================================
// 1. 初期化処理
// ==========================================

document.addEventListener(
  "DOMContentLoaded",
  function() {

    localStorage.setItem(
      "currentUser",
      currentUser
    );

    const landingPage =
      document.getElementById(
        "landingPage"
      );

    if (landingPage) {
      landingPage.style.display =
        "none";
    }

    const mainPortal =
      document.getElementById(
        "mainPortal"
      );

    if (mainPortal) {
      mainPortal.style.display =
        "block";
    }

    const userDisplay =
      document.getElementById(
        "userDisplay"
      );

    if (userDisplay) {
      userDisplay.textContent =
        currentUser;
    }

    const floatingAiBtn =
      document.getElementById(
        "floatingAiBtn"
      );

    if (floatingAiBtn) {
      floatingAiBtn.style.display =
        "flex";
    }

    // ALLIA表記へ統一
    applyAlliaBranding();

    loadUserData(
      currentUser
    );

    initChatSystem();

    // initChatSystem後にも再適用
    // HTMLや他処理によって値が戻るのを防ぐ
    applyAlliaBranding();
  }
);


// ==========================================
// 2. ユーザーデータ管理
// ==========================================

function loadUserData(username) {
  try {

    const saved =
      localStorage.getItem(
        "vocab_user_" +
        username
      );

    if (saved) {
      folders =
        JSON.parse(saved);
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
      "vocab_user_" +
      currentUser,
      JSON.stringify(folders)
    );

  } catch (e) {}
}


// ==========================================
// 3. フォルダ管理
// ==========================================

window.createFolder = function() {

  const input =
    document.getElementById(
      "folderName"
    );

  if (!input) return;

  const name =
    input.value.trim();

  if (!name) {

    alert(
      "フォルダ名を入力してください。"
    );

    return;
  }

  folders.push({
    id:
      'folder_' +
      Date.now(),
    name:
      name,
    collapsed:
      false,
    words:
      []
  });

  input.value = "";

  saveUserData();
  renderFolders();
};


window.toggleFolderCollapse =
function(folderId) {

  const folder =
    folders.find(
      f =>
        f.id ===
        folderId
    );

  if (folder) {

    folder.collapsed =
      !folder.collapsed;

    saveUserData();
    renderFolders();
  }
};


window.moveFolder =
function(
  index,
  direction
) {

  const newIndex =
    index +
    direction;

  if (
    newIndex < 0 ||
    newIndex >=
      folders.length
  ) {
    return;
  }

  const temp =
    folders[index];

  folders[index] =
    folders[newIndex];

  folders[newIndex] =
    temp;

  saveUserData();
  renderFolders();
};


window.clearFolderWords =
function(folderId) {

  if (
    !confirm(
      "このフォルダ内の単語をすべて削除しますか？"
    )
  ) {
    return;
  }

  const folder =
    folders.find(
      f =>
        f.id ===
        folderId
    );

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

  const container =
    document.getElementById(
      "folders"
    );

  if (!container) return;

  if (
    folders.length ===
    0
  ) {

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

  container.innerHTML =
    folders.map(
      (
        folder,
        fIndex
      ) => {

        const spellingSuggestion =
          pendingSpellingSuggestions[
            folder.id
          ];

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
            style="
              display: flex;
              align-items: center;
              gap: 8px;
              cursor: pointer;
            "
            onclick="toggleFolderCollapse('${folder.id}')"
          >

            <span style="
              font-size: 0.9em;
              color: #64748b;
            ">
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

          <div style="
            display: flex;
            gap: 4px;
            align-items: center;
          ">

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

          ${
            spellingSuggestion
              ? renderSpellingSuggestion(
                  folder.id,
                  spellingSuggestion
                )
              : ''
          }

          <div style="
            display: flex;
            flex-direction: column;
            gap: 8px;
          ">

            ${(folder.words || [])
              .map(
                (
                  w,
                  wIndex
                ) =>
                  renderWordItem(
                    w,
                    folder.id,
                    wIndex
                  )
              )
              .join('')
            }

          </div>
        `}
      </div>
    `;
      }
    )
    .join('');
}


// ==========================================
// スペル候補
// ==========================================

function renderSpellingSuggestion(
  folderId,
  suggestion
) {

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

      <div style="
        margin-bottom: 8px;
      ">
        もしかして
        <b>
          ${escapeHtml(
            suggestion.suggested
          )}
        </b>
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
          ${escapeHtml(
            suggestion.suggested
          )}
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
          ${escapeHtml(
            suggestion.original
          )}
          のまま
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


window.acceptSpellingSuggestion =
async function(folderId) {

  const suggestion =
    pendingSpellingSuggestions[
      folderId
    ];

  if (!suggestion) return;

  const correctedWord =
    suggestion.suggested;

  delete pendingSpellingSuggestions[
    folderId
  ];

  renderFolders();

  await generateAndAddWord(
    folderId,
    correctedWord
  );
};


window.keepOriginalSpelling =
async function(folderId) {

  const suggestion =
    pendingSpellingSuggestions[
      folderId
    ];

  if (!suggestion) return;

  const originalWord =
    suggestion.original;

  delete pendingSpellingSuggestions[
    folderId
  ];

  renderFolders();

  await generateAndAddWord(
    folderId,
    originalWord
  );
};


window.cancelSpellingSuggestion =
function(folderId) {

  delete pendingSpellingSuggestions[
    folderId
  ];

  renderFolders();
};


// ==========================================
// 単語カード表示
// ==========================================

function renderWordItem(
  w,
  folderId,
  wIndex
) {

  const meanings =
    Array.isArray(
      w.meanings
    )
      ? w.meanings
      : (
          w.meanings
            ? [w.meanings]
            : []
        );

  const examples =
    Array.isArray(
      w.examples
    )
      ? w.examples
      : [];

  const derivatives =
    Array.isArray(
      w.derivatives
    )
      ? w.derivatives
      : (
          w.derivatives
            ? [w.derivatives]
            : []
        );

  const forms =
    w.forms || {};

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

        <div style="
          flex: 1;
          min-width: 0;
        ">

          <div style="
            font-size: 1.25em;
            font-weight: bold;
            color: #0f172a;
          ">
            ${escapeHtml(
              w.word || ''
            )}
          </div>

          ${
            (
              w.pronunciation ||
              w.partOfSpeech
            )
              ? `
            <div style="
              margin-top: 2px;
              color: #64748b;
              font-size: 0.85em;
            ">
              ${
                w.pronunciation
                  ? escapeHtml(
                      w.pronunciation
                    )
                  : ''
              }
              ${
                w.pronunciation &&
                w.partOfSpeech
                  ? '　'
                  : ''
              }
              ${
                w.partOfSpeech
                  ? escapeHtml(
                      w.partOfSpeech
                    )
                  : ''
              }
            </div>
          `
              : ''
          }

          ${
            (
              w.transitivity ||
              w.countability
            )
              ? `
            <div style="
              margin-top: 3px;
              color: #475569;
              font-size: 0.82em;
            ">
              ${
                w.transitivity
                  ? escapeHtml(
                      w.transitivity
                    )
                  : ''
              }
              ${
                w.transitivity &&
                w.countability
                  ? ' / '
                  : ''
              }
              ${
                w.countability
                  ? escapeHtml(
                      w.countability
                    )
                  : ''
              }
            </div>
          `
              : ''
          }

          ${
            meanings.length > 0
              ? `
            <div style="
              margin-top: 7px;
              color: #0f172a;
              line-height: 1.5;
            ">
              ${
                meanings
                  .map(
                    (
                      meaning,
                      i
                    ) => `
                <div>
                  ${
                    meanings.length > 1
                      ? `${i + 1}. `
                      : ''
                  }
                  ${escapeHtml(
                    meaning
                  )}
                </div>
              `
                  )
                  .join('')
              }
            </div>
          `
              : ''
          }

          ${
            (
              forms.past ||
              forms.pastParticiple ||
              forms.ing ||
              forms.thirdPerson
            )
              ? `
            <div style="
              margin-top: 7px;
              padding: 6px 8px;
              background: #eef2ff;
              border-radius: 5px;
              font-size: 0.82em;
              color: #334155;
            ">
              <b>活用：</b>
              ${
                forms.past
                  ? `過去 ${escapeHtml(forms.past)}　`
                  : ''
              }
              ${
                forms.pastParticiple
                  ? `過去分詞 ${escapeHtml(forms.pastParticiple)}　`
                  : ''
              }
              ${
                forms.ing
                  ? `-ing ${escapeHtml(forms.ing)}　`
                  : ''
              }
              ${
                forms.thirdPerson
                  ? `三単現 ${escapeHtml(forms.thirdPerson)}`
                  : ''
              }
            </div>
          `
              : ''
          }

          ${
            examples.length > 0
              ? `
            <div style="
              margin-top: 8px;
              color: #334155;
              line-height: 1.45;
            ">

              <b style="
                font-size: 0.82em;
              ">
                例文
              </b>

              ${
                examples
                  .map(
                    ex => `
                <div style="
                  margin-top: 4px;
                  padding-left: 4px;
                ">

                  <div>
                    ${escapeHtml(
                      ex.en || ''
                    )}

                    ${
                      ex.en
                        ? `
                      <button
                        onclick="speakWord('${escapeHtml(
                          String(
                            ex.en
                          ).replace(
                            /'/g,
                            "\\'"
                          )
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
                    `
                        : ''
                    }
                  </div>

                  ${
                    ex.ja
                      ? `
                    <div style="
                      color: #64748b;
                      font-size: 0.9em;
                    ">
                      ${escapeHtml(
                        ex.ja
                      )}
                    </div>
                  `
                      : ''
                  }

                </div>
              `
                  )
                  .join('')
              }
            </div>
          `
              : ''
          }

          ${
            derivatives.length > 0
              ? `
            <div style="
              margin-top: 7px;
              color: #475569;
              font-size: 0.82em;
            ">
              <b>派生語：</b>
              ${
                derivatives
                  .map(
                    d =>
                      escapeHtml(d)
                  )
                  .join(' / ')
              }
            </div>
          `
              : ''
          }

          ${
            w.details
              ? `
            <div style="
              font-size: 0.8em;
              color: #0284c7;
              margin-top: 6px;
              line-height: 1.35;
            ">
              💡 ${escapeHtml(
                w.details
              )}
            </div>
          `
              : ''
          }

        </div>

        <div style="
          display: flex;
          gap: 3px;
          align-items: center;
          margin-left: 8px;
        ">

          ${
            w.word
              ? `
            <button
              onclick="speakWord('${escapeHtml(
                String(
                  w.word
                ).replace(
                  /'/g,
                  "\\'"
                )
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
          `
              : ''
          }

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
// 単語追加
// ==========================================

window.addWordToFolder =
async function(folderId) {

  const input =
    document.getElementById(
      `wordInput_${folderId}`
    );

  if (!input) return;

  const wordText =
    input.value.trim();

  const folder =
    folders.find(
      f =>
        f.id ===
        folderId
    );

  if (!folder) return;

  if (!folder.words) {
    folder.words = [];
  }

  if (!wordText) {
    return;
  }

  input.value = "";

  delete pendingSpellingSuggestions[
    folderId
  ];

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

          body:
            JSON.stringify({
              type:
                "word_check",
              word:
                wordText
            })
        }
      );

    if (
      spellResponse.ok
    ) {

      const spellData =
        await spellResponse.json();

      if (
        spellData &&
        spellData.valid === false &&
        spellData.suggestion &&
        String(
          spellData.suggestion
        )
          .trim()
          .toLowerCase() !==
        wordText.toLowerCase()
      ) {

        pendingSpellingSuggestions[
          folderId
        ] = {
          original:
            wordText,
          suggested:
            String(
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
  }

  await generateAndAddWord(
    folderId,
    wordText
  );
};


async function generateAndAddWord(
  folderId,
  wordText
) {

  const folder =
    folders.find(
      f =>
        f.id ===
        folderId
    );

  if (!folder) return;

  if (!folder.words) {
    folder.words = [];
  }

  const newWordObj = {
    word:
      wordText,
    meanings:
      ['生成中...'],
    examples:
      [],
    details:
      '',
    mastery:
      'unfixed'
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
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              type:
                "word",
              word:
                wordText
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
  }

  if (
    Array.isArray(
      data.examples
    )
  ) {
    wordObj.examples =
      data.examples;
  }

  if (
    data.pronunciation
  ) {
    wordObj.pronunciation =
      data.pronunciation;
  }

  if (
    data.partOfSpeech
  ) {
    wordObj.partOfSpeech =
      data.partOfSpeech;
  }

  if (
    data.transitivity
  ) {
    wordObj.transitivity =
      data.transitivity;
  }

  if (
    data.countability
  ) {
    wordObj.countability =
      data.countability;
  }

  if (
    data.details
  ) {
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
// ALLIAチャット
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

  // 初期化後も入力欄を空にしてALLIA表記に統一
  applyAlliaBranding();
}


window.createNewChatSession =
function() {

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
          'こんにちは！ALLIAです。何でも聞いてください！'
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

  applyAlliaBranding();
};


window.sendChatMessage =
async function() {

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
  ) {
    return;
  }

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

  const history =
    session.messages
      .filter(
        m =>
          m.role ===
            'user' ||
          m.role ===
            'assistant'
      )
      .slice(-12)
      .map(
        m => ({
          role:
            m.role,
          content:
            m.text
        })
      );

  session.messages.push({
    role:
      'user',
    text:
      userMsg
  });

  // 送信後は完全に空にする
  input.value = "";

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
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
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

    if (
      response.ok
    ) {

      replyText =
        data.reply ||
        data.content ||
        data.message ||
        "応答を取得しました。";

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
    role:
      'assistant',
    text:
      replyText
  });

  saveChatSessions();
  renderChatMessages();

  // 返答後にも入力欄がALLIA等に戻らないよう保証
  applyAlliaBranding();

  const refreshedInput =
    document.getElementById(
      "chatInput"
    );

  if (refreshedInput) {
    refreshedInput.value = "";
  }
};


// ==========================================
// チャット保存・表示
// ==========================================

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
    chatSessions
      .map(
        s => `
      <option
        value="${s.id}"
        ${
          s.id ===
          currentChatSessionId
            ? 'selected'
            : ''
        }
      >
        ${
          escapeHtml(
            s.title ||
            'ALLIA'
          )
        }
      </option>
    `
      )
      .join('');
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

    container.innerHTML =
      "";

    return;
  }

  container.innerHTML =
    session.messages
      .map(
        m => `
      <div style="
        display: flex;
        justify-content:
          ${
            m.role ===
            'user'
              ? 'flex-end'
              : 'flex-start'
          };
        margin-bottom: 8px;
      ">

        <div style="
          background:
            ${
              m.role ===
              'user'
                ? '#0284c7'
                : '#e2e8f0'
            };
          color:
            ${
              m.role ===
              'user'
                ? 'white'
                : '#0f172a'
            };
          padding: 10px 14px;
          border-radius: 8px;
          max-width: 80%;
          word-break: break-word;
          white-space: pre-wrap;
          font-size: 0.95em;
          line-height: 1.5;
        ">
          ${escapeHtml(
            m.text
          )}
        </div>

      </div>
    `
      )
      .join('');

  container.scrollTop =
    container.scrollHeight;
}


// ==========================================
// 既存補助処理
// ==========================================

window.speakWord =
function(text) {

  if (
    !(
      'speechSynthesis'
      in window
    )
  ) return;

  window
    .speechSynthesis
    .cancel();

  const utterance =
    new SpeechSynthesisUtterance(
      text
    );

  utterance.lang =
    'en-US';

  utterance.rate =
    1.0;

  window
    .speechSynthesis
    .speak(
      utterance
    );
};


function escapeHtml(str) {

  if (!str) return '';

  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
