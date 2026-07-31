// localStorage データの取得と安全な補正
let rawFolders = JSON.parse(localStorage.getItem("folders")) || [];
let folders = rawFolders.map(f => ({
  id: f.id || Date.now() + Math.random(),
  name: f.name || "無題のフォルダ",
  isCollapsed: f.isCollapsed || false,
  words: Array.isArray(f.words) ? f.words : []
}));

const foldersEl = document.getElementById("folders");
const createBtn = document.getElementById("createFolderBtn");
const folderInput = document.getElementById("folderName");

// 1. 不規則動詞データベース
const irregularVerbs = {
  "swell": "swell - swelled - swollen/swelled - swelling",
  "slay": "slay - slew - slain - slaying",
  "forgive": "forgive - forgave - forgiven - forgiving",
  "say": "say - said - said - saying",
  "give": "give - gave - given - giving",
  "do": "do - did - done - doing",
  "go": "go - went - gone - going",
  "see": "see - saw - seen - seeing",
  "take": "take - took - taken - taking",
  "have": "have - had - had - having",
  "come": "come - came - come - coming",
  "make": "make - made - made - making",
  "speak": "speak - spoke - spoken - speaking",
  "write": "write - wrote - written - writing",
  "know": "know - knew - known - knowing",
  "get": "get - got - gotten - getting",
  "find": "find - found - found - finding",
  "think": "think - thought - thought - thinking",
  "dwell": "dwell - dwelt/dwelled - dwelt/dwelled - dwelling"
};

// 2. 自動詞に伴う前置詞
const verbPrepositions = {
  "dwell": "on / in（〜に固執する、〜に住む）",
  "listen": "to（〜を聴く）",
  "depend": "on（〜に依存する）",
  "rely": "on（〜に頼る）",
  "look": "at / for / after（〜を見る / 探す / 世話する）",
  "apologize": "to [人] for [事]（〜に謝罪する）",
  "belong": "to（〜に所属する）",
  "complain": "about / of（〜について不平を言う）",
  "consist": "of（〜で構成される）",
  "participate": "in（〜に参加する）"
};

// 3. 英和辞典風データベース
const dictionaryDB = {
  "be interested in": ["【熟語】 〜に興味がある、〜に関心を持っている"],
  "dwell on": ["【熟語】 〜をくどくど考える、〜に固執する"],
  "dwell": [
    "【動・自】 住む、宿る、居住する",
    "【動・自】 （dwell onで）〜をくどくど考える、〜に固執する"
  ],
  "swell": [
    "【動・自】 膨らむ、腫れる、むくむ（怪我・病気）",
    "【動・自】 （声・感情・数量が）増大する、高まる",
    "【動・他】 〜を膨らませる、〜を増大させる",
    "【名・可】 膨らみ、うねり、湧き上がり",
    "【形】 素晴らしい、最高の、ハイカラな（口語）"
  ],
  "say": [
    "【動・他】 〜と言う、〜と述べる（発言内容に重点）",
    "【動・他】 （本・標識・時計に）〜と書いてある、〜を示している",
    "【副/接】 例えば、仮に〜とすれば（例: Let's say...）",
    "【名・可】 発言権、決定権（例: have a say in...）"
  ],
  "kill": [
    "【動・他】 〜を殺す、殺害する",
    "【動・他】 〜を台無しにする、〜を台無しにして終わらせる",
    "【動・他】 （時間を）つぶす（kill time）",
    "【動・他】 （痛みを）和らげる（painkiller）",
    "【名・可】 殺害、獲物"
  ],
  "play": [
    "【動・自/他】 遊ぶ、演奏する、（スポーツ・ゲームを）する",
    "【動・他】 （役を）演じる、〜を演劇で演じる",
    "【名・可】 劇、戯曲",
    "【名・不可】 遊び、いたずら、ゆとり・遊び幅"
  ]
};

const wordDictionary = ["kill", "play", "say", "dwell", "swell", "forgive", "slay", "think", "speak", "write", "make", "take", "give", "listen", "depend"];

