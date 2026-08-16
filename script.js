// --- ログイン画面の復旧 ＆ メニュー・プレイ機能の完全版 ---

// 1. ログインUI（アカウント選択画面）の描画
function setupLoginUI() {
  const modalMenu = document.getElementById("appMenuModal");
  if (modalMenu) modalMenu.style.display = "none";
  
  const flashModal = document.getElementById("flashcardModal");
  if (flashModal) flashModal.style.display = "none";

  const landingPage = document.getElementById("landingPage") || document.body;
  
  landingPage.innerHTML = `
    <div id="loginOverlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #0f172a; display: flex; justify-content: center; align-items: center; z-index: 20000;">
      <div style="background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; width: 90%; max-width: 380px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.4);">
        <h2 style="color: #38bdf8; margin-top: 0; margin-bottom: 8px;">単語帳</h2>
        <p style="color: #94a3b8; font-size: 0.9em; margin-bottom: 16px;">アカウントを選択してください</p>
        
        <div id="accountSelectionArea" style="display: flex; flex-direction: column; gap: 8px; max-height: 200px; overflow-y: auto; margin-bottom: 16px; text-align: left;">
          <!-- 登録済みアカウントのボタンがここに動的に表示されます -->
        </div>

        <div style="border-top: 1px solid #334155; padding-top: 14px;">
          <input type="email" id="customEmailInput" placeholder="メールアドレスを入力" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: white; box-sizing: border-box; margin-bottom: 8px;" onkeydown="if(event.key==='Enter'){ loginWithAccount(document.getElementById('customEmailInput').value); }">
          <button onclick="loginWithAccount(document.getElementById('customEmailInput').value)" style="width: 100%; background: #0284c7; color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-weight: bold;">新規 / 別のメールでログイン</button>
        </div>
      </div>
    </div>
  `;
  
  const mainPortal = document.getElementById("mainPortal");
  if (mainPortal) mainPortal.style.display = "none";

  renderAccountButtons();
}

// アカウントボタンを動的に生成する関数
function renderAccountButtons() {
  const area = document.getElementById("accountSelectionArea");
  if (!area) return;
  
  area.innerHTML = "";
  let accounts = [];

  try {
    // LocalStorageから既存のアカウント情報を探索
    for (let i = 0; i < localStorage.length; i++) {
      let key = localStorage.key(i);
      if (key && (key.includes("@") || key.startsWith("vocab_user_"))) {
        let email = key.replace("vocab_user_", "");
        if (!accounts.includes(email)) accounts.push(email);
      }
    }
    // 保存済みのアカウント一覧配列があればそれも結合
    let saved = localStorage.getItem("app_accounts");
    if (saved) {
      let parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        accounts = Array.from(new Set([...accounts, ...parsed]));
      }
    }
  } catch (e) {
    console.error(e);
  }

  if (accounts.length === 0) {
    area.innerHTML = `<p style="color: #64748b; font-size: 0.85em; text-align: center; margin: 5px 0;">保存されたアカウントはありません</p>`;
    return;
  }

  accounts.forEach(email => {
    let btn = document.createElement("button");
    btn.style.cssText = "width: 100%; padding: 10px; background: #334155; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; display: flex; justify-content: space-between; align-items: center;";
    btn.innerHTML = `<span>👤 ${email}</span> <span style="font-size: 0.8em; color: #38bdf8;">選択 ➔</span>`;
    btn.onclick = () => loginWithAccount(email);
    area.appendChild(btn);
  });
}


