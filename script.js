// localStorage データの取得と補正
let rawFolders = JSON.parse(localStorage.getItem("folders")) || [];
let folders = rawFolders.map(f => ({
  id: f.id || Date.now() + Math.random(),
  name: f.name || "無題のフォルダ",
  isCollapsed: f.isCollapsed || false,
  words: Array.isArray(f.words) ? f.words.map(w => ({
    ...w,
    examples: Array.isArray(w.examples) ? w.examples : []
  })) : []
}));

const foldersEl = document.getElementById("folders");
const createBtn = document.getElementById("createFolderBtn");
const folderInput = document.getElementById("folderName");

// 不規則動詞データベース
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

// 自動詞に伴う前置詞
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

// 品詞の日本語変換
const posJP = {
  "noun": "【名】",
  "verb": "【動】",
  "adjective": "【形】",
  "adverb": "【副】",
  "preposition": "【前】",
  "conjunction": "【接】",
  "pronoun": "【代】",
  "interjection": "【感】"
};

function save(){
  localStorage.setItem("folders", JSON.stringify(folders));
}

// 翻訳ヘルパー
async function translateToJP(text) {
  if (!text) return "";
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ja&dt=t&q=${encodeURIComponent(text)}`);
    const data = await res.json();
    let translated = data[0].map(item => item[0]).join("");
    return translated.replace(/[。]$/g, '').trim();
  } catch (e) {
    return text;
  }
}

// 📖 辞書APIから多角的な意味と本格的な例文を確実に生成
async function generateWordDetails(word) {
  let result = {
    meanings: [],
    examples: [],
    audioUrl: ""
  };

  try {
    const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    
    if (dictRes.ok) {
      const dictData = await dictRes.json();
      const entry = dictData[0];

      // 音声の取得
      const audioObj = entry?.phonetics?.find(p => p.audio && p.audio.length > 0);
      if (audioObj) result.audioUrl = audioObj.audio;

      // 意味と例文の抽出
      if (entry.meanings && entry.meanings.length > 0) {
        for (const m of entry.meanings) {
          const tag = posJP[m.partOfSpeech] || `【${m.partOfSpeech}】`;
          
          // 定義（意味）を上位2つまで抽出
          const defs = m.definitions.slice(0, 2);
          for (const d of defs) {
            const jpDef = await translateToJP(d.definition);
            result.meanings.push(`${tag} ${jpDef}`);

            // 辞書の例文があれば取得
            if (d.example && result.examples.length < 3) {
              const jpEx = await translateToJP(d.example);
              result.examples.push({ en: d.example, jp: jpEx });
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("辞書APIエラー:", e);
  }

  // 万が一例文が取得できなかった場合の自然なフォールバック例文作成
  if (result.meanings.length === 0) {
    const fallbackJP = await translateToJP(word);
    result.meanings.push(`【訳】 ${fallbackJP}`);
  }

  if (result.examples.length === 0) {
    const sampleEn1 = `He learned the true meaning of ${word}.`;
    const sampleJp1 = await translateToJP(sampleEn1);
    result.examples.push({ en: sampleEn1, jp: sampleJp1 });

    const sampleEn2 = `This book explains how ${word} is used in modern context.`;
    const sampleJp2 = await translateToJP(sampleEn2);
    result.examples.push({ en: sampleEn2, jp: sampleJp2 });
  }

  return result;
}

// --- フォルダ操作 ---
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

window.renameFolder = function(folderId) {
  const f = folders.find(x => x.id === folderId);
  if (f) {
    const newName = prompt("新しいフォルダ名を入力してください:", f.name);
    if (newName && newName.trim()) {
      f.name = newName.trim();
      save();
      render();
    }
  }
};

window.clearFolderWords = function(folderId) {
  const f = folders.find(x => x.id === folderId);
  if (f && f.words.length > 0) {
    if (confirm(`「${f.name}」内のすべての単語（${f.words.length}語）を全消ししますか？`)) {
      f.words = [];
      save();
      render();
    }
  }
};

window.moveFolder = function(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex >= 0 && targetIndex < folders.length) {
    const temp = folders[index];
    folders[index] = folders[targetIndex];
    folders[targetIndex] = temp;
    save();
    render();
  }
};

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

// --- 単語操作 ---
window.deleteWord = function(folderId, index) {
  const f = folders.find(x => x.id === folderId);
  if (f) {
    f.words.splice(index, 1);
    save();
    render();
  }
};

window.moveWordOrder = function(folderId, wordIndex, direction) {
  const f = folders.find(x => x.id === folderId);
  if (f) {
    const targetIndex = wordIndex + direction;
    if (targetIndex >= 0 && targetIndex < f.words.length) {
      const temp = f.words[wordIndex];
      f.words[wordIndex] = f.words[targetIndex];
      f.words[targetIndex] = temp;
      save();
      render();
    }
  }
};

window.transferWordToFolder = function(sourceFolderId, wordIndex, targetFolderId) {
  targetFolderId = Number(targetFolderId);
  if (!targetFolderId || sourceFolderId === targetFolderId) return;

  const sourceF = folders.find(x => x.id === sourceFolderId);
  const targetF = folders.find(x => x.id === targetFolderId);

  if (sourceF && targetF) {
    const [wordToMove] = sourceF.words.splice(wordIndex, 1);
    targetF.words.push(wordToMove);
    save();
    render();
  }
};

// --- 意味（編集・文字色変更） ---
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

// --- 例文操作 ---
window.updateExampleText = function(folderId, wordIndex, exIndex, key, text) {
  const f = folders.find(x => x.id === folderId);
  if (f && f.words[wordIndex] && f.words[wordIndex].examples[exIndex]) {
    f.words[wordIndex].examples[exIndex][key] = text;
    save();
  }
};

window.addExample = function(folderId, wordIndex) {
  const f = folders.find(x => x.id === folderId);
  if (f && f.words[wordIndex]) {
    f.words[wordIndex].examples.push({
      en: "Click here to edit English example.",
      jp: "ここをクリックして日本語訳を編集。"
    });
    save();
    render();
  }
};

window.deleteExample = function(folderId, wordIndex, exIndex) {
  const f = folders.find(x => x.id === folderId);
  if (f && f.words[wordIndex]) {
    f.words[wordIndex].examples.splice(exIndex, 1);
    save();
    render();
  }
};

window.moveExampleOrder = function(folderId, wordIndex, exIndex, direction) {
  const f = folders.find(x => x.id === folderId);
  if (f && f.words[wordIndex]) {
    const exs = f.words[wordIndex].examples;
    const targetIndex = exIndex + direction;
    if (targetIndex >= 0 && targetIndex < exs.length) {
      const temp = exs[exIndex];
      exs[exIndex] = exs[targetIndex];
      exs[targetIndex] = temp;
      save();
      render();
    }
  }
};

// 音声再生
window.playAudio = function(audioUrl, wordText) {
  setTimeout(() => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play().catch(() => speakFallback(wordText));
    } else {
      speakFallback(wordText);
    }
  }, 200);
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

// --- 単語追加処理 ---
window.addWord = async function(folderId, word){
  const cleanWord = word.trim();
  if(!cleanWord) return;

  let inflections = "";
  let prepNote = "";

  const lowerWord = cleanWord.toLowerCase();

  if (verbPrepositions[lowerWord]) prepNote = verbPrepositions[lowerWord];
  if (irregularVerbs[lowerWord]) inflections = irregularVerbs[lowerWord];

  // 意味・例文・音声を一括取得
  const details = await generateWordDetails(cleanWord);

  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.words.push({
      word: cleanWord,
      audio: details.audioUrl,
      meanings: details.meanings,
      inflections: inflections,
      prepNote: prepNote,
      examples: details.examples
    });
    save();
    render();
  }
};

// --- 画面描画 ---
function render(){
  if (!foldersEl) return;
  foldersEl.innerHTML = "";

  folders.forEach((folder, folderIndex) => {
    const div = document.createElement("div");
    div.className = "folder";
    div.style.cssText = "background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-bottom: 16px;";

    const isCollapsed = folder.isCollapsed || false;

    div.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 8px; cursor: pointer;" onclick="toggleFolder(${folder.id})">
          <span style="font-size: 1.1em; color: #64748b;">${isCollapsed ? '▶' : '▼'}</span>
          <h2 style="margin: 0; font-size: 1.2em; color: #0f172a;">📁 ${folder.name} <span style="font-size:0.8em; color:#64748b; font-weight:normal;">(${folder.words.length}語)</span></h2>
        </div>

        <div style="display: flex; align-items: center; gap: 4px;">
          <button onclick="moveFolder(${folderIndex}, -1)" ${folderIndex === 0 ? 'disabled' : ''} style="padding: 4px 8px; font-size: 0.8em; cursor: pointer;" title="上へ移動">▲</button>
          <button onclick="moveFolder(${folderIndex}, 1)" ${folderIndex === folders.length - 1 ? 'disabled' : ''} style="padding: 4px 8px; font-size: 0.8em; cursor: pointer;" title="下へ移動">▼</button>
          <button onclick="renameFolder(${folder.id})" style="background:#0284c7; color:white; border:none; padding: 4px 8px; border-radius: 4px; font-size:0.8em; cursor:pointer;">✏️ リネーム</button>
          <button onclick="clearFolderWords(${folder.id})" style="background:#f59e0b; color:white; border:none; padding: 4px 8px; border-radius: 4px; font-size:0.8em; cursor:pointer;" title="全単語削除">🧹 単語全消し</button>
          <button onclick="deleteFolder(${folder.id})" style="background-color: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size:0.8em; cursor: pointer;">🗑️ フォルダ削除</button>
        </div>
      </div>

      ${!isCollapsed ? `
        <div style="margin-top: 12px;">
          <input placeholder="単語を入力してEnter (品詞別の意味と例文を自動生成します)"
            onkeydown="if(event.key==='Enter'){ addWord(${folder.id}, this.value); this.value=''; }"
            style="width: 100%; padding: 8px; box-sizing: border-box; margin-bottom: 10px; border: 1px solid #cbd5e1; border-radius: 4px;"
          >

          ${folder.words.map((w, wordIndex) => `
            <div class="word" style="background: #ffffff; border: 1px solid #e2e8f0; border-left: 5px solid #2563eb; padding: 14px; margin-top: 10px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; flex-wrap: wrap; gap: 6px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <b style="font-size: 1.3em; color: #0f172a;">${w.word}</b>
                  <button onclick="playAudio('${w.audio}', '${w.word}')" style="background:#2563eb; color:white; border:none; border-radius:50%; width:28px; height:28px; cursor:pointer; font-size:0.8em;" title="発音を聞く">🔊</button>
                </div>

                <div style="display: flex; align-items: center; gap: 4px;">
                  <select onchange="transferWordToFolder(${folder.id}, ${wordIndex}, this.value)" style="font-size:0.8em; padding: 2px 4px; border-radius:4px; border: 1px solid #cbd5e1;">
                    <option value="">📂 他フォルダへ移動...</option>
                    ${folders.map(targetF => `
                      <option value="${targetF.id}" ${targetF.id === folder.id ? 'disabled' : ''}>${targetF.name}</option>
                    `).join('')}
                  </select>

                  <button onclick="moveWordOrder(${folder.id}, ${wordIndex}, -1)" ${wordIndex === 0 ? 'disabled' : ''} style="padding: 2px 6px; font-size: 0.75em; cursor: pointer;" title="単語を上へ">▲</button>
                  <button onclick="moveWordOrder(${folder.id}, ${wordIndex}, 1)" ${wordIndex === folder.words.length - 1 ? 'disabled' : ''} style="padding: 2px 6px; font-size: 0.75em; cursor: pointer;" title="単語を下へ">▼</button>
                  <button onclick="deleteWord(${folder.id}, ${wordIndex})" style="background-color: #f1f5f9; color: #64748b; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size:0.8em;">削除</button>
                </div>
              </div>

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
                  <button onmousedown="event.preventDefault(); applyColorToSelection('#0f172a');" style="background:#0f172a; border:none; width:18px; height:18px; border-radius:50%; cursor:pointer;" title="黒"></button>
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
                          title="選択して色変更可能"
                        >${textContent}</div>
                      </li>
                    `;
                  }).join("")}
                </ul>
              </div>

              <div style="margin-top: 10px; background: #f8fafc; padding: 10px; border-radius: 6px; font-size: 0.85em; border: 1px solid #e2e8f0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
                  <span style="font-weight: bold; color: #475569;">📖 実践例文</span>
                  <button onclick="addExample(${folder.id}, ${wordIndex})" style="background:#10b981; color:white; border:none; padding:2px 8px; border-radius:4px; font-size:0.8em; cursor:pointer;">➕ 例文追加</button>
                </div>

                ${w.examples && w.examples.length > 0 ? w.examples.map((ex, exIndex) => `
                  <div style="margin-bottom: 8px; background: #ffffff; padding: 6px 8px; border-radius: 4px; border: 1px solid #f1f5f9;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 6px;">
                      <div style="flex: 1;">
                        <p 
                          contenteditable="true" 
                          onblur="updateExampleText(${folder.id}, ${wordIndex}, ${exIndex}, 'en', this.innerText)"
                          style="margin: 0; color: #334155; font-weight: 500; outline: none;"
                        >• ${ex.en}</p>
                        <p 
                          contenteditable="true" 
                          onblur="updateExampleText(${folder.id}, ${wordIndex}, ${exIndex}, 'jp', this.innerText)"
                          style="margin: 0; color: #64748b; padding-left: 10px; outline: none;"
                        >${ex.jp}</p>
                      </div>

                      <div style="display: flex; align-items: center; gap: 2px;">
                        <button onclick="moveExampleOrder(${folder.id}, ${wordIndex}, ${exIndex}, -1)" ${exIndex === 0 ? 'disabled' : ''} style="padding: 1px 4px; font-size: 0.7em; cursor: pointer;">▲</button>
                        <button onclick="moveExampleOrder(${folder.id}, ${wordIndex}, ${exIndex}, 1)" ${exIndex === w.examples.length - 1 ? 'disabled' : ''} style="padding: 1px 4px; font-size: 0.7em; cursor: pointer;">▼</button>
                        <button onclick="deleteExample(${folder.id}, ${wordIndex}, ${exIndex})" style="background: transparent; color: #ef4444; border: none; font-size: 0.8em; cursor: pointer;" title="例文削除">🗑️</button>
                      </div>
                    </div>
                  </div>
                `).join("") : '<p style="margin:0; color:#94a3b8; font-style:italic;">例文はありません。</p>'}
              </div>

            </div>
          `).join("")}
        </div>
      ` : ''}
    `;

    foldersEl.appendChild(div);
  });
}

render();