// スペル予測アルゴリズム
function getLevenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function findSpellingSuggestion(inputWord) {
  let closestWord = "";
  let minDistance = 3;
  for (const dictWord of wordDictionary) {
    const dist = getLevenshteinDistance(inputWord.toLowerCase(), dictWord);
    if (dist < minDistance && dist > 0) {
      minDistance = dist;
      closestWord = dictWord;
    }
  }
  return closestWord;
}

// --- フォルダ作成 ---
function createFolder() {
  if (!folderInput) return;
  const name = folderInput.value.trim();
  if (!name) return;

  folders.push({
    id: Date.now(),
    name: name,
    isCollapsed: false,
    words: []
  });

  folderInput.value = "";
  save();
  render();
}

if (createBtn) createBtn.onclick = createFolder;
if (folderInput) {
  folderInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      createFolder();
    }
  });
}

window.toggleFolder = function(folderId) {
  const f = folders.find(x => x.id === folderId);
  if (f) {
    f.isCollapsed = !f.isCollapsed;
    save();
    render();
  }
};

window.deleteFolder = function(folderId) {
  if (confirm("このフォルダを削除しますか？")) {
    folders = folders.filter(f => f.id !== folderId);
    save();
    render();
  }
};

window.deleteWord = function(folderId, index) {
  const f = folders.find(x => x.id === folderId);
  if (f) {
    f.words.splice(index, 1);
    save();
    render();
  }
};

window.updateMeaningHTML = function(folderId, wordIndex, meaningIndex, newHTML) {
  const f = folders.find(x => x.id === folderId);
  if (f && f.words[wordIndex] && f.words[wordIndex].meanings) {
    f.words[wordIndex].meanings[meaningIndex] = newHTML;
    save();
  }
};

window.applyColorToSelection = function(color) {
  document.execCommand('foreColor', false, color);
};

function save(){
  localStorage.setItem("folders", JSON.stringify(folders));
}

// 発音再生
window.playAudio = function(audioUrl, wordText) {
  setTimeout(() => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play().catch(() => speakFallback(wordText));
    } else {
      speakFallback(wordText);
    }
  }, 500);
};

function speakFallback(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const uttr = new SpeechSynthesisUtterance(text);
    uttr.lang = 'en-US';
    uttr.rate = 0.9;
    window.speechSynthesis.speak(uttr);
  }
}

