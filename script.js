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

// スペル候補表示用
let pendingSpellingSuggestions = {};

const WORKER_URL =
  'https://ifty.humbleflail205.workers.dev/';


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

    loadUserData(
      currentUser
    );

    initChatSystem();
  }
);


// ==========================================
// 2. ユーザーデータ管理
// ==========================================

function loadUserData(
  username
) {

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

      JSON.stringify(
        folders
      )
    );

  } catch (e) {}
}


// ==========================================
// 3. フォルダ管理
// ==========================================

window.createFolder =
function() {

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

  input.value =
    "";

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

    folder.words =
      [];

    saveUserData();

    renderFolders();
  }
};


function renderFolders() {

  const container =
    document.getElementById(
      "folders"
    );

  if (!container) {
    return;
  }

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

        const suggestion =
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
        margin-bottom:
          ${
            folder.collapsed
              ? '0'
              : '8px'
          };
      ">

        <div
          style="
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
          "
          onclick="
            toggleFolderCollapse(
              '${folder.id}'
            )
          "
        >

          <span style="
            font-size: 0.9em;
            color: #64748b;
          ">
            ${
              folder.collapsed
                ? '▶'
                : '▼'
            }
          </span>

          <h3 style="
            margin: 0;
            color: #0f172a;
            font-size: 1.1em;
          ">
            📁 ${escapeHtml(
              folder.name
            )}
            (${
              folder.words
                ? folder.words.length
                : 0
            }件)
          </h3>
        </div>

        <div style="
          display: flex;
          gap: 4px;
          align-items: center;
        ">

          <button
            onclick="
              moveFolder(
                ${fIndex},
                -1
              )
            "
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
            onclick="
              moveFolder(
                ${fIndex},
                1
              )
            "
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
            onclick="
              clearFolderWords(
                '${folder.id}'
              )
            "
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
            onclick="
              deleteFolder(
                '${folder.id}'
              )
            "
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

      ${
        folder.collapsed
          ? ''
          : `

        <div style="
          display: flex;
          gap: 6px;
          margin-bottom: 10px;
          margin-top: 8px;
        ">

          <input
            id="
              wordInput_${folder.id}
            "
            placeholder="
              単語を入力（Enterまたは追加でAI自動生成）
            "
            onkeydown="
              if(
                event.key ===
                'Enter'
              ){
                addWordToFolder(
                  '${folder.id}'
                );
              }
            "
            style="
              flex: 1;
              padding: 8px;
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              font-size: 0.9em;
            "
          >

          <button
            onclick="
              addWordToFolder(
                '${folder.id}'
              )
            "
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
          suggestion
            ? renderSpellingSuggestion(
                folder.id,
                suggestion
              )
            : ''
        }

        <div style="
          display: flex;
          flex-direction: column;
          gap: 8px;
        ">

          ${
            (
              folder.words ||
              []
            )
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
// スペル候補UI
// ==========================================

function renderSpellingSuggestion(
  folderId,
  suggestion
) {

  return `
    <div style="
      background: #eff6ff;
      border: 1px solid #93c5fd;
      border-radius: 7px;
      padding: 10px 12px;
      margin-bottom: 10px;
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
          onclick="
            acceptSpellingSuggestion(
              '${folderId}'
            )
          "
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
          を追加
        </button>

        <button
          onclick="
            keepOriginalSpelling(
              '${folderId}'
            )
          "
          style="
            background: #e2e8f0;
            color: #334155;
            border: none;
            padding: 6px 10px;
            border-radius: 5px;
            cursor: pointer;
          "
        >
          ${
            escapeHtml(
              suggestion.original
            )
          }
          のまま追加
        </button>

        <button
          onclick="
            cancelSpellingSuggestion(
              '${folderId}'
            )
          "
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
async function(
  folderId
) {

  const suggestion =
    pendingSpellingSuggestions[
      folderId
    ];

  if (!suggestion) {
    return;
  }

  const word =
    suggestion.suggested;

  delete pendingSpellingSuggestions[
    folderId
  ];

  renderFolders();

  await generateAndAddWord(
    folderId,
    word
  );
};


window.keepOriginalSpelling =
async function(
  folderId
) {

  const suggestion =
    pendingSpellingSuggestions[
      folderId
    ];

  if (!suggestion) {
    return;
  }

  const word =
    suggestion.original;

  delete pendingSpellingSuggestions[
    folderId
  ];

  renderFolders();

  await generateAndAddWord(
    folderId,
    word
  );
};


window.cancelSpellingSuggestion =
function(
  folderId
) {

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
    w.forms ||
    {};

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
            ${
              escapeHtml(
                w.word ||
                ''
              )
            }
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
            meanings.length >
            0
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
                      meanings.length >
                      1
                        ? `${
                            i +
                            1
                          }. `
                        : ''
                    }

                    ${
                      escapeHtml(
                        meaning
                      )
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
                  ? `過去 ${
                      escapeHtml(
                        forms.past
                      )
                    }　`
                  : ''
              }

              ${
                forms.pastParticiple
                  ? `過去分詞 ${
                      escapeHtml(
                        forms.pastParticiple
                      )
                    }　`
                  : ''
              }

              ${
                forms.ing
                  ? `-ing ${
                      escapeHtml(
                        forms.ing
                      )
                    }　`
                  : ''
              }

              ${
                forms.thirdPerson
                  ? `三単現 ${
                      escapeHtml(
                        forms.thirdPerson
                      )
                    }`
                  : ''
              }

            </div>
          `
              : ''
          }

          ${
            examples.length >
            0
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

                    ${
                      escapeHtml(
                        ex.en ||
                        ''
                      )
                    }

                    ${
                      ex.en
                        ? `
                      <button
                        onclick="
                          speakWord(
                            '${escapeHtml(
                              String(
                                ex.en
                              )
                              .replace(
                                /'/g,
                                "\\'"
                              )
                            )}'
                          )
                        "
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
                      ${
                        escapeHtml(
                          ex.ja
                        )
                      }
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
            derivatives.length >
            0
              ? `
            <div style="
              margin-top: 7px;
              color: #475569;
              font-size: 0.82em;
            ">

              <b>
                派生語：
              </b>

              ${
                derivatives
                  .map(
                    d =>
                      escapeHtml(
                        d
                      )
                  )
                  .join(
                    ' / '
                  )
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
              💡 ${
                escapeHtml(
                  w.details
                )
              }
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
              onclick="
                speakWord(
                  '${escapeHtml(
                    String(
                      w.word
                    )
                    .replace(
                      /'/g,
                      "\\'"
                    )
                  )}'
                )
              "
              style="
                background: #0284c7;
                color: white;
                border: none;
                padding: 3px 6px;
                border-radius: 4px;
                font-size: 0.75em;
                cursor: pointer;
              "
              title="
                単語を発音
              "
            >🔊</button>
          `
              : ''
          }

          <button
            onclick="
              openEditWordModal(
                '${folderId}',
                ${wIndex}
              )
            "
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
            onclick="
              moveWordWithinFolder(
                '${folderId}',
                ${wIndex},
                -1
              )
            "
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
            onclick="
              moveWordWithinFolder(
                '${folderId}',
                ${wIndex},
                1
              )
            "
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
            onclick="
              deleteWord(
                '${folderId}',
                ${wIndex}
              )
            "
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