// 2. メニュー画面を開く
window.openMenuModal = function() {
  if (typeof currentUser === 'undefined' || !currentUser) {
    setupLoginUI();
    return;
  }

  let modal = document.getElementById("appMenuModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "appMenuModal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 10000;";
    document.body.appendChild(modal);
  }
  
  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 340px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); text-align: center;">
      <h3 style="margin-top: 0; color: #0f172a; margin-bottom: 16px;">メニュー</h3>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button onclick="${typeof currentView !== 'undefined' && currentView === 'chat' ? 'switchToVocabView()' : 'switchToChatView()'}" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">${typeof currentView !== 'undefined' && currentView === 'chat' ? '📚 単語帳に戻る' : '🤖 ALLIAを開く'}</button>
        <button onclick="openPlaySubMenu()" style="padding: 10px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">▶ プレイ</button>
        <button onclick="closeMenuModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer; margin-top: 4px;">閉じる</button>
      </div>
    </div>
  `;
  modal.style.display = "flex";
};


// 3. プレイのサブメニュー（フラッシュカード / クイズ）
window.openPlaySubMenu = function() {
  let modal = document.getElementById("appMenuModal");
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


// 4. フラッシュカードの表裏選択メニュー
window.openFlashcardDirectionMenu = function() {
  let modal = document.getElementById("appMenuModal");
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


// 5. フラッシュカード開始・終了処理
window.startFlashcards = function(mode, random = true, direction = 'front') {
  closeMenuModal();
  window.currentFlashcardMode = mode;
  window.isRandomMode = random;
  window.cardMode = direction;
  
  if (typeof loadFlashcardItems === 'function') {
    loadFlashcardItems(mode, random);
  }

  if (typeof flashcardList !== 'undefined' && flashcardList.length === 0) {
    alert("対象となる単語がありません。単語を追加してください。");
    return;
  }

  window.currentFlashcardIndex = 0;
  window.isCardFlipped = false;
  renderFlashcardModal();
};

window.renderFlashcardModal = function() {
  let modal = document.getElementById("flashcardModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "flashcardModal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 10001;";
    document.body.appendChild(modal);
  } else {
    modal.style.display = "flex";
  }

  // フラッシュカード終了時：「他のモードでプレイ」を表示
  if (typeof flashcardList !== 'undefined' && currentFlashcardIndex >= flashcardList.length) {
    modal.innerHTML = `
      <div style="background: white; padding: 30px; border-radius: 12px; width: 90%; max-width: 380px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.3);">
        <h3 style="color: #0f172a; margin-top: 0; margin-bottom: 10px;">🎉 完了！</h3>
        <p style="color: #475569; font-size: 0.95em; margin-bottom: 20px;">すべて終了しました。次は別のモードで練習しますか？</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <button onclick="closeFlashcardModal(); openMenuModal(); openPlaySubMenu();" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">➡️ 他のモードでプレイ</button>
          <button onclick="startFlashcards(window.currentFlashcardMode || 'all', window.isRandomMode ?? true, window.cardMode || 'front')" style="padding: 8px; background: #334155; color: white; border: none; border-radius: 6px; cursor: pointer;">🔄 フラッシュカードを再開</button>
          <button onclick="closeFlashcardModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer;">終了する</button>
        </div>
      </div>
    `;
    return;
  }

  const currentWord = flashcardList[currentFlashcardIndex];
  const meaningsText = Array.isArray(currentWord.meanings) ? currentWord.meanings.join("<br>") : (currentWord.meanings || '');
  const frontText = (cardMode === 'front') ? currentWord.word : meaningsText;
  const backText = (cardMode === 'front') ? meaningsText : currentWord.word;

  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 400px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); text-align: center; position: relative;">
      <div style="position: absolute; top: 12px; left: 16px; font-size: 0.85em; color: #64748b;">${currentFlashcardIndex + 1} / ${flashcardList.length}</div>
      <button onclick="closeFlashcardModal()" style="position: absolute; top: 10px; right: 12px; background: none; border: none; font-size: 1.2em; cursor: pointer; color: #64748b;">✕</button>
      
      <div onclick="toggleCardFlip()" style="margin: 30px 0 20px 0; padding: 25px 20px; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 10px; cursor: pointer; min-height: 110px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
        <div style="font-size: 1.5em; font-weight: bold; color: #0f172a; margin-bottom: 8px;">${isCardFlipped ? backText : frontText}</div>
        <div style="font-size: 0.8em; color: #94a3b8; margin-top: 8px;">${isCardFlipped ? '(裏面を表示中)' : '(クリックして裏返す)'}</div>
      </div>

      <div style="display: flex; gap: 10px; margin-bottom: 12px;">
        <button onclick="setMasteryAndNext('unfixed')" style="flex: 1; padding: 10px; background: #f43f5e; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.9em;">❌ 未定着</button>
        <button onclick="setMasteryAndNext('fixed')" style="flex: 1; padding: 10px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.9em;">⭕ 定着</button>
      </div>
    </div>
  `;
};

window.toggleCardFlip = function() {
  window.isCardFlipped = !window.isCardFlipped;
  renderFlashcardModal();
};

window.setMasteryAndNext = function(status) {
  if (typeof flashcardList !== 'undefined' && flashcardList[currentFlashcardIndex]) {
    flashcardList[currentFlashcardIndex].mastery = status;
  }
  window.currentFlashcardIndex++;
  window.isCardFlipped = false;
  renderFlashcardModal();
};

window.closeFlashcardModal = function() {
  const modal = document.getElementById("flashcardModal");
  if (modal) modal.style.display = "none";
};


// 6. クイズ画面（準備中）
window.startQuiz = function() {
  closeMenuModal();
  let modal = document.getElementById("flashcardModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "flashcardModal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 10001;";
    document.body.appendChild(modal);
  } else {
    modal.style.display = "flex";
  }

  modal.innerHTML = `
    <div style="background: white; padding: 30px; border-radius: 12px; width: 90%; max-width: 380px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.3);">
      <h3 style="color: #0f172a; margin-top: 0; margin-bottom: 10px;">📝 クイズモード</h3>
      <p style="color: #475569; font-size: 0.95em; margin-bottom: 20px;">クイズ機能は現在準備中です！お楽しみに。</p>
      <button onclick="closeFlashcardModal()" style="padding: 10px 20px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">閉じる</button>
    </div>
  `;
};