async function fetchCleanWordJP(text) {
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ja&dt=t&q=${encodeURIComponent(text)}`);
    const data = await res.json();
    let translated = data[0].map(item => item[0]).join("");
    return translated.replace(/[。、.]$/g, '').trim();
  } catch (e) {
    return text;
  }
}

async function generateNaturalExample(word) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (res.ok) {
      const data = await res.json();
      for (const entry of data) {
        for (const m of entry.meanings) {
          for (const d of m.definitions) {
            if (d.example) {
              const jp = await fetchCleanWordJP(d.example);
              return { en: d.example, jp: jp };
            }
          }
        }
      }
    }
  } catch (e) {}

  const fallbackEn = `She learned how to use "${word}" correctly.`;
  const fallbackJp = await fetchCleanWordJP(fallbackEn);
  return { en: fallbackEn, jp: fallbackJp };
}

// --- 単語追加処理 ---
window.addWord = async function(folderId, word){
  const cleanWord = word.trim();
  if(!cleanWord) return;

  let audioUrl = "";
  let meanings = [];
  let inflections = "";
  let examples = [];
  let prepNote = "";
  let suggestion = "";

  const lowerWord = cleanWord.toLowerCase();

  const suggestedWord = findSpellingSuggestion(lowerWord);
  if (suggestedWord) suggestion = suggestedWord;

  if (verbPrepositions[lowerWord]) prepNote = verbPrepositions[lowerWord];
  if (irregularVerbs[lowerWord]) inflections = irregularVerbs[lowerWord];

  if (dictionaryDB[lowerWord]) {
    meanings = [...dictionaryDB[lowerWord]];
  }

  try {
    const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`);
    
    if (dictRes.ok) {
      const dictData = await dictRes.json();
      const entry = dictData[0];

      const audioObj = entry.phonetics?.find(p => p.audio && p.audio.length > 0);
      if (audioObj) audioUrl = audioObj.audio;

      if (meanings.length === 0) {
        for (const m of entry.meanings) {
          let part = m.partOfSpeech;
          let partLabel = part;
          if (part === "verb") partLabel = "動・自/他";
          else if (part === "noun") partLabel = "名・可/不可";
          else if (part === "adjective") partLabel = "形";
          else if (part === "adverb") partLabel = "副";
          else if (part === "preposition") partLabel = "前";
          else if (part === "conjunction") partLabel = "接";

          const defsToTake = m.definitions.slice(0, 3);
          for (const def of defsToTake) {
            if (def.definition) {
              const jpDef = await fetchCleanWordJP(def.definition);
              meanings.push(`【${partLabel}】 ${jpDef}`);
            }
          }
        }
      }

      for (const m of entry.meanings) {
        for (const def of m.definitions) {
          if (def.example && examples.length < 2) {
            const exJP = await fetchCleanWordJP(def.example);
            examples.push({ en: def.example, jp: exJP });
          }
        }
      }
    }
  } catch (e) {
    console.error("辞書APIエラー:", e);
  }

  if (examples.length === 0) {
    const natEx = await generateNaturalExample(cleanWord);
    examples.push(natEx);
  }

  if (meanings.length === 0) {
    const fallbackJP = await fetchCleanWordJP(cleanWord);
    meanings.push(`【訳】 ${fallbackJP}`);
  }

  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.words.push({
      word: cleanWord,
      audio: audioUrl,
      meanings: meanings,
      inflections: inflections,
      prepNote: prepNote,
      suggestion: suggestion,
      examples: examples
    });
    save();
    render();
  }
};