window.addWordToFolder =
async function(
  folderId
) {

  const input =
    document.getElementById(
      `wordInput_${folderId}`
    );

  if (!input) {
    return;
  }

  const wordText =
    input.value.trim();

  const folder =
    folders.find(
      f =>
        f.id ===
        folderId
    );

  if (!folder) {
    return;
  }

  if (!folder.words) {
    folder.words = [];
  }

  if (!wordText) {

    folder.words.push({
      word: '',
      meanings: [''],
      examples: [],
      details: '',
      mastery:
        'unfixed'
    });

    input.value =
      "";

    saveUserData();

    renderFolders();

    return;
  }

  input.value =
    "";

  // ==========================================
  // スペル確認
  // ==========================================

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
                "word_check",

              word:
                wordText
            })
        }
      );

    if (
      response.ok
    ) {

      const spellData =
        await response.json();

      if (
        spellData &&
        spellData.valid ===
          false &&
        spellData.suggestion &&
        String(
          spellData.suggestion
        )
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
      "Spell check failed:",
      error
    );
  }

  await generateAndAddWord(
    folderId,
    wordText
  );
};


// ==========================================
// 実際のAI単語生成
// ==========================================

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

  if (!folder) {
    return;
  }

  if (!folder.words) {
    folder.words = [];
  }

  const newWordObj = {

    word:
      wordText,

    meanings:
      [
        '生成中...'
      ],

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
                wordText,

              language:
                "ja",

              format:
                "dictionary",

              requirements: {

                concise:
                  true,

                includePronunciation:
                  true,

                includePartOfSpeech:
                  true,

                includeTransitivity:
                  true,

                includeCountability:
                  true,

                includeExamMeanings:
                  true,

                includeExamples:
                  true,

                includeInflections:
                  true,

                includeDerivatives:
                  true,

                shortDetails:
                  true
              }
            })
        }
      );

    if (
      !response.ok
    ) {

      throw new Error(
        "HTTP " +
        response.status
      );
    }

    const data =
      await response.json();

    applyWordData(
      newWordObj,
      data
    );

  } catch (e) {

    const fallback =
      generateSmartWordData(
        wordText
      );

    newWordObj.meanings =
      [
        fallback.meaning
      ];

    newWordObj.examples =
      [
        {
          en:
            fallback.example,

          ja:
            ""
        }
      ];
  }

  saveUserData();

  renderFolders();

  setTimeout(
    () => {

      speakWord(
        wordText
      );

    },
    500
  );
}


// ==========================================
// AIから返されたデータ反映
// ==========================================

function applyWordData(
  wordObj,
  data
) {

  if (!data) {
    return;
  }

  if (
    data.word
  ) {

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
      [
        data.meaning
      ];
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
              en:
                ex,
              ja:
                ""
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
// 単語移動
// ==========================================

window.moveWordWithinFolder =
function(
  folderId,
  wordIndex,
  direction
) {

  const folder =
    folders.find(
      f =>
        f.id ===
        folderId
    );

  if (
    !folder ||
    !folder.words
  ) {
    return;
  }

  const newIndex =
    wordIndex +
    direction;

  if (
    newIndex < 0 ||
    newIndex >=
      folder.words.length
  ) {
    return;
  }

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
// 単語編集
// ==========================================

window.openEditWordModal =
function(
  folderId,
  wordIndex
) {

  const folder =
    folders.find(
      f =>
        f.id ===
        folderId
    );

  if (
    !folder ||
    !folder.words[
      wordIndex
    ]
  ) {
    return;
  }

  const w =
    folder.words[
      wordIndex
    ];

  let modal =
    document.getElementById(
      "editWordModal"
   