// --- 画面描画 ---
function render(){
  if (!foldersEl) return;
  foldersEl.innerHTML = "";

  folders.forEach(folder => {
    const div = document.createElement("div");
    div.className = "folder";
    div.style.cssText = "background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-bottom: 16px;";

    const isCollapsed = folder.isCollapsed || false;

    div.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 8px; cursor: pointer;" onclick="toggleFolder(${folder.id})">
          <span style="font-size: 1.1em; color: #64748b;">${isCollapsed ? '▶' : '▼'}</span>
          <h2 style="margin: 0; font-size: 1.2em; color: #0f172a;">📁 ${folder.name} <span style="font-size:0.8em; color:#64748b; font-weight:normal;">(${folder.words.length}語)</span></h2>
        </div>
        <button onclick="deleteFolder(${folder.id})" style="background-color: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">🗑️ 削除</button>
      </div>

      ${!isCollapsed ? `
        <div style="margin-top: 12px;">
          <input placeholder="単語を入力してEnter"
            onkeydown="if(event.key==='Enter'){ addWord(${folder.id}, this.value); this.value=''; }"
            style="width: 100%; padding: 8px; box-sizing: border-box; margin-bottom: 10px; border: 1px solid #cbd5e1; border-radius: 4px;"
          >

          ${folder.words.map((w, wordIndex) => `
            <div class="word" style="background: #ffffff; border: 1px solid #e2e8f0; border-left: 5px solid #2563eb; padding: 14px; margin-top: 10px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <b style="font-size: 1.3em; color: #0f172a;">${w.word}</b>
                  <button onclick="playAudio('${w.audio}', '${w.word}')" style="background:#2563eb; color:white; border:none; border-radius:50%; width:28px; height:28px; cursor:pointer; font-size:0.8em;" title="発音を聞く">🔊</button>
                </div>
                <button onclick="deleteWord(${folder.id}, ${wordIndex})" style="background-color: #f1f5f9; color: #64748b; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size:0.8em;">削除</button>
              </div>

              ${w.suggestion ? `
                <div style="margin-top: 6px; font-size: 0.85em; color: #d97706; background: #fffbeb; padding: 4px 8px; border-radius: 4px;">
                  🔍 <b>もしかして：</b> 「<a href="#" onclick="addWord(${folder.id}, '${w.suggestion}'); return false;" style="color: #2563eb; font-weight: bold;">${w.suggestion}</a>」 ですか？
                </div>
              ` : ''}

              ${w.inflections ? `
                <div style="margin-top: 6px; font-size: 0.8em; color: #0284c7; background: #f0f9ff; display: inline-block; padding: 2px 8px; border-radius: 4px;">
                  活用: ${w.inflections}
                </div>
              ` : ''}

              ${w.prepNote ? `
                <div style="margin-top: 6px; font-size: 0.82em; color: #059669; background: #ecfdf5; padding: 4px 8px; border-radius: 4px;">
                  🔗 <b>伴う前置詞:</b> ${w.prepNote}
                </div>
              ` : ''}
              
              <div style="margin-top: 10px;">
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; color: #475569;">
                  <span>選択文字に色付け:</span>
                  <button onmousedown="event.preventDefault(); applyColorToSelection('#ef4444');" style="background:#ef4444; border:none; width:18px; height:18px; border-radius:50%; cursor:pointer;" title="赤"></button>
                  <button onmousedown="event.preventDefault(); applyColorToSelection('#2563eb');" style="background:#2563eb; border:none; width:18px; height:18px; border-radius:50%; cursor:pointer;" title="青"></button>
                  <button onmousedown="event.preventDefault(); applyColorToSelection('#10b981');" style="background:#10b981; border:none; width:18px; height:18px; border-radius:50%; cursor:pointer;" title="緑"></button>
                  <button onmousedown="event.preventDefault(); applyColorToSelection('#f59e0b');" style="background:#f59e0b; border:none; width:18px; height:18px; border-radius:50%; cursor:pointer;" title="オレンジ"></button>
                  <button onmousedown="event.preventDefault(); applyColorToSelection('#0f172a');" style="background:#0f172a; border:none; width:18px; height:18px; border-radius:50%; cursor:pointer;" title="黒（元に戻す）"></button>
                </div>

                <ul style="margin: 0; padding-left: 0; list-style: none;">
                  ${w.meanings.map((m, meaningIndex) => {
                    const textContent = typeof m === 'object' ? (m.text || "") : m;
                    return `
                      <li style="margin-bottom: 4px;">
                        <div 
                          contenteditable="true" 
                          onblur="updateMeaningHTML(${folder.id}, ${wordIndex}, ${meaningIndex}, this.innerHTML)"
                          style="outline: none; padding: 4px 6px; font-size: 0.95em; color: #334155; border-radius: 4px; font-weight: 500; border: 1px transparent dashed;"
                          onmouseover="this.style.borderColor='#cbd5e1'"
                          onmouseout="this.style.borderColor='transparent'"
                          title="文字を選択して上のボタンで色を変えられます"
                        >${textContent}</div>
                      </li>
                    `;
                  }).join("")}
                </ul>
              </div>

              ${w.examples && w.examples.length > 0 ? `
                <div style="margin-top: 10px; background: #f8fafc; padding: 8px 10px; border-radius: 6px; font-size: 0.85em; border: 1px solid #f1f5f9;">
                  ${w.examples.map(ex => `
                    <div style="margin-bottom: 4px;">
                      <p style="margin: 0; color: #334155; font-weight: 500;">• ${ex.en}</p>
                      <p style="margin: 0; color: #64748b; padding-left: 10px;">${ex.jp}</p>
                    </div>
                  `).join("")}
                </div>
              ` : ''}
            </div>
          `).join("")}
        </div>
      ` : ''}
    `;

    foldersEl.appendChild(div);
  });
}

// 初期化実行
render();
